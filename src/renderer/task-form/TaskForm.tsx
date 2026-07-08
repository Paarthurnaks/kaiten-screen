import { useEffect, useState } from "react";
import type { KaitenOptionDto, PendingCaptureDto, SubmitTaskResultDto } from "../../shared/ipc-contract";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function TaskForm() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingCaptureDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [spacesLoadError, setSpacesLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [spaces, setSpaces] = useState<KaitenOptionDto[]>([]);
  const [boards, setBoards] = useState<KaitenOptionDto[]>([]);
  const [lanes, setLanes] = useState<KaitenOptionDto[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [laneId, setLaneId] = useState("");

  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitTaskResultDto | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [captureResult, spacesResult] = await Promise.allSettled([
        window.kaitenScreen.getPendingCapture(),
        window.kaitenScreen.listSpaces(),
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
      setLanes([]);
      setLaneId("");
      return;
    }
    let cancelled = false;
    window.kaitenScreen.listLanes(boardId).then((list) => {
      if (!cancelled) setLanes(list);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

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

    setSubmitting(true);
    try {
      const taskResult = await window.kaitenScreen.submitTask({
        title,
        description: description.length > 0 ? description : undefined,
        boardId,
        laneId,
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
    return <div style={containerStyle}>Загрузка…</div>;
  }

  if (result) {
    return (
      <div style={containerStyle}>
        <h2>Задача создана</h2>
        {result.attachmentFailed && (
          <p style={{ color: "#b45309" }}>
            Задача создана, но скриншот прикрепить не удалось. Прикрепите его вручную в Kaiten.
          </p>
        )}
        <p>
          <a href={result.taskUrl} target="_blank" rel="noreferrer">
            {result.taskUrl}
          </a>
        </p>
        <button type="button" onClick={() => window.close()}>
          Закрыть
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} style={containerStyle}>
      {loadError && <p style={{ color: "#b91c1c" }}>Не удалось загрузить скриншот: {loadError}</p>}
      {pending && (
        <img src={pending.imageDataUrl} alt="Скриншот" style={{ maxWidth: "100%", border: "1px solid #ccc" }} />
      )}

      <label style={labelStyle}>
        Заголовок*
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>

      <label style={labelStyle}>
        Описание
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>

      {spacesLoadError && (
        <p style={{ color: "#b91c1c" }}>Не удалось загрузить пространства Kaiten: {spacesLoadError}</p>
      )}

      <label style={labelStyle}>
        Пространство
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
        Доска*
        <select value={boardId} onChange={(event) => setBoardId(event.target.value)} disabled={!spaceId}>
          <option value="">—</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Дорожка*
        <select value={laneId} onChange={(event) => setLaneId(event.target.value)} disabled={!boardId}>
          <option value="">—</option>
          {lanes.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.title}
            </option>
          ))}
        </select>
      </label>

      {validationError && <p style={{ color: "#b91c1c" }}>{validationError}</p>}
      {submitError && <p style={{ color: "#b91c1c" }}>Ошибка: {submitError}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={submitting}>
          {submitting ? "Отправка…" : submitError ? "Повторить отправку" : "Создать задачу"}
        </button>
        <button type="button" onClick={() => window.close()}>
          Отмена
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
