import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Logger, LogLevel } from "../../domain/ports/logger";
import { redact } from "../../domain/ports/logger";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024; // после превышения — ротация в kaiten-screen.log.old

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "debug").toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "debug";
}

function rotateIfOversized(filePath: string): void {
  if (!existsSync(filePath)) return;
  if (statSync(filePath).size > MAX_LOG_FILE_BYTES) {
    renameSync(filePath, `${filePath}.old`);
  }
}

/**
 * Файловый Logger (implements Logger) — пишет в консоль и в файл в переданной
 * директории (обычно userData/logs, см. main/index.ts). Уровень управляется LOG_LEVEL
 * (debug/info/warn/error), по умолчанию debug (verbose) согласно настройкам плана.
 */
export function createFileLogger(directory: string): Logger {
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, "kaiten-screen.log");
  rotateIfOversized(filePath);

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
  }

  function writeLine(level: LogLevel, scope: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const safeData = data === undefined ? "" : ` ${JSON.stringify(redact(data))}`;
    const line = `${timestamp} ${level.toUpperCase()} [${scope}] ${message}${safeData}`;

    const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleMethod(line);

    try {
      appendFileSync(filePath, `${line}\n`, "utf8");
    } catch (err) {
      console.error(`${timestamp} ERROR [FileLogger.writeLine] Failed to write log file: ${String(err)}`);
    }
  }

  return {
    debug: (scope, message, data) => shouldLog("debug") && writeLine("debug", scope, message, data),
    info: (scope, message, data) => shouldLog("info") && writeLine("info", scope, message, data),
    warn: (scope, message, data) => shouldLog("warn") && writeLine("warn", scope, message, data),
    error: (scope, message, data) => shouldLog("error") && writeLine("error", scope, message, data),
  };
}
