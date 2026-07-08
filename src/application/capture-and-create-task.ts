import { TaskDraft, type TaskDraftInput } from "../domain/entities/task-draft";
import type { CapturedImage } from "../domain/entities/captured-image";
import type { CaptureRegion } from "../domain/value-objects/capture-region";
import type { ScreenCaptureProvider } from "../domain/ports/screen-capture-provider";
import type { KaitenClient, KaitenCreatedTask } from "../domain/ports/kaiten-client";
import type { Logger } from "../domain/ports/logger";

export interface SubmitTaskResult {
  task: KaitenCreatedTask;
  /** true, если задача создана, но вложение прикрепить не удалось (частичный успех). */
  attachmentFailed: boolean;
}

/**
 * Оркестрирует ключевой сценарий: захват области экрана -> создание задачи в Kaiten
 * с прикреплённым скриншотом. Ничего не знает о конкретных реализациях портов.
 */
export class CaptureAndCreateTask {
  constructor(
    private readonly capture: ScreenCaptureProvider,
    private readonly kaiten: KaitenClient,
    private readonly logger: Logger,
  ) {}

  async captureStep(): Promise<{ region: CaptureRegion; image: CapturedImage } | null> {
    this.logger.debug("CaptureAndCreateTask.captureStep", "starting capture");
    const result = await this.capture.captureRegion();
    if (!result) {
      this.logger.debug("CaptureAndCreateTask.captureStep", "capture cancelled by user");
      return null;
    }
    this.logger.info("CaptureAndCreateTask.captureStep", "capture succeeded", {
      width: result.region.width,
      height: result.region.height,
    });
    return result;
  }

  async submitStep(draftInput: TaskDraftInput, image: CapturedImage): Promise<SubmitTaskResult> {
    // TaskDraft.create бросает DomainValidationError при некорректных данных —
    // пусть исключение всплывает к вызывающему коду (UI показывает ошибку валидации).
    const draft = TaskDraft.create(draftInput);

    this.logger.debug("CaptureAndCreateTask.submitStep", "creating task in kaiten", {
      boardId: draft.boardId,
      laneId: draft.laneId,
    });
    const task = await this.kaiten.createTask(draft);
    this.logger.info("CaptureAndCreateTask.submitStep", "task created", { taskId: task.id });

    try {
      await this.kaiten.attachFile(task.id, image);
      this.logger.info("CaptureAndCreateTask.submitStep", "attachment uploaded", { taskId: task.id });
      return { task, attachmentFailed: false };
    } catch (err) {
      this.logger.warn("CaptureAndCreateTask.submitStep", "task created but attachment failed", {
        taskId: task.id,
        error: String(err),
      });
      return { task, attachmentFailed: true };
    }
  }
}
