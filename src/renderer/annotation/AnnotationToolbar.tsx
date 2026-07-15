import { ANNOTATION_COLORS } from "../shared/annotation-shapes";

interface AnnotationToolbarProps {
  activeTool: "arrow" | "rect" | null;
  onToolChange: (tool: "arrow" | "rect" | null) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  canUndo: boolean;
  onUndo: () => void;
}

/** Левая группа тулбара экрана аннотирования (см. Annotation.tsx) — инструменты,
 * палитра, отмена. Кнопки "Отмена"/"Готово" (навигация, не инструменты рисования)
 * рендерятся отдельно, на уровне Annotation.tsx, справа в том же header-ряду —
 * см. дизайн-макет (design/Screenshotter for Kaiten.dc.html, экран "02").
 *
 * Релиз: только Курсор/Стрелка/Прямоугольник — Эллипс/Текст/Маркер/Redo из
 * макета вне рамок этого захода (см. план). Кнопки "Очистить всё" в макете нет
 * вообще — не добавляем. */
export function AnnotationToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  canUndo,
  onUndo,
}: AnnotationToolbarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <ToolButton title="Курсор" active={activeTool === null} onClick={() => onToolChange(null)}>
        ↖
      </ToolButton>
      <ToolButton title="Стрелка" active={activeTool === "arrow"} onClick={() => onToolChange("arrow")}>
        ↗
      </ToolButton>
      <ToolButton title="Прямоугольник" active={activeTool === "rect"} onClick={() => onToolChange("rect")}>
        ▢
      </ToolButton>

      <div style={{ width: 1, height: 22, background: "var(--ks-border-strong)", margin: "0 4px" }} />

      {ANNOTATION_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          onClick={() => onColorChange(color)}
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: color,
            border: color === activeColor ? "2px solid var(--ks-text)" : "2px solid transparent",
            cursor: "pointer",
            padding: 0,
          }}
        />
      ))}

      <div style={{ width: 1, height: 22, background: "var(--ks-border-strong)", margin: "0 4px" }} />

      <ToolButton title="Отменить" active={false} disabled={!canUndo} onClick={onUndo}>
        ↺
      </ToolButton>
    </div>
  );
}

function ToolButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "var(--ks-accent)" : "var(--ks-bg-chip)",
        color: active ? "var(--ks-accent-contrast)" : "var(--ks-text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: 16,
      }}
    >
      {children}
    </button>
  );
}
