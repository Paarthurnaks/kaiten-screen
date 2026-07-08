/** Захваченное изображение области экрана, готовое к прикреплению к задаче Kaiten. */
export interface CapturedImage {
  readonly buffer: Buffer;
  readonly mimeType: "image/png";
}
