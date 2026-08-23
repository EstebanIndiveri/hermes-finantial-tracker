"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Plus,
  Pause,
  Play,
  Trash2,
  CheckCircle,
  SkipForward,
  BarChart3,
  Clock,
  Repeat,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  emoji: string;
  slug: string;
}

interface RecurringExpense {
  id: string;
  userId: string;
  groupId: string | null;
  name: string;
  amountArs: number;
  categoryId: string | null;
  merchant: string | null;
  frequency: "monthly" | "weekly" | "yearly";
  dayOfMonth: number;
  isActive: boolean;
  autoConfirm: boolean;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  category: Category | null;
}

interface RecurringExecution {
  id: string;
  recurringExpenseId: string;
  transactionId: string | null;
  scheduledDate: string;
  executedAt: number | null;
  status: "pending" | "confirmed" | "skipped" | "auto_executed";
  amountArs: number | null;
  createdAt: number;
  recurringExpense: {
    id: string;
    name: string;
    amountArs: number;
    merchant: string | null;
    category: Category | null;
  };
}

interface Stats {
  totalMonthly: number;
  totalActive: number;
  totalPaused: number;
  pendingThisMonth: number;
  confirmedThisMonth: number;
  skippedThisMonth: number;
  byCategory: Array<{
    categoryName: string;
    categoryEmoji: string;
    total: number;
    count: number;
  }>;
}

export function RecurringList() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [pending, setPending] = useState<RecurringExecution[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  // Form state
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDay, setNewDay] = useState("1");

  useEffect(() => {
    void fetchData();
  }, []);

  async function fetchData() {
    try {
      const [expensesRes, pendingRes] = await Promise.all([
        fetch("/api/recurring-expenses?stats=true"),
        fetch("/api/recurring-expenses/executions?pending=true"),
      ]);

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setExpenses(data.expenses);
        setStats(data.stats);
      }

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPending(data.executions);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/recurring-expenses/${id}?action=toggle`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error toggling:", error);
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este gasto recurrente?")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/recurring-expenses/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setActionId(null);
    }
  }

  async function handleConfirm(execId: string) {
    setActionId(execId);
    try {
      const res = await fetch(
        `/api/recurring-expenses/executions/${execId}?action=confirm`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error confirming:", error);
    } finally {
      setActionId(null);
    }
  }

  async function handleSkip(execId: string) {
    setActionId(execId);
    try {
      const res = await fetch(
        `/api/recurring-expenses/executions/${execId}?action=skip`,
        { method: "POST" }
      );
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error skipping:", error);
    } finally {
      setActionId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName || !newAmount) return;

    setActionId("create");
    try {
      const res = await fetch("/api/recurring-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          amountArs: parseFloat(newAmount),
          dayOfMonth: parseInt(newDay),
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewAmount("");
        setNewDay("1");
        setShowForm(false);
        await fetchData();
      }
    } catch (error) {
      console.error("Error creating:", error);
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ color: "var(--htext2)", padding: "2rem", textAlign: "center" }}>
        Cargando gastos recurrentes...
      </div>
    );
  }

  const active = expenses.filter((e) => e.isActive);
  const paused = expenses.filter((e) => !e.isActive);

  const cardTitleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--htext1)",
  };

  const cardDescStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    color: "var(--htext2)",
    marginTop: "4px",
  };

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid var(--hborder)",
    background: "var(--hbg2)",
    marginBottom: "0.75rem",
  };

  const amountStyle: React.CSSProperties = {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "var(--htext1)",
  };

  const nameStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    color: "var(--htext2)",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };

  const statCardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "1rem",
    borderRadius: "8px",
    background: "var(--hbg2)",
    border: "1px solid var(--hborder)",
    flex: 1,
    minWidth: "100px",
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "var(--htext1)",
    marginTop: "0.5rem",
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--htext2)",
    textAlign: "center",
    marginTop: "0.25rem",
  };

  const btnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    border: "1px solid var(--hborder)",
    background: "var(--hbg2)",
    cursor: "pointer",
    color: "var(--htext2)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid var(--hborder)",
    background: "var(--hbg2)",
    color: "var(--htext1)",
    fontSize: "14px",
    marginBottom: "12px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Stats Section */}
      {stats && (
        <div className="h-card h-animate">
          <div className="h-card-header">
            <h2 style={cardTitleStyle}>
              <BarChart3 style={{ width: 20, height: 20 }} />
              Resumen Mensual
            </h2>
          </div>
          <div className="h-card-body" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={statCardStyle}>
              <Repeat style={{ width: 20, height: 20, color: "var(--haccent)" }} />
              <span style={statValueStyle}>
                ${stats.totalMonthly.toLocaleString("es-AR")}
              </span>
              <span style={statLabelStyle}>Total Mensual</span>
            </div>
            <div style={statCardStyle}>
              <Play style={{ width: 20, height: 20, color: "#22c55e" }} />
              <span style={statValueStyle}>{stats.totalActive}</span>
              <span style={statLabelStyle}>Activos</span>
            </div>
            <div style={statCardStyle}>
              <Clock style={{ width: 20, height: 20, color: "#f97316" }} />
              <span style={statValueStyle}>{stats.pendingThisMonth}</span>
              <span style={statLabelStyle}>Pendientes</span>
            </div>
          </div>
        </div>
      )}

      {/* Pending This Month */}
      {pending.length > 0 && (
        <div className="h-card h-animate">
          <div className="h-card-header">
            <h2 style={cardTitleStyle}>
              <CalendarClock style={{ width: 20, height: 20 }} />
              Pendientes de Este Mes
            </h2>
            <p style={cardDescStyle}>
              Confirmá o saltá estos gastos recurrentes
            </p>
          </div>
          <div className="h-card-body">
            {pending.map((exec) => {
              const emoji = exec.recurringExpense.category?.emoji ?? "📦";
              const amount = exec.amountArs ?? exec.recurringExpense.amountArs;
              
              return (
                <div key={exec.id} style={itemStyle}>
                  <div>
                    <p style={amountStyle}>
                      ${amount.toLocaleString("es-AR")}
                    </p>
                    <p style={nameStyle}>
                      {emoji} {exec.recurringExpense.name}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      className="h-btn-submit"
                      onClick={() => void handleConfirm(exec.id)}
                      disabled={actionId === exec.id}
                      style={{ padding: "8px 16px", fontSize: "14px" }}
                    >
                      <CheckCircle style={{ width: 14, height: 14, marginRight: 4 }} />
                      Confirmar
                    </button>
                    <button
                      style={btnStyle}
                      onClick={() => void handleSkip(exec.id)}
                      disabled={actionId === exec.id}
                      title="Saltar este mes"
                    >
                      <SkipForward style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add New Form */}
      <div className="h-card h-animate">
        <div className="h-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={cardTitleStyle}>
            <Plus style={{ width: 20, height: 20 }} />
            {showForm ? "Nuevo Gasto Recurrente" : "Agregar Recurrente"}
          </h2>
          {!showForm && (
            <button
              className="h-btn-submit"
              onClick={() => setShowForm(true)}
              style={{ padding: "8px 16px", fontSize: "14px" }}
            >
              <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
              Agregar
            </button>
          )}
        </div>
        {showForm && (
          <div className="h-card-body">
            <form onSubmit={(e) => void handleCreate(e)}>
              <input
                type="text"
                placeholder="Nombre (ej: Netflix, Alquiler)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={inputStyle}
                required
              />
              <input
                type="number"
                placeholder="Monto mensual"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                style={inputStyle}
                required
                min="1"
              />
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ color: "var(--htext2)", fontSize: "14px", minWidth: "fit-content" }}>
                  Día de pago:
                </label>
                <input
                  type="number"
                  value={newDay}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(31, parseInt(e.target.value) || 1));
                    setNewDay(val.toString());
                  }}
                  style={{ ...inputStyle, width: "80px", textAlign: "center" }}
                  min="1"
                  max="31"
                />
                <span style={{ color: "var(--htext3)", fontSize: "13px" }}>de cada mes</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="submit"
                  className="h-btn-submit"
                  disabled={actionId === "create"}
                  style={{ flex: 1, padding: "12px" }}
                >
                  {actionId === "create" ? "Creando..." : "Crear Recurrente"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{ ...btnStyle, width: "auto", padding: "0 16px" }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Active Recurring */}
      {active.length > 0 && (
        <div className="h-card h-animate">
          <div className="h-card-header">
            <h2 style={cardTitleStyle}>
              <Play style={{ width: 20, height: 20 }} />
              Activos
            </h2>
          </div>
          <div className="h-card-body">
            {active.map((expense) => {
              const emoji = expense.category?.emoji ?? "📦";
              
              return (
                <div key={expense.id} style={itemStyle}>
                  <div>
                    <p style={amountStyle}>
                      ${expense.amountArs.toLocaleString("es-AR")}
                      <span style={{ fontSize: "12px", color: "var(--htext2)", marginLeft: "4px" }}>/mes</span>
                    </p>
                    <p style={nameStyle}>
                      {emoji} {expense.name} • Día {expense.dayOfMonth}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      style={btnStyle}
                      onClick={() => void handleToggle(expense.id)}
                      disabled={actionId === expense.id}
                      title="Pausar"
                    >
                      <Pause style={{ width: 16, height: 16 }} />
                    </button>
                    <button
                      style={{ ...btnStyle, color: "#ef4444" }}
                      onClick={() => void handleDelete(expense.id)}
                      disabled={actionId === expense.id}
                      title="Eliminar"
                    >
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Paused Recurring */}
      {paused.length > 0 && (
        <div className="h-card h-animate">
          <div className="h-card-header">
            <h2 style={cardTitleStyle}>
              <Pause style={{ width: 20, height: 20 }} />
              Pausados
            </h2>
          </div>
          <div className="h-card-body">
            {paused.map((expense) => {
              const emoji = expense.category?.emoji ?? "📦";
              
              return (
                <div key={expense.id} style={{ ...itemStyle, opacity: 0.6 }}>
                  <div>
                    <p style={amountStyle}>
                      ${expense.amountArs.toLocaleString("es-AR")}
                      <span style={{ fontSize: "12px", color: "var(--htext2)", marginLeft: "4px" }}>/mes</span>
                    </p>
                    <p style={nameStyle}>
                      {emoji} {expense.name}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      style={{ ...btnStyle, color: "#22c55e" }}
                      onClick={() => void handleToggle(expense.id)}
                      disabled={actionId === expense.id}
                      title="Activar"
                    >
                      <Play style={{ width: 16, height: 16 }} />
                    </button>
                    <button
                      style={{ ...btnStyle, color: "#ef4444" }}
                      onClick={() => void handleDelete(expense.id)}
                      disabled={actionId === expense.id}
                      title="Eliminar"
                    >
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {expenses.length === 0 && pending.length === 0 && !showForm && (
        <div className="h-card h-animate">
          <div className="h-card-body" style={{ padding: "3rem", textAlign: "center", color: "var(--htext2)" }}>
            <CalendarClock style={{ width: 48, height: 48, marginBottom: "1rem", opacity: 0.5 }} />
            <p>No tenés gastos recurrentes configurados</p>
            <p style={{ marginTop: "0.5rem" }}>
              Agregá tus pagos fijos mensuales como Netflix, alquiler o servicios
            </p>
            <button
              className="h-btn-submit"
              onClick={() => setShowForm(true)}
              style={{ marginTop: "1rem", padding: "12px 24px" }}
            >
              <Plus style={{ width: 16, height: 16, marginRight: 4 }} />
              Agregar Primer Recurrente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
