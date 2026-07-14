import type { CapturedImage } from "./captured-image";
import type { CapturedVideo } from "./captured-video";

/** Вложение, готовое к прикреплению к задаче Kaiten — скриншот или запись экрана. */
export type Attachment = CapturedImage | CapturedVideo;
