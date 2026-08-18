describe("web push notifications", () => {
  const originalEnv = process.env;
  const originalWarn = console.warn;
  const originalError = console.error;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockWebPush: {
    setVapidDetails: jest.Mock;
    sendNotification: jest.Mock;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockWebPush = {
      setVapidDetails: jest.fn(),
      sendNotification: jest.fn(),
    };
    jest.doMock("web-push", () => ({
      __esModule: true,
      default: mockWebPush,
    }));
    jest.doMock("nanoid", () => ({
      nanoid: jest.fn(() => "subscription-id"),
    }));
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    jest.doMock("@/lib/db/client", () => ({
      db: mockDb,
    }));
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-vapid-key",
      VAPID_PRIVATE_KEY: "private-vapid-key",
    };
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    console.warn = originalWarn;
    console.error = originalError;
  });

  it("creates a subscription when the endpoint does not exist yet", async () => {
    const selectWhere = jest.fn().mockResolvedValue([]);
    const insertValues = jest.fn().mockResolvedValue(undefined);

    mockDb.select.mockReturnValue({
      from: jest.fn(() => ({ where: selectWhere })),
    });
    mockDb.insert.mockReturnValue({
      values: insertValues,
    });

    const { saveSubscription } = await import("../web-push");

    await saveSubscription("user-1", {
      endpoint: "https://example.test/subscription",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });

    expect(insertValues).toHaveBeenCalledWith({
      id: "subscription-id",
      userId: "user-1",
      endpoint: "https://example.test/subscription",
      p256dhKey: "p256dh-key",
      authKey: "auth-key",
    });
  });

  it("updates an existing subscription when the endpoint is already stored", async () => {
    const selectWhere = jest.fn().mockResolvedValue([{ id: "existing-subscription" }]);
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn(() => ({ where: updateWhere }));

    mockDb.select.mockReturnValue({
      from: jest.fn(() => ({ where: selectWhere })),
    });
    mockDb.update.mockReturnValue({
      set: updateSet,
    });

    const { saveSubscription } = await import("../web-push");

    await saveSubscription("user-2", {
      endpoint: "https://example.test/subscription",
      keys: { p256dh: "next-p256dh", auth: "next-auth" },
    });

    expect(updateSet).toHaveBeenCalledWith({
      userId: "user-2",
      p256dhKey: "next-p256dh",
      authKey: "next-auth",
    });
    expect(updateWhere).toHaveBeenCalled();
  });

  it("sends push notifications and removes expired subscriptions", async () => {
    const selectWhere = jest.fn().mockResolvedValue([
      {
        id: "sub-1",
        endpoint: "https://example.test/sub-1",
        p256dhKey: "p256dh-1",
        authKey: "auth-1",
      },
      {
        id: "sub-2",
        endpoint: "https://example.test/sub-2",
        p256dhKey: "p256dh-2",
        authKey: "auth-2",
      },
    ]);
    const deleteWhere = jest.fn().mockResolvedValue(undefined);

    mockDb.select.mockReturnValue({
      from: jest.fn(() => ({ where: selectWhere })),
    });
    mockDb.delete.mockReturnValue({
      where: deleteWhere,
    });
    mockWebPush.sendNotification
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce({ statusCode: 410 });

    const { sendPushToUser } = await import("../web-push");

    await sendPushToUser("user-1", {
      title: "Hermes",
      body: "Nueva notificación",
      url: "/dashboard",
    });

    expect(mockWebPush.sendNotification).toHaveBeenCalledTimes(2);
    expect(mockWebPush.sendNotification).toHaveBeenNthCalledWith(
      1,
      {
        endpoint: "https://example.test/sub-1",
        keys: { p256dh: "p256dh-1", auth: "auth-1" },
      },
      JSON.stringify({
        title: "Hermes",
        body: "Nueva notificación",
        url: "/dashboard",
      }),
    );
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("skips push delivery when vapid keys are not configured", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const { sendPushToUser } = await import("../web-push");

    await expect(
      sendPushToUser("user-1", { title: "Hermes", body: "Nueva notificación" }),
    ).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith("VAPID keys not configured, skipping web push");
    expect(mockWebPush.sendNotification).not.toHaveBeenCalled();
  });

  it("removes a subscription by endpoint", async () => {
    const deleteWhere = jest.fn().mockResolvedValue(undefined);
    mockDb.delete.mockReturnValue({
      where: deleteWhere,
    });

    const { removeSubscription } = await import("../web-push");

    await removeSubscription("https://example.test/subscription");

    expect(deleteWhere).toHaveBeenCalled();
  });
});
