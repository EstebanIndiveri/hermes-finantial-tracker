"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

interface MonthlySettings {
  income_usd: number;
  exchange_rate: number;
  saving_goal_usd: number;
  saving_goal_yellow: number;
}
interface Category { id: string; name: string; emoji: string; }
interface BudgetItem { budget_ars: number; hard_limit: boolean; }

function ChangeNameSection({ initialName, onSaved }: { initialName: string; onSaved: (name: string) => void }) {
  const [nameOpen, setNameOpen] = useState(false);
  const [nameVal, setNameVal] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    setNameMsg(null);
    if (!nameVal.trim() || nameVal.trim().length > 50) {
      setNameMsg({ type: "err", text: "El nombre debe tener entre 1 y 50 caracteres." });
      return;
    }
    setNameSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setNameMsg({ type: "err", text: data.error ?? "Error al guardar." }); return; }
      setNameMsg({ type: "ok", text: "Nombre actualizado." });
      onSaved(nameVal.trim());
      setNameOpen(false);
    } catch {
      setNameMsg({ type: "err", text: "Error de red." });
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setNameOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--haccent)", fontSize: "0.85rem", padding: 0 }}
      >
        {nameOpen ? "▲ Cancelar" : "✏️ Cambiar nombre"}
      </button>
      {nameOpen && (
        <form onSubmit={handleNameSave} style={{ marginTop: 10 }}>
          <input
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            placeholder="Tu nombre"
            maxLength={50}
            style={{
              width: "100%",
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
            <div style={{ fontSize: "0.82rem", color: nameMsg.type === "ok" ? "var(--hsuccess)" : "var(--herror)", marginBottom: 8 }}>
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

function MiCuenta() {
  const [user, setUser] = useState<{ name: string; has_personal_token: boolean } | null>(null);
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
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(setUser);
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

  if (linked === null) return null;

  return (
    <section style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--htext1)", marginBottom: 4 }}>Conectar Telegram</h2>

      {linked ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--hgreen-soft)", border: "1px solid var(--hgreen)", borderRadius: 8, padding: "12px 16px" }}>
            <span style={{ fontSize: "1.2rem" }}>✅</span>
            <div>
              <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--hgreen)", margin: 0 }}>Telegram conectado</p>
              <p style={{ fontSize: "0.78rem", color: "var(--htext2)", margin: "2px 0 0" }}>Tu cuenta ya está vinculada al bot <strong>@{botName}</strong></p>
            </div>
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<MonthlySettings | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Record<string, BudgetItem>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [noGroup, setNoGroup] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const isReadOnly = userRole === "member";

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/monthly").then(r => r.ok ? r.json() : null),
      fetch("/api/categories").then(r => r.ok ? r.json() : null),
      fetch("/api/groups/active").then(r => r.ok ? r.json() : null),
    ]).then(([s, c, activeGroup]) => {
      if (!Array.isArray(c)) { setNoGroup(true); return; }
      setSettings(s ?? { income_usd: 0, exchange_rate: 1, saving_goal_usd: 0, saving_goal_yellow: 0 });
      setCats(c);
      if (activeGroup?.role) setUserRole(activeGroup.role);
    }).catch(() => toast.error("Error al cargar configuración"));

    fetch("/api/settings/budgets").then(r => r.json()).then((data: { category_id: string; budget_ars: number; hard_limit: boolean }[]) => {
      if (!Array.isArray(data)) return;
      const map: Record<string, BudgetItem> = {};
      data.forEach(b => { map[b.category_id] = { budget_ars: b.budget_ars, hard_limit: b.hard_limit }; });
      setBudgets(map);
    }).catch(() => {});
  }, []);

  async function saveMonthly() {
    if (!settings) return;
    setSaving("monthly");
    try {
      const res = await fetch("/api/settings/monthly", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ income_usd: settings.income_usd, exchange_rate: settings.exchange_rate }),
      });
      if (res.ok) toast.success("Configuración mensual guardada ✅");
      else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
    finally { setSaving(null); }
  }

  async function saveThresholds() {
    if (!settings) return;
    setSaving("thresholds");
    try {
      const res = await fetch("/api/settings/thresholds", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saving_goal_usd: settings.saving_goal_usd, saving_goal_yellow: settings.saving_goal_yellow }),
      });
      if (res.ok) toast.success("Umbrales guardados ✅");
      else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
    finally { setSaving(null); }
  }

  async function saveBudgets() {
    const items = Object.entries(budgets).map(([category_id, b]) => ({
      category_id, budget_ars: b.budget_ars, hard_limit: b.hard_limit,
    }));
    if (!items.length) { toast.error("No hay presupuestos para guardar"); return; }
    setSaving("budgets");
    try {
      const res = await fetch("/api/settings/budgets", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) toast.success("Presupuestos guardados ✅");
      else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
    finally { setSaving(null); }
  }

  if (noGroup) return (
    <div style={{ padding: "40px 20px", color: "var(--htext3)", fontFamily: "DM Sans, sans-serif" }}>
      <MiCuenta />
      <ConectarTelegram />
      <div style={{ marginTop: 32, textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>🏠</div>
        <p>No estás en ningún grupo activo.</p>
        <p style={{ fontSize: "0.85rem", marginTop: 8 }}>Pedile al owner una invitación para unirte a un grupo.</p>
      </div>
    </div>
  );

  if (!settings) return (
    <div style={{ padding: 40, color: "var(--htext3)", fontFamily: "DM Sans, sans-serif" }}>
      Cargando configuración…
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      <MiCuenta />
      <ConectarTelegram />

      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 400, color: "var(--htext1)", marginBottom: 4 }}>
          Ajustes
        </h1>
        <p style={{ fontSize: 13, color: "var(--htext3)" }}>Mes activo · configuración mensual y presupuestos</p>
      </div>

      {isReadOnly && (
        <div style={{ background: "var(--haccent-soft)", border: "1px solid var(--haccent)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--htext2)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "1rem" }}>👁️</span>
          <span>Sos miembro de este grupo — podés ver la configuración pero no editarla.</span>
        </div>
      )}

      {/* ── Sección 1: Configuración mensual ── */}
      <div className="h-card h-animate" style={{ marginBottom: 20 }}>
        <div className="h-card-header" style={{ paddingBottom: 16, borderBottom: "1px solid var(--hborder)" }}>
          <div>
            <h2 className="h-card-title" style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)" }}>
              💵 Configuración mensual
            </h2>
            <p style={{ fontSize: 12, color: "var(--htext3)", marginTop: 2 }}>Ingreso y tipo de cambio del mes</p>
          </div>
        </div>
        <div className="h-card-body">
          <div className="h-form-grid" style={{ marginBottom: 16 }}>
            <div className="h-form-group">
              <label className="h-form-label" htmlFor="income">Ingreso mensual (USD)</label>
              <div className="h-input-prefix">
                <span className="h-input-prefix-text">$</span>
                <input
                  id="income"
                  className="h-form-control"
                  type="number"
                  min="0"
                  value={settings.income_usd}
                  readOnly={isReadOnly}
                  onChange={isReadOnly ? undefined : e => setSettings({ ...settings, income_usd: Number(e.target.value) })}
                  style={isReadOnly ? { opacity: 0.7, cursor: "default" } : undefined}
                />
              </div>
            </div>
            <div className="h-form-group">
              <label className="h-form-label" htmlFor="exchange">Tipo de cambio (ARS/USD)</label>
              <input
                id="exchange"
                className="h-form-control"
                type="number"
                min="0"
                value={settings.exchange_rate}
                readOnly={isReadOnly}
                onChange={isReadOnly ? undefined : e => setSettings({ ...settings, exchange_rate: Number(e.target.value) })}
                style={isReadOnly ? { opacity: 0.7, cursor: "default" } : undefined}
              />
            </div>
          </div>
          {!isReadOnly && (
            <button
              className="h-btn-submit"
              style={{ width: "auto", padding: "9px 24px" }}
              onClick={() => void saveMonthly()}
              disabled={saving === "monthly"}
            >
              {saving === "monthly" ? "Guardando…" : "Guardar configuración"}
            </button>
          )}
        </div>
      </div>

      {/* ── Sección 2: Semáforo de ahorro ── */}
      <div className="h-card h-animate" style={{ marginBottom: 20, animationDelay: "0.05s" }}>
        <div className="h-card-header" style={{ paddingBottom: 16, borderBottom: "1px solid var(--hborder)" }}>
          <div>
            <h2 className="h-card-title" style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)" }}>
              🚦 Semáforo de ahorro
            </h2>
            <p style={{ fontSize: 12, color: "var(--htext3)", marginTop: 2 }}>
              Verde ≥ meta · Amarillo ≥ umbral · Rojo &lt; umbral
            </p>
          </div>
        </div>
        <div className="h-card-body">
          <div className="h-form-grid" style={{ marginBottom: 16 }}>
            <div className="h-form-group">
              <label className="h-form-label" htmlFor="goal-green">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", display: "inline-block" }} />
                  Meta verde (USD)
                </span>
              </label>
              <div className="h-input-prefix">
                <span className="h-input-prefix-text">$</span>
                <input
                  id="goal-green"
                  className="h-form-control"
                  type="number"
                  min="0"
                  value={settings.saving_goal_usd}
                  readOnly={isReadOnly}
                  onChange={isReadOnly ? undefined : e => setSettings({ ...settings, saving_goal_usd: Number(e.target.value) })}
                  style={isReadOnly ? { opacity: 0.7, cursor: "default" } : undefined}
                />
              </div>
              <span className="h-form-hint">Ahorro objetivo mensual</span>
            </div>
            <div className="h-form-group">
              <label className="h-form-label" htmlFor="goal-yellow">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D97706", display: "inline-block" }} />
                  Umbral amarillo (USD)
                </span>
              </label>
              <div className="h-input-prefix">
                <span className="h-input-prefix-text">$</span>
                <input
                  id="goal-yellow"
                  className="h-form-control"
                  type="number"
                  min="0"
                  value={settings.saving_goal_yellow}
                  readOnly={isReadOnly}
                  onChange={isReadOnly ? undefined : e => setSettings({ ...settings, saving_goal_yellow: Number(e.target.value) })}
                  style={isReadOnly ? { opacity: 0.7, cursor: "default" } : undefined}
                />
              </div>
              <span className="h-form-hint">Alerta de ahorro bajo</span>
            </div>
          </div>
          {!isReadOnly && (
            <button
              className="h-btn-submit"
              style={{ width: "auto", padding: "9px 24px" }}
              onClick={() => void saveThresholds()}
              disabled={saving === "thresholds"}
            >
              {saving === "thresholds" ? "Guardando…" : "Guardar umbrales"}
            </button>
          )}
        </div>
      </div>

      {/* ── Sección 3: Presupuestos ── */}
      <div className="h-card h-animate" style={{ animationDelay: "0.1s" }}>
        <div className="h-card-header" style={{ paddingBottom: 16, borderBottom: "1px solid var(--hborder)" }}>
          <div>
            <h2 className="h-card-title" style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)" }}>
              📊 Presupuestos por categoría
            </h2>
            <p style={{ fontSize: 12, color: "var(--htext3)", marginTop: 2 }}>0 = sin límite · Límite duro bloquea gastos al superar el tope</p>
          </div>
        </div>
        <div className="h-card-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {/* Header row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isReadOnly ? "1fr 140px 100px" : "1fr 140px 120px",
              gap: 12,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--htext3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid var(--hborder)",
              marginBottom: 4,
            }}>
              <span>Categoría</span>
              <span>Presupuesto (ARS)</span>
              <span style={{ textAlign: "right" }}>Límite duro</span>
            </div>

            {cats.map(cat => {
              const budget = budgets[cat.id] ?? { budget_ars: 0, hard_limit: true };
              return (
                <div key={cat.id} style={{
                  display: "grid",
                  gridTemplateColumns: isReadOnly ? "1fr 140px 100px" : "1fr 140px 120px",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--hsurface2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 13, color: "var(--htext1)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cat.emoji} {cat.name}
                  </span>
                  <div className="h-input-prefix" style={{ minWidth: 0 }}>
                    <span className="h-input-prefix-text">$</span>
                    <input
                      className="h-form-control"
                      type="number"
                      min="0"
                      placeholder="0"
                      style={{ paddingLeft: 24, ...(isReadOnly ? { opacity: 0.7, cursor: "default" } : {}) }}
                      value={budget.budget_ars || ""}
                      readOnly={isReadOnly}
                      onChange={isReadOnly ? undefined : e => setBudgets(b => ({
                        ...b,
                        [cat.id]: { budget_ars: Number(e.target.value), hard_limit: b[cat.id]?.hard_limit ?? true },
                      }))}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    {isReadOnly ? (
                      <span style={{
                        fontSize: 11,
                        color: budget.hard_limit ? "var(--haccent)" : "var(--htext3)",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}>
                        {budget.hard_limit ? "✓ Duro" : "Suave"}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setBudgets(b => ({
                            ...b,
                            [cat.id]: { budget_ars: b[cat.id]?.budget_ars ?? 0, hard_limit: !budget.hard_limit },
                          }))}
                          style={{
                            width: 36, height: 20,
                            borderRadius: 10,
                            background: budget.hard_limit ? "var(--haccent)" : "var(--hborder)",
                            border: "none",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background 0.2s",
                            flexShrink: 0,
                          }}
                          aria-label={`Límite duro ${cat.name}`}
                        >
                          <span style={{
                            position: "absolute",
                            top: 3, left: budget.hard_limit ? 19 : 3,
                            width: 14, height: 14,
                            borderRadius: "50%",
                            background: "white",
                            transition: "left 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </button>
                        <span style={{ fontSize: 11, color: "var(--htext3)", whiteSpace: "nowrap" }}>
                          {budget.hard_limit ? "Duro" : "Suave"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!isReadOnly && (
            <button
              className="h-btn-submit"
              style={{ width: "auto", padding: "9px 24px" }}
              onClick={() => void saveBudgets()}
              disabled={saving === "budgets"}
            >
              {saving === "budgets" ? "Guardando…" : "Guardar presupuestos"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
