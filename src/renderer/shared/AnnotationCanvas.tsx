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

    // Полная перерисовка на каждое изменение картинки/фигур/черновой фигуры —
    // при типичном количестве фигур на одном скриншоте (единицы-десятки) это не
    // является проблемой производительности, инкрементальный рендеринг не нужен.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !image) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      for (const shape of shapes) {
        drawShape(ctx, shape);
      }
      if (draft) {
        drawShape(ctx, draft);
      }
    }, [image, shapes, draft]);

    function getCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>): Point {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
    }

    function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void {
      if (!activeTool) return;
      const point = getCanvasPoint(event);
      dragStart.current = point;
      setDraft(makeShape(activeTool, point, point, activeColor, "draft"));
      console.debug(LOG_PREFIX, "started drawing", { tool: activeTool, color: activeColor });
    }

    function handleMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void {
      if (!activeTool || !dragStart.current) return;
      const point = getCanvasPoint(event);
      setDraft(makeShape(activeTool, dragStart.current, point, activeColor, "draft"));
    }

    function handleMouseUp(event: React.MouseEvent<HTMLCanvasElement>): void {
      if (!activeTool || !dragStart.current) return;
      const from = dragStart.current;
      const to = getCanvasPoint(event);
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

    return (
      <canvas
        ref={canvasRef}
        style={{ width: "100%", display: "block", cursor: activeTool ? "crosshair" : "default" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    );
  },
);
