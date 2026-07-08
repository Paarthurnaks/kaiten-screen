export type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_KEY_PATTERN = /api[-_]?key|token|authorization|password|secret/i;

/**
 * Скрывает значения полей, похожих на секреты (API-ключ, токен, пароль), прежде чем
 * данные попадут в лог. Реализации Logger обязаны применять redact() ко всем data
 * перед сериализацией — сам порт не завязан на конкретный способ вывода (файл/консоль).
 */
export function redact(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(redact);
  }
  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(value);
    }
    return result;
  }
  return data;
}

/**
 * Единая точка логирования для application/infrastructure/main. Формат строки у
 * реализаций: `<ISO timestamp> <LEVEL> [Scope] message {data}`. Это порт (см.
 * ARCHITECTURE.md) — application получает конкретную реализацию через инъекцию,
 * а не создаёт её сама.
 */
export interface Logger {
  debug(scope: string, message: string, data?: unknown): void;
  info(scope: string, message: string, data?: unknown): void;
  warn(scope: string, message: string, data?: unknown): void;
  error(scope: string, message: string, data?: unknown): void;
}
