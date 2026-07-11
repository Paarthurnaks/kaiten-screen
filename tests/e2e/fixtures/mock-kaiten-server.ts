import { createServer, type Server } from "node:http";

export interface MockKaitenServer {
  url: string;
  requests: Array<{ method: string; url: string }>;
  close: () => Promise<void>;
}

const SPACE = { id: 1, title: "Test Space" };
const BOARD = { id: 10, title: "Test Board" };
const COLUMN = { id: 1000, title: "Test Column" };
const LANE = { id: 100, title: "Test Lane" };
const USER = { id: 7, full_name: "Test User" };
const CUSTOM_PROPERTY = {
  id: 1,
  name: "Окружение",
  type: "select",
  multi_select: false,
  show_on_facade: true,
  condition: "active",
  selectValues: [{ id: 11, value: "DEV", condition: "active" }],
};
const CREATED_TASK = { id: 42, url: "http://kaiten.e2e.local/cards/42" };

export interface MockKaitenServerOptions {
  /** Сколько первых запросов на создание карточки нужно провалить с 500 (для теста ретрая). */
  failFirstCreateTaskAttempts?: number;
}

/** Минимальный HTTP-сервер, имитирующий Kaiten API для e2e-теста ключевого сценария. */
export function startMockKaitenServer(options: MockKaitenServerOptions = {}): Promise<MockKaitenServer> {
  const requests: Array<{ method: string; url: string }> = [];
  let createTaskAttempts = 0;
  const failFirstCreateTaskAttempts = options.failFirstCreateTaskAttempts ?? 0;

  const server: Server = createServer((req, res) => {
    requests.push({ method: req.method ?? "", url: req.url ?? "" });

    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "POST" && req.url === "/api/latest/cards") {
      createTaskAttempts += 1;
      if (createTaskAttempts <= failFirstCreateTaskAttempts) {
        send(500, { message: "mock server: simulated failure" });
        return;
      }
      send(200, CREATED_TASK);
      return;
    }
    if (req.method === "GET" && /^\/api\/latest\/cards(\?|$)/.test(req.url ?? "")) {
      send(200, [{ id: 66730627, title: "Пример найденной задачи" }]);
      return;
    }
    if (req.method === "PUT" && /^\/api\/latest\/cards\/.+\/files$/.test(req.url ?? "")) {
      // Тело — multipart/form-data со скриншотом; для мока достаточно подтвердить приём.
      req.resume();
      req.on("end", () => send(200, {}));
      return;
    }
    if (req.method === "POST" && /^\/api\/latest\/cards\/.+\/members$/.test(req.url ?? "")) {
      req.resume();
      req.on("end", () => send(200, { id: USER.id, full_name: USER.full_name }));
      return;
    }
    if (req.method === "GET" && req.url === "/api/latest/spaces") {
      send(200, [SPACE]);
      return;
    }
    if (req.method === "GET" && /^\/api\/latest\/spaces\/.+\/boards$/.test(req.url ?? "")) {
      send(200, [BOARD]);
      return;
    }
    if (req.method === "GET" && /^\/api\/latest\/boards\/.+\/columns$/.test(req.url ?? "")) {
      send(200, [COLUMN]);
      return;
    }
    if (req.method === "GET" && /^\/api\/latest\/boards\/.+\/lanes$/.test(req.url ?? "")) {
      send(200, [LANE]);
      return;
    }
    if (req.method === "GET" && /^\/api\/latest\/users(\?|$)/.test(req.url ?? "")) {
      send(200, [USER]);
      return;
    }
    if (req.method === "GET" && /^\/api\/latest\/company\/custom-properties(\?|$)/.test(req.url ?? "")) {
      send(200, [CUSTOM_PROPERTY]);
      return;
    }

    send(404, { message: "not found in mock server" });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
