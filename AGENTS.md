# AGENTS.md

> Карта проекта для AI-агентов. Обновляйте по мере роста проекта.

## Обзор проекта

Kaiten Screen — нативное Windows-приложение для QA-команды: скриншот выделенной области экрана →
короткая форма полей задачи → автоматическое создание карточки в Kaiten через API с прикреплённым
скриншотом. Архитектура закладывается с расчётом на будущую поддержку macOS и запись видео.

## Технологический стек

- **Платформа/рантайм:** Electron, TypeScript
- **UI:** React (renderer-процесс)
- **Хранение секретов:** Electron `safeStorage` (DPAPI на Windows)
- **HTTP-клиент:** обёртка над Kaiten REST API
- **Сборка:** electron-builder
- **Тесты:** Vitest/Jest + Playwright (`_electron`) для e2e

## Структура проекта

```
kaiten-screen/
├── .ai-factory/              # Спецификация, архитектура, конфиг AI Factory, планы
│   ├── DESCRIPTION.md        # Что и зачем строим
│   ├── ARCHITECTURE.md       # Архитектурные решения (облегчённая Clean Architecture)
│   ├── config.yaml           # Настройки AI Factory для этого проекта
│   ├── plans/                # Планы фичей (/aif-plan full)
│   └── rules/base.md         # Базовые конвенции кода
├── .claude/                  # Скиллы и саб-агенты Claude Code (AI Factory + сторонние)
├── .mcp.json                  # MCP-серверы проекта (github, filesystem, chromeDevtools, playwright)
├── electron.vite.config.ts    # Сборка main/preload/renderer (electron-vite)
├── electron-builder.yml       # Упаковка Windows-инсталлятора
├── tsconfig.json               # main/preload/domain/application/infrastructure (Node)
├── tsconfig.web.json           # renderer (DOM/React)
└── src/
    ├── domain/                 # Чистая бизнес-логика, зависимостей нет
    │   ├── entities/            # TaskDraft, CapturedImage
    │   ├── value-objects/       # CaptureRegion
    │   └── ports/               # Интерфейсы: ScreenCaptureProvider, SecretStore,
    │                            # KaitenClient, ConfigStore, Logger
    ├── application/             # Use-cases: CaptureAndCreateTask, Load/SaveSettings
    ├── infrastructure/          # Реализации портов (адаптеры)
    │   ├── kaiten/                # KaitenHttpClient
    │   ├── secrets/               # ElectronSafeStorage
    │   ├── config/                # JsonConfigStore
    │   ├── logging/               # createFileLogger (implements domain/ports/logger.ts)
    │   └── platform/windows/      # WindowsScreenCapture
    ├── main/                    # Electron main-процесс = composition root + OS-интеграция
    ├── preload/                 # contextBridge-мосты main ↔ renderer
    ├── renderer/                # React UI (отдельные окна)
    │   ├── capture-overlay/       # Overlay выделения области
    │   ├── task-form/             # Форма задачи
    │   └── settings/              # Раздел настроек
    └── shared/                  # Типы, общие для всех слоёв (IPC-контракт)
```

**Важное архитектурное уточнение (не было в исходном ARCHITECTURE.md):** логирование реализовано
как порт `domain/ports/logger.ts` (`Logger` интерфейс + `redact()`) с конкретной реализацией
`infrastructure/logging/file-logger.ts` — а не как файл в `shared/`, потому что `shared/` также
подключён к renderer-tsconfig (без Node-типов), а сам логгер использует `fs`/`process`. Это тот же
паттерн порт/адаптер, что и для остальных возможностей (Kaiten API, хранилище, захват экрана).

## Ключевые точки входа

| Файл | Назначение |
|------|-----------|
| `.ai-factory/DESCRIPTION.md` | Полное описание продукта, сценарий использования, стек |
| `.ai-factory/rules/base.md` | Конвенции именования, структура модулей, обработка ошибок |
| `.mcp.json` | Конфигурация MCP-серверов проекта |

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| AGENTS.md | AGENTS.md | Этот файл — карта структуры проекта |
| DESCRIPTION | .ai-factory/DESCRIPTION.md | Спецификация проекта и стек |
| ARCHITECTURE | .ai-factory/ARCHITECTURE.md | Архитектурные решения и гайдлайны |

## AI Context Files

| Файл | Назначение |
|------|-----------|
| AGENTS.md | Этот файл — карта структуры проекта |
| .ai-factory/DESCRIPTION.md | Спецификация проекта и стек |
| .ai-factory/ARCHITECTURE.md | Архитектурные решения и гайдлайны |
| CLAUDE.md (глобальный, ~/.claude/CLAUDE.md) | Личные инструкции пользователя для всех проектов |

## Правила для агентов

- Никогда не объединяйте shell-команды через `&&`, `||` или `;` — выполняйте каждую команду
  отдельным вызовом Bash-инструмента. Это касается и случаев, когда скилл, план или инструкция
  предлагают объединённую команду — всегда разбивайте её на отдельные вызовы.
  - ❌ Неправильно: `git checkout master && git pull`
  - ✅ Правильно: два отдельных вызова Bash — сначала `git checkout master`, затем
    `git pull origin master`
