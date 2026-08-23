# Recurring Expenses Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a notification system that reminds users about pending recurring expenses before due date, alerts when overdue, and clearly shows payment status in UI.

**Architecture:** Vercel cron job runs daily at 8:00 AM checking for upcoming (3 days) and overdue payments. Telegram notifications sent with action buttons. Web UI shows clear status badges (pending/paid/overdue). Status tracked per-execution with `status` field.

**Tech Stack:** Next.js API routes, Vercel Cron, Telegram Bot API, React components, Turso/SQLite

---

## File Structure

| File | Purpose |
|------|---------|
| `app/api/cron/recurring-reminders/route.ts` | NEW: Daily cron for reminder notifications |
| `lib/db/recurring-queries.ts` | MODIFY: Add getUpcomingExecutions, getOverdueExecutions |
| `lib/telegram/handlers.ts` | MODIFY: Show payment status in list message |
| `components/recurring/recurring-list.tsx` | MODIFY: Add status badges, paid indicator |
| `vercel.json` | MODIFY: Add daily cron schedule |

---

### Task 1: Add Query Functions for Notifications

**Files:**
- Modify: `lib/db/recurring-queries.ts`

- [ ] **Step 1: Add getUpcomingExecutions function**

```typescript
/**
 * Get executions due within N days
 */
export async function getUpcomingExecutions(
  days: number = 3
): Promise<Array<{ userId: string; telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>> {
  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + days);
  const targetDateStr = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD
  
  // Get all pending executions with scheduled_date within range
  const results = await db
    .select({
      execId: recurringExecutions.id,
      recurringExpenseId: recurringExecutions.recurringExpenseId,
      scheduledDate: recurringExecutions.scheduledDate,
      status: recurringExecutions.status,
      amountArs: recurringExecutions.amountArs,
      createdAt: recurringExecutions.createdAt,
      recurringName: recurringExpenses.name,
      recurringAmount: recurringExpenses.amountArs,
      recurringMerchant: recurringExpenses.merchant,
      recurringCategoryId: recurringExpenses.categoryId,
      recurringUserId: recurringExpenses.userId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
      userTelegramId: users.telegram_user_id,
    })
    .from(recurringExecutions)
    .innerJoin(recurringExpenses, eq(recurringExecutions.recurringExpenseId, recurringExpenses.id))
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .innerJoin(users, eq(recurringExpenses.userId, users.id))
    .where(
      and(
        eq(recurringExecutions.status, "pending"),
        eq(recurringExecutions.scheduledDate, targetDateStr)
      )
    );

  // Group by user
  const byUser = new Map<string, { telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>();
  
  for (const r of results) {
    if (!byUser.has(r.recurringUserId)) {
      byUser.set(r.recurringUserId, { telegramUserId: r.userTelegramId, executions: [] });
    }
    byUser.get(r.recurringUserId)!.executions.push({
      id: r.execId,
      recurringExpenseId: r.recurringExpenseId,
      transactionId: null,
      scheduledDate: r.scheduledDate,
      executedAt: null,
      status: r.status as "pending",
      amountArs: r.amountArs,
      createdAt: r.createdAt,
      recurringExpense: {
        id: r.recurringExpenseId,
        name: r.recurringName,
        amountArs: r.recurringAmount,
        merchant: r.recurringMerchant,
        category: r.categoryName ? {
          id: r.recurringCategoryId!,
          name: r.categoryName,
          emoji: r.categoryEmoji!,
          slug: r.categorySlug!,
        } : null,
      },
    });
  }

  return Array.from(byUser.entries()).map(([userId, data]) => ({
    userId,
    ...data,
  }));
}
```

- [ ] **Step 2: Add getOverdueExecutions function**

```typescript
/**
 * Get executions that are past due date and still pending
 */
export async function getOverdueExecutions(): Promise<Array<{ userId: string; telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>> {
  const today = new Date().toISOString().slice(0, 10);
  
  const results = await db
    .select({
      execId: recurringExecutions.id,
      recurringExpenseId: recurringExecutions.recurringExpenseId,
      scheduledDate: recurringExecutions.scheduledDate,
      status: recurringExecutions.status,
      amountArs: recurringExecutions.amountArs,
      createdAt: recurringExecutions.createdAt,
      recurringName: recurringExpenses.name,
      recurringAmount: recurringExpenses.amountArs,
      recurringMerchant: recurringExpenses.merchant,
      recurringCategoryId: recurringExpenses.categoryId,
      recurringUserId: recurringExpenses.userId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
      userTelegramId: users.telegram_user_id,
    })
    .from(recurringExecutions)
    .innerJoin(recurringExpenses, eq(recurringExecutions.recurringExpenseId, recurringExpenses.id))
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .innerJoin(users, eq(recurringExpenses.userId, users.id))
    .where(
      and(
        eq(recurringExecutions.status, "pending"),
        sql`${recurringExecutions.scheduledDate} < ${today}`
      )
    );

  // Group by user (same logic as above)
  const byUser = new Map<string, { telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>();
  
  for (const r of results) {
    if (!byUser.has(r.recurringUserId)) {
      byUser.set(r.recurringUserId, { telegramUserId: r.userTelegramId, executions: [] });
    }
    byUser.get(r.recurringUserId)!.executions.push({
      id: r.execId,
      recurringExpenseId: r.recurringExpenseId,
      transactionId: null,
      scheduledDate: r.scheduledDate,
      executedAt: null,
      status: r.status as "pending",
      amountArs: r.amountArs,
      createdAt: r.createdAt,
      recurringExpense: {
        id: r.recurringExpenseId,
        name: r.recurringName,
        amountArs: r.recurringAmount,
        merchant: r.recurringMerchant,
        category: r.categoryName ? {
          id: r.recurringCategoryId!,
          name: r.categoryName,
          emoji: r.categoryEmoji!,
          slug: r.categorySlug!,
        } : null,
      },
    });
  }

  return Array.from(byUser.entries()).map(([userId, data]) => ({
    userId,
    ...data,
  }));
}
```

- [ ] **Step 3: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add lib/db/recurring-queries.ts
git commit -m "feat: add upcoming and overdue execution queries"
```

---

### Task 2: Create Daily Reminder Cron

**Files:**
- Create: `app/api/cron/recurring-reminders/route.ts`

- [ ] **Step 1: Create the cron endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getUpcomingExecutions, getOverdueExecutions } from "@/lib/db/recurring-queries";
import { sendTelegramMessage, buildPersonalKeyboard } from "@/lib/telegram/send-message";

/**
 * GET /api/cron/recurring-reminders
 * Daily cron job to send reminders for upcoming and overdue recurring expenses
 * 
 * Runs daily at 8:00 AM Argentina time
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let remindersSent = 0;
    let overdueSent = 0;

    // 1. Send reminders for payments due in 3 days
    const upcoming = await getUpcomingExecutions(3);
    for (const user of upcoming) {
      if (user.telegramUserId && user.executions.length > 0) {
        const message = formatUpcomingReminder(user.executions);
        const keyboard = buildPersonalKeyboard([
          [
            { text: "✅ Ver Pendientes", callback_data: "recurring:pending" },
            { text: "📋 Mis Recurrentes", callback_data: "recurring:list" },
          ],
        ]);
        await sendTelegramMessage(user.telegramUserId, message, keyboard);
        remindersSent++;
      }
    }

    // 2. Send alerts for overdue payments
    const overdue = await getOverdueExecutions();
    for (const user of overdue) {
      if (user.telegramUserId && user.executions.length > 0) {
        const message = formatOverdueAlert(user.executions);
        const keyboard = buildPersonalKeyboard([
          [
            { text: "✅ Pagar ahora", callback_data: "recurring:pending" },
            { text: "⏭️ Saltar", callback_data: "recurring:pending" },
          ],
        ]);
        await sendTelegramMessage(user.telegramUserId, message, keyboard);
        overdueSent++;
      }
    }

    return NextResponse.json({
      success: true,
      remindersSent,
      overdueSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Reminder cron error:", error);
    return NextResponse.json(
      { error: "Error en cron de recordatorios" },
      { status: 500 }
    );
  }
}

function formatUpcomingReminder(executions: Array<{ recurringExpense: { name: string; amountArs: number; category: { emoji: string } | null }; amountArs: number | null; scheduledDate: string }>): string {
  const total = executions.reduce((sum, e) => sum + (e.amountArs ?? e.recurringExpense.amountArs), 0);
  
  const lines = [
    "⏰ <b>Recordatorio de Pagos</b>\n",
    `Tienes ${executions.length} pago${executions.length > 1 ? "s" : ""} que vence${executions.length > 1 ? "n" : ""} en 3 días:\n`,
  ];

  executions.forEach((e) => {
    const emoji = e.recurringExpense.category?.emoji ?? "📦";
    const amount = e.amountArs ?? e.recurringExpense.amountArs;
    const day = e.scheduledDate.slice(-2);
    lines.push(`${emoji} ${e.recurringExpense.name} - $${amount.toLocaleString("es-AR")} (día ${parseInt(day)})`);
  });

  lines.push(`\n<b>Total: $${total.toLocaleString("es-AR")}</b>`);
  return lines.join("\n");
}

function formatOverdueAlert(executions: Array<{ recurringExpense: { name: string; amountArs: number; category: { emoji: string } | null }; amountArs: number | null; scheduledDate: string }>): string {
  const total = executions.reduce((sum, e) => sum + (e.amountArs ?? e.recurringExpense.amountArs), 0);
  
  const lines = [
    "🚨 <b>Pagos Vencidos</b>\n",
    `Tienes ${executions.length} pago${executions.length > 1 ? "s" : ""} vencido${executions.length > 1 ? "s" : ""} sin confirmar:\n`,
  ];

  executions.forEach((e) => {
    const emoji = e.recurringExpense.category?.emoji ?? "📦";
    const amount = e.amountArs ?? e.recurringExpense.amountArs;
    const daysOverdue = Math.floor((Date.now() - new Date(e.scheduledDate).getTime()) / (1000 * 60 * 60 * 24));
    lines.push(`${emoji} ${e.recurringExpense.name} - $${amount.toLocaleString("es-AR")} (${daysOverdue}d vencido)`);
  });

  lines.push(`\n<b>Total pendiente: $${total.toLocaleString("es-AR")}</b>`);
  lines.push(`\nMarcá como pagado o saltá este mes para detener las alertas.`);
  return lines.join("\n");
}
```

- [ ] **Step 2: Run build to verify**

Run: `npm run build`
Expected: Build succeeds with new cron route

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/recurring-reminders/route.ts
git commit -m "feat: add daily reminder cron for recurring expenses"
```

---

### Task 3: Add Cron Schedule to Vercel

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Check existing vercel.json or create**

If exists, add to crons array. If not, create:

```json
{
  "crons": [
    {
      "path": "/api/cron/recurring",
      "schedule": "0 11 1 * *"
    },
    {
      "path": "/api/cron/recurring-reminders",
      "schedule": "0 11 * * *"
    }
  ]
}
```

Note: `0 11 * * *` = 11:00 UTC = 8:00 AM Argentina (UTC-3)

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: add daily cron schedule for recurring reminders"
```

---

### Task 4: Update Bot List Message with Payment Status

**Files:**
- Modify: `lib/telegram/handlers.ts`

- [ ] **Step 1: Update buildRecurringListMessage to show confirmed payments**

Find the function `buildRecurringListMessage` and modify the active list section:

```typescript
// After showing active expenses, show confirmed this month
if (stats.confirmedThisMonth > 0) {
  lines.push(`<b>✅ Pagados este mes:</b> ${stats.confirmedThisMonth}`);
  lines.push(``);
}
```

- [ ] **Step 2: Update buildPendingRecurringMessage to show due date context**

In pending message, show days until due or overdue:

```typescript
pending.forEach((e, i) => {
  const emoji = e.recurringExpense.category?.emoji ?? "📦";
  const amount = e.amountArs ?? e.recurringExpense.amountArs;
  const dueDate = new Date(e.scheduledDate);
  const today = new Date();
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  let dueText = "";
  if (diffDays < 0) {
    dueText = ` <b>⚠️ ${Math.abs(diffDays)}d vencido</b>`;
  } else if (diffDays === 0) {
    dueText = " <b>⚡ Hoy</b>";
  } else if (diffDays <= 3) {
    dueText = ` (en ${diffDays}d)`;
  }
  
  lines.push(`${i + 1}. ${emoji} ${e.recurringExpense.name} - $${amount.toLocaleString("es-AR")}${dueText}`);
});
```

- [ ] **Step 3: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add lib/telegram/handlers.ts
git commit -m "feat: show payment status and due dates in bot messages"
```

---

### Task 5: Update Web UI with Status Badges

**Files:**
- Modify: `components/recurring/recurring-list.tsx`

- [ ] **Step 1: Add status badge component**

Add after the imports:

```typescript
function StatusBadge({ status, scheduledDate }: { status: string; scheduledDate: string }) {
  const today = new Date();
  const due = new Date(scheduledDate);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (status === "confirmed") {
    return (
      <span style={{
        background: "#10b981",
        color: "white",
        padding: "2px 8px",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: 600,
      }}>
        ✓ Pagado
      </span>
    );
  }

  if (status === "skipped") {
    return (
      <span style={{
        background: "#6b7280",
        color: "white",
        padding: "2px 8px",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: 600,
      }}>
        Saltado
      </span>
    );
  }

  // Pending
  if (diffDays < 0) {
    return (
      <span style={{
        background: "#ef4444",
        color: "white",
        padding: "2px 8px",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: 600,
      }}>
        ⚠️ Vencido ({Math.abs(diffDays)}d)
      </span>
    );
  }

  if (diffDays <= 3) {
    return (
      <span style={{
        background: "#f59e0b",
        color: "white",
        padding: "2px 8px",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: 600,
      }}>
        Vence en {diffDays}d
      </span>
    );
  }

  return (
    <span style={{
      background: "#3b82f6",
      color: "white",
      padding: "2px 8px",
      borderRadius: "12px",
      fontSize: "11px",
      fontWeight: 600,
    }}>
      Pendiente
    </span>
  );
}
```

- [ ] **Step 2: Update pending section to show status badges**

In the pending executions section, add the badge:

```typescript
{pending.map((exec) => {
  const emoji = exec.recurringExpense.category?.emoji ?? "📦";
  const amount = exec.amountArs ?? exec.recurringExpense.amountArs;
  
  return (
    <div key={exec.id} style={/* existing styles */}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span>{emoji}</span>
        <span style={{ fontWeight: 500 }}>{exec.recurringExpense.name}</span>
        <StatusBadge status={exec.status} scheduledDate={exec.scheduledDate} />
      </div>
      <span style={{ fontWeight: 600 }}>${amount.toLocaleString("es-AR")}</span>
      {/* action buttons */}
    </div>
  );
})}
```

- [ ] **Step 3: Add "Pagados este mes" section**

After pending section, show confirmed payments:

```typescript
{/* Confirmed This Month */}
{stats && stats.confirmedThisMonth > 0 && (
  <div style={cardStyle}>
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
      <CheckCircle size={20} color="#10b981" />
      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
        Pagados este mes ({stats.confirmedThisMonth})
      </h3>
    </div>
    <p style={{ color: "var(--htext2)", fontSize: "14px", margin: 0 }}>
      ✓ Confirmaste {stats.confirmedThisMonth} pago{stats.confirmedThisMonth > 1 ? "s" : ""} este mes
    </p>
  </div>
)}
```

- [ ] **Step 4: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add components/recurring/recurring-list.tsx
git commit -m "feat: add status badges and paid section to recurring UI"
```

---

### Task 6: Integration Testing

**Files:**
- Test endpoints manually

- [ ] **Step 1: Test reminder cron locally**

```bash
curl "http://localhost:3000/api/cron/recurring-reminders"
```

Expected: JSON response with `success: true`

- [ ] **Step 2: Test via bot**

1. Send "pendientes" → should show pending with due date context
2. Confirm one → should register transaction
3. Send "recurrentes" → should show "Pagados este mes: 1"

- [ ] **Step 3: Test web UI**

1. Go to `/dashboard/recurrentes`
2. Verify status badges show correctly
3. Verify "Pagados este mes" section appears after confirming

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete recurring notifications system"
git push origin main
```

---

## Summary

This plan implements:
1. **Reminder notifications** - 3 days before due date
2. **Overdue alerts** - Daily until paid/skipped
3. **Status badges** - Visual indicators in web and bot
4. **Paid tracking** - Clear indication of confirmed payments
5. **Alert termination** - Stops when paid, skipped, paused, or deleted

The cron runs daily at 8 AM Argentina time. Users get one reminder 3 days before, then daily overdue alerts until they act.
