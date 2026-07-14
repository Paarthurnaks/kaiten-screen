/** Записанное видео выделенной области экрана, готовое к прикреплению к задаче Kaiten. */
export interface CapturedVideo {
  readonly buffer: Buffer;
  readonly mimeType: "video/webm";
}
