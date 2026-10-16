import { handleGroupPhoto } from "../commands/ocr-handler";
import { db } from "@/lib/db/client";
import { ocrTelegramPhoto } from "@/lib/telegram/ocr";
import { parseReceiptText } from "@/lib/ai/parse-receipt";
import { sendTelegramMessage } from "../telegram-api";
import { setConversationState } from "../conversation-state";

jest.mock("@/lib/db/client", () => ({
  db: { query: { split_sessions: { findFirst: jest.fn() } } },
}));
jest.mock("@/lib/telegram/ocr", () => ({
  ocrTelegramPhoto: jest.fn(),
  ocrTelegramDocument: jest.fn(),
}));
jest.mock("@/lib/ai/parse-receipt", () => ({ parseReceiptText: jest.fn() }));
jest.mock("../telegram-api", () => ({
  sendTelegramMessage: jest.fn().mockResolvedValue(undefined),
  buildInlineKeyboard: jest.fn((rows) => ({ inline_keyboard: rows })),
}));
jest.mock("../conversation-state", () => ({ setConversationState: jest.fn() }));

const photo = [{ file_id: "photo-1", width: 100, height: 100 }];

beforeEach(() => {
  jest.clearAllMocks();
  (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1" });
  (ocrTelegramPhoto as jest.Mock).mockResolvedValue({ text: "Ticket" });
});

it("escapes an OCR merchant in the group confirmation while preserving the stored description", async () => {
  (parseReceiptText as jest.Mock).mockResolvedValue({ amount_ars: 1200, merchant: "A&B <store>" });

  await handleGroupPhoto("chat-1", "user-1", photo);

  expect(setConversationState).toHaveBeenCalledWith("chat-1", "user-1", expect.objectContaining({
    data: expect.objectContaining({ description: "A&B <store>" }),
  }));
  expect(sendTelegramMessage).toHaveBeenCalledWith(
    "chat-1",
    expect.stringContaining("<b>A&amp;B &lt;store&gt;</b>"),
    expect.anything(),
  );
});

it("escapes raw OCR text in the no-total diagnostic", async () => {
  (ocrTelegramPhoto as jest.Mock).mockResolvedValue({ text: "<b>total & unknown</b>" });
  (parseReceiptText as jest.Mock).mockResolvedValue({ amount_ars: null, merchant: null });

  await handleGroupPhoto("chat-1", "user-1", photo);

  expect(sendTelegramMessage).toHaveBeenCalledWith(
    "chat-1",
    expect.stringContaining("<code>&lt;b&gt;total &amp; unknown&lt;/b&gt;</code>"),
  );
});
