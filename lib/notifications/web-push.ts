import webPush from "web-push";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { getNotificationsRuntimeMode } from "@/lib/runtime/notifications";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails("mailto:admin@hermes.app", vapidPublicKey, vapidPrivateKey);
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Fail closed if an endpoint is absent or has ambiguous ownership. */
export async function isSubscriptionOwnedByUser(userId: string, endpoint: string): Promise<boolean> {
  const matches = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(2);

  return matches.length === 1 && matches[0].userId === userId;
}

export async function saveSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        userId,
        p256dhKey: subscription.keys.p256dh,
        authKey: subscription.keys.auth,
      })
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    return;
  }

  await db.insert(pushSubscriptions).values({
    id: nanoid(),
    userId,
    endpoint: subscription.endpoint,
    p256dhKey: subscription.keys.p256dh,
    authKey: subscription.keys.auth,
  });
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  // An explicit beta off switch must also fence legacy best-effort call sites.
  // The enabled durable lane owns all sends; never bypass its canary fence.
  // Missing preserves historical behavior outside the beta rollout.
  if (getNotificationsRuntimeMode() !== "enabled" || process.env.WEB_PUSH_ENABLED !== undefined) return;

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("VAPID keys not configured, skipping web push");
    return;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dhKey,
            auth: subscription.authKey,
          },
        },
        JSON.stringify(payload),
      );
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        (error.statusCode === 404 || error.statusCode === 410)
      ) {
        await db.delete(pushSubscriptions).where(and(
          eq(pushSubscriptions.id, subscription.id),
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, subscription.endpoint),
        ));
      } else {
        // Provider errors can contain endpoint and request details. Keep logs redacted.
        console.error("Web push failed", { code: "provider_error" });
      }
    }
  }
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(
    eq(pushSubscriptions.userId, userId),
    eq(pushSubscriptions.endpoint, endpoint),
  ));
}
