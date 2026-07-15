/**
 * MediaRecorder-записанный webm не содержит Duration/Cues в заголовке (длительность
 * заранее неизвестна на момент старта записи) — Chromium в этом случае отдаёт
 * video.duration === Infinity, из-за чего <video> не может нормально отрисовать
 * кадр/перемотку (полоса прогресса "уезжает" назад, кадр не показывается).
 * Стандартный обход: зафорсить перемотку на заведомо большое время, дождаться
 * timeupdate (это вынуждает браузер досчитать реальную длительность линейным
 * проходом по файлу), затем вернуть currentTime к 0.
 */
export function fixWebmDuration(video: HTMLVideoElement): void {
  if (video.duration !== Infinity) return;
  const onTimeUpdate = (): void => {
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.currentTime = 0;
    // Chromium не всегда перерисовывает кадр после программного currentTime = 0 —
    // видео остаётся чёрным, пока не начнётся реальное воспроизведение. Короткий
    // play()+pause() форсирует декодирование и отрисовку кадра 0 без заметного
    // воспроизведения для пользователя. catch — play() может отклониться, если
    // пользователь к этому моменту уже сам взаимодействует с плеером.
    void video
      .play()
      .then(() => video.pause())
      .catch(() => {});
  };
  video.addEventListener("timeupdate", onTimeUpdate);
  video.currentTime = 1e101;
}
