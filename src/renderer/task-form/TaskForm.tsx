import { useEffect, useState } from "react";
import { fixWebmDuration } from "../shared/fix-webm-duration";
import { usePendingVideoUrl } from "../shared/use-pending-video-url";
import type {
  KaitenCustomPropertyDto,
  KaitenOptionDto,
  KaitenUserDto,
  PendingCaptureDto,
  SubmitTaskResultDto,
} from "../../shared/ipc-contract";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// "Тип" остаётся декоративным моком — в Kaiten API нет согласованного с пользователем
// эндпоинта для списка типов карточек (см. examples.md и план второго захода). Не
// отправляется в submitTask. "Участники" — реальный список (card-members API).
const MOCK_TASK_TYPES = [
  { id: "bug", label: "Bug" },
  { id: "task", label: "Task" },
  { id: "story", label: "Story" },
];

const AVATAR_PALETTE = [
  { bg: "oklch(0.4 0.05 260)", fg: "oklch(0.9 0.01 260)" },
  { bg: "oklch(0.45 0.06 30)", fg: "oklch(0.9 0.01 30)" },
  { bg: "oklch(0.42 0.06 140)", fg: "oklch(0.9 0.01 140)" },
  { bg: "oklch(0.42 0.07 320)", fg: "oklch(0.9 0.01 320)" },
];

function avatarColors(userId: string): { bg: string; fg: string } {
  const hash = [...userId].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function TaskForm() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingCaptureDto | null>(null);
  const videoUrl = usePendingVideoUrl(pending);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [spacesLoadError, setSpacesLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [spaces, setSpaces] = useState<KaitenOptionDto[]>([]);
  const [boards, setBoards] = useState<KaitenOptionDto[]>([]);
  const [columns, setColumns] = useState<KaitenOptionDto[]>([]);
  const [lanes, setLanes] = useState<KaitenOptionDto[]>([]);
  const [users, setUsers] = useState<KaitenUserDto[]>([]);
  const [customProperties, setCustomProperties] = useState<KaitenCustomPropertyDto[]>([]);

  const [spaceId, setSpaceId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [columnId, setColumnId] = useState("");
  const [laneId, setLaneId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [taskType, setTaskType] = useState("bug");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  // Значения кастомных полей: id_<propertyId> -> id варианта (строка) или массив id (multiSelect).
  const [propertyValues, setPropertyValues] = useState<Record<string, string | string[]>>({});

  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitTaskResultDto | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [captureResult, spacesResult, usersResult, propertiesResult, settingsResult] = await Promise.allSettled([
        window.kaitenScreen.getPendingCapture(),
        window.kaitenScreen.listSpaces(),
        window.kaitenScreen.listUsers(),
        window.kaitenScreen.listCustomProperties(),
        window.kaitenScreen.loadSettings(),
      ]);
      if (cancelled) return;

      if (captureResult.status === "fulfilled") {
        setPending(captureResult.value);
      } else {
        setLoadError(errorMessage(captureResult.reason));
      }

      if (spacesResult.status === "fulfilled") {
        setSpaces(spacesResult.value);
      } else {
        setSpacesLoadError(errorMessage(spacesResult.reason));
      }

      if (usersResult.status === "fulfilled") setUsers(usersResult.value);
      if (propertiesResult.status === "fulfilled") setCustomProperties(propertiesResult.value);

      if (settingsResult.status === "fulfilled") {
        const { config } = settingsResult.value;
        if (config.defaultSpaceId) setSpaceId(config.defaultSpaceId);
        if (config.defaultBoardId) setBoardId(config.defaultBoardId);
        if (config.defaultColumnId) setColumnId(config.defaultColumnId);
        if (config.defaultLaneId) setLaneId(config.defaultLaneId);
        if (config.defaultResponsibleId) setResponsibleId(config.defaultResponsibleId);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!spaceId) {
      setBoards([]);
      setBoardId("");
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
    if (!boardId) {
      setColumns([]);
      setColumnId("");
      setLanes([]);
      setLaneId("");
      return;
    }
    let cancelled = false;
    window.kaitenScreen.listColumns(boardId).then((list) => {
      if (!cancelled) setColumns(list);
    });
    window.kaitenScreen.listLanes(boardId).then((list) => {
      if (!cancelled) setLanes(list);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  function togglePropertyValue(property: KaitenCustomPropertyDto, valueId: string): void {
    setPropertyValues((current) => {
      const key = `id_${property.id}`;
      if (property.multiSelect) {
        const currentList = Array.isArray(current[key]) ? (current[key] as string[]) : [];
        const nextList = currentList.includes(valueId)
          ? currentList.filter((id) => id !== valueId)
          : [...currentList, valueId];
        return { ...current, [key]: nextList };
      }
      return { ...current, [key]: current[key] === valueId ? "" : valueId };
    });
  }

  function isPropertyValueActive(property: KaitenCustomPropertyDto, valueId: string): boolean {
    const value = propertyValues[`id_${property.id}`];
    return Array.isArray(value) ? value.includes(valueId) : value === valueId;
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    if (title.trim().length === 0) {
      setValidationError("Заголовок обязателен");
      return;
    }
    if (!boardId || !laneId) {
      setValidationError("Выберите доску и дорожку");
      return;
    }

    const properties = Object.fromEntries(
      Object.entries(propertyValues).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value)),
    );

    setSubmitting(true);
    try {
      const taskResult = await window.kaitenScreen.submitTask({
        title,
        description: description.length > 0 ? description : undefined,
        boardId,
        laneId,
        columnId: columnId || undefined,
        responsibleId: responsibleId || undefined,
        spaceId: spaceId || undefined,
        properties: Object.keys(properties).length > 0 ? properties : undefined,
        participantIds: participantIds.length > 0 ? participantIds : undefined,
      });
      setResult(taskResult);
    } catch (err) {
      // Данные формы и скриншот (pending) намеренно не сбрасываются — пользователь
      // может нажать "Повторить отправку" тем же submit-button без потери ввода.
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
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

  if (result) {
    return (
      <div className="ks-card">
        <div className="ks-card-body">
          <div className="ks-card-title">Задача создана</div>
          {result.attachmentFailed && (
            <p style={{ color: "var(--ks-warning-text)", fontSize: 13 }}>
              Задача создана, но скриншот прикрепить не удалось. Прикрепите его вручную в Kaiten.
            </p>
          )}
          {result.membersFailed && (
            <p style={{ color: "var(--ks-warning-text)", fontSize: 13 }}>
              Задача создана, но добавить хотя бы одного участника не удалось. Добавьте вручную в Kaiten.
            </p>
          )}
          <p style={{ fontSize: 13 }}>
            <a href={result.taskUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ks-accent)" }}>
              {result.taskUrl}
            </a>
          </p>
          <button type="button" className="ks-btn ks-btn-secondary" onClick={() => window.close()}>
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="ks-card">
      <div className="ks-card-header">
        <div className="ks-card-title">Новая задача</div>
        <button type="button" className="ks-card-close" onClick={() => void window.kaitenScreen.backToChoice()}>
          ✕
        </button>
      </div>

      <div className="ks-card-body">
        {loadError && <p className="ks-error-text">Не удалось загрузить скриншот: {loadError}</p>}
        {pending && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: 10,
              borderRadius: 10,
              background: "var(--ks-bg-subtle)",
              border: "1px solid var(--ks-border)",
            }}
          >
            {pending.kind === "video" ? (
              videoUrl && (
                <video
                  src={videoUrl}
                  muted
                  onLoadedMetadata={(event) => fixWebmDuration(event.currentTarget)}
                  style={{ width: 56, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              )
            ) : (
              <img
                src={pending.imageDataUrl}
                alt="Скриншот"
                style={{ width: 56, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, fontSize: 13, color: "var(--ks-text-secondary)" }}>
              {pending.kind === "video" ? "recording.webm" : "screenshot.png"}{" "}
              <span style={{ color: "var(--ks-text-faint)" }}>
                · {pending.region.width}×{pending.region.height}
              </span>
            </div>
          </div>
        )}

        <label className="ks-field">
          <span className="ks-label">Заголовок*</span>
          <input className="ks-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        {spacesLoadError && (
          <p className="ks-error-text">Не удалось загрузить пространства Kaiten: {spacesLoadError}</p>
        )}

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
            <span className="ks-label">Доска*</span>
            <select
              className="ks-select"
              value={boardId}
              onChange={(event) => setBoardId(event.target.value)}
              disabled={!spaceId}
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
              value={columnId}
              onChange={(event) => setColumnId(event.target.value)}
              disabled={!boardId}
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
            <span className="ks-label">Дорожка*</span>
            <select
              className="ks-select"
              value={laneId}
              onChange={(event) => setLaneId(event.target.value)}
              disabled={!boardId}
            >
              <option value="">—</option>
              {lanes.map((lane) => (
                <option key={lane.id} value={lane.id}>
                  {lane.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ks-field-grid">
          <label className="ks-field">
            <span className="ks-label">Ответственный</span>
            <select
              className="ks-select"
              value={responsibleId}
              onChange={(event) => setResponsibleId(event.target.value)}
            >
              <option value="">—</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="ks-field">
            <span className="ks-label">Тип</span>
            <select className="ks-select" value={taskType} onChange={(event) => setTaskType(event.target.value)}>
              {MOCK_TASK_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {customProperties.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingTop: 4,
              borderTop: "1px solid var(--ks-border)",
            }}
          >
            <div className="ks-section-title" style={{ paddingTop: 10 }}>
              Пользовательские поля
            </div>
            {customProperties.map((property) => (
              <div key={property.id} className="ks-field">
                <span style={{ fontSize: 12, color: "var(--ks-text-secondary)" }}>{property.name}</span>
                <div className="ks-pill-row">
                  {property.values.map((value) => (
                    <span
                      key={value.id}
                      className={`ks-pill${isPropertyValueActive(property, value.id) ? " ks-pill-active" : ""}`}
                      onClick={() => togglePropertyValue(property, value.id)}
                    >
                      {value.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <label className="ks-field">
          <span className="ks-label">Описание</span>
          <textarea className="ks-textarea" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>

        <div className="ks-field">
          <span className="ks-label">Участники</span>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0 4px" }}>
            {participantIds.map((id) => {
              const user = users.find((candidate) => candidate.id === id);
              if (!user) return null;
              const colors = avatarColors(id);
              return (
                <div
                  key={id}
                  className="ks-avatar"
                  role="button"
                  title={`${user.fullName} — нажмите, чтобы убрать`}
                  style={{ background: colors.bg, color: colors.fg, cursor: "pointer" }}
                  onClick={() => setParticipantIds((current) => current.filter((pid) => pid !== id))}
                >
                  {initials(user.fullName)}
                </div>
              );
            })}
            {users.filter((user) => !participantIds.includes(user.id)).length > 0 && (
              <select
                className="ks-select"
                style={{ width: "auto", marginLeft: participantIds.length > 0 ? 6 : 0 }}
                value=""
                onChange={(event) => {
                  if (event.target.value) setParticipantIds((current) => [...current, event.target.value]);
                }}
              >
                <option value="">+ Добавить участника</option>
                {users
                  .filter((user) => !participantIds.includes(user.id))
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>

        {validationError && <p className="ks-error-text">{validationError}</p>}
        {submitError && <p className="ks-error-text">Ошибка: {submitError}</p>}
      </div>

      <div className="ks-card-footer">
        <button
          type="button"
          className="ks-btn ks-btn-secondary"
          style={{ flex: 1 }}
          onClick={() => void window.kaitenScreen.backToChoice()}
        >
          Отмена
        </button>
        <button type="submit" className="ks-btn ks-btn-primary" style={{ flex: 2 }} disabled={submitting}>
          {submitting ? "Отправка…" : submitError ? "Повторить отправку" : "Создать задачу"}
        </button>
      </div>
    </form>
  );
}
