jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock("@/lib/reimbursements/payment-info", () => ({
  getDefaultPaymentInfo: jest.fn(),
}));

import { db } from "@/lib/db/client";
import { getDefaultPaymentInfo } from "@/lib/reimbursements/payment-info";
import {
  getGroupMembersWithTelegram,
  getUserById,
  notifyGroupOfReimbursementRequest,
  notifyReimbursementPaid,
  sendTelegramMessage,
} from "../telegram";

const mockDb = db as jest.Mocked<typeof db>;
const mockGetDefaultPaymentInfo = getDefaultPaymentInfo as jest.MockedFunction<typeof getDefaultPaymentInfo>;

describe("notifications telegram", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
  });

  it("skips telegram delivery when the bot token is missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(sendTelegramMessage("123456", "mensaje")).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith("TELEGRAM_BOT_TOKEN not set, skipping notification");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends telegram messages with html parse mode and custom options", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";

    await sendTelegramMessage("123456", "mensaje", { disable_notification: true });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: "123456",
          text: "mensaje",
          parse_mode: "HTML",
          disable_notification: true,
        }),
      }),
    );
  });

  it("returns the matching user or null when it does not exist", async () => {
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([{ id: "user-1", name: "Ana", telegram_user_id: "tg-1" }]),
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([]),
        })),
      });

    await expect(getUserById("user-1")).resolves.toEqual({
      id: "user-1",
      name: "Ana",
      telegram_user_id: "tg-1",
    });
    await expect(getUserById("missing")).resolves.toBeNull();
  });

  it("filters group members without telegram and excludes the requester", async () => {
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([
            { userId: "user-1", telegramId: "tg-1", name: "Ana" },
            { userId: "user-2", telegramId: null, name: "Beto" },
            { userId: "user-3", telegramId: "tg-3", name: "Carla" },
          ]),
        })),
      })),
    });

    await expect(getGroupMembersWithTelegram("group-1", "user-3")).resolves.toEqual([
      { userId: "user-1", telegramId: "tg-1", name: "Ana" },
    ]);
  });

  it("notifies all other group members about a reimbursement request with payment info", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    (mockDb.select as jest.Mock)
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          where: jest.fn().mockResolvedValue([{ id: "user-1", name: "Ana" }]),
        })),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            where: jest.fn().mockResolvedValue([
              { userId: "user-2", telegramId: "tg-2", name: "Beto" },
              { userId: "user-3", telegramId: "tg-3", name: "Carla" },
            ]),
          })),
        })),
      });
    mockGetDefaultPaymentInfo.mockResolvedValue({
      id: "pi-1",
      userId: "user-1",
      paymentMethod: "alias",
      value: "ANA.PAGO",
      isDefault: true,
    });

    await notifyGroupOfReimbursementRequest("group-1", "user-1", "reimb-1", 12000, "Comida", "Cena del viernes");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(firstBody.chat_id).toBe("tg-2");
    expect(firstBody.text).toContain("Ana gastó <b>$12.000</b>");
    expect(firstBody.text).toContain("📁 Categoría: Comida");
    expect(firstBody.text).toContain("📝 Cena del viernes");
    expect(firstBody.text).toContain("💳 Datos de pago: ALIAS: ANA.PAGO");
  });

  it("notifies the requester when a reimbursement is paid", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    (mockDb.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ id: "user-1", name: "Ana", telegram_user_id: "tg-1" }]),
      })),
    });

    await notifyReimbursementPaid("user-1", "Beto", 4000);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.chat_id).toBe("tg-1");
    expect(body.text).toContain("Beto te ha pagado <b>$4.000</b>");
  });
});
