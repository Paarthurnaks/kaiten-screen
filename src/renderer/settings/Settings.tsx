import { useCallback, useEffect, useState } from "react";
import type { KaitenOptionDto, KaitenUserDto, LoadedSettingsDto } from "../../shared/ipc-contract";

type AppConfigShape = LoadedSettingsDto["config"];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kaitenDomain, setKaitenDomain] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [captureHotkey, setCaptureHotkey] = useState("");
  const [autostart, setAutostart] = useState(false);

  // Локальные моковые настройки — не персистятся, нет соответствующего эндпоинта/
  // концепции в Kaiten API (см. план второго захода).
  const [copyToClipboard, setCopyToClipboard] = useState(true);
  const [soundOnCapture, setSoundOnCapture] = useState(false);

  const [spaces, setSpaces] = useState<KaitenOptionDto[]>([]);
  const [boards, setBoards] = useState<KaitenOptionDto[]>([]);
  const [columns, setColumns] = useState<KaitenOptionDto[]>([]);
  const [lanes, setLanes] = useState<KaitenOptionDto[]>([]);
  const [users, setUsers] = useState<KaitenUserDto[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [defaultBoardId, setDefaultBoardId] = useState("");
  const [defaultColumnId, setDefaultColumnId] = useState("");
  const [defaultLaneId, setDefaultLaneId] = useState("");
  const [defaultResponsibleId, setDefaultResponsibleId] = useState("");

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const [exportState, setExportState] = useState<"idle" | "exporting" | "done" | "error">("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [importState, setImportState] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);

  function applyConfig(config: AppConfigShape): void {
    setKaitenDomain(config.kaitenDomain);
    setCaptureHotkey(config.captureHotkey);
    setAutostart(config.autostart);
    setSpaceId(config.defaultSpaceId ?? "");
    setDefaultBoardId(config.defaultBoardId ?? "");
    setDefaultColumnId(config.defaultColumnId ?? "");
    setDefaultLaneId(config.defaultLaneId ?? "");
    setDefaultResponsibleId(config.defaultResponsibleId ?? "");
  }

  const refreshFromBackend = useCallback(async (): Promise<void> => {
    const [loaded, usersResult, spacesResult] = await Promise.allSettled([
      window.kaitenScreen.loadSettings(),
      window.kaitenScreen.listUsers(),
      window.kaitenScreen.listSpaces(),
    ]);
    if (loaded.status === "fulfilled") {
      applyConfig(loaded.value.config);
      setHasApiKey(loaded.value.hasApiKey);
    } else {
      setLoadError(errorMessage(loaded.reason));
    }
    if (usersResult.status === "fulfilled") setUsers(usersResult.value);
    if (spacesResult.status === "fulfilled") setSpaces(spacesResult.value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        await refreshFromBackend();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshFromBackend]);

  useEffect(() => {
    if (!spaceId) {
      setBoards([]);
      return;
    }
    let cancelled = false;
    window.kaitenScreen.listBoards(spaceId).then((list) => {
      if (!cancelled) setBoards(list);
    });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  useEffect(() => {
    if (!defaultBoardId) {
      setColumns([]);
      setLanes([]);
      return;
    }
    let cancelled = false;
    window.kaitenScreen.listColumns(defaultBoardId).then((list) => {
      if (!cancelled) setColumns(list);
    });
    window.kaitenScreen.listLanes(defaultBoardId).then((list) => {
      if (!cancelled) setLanes(list);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultBoardId]);

  async function persistSettings(): Promise<void> {
    await window.kaitenScreen.saveSettings({
      config: {
        kaitenDomain,
        defaultSpaceId: spaceId || null,
        defaultBoardId: defaultBoardId || null,
        defaultColumnId: defaultColumnId || null,
        defaultLaneId: defaultLaneId || null,
        defaultResponsibleId: defaultResponsibleId || null,
        captureHotkey,
        autostart,
      },
      apiKey: apiKeyInput.length > 0 ? apiKeyInput : undefined,
    });
    if (apiKeyInput.length > 0) {
      setHasApiKey(true);
      setApiKeyInput("");
    }
  }

  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaveState("saving");
    setSaveError(null);
    try {
      await persistSettings();
      setSaveState("saved");
      // Небольшая пауза, чтобы пользователь успел увидеть подтверждение "Настройки
      // сохранены", прежде чем окно закроется само (по просьбе пользователя — раньше
      // приходилось закрывать вручную после каждого сохранения).
      setTimeout(() => window.close(), 400);
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaveState("error");
    }
  }

  async function handleTestConnection(): Promise<void> {
    setTestState("testing");
    setTestError(null);
    try {
      // Проверка соединения работает с уже сохранёнными настройками — сохраняем
      // текущее состояние формы, затем перечитываем пространства/пользователей
      // тем же путём, что и при монтировании.
      await persistSettings();
      const spacesList = await window.kaitenScreen.listSpaces();
      setSpaces(spacesList);
      const usersList = await window.kaitenScreen.listUsers();
      setUsers(usersList);
      setTestState("success");
    } catch (err) {
      setTestError(errorMessage(err));
      setTestState("error");
    }
  }

  async function handleExportConfig(): Promise<void> {
    setExportState("exporting");
    setExportMessage(null);
    try {
      const result = await window.kaitenScreen.exportProjectConfig();
      if (result.path) {
        setExportState("done");
        setExportMessage(`Сохранено: ${result.path}`);
      } else {
        setExportState("idle");
      }
    } catch (err) {
      setExportState("error");
      setExportMessage(errorMessage(err));
    }
  }

  async function handleImportConfig(): Promise<void> {
    setImportState("importing");
    setImportMessage(null);
    try {
      const result = await window.kaitenScreen.importProjectConfig();
      if (result.applied) {
        await refreshFromBackend();
        setImportState("done");
        setImportMessage("Настройки применены из выбранного файла");
      } else {
        setImportState("idle");
      }
    } catch (err) {
      setImportState("error");
      setImportMessage(errorMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="ks-card">
        <div className="ks-card-body">
          <p className="ks-muted-text">Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSave(event)} className="ks-card">
      <div className="ks-card-header">
        <div className="ks-card-title">Настройки</div>
      </div>

      <div className="ks-card-body">
        {loadError && <p className="ks-error-text">Не удалось загрузить настройки: {loadError}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="ks-section-title">Подключение к Kaiten</div>

          <label className="ks-field">
            <span className="ks-label">Домен рабочего пространства</span>
            <input
              className="ks-input"
              placeholder="mycompany.kaiten.ru"
              value={kaitenDomain}
              onChange={(event) => setKaitenDomain(event.target.value)}
            />
          </label>

          <label className="ks-field">
            <span className="ks-label">
              API-ключ {hasApiKey && apiKeyInput.length === 0 && <span style={{ color: "var(--ks-text-faint)" }}>(сохранён)</span>}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="ks-input"
                type={showApiKey ? "text" : "password"}
                placeholder={hasApiKey ? "оставьте пустым, чтобы не менять" : "Введите API-ключ Kaiten"}
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="ks-btn ks-btn-secondary"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => setShowApiKey((current) => !current)}
              >
                {showApiKey ? "Скрыть" : "Показать"}
              </button>
            </div>
          </label>

          <div>
            <button type="button" className="ks-btn ks-btn-secondary" onClick={() => void handleTestConnection()} disabled={testState === "testing"}>
              {testState === "testing" ? "Проверка…" : "Проверить соединение"}
            </button>
            {testState === "success" && (
              <div className="ks-status-dot ks-status-dot-ok" style={{ marginTop: 6 }}>
                Соединение активно · пространств: {spaces.length}
              </div>
            )}
            {testState === "error" && (
              <div className="ks-status-dot ks-status-dot-error" style={{ marginTop: 6 }}>
                {testError}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, borderTop: "1px solid var(--ks-border)" }}>
          <div className="ks-section-title" style={{ paddingTop: 10 }}>
            Значения по умолчанию
          </div>

          <div className="ks-field-grid">
            <label className="ks-field">
              <span className="ks-label">Пространство</span>
              <select className="ks-select" value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
                <option value="">—</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="ks-field">
              <span className="ks-label">Доска</span>
              <select
                className="ks-select"
                value={defaultBoardId}
                onChange={(event) => setDefaultBoardId(event.target.value)}
                disabled={boards.length === 0}
              >
                <option value="">—</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="ks-field">
              <span className="ks-label">Колонка</span>
              <select
                className="ks-select"
                value={defaultColumnId}
                onChange={(event) => setDefaultColumnId(event.target.value)}
                disabled={columns.length === 0}
              >
                <option value="">—</option>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="ks-field">
              <span className="ks-label">Дорожка</span>
              <select
                className="ks-select"
                value={defaultLaneId}
                onChange={(event) => setDefaultLaneId(event.target.value)}
                disabled={lanes.length === 0}
              >
                <option value="">—</option>
                {lanes.map((lane) => (
                  <option key={lane.id} value={lane.id}>
                    {lane.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="ks-field">
              <span className="ks-label">Ответственный</span>
              <select
                className="ks-select"
                value={defaultResponsibleId}
                onChange={(event) => setDefaultResponsibleId(event.target.value)}
              >
                <option value="">—</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4, borderTop: "1px solid var(--ks-border)" }}>
          <div className="ks-section-title" style={{ paddingTop: 10 }}>
            Захват
          </div>

          <div className="ks-toggle-row">
            <div className="ks-toggle-label">
              <span className="ks-toggle-label-title">Горячая клавиша захвата</span>
              <span className="ks-toggle-label-subtitle">Запуск выделения области</span>
            </div>
            <input
              className="ks-chip-mono"
              style={{ width: 180, textAlign: "center", border: "1px solid var(--ks-border-strong)" }}
              value={captureHotkey}
              onChange={(event) => setCaptureHotkey(event.target.value)}
              placeholder="CommandOrControl+Shift+K"
            />
          </div>

          <div className="ks-toggle-row">
            <div className="ks-toggle-label">
              <span className="ks-toggle-label-title">Копировать в буфер после захвата</span>
              <span className="ks-toggle-label-subtitle">Помимо прикрепления к задаче</span>
            </div>
            <input
              type="checkbox"
              className="ks-toggle"
              checked={copyToClipboard}
              onChange={(event) => setCopyToClipboard(event.target.checked)}
            />
          </div>

          <div className="ks-toggle-row">
            <div className="ks-toggle-label">
              <span className="ks-toggle-label-title">Звук при захвате</span>
            </div>
            <input
              type="checkbox"
              className="ks-toggle"
              checked={soundOnCapture}
              onChange={(event) => setSoundOnCapture(event.target.checked)}
            />
          </div>

          <div className="ks-toggle-row">
            <div className="ks-toggle-label">
              <span className="ks-toggle-label-title">Запускать при старте системы</span>
            </div>
            <input
              type="checkbox"
              className="ks-toggle"
              checked={autostart}
              onChange={(event) => setAutostart(event.target.checked)}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, borderTop: "1px solid var(--ks-border)" }}>
          <div className="ks-section-title" style={{ paddingTop: 10 }}>
            Файл настроек
          </div>
          <p className="ks-muted-text" style={{ margin: 0 }}>
            Сохранить текущие настройки (включая API-ключ) в файл, чтобы перенести на другой
            компьютер или не вводить их заново, либо загрузить настройки из ранее сохранённого
            файла.
          </p>
          <div className="ks-btn-row">
            <button
              type="button"
              className="ks-btn ks-btn-secondary"
              onClick={() => void handleExportConfig()}
              disabled={exportState === "exporting"}
            >
              {exportState === "exporting" ? "Сохранение…" : "Сохранить в файл…"}
            </button>
            <button
              type="button"
              className="ks-btn ks-btn-secondary"
              onClick={() => void handleImportConfig()}
              disabled={importState === "importing"}
            >
              {importState === "importing" ? "Загрузка…" : "Загрузить из файла…"}
            </button>
          </div>
          {exportMessage && (
            <p className={exportState === "error" ? "ks-error-text" : "ks-success-text"}>{exportMessage}</p>
          )}
          {importMessage && (
            <p className={importState === "error" ? "ks-error-text" : "ks-success-text"}>{importMessage}</p>
          )}
        </div>

        {saveError && <p className="ks-error-text">Ошибка сохранения: {saveError}</p>}
        {saveState === "saved" && <p className="ks-success-text">Настройки сохранены</p>}
      </div>

      <div className="ks-card-footer">
        <button type="button" className="ks-btn ks-btn-secondary" style={{ flex: 1 }} onClick={() => window.close()}>
          Отмена
        </button>
        <button type="submit" className="ks-btn ks-btn-primary" style={{ flex: 2 }} disabled={saveState === "saving"}>
          {saveState === "saving" ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
