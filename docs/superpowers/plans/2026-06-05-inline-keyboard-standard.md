# Inline Keyboard Standard — Personal + Group Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace text commands (`/confirmar_ticket`, `/cancelar`, `/confirmar`) with inline keyboard buttons for all expense-registration flows in both personal and group bot contexts, establishing a consistent "OCR/text → confirm/edit with buttons" UX standard.

**Architecture:** Add inline keyboard support to `send-message.ts`, introduce a `personal-callback-handler.ts` for personal-chat callbacks, update `route.ts` to route those callbacks, and refactor `handlers.ts` so that OCR ticket proposals, `/gasto`, NL expense registration, and budget exceptions all respond with inline keyboards instead of text commands. Group splits already use this pattern via `callback-handler.ts` — this plan extends that standard to personal chats.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Turso/libSQL, Telegram Bot API (inline keyboards, callback_query), existing `bot_conversation_state` table (already in schema).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/telegram/send-message.ts` | Modify | Add `replyMarkup` param to `sendTelegramMessage` |
| `lib/telegram/handlers.ts` | Modify | OCR flow → inline KB; `/gasto` → confirm KB; NL register_expense → confirm KB; pendingExceptions → inline KB |
| `lib/telegram/personal-callback-handler.ts` | **Create** | Handle `receipt:*`, `expense:*`, `exception:*` callback_query from personal chats |
| `app/api/telegram/webhook/route.ts` | Modify | Route personal (non-group) callback_query to `handlePersonalCallback` |

---

## Task 1: Add `replyMarkup` to `send-message.ts`

**Files:**
- Modify: `lib/telegram/send-message.ts`

- [ ] **Step 1: Add InlineKeyboardMarkup type and update function signature**

Replace the entire content of `lib/telegram/send-message.ts` with:

```typescript
export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export function buildPersonalKeyboard(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

export async function editTelegramPersonalMessage(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 400 = message not modified — not an error
  if (!res.ok && res.status !== 400) {
    const err = await res.text();
    throw new Error(`Telegram editMessage error: ${err}`);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /path/to/repo && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors (existing callers still pass only 2 args — 3rd arg is optional).

- [ ] **Step 3: Commit**

```bash
git add lib/telegram/send-message.ts
git commit -m "feat: add replyMarkup and editMessage support to send-message.ts"
```

---

## Task 2: Change `handleTelegramMessage` return type to support inline keyboards

**Files:**
- Modify: `lib/telegram/handlers.ts` (interface change only — no logic yet)

The function currently returns `Promise<string>`. We need it to return `Promise<PersonalBotMessage>` so `route.ts` can pass the keyboard to `sendTelegramMessage`.

- [ ] **Step 1: Define `PersonalBotMessage` type at top of `handlers.ts`**

Add after the existing imports:

```typescript
import type { InlineKeyboardMarkup } from "./send-message";

export interface PersonalBotMessage {
  text: string;
  replyMarkup?: InlineKeyboardMarkup;
}
```

- [ ] **Step 2: Change `handleTelegramMessage` signature and wrap all existing `return "..."` string returns**

Change:
```typescript
export async function handleTelegramMessage(update: TelegramUpdate, userId: string, groupId: string): Promise<string> {
```
To:
```typescript
export async function handleTelegramMessage(update: TelegramUpdate, userId: string, groupId: string): Promise<PersonalBotMessage> {
```

All existing `return "some text"` must become `return { text: "some text" }`. Do a global find-replace in the file:
- Every `return "...";` (string literal returns) → `return { text: "..." };`
- Every `return \`...\`;` (template literal returns) → `return { text: \`...\` };`
- Every `return formatXxx(...)` → `return { text: formatXxx(...) };` — since all `formatXxx` functions return `string`
- Every `return result.message;` → `return { text: result.message };`

- [ ] **Step 3: Update `route.ts` to destructure the response**

In `app/api/telegram/webhook/route.ts`, change the section that calls `handleTelegramMessage`:

```typescript
// BEFORE:
let response_text = "Error interno.";
try {
  response_text = await handleTelegramMessage(update, user.id, groupId);
} catch (err) { ... }
// ...
await sendTelegramMessage(chatId, response_text);

// AFTER:
let botResponse: { text: string; replyMarkup?: import("@/lib/telegram/send-message").InlineKeyboardMarkup } = { text: "Error interno." };
try {
  botResponse = await handleTelegramMessage(update, user.id, groupId);
} catch (err) {
  console.error("Telegram handler error:", { message: err instanceof Error ? err.message : "Unknown error", updateId });
  botResponse = { text: "Error procesando el mensaje." };
}
// ...
await sendTelegramMessage(chatId, botResponse.text, botResponse.replyMarkup);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/telegram/handlers.ts app/api/telegram/webhook/route.ts
git commit -m "refactor: handleTelegramMessage returns PersonalBotMessage instead of string"
```

---

## Task 3: Create `personal-callback-handler.ts`

**Files:**
- Create: `lib/telegram/personal-callback-handler.ts`

This file handles all `callback_query` events from personal (1:1) chats with the bot. It needs to:
- Handle `receipt:confirm` — confirm OCR ticket (reads pending `receipt_imports` row, registers transaction)
- Handle `receipt:cancel` — reject OCR ticket
- Handle `receipt:edit_amount` / `receipt:edit_category` / `receipt:edit_merchant` — set `bot_conversation_state` for the edit step, returns "Enviá el nuevo valor:" message
- Handle `expense:confirm` — register the expense stored in `bot_conversation_state`
- Handle `expense:cancel` — clear state
- Handle `exception:confirm` — register as budget exception (from `bot_conversation_state`)
- Handle `exception:cancel` — clear state

```typescript
// lib/telegram/personal-callback-handler.ts
import { db } from "@/lib/db/client";
import {
  receipt_imports,
  transactions,
  categories,
  budgets,
  monthly_settings,
} from "@/lib/db/schema";
import { eq, and, sum, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary } from "@/lib/finance/summaries";
import { calculateCategoryStatus } from "@/lib/finance/rules";
import { formatTransactionConfirm } from "./formatters";
import { getConversationState, setConversationState, clearConversationState } from "./splits/conversation-state";
import type { InlineKeyboardMarkup } from "./send-message";
import { buildPersonalKeyboard } from "./send-message";

export interface PersonalCallbackResponse {
  text: string;
  edit: boolean;
  replyMarkup?: InlineKeyboardMarkup;
}

// ── Pending expense state (for /gasto confirmation and NL register_expense) ──
interface PendingExpenseState {
  step: "expense_confirm";
  category_id: string;
  category_name: string;
  category_emoji: string;
  amount_ars: number;
  merchant?: string;
  group_id: string;
  user_id: string;
  is_exception: boolean;
}

// ── Shared: register a transaction ──
async function registerPersonalTransaction(
  userId: string,
  groupId: string,
  categoryId: string,
  amountArs: number,
  merchant: string | undefined,
  isException: boolean
): Promise<string> {
  const month = getActiveMonthArgentina();
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!settings) return "Sin configuración mensual.";

  const amountUsd = parseFloat((amountArs / settings.exchange_rate).toFixed(2));
  const date = getArgentinaDate().toISOString().slice(0, 10);
  const txId = randomUUID();

  await db.insert(transactions).values({
    id: txId,
    user_id: userId,
    group_id: groupId,
    category_id: categoryId,
    amount_ars: amountArs,
    amount_usd: amountUsd,
    merchant: merchant ?? null,
    description: null,
    date,
    month,
    source: "telegram",
    status: "active",
    is_exception: isException ? 1 : 0,
  });

  const budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.group_id, groupId), eq(budgets.month, month), eq(budgets.category_id, categoryId)),
  });

  const spentRows = await db
    .select({ total: sum(transactions.amount_ars) })
    .from(transactions)
    .where(and(
      eq(transactions.group_id, groupId),
      eq(transactions.month, month),
      eq(transactions.category_id, categoryId),
      eq(transactions.status, "active")
    ));
  const gastado_ars = Number(spentRows[0]?.total ?? 0);
  const budget_ars = budget?.budget_ars ?? 0;
  const disponible_ars = budget_ars > 0 ? Math.max(0, budget_ars - gastado_ars) : null;
  const status = calculateCategoryStatus({ gastado_ars, budget_ars });

  const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) });
  const summary = await getMonthSummary(groupId, month);

  return formatTransactionConfirm({
    amount_ars: amountArs,
    category: cat?.name ?? "—",
    emoji: cat?.emoji ?? "📦",
    gastado_ars,
    budget_ars,
    disponible_ars,
    status,
    ahorro_proyectado_usd: summary?.ahorro_proyectado_usd ?? 0,
  });
}

export async function handlePersonalCallback(
  chatId: string,
  telegramUserId: string,
  userId: string,
  groupId: string,
  data: string,
  messageId?: number
): Promise<PersonalCallbackResponse> {
  // ── receipt:* — OCR ticket callbacks ──────────────────────────────
  if (data === "receipt:confirm") {
    const rows = await db
      .select()
      .from(receipt_imports)
      .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
      .orderBy(desc(receipt_imports.created_at))
      .limit(1);
    const pending = rows[0] ?? null;

    if (!pending?.parsed_amount_ars || !pending.parsed_category_slug) {
      return { text: "❌ No hay ticket pendiente o faltan datos. Enviá la foto nuevamente.", edit: true };
    }

    const month = getActiveMonthArgentina();
    const cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, pending.parsed_category_slug), eq(categories.group_id, groupId)),
    });
    if (!cat) {
      return {
        text: `⚠️ Categoría <b>${pending.parsed_category_slug}</b> no encontrada en tu grupo.\nEscribí la categoría correcta para continuar.`,
        edit: true,
      };
    }

    const resultText = await registerPersonalTransaction(
      userId, groupId, cat.id, pending.parsed_amount_ars, pending.parsed_merchant ?? undefined, false
    );

    await db.update(receipt_imports)
      .set({ status: "confirmed" })
      .where(eq(receipt_imports.id, pending.id))
      .catch(() => {});

    return { text: resultText, edit: true };
  }

  if (data === "receipt:cancel") {
    await db.update(receipt_imports)
      .set({ status: "rejected" })
      .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
      .catch(() => {});
    return { text: "❌ Ticket cancelado.", edit: true };
  }

  if (data === "receipt:edit_amount") {
    const rows = await db.select().from(receipt_imports)
      .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
      .orderBy(desc(receipt_imports.created_at)).limit(1);
    const pending = rows[0] ?? null;
    if (!pending) return { text: "❌ No hay ticket pendiente.", edit: true };

    await setConversationState(chatId, telegramUserId, {
      step: "receipt_edit_amount",
      data: { import_id: pending.id },
    });
    return { text: "✏️ Enviá el nuevo monto (ej: <code>47000</code>):", edit: true };
  }

  if (data === "receipt:edit_category") {
    const rows = await db.select().from(receipt_imports)
      .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
      .orderBy(desc(receipt_imports.created_at)).limit(1);
    const pending = rows[0] ?? null;
    if (!pending) return { text: "❌ No hay ticket pendiente.", edit: true };

    await setConversationState(chatId, telegramUserId, {
      step: "receipt_edit_category",
      data: { import_id: pending.id },
    });
    return { text: "✏️ Enviá la categoría (ej: <code>supermercado</code>):", edit: true };
  }

  if (data === "receipt:edit_merchant") {
    const rows = await db.select().from(receipt_imports)
      .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
      .orderBy(desc(receipt_imports.created_at)).limit(1);
    const pending = rows[0] ?? null;
    if (!pending) return { text: "❌ No hay ticket pendiente.", edit: true };

    await setConversationState(chatId, telegramUserId, {
      step: "receipt_edit_merchant",
      data: { import_id: pending.id },
    });
    return { text: "✏️ Enviá el nombre del comercio (ej: <code>Carrefour</code>):", edit: true };
  }

  // ── expense:* — /gasto + NL expense confirmation ──────────────────
  if (data === "expense:confirm") {
    const state = await getConversationState(chatId, telegramUserId);
    if (state?.step !== "expense_confirm") {
      return { text: "⏱️ Confirmación expirada. Volvé a escribir el gasto.", edit: true };
    }
    const s = state.data as PendingExpenseState;
    await clearConversationState(chatId, telegramUserId);

    const resultText = await registerPersonalTransaction(
      s.user_id, s.group_id, s.category_id, s.amount_ars, s.merchant, s.is_exception
    );
    return { text: resultText, edit: true };
  }

  if (data === "expense:cancel") {
    await clearConversationState(chatId, telegramUserId);
    return { text: "❌ Gasto cancelado.", edit: true };
  }

  // ── exception:* — budget exception confirmation ────────────────────
  if (data === "exception:confirm") {
    const state = await getConversationState(chatId, telegramUserId);
    if (state?.step !== "expense_confirm") {
      return { text: "⏱️ Confirmación expirada.", edit: true };
    }
    const s = state.data as PendingExpenseState;
    await clearConversationState(chatId, telegramUserId);

    const resultText = await registerPersonalTransaction(
      s.user_id, s.group_id, s.category_id, s.amount_ars, s.merchant, true
    );
    return { text: `⚠️ Registrado como excepción.\n\n${resultText}`, edit: true };
  }

  if (data === "exception:cancel") {
    await clearConversationState(chatId, telegramUserId);
    return { text: "❌ Cancelado.", edit: true };
  }

  return { text: "❌ Acción no reconocida.", edit: false };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/telegram/personal-callback-handler.ts
git commit -m "feat: add personal-callback-handler for inline keyboard actions"
```

---

## Task 4: Wire personal callbacks in `route.ts`

**Files:**
- Modify: `app/api/telegram/webhook/route.ts`

Currently the `callback_query` block in `route.ts` does:
```typescript
const isGroupChat = cq.message?.chat?.type === "group" || cq.message?.chat?.type === "supergroup";
if (isGroupChat) { /* group callback handling */ }
return NextResponse.json({ ok: true }); // ← personal callbacks dropped here
```

- [ ] **Step 1: Add import at top of `route.ts`**

```typescript
import { handlePersonalCallback } from "@/lib/telegram/personal-callback-handler";
import { editTelegramPersonalMessage } from "@/lib/telegram/send-message";
```

- [ ] **Step 2: Replace the personal callback fallthrough**

Find the block:
```typescript
    if (isGroupChat) {
      // ... group callback handling ...
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
```

Replace with:
```typescript
    if (isGroupChat) {
      try {
        const response = await handleSplitCallback(chatId, telegramUserId, data, messageId);
        if (response) {
          if (response.edit && messageId) {
            await editTelegramMessage(chatId, messageId, response.text, response.replyMarkup);
          } else {
            await sendSplitMessage(chatId, response.text, response.replyMarkup);
          }
        }
      } catch (err) {
        console.error("Telegram callback error:", { message: err instanceof Error ? err.message : "Unknown error", data });
        try {
          await sendSplitMessage(chatId, "Ocurrió un error procesando tu acción. Intentá nuevamente.");
        } catch { /* best-effort */ }
      }
      return NextResponse.json({ ok: true });
    }

    // Personal chat callback
    const personalChatId = String(cq.message?.chat?.id ?? cq.from.id);
    
    // Need userId and groupId for personal callbacks — look up the user
    try {
      const personalUser = await db.query.users.findFirst({
        where: eq(users.telegram_user_id, telegramUserId),
      });
      if (!personalUser) {
        await sendTelegramMessage(personalChatId, "Tu sesión expiró. Vinculá tu cuenta nuevamente.");
      } else {
        const { getPersonalGroup } = await import("@/lib/groups/permissions");
        const personalGroupId = personalUser.active_telegram_group_id ?? await getPersonalGroup(personalUser.id).catch(() => null);
        if (!personalGroupId) {
          await sendTelegramMessage(personalChatId, "No tenés grupo activo.");
        } else {
          const response = await handlePersonalCallback(
            personalChatId, telegramUserId, personalUser.id, personalGroupId, data, messageId
          );
          if (response.edit && messageId) {
            await editTelegramPersonalMessage(personalChatId, messageId, response.text, response.replyMarkup);
          } else {
            await sendTelegramMessage(personalChatId, response.text, response.replyMarkup);
          }
        }
      }
    } catch (err) {
      console.error("Personal callback error:", { message: err instanceof Error ? err.message : "Unknown error", data });
      try {
        await sendTelegramMessage(personalChatId, "Ocurrió un error. Intentá nuevamente.");
      } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/telegram/webhook/route.ts
git commit -m "feat: route personal callback_query to handlePersonalCallback in route.ts"
```

---

## Task 5: Refactor OCR photo flow in `handlers.ts` to use inline keyboard

**Files:**
- Modify: `lib/telegram/handlers.ts`

Currently: photo → OCR → inserts `receipt_imports` → returns text like "🧾 Ticket detectado... /confirmar_ticket / /cancelar_ticket".  
After: photo → OCR → inserts `receipt_imports` → returns `PersonalBotMessage` with inline keyboard.

The relevant section starts at approximately line 400+ in `handlers.ts` — search for `buildReceiptProposalMessage`.

- [ ] **Step 1: Add import at top of `handlers.ts`**

```typescript
import { buildPersonalKeyboard } from "./send-message";
```

- [ ] **Step 2: Replace `buildReceiptProposalMessage` function**

Find and replace the `buildReceiptProposalMessage` function with one that returns `PersonalBotMessage`:

```typescript
function buildReceiptProposalMessage({
  amount_ars,
  categoryName,
  categoryEmoji,
  merchant,
  date,
  source,
}: {
  amount_ars: number;
  categoryName: string;
  categoryEmoji: string;
  merchant?: string;
  date: string;
  source: "ocr" | "caption" | "edit";
}): PersonalBotMessage {
  const sourceLabel = source === "caption" ? "📝 caption" : source === "edit" ? "✏️ editado" : "🔍 OCR";
  const text = [
    `🧾 <b>Ticket detectado</b> (${sourceLabel})`,
    ``,
    `💰 <b>Monto:</b> $${amount_ars.toLocaleString("es-AR")} ARS`,
    `📂 <b>Categoría:</b> ${categoryEmoji} ${categoryName}`,
    merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(merchant)}` : "",
    `📅 <b>Fecha:</b> ${date}`,
    ``,
    `¿Todo bien?`,
  ].filter(Boolean).join("\n");

  return {
    text,
    replyMarkup: buildPersonalKeyboard([
      [{ text: "✅ Confirmar", callback_data: "receipt:confirm" }],
      [
        { text: "💰 Editar monto", callback_data: "receipt:edit_amount" },
        { text: "📂 Editar categoría", callback_data: "receipt:edit_category" },
      ],
      [
        { text: "🏪 Editar comercio", callback_data: "receipt:edit_merchant" },
        { text: "❌ Cancelar", callback_data: "receipt:cancel" },
      ],
    ]),
  };
}
```

- [ ] **Step 3: Remove `/confirmar_ticket` and `/cancelar_ticket` command handlers**

Find and remove the entire blocks:
```typescript
if (text === "/confirmar_ticket") { ... }
if (text === "/cancelar_ticket") { ... }
```

These are replaced by `receipt:confirm` and `receipt:cancel` callbacks handled in `personal-callback-handler.ts`.

- [ ] **Step 4: Remove the EDIT LOOP block for `receipt_imports`**

Find and remove the block starting with:
```typescript
// ── EDIT LOOP: free text while a receipt is pending in DB ─────
const pendingEditRows = text && !text.startsWith("/")
    ? await db.select()...
```

This loop parsed free text to edit pending receipts. It's replaced by the new callback-based edit flow.

- [ ] **Step 5: Add `bot_conversation_state` text interception for receipt edits**

In `handleTelegramMessage`, BEFORE the command routing (right after `const month = getActiveMonthArgentina();`), add:

```typescript
// ── Intercept text replies for pending receipt edit states ─────────
if (text && !text.startsWith("/")) {
  let editState = null;
  try { editState = await import("./splits/conversation-state").then(m => m.getConversationState(chatId, String(msg.from.id))); } catch { /* ignore */ }
  
  if (editState?.step === "receipt_edit_amount") {
    const { data: ed } = editState as { data: { import_id: string } };
    const newAmount = parseFloat(text.replace(/[$.]/g, "").replace(",", ".").trim());
    if (isNaN(newAmount) || newAmount <= 0) return { text: "❌ Monto inválido. Enviá solo el número, ej: <code>47000</code>" };

    await db.update(receipt_imports).set({ parsed_amount_ars: newAmount }).where(eq(receipt_imports.id, ed.import_id));
    await import("./splits/conversation-state").then(m => m.clearConversationState(chatId, String(msg.from.id)));

    const rows = await db.select().from(receipt_imports).where(eq(receipt_imports.id, ed.import_id)).limit(1);
    const r = rows[0];
    if (!r) return { text: "❌ Ticket no encontrado." };
    const catRows = r.parsed_category_slug
      ? await db.select().from(categories).where(and(eq(categories.slug, r.parsed_category_slug), eq(categories.group_id, groupId))).limit(1)
      : [];
    return buildReceiptProposalMessage({
      amount_ars: newAmount,
      categoryName: catRows[0]?.name ?? r.parsed_category_slug ?? "sin categoría",
      categoryEmoji: catRows[0]?.emoji ?? "📦",
      merchant: r.parsed_merchant ?? undefined,
      date: r.parsed_date ?? getArgentinaDate().toISOString().slice(0, 10),
      source: "edit",
    });
  }

  if (editState?.step === "receipt_edit_category") {
    const { data: ed } = editState as { data: { import_id: string } };
    const slug = text.trim().toLowerCase().replace(/\s+/g, "_");
    const catRows = await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.group_id, groupId))).limit(1);
    if (!catRows[0]) return { text: `❌ Categoría "<b>${slug}</b>" no encontrada. Intentá con otro nombre.` };

    await db.update(receipt_imports).set({ parsed_category_slug: slug }).where(eq(receipt_imports.id, ed.import_id));
    await import("./splits/conversation-state").then(m => m.clearConversationState(chatId, String(msg.from.id)));

    const rows = await db.select().from(receipt_imports).where(eq(receipt_imports.id, ed.import_id)).limit(1);
    const r = rows[0];
    if (!r?.parsed_amount_ars) return { text: "❌ Ticket no encontrado." };
    return buildReceiptProposalMessage({
      amount_ars: r.parsed_amount_ars,
      categoryName: catRows[0].name,
      categoryEmoji: catRows[0].emoji ?? "📦",
      merchant: r.parsed_merchant ?? undefined,
      date: r.parsed_date ?? getArgentinaDate().toISOString().slice(0, 10),
      source: "edit",
    });
  }

  if (editState?.step === "receipt_edit_merchant") {
    const { data: ed } = editState as { data: { import_id: string } };
    const newMerchant = text.trim().slice(0, 100);
    await db.update(receipt_imports).set({ parsed_merchant: newMerchant }).where(eq(receipt_imports.id, ed.import_id));
    await import("./splits/conversation-state").then(m => m.clearConversationState(chatId, String(msg.from.id)));

    const rows = await db.select().from(receipt_imports).where(eq(receipt_imports.id, ed.import_id)).limit(1);
    const r = rows[0];
    if (!r?.parsed_amount_ars) return { text: "❌ Ticket no encontrado." };
    const catDispRows = r.parsed_category_slug
      ? await db.select().from(categories).where(and(eq(categories.slug, r.parsed_category_slug), eq(categories.group_id, groupId))).limit(1)
      : [];
    return buildReceiptProposalMessage({
      amount_ars: r.parsed_amount_ars,
      categoryName: catDispRows[0]?.name ?? r.parsed_category_slug ?? "sin categoría",
      categoryEmoji: catDispRows[0]?.emoji ?? "📦",
      merchant: newMerchant,
      date: r.parsed_date ?? getArgentinaDate().toISOString().slice(0, 10),
      source: "edit",
    });
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add lib/telegram/handlers.ts
git commit -m "feat: OCR ticket flow uses inline keyboard instead of text commands"
```

---

## Task 6: Refactor `/gasto` and NL `register_expense` to use inline keyboard confirmation

**Files:**
- Modify: `lib/telegram/handlers.ts`

**Strategy:** Instead of registering the transaction immediately, save the pending expense in `bot_conversation_state` and return an inline keyboard for confirmation. The actual registration happens in `personal-callback-handler.ts` when user taps ✅.

- [ ] **Step 1: Add helper `buildExpenseConfirmationMessage` to `handlers.ts`**

Add near the top of the file (after imports):

```typescript
function buildExpenseConfirmationMessage(
  amount_ars: number,
  categoryName: string,
  categoryEmoji: string,
  merchant?: string
): PersonalBotMessage {
  const formatted = amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const lines = [
    `💳 <b>¿Registramos este gasto?</b>`,
    ``,
    `${categoryEmoji} <b>${categoryName}</b>: $${formatted} ARS`,
    merchant ? `🏪 ${escapeHtml(merchant)}` : "",
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
    replyMarkup: buildPersonalKeyboard([
      [
        { text: "✅ Confirmar", callback_data: "expense:confirm" },
        { text: "❌ Cancelar", callback_data: "expense:cancel" },
      ],
    ]),
  };
}
```

- [ ] **Step 2: Replace `/gasto` registration with confirmation keyboard**

In the `/gasto` handler, replace the final `return (await registerTransaction(...)).message` line AND the budget exception block with:

```typescript
    // Budget hard limit — always block
    if (budget && budget.budget_ars > 0) {
      const spentRows = await db
        .select({ total: sum(transactions.amount_ars) })
        .from(transactions)
        .where(and(
          eq(transactions.group_id, groupId),
          eq(transactions.month, month),
          eq(transactions.category_id, cat.id),
          eq(transactions.status, "active")
        ));
      const gastado = Number(spentRows[0]?.total ?? 0);
      const status = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

      if (status === "CLOSED" && budget.hard_limit) {
        return { text: `🔴 ${cat.name} está CERRADA con límite duro. No se puede registrar.` };
      }

      if (gastado + amount_ars > budget.budget_ars && budget.hard_limit) {
        return { text: `🔴 Este gasto excede el presupuesto de ${cat.name} (límite duro). No se puede registrar.` };
      }

      if (status === "CLOSED" && !budget.hard_limit) {
        // Save as pending exception
        const { setConversationState: setState } = await import("./splits/conversation-state");
        await setState(chatId, String(msg.from.id), {
          step: "expense_confirm",
          data: {
            step: "expense_confirm",
            category_id: cat.id,
            category_name: cat.name,
            category_emoji: cat.emoji ?? "📦",
            amount_ars,
            merchant,
            group_id: groupId,
            user_id: userId,
            is_exception: true,
          },
        });
        return {
          text: `⚠️ <b>${cat.name}</b> está CERRADA (sin límite duro).\nGastado: $${gastado.toLocaleString("es-AR")} / $${budget.budget_ars.toLocaleString("es-AR")}\n\n¿Registrar como excepción?`,
          replyMarkup: buildPersonalKeyboard([
            [
              { text: "⚠️ Sí, registrar igual", callback_data: "exception:confirm" },
              { text: "❌ Cancelar", callback_data: "exception:cancel" },
            ],
          ]),
        };
      }
    }

    // Normal case — show confirmation keyboard
    const { setConversationState: setState } = await import("./splits/conversation-state");
    await setState(chatId, String(msg.from.id), {
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: cat.id,
        category_name: cat.name,
        category_emoji: cat.emoji ?? "📦",
        amount_ars,
        merchant,
        group_id: groupId,
        user_id: userId,
        is_exception: false,
      },
    });
    return buildExpenseConfirmationMessage(amount_ars, cat.name, cat.emoji ?? "📦", merchant);
```

- [ ] **Step 3: Replace NL `register_expense` intent block**

Find the `if (parsed.intent === "register_expense")` block near the bottom of `handleTelegramMessage`. Replace the final `return (await registerTransaction(...)).message` line with the same pattern as `/gasto` above — save to state and return confirmation keyboard.

The complete replacement for the `register_expense` block:

```typescript
  if (parsed.intent === "register_expense") {
    const amount_ars = parsed.amount_ars ?? null;
    const slug = parsed.category?.toLowerCase() ?? null;

    if (!amount_ars || amount_ars <= 0) {
      return { text: "Entendí que querés registrar un gasto pero no detecté el monto. Ej: \"gasté 47000 en supermercado\"" };
    }
    if (!slug) {
      return { text: `Entendí $${amount_ars.toLocaleString("es-AR")} pero no detecté la categoría.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos` };
    }

    const cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
    });
    if (!cat) {
      return { text: `No encontré la categoría "${slug}".\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos` };
    }

    const merchant = parsed.merchant ?? parsed.description ?? undefined;

    const budget = await db.query.budgets.findFirst({
      where: and(eq(budgets.group_id, groupId), eq(budgets.month, month), eq(budgets.category_id, cat.id)),
    });

    if (budget && budget.budget_ars > 0) {
      const spentRows = await db
        .select({ total: sum(transactions.amount_ars) })
        .from(transactions)
        .where(and(
          eq(transactions.group_id, groupId),
          eq(transactions.month, month),
          eq(transactions.category_id, cat.id),
          eq(transactions.status, "active")
        ));
      const gastado = Number(spentRows[0]?.total ?? 0);
      const status = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

      if (status === "CLOSED" && budget.hard_limit) {
        return { text: `🔴 ${cat.name} está CERRADA con límite duro. No se puede registrar.` };
      }
      if (gastado + amount_ars > budget.budget_ars && budget.hard_limit) {
        return { text: `🔴 Este gasto excede el presupuesto de ${cat.name} (límite duro). No se puede registrar.` };
      }
      if (status === "CLOSED" && !budget.hard_limit) {
        const { setConversationState: setState } = await import("./splits/conversation-state");
        await setState(chatId, String(msg.from.id), {
          step: "expense_confirm",
          data: { step: "expense_confirm", category_id: cat.id, category_name: cat.name, category_emoji: cat.emoji ?? "📦", amount_ars, merchant, group_id: groupId, user_id: userId, is_exception: true },
        });
        return {
          text: `⚠️ <b>${cat.name}</b> está CERRADA. ¿Registrar como excepción?`,
          replyMarkup: buildPersonalKeyboard([
            [{ text: "⚠️ Sí, registrar igual", callback_data: "exception:confirm" }, { text: "❌ Cancelar", callback_data: "exception:cancel" }],
          ]),
        };
      }
    }

    const { setConversationState: setState } = await import("./splits/conversation-state");
    await setState(chatId, String(msg.from.id), {
      step: "expense_confirm",
      data: { step: "expense_confirm", category_id: cat.id, category_name: cat.name, category_emoji: cat.emoji ?? "📦", amount_ars, merchant, group_id: groupId, user_id: userId, is_exception: false },
    });
    return buildExpenseConfirmationMessage(amount_ars, cat.name, cat.emoji ?? "📦", merchant);
  }
```

- [ ] **Step 4: Remove `pendingExceptions` Map** — it's now replaced by `bot_conversation_state`.

Find and remove:
```typescript
const pendingExceptions = new Map<string, { category_id: string; amount_ars: number; merchant?: string }>();
```

Also remove the `/confirmar` and `/cancelar` command handlers that used `pendingExceptions`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add lib/telegram/handlers.ts
git commit -m "feat: /gasto and NL register_expense show inline keyboard confirmation before registering"
```

---

## Task 7: Deploy and verify

- [ ] **Step 1: Push and wait for Vercel deploy**

```bash
git push origin feature/splits-db-and-balances
# Wait ~50 seconds for build
vercel ls 2>&1 | head -5
```

- [ ] **Step 2: Update webhook to new deployment URL**

```bash
BOT_TOKEN="$(grep TELEGRAM_BOT_TOKEN .env.local | cut -d'"' -f2)"
SECRET="$(grep TELEGRAM_SECRET_TOKEN .env.local | cut -d'"' -f2)"
NEW_URL="https://hermes-finantial-tracker-XXXXX-eindi-acme.vercel.app/api/telegram/webhook"
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${NEW_URL}" \
  -d "secret_token=${SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\"]"
```

- [ ] **Step 3: Manual verification — personal OCR flow**

In personal chat with the bot:
1. Send a photo of a receipt
2. Expected: "🧾 Ticket detectado" + buttons (✅ Confirmar, 💰 Editar monto, 📂 Editar categoría, 🏪 Editar comercio, ❌ Cancelar)
3. Tap "💰 Editar monto" → expected: "✏️ Enviá el nuevo monto:"
4. Type "50000" → expected: updated proposal with new amount + buttons
5. Tap "✅ Confirmar" → expected: transaction confirmation text

- [ ] **Step 4: Manual verification — /gasto command**

In personal chat:
1. Send `/gasto 5000 supermercado Cordiez`
2. Expected: "💳 ¿Registramos este gasto? 🛒 Supermercado: $5.000 ARS 🏪 Cordiez" + [✅ Confirmar] [❌ Cancelar]
3. Tap ✅ → expected: transaction registered, confirmation text

- [ ] **Step 5: Manual verification — NL expense**

In personal chat:
1. Send "gasté 3200 en verdulería"
2. Expected: inline keyboard confirmation
3. Tap ✅ → expected: registered

- [ ] **Step 6: Manual verification — group flow unchanged**

In the Telegram group:
1. Run `/activar` → expected: works as before
2. Send ticket photo → expected: "🔄 Procesando..." + group OCR flow (unchanged)
3. `/compartido 5000 café` → expected: works as before

---

## Self-Review

**Spec coverage:**
- ✅ OCR ticket → inline keyboard (Task 5)
- ✅ `/gasto` → inline keyboard confirmation (Task 6)
- ✅ NL register_expense → inline keyboard confirmation (Task 6)
- ✅ Budget exception → inline keyboard (Task 6)
- ✅ Callbacks wired in route.ts (Task 4)
- ✅ Group flow unchanged (it already uses splits handler)
- ✅ `send-message.ts` supports `replyMarkup` (Task 1)

**Placeholder scan:** No TBDs, TODOs, or vague steps — all code is explicit.

**Type consistency:**
- `PersonalBotMessage` defined in Task 2, used in Tasks 5, 6
- `PendingExpenseState` defined in Task 3, consumed in Task 4
- `receipt:*` callback names consistent between Tasks 3, 5
- `expense:*` and `exception:*` callback names consistent between Tasks 3, 6
- `bot_conversation_state` steps: `receipt_edit_amount`, `receipt_edit_category`, `receipt_edit_merchant`, `expense_confirm` — consistent across Tasks 3, 5, 6
