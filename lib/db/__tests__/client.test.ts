const mockExecute = jest.fn().mockResolvedValue(undefined);
const mockCreateClient = jest.fn(() => ({ execute: mockExecute }));
const mockDrizzle = jest.fn(() => ({ mocked: true }));

jest.mock("@libsql/client", () => ({
  createClient: mockCreateClient,
}));

jest.mock("drizzle-orm/libsql", () => ({
  drizzle: mockDrizzle,
}));

describe("lib/db/client", () => {
  beforeEach(() => {
    jest.resetModules();
    mockExecute.mockClear();
    mockCreateClient.mockClear();
    mockDrizzle.mockClear();
    process.env.TURSO_DATABASE_URL = "file:test.db";
    process.env.TURSO_AUTH_TOKEN = "test-token";
  });

  it("enables SQLite foreign key enforcement during client setup", async () => {
    await import("../client");

    expect(mockCreateClient).toHaveBeenCalledWith({
      url: "file:test.db",
      authToken: "test-token",
    });
    expect(mockExecute).toHaveBeenCalledWith("PRAGMA foreign_keys = ON");
  });

  it("does not leave a permanently rejected readiness promise when PRAGMA fails", async () => {
    const pragmaError = new Error("temporary failure");
    mockExecute.mockRejectedValueOnce(pragmaError);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const { foreignKeysReady } = await import("../client");

    await expect(foreignKeysReady).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("Failed to enable SQLite foreign keys:", pragmaError);
    errorSpy.mockRestore();
  });
});
