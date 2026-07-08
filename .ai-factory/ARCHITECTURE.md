# Архитектура: облегчённая Clean Architecture (Electron)

## Обзор

Kaiten Screen — небольшое Electron-приложение с одним ключевым сценарием (захват области экрана →
форма → задача в Kaiten), но с явным требованием: захват экрана, хранилище секретов и API-клиент
должны быть заменяемыми модулями, потому что в будущем добавятся macOS и запись видео. Поэтому
берём Clean Architecture в облегчённом виде — без отдельных слоёв на каждый чих, но с одним жёстким
правилом: **бизнес-логика и UI не знают о конкретных платформенных реализациях**, только об
интерфейсах (портах). Реализации (Windows screenshot, safeStorage, HTTP-клиент Kaiten) подключаются
через инъекцию в composition root — точку сборки приложения.

Для Electron это ложится естественно на существующее разделение процессов: `main` — composition
root и мост к OS, `renderer` — чистый UI, `preload` — типизированный контракт между ними.

## Обоснование решения

- **Тип проекта:** десктопное приложение, один разработчик + AI-агент, MVP + понятная эволюция
  (macOS, видео) без переписывания ядра.
- **Стек:** Electron + TypeScript + React.
- **Ключевой фактор:** заранее объявленное расширение (новая ОС, новый режим захвата) не должно
  требовать правок в бизнес-логике или UI — только добавления нового адаптера.

## Структура папок

```
src/
├── domain/                     # Чистая бизнес-логика. Ноль зависимостей от Electron/Node/React.
│   ├── entities/
│   │   └── task-draft.ts       # TaskDraft: заголовок, описание, доска, дорожка, вложение
│   ├── value-objects/
│   │   └── capture-region.ts   # CaptureRegion: x, y, width, height + валидация
│   └── ports/                  # Интерфейсы (порты), которые реализует infrastructure
│       ├── screen-capture-provider.ts
│       ├── secret-store.ts
│       ├── kaiten-client.ts
│       ├── config-store.ts
│       └── logger.ts           # Logger + redact() — логирование тоже порт (см. ниже)
│
├── application/                 # Use-cases: оркестрация domain + портов
│   ├── capture-and-create-task.ts
│   ├── load-settings.ts
│   └── save-settings.ts
│
├── infrastructure/               # Адаптеры — реализации портов
│   ├── kaiten/
│   │   └── kaiten-http-client.ts        # implements KaitenClient (fetch/axios, multipart)
│   ├── secrets/
│   │   └── electron-safe-storage.ts     # implements SecretStore (Electron safeStorage)
│   ├── config/
│   │   └── json-config-store.ts         # implements ConfigStore (файл конфигурации)
│   ├── logging/
│   │   └── file-logger.ts               # implements Logger (fs-запись + консоль, ротация)
│   └── platform/
│       └── windows/
│           └── windows-screen-capture.ts # implements ScreenCaptureProvider (desktopCapturer + overlay)
│           # platform/macos/ — добавится позже, тот же порт ScreenCaptureProvider
│
├── main/                         # Electron main-процесс = composition root + OS-интеграция
│   ├── index.ts                  # Точка входа: собирает адаптеры, внедряет в use-cases
│   ├── tray.ts                   # Иконка в трее
│   ├── hotkeys.ts                # Глобальные хоткеи
│   ├── windows.ts                # Управление окнами (overlay, форма, настройки)
│   └── ipc-handlers.ts           # IPC-хендлеры, вызывающие use-cases из application/
│
├── preload/
│   └── index.ts                  # contextBridge: типизированный API для renderer
│
├── renderer/                     # React UI — ничего не знает про Electron API напрямую
│   ├── capture-overlay/           # Overlay выделения области
│   ├── task-form/                 # Форма задачи (заголовок, описание, доска, дорожка)
│   └── settings/                  # Раздел настроек (API-ключ, домен, дефолты, хоткеи)
│
└── shared/                        # Типы, общие для всех слоёв (IPC-контракты, DTO)
    └── ipc-contract.ts
```

## Правила зависимостей

- ✅ `domain` не зависит ни от чего.
- ✅ `application` зависит только от `domain` (сущности + порты).
- ✅ `infrastructure` реализует порты из `domain`, может зависеть от `domain`/`application`.
- ✅ `main` (composition root) — единственное место, где `infrastructure`-классы создаются и
  внедряются в `application`-use-cases.
- ✅ `renderer` зависит только от типизированного контракта `preload`/`shared`, не от `main` и не
  от `infrastructure` напрямую.
- ❌ `domain` и `application` никогда не импортируют `electron`, `fs`, `net` и т.п. напрямую.
- **Логирование — тоже порт.** `Logger` определён в `domain/ports/logger.ts` (интерфейс + чистая
  функция `redact()`), а не в `shared/`, потому что `shared/` подключён и к renderer-конфигу
  (без Node-типов), а любая реальная реализация логирования пишет в файл (`fs`). Конкретная
  реализация — `infrastructure/logging/file-logger.ts` (`createFileLogger`), внедряется в
  use-cases/main так же, как `KaitenClient` или `ScreenCaptureProvider`.
- ❌ `renderer` никогда не импортирует модули из `main/` или `infrastructure/` напрямую — только
  через IPC-контракт.
- ❌ Новый платформенный адаптер (macOS, видео) не должен требовать правок в `domain`/`application`
  — только добавление файла в `infrastructure/platform/` и одну строку выбора адаптера в `main/index.ts`.

## Взаимодействие слоёв/модулей

- `renderer` → `preload` (contextBridge) → `main/ipc-handlers.ts` → `application` use-case →
  порты (`domain/ports`) → конкретный адаптер из `infrastructure`.
- Выбор конкретного адаптера (Windows vs будущий macOS, screenshot vs будущее video) происходит
  один раз в `main/index.ts` при старте приложения — по платформе (`process.platform`) и/или
  настройке пользователя.
- `application` use-cases ничего не знают, какой именно адаптер им подставили — работают только
  через интерфейс порта.

## Ключевые принципы

1. **Порт на каждую точку расширения.** Если функциональность может измениться при добавлении
   macOS или видео — за ней стоит интерфейс в `domain/ports`, а не прямой вызов Electron/Node API.
2. **Composition root — только `main/index.ts`.** Только там конкретные классы адаптеров создаются
   и связываются с use-cases. Нигде больше `new WindowsScreenCapture()` не должно вызываться.
3. **Renderer — тонкий UI.** Вся логика (валидация формы перед отправкой, оркестрация захват →
   форма → отправка) живёт в `application`, а не размазана по React-компонентам.
4. **Не усложнять раньше времени.** Слоёв ровно столько, сколько нужно для соблюдения принципа 1 —
   никаких дополнительных абстракций "на всякий случай" сверх портов под уже объявленное расширение
   (macOS, видео).

## Примеры кода

### Порт (интерфейс) для захвата экрана

```typescript
// src/domain/ports/screen-capture-provider.ts
import type { CaptureRegion } from "../value-objects/capture-region";

export interface CapturedImage {
  buffer: Buffer;
  mimeType: "image/png";
}

export interface ScreenCaptureProvider {
  /** Показывает overlay выбора области и возвращает захваченное изображение. */
  captureRegion(): Promise<{ region: CaptureRegion; image: CapturedImage } | null>;
}
```

### Use-case, оркестрирующий домен и порты

```typescript
// src/application/capture-and-create-task.ts
import type { ScreenCaptureProvider } from "../domain/ports/screen-capture-provider";
import type { KaitenClient } from "../domain/ports/kaiten-client";
import type { TaskDraft } from "../domain/entities/task-draft";

export class CaptureAndCreateTask {
  constructor(
    private readonly capture: ScreenCaptureProvider,
    private readonly kaiten: KaitenClient,
  ) {}

  async captureStep() {
    return this.capture.captureRegion();
  }

  async submitStep(draft: TaskDraft, image: { buffer: Buffer; mimeType: string }) {
    const task = await this.kaiten.createTask(draft);
    await this.kaiten.attachFile(task.id, image);
    return task;
  }
}
```

### Composition root — единственное место со `new` для адаптеров

```typescript
// src/main/index.ts
import { CaptureAndCreateTask } from "../application/capture-and-create-task";
import { WindowsScreenCapture } from "../infrastructure/platform/windows/windows-screen-capture";
import { KaitenHttpClient } from "../infrastructure/kaiten/kaiten-http-client";
import { ElectronSafeStorage } from "../infrastructure/secrets/electron-safe-storage";

const secretStore = new ElectronSafeStorage();
const captureProvider = new WindowsScreenCapture(); // macOS-адаптер подключится здесь же, по platform
const kaitenClient = new KaitenHttpClient(secretStore);

export const captureAndCreateTask = new CaptureAndCreateTask(captureProvider, kaitenClient);
```

## Антипаттерны

- ❌ Вызов `desktopCapturer` или `safeStorage` напрямую из React-компонента в `renderer/`.
- ❌ `if (process.platform === "darwin")` внутри `application`-use-case вместо выбора адаптера в
  composition root.
- ❌ Создание нового платформенного адаптера "на будущее" без реального порта под него — сначала
  порт в `domain/ports`, потом адаптер.
- ❌ Раздувание доменного слоя доменными событиями/агрегатами уровня DDD — для одного use-case
  захвата и создания задачи это избыточно.
