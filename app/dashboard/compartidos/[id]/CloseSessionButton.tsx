"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloseSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClose() {
    if (!confirm("¿Cerrar esta sesión? No podrás agregar más gastos.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/splits/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) throw new Error("Error al cerrar la sesión");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClose}
        disabled={loading}
        style={{
          width: "100%", padding: 9, fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
          background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid #F59E0B",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Cerrando..." : "⚠️ Cerrar sesión"}
      </button>
      {error && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 6, textAlign: "center" }}>{error}</p>}
    </div>
  );
}
