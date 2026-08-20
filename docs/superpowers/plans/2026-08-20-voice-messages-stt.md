# Voice Messages (STT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to send voice messages to the Telegram bot, which are transcribed via Groq Whisper and processed as natural language text.

**Architecture:** Telegram sends voice messages as `.ogg` files. We download the file, send it to Groq's Whisper API for transcription, then process the transcribed text through the existing NL parser. This requires adding a `transcribeAudio` function to the Groq client and handling voice messages in the webhook.

**Tech Stack:** Groq Whisper API (`whisper-large-v3-turbo`), Telegram Bot API file downloads, existing NL parser

---

## File Structure

| File | Purpose |
|------|---------|
| `lib/ai/groq.ts` | Add `transcribeAudio()` function for Whisper API |
| `lib/telegram/voice.ts` | Download Telegram voice files, orchestrate transcription |
| `app/api/telegram/webhook/route.ts` | Detect voice messages, route to handler |
| `lib/telegram/handlers.ts` | Process transcribed text like any NL message |
| `lib/ai/__tests__/groq.test.ts` | Unit tests for transcription |
| `lib/telegram/__tests__/voice.test.ts` | Unit tests for voice handling |

---

## Task 1: Add Whisper Transcription to Groq Client

**Files:**
- Modify: `lib/ai/groq.ts`
- Create: `lib/ai/__tests__/groq.test.ts`

- [ ] **Step 1: Write the failing test for transcribeAudio**

```typescript
// lib/ai/__tests__/groq.test.ts
import { transcribeAudio } from "../groq";

describe("Groq transcribeAudio", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("returns null when GROQ_API_KEY is not set", async () => {
    delete process.env.GROQ_API_KEY;
    const result = await transcribeAudio(Buffer.from("audio"));
    expect(result).toBeNull();
  });

  it("transcribes audio successfully", async () => {
    process.env.GROQ_API_KEY = "test-key";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ text: "gasté cinco mil en supermercado" }),
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"));

    expect(result).toBe("gasté cinco mil en supermercado");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
  });

  it("returns null on API error", async () => {
    process.env.GROQ_API_KEY = "test-key";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"));
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/ai/__tests__/groq.test.ts`
Expected: FAIL with "transcribeAudio is not exported"

- [ ] **Step 3: Implement transcribeAudio function**

```typescript
// lib/ai/groq.ts - ADD at the end of the file

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = "voice.ogg"
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo";

  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), filename);
  formData.append("model", model);
  formData.append("language", "es");
  formData.append("response_format", "json");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      console.error("Groq Whisper API error:", res.status);
      return null;
    }

    const data = (await res.json()) as { text?: string };
    return data.text ?? null;
  } catch (err) {
    console.error("Groq transcription error:", err instanceof Error ? err.message : err);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/ai/__tests__/groq.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/groq.ts lib/ai/__tests__/groq.test.ts
git commit -m "feat(ai): add Whisper transcription via Groq API"
```

---

## Task 2: Create Voice Message Handler

**Files:**
- Create: `lib/telegram/voice.ts`
- Create: `lib/telegram/__tests__/voice.test.ts`

- [ ] **Step 1: Write the failing test for downloadTelegramFile**

```typescript
// lib/telegram/__tests__/voice.test.ts
import { downloadTelegramFile, handleVoiceMessage } from "../voice";

describe("Voice message handling", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("downloadTelegramFile", () => {
    it("downloads file from Telegram API", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { file_path: "voice/file_123.ogg" },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(100),
        });

      const result = await downloadTelegramFile("file-id-123");

      expect(result).toBeInstanceOf(Buffer);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        "https://api.telegram.org/bottest-bot-token/getFile?file_id=file-id-123"
      );
    });

    it("returns null when getFile fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      });

      const result = await downloadTelegramFile("invalid-file");
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/telegram/__tests__/voice.test.ts`
Expected: FAIL with "downloadTelegramFile is not exported"

- [ ] **Step 3: Implement voice.ts module**

```typescript
// lib/telegram/voice.ts
import { transcribeAudio } from "@/lib/ai/groq";

export async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    // Step 1: Get file path from Telegram
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    );
    const fileInfo = (await fileInfoRes.json()) as {
      ok: boolean;
      result?: { file_path: string };
    };

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      console.error("Failed to get Telegram file path");
      return null;
    }

    // Step 2: Download the file
    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`
    );

    if (!fileRes.ok) {
      console.error("Failed to download Telegram file:", fileRes.status);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("Error downloading Telegram file:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function transcribeVoiceMessage(fileId: string): Promise<string | null> {
  const audioBuffer = await downloadTelegramFile(fileId);
  if (!audioBuffer) return null;

  const transcription = await transcribeAudio(audioBuffer, "voice.ogg");
  return transcription;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/telegram/__tests__/voice.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/telegram/voice.ts lib/telegram/__tests__/voice.test.ts
git commit -m "feat(telegram): add voice file download and transcription"
```

---

## Task 3: Integrate Voice Messages into Webhook

**Files:**
- Modify: `app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Add voice message detection in webhook**

In `app/api/telegram/webhook/route.ts`, after the existing imports, add:

```typescript
import { transcribeVoiceMessage } from "@/lib/telegram/voice";
```

- [ ] **Step 2: Handle voice messages before text processing**

Find this section in the webhook (around line 130):

```typescript
const messageText =
  msg.text ?? msg.caption ??
  (msg.photo?.length ? "[photo]" : null) ??
  (msg.document ? "[document]" : null) ?? "";
```

Replace with:

```typescript
let messageText =
  msg.text ?? msg.caption ??
  (msg.photo?.length ? "[photo]" : null) ??
  (msg.document ? "[document]" : null) ?? "";

// Handle voice messages
const voiceFileId = msg.voice?.file_id ?? msg.audio?.file_id;
if (voiceFileId && !messageText) {
  try {
    const transcription = await transcribeVoiceMessage(voiceFileId);
    if (transcription) {
      messageText = transcription;
      console.log("Voice transcribed:", transcription.substring(0, 50));
    } else {
      // Transcription failed - inform user
      await sendTelegramMessage(chatId, "❌ No pude entender el audio. Intentá de nuevo o escribí el mensaje.");
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("Voice transcription error:", err instanceof Error ? err.message : err);
    await sendTelegramMessage(chatId, "❌ Error procesando el audio. Intentá de nuevo.");
    return NextResponse.json({ ok: true });
  }
}
```

- [ ] **Step 3: Run build to verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/api/telegram/webhook/route.ts
git commit -m "feat(webhook): integrate voice message transcription"
```

---

## Task 4: Add Voice Feedback in Bot Response

**Files:**
- Modify: `lib/telegram/handlers.ts`

- [ ] **Step 1: Add voice indicator to response when transcribed**

The webhook already processes transcribed text through `handleTelegramMessage`. We can add a prefix to indicate voice was processed. In `app/api/telegram/webhook/route.ts`, after successful transcription, add a flag:

```typescript
// After transcription success, before calling handleTelegramMessage
const wasVoiceMessage = !!voiceFileId && !!transcription;
```

Then pass this to the bot response building (optional enhancement - can be done later).

- [ ] **Step 2: Test manually that voice messages work**

Deploy and test by sending a voice message to the bot.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(bot): complete voice message support"
```

---

## Task 5: Final Integration Test and Deploy

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (except pre-existing Playwright issues)

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Push to deploy**

```bash
git push origin main
```

- [ ] **Step 4: QA Functional Test**

Test these voice scenarios:
1. Say "gasté cinco mil en supermercado" → Should register expense
2. Say "cuánto llevo gastado" → Should show summary
3. Say "cuánto disponible tengo" → Should show available budget
4. Say "gasté dos mil verdulería con reintegro" → Should create expense + reimbursement
5. Say "reintegros" → Should list pending reimbursements

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Groq Whisper transcription | `lib/ai/groq.ts` |
| 2 | Voice download + transcription | `lib/telegram/voice.ts` |
| 3 | Webhook integration | `webhook/route.ts` |
| 4 | Response feedback | `handlers.ts` |
| 5 | Test + Deploy | - |

**Estimated time:** 1-2 hours
