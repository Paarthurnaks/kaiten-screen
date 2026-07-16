import { _electron, expect, test, type ElectronApplication } from "@playwright/test";
import { join } from "node:path";

const mainPath = join(import.meta.dirname, "../../out/main/index.js");

async function launchApp(): Promise<ElectronApplication> {
  const electronApp = await _electron.launch({
    args: [mainPath],
    env: { ...process.env, E2E_TEST_HOOKS: "1" },
  });

  await electronApp.evaluate(async () => {
    await globalThis.__kaitenScreenE2e!.appReadyPromise;
  });

  return electronApp;
}

test.describe("Single instance lock (e2e)", () => {
  test("второй запуск не создаёт второй процесс и не ломает первый", async () => {
    test.setTimeout(60_000);

    const electronApp1 = await launchApp();

    try {
      // Второй экземпляр использует то же E2E_TEST_HOOKS=1 → тот же app.setName
      // ("kaiten-screen-e2e") → тот же userData/scope блокировки, что и первый.
      // requestSingleInstanceLock() у второго процесса вернёт false → app.quit() +
      // process.exit(0) сразу после старта модуля, до app.whenReady() — Playwright
      // не успевает установить CDP-соединение, поэтому _electron.launch() падает.
      await expect(_electron.launch({ args: [mainPath], env: { ...process.env, E2E_TEST_HOOKS: "1" } })).rejects.toThrow();

      // Первый инстанс не должен пострадать от неудачной попытки второго запуска.
      await electronApp1.evaluate(async () => {
        await globalThis.__kaitenScreenE2e!.appReadyPromise;
      });
      expect(electronApp1.process().exitCode).toBeNull();
    } finally {
      await electronApp1.close();
    }
  });
});
