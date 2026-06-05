"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import SettingsLoading from "./loading";

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
  const [noGroup, setNoGroup] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Raw string states for numeric inputs — avoids the "0 stuck" / leading-zero issue
  const [incomeRaw, setIncomeRaw] = useState("0");
  const [exchangeRaw, setExchangeRaw] = useState("1");
  const [greenRaw, setGreenRaw] = useState("0");
  const [yellowRaw, setYellowRaw] = useState("0");

  // Track whether monthly config has a non-zero income saved (enables semáforo section)
  const [savedIncome, setSavedIncome] = useState(0);

  // Inline validation errors for configuración mensual
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  // Inline validation errors for semáforo
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const isReadOnly = userRole === "member";
  const monthlyValid = parseNum(incomeRaw) > 0 && parseNum(exchangeRaw) > 0;

  const thresholdsValid = parseNum(greenRaw) > 0 && parseNum(yellowRaw) > 0;

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/monthly").then(r => r.ok ? r.json() : null),
      fetch("/api/categories").then(r => r.ok ? r.json() : null),
      fetch("/api/groups/active").then(r => r.ok ? r.json() : null),
    ]).then(([s, c, activeGroup]) => {
      if (!Array.isArray(c)) { setNoGroup(true); return; }
      const loaded = s ?? { income_usd: 0, exchange_rate: 1, saving_goal_usd: 0, saving_goal_yellow: 0 };
      setSettings(loaded);
      setIncomeRaw(String(loaded.income_usd));
      setExchangeRaw(String(loaded.exchange_rate));
      setGreenRaw(String(loaded.saving_goal_usd));
      setYellowRaw(String(loaded.saving_goal_yellow));
      setSavedIncome(loaded.income_usd);
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

  function parseNum(raw: string): number {
    const n = parseFloat(raw.replace(/,/g, "."));
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function normalizeRaw(raw: string): string {
    const n = parseNum(raw);
    return String(n);
  }

  async function saveMonthly() {
    if (!settings) return;
    const income = parseNum(incomeRaw);
    const exchange = parseNum(exchangeRaw);
    if (exchange <= 0) { setMonthlyError("El tipo de cambio debe ser mayor a 0."); return; }

    // Cross-validation: income cannot be below already-configured thresholds
    const green = parseNum(greenRaw);
    const yellow = parseNum(yellowRaw);
    if (green > 0 && income < green) {
      setMonthlyError(`El ingreso ($${income}) no puede ser menor a la meta verde ($${green}). Ajustá los umbrales primero.`);
      return;
    }
    if (yellow > 0 && income < yellow) {
      setMonthlyError(`El ingreso ($${income}) no puede ser menor al umbral amarillo ($${yellow}). Ajustá los umbrales primero.`);
      return;
    }

    setMonthlyError(null);
    setSaving("monthly");
    try {
      const res = await fetch("/api/settings/monthly", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ income_usd: income, exchange_rate: exchange }),
      });
      if (res.ok) {
        setSettings({ ...settings, income_usd: income, exchange_rate: exchange });
        setIncomeRaw(String(income));
        setExchangeRaw(String(exchange));
        setSavedIncome(income);
        setMonthlyError(null);
        setThresholdError(null);
        toast.success("Configuración mensual guardada ✅");
      } else toast.error("Error al guardar");
    } catch { toast.error("Error de conexión"); }
    finally { setSaving(null); }
  }

  async function saveThresholds() {
    if (!settings) return;
    const green = parseNum(greenRaw);
    const yellow = parseNum(yellowRaw);
    const income = savedIncome;

    // Validations
    if (income <= 0) { setThresholdError("Primero guardá la configuración mensual con un ingreso mayor a 0."); return; }
    if (green > income) { setThresholdError(`Meta verde ($${green}) no puede superar el ingreso mensual ($${income}).`); return; }
    if (yellow >= income) { setThresholdError(`Umbral amarillo ($${yellow}) debe ser menor al ingreso mensual ($${income}).`); return; }
    if (yellow >= green) { setThresholdError("El umbral amarillo debe ser menor a la meta verde."); return; }

    setThresholdError(null);
    setSaving("thresholds");
    try {
      const res = await fetch("/api/settings/thresholds", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saving_goal_usd: green, saving_goal_yellow: yellow }),
      });
      if (res.ok) {
        setSettings({ ...settings, saving_goal_usd: green, saving_goal_yellow: yellow });
        setGreenRaw(String(green));
        setYellowRaw(String(yellow));
        toast.success("Umbrales guardados ✅");
      } else toast.error("Error al guardar");
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
      <div style={{ marginTop: 32, textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>🏠</div>
        <p>No estás en ningún grupo activo.</p>
        <p style={{ fontSize: "0.85rem", marginTop: 8 }}>Pedile al owner una invitación para unirte a un grupo.</p>
      </div>
    </div>
  );

  if (!settings) return <SettingsLoading />;

  return (
    <div style={{ width: "100%" }}>

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
                  type="text"
                  inputMode="decimal"
                  value={incomeRaw}
                  readOnly={isReadOnly}
                  onChange={isReadOnly ? undefined : e => { setIncomeRaw(e.target.value.replace(/[^0-9.]/g, "")); setMonthlyError(null); }}
                  onFocus={isReadOnly ? undefined : e => e.target.select()}
                  onBlur={isReadOnly ? undefined : () => setIncomeRaw(normalizeRaw(incomeRaw))}
                  style={isReadOnly ? { opacity: 0.7, cursor: "default" } : undefined}
                />
              </div>
            </div>
            <div className="h-form-group">
              <label className="h-form-label" htmlFor="exchange">Tipo de cambio (ARS/USD)</label>
              <input
                id="exchange"
                className="h-form-control"
                type="text"
                inputMode="decimal"
                value={exchangeRaw}
                readOnly={isReadOnly}
                onChange={isReadOnly ? undefined : e => setExchangeRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                onFocus={isReadOnly ? undefined : e => e.target.select()}
                onBlur={isReadOnly ? undefined : () => setExchangeRaw(normalizeRaw(exchangeRaw))}
                style={isReadOnly ? { opacity: 0.7, cursor: "default" } : undefined}
              />
            </div>
          </div>
          {!isReadOnly && (
            <>
              {monthlyError && (
                <p style={{ fontSize: "0.82rem", color: "var(--hred)", background: "var(--hred-soft)", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
                  ⚠️ {monthlyError}
                </p>
              )}
              <button
                className="h-btn-submit"
                style={{ width: "auto", padding: "9px 24px", opacity: !monthlyValid ? 0.5 : 1 }}
                onClick={() => void saveMonthly()}
                disabled={saving === "monthly" || !monthlyValid}
              >
                {saving === "monthly" ? "Guardando…" : "Guardar configuración"}
              </button>
            </>
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
                  type="text"
                  inputMode="decimal"
                  value={greenRaw}
                  readOnly={isReadOnly}
                  onChange={isReadOnly ? undefined : e => { setGreenRaw(e.target.value.replace(/[^0-9.]/g, "")); setThresholdError(null); }}
                  onFocus={isReadOnly ? undefined : e => e.target.select()}
                  onBlur={isReadOnly ? undefined : () => setGreenRaw(normalizeRaw(greenRaw))}
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
                  type="text"
                  inputMode="decimal"
                  value={yellowRaw}
                  readOnly={isReadOnly}
                  onChange={isReadOnly ? undefined : e => { setYellowRaw(e.target.value.replace(/[^0-9.]/g, "")); setThresholdError(null); }}
                  onFocus={isReadOnly ? undefined : e => e.target.select()}
                  onBlur={isReadOnly ? undefined : () => setYellowRaw(normalizeRaw(yellowRaw))}
                  style={isReadOnly ? { opacity: 0.7, cursor: "default" } : undefined}
                />
              </div>
              <span className="h-form-hint">Alerta de ahorro bajo</span>
            </div>
          </div>
          {!isReadOnly && (
            <>
              {thresholdError && (
                <p style={{ fontSize: "0.82rem", color: "var(--hred)", background: "var(--hred-soft)", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
                  ⚠️ {thresholdError}
                </p>
              )}
              {savedIncome <= 0 && !thresholdError && (
                <p style={{ fontSize: "0.82rem", color: "var(--hyellow)", background: "var(--hyellow-soft)", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
                  Guardá primero la configuración mensual con un ingreso mayor a 0 para habilitar los umbrales.
                </p>
              )}
              <button
                className="h-btn-submit"
                style={{ width: "auto", padding: "9px 24px", opacity: (savedIncome <= 0 || !thresholdsValid) ? 0.5 : 1 }}
                onClick={() => void saveThresholds()}
                disabled={saving === "thresholds" || savedIncome <= 0 || !thresholdsValid}
              >
                {saving === "thresholds" ? "Guardando…" : "Guardar umbrales"}
              </button>
            </>
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
