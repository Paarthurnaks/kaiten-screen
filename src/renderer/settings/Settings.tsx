import { useEffect, useState } from "react";
import type { KaitenOptionDto, LoadedSettingsDto } from "../../shared/ipc-contract";

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
  const [captureHotkey, setCaptureHotkey] = useState("");
  const [autostart, setAutostart] = useState(false);

  const [spaces, setSpaces] = useState<KaitenOptionDto[]>([]);
  const [boards, setBoards] = useState<KaitenOptionDto[]>([]);
  const [lanes, setLanes] = useState<KaitenOptionDto[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [defaultBoardId, setDefaultBoardId] = useState("");
  const [defaultLaneId, setDefaultLaneId] = useState("");

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  function applyConfig(config: AppConfigShape): void {
    setKaitenDomain(config.kaitenDomain);
    setCaptureHotkey(config.captureHotkey);
    setAutostart(config.autostart);
    setDefaultBoardId(config.defaultBoardId ?? "");
    setDefaultLaneId(config.defaultLaneId ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const loaded = await window.kaitenScreen.loadSettings();
        if (cancelled) return;
        applyConfig(loaded.config);
        setHasApiKey(loaded.hasApiKey);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setLanes([]);
      return;
    }
    let cancelled = false;
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
        defaultBoardId: defaultBoardId || null,
        defaultLaneId: defaultLaneId || null,
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
      // текущее состояние формы перед вызовом listSpaces().
      await persistSettings();
      const spacesList = await window.kaitenScreen.listSpaces();
      setSpaces(spacesList);
      setTestState("success");
    } catch (err) {
      setTestError(errorMessage(err));
      setTestState("error");
    }
  }

  if (loading) {
    return <div style={containerStyle}>Загрузка…</div>;
  }

  return (
    <form onSubmit={(event) => void handleSave(event)} style={containerStyle}>
      <h2>Настройки Kaiten Screen</h2>
      {loadError && <p style={{ color: "#b91c1c" }}>Не удалось загрузить настройки: {loadError}</p>}

      <label style={labelStyle}>
        Домен Kaiten
        <input
          placeholder="mycompany.kaiten.ru"
          value={kaitenDomain}
          onChange={(event) => setKaitenDomain(event.target.value)}
        />
      </label>

      <label style={labelStyle}>
        API-ключ {hasApiKey && apiKeyInput.length === 0 && <span style={{ color: "#6b7280" }}>(сохранён)</span>}
        <input
          type="password"
          placeholder={hasApiKey ? "оставьте пустым, чтобы не менять" : "Введите API-ключ Kaiten"}
          value={apiKeyInput}
          onChange={(event) => setApiKeyInput(event.target.value)}
        />
      </label>

      <div>
        <button type="button" onClick={() => void handleTestConnection()} disabled={testState === "testing"}>
          {testState === "testing" ? "Проверка…" : "Проверить соединение"}
        </button>
        {testState === "success" && (
          <span style={{ color: "#15803d", marginLeft: 8 }}>Найдено пространств: {spaces.length}</span>
        )}
        {testState === "error" && <span style={{ color: "#b91c1c", marginLeft: 8 }}>{testError}</span>}
      </div>

      <label style={labelStyle}>
        Пространство (для выбора доски по умолчанию)
        <select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
          <option value="">—</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.title}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Доска по умолчанию
        <select
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

      <label style={labelStyle}>
        Дорожка по умолчанию
        <select
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

      <label style={labelStyle}>
        Хоткей захвата
        <input
          value={captureHotkey}
          onChange={(event) => setCaptureHotkey(event.target.value)}
          placeholder="CommandOrControl+Shift+K"
        />
      </label>

      <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={autostart} onChange={(event) => setAutostart(event.target.checked)} />
        Запускать при старте системы
      </label>

      {saveError && <p style={{ color: "#b91c1c" }}>Ошибка сохранения: {saveError}</p>}
      {saveState === "saved" && <p style={{ color: "#15803d" }}>Настройки сохранены</p>}

      <div>
        <button type="submit" disabled={saveState === "saving"}>
          {saveState === "saving" ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

const containerStyle: React.CSSProperties = {
  fontFamily: "sans-serif",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
};
