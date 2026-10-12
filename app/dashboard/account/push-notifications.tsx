"use client";

import { useEffect, useState } from "react";

type PushState = "loading" | "unsupported" | "available" | "existing" | "subscribed" | "busy";

function isPushSupported(): boolean {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "No se pudo actualizar las notificaciones.";
}

/** Converts URL-safe VAPID encoding into bytes accepted by PushManager. */
export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function PushNotificationsSection() {
  const [state, setState] = useState<PushState>("loading");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isPushSupported()) {
      Promise.resolve().then(() => {
        if (!cancelled) setState("unsupported");
      });
      return () => { cancelled = true; };
    }

    navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setState(subscription ? "existing" : "available");
      })
      .catch(() => {
        if (!cancelled) setState("available");
      });
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }
    const previousState = state;
    setState("busy");
    setMessage(null);
    let createdSubscription: PushSubscription | null = null;
    try {
      const keyResponse = await fetch("/api/push/subscribe");
      const keyData = await keyResponse.json().catch(() => null);
      if (!keyResponse.ok || typeof keyData?.publicKey !== "string") {
        throw new Error(keyData?.error ?? "Las notificaciones no están disponibles.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("No otorgaste permiso para recibir notificaciones.");
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(keyData.publicKey),
        });
        createdSubscription = subscription;
      }
      const saveResponse = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const saveData = await saveResponse.json().catch(() => null);
      if (!saveResponse.ok) throw new Error(saveData?.error ?? "No se pudo guardar la suscripción.");
      setState("subscribed");
      setMessage({ type: "ok", text: "Dispositivo preparado. Los envíos beta siguen apagados." });
    } catch (error) {
      const removedNewSubscription = createdSubscription
        ? await createdSubscription.unsubscribe().catch(() => false)
        : false;
      setState(createdSubscription ? (removedNewSubscription ? "available" : "existing") : previousState);
      setMessage({ type: "err", text: errorMessage(error) });
    }
  }

  async function disable() {
    const previousState = state;
    setState("busy");
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error ?? "No se pudo desactivar la suscripción.");
        }
        if (!await subscription.unsubscribe()) {
          throw new Error("No se pudo revocar la suscripción del navegador. Volvé a intentar.");
        }
      }
      setState("available");
      setMessage({ type: "ok", text: "Suscripción revocada en este navegador." });
    } catch (error) {
      setState(previousState);
      setMessage({ type: "err", text: errorMessage(error) });
    }
  }

  const busy = state === "loading" || state === "busy";

  return (
    <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--htext1)", marginBottom: 4 }}>Notificaciones del navegador</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--htext2)", margin: "0 0 16px" }}>
        Prepará este navegador para una futura prueba beta. Todavía no se envían avisos; el permiso solo se pide cuando tocás el botón.
      </p>
      {state === "unsupported" ? (
        <p role="status" style={{ fontSize: "0.82rem", color: "var(--htext3)", margin: 0 }}>Este navegador no admite notificaciones web.</p>
      ) : state === "subscribed" ? (
        <button type="button" onClick={disable} disabled={busy} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: busy ? "not-allowed" : "pointer", fontSize: "0.88rem", fontWeight: 600 }}>
          {busy ? "Actualizando..." : "Desactivar notificaciones"}
        </button>
      ) : (
        <div>
          {state === "existing" ? (
            <p style={{ fontSize: "0.82rem", color: "var(--htext2)", margin: "0 0 12px" }}>
              Hay una suscripción en este navegador, pero puede pertenecer a otra cuenta. Elegí si querés asociarla a la tuya o revocarla.
            </p>
          ) : null}
          <button type="button" onClick={enable} disabled={busy} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: busy ? "var(--htext3)" : "var(--haccent)", color: "white", cursor: busy ? "not-allowed" : "pointer", fontSize: "0.88rem", fontWeight: 600 }}>
            {busy ? "Actualizando..." : state === "existing" ? "Preparar para esta cuenta" : "Preparar este dispositivo"}
          </button>
          {state === "existing" ? (
            <button type="button" onClick={disable} style={{ marginLeft: 8, padding: "9px 14px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.85rem" }}>
              Revocar en este navegador
            </button>
          ) : null}
        </div>
      )}
      {message && <p role="status" style={{ fontSize: "0.82rem", margin: "10px 0 0", color: message.type === "ok" ? "var(--hgreen)" : "var(--hred)" }}>{message.text}</p>}
    </section>
  );
}
