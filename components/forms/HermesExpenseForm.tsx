"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Category {
  id: string; slug: string; name: string; emoji: string;
  status: string; hard_limit: number;
}

interface Props {
  categories: Category[];
  exchangeRate: number;
  month?: string;
}

export function HermesExpenseForm({ categories, exchangeRate, month }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [requiresReimbursement, setRequiresReimbursement] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const usdPreview = amount && parseFloat(amount) > 0
    ? (parseFloat(amount.replace(",", ".")) / exchangeRate).toFixed(2)
    : "—";

  async function submit(isException = false) {
    if (!amount || !catId) { toast.error("Monto y categoría requeridos"); return; }
    const num = parseFloat(amount.replace(",", "."));
    if (isNaN(num) || num <= 0) { toast.error("Monto inválido"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_ars: num,
          category_id: catId,
          merchant: merchant || undefined,
          is_exception: isException,
          requiresReimbursement,
          ...(month ? { month } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "BUDGET_EXCEEDED_SOFT") { setShowConfirm(true); return; }
        if (data.code === "CATEGORY_CLOSED") { toast.error(`Categoría cerrada este mes`); return; }
        toast.error(data.message ?? "Error al registrar"); return;
      }
      toast.success(`$${num.toLocaleString("es-AR")} registrado ✅`);
      setAmount(""); setCatId(""); setMerchant(""); setRequiresReimbursement(false); setShowConfirm(false);
      router.refresh();
    } catch { toast.error("Error de conexión"); }
    finally { setLoading(false); }
  }

  return (
    <>
      {showConfirm && (
        <div style={{
          background: "var(--hyellow-soft)", border: "1px solid rgba(217,119,6,0.25)",
          borderRadius: 8, padding: "12px 16px", marginBottom: 16,
          fontSize: 13, color: "var(--hyellow)", display: "flex", flexDirection: "column", gap: 8
        }}>
          <strong>¿Confirmar gasto fuera de presupuesto?</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => submit(true)} className="h-btn-submit" style={{ width: "auto", padding: "6px 16px", marginTop: 0 }}>
              Confirmar igual
            </button>
            <button onClick={() => setShowConfirm(false)} style={{
              padding: "6px 16px", borderRadius: 8, border: "1px solid var(--hborder)",
              background: "var(--hsurface2)", color: "var(--htext2)", cursor: "pointer",
              fontSize: 13, fontFamily: "inherit"
            }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="h-form-grid">
        <div className="h-form-group">
          <label className="h-form-label" htmlFor="h-amount">Monto (ARS)</label>
          <div className="h-input-prefix">
            <span className="h-input-prefix-text">$</span>
            <input
              id="h-amount"
              className="h-form-control"
              type="number"
              placeholder="47.000"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <span className="h-form-hint">≈ USD {usdPreview}</span>
        </div>

        <div className="h-form-group">
          <label className="h-form-label" htmlFor="h-category">Categoría</label>
          <select
            id="h-category"
            className="h-form-control"
            value={catId}
            onChange={e => setCatId(e.target.value)}
          >
            <option value="">Elegir categoría…</option>
            {categories.map(c => (
              <option key={c.id} value={c.id} disabled={c.status === "CLOSED"}>
                {c.emoji} {c.name}{c.status === "CLOSED" ? " (cerrado)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="h-form-group full">
          <label className="h-form-label" htmlFor="h-merchant">Descripción / Comercio</label>
          <input
            id="h-merchant"
            className="h-form-control"
            type="text"
            placeholder="Ej: Cordiez, Disco…"
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="h-form-group full" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="h-requires-reimbursement"
            type="checkbox"
            checked={requiresReimbursement}
            onChange={e => setRequiresReimbursement(e.target.checked)}
          />
          <label className="h-form-label" htmlFor="h-requires-reimbursement" style={{ marginBottom: 0 }}>
            Requiere reintegro
          </label>
        </div>
      </div>

      <button
        type="button"
        className="h-btn-submit"
        onClick={() => submit(false)}
        disabled={loading}
      >
        {loading ? "Registrando…" : "Guardar gasto"}
      </button>
    </>
  );
}
