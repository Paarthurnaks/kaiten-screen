import { ANNOTATION_COLORS } from "../shared/annotation-shapes";

interface AnnotationToolbarProps {
  activeTool: "arrow" | "rect" | null;
  onToolChange: (tool: "arrow" | "rect" | null) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  canUndo: boolean;
  canClear: boolean;
  onUndo: () => void;
  onClear: () => void;
}

/** Тулбар аннотирования скриншота над превью в PostCaptureChoice — показывается
 * только для pending.kind === "image" (см. PostCaptureChoice.tsx). Релиз 1:
 * только стрелка/прямоугольник, фиксированная палитра из 5 цветов, без выбора
 * толщины линии и без redo (см. план — вне рамок). */
export function AnnotationToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  canUndo,
  canClear,
  onUndo,
  onClear,
}: AnnotationToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 8,
        borderRadius: 10,
        border: "1px solid var(--ks-border)",
        background: "var(--ks-bg-subtle)",
        marginBottom: 8,
      }}
    >
      <ToolButton
        title="Стрелка"
        active={activeTool === "arrow"}
        onClick={() => onToolChange(activeTool === "arrow" ? null : "arrow")}
      >
        ↗
      </ToolButton>
      <ToolButton
        title="Прямоугольник"
        active={activeTool === "rect"}
        onClick={() => onToolChange(activeTool === "rect" ? null : "rect")}
      >
        ▭
      </ToolButton>

      <div style={{ width: 1, height: 20, background: "var(--ks-border-strong)" }} />

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

      <div style={{ width: 1, height: 20, background: "var(--ks-border-strong)" }} />

      <button
        type="button"
        title="Отменить последнюю фигуру"
        disabled={!canUndo}
        onClick={onUndo}
        style={toolbarTextButtonStyle(canUndo)}
      >
        ↺ Отменить
      </button>
      <button
        type="button"
        title="Очистить все аннотации"
        disabled={!canClear}
        onClick={onClear}
        style={toolbarTextButtonStyle(canClear)}
      >
        ✕ Очистить всё
      </button>
    </div>
  );
}

function toolbarTextButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: "var(--ks-text-secondary)",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
    padding: "4px 6px",
  };
}

function ToolButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "var(--ks-accent)" : "var(--ks-bg-chip)",
        color: active ? "var(--ks-accent-contrast)" : "var(--ks-text-secondary)",
        cursor: "pointer",
        fontSize: 15,
      }}
    >
      {children}
    </button>
  );
}
