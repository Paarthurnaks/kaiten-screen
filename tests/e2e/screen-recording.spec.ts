import { test } from "@playwright/test";

// Реальная запись экрана (desktopCapturer + getUserMedia + MediaRecorder) не
// автоматизируется в этом MVP: headless/CI-раннер Playwright не имеет настоящего
// экрана/GPU-композитора, поэтому getUserMedia с chromeMediaSource:"desktop" либо
// падает, либо отдаёт пустой/чёрный поток — тест либо всегда красный по причинам,
// не связанным с багами в коде, либо создаёт ложное ощущение покрытия. Решение
// зафиксировано в плане .ai-factory/plans/feature-screen-recording-mvp.md.
//
// Что покрыто вместо этого:
// - unit-тесты domain/application (CapturedVideo/Attachment,
//   CaptureAndCreateTask, KaitenHttpClient.attachFile) — src/**/__tests__/*.
// - ручная верификация полного флоу (хоткей/трей -> overlay в режиме записи ->
//   DPI-корректная обрезка на масштабировании ≠100% -> индикатор не попадает в
//   кадр -> остановка кнопкой/хоткеем -> авто-стоп по лимиту -> превью видео ->
//   реальная загрузка .webm-вложения в реальную карточку Kaiten).
test.skip("запись экрана и загрузка видео в Kaiten — не автоматизировано, см. комментарий выше", () => {
  // Намеренно пусто.
});
