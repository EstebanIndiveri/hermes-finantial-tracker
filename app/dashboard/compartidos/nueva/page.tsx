// app/dashboard/compartidos/nueva/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NuevaSessionPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/splits/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Error al crear la sesión");
      const session = await res.json();
      router.push(`/dashboard/compartidos/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: 520, fontFamily: "DM Sans, sans-serif" }}>
      <Link href="/dashboard/compartidos" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--htext2)", fontSize: 13, textDecoration: "none", marginBottom: 16 }}>
        ← Compartidos
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--htext1)", marginBottom: 24 }}>
        ＋ Nueva sesión compartida
      </h1>

      <form onSubmit={handleSubmit} className="h-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Nombre de la sesión
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Cena viernes, Viaje Bariloche, Hogar Junio..."
            required
            style={{ width: "100%", background: "var(--hsurface2)", border: "1px solid var(--hborder)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--htext1)", outline: "none", boxSizing: "border-box" as const }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "#EF4444", marginBottom: 16 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          style={{ width: "100%", padding: 11, fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", background: "var(--haccent)", color: "#fff", opacity: loading || !name.trim() ? 0.6 : 1 }}
        >
          {loading ? "Creando..." : "Crear sesión"}
        </button>
      </form>
    </div>
  );
}
