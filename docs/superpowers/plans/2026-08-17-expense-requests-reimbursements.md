# Solicitud de Gastos Grupal con Reintegro - Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Permitir que miembros de un dashboard registren gastos que opcionalmente requieran reintegro de otros miembros, con notificaciones push vía Telegram y Web.

**Architecture:** Sistema de reintegros donde cualquier gasto puede solicitar reintegro. Cada usuario configura su info de pago (CBU/Alias/efectivo). Al crear un gasto con reintegro, se notifica a miembros del dashboard. El pagador ve datos de transferencia y marca como pagado.

**Tech Stack:** Drizzle ORM, SQLite, Next.js API Routes, Telegram Bot API, Web Push API (Service Worker)

---

## Modelo de Datos

### Nuevas Tablas

1. **user_payment_info** - Información de pago del usuario
   - user_id (FK), payment_method (enum: cbu/alias/efectivo), value (string nullable), is_default (boolean)

2. **reimbursement_requests** - Solicitudes de reintegro
   - id, transaction_id (FK), requester_id (FK), payer_id (FK nullable), amount, status (pending/paid/cancelled), paid_at, created_at

3. **push_subscriptions** - Suscripciones Web Push
   - id, user_id (FK), endpoint, p256dh_key, auth_key, created_at

### Modificaciones

- **transactions**: agregar campo `requires_reimbursement` (boolean, default false)

---

## Task 1: Schema de Base de Datos

**Files:**
- Modify: lib/db/schema.ts (añadir tablas)
- Create: lib/db/migrations/add-reimbursements.sql

### Step 1.1: Agregar enum y tablas al schema

- [ ] En lib/db/schema.ts, después de la línea 210, agregar:

export const paymentMethodEnum = sqliteTable would not work for enum, use text with check
Actually in SQLite we use text. Add after split_payments table:

export const userPaymentInfo = sqliteTable('user_payment_info', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  paymentMethod: text('payment_method').notNull(), // 'cbu' | 'alias' | 'efectivo'
  value: text('value'), // CBU number or alias string, null for efectivo
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const reimbursementRequests = sqliteTable('reimbursement_requests', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').notNull().references(() => transactions.id),
  requesterId: text('requester_id').notNull().references(() => users.id),
  payerId: text('payer_id').references(() => users.id), // null until assigned
  amount: real('amount').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid' | 'cancelled'
  paidAt: text('paid_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull(),
  p256dhKey: text('p256dh_key').notNull(),
  authKey: text('auth_key').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

### Step 1.2: Agregar campo a transactions

- [ ] En transactions table (línea ~59-79), agregar campo:

requiresReimbursement: integer('requires_reimbursement', { mode: 'boolean' }).default(false),

### Step 1.3: Agregar relaciones

- [ ] En la sección de relations, agregar:

export const userPaymentInfoRelations = relations(userPaymentInfo, ({ one }) => ({
  user: one(users, { fields: [userPaymentInfo.userId], references: [users.id] }),
}));

export const reimbursementRequestsRelations = relations(reimbursementRequests, ({ one }) => ({
  transaction: one(transactions, { fields: [reimbursementRequests.transactionId], references: [transactions.id] }),
  requester: one(users, { fields: [reimbursementRequests.requesterId], references: [users.id] }),
  payer: one(users, { fields: [reimbursementRequests.payerId], references: [users.id] }),
}));

### Step 1.4: Correr migración

- [ ] Ejecutar: npm run db:push
- [ ] Verificar que las tablas existen: sqlite3 db.sqlite ".tables"

### Step 1.5: Commit

- [ ] git add lib/db/schema.ts && git commit -m "feat(db): add reimbursement tables and push subscriptions"

---

## Task 2: API de Información de Pago del Usuario

**Files:**
- Create: app/api/user/payment-info/route.ts
- Create: lib/reimbursements/payment-info.ts

### Step 2.1: Crear helper de payment info

- [ ] Crear lib/reimbursements/payment-info.ts:

import { db } from '@/lib/db';
import { userPaymentInfo } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type PaymentMethod = 'cbu' | 'alias' | 'efectivo';

export interface PaymentInfo {
  id: string;
  userId: string;
  paymentMethod: PaymentMethod;
  value: string | null;
  isDefault: boolean;
}

export async function getUserPaymentInfo(userId: string): Promise<PaymentInfo[]> {
  return db.select().from(userPaymentInfo).where(eq(userPaymentInfo.userId, userId));
}

export async function getDefaultPaymentInfo(userId: string): Promise<PaymentInfo | null> {
  const [info] = await db.select().from(userPaymentInfo)
    .where(and(eq(userPaymentInfo.userId, userId), eq(userPaymentInfo.isDefault, true)));
  return info || null;
}

export async function addPaymentInfo(
  userId: string,
  method: PaymentMethod,
  value: string | null,
  isDefault: boolean = false
): Promise<PaymentInfo> {
  const id = nanoid();
  
  // Si es default, quitar default de los demás
  if (isDefault) {
    await db.update(userPaymentInfo)
      .set({ isDefault: false })
      .where(eq(userPaymentInfo.userId, userId));
  }
  
  const [info] = await db.insert(userPaymentInfo).values({
    id,
    userId,
    paymentMethod: method,
    value,
    isDefault,
  }).returning();
  
  return info;
}

export async function deletePaymentInfo(id: string, userId: string): Promise<boolean> {
  const result = await db.delete(userPaymentInfo)
    .where(and(eq(userPaymentInfo.id, id), eq(userPaymentInfo.userId, userId)));
  return result.changes > 0;
}

### Step 2.2: Crear API route

- [ ] Crear app/api/user/payment-info/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserPaymentInfo, addPaymentInfo, deletePaymentInfo, PaymentMethod } from '@/lib/reimbursements/payment-info';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const info = await getUserPaymentInfo(session.user.id);
  return NextResponse.json(info);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const body = await req.json();
  const { method, value, isDefault } = body;
  
  if (!method || !['cbu', 'alias', 'efectivo'].includes(method)) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
  }
  
  if (method !== 'efectivo' && !value) {
    return NextResponse.json({ error: 'Value required for CBU/Alias' }, { status: 400 });
  }
  
  const info = await addPaymentInfo(
    session.user.id,
    method as PaymentMethod,
    method === 'efectivo' ? null : value,
    isDefault ?? false
  );
  
  return NextResponse.json(info);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }
  
  const deleted = await deletePaymentInfo(id, session.user.id);
  return NextResponse.json({ deleted });
}

### Step 2.3: Test manual

- [ ] Iniciar servidor: npm run dev
- [ ] Probar endpoint con curl o desde la web

### Step 2.4: Commit

- [ ] git add -A && git commit -m "feat(api): add user payment info endpoints"

---

## Task 3: Lógica de Reintegros

**Files:**
- Create: lib/reimbursements/requests.ts

### Step 3.1: Crear módulo de reintegros

- [ ] Crear lib/reimbursements/requests.ts:

import { db } from '@/lib/db';
import { reimbursementRequests, transactions, users, groupMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type ReimbursementStatus = 'pending' | 'paid' | 'cancelled';

export interface ReimbursementRequest {
  id: string;
  transactionId: string;
  requesterId: string;
  payerId: string | null;
  amount: number;
  status: ReimbursementStatus;
  paidAt: string | null;
  createdAt: string;
  requester?: { id: string; name: string; email: string };
  transaction?: { description: string; categoryId: string };
}

export async function createReimbursementRequest(
  transactionId: string,
  requesterId: string,
  amount: number,
  payerId?: string
): Promise<ReimbursementRequest> {
  const id = nanoid();
  
  const [request] = await db.insert(reimbursementRequests).values({
    id,
    transactionId,
    requesterId,
    payerId: payerId || null,
    amount,
    status: 'pending',
  }).returning();
  
  return request;
}

export async function getReimbursementsByUser(userId: string): Promise<ReimbursementRequest[]> {
  // Reintegros que el usuario debe pagar o que solicitó
  return db.select({
    id: reimbursementRequests.id,
    transactionId: reimbursementRequests.transactionId,
    requesterId: reimbursementRequests.requesterId,
    payerId: reimbursementRequests.payerId,
    amount: reimbursementRequests.amount,
    status: reimbursementRequests.status,
    paidAt: reimbursementRequests.paidAt,
    createdAt: reimbursementRequests.createdAt,
  })
  .from(reimbursementRequests)
  .where(
    or(
      eq(reimbursementRequests.requesterId, userId),
      eq(reimbursementRequests.payerId, userId)
    )
  )
  .orderBy(desc(reimbursementRequests.createdAt));
}

export async function getPendingReimbursementsForPayer(payerId: string): Promise<ReimbursementRequest[]> {
  return db.select()
    .from(reimbursementRequests)
    .where(and(
      eq(reimbursementRequests.payerId, payerId),
      eq(reimbursementRequests.status, 'pending')
    ))
    .orderBy(desc(reimbursementRequests.createdAt));
}

export async function markReimbursementAsPaid(id: string, payerId: string): Promise<boolean> {
  const result = await db.update(reimbursementRequests)
    .set({ 
      status: 'paid', 
      paidAt: new Date().toISOString() 
    })
    .where(and(
      eq(reimbursementRequests.id, id),
      eq(reimbursementRequests.payerId, payerId)
    ));
  
  return result.changes > 0;
}

export async function cancelReimbursement(id: string, requesterId: string): Promise<boolean> {
  const result = await db.update(reimbursementRequests)
    .set({ status: 'cancelled' })
    .where(and(
      eq(reimbursementRequests.id, id),
      eq(reimbursementRequests.requesterId, requesterId)
    ));
  
  return result.changes > 0;
}

export async function getGroupMembersForReimbursement(groupId: string, excludeUserId: string) {
  return db.select({
    userId: groupMembers.userId,
    name: users.name,
  })
  .from(groupMembers)
  .innerJoin(users, eq(groupMembers.userId, users.id))
  .where(and(
    eq(groupMembers.groupId, groupId),
    not(eq(groupMembers.userId, excludeUserId))
  ));
}

### Step 3.2: Agregar import de or y not

- [ ] Verificar que drizzle-orm exports incluyan or y not

### Step 3.3: Commit

- [ ] git add -A && git commit -m "feat(reimbursements): add core reimbursement request logic"

---

## Task 4: API de Reintegros

**Files:**
- Create: app/api/reimbursements/route.ts
- Create: app/api/reimbursements/[id]/pay/route.ts

### Step 4.1: Crear endpoint principal

- [ ] Crear app/api/reimbursements/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReimbursementsByUser, createReimbursementRequest } from '@/lib/reimbursements/requests';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const reimbursements = await getReimbursementsByUser(session.user.id);
  return NextResponse.json(reimbursements);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const body = await req.json();
  const { transactionId, amount, payerId } = body;
  
  if (!transactionId || !amount) {
    return NextResponse.json({ error: 'transactionId and amount required' }, { status: 400 });
  }
  
  const request = await createReimbursementRequest(
    transactionId,
    session.user.id,
    amount,
    payerId
  );
  
  return NextResponse.json(request);
}

### Step 4.2: Crear endpoint de pago

- [ ] Crear app/api/reimbursements/[id]/pay/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { markReimbursementAsPaid } from '@/lib/reimbursements/requests';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const paid = await markReimbursementAsPaid(params.id, session.user.id);
  
  if (!paid) {
    return NextResponse.json({ error: 'Reimbursement not found or not authorized' }, { status: 404 });
  }
  
  return NextResponse.json({ success: true });
}

### Step 4.3: Commit

- [ ] git add -A && git commit -m "feat(api): add reimbursement endpoints"

---

## Task 5: Notificaciones Telegram para Reintegros

**Files:**
- Modify: lib/telegram/handlers.ts
- Create: lib/notifications/telegram.ts

### Step 5.1: Crear módulo de notificaciones Telegram

- [ ] Crear lib/notifications/telegram.ts:

import { getGroupMembers } from '@/lib/groups/permissions';
import { getUserByTelegramId, getUserById } from '@/lib/users';
import { getDefaultPaymentInfo } from '@/lib/reimbursements/payment-info';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function sendTelegramMessage(chatId: string | number, text: string, options?: any) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...options,
    }),
  });
}

export async function notifyGroupOfReimbursementRequest(
  groupId: string,
  requesterId: string,
  amount: number,
  categoryName: string,
  description: string
) {
  const requester = await getUserById(requesterId);
  const paymentInfo = await getDefaultPaymentInfo(requesterId);
  const members = await getGroupMembers(groupId);
  
  const paymentText = paymentInfo 
    ? paymentInfo.paymentMethod === 'efectivo' 
      ? 'Efectivo'
      : `${paymentInfo.paymentMethod.toUpperCase()}: ${paymentInfo.value}`
    : 'No configurado';
  
  const message = `💸 <b>Solicitud de Reintegro</b>

👤 ${requester?.name || 'Usuario'} gastó <b>$${amount.toLocaleString()}</b>
📁 Categoría: ${categoryName}
📝 ${description}

💳 Datos de pago: ${paymentText}

Usa /reintegros para ver pendientes.`;

  for (const member of members) {
    if (member.userId !== requesterId && member.telegramId) {
      await sendTelegramMessage(member.telegramId, message);
    }
  }
}

export async function notifyReimbursementPaid(
  requesterId: string,
  payerName: string,
  amount: number
) {
  const requester = await getUserById(requesterId);
  
  if (requester?.telegramId) {
    const message = `✅ <b>Reintegro Pagado</b>

${payerName} te ha pagado <b>$${amount.toLocaleString()}</b>

¡Ya está todo saldado! 🎉`;

    await sendTelegramMessage(requester.telegramId, message);
  }
}

### Step 5.2: Agregar comando /reintegros al bot

- [ ] En lib/telegram/handlers.ts, agregar handler para /reintegros (buscar sección de comandos)

### Step 5.3: Commit

- [ ] git add -A && git commit -m "feat(notifications): add Telegram notifications for reimbursements"

---

## Task 6: Web Push Notifications Setup

**Files:**
- Create: public/sw.js (Service Worker)
- Create: lib/notifications/web-push.ts
- Create: app/api/push/subscribe/route.ts
- Create: app/api/push/send/route.ts

### Step 6.1: Generar VAPID keys

- [ ] Ejecutar: npx web-push generate-vapid-keys
- [ ] Agregar a .env.local:
  NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
  VAPID_PRIVATE_KEY=...

### Step 6.2: Crear Service Worker

- [ ] Crear public/sw.js:

self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Nueva notificación',
    icon: '/icon-192.png',
    badge: '/badge.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
    },
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Hermes', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

### Step 6.3: Crear módulo web-push

- [ ] Instalar: npm install web-push
- [ ] Crear lib/notifications/web-push.ts:

import webPush from 'web-push';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

webPush.setVapidDetails(
  'mailto:admin@hermes.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function saveSubscription(userId: string, subscription: PushSubscription) {
  const { endpoint, keys } = subscription as any;
  
  await db.insert(pushSubscriptions).values({
    id: crypto.randomUUID(),
    userId,
    endpoint,
    p256dhKey: keys.p256dh,
    authKey: keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { p256dhKey: keys.p256dh, authKey: keys.auth },
  });
}

export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string }) {
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  
  for (const sub of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
        },
        JSON.stringify(payload)
      );
    } catch (error: any) {
      if (error.statusCode === 410) {
        // Subscription expired, remove it
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}

### Step 6.4: Crear endpoint de suscripción

- [ ] Crear app/api/push/subscribe/route.ts (POST para guardar suscripción)

### Step 6.5: Commit

- [ ] git add -A && git commit -m "feat(notifications): add Web Push infrastructure"

---

## Task 7: Integrar Notificaciones en Flujo de Reintegro

**Files:**
- Modify: lib/reimbursements/requests.ts
- Modify: app/api/reimbursements/[id]/pay/route.ts

### Step 7.1: Disparar notificaciones al crear reintegro

- [ ] En createReimbursementRequest, después de insertar, llamar a notifyGroupOfReimbursementRequest

### Step 7.2: Disparar notificaciones al pagar

- [ ] En markReimbursementAsPaid, después de actualizar, llamar a notifyReimbursementPaid y sendPushToUser

### Step 7.3: Commit

- [ ] git add -A && git commit -m "feat(reimbursements): integrate notifications on create and pay"

---

## Task 8: UI Web - Configuración de Pago

**Files:**
- Create: components/settings/payment-info-form.tsx
- Modify: app/settings/page.tsx (o crear si no existe)

### Step 8.1: Crear componente de formulario

- [ ] Crear components/settings/payment-info-form.tsx con formulario para agregar CBU/Alias/Efectivo

### Step 8.2: Integrar en página de settings

- [ ] Agregar sección "Datos de Pago" en configuración del usuario

### Step 8.3: Commit

- [ ] git add -A && git commit -m "feat(ui): add payment info settings"

---

## Task 9: UI Web - Dashboard de Reintegros

**Files:**
- Create: components/reimbursements/reimbursements-list.tsx
- Create: app/reimbursements/page.tsx

### Step 9.1: Crear lista de reintegros

- [ ] Crear componente que muestre reintegros pendientes y pagados, con botón "Marcar como pagado"

### Step 9.2: Crear página de reintegros

- [ ] Crear app/reimbursements/page.tsx

### Step 9.3: Agregar link en navegación

- [ ] Agregar link a /reimbursements en el menú lateral

### Step 9.4: Commit

- [ ] git add -A && git commit -m "feat(ui): add reimbursements dashboard"

---

## Task 10: Extensión de Transacciones para Reintegro

**Files:**
- Modify: app/api/transactions/route.ts
- Modify: components/transactions/transaction-form.tsx

### Step 10.1: Aceptar flag de reintegro en API

- [ ] En POST de transactions, aceptar `requiresReimbursement` y guardarlo

### Step 10.2: Crear reintegro automático si flag está activo

- [ ] Si requiresReimbursement es true, crear ReimbursementRequest después de guardar transacción

### Step 10.3: Agregar checkbox en formulario web

- [ ] En transaction-form.tsx, agregar checkbox "Requiere reintegro"

### Step 10.4: Commit

- [ ] git add -A && git commit -m "feat(transactions): add reimbursement flag to transaction creation"

---

## Task 11: Comandos Telegram para Reintegros

**Files:**
- Modify: lib/telegram/handlers.ts

### Step 11.1: Agregar comando /reintegros

- [ ] Listar reintegros pendientes del usuario (que debe pagar y que solicitó)

### Step 11.2: Agregar callback para marcar como pagado

- [ ] Agregar inline keyboard con botón "✅ Pagado" que llama a markReimbursementAsPaid

### Step 11.3: Agregar flujo de gasto con reintegro

- [ ] Cuando usuario registra gasto, preguntar si requiere reintegro con inline keyboard

### Step 11.4: Commit

- [ ] git add -A && git commit -m "feat(telegram): add reimbursement commands"

---

## Task 12: Tests

**Files:**
- Create: __tests__/lib/reimbursements/requests.test.ts
- Create: __tests__/api/reimbursements.test.ts

### Step 12.1: Tests unitarios de lógica

- [ ] Test createReimbursementRequest
- [ ] Test markReimbursementAsPaid
- [ ] Test getReimbursementsByUser

### Step 12.2: Tests de API

- [ ] Test endpoints GET/POST de reimbursements
- [ ] Test endpoint de pay

### Step 12.3: Commit

- [ ] git add -A && git commit -m "test: add reimbursement tests"

---

## Task 13: Documentación

**Files:**
- Modify: README.md

### Step 13.1: Documentar feature

- [ ] Agregar sección "Reintegros" explicando el flujo

### Step 13.2: Documentar variables de entorno

- [ ] Agregar VAPID keys a .env.example

### Step 13.3: Commit final

- [ ] git add -A && git commit -m "docs: add reimbursement feature documentation"

---

## Resumen de Entregables

1. **Base de datos**: 3 tablas nuevas (user_payment_info, reimbursement_requests, push_subscriptions)
2. **APIs**: /user/payment-info, /reimbursements, /reimbursements/[id]/pay, /push/subscribe
3. **Notificaciones**: Telegram + Web Push cuando se crea o paga un reintegro
4. **Bot**: Comandos /reintegros, flujo de gasto con reintegro
5. **Web**: Settings de pago, dashboard de reintegros, checkbox en form de transacción
6. **Tests**: Unitarios y de integración

