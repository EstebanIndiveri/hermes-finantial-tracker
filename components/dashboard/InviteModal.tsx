"use client";
import { useState } from "react";

interface InviteModalProps {
  groupId: string;
  onClose: () => void;
}

export function InviteModal({ groupId, onClose }: InviteModalProps) {
  const [role, setRole] = useState<"member" | "admin">("member");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const inviteUrl = token ? `${window.location.origin}/join/${token}` : null;

  async function generateLink() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error al generar el link"); return; }
      setToken(data.token);
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Invitar miembro</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--htext3)", fontSize: "1.2rem" }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--htext3)", marginBottom: 8 }}>
            Rol del invitado
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["member", "admin"] as const).map(r => (
              <button
                key={r}
                onClick={() => { setRole(r); setToken(null); }}
                style={{
                  padding: "7px 14px", borderRadius: 6, border: "1px solid var(--hborder)",
                  background: role === r ? "var(--haccent)" : "transparent",
                  color: role === r ? "white" : "var(--htext2)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                }}
              >
                {r === "member" ? "Member" : "Admin"}
              </button>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.72rem", color: "var(--htext3)" }}>
            {role === "admin" ? "Puede editar presupuestos e invitar miembros." : "Puede ver y agregar transacciones."}
          </p>
        </div>

        {!token ? (
          <button
            onClick={generateLink}
            disabled={loading}
            style={{ width: "100%", padding: "10px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}
          >
            {loading ? "Generando..." : "Generar link de invitación"}
          </button>
        ) : (
          <div>
            <div style={{ background: "var(--hbg)", border: "1px solid var(--hborder)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--haccent)", wordBreak: "break-all", marginBottom: 6 }}>
                {inviteUrl}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--htext3)" }}>⏱ Expira en 7 días · Un solo uso</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={copyLink} style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.8rem" }}>
                {copied ? "✓ Copiado" : "📋 Copiar link"}
              </button>
              <button onClick={generateLink} disabled={loading} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.8rem" }}>
                🔄 Nuevo
              </button>
            </div>
          </div>
        )}
        {error && <p style={{ color: "#f87171", fontSize: "0.78rem", margin: "10px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}
