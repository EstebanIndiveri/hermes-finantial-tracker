import { NextRequest } from "next/server";
import { POST } from "../route";
import { db } from "@/lib/db/client";
import { handleTelegramMessage } from "@/lib/telegram/handlers";
import { handlePersonalCallback } from "@/lib/telegram/personal-callback-handler";
import { transcribeVoiceMessage } from "@/lib/telegram/voice";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import { handleSplitCallback, handleSplitGroupMessage } from "@/lib/telegram/splits/handler";
import {
  sendTelegramMessage as sendSplitMessage,
  answerCallbackQuery,
  editTelegramMessage,
} from "@/lib/telegram/splits/telegram-api";
import {
  sendTelegramMessage as sendPersonalMessage,
  editTelegramPersonalMessage,
} from "@/lib/telegram/send-message";
import {
  claimTelegramUpdate,
  completeTelegramUpdate,
  failTelegramUpdate,
  resolveTelegramBotId,
} from "@/lib/telegram/update-inbox";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
      bot_messages: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
  },
}));
jest.mock("@/lib/telegram/handlers", () => ({ handleTelegramMessage: jest.fn() }));
jest.mock("@/lib/telegram/personal-callback-handler", () => ({ handlePersonalCallback: jest.fn() }));
jest.mock("@/lib/telegram/voice", () => ({ transcribeVoiceMessage: jest.fn() }));
jest.mock("@/lib/telegram/authorized-group-context", () => ({ resolveAuthorizedTelegramGroup: jest.fn() }));
jest.mock("@/lib/telegram/send-message", () => ({
  sendTelegramMessage: jest.fn().mockResolvedValue(undefined),
  editTelegramPersonalMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/telegram/splits/telegram-api", () => ({
  answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
  sendTelegramMessage: jest.fn().mockResolvedValue(undefined),
  editTelegramMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/telegram/splits/handler", () => ({
  handleSplitGroupMessage: jest.fn(),
  handleSplitCallback: jest.fn(),
}));
jest.mock("@/lib/telegram/update-inbox", () => ({
  claimTelegramUpdate: jest.fn(),
  completeTelegramUpdate: jest.fn().mockResolvedValue(true),
  failTelegramUpdate: jest.fn().mockResolvedValue(true),
  resolveTelegramBotId: jest.fn().mockReturnValue("test-bot"),
}));

const mockDb = db as jest.Mocked<typeof db>;
const originalInboxFlag = process.env.TELEGRAM_INBOX_ENABLED;

afterAll(() => {
  if (originalInboxFlag === undefined) delete process.env.TELEGRAM_INBOX_ENABLED;
  else process.env.TELEGRAM_INBOX_ENABLED = originalInboxFlag;
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "test-secret",
    },
    body: JSON.stringify(body),
  });
}

describe("Telegram webhook authorized personal context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_SECRET_TOKEN = "test-secret";
    delete process.env.TELEGRAM_INBOX_ENABLED;
    const botMessageInsert = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    };
    (mockDb.insert as jest.Mock).mockReturnValue(botMessageInsert);
    (sendPersonalMessage as jest.Mock).mockResolvedValue(undefined);
    (editTelegramPersonalMessage as jest.Mock).mockResolvedValue(undefined);
    (sendSplitMessage as jest.Mock).mockResolvedValue(undefined);
    (editTelegramMessage as jest.Mock).mockResolvedValue(undefined);
    (answerCallbackQuery as jest.Mock).mockResolvedValue(undefined);
    (handleTelegramMessage as jest.Mock).mockResolvedValue({ text: "Respuesta de prueba" });
    (handlePersonalCallback as jest.Mock).mockResolvedValue({ text: "Respuesta de prueba", edit: false });
    (handleSplitGroupMessage as jest.Mock).mockResolvedValue(null);
    (handleSplitCallback as jest.Mock).mockResolvedValue(null);
    (transcribeVoiceMessage as jest.Mock).mockResolvedValue(null);
    (resolveAuthorizedTelegramGroup as jest.Mock).mockResolvedValue(null);
    (mockDb.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "user-1",
      active_telegram_group_id: "group-removed",
    });
    (mockDb.query.bot_messages.findFirst as jest.Mock).mockResolvedValue(null);
    (claimTelegramUpdate as jest.Mock).mockResolvedValue({ kind: "acquired", leaseToken: "lease-1" });
    (completeTelegramUpdate as jest.Mock).mockResolvedValue(true);
    (failTelegramUpdate as jest.Mock).mockResolvedValue(true);
    (resolveTelegramBotId as jest.Mock).mockReturnValue("test-bot");
  });

  it("blocks text before the financial handler when membership was removed", async () => {
    await POST(request({ update_id: 1, message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" } }));
    expect(resolveAuthorizedTelegramGroup).toHaveBeenCalledWith("user-1", "group-removed");
    expect(handleTelegramMessage).not.toHaveBeenCalled();
  });

  it("blocks voice before the financial handler when membership was removed", async () => {
    await POST(request({ update_id: 2, message: { chat: { id: 10, type: "private" }, from: { id: 20 }, voice: { file_id: "voice-1" } } }));
    expect(resolveAuthorizedTelegramGroup).toHaveBeenCalledWith("user-1", "group-removed");
    expect(transcribeVoiceMessage).not.toHaveBeenCalled();
    expect(handleTelegramMessage).not.toHaveBeenCalled();
  });

  it("processes voice after the user and group are authorized", async () => {
    (resolveAuthorizedTelegramGroup as jest.Mock).mockResolvedValue("group-1");
    (transcribeVoiceMessage as jest.Mock).mockResolvedValue("/resumen");
    (handleTelegramMessage as jest.Mock).mockResolvedValue({ text: "Resumen" });

    await POST(request({ update_id: 3, message: { chat: { id: 10, type: "private" }, from: { id: 20 }, voice: { file_id: "voice-1" } } }));

    expect(resolveAuthorizedTelegramGroup).toHaveBeenCalledWith("user-1", "group-removed");
    expect(transcribeVoiceMessage).toHaveBeenCalledWith("voice-1");
    expect(handleTelegramMessage).toHaveBeenCalledWith(expect.objectContaining({ message: expect.objectContaining({ text: "/resumen" }) }), "user-1", "group-1");
  });

  it.each(["group", "supergroup"])("routes %s voice through Split without personal context", async (chatType) => {
    (transcribeVoiceMessage as jest.Mock).mockResolvedValue("/ayuda");
    (handleSplitGroupMessage as jest.Mock).mockResolvedValue("Ayuda del grupo");

    await POST(request({
      update_id: 30,
      message: {
        chat: { id: 99, type: chatType, title: "Cena" },
        from: { id: 20, is_bot: false, first_name: "Ana" },
        voice: { file_id: "group-voice-1" },
      },
    }));

    expect(transcribeVoiceMessage).toHaveBeenCalledWith("group-voice-1");
    expect(handleSplitGroupMessage).toHaveBeenCalledWith(expect.objectContaining({
      chat: { id: 99, type: chatType, title: "Cena" },
      from: { id: 20, is_bot: false, first_name: "Ana" },
      text: "/ayuda",
    }));
    expect(handleTelegramMessage).not.toHaveBeenCalled();
    expect(resolveAuthorizedTelegramGroup).not.toHaveBeenCalled();
    expect(mockDb.query.users.findFirst).not.toHaveBeenCalled();
    expect(sendPersonalMessage).not.toHaveBeenCalled();
    expect(sendSplitMessage).toHaveBeenCalledWith("99", "Ayuda del grupo");
  });

  it("normalizes a typed Split response for group voice", async () => {
    (transcribeVoiceMessage as jest.Mock).mockResolvedValue("/compartido 5000 cena");
    (handleSplitGroupMessage as jest.Mock).mockResolvedValue({
      text: "¿Quién pagó?",
      replyMarkup: { inline_keyboard: [[{ text: "Ana", callback_data: "paid_by:user:user-1" }]] },
    });

    await POST(request({
      update_id: 31,
      message: {
        chat: { id: 99, type: "group" },
        from: { id: 20, is_bot: false, first_name: "Ana" },
        audio: { file_id: "group-audio-1" },
      },
    }));

    expect(sendSplitMessage).toHaveBeenCalledWith("99", "¿Quién pagó?", expect.objectContaining({ inline_keyboard: expect.any(Array) }));
    expect(sendPersonalMessage).not.toHaveBeenCalled();
    expect(handleTelegramMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["error", new Error("stt unavailable")],
  ])("handles group STT %s without personal leak", async (_label, sttResult) => {
    (transcribeVoiceMessage as jest.Mock).mockImplementation(
      sttResult instanceof Error ? jest.fn().mockRejectedValue(sttResult) : jest.fn().mockResolvedValue(sttResult),
    );

    await POST(request({
      update_id: 32,
      message: {
        chat: { id: 99, type: "supergroup" },
        from: { id: 20, is_bot: false, first_name: "Ana" },
        voice: { file_id: "group-voice-2" },
      },
    }));

    expect(handleTelegramMessage).not.toHaveBeenCalled();
    expect(sendPersonalMessage).not.toHaveBeenCalled();
    expect(sendSplitMessage).toHaveBeenCalledWith("99", expect.stringContaining("audio"));
  });

  it("keeps group callbacks in Split and out of personal context", async () => {
    (handleSplitCallback as jest.Mock).mockResolvedValue("Acción grupal");

    const response = await POST(request({
      update_id: 33,
      callback_query: {
        id: "group-cb-1",
        from: { id: 20 },
        data: "paid_by:varios",
        message: { message_id: 8, chat: { id: 99, type: "supergroup" } },
      },
    }));

    expect(response.status).toBe(200);
    expect(handleSplitCallback).toHaveBeenCalledWith("99", "20", "paid_by:varios", 8);
    expect(handlePersonalCallback).not.toHaveBeenCalled();
    expect(resolveAuthorizedTelegramGroup).not.toHaveBeenCalled();
  });

  it("blocks photo and caption before the financial handler when membership was removed", async () => {
    await POST(request({ update_id: 4, message: { chat: { id: 10, type: "private" }, from: { id: 20 }, photo: [{ file_id: "photo-1" }], caption: "ticket" } }));
    expect(resolveAuthorizedTelegramGroup).toHaveBeenCalledWith("user-1", "group-removed");
    expect(handleTelegramMessage).not.toHaveBeenCalled();
  });

  it("blocks personal callbacks before the financial callback handler", async () => {
    await POST(request({ callback_query: {
      id: "cb-1",
      from: { id: 20 },
      data: "receipt:confirm",
      message: { message_id: 4, chat: { id: 10, type: "private" } },
    } }));
    expect(resolveAuthorizedTelegramGroup).toHaveBeenCalledWith("user-1", "group-removed");
    expect(handlePersonalCallback).not.toHaveBeenCalled();
  });

  it("returns ok when group STT and the error reply both fail", async () => {
    (transcribeVoiceMessage as jest.Mock).mockRejectedValue(new Error("stt unavailable"));
    (sendSplitMessage as jest.Mock).mockRejectedValue(new Error("telegram unavailable"));

    const response = await POST(request({
      update_id: 34,
      message: {
        chat: { id: 99, type: "group" },
        from: { id: 20, is_bot: false, first_name: "Ana" },
        voice: { file_id: "group-voice-3" },
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(handleTelegramMessage).not.toHaveBeenCalled();
    expect(handlePersonalCallback).not.toHaveBeenCalled();
    expect(resolveAuthorizedTelegramGroup).not.toHaveBeenCalled();
  });

  describe("durable inbox rollout", () => {
    beforeEach(() => {
      process.env.TELEGRAM_INBOX_ENABLED = "true";
      (resolveAuthorizedTelegramGroup as jest.Mock).mockResolvedValue("group-1");
      (handleTelegramMessage as jest.Mock).mockResolvedValue({ text: "Resumen" });
    });

    it("keeps the legacy flow unchanged while the flag is off", async () => {
      delete process.env.TELEGRAM_INBOX_ENABLED;

      await POST(request({
        update_id: 40,
        message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
      }));

      expect(claimTelegramUpdate).not.toHaveBeenCalled();
      expect(completeTelegramUpdate).not.toHaveBeenCalled();
      expect(handleTelegramMessage).toHaveBeenCalledTimes(1);
    });

    it("claims before processing and completes with the same lease", async () => {
      await POST(request({
        update_id: 41,
        message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
      }));

      expect(claimTelegramUpdate).toHaveBeenCalledWith({
        botId: "test-bot",
        updateId: "41",
        updateKind: "text",
      });
      expect(handleTelegramMessage).toHaveBeenCalledTimes(1);
      expect(completeTelegramUpdate).toHaveBeenCalledWith({
        botId: "test-bot",
        updateId: "41",
        leaseToken: "lease-1",
      });
      expect(failTelegramUpdate).not.toHaveBeenCalled();
    });

    it("does not let legacy bot history suppress an acquired inbox update", async () => {
      (mockDb.query.bot_messages.findFirst as jest.Mock).mockResolvedValue({
        telegram_update_id: "48",
      });

      await POST(request({
        update_id: 48,
        message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
      }));

      expect(mockDb.query.bot_messages.findFirst).not.toHaveBeenCalled();
      expect(handleTelegramMessage).toHaveBeenCalledTimes(1);
      expect(completeTelegramUpdate).toHaveBeenCalledTimes(1);
    });

    it("processes only one owner across ten concurrent duplicate deliveries", async () => {
      let claimCount = 0;
      (claimTelegramUpdate as jest.Mock).mockImplementation(async () => {
        claimCount += 1;
        return claimCount === 1
          ? { kind: "acquired", leaseToken: "lease-concurrent" }
          : { kind: "busy" };
      });

      const responses = await Promise.all(Array.from({ length: 10 }, () => POST(request({
        update_id: 47,
        message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
      }))));

      expect(responses).toHaveLength(10);
      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(claimTelegramUpdate).toHaveBeenCalledTimes(10);
      expect(handleTelegramMessage).toHaveBeenCalledTimes(1);
      expect(sendPersonalMessage).toHaveBeenCalledTimes(1);
      expect(completeTelegramUpdate).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["voice", { message: { chat: { id: 10, type: "private" }, from: { id: 20 }, voice: { file_id: "voice-1" } } }],
      ["callback", { callback_query: { id: "cb-1", from: { id: 20 }, data: "expense:cancel", message: { message_id: 4, chat: { id: 10, type: "private" } } } }],
    ])("does not process a %s update claimed by another request", async (_kind, body) => {
      (claimTelegramUpdate as jest.Mock).mockResolvedValue({ kind: "busy" });

      const response = await POST(request({ update_id: 42, ...body }));

      expect(response.status).toBe(200);
      expect(transcribeVoiceMessage).not.toHaveBeenCalled();
      expect(handleTelegramMessage).not.toHaveBeenCalled();
      expect(handlePersonalCallback).not.toHaveBeenCalled();
      expect(sendPersonalMessage).not.toHaveBeenCalled();
      expect(sendSplitMessage).not.toHaveBeenCalled();
      expect(answerCallbackQuery).not.toHaveBeenCalled();
      expect(completeTelegramUpdate).not.toHaveBeenCalled();
    });

    it("does not process a completed callback or emit another response", async () => {
      (claimTelegramUpdate as jest.Mock).mockResolvedValue({ kind: "completed" });

      const response = await POST(request({
        update_id: 43,
        callback_query: {
          id: "cb-completed",
          from: { id: 20 },
          data: "expense:cancel",
          message: { message_id: 4, chat: { id: 10, type: "private" } },
        },
      }));

      expect(response.status).toBe(200);
      expect(handlePersonalCallback).not.toHaveBeenCalled();
      expect(sendPersonalMessage).not.toHaveBeenCalled();
      expect(answerCallbackQuery).not.toHaveBeenCalled();
      expect(completeTelegramUpdate).not.toHaveBeenCalled();
    });

    it("returns 200 for an update without update_id without invoking any effect", async () => {
      const response = await POST(request({
        message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
      }));

      expect(response.status).toBe(200);
      expect(claimTelegramUpdate).not.toHaveBeenCalled();
      expect(handleTelegramMessage).not.toHaveBeenCalled();
      expect(sendPersonalMessage).not.toHaveBeenCalled();
    });

    it.each([null, "49", {}, true, 1.5, -1])(
      "rejects malformed update_id %p without claiming or processing",
      async (updateId) => {
        const response = await POST(request({
          update_id: updateId,
          message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
        }));

        expect(response.status).toBe(200);
        expect(claimTelegramUpdate).not.toHaveBeenCalled();
        expect(handleTelegramMessage).not.toHaveBeenCalled();
        expect(sendPersonalMessage).not.toHaveBeenCalled();
      },
    );

    it("fails closed when claiming is unavailable", async () => {
      (claimTelegramUpdate as jest.Mock).mockRejectedValue(new Error("db unavailable"));

      const response = await POST(request({
        update_id: 44,
        message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
      }));

      expect(response.status).toBe(503);
      expect(handleTelegramMessage).not.toHaveBeenCalled();
      expect(sendPersonalMessage).not.toHaveBeenCalled();
      expect(completeTelegramUpdate).not.toHaveBeenCalled();
      expect(failTelegramUpdate).not.toHaveBeenCalled();
    });

    it("marks an unhandled processing exception retryable with a stable code", async () => {
      (mockDb.query.users.findFirst as jest.Mock).mockRejectedValue(new Error("database details must not be persisted"));

      const response = await POST(request({
        update_id: 45,
        message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" },
      }));

      expect(response.status).toBe(503);
      expect(failTelegramUpdate).toHaveBeenCalledWith({
        botId: "test-bot",
        updateId: "45",
        leaseToken: "lease-1",
        errorCode: expect.any(String),
      });
      expect(failTelegramUpdate.mock.calls[0][0].errorCode).not.toContain("database details");
      expect(completeTelegramUpdate).not.toHaveBeenCalled();
    });

    it.each([
      ["callback", { callback_query: { id: "kind-cb", from: { id: 20 }, data: "expense:cancel", message: { message_id: 4, chat: { id: 10, type: "private" } } } }],
      ["voice", { message: { chat: { id: 10, type: "private" }, from: { id: 20 }, voice: { file_id: "voice-kind" } } }],
      ["photo", { message: { chat: { id: 10, type: "private" }, from: { id: 20 }, photo: [{ file_id: "photo-kind" }], caption: "ticket" } }],
      ["document", { message: { chat: { id: 10, type: "private" }, from: { id: 20 }, document: { file_id: "doc-kind", mime_type: "image/jpeg" } } }],
      ["new_member", { message: { chat: { id: -10, type: "group" }, from: { id: 20 }, new_chat_members: [{ id: 99, is_bot: false }] } }],
      ["text", { message: { chat: { id: 10, type: "private" }, from: { id: 20 }, text: "/resumen" } }],
    ])("classifies %s before processing", async (expectedKind, body) => {
      await POST(request({ update_id: 46, ...body }));
      expect(claimTelegramUpdate).toHaveBeenCalledWith(expect.objectContaining({ updateKind: expectedKind }));
    });
  });
});
