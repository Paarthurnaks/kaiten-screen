import { app, dialog, type BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CapturedVideo } from "../domain/entities/captured-video";
import type { Logger } from "../domain/ports/logger";

const FILE_FILTERS = [{ name: "WebM video", extensions: ["webm"] }];

function defaultSavePath(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(app.getPath("videos"), `kaiten-screen-recording-${timestamp}.webm`);
}

/** Открывает диалог "Сохранить как…" и пишет туда байты записанного видео —
 * альтернатива буферу обмена для видео (ОС не поддерживает copy/paste видео
 * стандартным способом, в отличие от скриншотов — см. IPC_CHANNELS.copyToClipboard).
 * Возвращает путь к файлу, либо null, если пользователь отменил диалог. */
export async function saveRecordingToFile(
  window: BrowserWindow | undefined,
  video: CapturedVideo,
  logger: Logger,
): Promise<string | null> {
  const options = { title: "Сохранить запись", defaultPath: defaultSavePath(), filters: FILE_FILTERS };
  const result = await (window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options));

  if (result.canceled || !result.filePath) {
    return null;
  }

  writeFileSync(result.filePath, video.buffer);
  logger.info("RecordingFileTransfer.save", "saved recording to file", {
    path: result.filePath,
    byteLength: video.buffer.byteLength,
  });
  return result.filePath;
}
