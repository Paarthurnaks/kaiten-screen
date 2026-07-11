import { _electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { join } from "node:path";
import { startMockKaitenServer, type MockKaitenServer } from "./fixtures/mock-kaiten-server";

const mainPath = join(import.meta.dirname, "../../out/main/index.js");

// Playwright's electronApp.evaluate() не поддерживает require()/import() внутри eval,
// поэтому нужные хуки читаются с globalThis.__kaitenScreenE2e (см. src/main/index.ts),
// который включается только при E2E_TEST_HOOKS=1.
async function launchAppConfiguredForKaiten(kaitenUrl: string): Promise<ElectronApplication> {
  const electronApp = await _electron.launch({
    args: [mainPath],
    env: { ...process.env, E2E_TEST_HOOKS: "1" },
  });

  await electronApp.evaluate(async () => {
    await globalThis.__kaitenScreenE2e!.appReadyPromise;
  });

  await electronApp.evaluate(async (_electron, url: string) => {
    await globalThis.__kaitenScreenE2e!.saveSettings.execute({
      config: { kaitenDomain: url },
      apiKey: "e2e-test-key",
    });
  }, kaitenUrl);

  return electronApp;
}

/** Запускает сценарий захвата (как хоткей/трей), выделяет область в overlay и
 * заполняет форму задачи (заголовок + доска/дорожка), не нажимая submit. */
async function captureAndFillTaskForm(electronApp: ElectronApplication): Promise<Page> {
  electronApp
    .evaluate(async () => {
      await globalThis.__kaitenScreenE2e!.triggerCaptureFlow();
    })
    .catch((err: unknown) => {
      console.error("triggerCaptureFlow failed", err);
    });

  const overlayPage = await electronApp.waitForEvent("window");
  await overlayPage.waitForLoadState("domcontentloaded");

  // Реальный drag-select через синтетические мышиные события ненадёжен в headless/CI-среде
  // (нет гарантии фокуса окна), поэтому вызываем реальный contextBridge API overlay-окна
  // напрямую — тот же путь, что использует React-обработчик onMouseUp в CaptureOverlay.tsx.
  await overlayPage.evaluate(() => {
    // `window` недоступен в типах Node-tsconfig этого файла — обращаемся через globalThis.
    (globalThis as unknown as { captureOverlay: { reportRegionSelected: (r: unknown) => void } }).captureOverlay
      .reportRegionSelected({ x: 100, y: 100, width: 220, height: 160, action: "choice" });
  });

  // После захвата теперь сначала открывается экран выбора действия (см. windows.ts:
  // showPostCaptureChoiceWindow) — выбираем "Создать новую задачу", чтобы попасть в форму.
  const choicePage = await electronApp.waitForEvent("window");
  await choicePage.waitForLoadState("domcontentloaded");
  await choicePage.getByRole("button", { name: /Создать новую задачу/ }).click();

  const taskFormPage = await electronApp.waitForEvent("window");
  await taskFormPage.waitForLoadState("domcontentloaded");

  await taskFormPage.getByLabel(/Заголовок/).fill("Кнопка не работает");

  const spaceSelect = taskFormPage.getByLabel(/Пространство/);
  await expect(spaceSelect.locator("option", { hasText: "Test Space" })).toBeAttached();
  await spaceSelect.selectOption({ label: "Test Space" });

  const boardSelect = taskFormPage.getByLabel(/Доска/);
  await expect(boardSelect.locator("option", { hasText: "Test Board" })).toBeAttached();
  await boardSelect.selectOption({ label: "Test Board" });

  const laneSelect = taskFormPage.getByLabel(/Дорожка/);
  await expect(laneSelect.locator("option", { hasText: "Test Lane" })).toBeAttached();
  await laneSelect.selectOption({ label: "Test Lane" });

  return taskFormPage;
}

test.describe("Screenshot -> Kaiten task (e2e)", () => {
  let server: MockKaitenServer;

  test.afterEach(async () => {
    await server?.close();
  });

  test("захват области, заполнение формы и создание задачи в Kaiten", async () => {
    test.setTimeout(60_000);
    server = await startMockKaitenServer();

    const electronApp = await launchAppConfiguredForKaiten(server.url);
    const taskFormPage = await captureAndFillTaskForm(electronApp);

    await taskFormPage.getByRole("button", { name: "Создать задачу" }).click();

    await expect(taskFormPage.getByText("Задача создана")).toBeVisible();
    await expect(taskFormPage.getByRole("link", { name: /cards\/42/ })).toBeVisible();

    expect(server.requests.some((r) => r.method === "POST" && r.url === "/api/latest/cards")).toBe(true);
    // Реальный Kaiten API требует PUT для attach-file-to-card (подтверждено curl-запросом к
    // alphacore.kaiten.ru) — было POST.
    expect(server.requests.some((r) => r.method === "PUT" && /\/files$/.test(r.url))).toBe(true);

    await electronApp.close();
  });

  test("сетевая ошибка при создании задачи -> повторная отправка без потери данных формы", async () => {
    test.setTimeout(60_000);
    server = await startMockKaitenServer({ failFirstCreateTaskAttempts: 1 });

    const electronApp = await launchAppConfiguredForKaiten(server.url);
    const taskFormPage = await captureAndFillTaskForm(electronApp);

    // Первая попытка — сервер вернёт 500.
    await taskFormPage.getByRole("button", { name: "Создать задачу" }).click();
    await expect(taskFormPage.getByText(/Ошибка:/)).toBeVisible();

    // Данные формы не должны сброситься — заголовок и выбор доски/дорожки остаются.
    await expect(taskFormPage.getByLabel(/Заголовок/)).toHaveValue("Кнопка не работает");
    await expect(taskFormPage.getByLabel(/Доска/)).toHaveValue("10");
    await expect(taskFormPage.getByLabel(/Дорожка/)).toHaveValue("100");

    // Повторная отправка — тот же submit-button, вторая попытка проходит успешно.
    await taskFormPage.getByRole("button", { name: "Повторить отправку" }).click();
    await expect(taskFormPage.getByText("Задача создана")).toBeVisible();

    const createAttempts = server.requests.filter(
      (r) => r.method === "POST" && r.url === "/api/latest/cards",
    ).length;
    expect(createAttempts).toBe(2);

    await electronApp.close();
  });
});
