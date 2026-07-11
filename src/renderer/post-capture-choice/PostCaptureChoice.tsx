import { useEffect, useState } from "react";
import type { PendingCaptureDto } from "../../shared/ipc-contract";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function PostCaptureChoice() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingCaptureDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.kaitenScreen
      .getPendingCapture()
      .then((result) => {
        if (!cancelled) setPending(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateTask(): Promise<void> {
    setBusy(true);
    await window.kaitenScreen.chooseCreateTask();
  }

  async function handleAttachExisting(): Promise<void> {
    setBusy(true);
    await window.kaitenScreen.chooseAttachExisting();
  }

  async function handleCancel(): Promise<void> {
    setBusy(true);
    await window.kaitenScreen.cancelPendingCapture();
  }

  return (
    <div className="ks-card">
      <div className="ks-card-body" style={{ paddingTop: 20 }}>
        {loading && <p className="ks-muted-text">Загрузка…</p>}
        {loadError && <p className="ks-error-text">Не удалось загрузить скриншот: {loadError}</p>}

        {pending && (
          <div
            style={{
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid var(--ks-border)",
              background: "var(--ks-bg-subtle)",
            }}
          >
            <img src={pending.imageDataUrl} alt="Скриншот" style={{ display: "block", width: "100%" }} />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="ks-card-title">Скриншот готов</div>
          {pending && (
            <div className="ks-chip-mono">
              {pending.region.width}×{pending.region.height}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ActionButton
            icon="＋"
            title="Создать новую задачу"
            subtitle="Заполнить карточку с нуля"
            primary
            disabled={busy || loading}
            onClick={() => void handleCreateTask()}
          />
          <ActionButton
            icon="📎"
            title="Прикрепить к существующей"
            subtitle="Найти задачу по ID или названию"
            disabled={busy || loading}
            onClick={() => void handleAttachExisting()}
          />
          <button
            type="button"
            className="ks-btn ks-btn-ghost"
            disabled={busy}
            onClick={() => void handleCancel()}
            style={{ textAlign: "center" }}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  title,
  subtitle,
  primary,
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 10,
        border: primary ? "none" : "1px solid var(--ks-border-strong)",
        background: primary ? "var(--ks-accent)" : "var(--ks-bg-subtle)",
        color: primary ? "var(--ks-accent-contrast)" : "var(--ks-text)",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "var(--font-sans)",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
        <span style={{ fontSize: 12.5, opacity: primary ? 0.75 : undefined, color: primary ? undefined : "var(--ks-text-muted)" }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}
