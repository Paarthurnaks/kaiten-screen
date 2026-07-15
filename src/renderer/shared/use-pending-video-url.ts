import { useEffect, useState } from "react";
import type { PendingCaptureDto } from "../../shared/ipc-contract";

/**
 * Строит blob: URL для видео-вложения из PendingCaptureDto (kind:"video") — Blob +
 * URL.createObjectURL() надёжнее и не тратит +33% размера на base64, в отличие от
 * data: URI, для крупного MediaRecorder-записанного видео. Отзывает URL при
 * размонтировании/смене pending, чтобы не течь память.
 */
export function usePendingVideoUrl(pending: PendingCaptureDto | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || pending.kind !== "video") {
      setUrl(null);
      return;
    }
    const blob = new Blob([pending.videoBuffer], { type: pending.videoMimeType });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pending]);

  return url;
}
