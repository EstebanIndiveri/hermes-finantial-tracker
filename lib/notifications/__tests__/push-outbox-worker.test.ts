const claim = jest.fn();
const markSent = jest.fn();
const markRetryable = jest.fn();
const markDead = jest.fn();
const sweep = jest.fn();
const purge = jest.fn();
const sendNotification = jest.fn();
const setVapidDetails = jest.fn();
const dbSelect = jest.fn();
const dbDelete = jest.fn();

jest.mock("web-push", () => ({ __esModule: true, default: { sendNotification, setVapidDetails } }));
jest.mock("@/lib/db/client", () => ({ db: { select: dbSelect, delete: dbDelete } }));
jest.mock("@/lib/notifications/push-outbox", () => ({
  claimPushDelivery: (...args: unknown[]) => claim(...args),
  markPushDeliverySent: (...args: unknown[]) => markSent(...args),
  markPushDeliveryRetryable: (...args: unknown[]) => markRetryable(...args),
  markPushDeliveryDead: (...args: unknown[]) => markDead(...args),
  sweepExpiredPushDeliveries: (...args: unknown[]) => sweep(...args),
  purgeExpiredPushDeliveries: (...args: unknown[]) => purge(...args),
}));

function query(result: unknown) {
  return { from: jest.fn(() => ({ innerJoin: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue(result) })) })), where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue(result) })) })) };
}

describe("push outbox worker", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NOTIFICATIONS_ENABLED: "false",
      WEB_PUSH_ENABLED: "true",
      WEB_PUSH_CANARY_GROUP_ID: "g",
      WEB_PUSH_CANARY_USER_IDS: "payer,owner",
    };
    claim.mockResolvedValue(null);
    markSent.mockResolvedValue(true);
    markRetryable.mockResolvedValue(true);
    markDead.mockResolvedValue(true);
    sweep.mockResolvedValue(0);
    purge.mockResolvedValue(0);
    sendNotification.mockResolvedValue(undefined);
  });

  afterAll(() => { process.env = originalEnv; });

  it("does not claim or call the provider while Web Push is disabled", async () => {
    process.env.WEB_PUSH_ENABLED = "false";
    const { processPushOutbox } = await import("../push-outbox-worker");
    await processPushOutbox();
    expect(claim).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not claim if broad notifications are enabled on the isolated canary", async () => {
    process.env.NOTIFICATIONS_ENABLED = "true";
    const { processPushOutbox } = await import("../push-outbox-worker");
    expect((await processPushOutbox()).skipped).toBe(true);
    expect(claim).not.toHaveBeenCalled();
  });

  it("fences an unauthorized or stale reimbursement without sending", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    claim.mockResolvedValue({ id: "d1", reimbursementId: "r1", operationId: "op", eventType: "reimbursement.requested", userId: "payer", subscriptionId: "s1", attemptCount: 1, leaseToken: "lease" });
    dbSelect
      .mockImplementationOnce(() => query([{ status: "cancelled", requesterId: "owner", payerId: "payer", groupId: "g", transactionStatus: "active", deletedAt: null }]));
    const { processPushOutbox } = await import("../push-outbox-worker");
    const result = await processPushOutbox({ maxClaims: 1 });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(markDead).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "ineligible", leaseToken: "lease" }));
    expect(result.dead).toBe(1);
  });

  it.each([
    ["wrong group", { groupId: "other-group", payerId: "payer" }],
    ["wrong user", { groupId: "g", payerId: "outsider" }],
  ] as const)("fences a canary %s before provider delivery", async (_label, scope) => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    claim.mockResolvedValue({ id: "d1", reimbursementId: "r1", operationId: "op", eventType: "reimbursement.requested", userId: scope.payerId, subscriptionId: "s1", attemptCount: 1, leaseToken: "lease" });
    dbSelect.mockImplementationOnce(() => query([{ status: "pending", requesterId: "owner", payerId: scope.payerId, groupId: scope.groupId, transactionStatus: "active", deletedAt: null }]));

    const { processPushOutbox } = await import("../push-outbox-worker");
    const result = await processPushOutbox({ maxClaims: 1 });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(markDead).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "ineligible", leaseToken: "lease" }));
    expect(result.dead).toBe(1);
  });

  it("does not claim when the enabled canary scope is missing", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    delete process.env.WEB_PUSH_CANARY_GROUP_ID;

    const { processPushOutbox } = await import("../push-outbox-worker");
    const result = await processPushOutbox();
    expect(result.skipped).toBe(true);
    expect(claim).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not report delivery after a newer worker fences the lease", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    claim.mockResolvedValue({ id: "d1", reimbursementId: "r1", operationId: "op", eventType: "reimbursement.requested", userId: "payer", subscriptionId: "s1", attemptCount: 1, leaseToken: "lease" });
    dbSelect
      .mockImplementationOnce(() => query([{ status: "pending", requesterId: "owner", payerId: "payer", groupId: "g", transactionStatus: "active", deletedAt: null }]))
      .mockImplementationOnce(() => query([{ userId: "payer" }]))
      .mockImplementationOnce(() => query([{ endpoint: "https://push", p256dhKey: "p", authKey: "a" }]));
    markSent.mockResolvedValue(false);
    const { processPushOutbox } = await import("../push-outbox-worker");
    const result = await processPushOutbox({ maxClaims: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(0);
    expect(result.lostLease).toBe(1);
  });

  it("retries provider throttling without marking the intent sent", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    claim.mockResolvedValue({ id: "d1", reimbursementId: "r1", operationId: "op", eventType: "reimbursement.requested", userId: "payer", subscriptionId: "s1", attemptCount: 1, leaseToken: "lease" });
    dbSelect
      .mockImplementationOnce(() => query([{ status: "pending", requesterId: "owner", payerId: "payer", groupId: "g", transactionStatus: "active", deletedAt: null }]))
      .mockImplementationOnce(() => query([{ userId: "payer" }]))
      .mockImplementationOnce(() => query([{ endpoint: "https://push", p256dhKey: "p", authKey: "a" }]));
    sendNotification.mockRejectedValue({ statusCode: 429 });
    const { processPushOutbox } = await import("../push-outbox-worker");
    const result = await processPushOutbox({ maxClaims: 1, now: () => 100_000 });
    expect(markRetryable).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "provider_rate_limited", httpStatus: 429 }));
    expect(result.retried).toBe(1);
  });

  it("does not deliver when the subscription was reassigned", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    claim.mockResolvedValue({ id: "d1", reimbursementId: "r1", operationId: "op", eventType: "reimbursement.requested", userId: "payer", subscriptionId: "s1", attemptCount: 1, leaseToken: "lease" });
    dbSelect
      .mockImplementationOnce(() => query([{ status: "pending", requesterId: "owner", payerId: "payer", groupId: "g", transactionStatus: "active", deletedAt: null }]))
      .mockImplementationOnce(() => query([{ userId: "payer" }]))
      .mockImplementationOnce(() => query([]));
    const { processPushOutbox } = await import("../push-outbox-worker");
    const result = await processPushOutbox({ maxClaims: 1 });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(markDead).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "ineligible" }));
    expect(result.dead).toBe(1);
  });

  it("validates numeric bounds and fences exhausted attempts", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    const { processPushOutbox } = await import("../push-outbox-worker");
    await expect(processPushOutbox({ maxClaims: Number.NaN })).rejects.toThrow("maxClaims");
    claim.mockResolvedValue({ id: "d1", attemptCount: 9, leaseToken: "lease" });
    const result = await processPushOutbox({ maxClaims: 1 });
    expect(markDead).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "attempts_exhausted" }));
    expect(result.dead).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not start purge or claims after sweep consumes the runtime budget", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    let elapsed = 0;
    sweep.mockImplementationOnce(async () => { elapsed = 150; return 1; });
    const { processPushOutbox } = await import("../push-outbox-worker");

    const result = await processPushOutbox({
      maxRuntimeMs: 100,
      now: () => 1_000,
      monotonicNow: () => elapsed,
    });

    expect(result).toEqual(expect.objectContaining({ swept: 1, purged: 0, claimed: 0, budgetExhausted: true }));
    expect(purge).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("does not start claims after purge consumes the runtime budget", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    let elapsed = 0;
    purge.mockImplementationOnce(async () => { elapsed = 150; return 1; });
    const { processPushOutbox } = await import("../push-outbox-worker");

    const result = await processPushOutbox({
      maxRuntimeMs: 100,
      now: () => 1_000,
      monotonicNow: () => elapsed,
    });

    expect(result).toEqual(expect.objectContaining({ swept: 0, purged: 1, claimed: 0, budgetExhausted: true }));
    expect(sweep).toHaveBeenCalledWith({ now: 1_000, limit: 100 });
    expect(purge).toHaveBeenCalledWith({ now: 1_000, limit: 100 });
    expect(claim).not.toHaveBeenCalled();
  });

  it("reports budget exhaustion when the final provider call exceeds the deadline", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    let elapsed = 0;
    claim.mockResolvedValueOnce({ id: "d1", reimbursementId: "r1", eventType: "reimbursement.requested", userId: "payer", subscriptionId: "s1", attemptCount: 1, leaseToken: "lease" });
    dbSelect
      .mockImplementationOnce(() => query([{ status: "pending", requesterId: "owner", payerId: "payer", groupId: "g", transactionStatus: "active", deletedAt: null }]))
      .mockImplementationOnce(() => query([{ userId: "payer" }]))
      .mockImplementationOnce(() => query([{ endpoint: "https://push", p256dhKey: "p", authKey: "a" }]));
    sendNotification.mockImplementationOnce(async () => { elapsed = 150; });
    const { processPushOutbox } = await import("../push-outbox-worker");

    const result = await processPushOutbox({ maxClaims: 1, maxRuntimeMs: 100, now: () => 1_000, monotonicNow: () => elapsed });

    expect(result).toEqual(expect.objectContaining({ claimed: 1, sent: 1, budgetExhausted: true }));
    expect(claim).toHaveBeenCalledTimes(1);
  });
});
