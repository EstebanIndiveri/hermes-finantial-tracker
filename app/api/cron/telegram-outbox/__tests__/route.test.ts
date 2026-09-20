import { GET } from "../route";
import { runTelegramOutboxWorker } from "@/lib/telegram/outbox-worker";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";

jest.mock("@/lib/telegram/outbox-worker", () => ({
  runTelegramOutboxWorker: jest.fn(),
}));
jest.mock("@/lib/telegram/update-inbox", () => ({
  resolveTelegramBotId: jest.fn(),
}));

const workerMock = runTelegramOutboxWorker as jest.MockedFunction<typeof runTelegramOutboxWorker>;
const botIdMock = resolveTelegramBotId as jest.MockedFunction<typeof resolveTelegramBotId>;
const originalEnv = process.env;

function request(authorization = "Bearer cron-secret"): Request {
  return new Request("http://localhost/api/cron/telegram-outbox", {
    headers: { authorization },
  });
}

function readyEnv(): NodeJS.ProcessEnv {
  return {
    ...originalEnv,
    CRON_SECRET: "cron-secret",
    TELEGRAM_BOT_TOKEN: "123456:test-token",
    TELEGRAM_BOT_ID: "bot-1",
    TURSO_DATABASE_URL: "libsql://example.turso.io",
    TURSO_AUTH_TOKEN: "db-token",
    TELEGRAM_INBOX_ENABLED: "true",
    TELEGRAM_OUTBOX_ENABLED: "true",
    TELEGRAM_OUTBOX_WORKER_ENABLED: "true",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = readyEnv();
  botIdMock.mockReturnValue("bot-1");
  workerMock.mockResolvedValue({ claimed: 2, sent: 1, retryable: 1, dead: 0, purged: 3 });
});

afterEach(() => {
  process.env = originalEnv;
});

it("rejects an unauthenticated cron request before checking worker state", async () => {
  process.env = {};

  const response = await GET(request("Bearer wrong"));

  expect(response.status).toBe(401);
  expect(workerMock).not.toHaveBeenCalled();
  expect(botIdMock).not.toHaveBeenCalled();
});

it.each([
  ["inbox flag", "TELEGRAM_INBOX_ENABLED"],
  ["outbox flag", "TELEGRAM_OUTBOX_ENABLED"],
  ["Telegram token", "TELEGRAM_BOT_TOKEN"],
  ["database URL", "TURSO_DATABASE_URL"],
  ["database token", "TURSO_AUTH_TOKEN"],
])("fails closed without %s and never claims", async (_label, key) => {
  const env = readyEnv();
  delete env[key];
  process.env = env;

  const response = await GET(request());

  expect(response.status).toBe(503);
  expect(workerMock).not.toHaveBeenCalled();
  expect(botIdMock).not.toHaveBeenCalled();
});

it("skips a disabled worker without resolving a bot or touching worker code", async () => {
  const env = readyEnv();
  env.TELEGRAM_OUTBOX_WORKER_ENABLED = "false";
  delete env.TURSO_DATABASE_URL;
  delete env.TURSO_AUTH_TOKEN;
  process.env = env;

  const response = await GET(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ ok: true, skipped: true });
  expect(workerMock).not.toHaveBeenCalled();
  expect(botIdMock).not.toHaveBeenCalled();
});

it("runs the worker with the resolved bot and returns counters only", async () => {
  const response = await GET(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    claimed: 2,
    sent: 1,
    retryable: 1,
    dead: 0,
    purged: 3,
  });
  expect(workerMock).toHaveBeenCalledWith({
    botId: "bot-1",
    token: "123456:test-token",
  });
});

it("does not expose internal or provider details on worker failure", async () => {
  workerMock.mockRejectedValueOnce(new Error("secret chat and provider response"));

  const response = await GET(request());
  const body = await response.text();

  expect(response.status).toBe(503);
  expect(body).toBe(JSON.stringify({ error: "Outbox worker failed" }));
  expect(body).not.toContain("secret chat");
});
