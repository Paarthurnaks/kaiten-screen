/**
 * Модель данных для аннотирования скриншота на экране выбора действия
 * (PostCaptureChoice) — рисование поверх превью перед отправкой в Kaiten.
 * Чистые типы/функции, без React/DOM/canvas — тестируется независимо от UI.
 *
 * Union намеренно спроектирован так, чтобы в следующих релизах добавить
 * "text"/"highlight" без переписывания структуры (см. ROADMAP.local.md,
 * "Аннотирование скриншота" — Релиз 2). Blur/пикселизация (Релиз 3), скорее
 * всего, потребует отдельного пути (работа с пикселями растра, а не векторная
 * фигура), поэтому специально не форсируется в этот union уже сейчас.
 */

export interface Point {
  x: number;
  y: number;
}

export type AnnotationShape =
  | { id: string; type: "arrow"; from: Point; to: Point; color: string }
  | { id: string; type: "rect"; from: Point; to: Point; color: string };

/** Фиксированная палитра — не через CSS-переменные --ks-*, те подобраны под
 * хром приложения, а не под контент поверх произвольного скриншота. Точные
 * значения и порядок взяты из дизайн-макета (design/Screenshotter for Kaiten.dc.html,
 * экран "02 — Аннотирование") для визуального соответствия. */
export const ANNOTATION_COLORS = [
  "oklch(0.62 0.19 25)",
  "oklch(0.6 0.15 165)",
  "oklch(0.65 0.16 95)",
  "oklch(0.6 0.14 250)",
  "oklch(0.94 0.005 250)",
] as const;

/** Толщина линии фиксирована в этом релизе, без UI выбора (см. план — вне рамок). */
export const ANNOTATION_LINE_WIDTH = 3;

export interface AnnotationsState {
  shapes: AnnotationShape[];
  /** Стек предыдущих версий shapes — каждый элемент это snapshot ПЕРЕД
   * очередным изменением ("add"/"clear"), "undo" снимает последний snapshot
   * и делает его текущим shapes. Redo сознательно не реализован. */
  history: AnnotationShape[][];
}

export const EMPTY_ANNOTATIONS_STATE: AnnotationsState = { shapes: [], history: [] };

export type AnnotationsAction =
  | { type: "add"; shape: AnnotationShape }
  | { type: "undo" }
  | { type: "clear" };

export function annotationsReducer(state: AnnotationsState, action: AnnotationsAction): AnnotationsState {
  switch (action.type) {
    case "add":
      return {
        shapes: [...state.shapes, action.shape],
        history: [...state.history, state.shapes],
      };
    case "undo": {
      if (state.history.length === 0) {
        return state;
      }
      const previousShapes = state.history[state.history.length - 1];
      return {
        shapes: previousShapes,
        history: state.history.slice(0, -1),
      };
    }
    case "clear": {
      if (state.shapes.length === 0) {
        return state;
      }
      return {
        shapes: [],
        history: [...state.history, state.shapes],
      };
    }
    default:
      return state;
  }
}
