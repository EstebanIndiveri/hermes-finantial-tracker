// app/dashboard/compartidos/[id]/nuevo/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

type SplitType = "equal" | "percentage" | "fixed";

export default function NuevoGastoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => setCurrentUserId(d.id ?? null))
      .catch(() => null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(totalAmount.replace(/\./g, "").replace(",", "."));
    if (!description.trim() || isNaN(amount) || amount <= 0 || !currentUserId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/splits/sessions/${sessionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          totalAmount: amount,
          splitType,
          payers: [{ userId: currentUserId, amountPaid: amount }],
          participants: [{ userId: currentUserId, amount }],
        }),
      });
      if (!res.ok) throw new Error("Error al registrar el gasto");
      router.push(`/dashboard/compartidos/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  const splitOptions: { type: SplitType; icon: string; label: string }[] = [
    { type: "equal", icon: "⚖️", label: "Partes iguales" },
    { type: "percentage", icon: "📊", label: "Porcentajes" },
    { type: "fixed", icon: "💰", label: "Montos fijos" },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 520, fontFamily: "DM Sans, sans-serif" }}>
      <Link href={`/dashboard/compartidos/${sessionId}`} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--htext2)", fontSize: 13, textDecoration: "none", marginBottom: 16 }}>
        ← Volver a sesión
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", marginBottom: 24 }}>
        ＋ Nuevo gasto compartido
      </h1>

      <form onSubmit={handleSubmit} className="h-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Descripción
          </label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: La Parolaccia, Uber, Netflix..." required style={{ width: "100%", background: "var(--hsurface2)", border: "1px solid var(--hborder)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--htext1)", outline: "none", boxSizing: "border-box" as const }} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Monto total
          </label>
          <input value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="0" type="text" inputMode="numeric" required style={{ width: "100%", background: "var(--hsurface2)", border: "1px solid var(--hborder)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--htext1)", outline: "none", boxSizing: "border-box" as const }} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            ¿Cómo dividir?
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {splitOptions.map(opt => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setSplitType(opt.type)}
                style={{
                  background: splitType === opt.type ? "rgba(99,102,241,0.12)" : "var(--hsurface2)",
                  border: `1px solid ${splitType === opt.type ? "var(--haccent)" : "var(--hborder)"}`,
                  borderRadius: 8, padding: "10px 8px", textAlign: "center" as const, cursor: "pointer",
                  fontSize: 12, color: splitType === opt.type ? "var(--haccent)" : "var(--htext2)",
                  fontWeight: splitType === opt.type ? 600 : 400,
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</div>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: "#EF4444" }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ width: "100%", padding: 11, fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", background: "var(--haccent)", color: "#fff", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Guardando..." : "✅ Registrar gasto"}
        </button>
      </form>
    </div>
  );
}
