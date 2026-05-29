"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface MonthlySettings {
  income_usd: number;
  exchange_rate: number;
  saving_goal_usd: number;
  saving_goal_yellow: number;
}
interface Category { id: string; name: string; emoji: string; }
interface BudgetItem { budget_ars: number; hard_limit: boolean; }

export default function SettingsPage() {
  const [settings, setSettings] = useState<MonthlySettings | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Record<string, BudgetItem>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/monthly").then(r => r.json() as Promise<MonthlySettings>),
      fetch("/api/categories").then(r => r.json() as Promise<Category[]>),
    ]).then(([s, c]) => {
      setSettings(s);
      setCats(c);
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

  if (!settings) return (
    <div style={{ padding: 40, color: "var(--htext3)", fontFamily: "DM Sans, sans-serif" }}>
      Cargando configuración…
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 400, color: "var(--htext1)", marginBottom: 4 }}>
          Ajustes
        </h1>
        <p style={{ fontSize: 13, color: "var(--htext3)" }}>Mes activo · configuración mensual y presupuestos</p>
      </div>

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
                  onChange={e => setSettings({ ...settings, income_usd: Number(e.target.value) })}
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
                onChange={e => setSettings({ ...settings, exchange_rate: Number(e.target.value) })}
              />
            </div>
          </div>
          <button
            className="h-btn-submit"
            style={{ width: "auto", padding: "9px 24px" }}
            onClick={() => void saveMonthly()}
            disabled={saving === "monthly"}
          >
            {saving === "monthly" ? "Guardando…" : "Guardar configuración"}
          </button>
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
                  onChange={e => setSettings({ ...settings, saving_goal_usd: Number(e.target.value) })}
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
                  onChange={e => setSettings({ ...settings, saving_goal_yellow: Number(e.target.value) })}
                />
              </div>
              <span className="h-form-hint">Alerta de ahorro bajo</span>
            </div>
          </div>
          <button
            className="h-btn-submit"
            style={{ width: "auto", padding: "9px 24px" }}
            onClick={() => void saveThresholds()}
            disabled={saving === "thresholds"}
          >
            {saving === "thresholds" ? "Guardando…" : "Guardar umbrales"}
          </button>
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
              gridTemplateColumns: "1fr 140px 120px",
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
                  gridTemplateColumns: "1fr 140px 120px",
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
                      style={{ paddingLeft: 24 }}
                      value={budget.budget_ars || ""}
                      onChange={e => setBudgets(b => ({
                        ...b,
                        [cat.id]: { budget_ars: Number(e.target.value), hard_limit: b[cat.id]?.hard_limit ?? true },
                      }))}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    {/* Custom toggle */}
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
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="h-btn-submit"
            style={{ width: "auto", padding: "9px 24px" }}
            onClick={() => void saveBudgets()}
            disabled={saving === "budgets"}
          >
            {saving === "budgets" ? "Guardando…" : "Guardar presupuestos"}
          </button>
        </div>
      </div>
    </div>
  );
}
