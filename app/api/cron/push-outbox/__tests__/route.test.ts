import { GET } from "../route";
import { processPushOutbox } from "@/lib/notifications/push-outbox-worker";

jest.mock("@/lib/notifications/push-outbox-worker", () => ({
  processPushOutbox: jest.fn(),
}));

const worker = processPushOutbox as jest.MockedFunction<typeof processPushOutbox>;
const originalEnv = process.env;

function request(secret = "push-secret"): Request {
  return new Request("http://localhost/api/cron/push-outbox", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    PUSH_OUTBOX_SCHEDULER_SECRET: "push-secret",
    WEB_PUSH_ENABLED: "true",
    NOTIFICATIONS_ENABLED: "false",
    TURSO_DATABASE_URL: "libsql://example.turso.io",
    TURSO_AUTH_TOKEN: "db-token",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
    VAPID_PRIVATE_KEY: "private-key",
    WEB_PUSH_CANARY_GROUP_ID: "group-beta",
    WEB_PUSH_CANARY_USER_IDS: "user-a,user-b",
  };
  worker.mockResolvedValue({ claimed: 1, sent: 1, retried: 0, dead: 0, lostLease: 0, swept: 0, purged: 0, skipped: false, budgetExhausted: false });
});

afterEach(() => { process.env = originalEnv; });

it("rejects unauthorized requests without loading the worker", async () => {
  expect((await GET(request("wrong"))).status).toBe(401);
  expect(worker).not.toHaveBeenCalled();
});

it.each([
  ["Web Push", "WEB_PUSH_ENABLED", "false"],
])("skips when %s is disabled", async (_label, key, value) => {
  process.env[key] = value;
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("X-Hermes-Outbox-Execution")).toBe("skipped_worker_disabled");
  expect(response.headers.get("X-Hermes-Outbox-Counts")).toBeNull();
  await expect(response.json()).resolves.toEqual({ ok: true, skipped: true });
  expect(worker).not.toHaveBeenCalled();
});

it.each(["true", "off"]) ("rejects broad notifications mode %s", async (value) => {
  process.env.NOTIFICATIONS_ENABLED = value;
  expect((await GET(request())).status).toBe(503);
  expect(worker).not.toHaveBeenCalled();
});

it.each(["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"])(
  "fails closed when %s is missing", async (key) => {
    delete process.env[key];
    expect((await GET(request())).status).toBe(503);
    expect(worker).not.toHaveBeenCalled();
  },
);

it.each(["WEB_PUSH_CANARY_GROUP_ID", "WEB_PUSH_CANARY_USER_IDS"])(
  "fails closed when %s is missing",
  async (key) => {
    delete process.env[key];
    expect((await GET(request())).status).toBe(503);
    expect(worker).not.toHaveBeenCalled();
  },
);

it("runs bounded recovery and returns counters only", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("X-Hermes-Outbox-Execution")).toBe("processed");
  expect(response.headers.get("X-Hermes-Outbox-Counts")).toBe("1,1,0,0,0");
  await expect(response.json()).resolves.toEqual({ ok: true, claimed: 1, sent: 1, retried: 0, dead: 0, lostLease: 0, swept: 0, purged: 0, skipped: false, budgetExhausted: false });
  expect(worker).toHaveBeenCalledWith({ maxClaims: 25, maxRuntimeMs: 10_000 });
});
