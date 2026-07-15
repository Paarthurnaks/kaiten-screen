import { describe, expect, it } from "vitest";
import {
  ANNOTATION_COLORS,
  annotationsReducer,
  EMPTY_ANNOTATIONS_STATE,
  type AnnotationShape,
} from "../annotation-shapes";

function rect(id: string): AnnotationShape {
  return { id, type: "rect", from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, color: ANNOTATION_COLORS[0] };
}

describe("annotationsReducer", () => {
  it("add добавляет фигуру и сохраняет предыдущую версию в history", () => {
    const state = annotationsReducer(EMPTY_ANNOTATIONS_STATE, { type: "add", shape: rect("1") });

    expect(state.shapes).toEqual([rect("1")]);
    expect(state.history).toEqual([[]]);
  });

  it("несколько add подряд копят историю по одной записи на каждый вызов", () => {
    let state = annotationsReducer(EMPTY_ANNOTATIONS_STATE, { type: "add", shape: rect("1") });
    state = annotationsReducer(state, { type: "add", shape: rect("2") });

    expect(state.shapes).toEqual([rect("1"), rect("2")]);
    expect(state.history).toEqual([[], [rect("1")]]);
  });

  it("undo откатывает shapes к состоянию до последнего add", () => {
    let state = annotationsReducer(EMPTY_ANNOTATIONS_STATE, { type: "add", shape: rect("1") });
    state = annotationsReducer(state, { type: "add", shape: rect("2") });

    state = annotationsReducer(state, { type: "undo" });

    expect(state.shapes).toEqual([rect("1")]);
    expect(state.history).toEqual([[]]);
  });

  it("undo на пустой history — no-op, не бросает исключение", () => {
    const state = annotationsReducer(EMPTY_ANNOTATIONS_STATE, { type: "undo" });

    expect(state).toBe(EMPTY_ANNOTATIONS_STATE);
  });

  it("clear опустошает shapes; undo после clear восстанавливает то, что было", () => {
    let state = annotationsReducer(EMPTY_ANNOTATIONS_STATE, { type: "add", shape: rect("1") });
    state = annotationsReducer(state, { type: "add", shape: rect("2") });

    const cleared = annotationsReducer(state, { type: "clear" });
    expect(cleared.shapes).toEqual([]);

    const restored = annotationsReducer(cleared, { type: "undo" });
    expect(restored.shapes).toEqual([rect("1"), rect("2")]);
  });

  it("clear на уже пустом shapes — no-op, не плодит лишнюю запись в history", () => {
    const state = annotationsReducer(EMPTY_ANNOTATIONS_STATE, { type: "clear" });

    expect(state).toBe(EMPTY_ANNOTATIONS_STATE);
  });
});
