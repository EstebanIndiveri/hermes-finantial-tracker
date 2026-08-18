import webPush from "web-push";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

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
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      } else {
        console.error("Web push failed:", error);
      }
    }
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
