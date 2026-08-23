"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Skel } from "@/components/ui/Skeleton";
import { PaymentInfoForm } from "@/components/settings/payment-info-form";

// ── Change name ─────────────────────────────────────────────────
function ChangeNameSection({ initialName, onSaved }: { initialName: string; onSaved: (name: string) => void }) {
  const [nameOpen, setNameOpen] = useState(false);
  const [nameVal, setNameVal] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    setNameSaving(true); setNameMsg(null);
    try {
      const res = await fetch("/api/auth/me/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal }),
      });
      const data = await res.json();
      if (!res.ok) { setNameMsg({ type: "err", text: data.error ?? "Error al guardar." }); return; }
      setNameMsg({ type: "ok", text: "Nombre actualizado." });
      onSaved(nameVal);
      setNameOpen(false);
    } catch {
      setNameMsg({ type: "err", text: "Error de red." });
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setNameOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--haccent)", fontSize: "0.88rem", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
      >
        ✏️ Cambiar nombre
      </button>
      {nameOpen && (
        <form onSubmit={handleNameSave} style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <input
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            maxLength={50}
            style={{
              flex: 1, minWidth: 140,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--hborder)",
              background: "var(--hsurface2)",
              color: "var(--htext1)",
              fontSize: "16px",
              outline: "none",
              boxSizing: "border-box" as const,
              marginBottom: 8,
            }}
          />
          {nameMsg && (
            <div style={{ width: "100%", fontSize: "0.82rem", color: nameMsg.type === "ok" ? "var(--hsuccess)" : "var(--herror)", marginBottom: 8 }}>
              {nameMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={nameSaving}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--haccent)",
              color: "#fff",
              fontSize: "0.85rem",
              cursor: nameSaving ? "not-allowed" : "pointer",
            }}
          >
            {nameSaving ? "Guardando..." : "Guardar nombre"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Mi cuenta ────────────────────────────────────────────────────
function MiCuenta() {
  const [user, setUser] = useState<{ name: string; has_personal_token: boolean } | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [newTok, setNewTok] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(data => { setUser(data); setLoadingUser(false); });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newTok.length < 8) { setMsg({ type: "err", text: "La nueva contraseña debe tener al menos 8 caracteres." }); return; }
    if (newTok !== confirm) { setMsg({ type: "err", text: "Las contraseñas no coinciden." }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me/token", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_token: current, new_token: newTok }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: data.error ?? "Error al guardar." }); return; }
      setMsg({ type: "ok", text: "Contraseña actualizada correctamente." });
      setCurrent(""); setNewTok(""); setConfirm("");
      setUser(u => u ? { ...u, has_personal_token: true } : u);
      setOpen(false);
    } catch {
      setMsg({ type: "err", text: "Error de red." });
    } finally {
      setSaving(false);
    }
  }

  if (loadingUser) return (
    <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, marginBottom: 20, padding: "16px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><Skel w={140} h={14} mb={8} /><Skel w={200} h={13} /></div>
        <Skel w={16} h={16} r={8} />
      </div>
    </section>
  );
  if (!user) return null;

  return (
    <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--htext1)" }}>Mi cuenta</div>
          <div style={{ fontSize: "0.82rem", color: "var(--htext2)", marginTop: 2 }}>Hola, <strong>{user.name}</strong>{user.has_personal_token ? " · contraseña configurada" : " · sin contraseña configurada"}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--htext3)" strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 24px 20px", borderTop: "1px solid var(--hborder)" }}>
          <ChangeNameSection
            initialName={user.name}
            onSaved={(newName) => setUser(u => u ? { ...u, name: newName } : u)}
          />
          <hr style={{ border: "none", borderTop: "1px solid var(--hborder)", margin: "12px 0" }} />
          {!user.has_personal_token && (
            <div style={{ background: "var(--hyellow-soft)", border: "1px solid var(--hyellow)", borderRadius: 8, padding: "10px 14px", margin: "16px 0", fontSize: "0.82rem", color: "var(--hyellow)" }}>
              ⚠️ Configurá tu contraseña para el nuevo sistema de autenticación multi-usuario.
            </div>
          )}
          <form onSubmit={handleSave} style={{ marginTop: 16 }}>
            <div style={{ display: "grid", gap: 12 }}>
              {(
                [
                  { label: "Contraseña actual", val: current, setter: setCurrent, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
                  { label: "Nueva contraseña", val: newTok, setter: setNewTok, show: showNew, toggle: () => setShowNew(v => !v) },
                  { label: "Confirmar nueva contraseña", val: confirm, setter: setConfirm, show: showConfirm, toggle: () => setShowConfirm(v => !v) },
                ] as const
              ).map(({ label, val, setter, show, toggle }) => (
                <div key={label}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 4 }}>{label}</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type={show ? "text" : "password"}
                      value={val}
                      onChange={e => setter(e.target.value)}
                      style={{ width: "100%", padding: "9px 40px 9px 12px", borderRadius: 8, border: "1px solid var(--hborder)", background: "var(--hsurface2)", color: "var(--htext1)", fontSize: "16px", boxSizing: "border-box" as const }}
                    />
                    <button
                      type="button"
                      onClick={toggle}
                      style={{ position: "absolute", right: 10, background: "none", border: "none", cursor: "pointer", color: "var(--htext3)", padding: 4, display: "flex", alignItems: "center" }}
                      aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {msg && (
              <p style={{ fontSize: "0.82rem", marginTop: 10, padding: "8px 12px", borderRadius: 6, background: msg.type === "ok" ? "var(--hgreen-soft)" : "var(--hred-soft)", color: msg.type === "ok" ? "var(--hgreen)" : "var(--hred)" }}>
                {msg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !current || !newTok || !confirm}
              style={{ marginTop: 14, padding: "9px 20px", borderRadius: 8, border: "none", background: saving || !current || !newTok || !confirm ? "var(--htext3)" : "var(--haccent)", color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: "0.88rem", fontWeight: 600 }}
            >
              {saving ? "Guardando..." : "Cambiar contraseña"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

// ── Conectar Telegram ────────────────────────────────────────────
function ConectarTelegram() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLinked(!!data.has_telegram); });
  }, []);

  async function generateCode() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/telegram/link-code", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCode(data.code);
        setExpiresAt(data.expires_at);
      }
    } finally {
      setLoading(false);
    }
  }

  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "HermesFinanceAssistBot";
  const deepLink = code ? `https://t.me/${botName}?start=link_${code}` : null;

  if (linked === null) return (
    <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
      <Skel w={160} h={14} mb={10} />
      <Skel w="100%" h={56} r={8} />
    </section>
  );

  return (
    <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--htext1)", marginBottom: 4 }}>Conectar Telegram</h2>

      {linked ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--hgreen-soft)", border: "1px solid var(--hgreen)", borderRadius: 8, padding: "12px 16px" }}>
          <span style={{ fontSize: "1.2rem" }}>✅</span>
          <div>
            <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--hgreen)", margin: 0 }}>Telegram conectado</p>
            <p style={{ fontSize: "0.78rem", color: "var(--htext2)", margin: "2px 0 0" }}>Tu cuenta ya está vinculada al bot <strong>@{botName}</strong></p>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: "0.85rem", color: "var(--htext2)", marginBottom: 16 }}>
            Vinculá tu cuenta de Telegram para usar el bot con tu usuario.
          </p>
          {code ? (
            <div>
              <div style={{ background: "var(--haccent-soft)", border: "1px solid var(--haccent)", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                <p style={{ fontSize: "0.82rem", color: "var(--htext2)", marginBottom: 10 }}>
                  Tocá el botón para vincular automáticamente desde Telegram:
                </p>
                <a
                  href={deepLink!}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 18px", borderRadius: 8, border: "none",
                    background: "#0088cc", color: "white", textDecoration: "none",
                    fontWeight: 600, fontSize: "0.9rem", marginBottom: 12,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
                  </svg>
                  Abrir en Telegram y vincular
                </a>
                <p style={{ fontSize: "0.78rem", color: "var(--htext2)", marginBottom: 4 }}>O enviá manualmente al bot <strong>@{botName}</strong>:</p>
                <code style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--haccent)", letterSpacing: "0.05em" }}>
                  /vincular {code}
                </code>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--htext3)" }}>
                Código válido hasta {expiresAt ? new Date(expiresAt).toLocaleTimeString("es-AR") : ""}. Generá uno nuevo si expira.
              </p>
              <button
                onClick={generateCode}
                disabled={loading}
                style={{ marginTop: 10, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.82rem" }}
              >
                Generar nuevo código
              </button>
            </div>
          ) : (
            <button
              onClick={generateCode}
              disabled={loading}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: loading ? "var(--htext3)" : "var(--haccent)", color: "white", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.88rem", fontWeight: 600 }}
            >
              {loading ? "Generando..." : "Generar código de vinculación"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export function AccountPageClient() {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 400, color: "var(--htext1)", marginBottom: 4 }}>
          Mi cuenta
        </h1>
        <p style={{ fontSize: 13, color: "var(--htext3)" }}>Perfil, contraseña y conexiones</p>
      </div>
      <MiCuenta />
      <ConectarTelegram />
      <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
        <PaymentInfoForm />
      </section>
    </div>
  );
}
