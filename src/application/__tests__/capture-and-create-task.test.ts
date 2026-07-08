import { describe, expect, it, vi } from "vitest";
import { CaptureAndCreateTask } from "../capture-and-create-task";
import { CaptureRegion } from "../../domain/value-objects/capture-region";
import type { CapturedImage } from "../../domain/entities/captured-image";
import type { ScreenCaptureProvider } from "../../domain/ports/screen-capture-provider";
import type { KaitenClient } from "../../domain/ports/kaiten-client";
import type { Logger } from "../../domain/ports/logger";
import { DomainValidationError } from "../../domain/errors";

function createNoopLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const sampleImage: CapturedImage = { buffer: Buffer.from("fake-png"), mimeType: "image/png" };

describe("CaptureAndCreateTask", () => {
  it("captureStep возвращает null, если пользователь отменил захват", async () => {
    const capture: ScreenCaptureProvider = { captureRegion: vi.fn().mockResolvedValue(null) };
    const kaiten = {} as KaitenClient;
    const useCase = new CaptureAndCreateTask(capture, kaiten, createNoopLogger());

    const result = await useCase.captureStep();

    expect(result).toBeNull();
  });

  it("captureStep возвращает регион и изображение при успешном захвате", async () => {
    const region = CaptureRegion.create(0, 0, 100, 100);
    const capture: ScreenCaptureProvider = {
      captureRegion: vi.fn().mockResolvedValue({ region, image: sampleImage }),
    };
    const kaiten = {} as KaitenClient;
    const useCase = new CaptureAndCreateTask(capture, kaiten, createNoopLogger());

    const result = await useCase.captureStep();

    expect(result).toEqual({ region, image: sampleImage });
  });

  it("submitStep бросает DomainValidationError при пустом заголовке и не вызывает kaiten.createTask", async () => {
    const capture = {} as ScreenCaptureProvider;
    const createTask = vi.fn();
    const kaiten: KaitenClient = {
      createTask,
      attachFile: vi.fn(),
      listSpaces: vi.fn(),
      listBoards: vi.fn(),
      listLanes: vi.fn(),
    };
    const useCase = new CaptureAndCreateTask(capture, kaiten, createNoopLogger());

    await expect(
      useCase.submitStep({ title: "   ", boardId: "b1", laneId: "l1" }, sampleImage),
    ).rejects.toBeInstanceOf(DomainValidationError);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("submitStep пробрасывает сетевую ошибку createTask", async () => {
    const capture = {} as ScreenCaptureProvider;
    const kaiten: KaitenClient = {
      createTask: vi.fn().mockRejectedValue(new Error("network down")),
      attachFile: vi.fn(),
      listSpaces: vi.fn(),
      listBoards: vi.fn(),
      listLanes: vi.fn(),
    };
    const useCase = new CaptureAndCreateTask(capture, kaiten, createNoopLogger());

    await expect(
      useCase.submitStep({ title: "Bug", boardId: "b1", laneId: "l1" }, sampleImage),
    ).rejects.toThrow("network down");
    expect(kaiten.attachFile).not.toHaveBeenCalled();
  });

  it("submitStep помечает attachmentFailed=true, если задача создана, а вложение — нет", async () => {
    const capture = {} as ScreenCaptureProvider;
    const kaiten: KaitenClient = {
      createTask: vi.fn().mockResolvedValue({ id: "task-1", url: "https://kaiten.example/task-1" }),
      attachFile: vi.fn().mockRejectedValue(new Error("upload failed")),
      listSpaces: vi.fn(),
      listBoards: vi.fn(),
      listLanes: vi.fn(),
    };
    const useCase = new CaptureAndCreateTask(capture, kaiten, createNoopLogger());

    const result = await useCase.submitStep({ title: "Bug", boardId: "b1", laneId: "l1" }, sampleImage);

    expect(result.attachmentFailed).toBe(true);
    expect(result.task.id).toBe("task-1");
  });

  it("submitStep возвращает attachmentFailed=false при полном успехе", async () => {
    const capture = {} as ScreenCaptureProvider;
    const kaiten: KaitenClient = {
      createTask: vi.fn().mockResolvedValue({ id: "task-1", url: "https://kaiten.example/task-1" }),
      attachFile: vi.fn().mockResolvedValue(undefined),
      listSpaces: vi.fn(),
      listBoards: vi.fn(),
      listLanes: vi.fn(),
    };
    const useCase = new CaptureAndCreateTask(capture, kaiten, createNoopLogger());

    const result = await useCase.submitStep({ title: "Bug", boardId: "b1", laneId: "l1" }, sampleImage);

    expect(result).toEqual({ task: { id: "task-1", url: "https://kaiten.example/task-1" }, attachmentFailed: false });
  });
});
