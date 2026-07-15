import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ANNOTATION_LINE_WIDTH, type AnnotationShape, type Point } from "./annotation-shapes";

const LOG_PREFIX = "AnnotationCanvas";
const MIN_SHAPE_SIZE = 4;
const ARROWHEAD_LENGTH = 14;
const ARROWHEAD_ANGLE = Math.PI / 6; // 30°

export interface AnnotationCanvasHandle {
  /** Флаттенит текущее изображение + все нарисованные фигуры в PNG data URL —
   * вызывается перед отправкой отредактированного скриншота обратно в main
   * (см. PostCaptureChoice.tsx). */
  toDataURL: () => string;
}

interface AnnotationCanvasProps {
  imageDataUrl: string;
  shapes: AnnotationShape[];
  activeTool: "arrow" | "rect" | null;
  activeColor: string;
  onShapeCommitted: (shape: AnnotationShape) => void;
}

/** Рисует одну фигуру в уже выставленных координатах канваса (натуральные
 * пиксели картинки). Вынесена отдельно от компонента — чистая функция над
 * 2D-контекстом, проще проверить/переиспользовать при добавлении новых типов
 * фигур в будущих релизах. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: AnnotationShape): void {
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = ANNOTATION_LINE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (shape.type === "rect") {
    const x = Math.min(shape.from.x, shape.to.x);
    const y = Math.min(shape.from.y, shape.to.y);
    const width = Math.abs(shape.to.x - shape.from.x);
    const height = Math.abs(shape.to.y - shape.from.y);
    ctx.strokeRect(x, y, width, height);
    return;
  }

  if (shape.type === "arrow") {
    const { from, to } = shape;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - ARROWHEAD_LENGTH * Math.cos(angle - ARROWHEAD_ANGLE),
      to.y - ARROWHEAD_LENGTH * Math.sin(angle - ARROWHEAD_ANGLE),
    );
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - ARROWHEAD_LENGTH * Math.cos(angle + ARROWHEAD_ANGLE),
      to.y - ARROWHEAD_LENGTH * Math.sin(angle + ARROWHEAD_ANGLE),
    );
    ctx.stroke();
    return;
  }

  console.warn(LOG_PREFIX, "unknown shape type — nothing drawn", { shape });
}

function isTooSmall(from: Point, to: Point): boolean {
  return Math.abs(to.x - from.x) < MIN_SHAPE_SIZE && Math.abs(to.y - from.y) < MIN_SHAPE_SIZE;
}

function makeShape(
  type: "arrow" | "rect",
  from: Point,
  to: Point,
  color: string,
  id: string,
): AnnotationShape {
  return { id, type, from, to, color };
}

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(
  function AnnotationCanvas({ imageDataUrl, shapes, activeTool, activeColor, onShapeCommitted }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [draft, setDraft] = useState<AnnotationShape | null>(null);
    const dragStart = useRef<Point | null>(null);

    useImperativeHandle(ref, () => ({
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
    }));

    // Загрузка картинки в натуральном разрешении при смене imageDataUrl — размер
    // канваса выставляется по image.naturalWidth/Height (не CSS-размер), чтобы
    // toDataURL() на выходе не терял качество относительно исходного скриншота.
    useEffect(() => {
      const img = new Image();
      img.onload = () => {
        console.debug(LOG_PREFIX, "image loaded", { width: img.naturalWidth, height: img.naturalHeight });
        setImage(img);
      };
      img.src = imageDataUrl;
    }, [imageDataUrl]);

    // Размер канваса выставляется ОТДЕЛЬНО от перерисовки и только при смене
    // картинки — переприсвоение canvas.width/height пересоздаёт backing store и
    // это не нужно делать на каждое изменение draft (то есть на каждый mousemove
    // во время рисования), это чисто лишняя работа при перерисовке одних и тех же
    // фигур поверх той же картинки.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !image) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
    }, [image]);

    // Полная перерисовка на каждое изменение картинки/фигур/черновой фигуры —
    // при типичном количестве фигур на одном скриншоте (единицы-десятки) это не
    // является проблемой производительности, инкрементальный рендеринг не нужен.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !image) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      for (const shape of shapes) {
        drawShape(ctx, shape);
      }
      if (draft) {
        drawShape(ctx, draft);
      }
    }, [image, shapes, draft]);

    function getCanvasPoint(clientX: number, clientY: number): Point {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void {
      if (!activeTool) return;
      const point = getCanvasPoint(event.clientX, event.clientY);
      dragStart.current = point;
      setDraft(makeShape(activeTool, point, point, activeColor, "draft"));
      console.debug(LOG_PREFIX, "started drawing", { tool: activeTool, color: activeColor });
    }

    // mousemove/mouseup слушаются на window, а не на самом canvas — иначе жест
    // рисования обрывался, если курсор во время drag покидал границы canvas
    // (например, уезжал на кнопку "Создать новую задачу" под превью): нативный
    // mouseup долетает до элемента под курсором, а не до canvas, из-за чего
    // фигура либо молча терялась (не successfully коммитилась в shapes), либо —
    // если до этого уже была подтверждена другая фигура — "призрачная"
    // недокоммиченная фигура всё равно попадала в экспортируемый PNG (пиксели
    // canvas не завязаны на React-state), но была невидима для Undo/Очистить
    // всё. По тому же паттерну, что и полноэкранный контейнер в
    // CaptureOverlay.tsx, drag теперь отслеживается, пока курсор в пределах
    // всего окна, а не только самого canvas.
    useEffect(() => {
      function handleWindowMouseMove(event: MouseEvent): void {
        if (!activeTool || !dragStart.current) return;
        const point = getCanvasPoint(event.clientX, event.clientY);
        setDraft(makeShape(activeTool, dragStart.current, point, activeColor, "draft"));
      }

      function handleWindowMouseUp(event: MouseEvent): void {
        if (!activeTool || !dragStart.current) return;
        const from = dragStart.current;
        const to = getCanvasPoint(event.clientX, event.clientY);
        dragStart.current = null;
        setDraft(null);
        if (isTooSmall(from, to)) {
          console.debug(LOG_PREFIX, "shape too small — discarded", { tool: activeTool });
          return;
        }
        const shape = makeShape(activeTool, from, to, activeColor, crypto.randomUUID());
        console.debug(LOG_PREFIX, "shape committed", { tool: activeTool, color: activeColor });
        onShapeCommitted(shape);
      }

      window.addEventListener("mousemove", handleWindowMouseMove);
      window.addEventListener("mouseup", handleWindowMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleWindowMouseMove);
        window.removeEventListener("mouseup", handleWindowMouseUp);
      };
    }, [activeTool, activeColor, onShapeCommitted]);

    return (
      <canvas
        ref={canvasRef}
        // Единственный потребитель этого компонента — просторный отдельный экран
        // аннотирования (Annotation.tsx), где скриншот уместнее показывать в
        // естественном разрешении по центру, уменьшая только если он крупнее
        // доступного места, а не растягивать через силу на всю ширину контейнера
        // (как было нужно в тесной карточке 420px в прошлой версии).
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "auto",
          display: "block",
          cursor: activeTool ? "crosshair" : "default",
        }}
        onMouseDown={handleMouseDown}
      />
    );
  },
);
