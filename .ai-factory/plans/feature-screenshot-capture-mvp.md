# Implementation Plan: Screenshot → Kaiten Task (MVP)

Branch: feature/screenshot-capture-mvp
Created: 2026-07-08

## Settings
- Testing: yes (Vitest для domain/application/infrastructure, Playwright `_electron` для e2e)
- Logging: verbose (DEBUG-логи на всех ключевых шагах, редакция секретов обязательна)
- Docs: no — `/aif-implement` должен выдавать `WARN [docs]` без обязательной остановки на документацию

## Контекст и замысел (чтобы не пересказывать заново)

**Проблема, которую решаем.** QA-команда сейчас заводит баги/фичи в Kaiten вручную: сделать
скриншот → зайти в Kaiten → создать задачу → руками прикрепить скриншот. Это приложение убирает
всё, кроме первого шага, в один нативный флоу.

**Целевой сценарий (MVP, Windows):**
1. Пользователь нажимает глобальный хоткей (или иконку в трее) → экран затемняется, появляется
   overlay для выделения произвольной прямоугольной области (поддержка нескольких мониторов).
2. После выделения — окно с формой: заголовок (обязателен), описание, доска (board), дорожка/
   колонка (lane), другие поля Kaiten. Скриншот уже прикреплён и виден как превью.
3. Подтверждение → приложение создаёт задачу в Kaiten через API (multipart-загрузка вложения),
   показывает уведомление об успехе со ссылкой на задачу.
4. Раздел настроек: API-ключ Kaiten (безопасное OS-хранилище), домен инстанса, дефолтные
   доска/поля, хоткей, автозапуск.
5. Приложение живёт в трее, не в панели задач.

**Важное ограничение процесса:** точная схема Kaiten API (эндпоинты, поля карточки, формат
авторизации) владельцем продукта ещё не предоставлена — примеры запросов/ответов будут переданы
по ходу реализации. Поэтому клиент Kaiten API (задача "Infrastructure: Kaiten HTTP client")
реализуется как изолированный адаптер за интерфейсом `KaitenClient`, с вынесенными в конфиг
URL/полями и явными TODO — чтобы уточнение деталей API не требовало трогать UI/use-cases.

**Архитектура (полная версия — см. `.ai-factory/ARCHITECTURE.md`):** облегчённая Clean
Architecture. Домен (`src/domain`) не знает про Electron/Node. Порты (`src/domain/ports`) —
единственная точка расширения под будущие платформы/режимы (macOS, видео-захват вместо
скриншота). `application` — use-cases, оркестрирующие домен+порты. `infrastructure` — конкретные
адаптеры (Windows screen capture, Electron safeStorage, JSON config, Kaiten HTTP client).
`main/index.ts` — composition root, единственное место, где адаптеры создаются и внедряются.
`renderer` — тонкий React UI, обращается к main только через типизированный IPC-контракт
(`preload`), никогда напрямую к Node/Electron API.

**Будущее расширение (закладывается сейчас архитектурно, НЕ реализуется в этом плане):**
- macOS: новый адаптер `ScreenCaptureProvider`/`SecretStore` в `infrastructure/platform/macos/`,
  без изменений в domain/application/renderer.
- Видео вместо/вместе со скриншотом: новый порт или расширение `ScreenCaptureProvider` под режим
  video, без переписывания текущего флоу скриншота.

**Роли:** владелец продукта курирует, разбирается с Kaiten API и присылает примеры запросов по
ходу реализации (задача "Infrastructure: Kaiten HTTP client" должна быть готова принять эти
примеры без переделки архитектуры). Вся техническая реализация, выбор конкретных библиотек внутри
уже согласованного стека (Electron + TypeScript + React) и дизайн UI — на стороне AI-агента.

**Стек:** Electron + TypeScript, React (renderer), electron-vite (dev/сборка), electron-builder
(упаковка, Windows NSIS на MVP), Vitest (unit), Playwright `_electron` (e2e), Electron
`safeStorage` (секреты, DPAPI на Windows).

## Commit Plan

- **Commit 1** (после задач 1-4): `chore: bootstrap electron/typescript/react tooling and logger`
- **Commit 2** (после задач 5-7): `feat: add domain layer and application use-cases`
- **Commit 3** (после задач 8-11): `feat: implement infrastructure adapters (kaiten client, secrets, config, capture)`
- **Commit 4** (после задач 12-16): `feat: wire electron main process (composition root, hotkeys, tray, windows, ipc)`
- **Commit 5** (после задач 17-19): `feat: implement renderer UI (overlay, task form, settings)`
- **Commit 6** (после задач 20-22): `feat: add resilience, autostart and windows packaging`
- **Commit 7** (после задач 23-24): `test: add e2e coverage and finalize quality scripts`

## Tasks

### Phase 1: Scaffolding & tooling
- [x] Task 1: Инициализировать Node/TS проект и тулинг (package.json, tsconfig, ESLint/Prettier, .gitignore)
- [x] Task 2: Настроить Electron + electron-vite + electron-builder (depends on 1)
- [x] Task 3: Создать скелет папок по ARCHITECTURE.md (depends on 1)
- [x] Task 4: Реализовать общий логгер (depends on 1) — по факту реализован как порт
  `domain/ports/logger.ts` (Logger + redact()) с реализацией `infrastructure/logging/file-logger.ts`,
  а не как `shared/logger.ts` — см. `.ai-factory/ARCHITECTURE.md` за обоснованием
<!-- Commit checkpoint: tasks 1-4 -->

### Phase 2: Domain & Application (чистая логика)
- [x] Task 5: Domain — сущности и value objects (TaskDraft, CaptureRegion, CapturedImage) (depends on 3)
- [x] Task 6: Domain — порты (ScreenCaptureProvider, SecretStore, KaitenClient, ConfigStore) (depends on 5)
- [x] Task 7: Application — use-cases + unit-тесты (CaptureAndCreateTask, LoadSettings, SaveSettings) (depends on 5, 6, 4)
<!-- Commit checkpoint: tasks 5-7 -->

### Phase 3: Infrastructure adapters
- [x] Task 8: Infrastructure — Kaiten HTTP client (заглушка под уточнение API, TODO-маркеры) (depends on 6)
- [x] Task 9: Infrastructure — Electron safeStorage secret store (depends on 6)
- [x] Task 10: Infrastructure — JSON config store (depends on 6)
- [x] Task 11: Infrastructure — Windows screen capture adapter (overlay + desktopCapturer) (depends on 6) —
  внутренний IPC-протокол overlay↔main вынесен в `shared/capture-overlay-protocol.ts`
<!-- Commit checkpoint: tasks 8-11 -->

### Phase 4: Electron main process wiring
- [x] Task 12: Main — composition root (main/index.ts) (depends on 7, 8, 9, 10, 11)
- [x] Task 13: Main — глобальные хоткеи (depends on 12)
- [x] Task 14: Main — трей-иконка и меню (depends on 12) — иконка сейчас плейсхолдер,
  заменится в задаче "Упаковка Windows-инсталлятора"
- [x] Task 15: Main — управление окнами (overlay/форма/настройки) (depends on 12) —
  overlay уже управляется изнутри WindowsScreenCapture (задача 11); здесь — settings/task-form
- [x] Task 16: IPC-контракт, хендлеры и preload (depends on 7, 12) — добавлен небольшой
  use-case `ListKaitenOptions` (application/), не выделенный отдельной задачей в исходном
  плане, но нужный, чтобы IPC-хендлеры не обращались к KaitenClient напрямую (по правилам
  ARCHITECTURE.md)
<!-- Commit checkpoint: tasks 12-16 -->

### Phase 5: Renderer UI
- [ ] Task 17: Renderer — overlay выделения области (depends on 16)
- [ ] Task 18: Renderer — форма создания задачи (depends on 16)
- [ ] Task 19: Renderer — раздел настроек (depends on 16)
<!-- Commit checkpoint: tasks 17-19 -->

### Phase 6: Устойчивость и упаковка
- [ ] Task 20: Обработка сетевых ошибок без потери данных формы/скриншота (depends on 7, 18)
- [ ] Task 21: Автозапуск при старте системы + "свернуть в трей" (depends on 14, 19)
- [ ] Task 22: Упаковка Windows-инсталлятора (electron-builder) (depends on 12, 19)
<!-- Commit checkpoint: tasks 20-22 -->

### Phase 7: E2E тесты и финальная проверка
- [ ] Task 23: E2E тест ключевого сценария (Playwright + `_electron`, мок Kaiten API) (depends on 18, 20)
- [ ] Task 24: Финальный прогон lint/typecheck/test/build (depends on 22, 23)
<!-- Commit checkpoint: tasks 23-24 -->

## Примечания для /aif-implement

- Задачи 1-24 в этом файле соответствуют задачам #7-#30 в трекере задач сессии (TaskCreate/TaskList) —
  нумерация в трекере продолжает нумерацию задач по настройке AI Factory (#1-#6), выполненных на
  этапе `/aif`.
- Kaiten HTTP client (Task 8) закладывается с заглушками — как только владелец продукта пришлёт
  реальные примеры запросов/ответов Kaiten API, эту задачу нужно донастроить (эндпоинты, поля,
  формат авторизации), не трогая остальные слои.
- Логирование verbose означает: DEBUG на входе/выходе всех use-case методов и IPC-вызовов, INFO на
  успешных бизнес-событиях (задача создана), WARN на частичных сбоях, ERROR на полных сбоях — с
  обязательной редакцией API-ключа перед записью в лог.
