import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureRegion } from "../../domain/value-objects/capture-region";
import type { CapturedImage } from "../../domain/entities/captured-image";
import type { CaptureAndCreateTask } from "../../application/capture-and-create-task";
import type { LoadSettings } from "../../application/load-settings";
import type { SaveSettings } from "../../application/save-settings";
import type { ListKaitenOptions } from "../../application/list-kaiten-options";
import type { PendingCapture } from "../index";

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, HandlerFn>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, listener: HandlerFn) => {
      handlers.set(channel, listener);
    },
  },
  nativeImage: {
    createFromBuffer: () => ({ toDataURL: () => "data:image/png;base64,fake" }),
  },
}));

function createNoopLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const sampleImage: CapturedImage = { buffer: Buffer.from("fake-png"), mimeType: "image/png" };

describe("registerIpcHandlers — submitTask устойчивость к сетевым ошибкам", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it("не очищает pendingCapture, если submitStep бросает сетевую ошибку", async () => {
    const { registerIpcHandlers } = await import("../ipc-handlers");
    const { IPC_CHANNELS } = await import("../../shared/ipc-contract");

    const region = CaptureRegion.create(0, 0, 10, 10);
    let pending: PendingCapture | null = { kind: "image", region, image: sampleImage };

    const captureAndCreateTask = {
      submitStep: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as CaptureAndCreateTask;

    registerIpcHandlers({
      captureAndCreateTask,
      loadSettings: {} as unknown as LoadSettings,
      saveSettings: {} as unknown as SaveSettings,
      listKaitenOptions: {} as unknown as ListKaitenOptions,
      getPendingCapture: () => pending,
      clearPendingCapture: () => {
        pending = null;
      },
      reregisterHotkeys: vi.fn(),
      applyAutostart: vi.fn(),
      exportProjectConfig: vi.fn(),
      importProjectConfig: vi.fn(),
      saveRecordingToFile: vi.fn(),
      logger: createNoopLogger(),
    });

    const submitHandler = handlers.get(IPC_CHANNELS.submitTask);
    expect(submitHandler).toBeDefined();

    await expect(
      submitHandler!({}, { title: "Bug", boardId: "b1", laneId: "l1" }),
    ).rejects.toThrow("network down");
    expect(pending).not.toBeNull();
  });

  it("бросает понятную ошибку и не вызывает submitStep, если нет pendingCapture", async () => {
    const { registerIpcHandlers } = await import("../ipc-handlers");
    const { IPC_CHANNELS } = await import("../../shared/ipc-contract");

    const submitStep = vi.fn();
    registerIpcHandlers({
      captureAndCreateTask: { submitStep } as unknown as CaptureAndCreateTask,
      loadSettings: {} as unknown as LoadSettings,
      saveSettings: {} as unknown as SaveSettings,
      listKaitenOptions: {} as unknown as ListKaitenOptions,
      getPendingCapture: () => null,
      clearPendingCapture: vi.fn(),
      reregisterHotkeys: vi.fn(),
      applyAutostart: vi.fn(),
      exportProjectConfig: vi.fn(),
      importProjectConfig: vi.fn(),
      saveRecordingToFile: vi.fn(),
      logger: createNoopLogger(),
    });

    const submitHandler = handlers.get(IPC_CHANNELS.submitTask);
    await expect(
      submitHandler!({}, { title: "Bug", boardId: "b1", laneId: "l1" }),
    ).rejects.toThrow(/No pending capture/);
    expect(submitStep).not.toHaveBeenCalled();
  });

  it("очищает pendingCapture при успешной отправке (в т.ч. при частичном успехе)", async () => {
    const { registerIpcHandlers } = await import("../ipc-handlers");
    const { IPC_CHANNELS } = await import("../../shared/ipc-contract");

    const region = CaptureRegion.create(0, 0, 10, 10);
    let pending: PendingCapture | null = { kind: "image", region, image: sampleImage };

    const captureAndCreateTask = {
      submitStep: vi.fn().mockResolvedValue({
        task: { id: "1", url: "https://kaiten.example/1" },
        attachmentFailed: true,
        membersFailed: false,
      }),
    } as unknown as CaptureAndCreateTask;

    registerIpcHandlers({
      captureAndCreateTask,
      loadSettings: {} as unknown as LoadSettings,
      saveSettings: {} as unknown as SaveSettings,
      listKaitenOptions: {} as unknown as ListKaitenOptions,
      getPendingCapture: () => pending,
      clearPendingCapture: () => {
        pending = null;
      },
      reregisterHotkeys: vi.fn(),
      applyAutostart: vi.fn(),
      exportProjectConfig: vi.fn(),
      importProjectConfig: vi.fn(),
      saveRecordingToFile: vi.fn(),
      logger: createNoopLogger(),
    });

    const submitHandler = handlers.get(IPC_CHANNELS.submitTask);
    const result = await submitHandler!({}, { title: "Bug", boardId: "b1", laneId: "l1" });

    expect(result).toEqual({
      taskId: "1",
      taskUrl: "https://kaiten.example/1",
      attachmentFailed: true,
      membersFailed: false,
    });
    expect(pending).toBeNull();
  });
});
