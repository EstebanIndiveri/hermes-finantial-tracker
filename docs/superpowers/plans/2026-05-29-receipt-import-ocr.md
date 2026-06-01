# Receipt Import via OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to send a photo of a receipt via Telegram; the bot OCRs it via OCR.Space, extracts structured data with Groq, and asks for confirmation before inserting a transaction.

**Architecture:** Photo arrives in Telegram webhook → bot downloads file → OCR.Space converts image to text → Groq extracts amount/category/merchant/date → bot proposes the expense → user confirms or cancels with `/confirmar_ticket` / `/cancelar_ticket` → transaction inserted and `receipt_imports` audited.

**Tech Stack:** OCR.Space free API (fetch, no SDK), Groq `llama-3.1-8b-instant` (existing `getGroqClient`), Drizzle ORM + Turso SQLite (existing), Zod validation (existing), Telegram Bot API (existing).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/db/schema.ts` | Modify | Add `receipt_imports` table + relations |
| `lib/db/migrations/0001_receipt_imports.sql` | Create | Raw SQL migration for Turso |
| `lib/telegram/ocr.ts` | Create | Download Telegram file + call OCR.Space |
| `lib/ai/parse-receipt.ts` | Create | Groq prompt to extract structured data from OCR text |
| `lib/telegram/handlers.ts` | Modify | Extend `TelegramUpdate` type; add photo detection; add `/confirmar_ticket` and `/cancelar_ticket` handlers |
| `app/api/telegram/webhook/route.ts` | Modify | Pass `message.photo` / `message.document` to handler |
| `.env.example` | Modify | Add `OCR_SPACE_API_KEY` |

---

## Task 1: DB schema — `receipt_imports` table

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0001_receipt_imports.sql`

- [ ] **Step 1: Add table to schema.ts**

Open `lib/db/schema.ts`. After the `bot_messages` table definition, add:

```typescript
export const receipt_imports = sqliteTable("receipt_imports", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  telegram_file_id: text("telegram_file_id"),
  ocr_raw_text: text("ocr_raw_text"),
  caption: text("caption"),
  parsed_amount_ars: real("parsed_amount_ars"),
  parsed_category_slug: text("parsed_category_slug"),
  parsed_merchant: text("parsed_merchant"),
  parsed_date: text("parsed_date"),
  groq_raw_response: text("groq_raw_response"),
  status: text("status").notNull().default("pending"),
  transaction_id: text("transaction_id"),
  fail_reason: text("fail_reason"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const receiptImportsRelations = relations(receipt_imports, ({ one }) => ({
  user: one(users, {
    fields: [receipt_imports.user_id],
    references: [users.id],
  }),
}));
```

Also extend `usersRelations` to add `receipt_imports: many(receipt_imports)` inside the `many` calls:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  monthly_settings: many(monthly_settings),
  budgets: many(budgets),
  bot_messages: many(bot_messages),
  receipt_imports: many(receipt_imports),          // ← add this line
}));
```

- [ ] **Step 2: Create migration SQL file**

Create `lib/db/migrations/0001_receipt_imports.sql` with this exact content:

```sql
CREATE TABLE `receipt_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`telegram_file_id` text,
	`ocr_raw_text` text,
	`caption` text,
	`parsed_amount_ars` real,
	`parsed_category_slug` text,
	`parsed_merchant` text,
	`parsed_date` text,
	`groq_raw_response` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`transaction_id` text,
	`fail_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
```

- [ ] **Step 3: Apply migration to Turso**

```bash
npx drizzle-kit migrate
```

Expected: `[✓] Applied 1 migration` (or similar success message). If it says "already applied", the table already exists — skip.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/0001_receipt_imports.sql
git commit -m "feat: add receipt_imports table for OCR ticket auditing"
```

---

## Task 2: OCR module — download Telegram file + call OCR.Space

**Files:**
- Create: `lib/telegram/ocr.ts`

- [ ] **Step 1: Create `lib/telegram/ocr.ts`**

```typescript
/**
 * Downloads a file from Telegram and runs OCR via OCR.Space free API.
 * Returns extracted text, or null on failure.
 */

/** Gets the public download URL of a Telegram file by file_id */
async function getTelegramFileUrl(fileId: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`);

  const data = await res.json() as { ok: boolean; result?: { file_path?: string } };
  if (!data.ok || !data.result?.file_path) {
    throw new Error("getFile returned no file_path");
  }

  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

/** Downloads the file from Telegram as a Buffer */
async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const url = await getTelegramFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`File download failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

interface OcrResult {
  text: string;
  isReliable: boolean;
}

/**
 * Runs OCR on a file buffer using OCR.Space free API.
 * @param fileBuffer - raw image bytes
 * @param mimeType - e.g. "image/jpeg", "image/png" — defaults to "image/jpeg"
 */
export async function runOcrOnBuffer(
  fileBuffer: Buffer,
  mimeType = "image/jpeg"
): Promise<OcrResult | null> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    console.warn("OCR_SPACE_API_KEY not set — skipping OCR");
    return null;
  }

  const base64 = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const form = new URLSearchParams();
  form.append("base64Image", base64);
  form.append("language", "spa");
  form.append("isOverlayRequired", "false");
  form.append("detectOrientation", "true");
  form.append("scale", "true");
  form.append("OCREngine", "2");

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    console.error("OCR.Space API error:", res.status, await res.text());
    return null;
  }

  const data = await res.json() as {
    IsErroredOnProcessing?: boolean;
    ParsedResults?: Array<{ ParsedText?: string; TextOverlay?: { HasOverlay?: boolean } }>;
    OCRExitCode?: number;
  };

  if (data.IsErroredOnProcessing || !data.ParsedResults?.length) {
    console.error("OCR.Space returned error:", JSON.stringify(data).slice(0, 200));
    return null;
  }

  const text = (data.ParsedResults[0]?.ParsedText ?? "").trim();
  if (!text) return null;

  return { text, isReliable: data.OCRExitCode === 1 };
}

/**
 * Downloads a Telegram photo (largest size) and runs OCR.
 * @param photoArray - array of PhotoSize objects from Telegram (largest = last)
 */
export async function ocrTelegramPhoto(
  photoArray: Array<{ file_id: string; file_size?: number; width: number; height: number }>
): Promise<OcrResult | null> {
  // Telegram sends photos as array of sizes; last is largest
  const largest = photoArray[photoArray.length - 1];
  if (!largest) return null;

  try {
    const buffer = await downloadTelegramFile(largest.file_id);
    return await runOcrOnBuffer(buffer, "image/jpeg");
  } catch (err) {
    console.error("ocrTelegramPhoto error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Downloads a Telegram document and runs OCR (only for image mime types).
 * @param document - Telegram document object
 */
export async function ocrTelegramDocument(
  document: { file_id: string; mime_type?: string; file_name?: string }
): Promise<OcrResult | null> {
  const mime = document.mime_type ?? "image/jpeg";
  if (!mime.startsWith("image/")) return null;

  try {
    const buffer = await downloadTelegramFile(document.file_id);
    return await runOcrOnBuffer(buffer, mime);
  } catch (err) {
    console.error("ocrTelegramDocument error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/telegram/ocr.ts
git commit -m "feat: OCR module — Telegram file download + OCR.Space integration"
```

---

## Task 3: Groq receipt parser — extract structured data from OCR text

**Files:**
- Create: `lib/ai/parse-receipt.ts`

- [ ] **Step 1: Create `lib/ai/parse-receipt.ts`**

```typescript
import { getGroqClient } from "./groq";
import { z } from "zod";

const ReceiptSchema = z.object({
  amount_ars: z.number().nullable(),
  category_slug: z.string().nullable(),
  merchant: z.string().nullable(),
  date_text: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ParsedReceipt = z.infer<typeof ReceiptSchema>;

const RECEIPT_SYSTEM_PROMPT = `Sos un extractor de datos de tickets y facturas en español argentino.
Analizá el texto del ticket y devolvé SOLO JSON válido.

Campos a extraer:
- amount_ars: el monto total en pesos argentinos (número, sin símbolo $). Buscá "TOTAL", "Total a pagar", "Importe total", el monto más grande al final del ticket.
- category_slug: una de estas categorías exactas: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos. Elegí según el tipo de comercio. Si no podés determinar, null.
- merchant: nombre del comercio o nulo.
- date_text: fecha en el ticket en formato YYYY-MM-DD si podés parsearla, o el texto de la fecha como aparece en el ticket, o null si no hay.
- confidence: número entre 0.0 y 1.0 indicando qué tan seguro estás.

Reglas:
- Devolvé SOLO el JSON. Sin markdown. Sin bloques de código.
- Si el texto está muy corrupto y no podés extraer el monto, devolvé amount_ars: null.
- Primera línea debe ser { y última }.`;

/** Strips markdown code fences that Groq adds despite instructions */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^`+|`+$/g, "").trim();
}

/**
 * Uses Groq to extract structured expense data from OCR text.
 * @param ocrText - raw text extracted from ticket image
 * @returns parsed receipt data or null if Groq is not configured
 */
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt | null> {
  const client = getGroqClient();
  if (!client) return null;

  let raw: string;
  try {
    raw = await client.complete(RECEIPT_SYSTEM_PROMPT, ocrText.slice(0, 2000));
  } catch (err) {
    console.error("Groq receipt parse error:", err instanceof Error ? err.message : String(err));
    return null;
  }

  const cleaned = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Groq receipt JSON parse error. Raw:", raw.slice(0, 300));
    return null;
  }

  const result = ReceiptSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Groq receipt Zod error:", result.error.message, "Parsed:", JSON.stringify(parsed));
    return null;
  }

  return result.data;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/parse-receipt.ts
git commit -m "feat: Groq receipt parser — extract amount/category/merchant/date from OCR text"
```

---

## Task 4: Extend handlers — photo detection, ticket confirmation flow

**Files:**
- Modify: `lib/telegram/handlers.ts`

This is the largest task. Make changes in order.

### Step 1: Extend `TelegramUpdate` interface (top of file, around line 14)

- [ ] Replace the existing `TelegramUpdate` interface with the extended version that includes photo and document:

```typescript
interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    caption?: string;
    chat: { id: number };
    from: { id: number };
    photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
    document?: { file_id: string; mime_type?: string; file_name?: string };
  };
}
```

### Step 2: Add `pendingReceipts` map (right after `pendingExceptions` map, around line 33)

- [ ] Add the second in-memory store for pending receipt confirmations:

```typescript
/** Pending ticket import confirmations — same serverless limitations as pendingExceptions */
const pendingReceipts = new Map<string, {
  receipt_import_id: string;
  category_id: string;
  amount_ars: number;
  merchant?: string;
  date: string;
}>();
```

### Step 3: Add new imports at the top of the file

- [ ] Extend the existing imports block to include the new modules:

```typescript
import { db } from "@/lib/db/client";
import { transactions, categories, monthly_settings, budgets, bot_messages, receipt_imports } from "@/lib/db/schema";
import { eq, and, sum } from "drizzle-orm";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { calculateCategoryStatus, calculateMonthStatus } from "@/lib/finance/rules";
import { formatTransactionConfirm, formatResumen, formatDisponible, formatPuedo } from "./formatters";
import { ocrTelegramPhoto, ocrTelegramDocument } from "./ocr";
import { parseReceiptText } from "@/lib/ai/parse-receipt";
import { randomUUID } from "crypto";
```

### Step 4: Add `/confirmar_ticket` and `/cancelar_ticket` handlers

- [ ] Inside `handleTelegramMessage`, after the existing `/cancelar` handler (around line 115), add:

```typescript
  if (text === "/confirmar_ticket" && pendingReceipts.has(chatId)) {
    const pending = pendingReceipts.get(chatId)!;
    pendingReceipts.delete(chatId);

    const txId = await registerTransaction(
      userId,
      pending.category_id,
      pending.amount_ars,
      pending.merchant,
      month,
      false
    );

    // Update receipt_imports status to confirmed
    try {
      await db.update(receipt_imports)
        .set({ status: "confirmed", transaction_id: txId })
        .where(eq(receipt_imports.id, pending.receipt_import_id));
    } catch (err) {
      console.error("Failed to update receipt_imports:", err instanceof Error ? err.message : String(err));
    }

    return txId; // registerTransaction already returns the formatted confirmation message
  }

  if (text === "/cancelar_ticket" && pendingReceipts.has(chatId)) {
    const pending = pendingReceipts.get(chatId)!;
    pendingReceipts.delete(chatId);

    try {
      await db.update(receipt_imports)
        .set({ status: "rejected" })
        .where(eq(receipt_imports.id, pending.receipt_import_id));
    } catch (err) {
      console.error("Failed to update receipt_imports:", err instanceof Error ? err.message : String(err));
    }

    return "❌ Importación cancelada.";
  }
```

### Step 5: Add photo/document handler

- [ ] After the `/cancelar_ticket` block, add the photo handling before the Groq NLP fallback (before line `const groqKey = process.env.GROQ_API_KEY`):

```typescript
  // ── Photo / Document → OCR ticket import ──
  if (msg.photo || (msg.document && msg.document.mime_type?.startsWith("image/"))) {
    const caption = msg.caption?.trim() ?? "";
    const receiptId = randomUUID();

    // Try caption-first: if it has a number (monto), send to NLP directly
    if (caption && /\d+/.test(caption)) {
      // Use existing NLP to parse the caption as a regular message
      const { parseFinancialMessage } = await import("@/lib/ai/parse-message");
      const parsed = await parseFinancialMessage(caption);

      if (
        (parsed.intent === "register_expense" || parsed.intent === "simulate_expense") &&
        parsed.amount_ars && parsed.amount_ars > 0 &&
        parsed.confidence >= 0.4
      ) {
        // Caption had enough info — skip OCR
        const fileId = msg.photo
          ? msg.photo[msg.photo.length - 1]?.file_id
          : msg.document?.file_id;

        await saveReceiptImport({
          id: receiptId,
          user_id: userId,
          telegram_file_id: fileId ?? null,
          caption,
          ocr_raw_text: null,
          parsed_amount_ars: parsed.amount_ars,
          parsed_category_slug: parsed.category ?? null,
          parsed_merchant: parsed.merchant ?? null,
          parsed_date: null,
          groq_raw_response: JSON.stringify(parsed),
          status: "pending",
        });

        return await buildReceiptProposal({
          chatId,
          receiptId,
          userId,
          amount_ars: parsed.amount_ars,
          categorySlug: parsed.category ?? null,
          merchant: parsed.merchant ?? null,
          date: getArgentinaDate().toISOString().slice(0, 10),
          source: "caption",
        });
      }
    }

    // Run OCR
    let ocrText: string | null = null;
    try {
      const ocrResult = msg.photo
        ? await ocrTelegramPhoto(msg.photo)
        : await ocrTelegramDocument(msg.document!);
      ocrText = ocrResult?.text ?? null;
    } catch (err) {
      console.error("OCR failed:", err instanceof Error ? err.message : String(err));
    }

    const fileId = msg.photo
      ? msg.photo[msg.photo.length - 1]?.file_id
      : msg.document?.file_id;

    if (!ocrText) {
      await saveReceiptImport({
        id: receiptId,
        user_id: userId,
        telegram_file_id: fileId ?? null,
        caption: caption || null,
        ocr_raw_text: null,
        parsed_amount_ars: null,
        parsed_category_slug: null,
        parsed_merchant: null,
        parsed_date: null,
        groq_raw_response: null,
        status: "failed",
        fail_reason: "OCR returned no text",
      });
      return "📷 No pude leer el ticket. Usá /gasto monto categoria descripción.";
    }

    // Parse OCR text with Groq
    let groqResult = null;
    try {
      groqResult = await parseReceiptText(ocrText);
    } catch (err) {
      console.error("Receipt Groq parse failed:", err instanceof Error ? err.message : String(err));
    }

    const amount_ars = groqResult?.amount_ars ?? null;
    const categorySlug = groqResult?.category_slug ?? null;
    const merchant = groqResult?.merchant ?? null;
    const parsedDate = groqResult?.date_text ?? getArgentinaDate().toISOString().slice(0, 10);

    await saveReceiptImport({
      id: receiptId,
      user_id: userId,
      telegram_file_id: fileId ?? null,
      caption: caption || null,
      ocr_raw_text: ocrText,
      parsed_amount_ars: amount_ars,
      parsed_category_slug: categorySlug,
      parsed_merchant: merchant,
      parsed_date: parsedDate,
      groq_raw_response: groqResult ? JSON.stringify(groqResult) : null,
      status: amount_ars ? "pending" : "failed",
      fail_reason: amount_ars ? null : "Groq could not extract amount",
    });

    if (!amount_ars) {
      return `📷 <b>Texto del ticket:</b>\n<code>${escapeHtml(ocrText.slice(0, 300))}</code>\n\nNo pude detectar el monto. Usá /gasto monto categoria descripción.`;
    }

    return await buildReceiptProposal({
      chatId,
      receiptId,
      userId,
      amount_ars,
      categorySlug,
      merchant,
      date: parsedDate,
      source: "ocr",
    });
  }
```

### Step 6: Add helper functions at the bottom of the file (before the closing)

- [ ] After the existing `registerTransaction` function, add these two helpers:

```typescript
/** Saves a receipt_imports row, swallowing errors to avoid breaking the webhook */
async function saveReceiptImport(data: {
  id: string;
  user_id: string;
  telegram_file_id: string | null;
  caption: string | null;
  ocr_raw_text: string | null;
  parsed_amount_ars: number | null;
  parsed_category_slug: string | null;
  parsed_merchant: string | null;
  parsed_date: string | null;
  groq_raw_response: string | null;
  status: string;
  fail_reason?: string | null;
}): Promise<void> {
  try {
    await db.insert(receipt_imports).values({
      ...data,
      fail_reason: data.fail_reason ?? null,
    });
  } catch (err) {
    console.error("saveReceiptImport error:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Builds the Telegram confirmation message for a proposed expense from a ticket,
 * stores it in pendingReceipts, and returns the formatted proposal string.
 */
async function buildReceiptProposal({
  chatId,
  receiptId,
  userId,
  amount_ars,
  categorySlug,
  merchant,
  date,
  source,
}: {
  chatId: string;
  receiptId: string;
  userId: string;
  amount_ars: number;
  categorySlug: string | null;
  merchant: string | null;
  date: string;
  source: "caption" | "ocr";
}): Promise<string> {
  let categoryId: string | null = null;
  let categoryName: string | null = null;
  let categoryEmoji: string | null = null;

  if (categorySlug) {
    const cat = await db.query.categories.findFirst({
      where: eq(categories.slug, categorySlug),
    });
    if (cat) {
      categoryId = cat.id;
      categoryName = cat.name;
      categoryEmoji = cat.emoji;
    }
  }

  const sourceLabel = source === "caption" ? "📝 caption" : "🔍 OCR";

  const lines = [
    `🧾 <b>Ticket detectado</b> (${sourceLabel})`,
    ``,
    `💰 <b>Monto:</b> $${amount_ars.toLocaleString("es-AR")} ARS`,
  ];

  if (categoryName) {
    lines.push(`📂 <b>Categoría:</b> ${categoryEmoji ?? ""} ${categoryName}`);
  } else {
    lines.push(`📂 <b>Categoría:</b> ⚠️ no detectada`);
  }

  if (merchant) {
    lines.push(`🏪 <b>Comercio:</b> ${escapeHtml(merchant)}`);
  }

  lines.push(`📅 <b>Fecha:</b> ${date}`);
  lines.push(``);

  if (!categoryId) {
    lines.push(`⚠️ No pude detectar la categoría. Si los datos son correctos, usá:`);
    lines.push(`/gasto ${amount_ars} [categoria] ${merchant ?? ""}`);
    lines.push(``);
    lines.push(`Categorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos`);

    // Update receipt as failed (no category)
    try {
      await db.update(receipt_imports)
        .set({ status: "failed", fail_reason: "category not detected" })
        .where(eq(receipt_imports.id, receiptId));
    } catch { /* swallow */ }

    return lines.join("\n");
  }

  // Store in pendingReceipts for confirmation
  pendingReceipts.set(chatId, {
    receipt_import_id: receiptId,
    category_id: categoryId,
    amount_ars,
    merchant: merchant ?? undefined,
    date,
  });

  lines.push(`¿Registrar este gasto?`);
  lines.push(`/confirmar_ticket → sí, registrar`);
  lines.push(`/cancelar_ticket → no, descartar`);

  return lines.join("\n");
}
```

### Step 7: Fix `registerTransaction` to return the transaction ID

The `buildReceiptProposal` flow needs the transaction ID to link back in `receipt_imports`. Currently `registerTransaction` returns a formatted string. We need to also capture the ID.

- [ ] In `registerTransaction`, save the ID before inserting and return both:

Find this section in `registerTransaction` (around line 463):
```typescript
  await db.insert(transactions).values({
    id: randomUUID(),
```

Replace with:
```typescript
  const txId = randomUUID();
  await db.insert(transactions).values({
    id: txId,
```

Then at the very end of `registerTransaction`, before `return formatTransactionConfirm(...)`, find the final `return` and change the function signature to return the confirmation string as before. The `/confirmar_ticket` handler calls `registerTransaction` and passes the result directly as the bot reply — that works since `registerTransaction` returns a string.

Actually the issue is subtler: the `/confirmar_ticket` handler needs the transaction ID to store in `receipt_imports.transaction_id`. The current `registerTransaction` returns a `Promise<string>` (the formatted message). We need to refactor it to return `{ message: string; transactionId: string }`.

- [ ] Refactor `registerTransaction` return type:

Change the function signature from:
```typescript
async function registerTransaction(
  userId: string,
  category_id: string,
  amount_ars: number,
  merchant: string | undefined,
  month: string,
  is_exception: boolean
): Promise<string> {
```

To:
```typescript
async function registerTransaction(
  userId: string,
  category_id: string,
  amount_ars: number,
  merchant: string | undefined,
  month: string,
  is_exception: boolean
): Promise<{ message: string; transactionId: string }> {
```

At the top of the function body, change:
```typescript
  const txId = randomUUID();
  await db.insert(transactions).values({
    id: txId,
```

And change the final `return` statement from:
```typescript
  return formatTransactionConfirm({ ... });
```
To:
```typescript
  return { message: formatTransactionConfirm({ ... }), transactionId: txId };
```

- [ ] Update all callers of `registerTransaction` to use `.message`:

There are 3 callers:
1. `/confirmar` handler: `return registerTransaction(...)` → `return (await registerTransaction(...)).message`
2. `/gasto` handler: `return registerTransaction(...)` → `return (await registerTransaction(...)).message`
3. `register_expense` NLP handler: `return registerTransaction(...)` → `return (await registerTransaction(...)).message`
4. `/confirmar_ticket` handler (already uses `.message` since we wrote it that way above)

Search for all `return registerTransaction` in `handlers.ts` and change them to `return (await registerTransaction(...)).message` — except in `/confirmar_ticket` where we use `const txId = await registerTransaction(...)` pattern.

- [ ] Update `/confirmar_ticket` to use the new return type:

Replace:
```typescript
    const txId = await registerTransaction(
      userId,
      pending.category_id,
      pending.amount_ars,
      pending.merchant,
      month,
      false
    );

    // Update receipt_imports status to confirmed
    try {
      await db.update(receipt_imports)
        .set({ status: "confirmed", transaction_id: txId })
        .where(eq(receipt_imports.id, pending.receipt_import_id));
    } catch (err) {
      console.error("Failed to update receipt_imports:", err instanceof Error ? err.message : String(err));
    }

    return txId; // registerTransaction already returns the formatted confirmation message
```

With:
```typescript
    const result = await registerTransaction(
      userId,
      pending.category_id,
      pending.amount_ars,
      pending.merchant,
      month,
      false
    );

    try {
      await db.update(receipt_imports)
        .set({ status: "confirmed", transaction_id: result.transactionId })
        .where(eq(receipt_imports.id, pending.receipt_import_id));
    } catch (err) {
      console.error("Failed to update receipt_imports:", err instanceof Error ? err.message : String(err));
    }

    return result.message;
```

- [ ] **TypeScript check after all handler changes:**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type mismatches before proceeding.

- [ ] **Commit**

```bash
git add lib/telegram/handlers.ts
git commit -m "feat: photo handling, OCR ticket flow, confirmar_ticket/cancelar_ticket commands"
```

---

## Task 5: Extend webhook route to forward photo/document messages

**Files:**
- Modify: `app/api/telegram/webhook/route.ts`

The webhook currently skips messages without `message.text`. We need it to also process photo/document messages.

- [ ] **Step 1: Update the `messageText` extraction and the `bot_messages` insert**

Find this section (around line 28):
```typescript
  const telegramUserId = String(update.message.from.id);
  const chatId = String(update.message.chat.id);
  const messageText = update.message.text ?? "";
```

Change `messageText` to capture caption or a placeholder for photos:
```typescript
  const telegramUserId = String(update.message.from.id);
  const chatId = String(update.message.chat.id);
  const messageText = update.message.text
    ?? update.message.caption
    ?? (update.message.photo ? "[photo]" : "")
    ?? (update.message.document ? "[document]" : "")
    ?? "";
```

- [ ] **Step 2: Remove the guard that skips non-text messages**

The current code only calls `handleTelegramMessage` for all messages already. The `handleTelegramMessage` function will handle the photo detection internally. No structural change needed here — just verify that the webhook does NOT have a guard like `if (!messageText) return NextResponse.json({ ok: true })`. If such a guard exists, remove it.

Check the webhook: the current guard is:
```typescript
  if (!update?.message?.chat?.id || !update?.message?.from?.id) {
    return NextResponse.json({ ok: true });
  }
```

This is correct — it only guards against missing chat/from IDs, not against missing text. ✅ No change needed here.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/telegram/webhook/route.ts
git commit -m "fix: webhook forwards photo/document messages to handler (capture caption + photo placeholder)"
```

---

## Task 6: Environment variable + deploy

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add OCR_SPACE_API_KEY to .env.example**

Add this line to `.env.example`:
```
OCR_SPACE_API_KEY=         # Free: https://ocr.space/ocrapi (25k req/month)
```

- [ ] **Step 2: Add OCR_SPACE_API_KEY to Vercel env vars**

```bash
vercel env add OCR_SPACE_API_KEY production
```

When prompted, paste the API key from https://ocr.space/ocrapi (sign up free, key sent by email).

- [ ] **Step 3: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit + push + deploy**

```bash
git add .env.example
git commit -m "chore: add OCR_SPACE_API_KEY env var for receipt import"
git push origin main
vercel --prod
```

Expected: `✓ Ready` in Vercel dashboard.

---

## Task 7: Manual end-to-end test via Telegram

No automated tests for this flow (requires live Telegram + OCR.Space). Test manually.

- [ ] **Test 1 — Photo without caption (OCR path)**

Send a photo of a supermarket receipt to the bot with no caption.

Expected response:
```
🧾 Ticket detectado (🔍 OCR)

💰 Monto: $47.200 ARS
📂 Categoría: 🛒 Supermercado
🏪 Comercio: DISCO
📅 Fecha: 2026-05-29

¿Registrar este gasto?
/confirmar_ticket → sí, registrar
/cancelar_ticket → no, descartar
```

- [ ] **Test 2 — Confirm ticket**

Reply with `/confirmar_ticket`.

Expected: same confirmation message as `/gasto` (shows budget impact).

- [ ] **Test 3 — Photo with caption (caption-first path)**

Send a photo with caption: `47200 supermercado Disco`.

Expected: bot uses caption directly (skips OCR), shows proposal.

- [ ] **Test 4 — Cancel ticket**

Send photo → get proposal → reply `/cancelar_ticket`.

Expected: `❌ Importación cancelada.`

- [ ] **Test 5 — Unreadable image (OCR fail path)**

Send a blurry or non-receipt image.

Expected: `📷 No pude leer el ticket. Usá /gasto monto categoria descripción.`

- [ ] **Test 6 — OCR succeeds but no amount detected**

Expected: Bot shows raw OCR text (first 300 chars) and asks for manual entry.

---

## Self-review checklist

- [x] **receipt_imports table** created with all audit fields (Task 1)
- [x] **OCR.Space integration** with base64 upload, spa language, engine 2 (Task 2)
- [x] **Groq receipt parser** with separate system prompt and Zod validation (Task 3)
- [x] **Caption-first strategy** — if caption has a number, skips OCR (Task 4)
- [x] **Never inserts without confirmation** — always goes through `pendingReceipts` + `/confirmar_ticket`
- [x] **receipt_imports saved even on failure** — status "failed" with fail_reason (Tasks 4, 5)
- [x] **Closed category exception flow** — `registerTransaction` already handles this; `/confirmar_ticket` calls it (Task 4)
- [x] **Date validation** — `registerTransaction` uses today's date; `parseReceiptText` returns date_text which is advisory only; actual insert uses `getArgentinaDate()` unless we trust the OCR date (current: uses OCR date as display but registers with today — safe)
- [x] **Webhook never crashes** — all OCR/Groq errors are caught and swallowed (Task 2, Task 4)
- [x] **bot_messages logged for photo** — webhook captures `[photo]` placeholder as raw_text (Task 5)

**Potential gap:** The `registerTransaction` refactor (Task 4, Step 7) touches existing callers — verify all 3 call sites are updated or the TypeScript check will catch it.
