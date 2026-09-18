import { NextRequest } from "next/server";
import { POST } from "../route";
import { db } from "@/lib/db/client";
import { handleTelegramMessage } from "@/lib/telegram/handlers";
import { handlePersonalCallback } from "@/lib/telegram/personal-callback-handler";
import { transcribeVoiceMessage } from "@/lib/telegram/voice";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
      bot_messages: { findFirst: jest.fn() },
    },
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

const mockDb = db as jest.Mocked<typeof db>;

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
    (resolveAuthorizedTelegramGroup as jest.Mock).mockResolvedValue(null);
    (mockDb.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "user-1",
      active_telegram_group_id: "group-removed",
    });
    (mockDb.query.bot_messages.findFirst as jest.Mock).mockResolvedValue(null);
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
});
