"use client";

import { useEffect, useState } from "react";
import { Skel } from "@/components/ui/Skeleton";

type Kind = "dailySummary" | "recurring" | "reimbursements";
type Preferences = Record<Kind, boolean>;

const choices: { kind: Kind; label: string; description: string }[] = [
  { kind: "dailySummary", label: "Resumen diario", description: "Balance y alertas de tu grupo activo, solo a tu Telegram privado." },
  { kind: "recurring", label: "Pagos recurrentes", description: "Avisos de inicio de mes, próximos vencimientos y pagos atrasados." },
  { kind: "reimbursements", label: "Reintegros pendientes", description: "Recordatorios de solicitudes donde sos el pagador asignado." },
];

function isPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return choices.every(({ kind }) => typeof item[kind] === "boolean");
}

async function fetchPreferences(): Promise<Preferences> {
  const response = await fetch("/api/notifications/preferences", { cache: "no-store" });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !isPreferences(data)) throw new Error("Preferencias no disponibles");
  return data;
}

export function ProactiveNotificationsSection() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<Kind | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      setPreferences(await fetchPreferences());
    } catch {
      setPreferences(null);
      setMessage({ type: "err", text: "No se pudieron cargar tus preferencias. Reintentá." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchPreferences()
      .then((data) => { if (active) setPreferences(data); })
      .catch(() => {
        if (active) {
          setPreferences(null);
          setMessage({ type: "err", text: "No se pudieron cargar tus preferencias. Reintentá." });
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function update(kind: Kind, enabled: boolean) {
    if (!preferences || busyKind) return;
    setBusyKind(kind);
    setMessage(null);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, enabled }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isPreferences(data)) throw new Error("No se pudo guardar el cambio.");
      setPreferences(data);
      setMessage({ type: "ok", text: enabled ? "Preferencia guardada. Recibirás avisos solo si este tipo de envío está habilitado para tu cuenta y grupo." : "Preferencia desactivada." });
    } catch {
      setMessage({ type: "err", text: "No se pudo guardar el cambio. Tu preferencia anterior sigue vigente." });
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--htext1)", margin: 0 }}>Avisos proactivos de Telegram</h2>
      <p style={{ fontSize: "0.82rem", lineHeight: 1.5, color: "var(--htext2)", margin: "5px 0 14px" }}>
        Elegí qué avisos querés recibir. Estas opciones están desmarcadas por defecto y los avisos solo llegan a tu Telegram vinculado.
      </p>
      <p style={{ fontSize: "0.78rem", color: "var(--htext2)", margin: "0 0 16px" }}>
        En este piloto, el resumen diario solo se envía a cuentas y grupos de prueba habilitados. Los avisos proactivos de pagos recurrentes y reintegros siguen apagados. Guardar una preferencia no envía un aviso ahora.
      </p>

      {loading ? (
        <div aria-label="Cargando preferencias" style={{ display: "grid", gap: 10 }}>
          <Skel w="100%" h={40} r={8} /><Skel w="100%" h={40} r={8} /><Skel w="100%" h={40} r={8} />
        </div>
      ) : preferences ? (
        <fieldset disabled={busyKind !== null} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="sr-only">Tipos de avisos proactivos</legend>
          <div style={{ display: "grid", gap: 0 }}>
            {choices.map(({ kind, label, description }, index) => (
              <label key={kind} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: index ? "1px solid var(--hborder)" : "none", cursor: busyKind ? "wait" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={preferences[kind]}
                  onChange={(event) => void update(kind, event.target.checked)}
                  style={{ width: 18, height: 18, margin: "2px 0 0", flexShrink: 0, accentColor: "var(--haccent)" }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, color: "var(--htext1)" }}>{label}</span>
                  <span style={{ display: "block", fontSize: "0.78rem", lineHeight: 1.5, color: "var(--htext2)", marginTop: 2 }}>{description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <button type="button" onClick={() => void load()} style={{ padding: "8px 14px", border: "1px solid var(--hborder)", borderRadius: 8, background: "var(--hsurface2)", color: "var(--htext1)", cursor: "pointer" }}>
          Reintentar
        </button>
      )}

      {message && <p role="status" style={{ color: message.type === "ok" ? "var(--hgreen)" : "var(--hred)", fontSize: "0.8rem", margin: "12px 0 0" }}>{message.text}</p>}
    </section>
  );
}
