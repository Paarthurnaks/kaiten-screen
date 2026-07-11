import { useEffect, useState } from "react";
import type { KaitenOptionDto, PendingCaptureDto } from "../../shared/ipc-contract";

const SEARCH_DEBOUNCE_MS = 300;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function AttachTask() {
  const [pending, setPending] = useState<PendingCaptureDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KaitenOptionDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.kaitenScreen
      .getPendingCapture()
      .then((result) => {
        if (!cancelled) setPending(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      window.kaitenScreen
        .searchCards(trimmed)
        .then((list) => {
          if (cancelled) return;
          setResults(list);
          setSearchError(null);
          setSelectedId((current) => (list.some((task) => task.id === current) ? current : (list[0]?.id ?? null)));
        })
        .catch((err: unknown) => {
          if (!cancelled) setSearchError(errorMessage(err));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const selectedTask = results.find((task) => task.id === selectedId) ?? null;

  async function handleAttach(): Promise<void> {
    if (!selectedTask) return;
    setAttaching(true);
    setAttachError(null);
    try {
      await window.kaitenScreen.attachToExistingCard(selectedTask.id);
      setAttached(true);
    } catch (err) {
      setAttachError(errorMessage(err));
    } finally {
      setAttaching(false);
    }
  }

  async function handleBack(): Promise<void> {
    setClosing(true);
    await window.kaitenScreen.backToChoice();
  }

  if (attached) {
    return (
      <div className="ks-card">
        <div className="ks-card-body">
          <div className="ks-card-title">Скриншот прикреплён</div>
          {selectedTask && <p className="ks-muted-text">Прикреплён к задаче «{selectedTask.title}» (#{selectedTask.id})</p>}
          <button type="button" className="ks-btn ks-btn-secondary" onClick={() => window.close()}>
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ks-card">
      <div className="ks-card-header">
        <div className="ks-card-title">Прикрепить к задаче</div>
        <button type="button" className="ks-card-close" onClick={() => void handleBack()} disabled={closing}>
          ✕
        </button>
      </div>

      <div style={{ padding: "16px 20px 0" }}>
        {loadError && <p className="ks-error-text">Не удалось загрузить скриншот: {loadError}</p>}
        <input
          className="ks-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Введите ID или название задачи…"
          style={{ borderColor: "var(--ks-accent-soft-border)" }}
          autoFocus
        />
      </div>

      <div style={{ padding: "14px 20px 4px", fontSize: 12, color: "var(--ks-text-faint)", fontWeight: 600 }}>
        {query.trim().length === 0 ? "Начните вводить название или ID задачи" : `РЕЗУЛЬТАТЫ · ${results.length}`}
      </div>

      <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1 }}>
        {searchError && <p className="ks-error-text" style={{ padding: "0 8px" }}>{searchError}</p>}
        {searching && <p className="ks-muted-text" style={{ padding: "8px 8px" }}>Поиск…</p>}
        {!searching && query.trim().length > 0 && results.length === 0 && !searchError && (
          <p className="ks-muted-text" style={{ padding: "8px 8px" }}>Ничего не найдено</p>
        )}
        {results.map((task) => {
          const isSelected = task.id === selectedTask?.id;
          return (
            <div
              key={task.id}
              onClick={() => setSelectedId(task.id)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
                padding: 12,
                borderRadius: 10,
                cursor: "pointer",
                background: isSelected ? "var(--ks-accent-soft)" : "transparent",
                border: isSelected ? "1.5px solid var(--ks-accent)" : "1px solid transparent",
              }}
            >
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: isSelected ? "var(--ks-text)" : "var(--ks-text-secondary)",
                }}
              >
                {task.title}
              </div>
              <div
                className="ks-chip-mono"
                style={{
                  flexShrink: 0,
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  color: isSelected ? "var(--ks-accent)" : "var(--ks-text-faint)",
                }}
              >
                #{task.id}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <div
          style={{
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderTop: "1px solid var(--ks-border-strong)",
            background: "var(--ks-bg-subtle)",
          }}
        >
          {pending ? (
            <img
              src={pending.imageDataUrl}
              alt="Скриншот"
              style={{ width: 34, height: 26, objectFit: "cover", borderRadius: 5, flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 34, height: 26, borderRadius: 5, background: "var(--ks-bg-chip)", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, fontSize: 12.5, color: "var(--ks-text-muted)" }}>
            screenshot.png будет прикреплён к #{selectedTask.id}
          </div>
        </div>
      )}

      <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          className="ks-btn ks-btn-primary"
          disabled={!selectedTask || attaching}
          onClick={() => void handleAttach()}
        >
          {attaching ? "Прикрепление…" : "Прикрепить скриншот"}
        </button>
        {attachError && <p className="ks-error-text">Ошибка: {attachError}</p>}
      </div>
    </div>
  );
}
