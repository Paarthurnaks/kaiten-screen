/**
 * Ошибка валидации доменных данных (например, пустой заголовок задачи или
 * некорректный регион захвата). Отличается от сетевых/инфраструктурных ошибок —
 * application-слой может ловить её отдельно, чтобы показать понятное сообщение в UI,
 * не пытаясь повторить операцию.
 */
export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}
