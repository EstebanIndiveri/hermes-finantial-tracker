"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface InvitationInfo {
  group: { id: string; name: string };
  invited_by: { name: string };
  role: "admin" | "member";
  expires_at: number;
}

export default function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired" | "used">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/join/${token}`)
      .then(async r => {
        if (r.status === 410) { setStatus("expired"); return; }
        if (r.status === 409) { setStatus("used"); return; }
        if (!r.ok) { setStatus("error"); setErrorMsg("Invitación no encontrada."); return; }
        const data = await r.json();
        setInfo(data);
        setStatus("ready");
      })
      .catch(() => { setStatus("error"); setErrorMsg("Error de red."); });
  }, [token]);

  async function handleAccept() {
    setJoining(true);
    try {
      const res = await fetch(`/api/join/${token}`, { method: "POST" });
      if (res.status === 401) { router.push(`/login?redirect=/join/${token}`); return; }
      if (!res.ok) {
        const d = await res.json();
        setStatus("error");
        setErrorMsg(d.error ?? "Error al unirse");
        return;
      }
      const data = await res.json();
      await fetch("/api/groups/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: data.group_id }) });
      router.push("/dashboard");
    } catch { setStatus("error"); setErrorMsg("Error de red."); }
    finally { setJoining(false); }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--hbg)", padding: 20, width: "100%",
  };
  const cardStyle: React.CSSProperties = {
    background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 16,
    padding: "36px 28px", width: "100%", maxWidth: 360, textAlign: "center",
  };

  if (status === "loading") return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}><p style={{ color: "var(--htext2)" }}>Verificando invitación...</p></div>
    </div>
  );

  if (status === "expired") return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⏰</div>
        <h1 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Invitación vencida</h1>
        <p style={{ color: "var(--htext3)", fontSize: "0.85rem" }}>Pedile al owner del grupo que genere un nuevo link.</p>
      </div>
    </div>
  );

  if (status === "used") return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Invitación ya usada</h1>
        <p style={{ color: "var(--htext3)", fontSize: "0.85rem" }}>Este link de invitación ya fue utilizado.</p>
        <button onClick={() => router.push("/dashboard")} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer" }}>
          Ir al dashboard
        </button>
      </div>
    </div>
  );

  if (status === "error") return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>❌</div>
        <h1 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Invitación no válida</h1>
        <p style={{ color: "var(--htext3)", fontSize: "0.85rem" }}>{errorMsg}</p>
      </div>
    </div>
  );

  return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🏠</div>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>Te invitaron al grupo</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--haccent-bg)", borderRadius: 8, padding: "10px 16px", margin: "12px 0 16px" }}>
          <span style={{ fontSize: "1.1rem" }}>🏠</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--htext1)" }}>{info?.group.name}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--htext3)" }}>
              Invitado por {info?.invited_by?.name} · Rol: {info?.role}
            </div>
          </div>
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--htext3)", marginBottom: 20 }}>
          {info?.role === "admin"
            ? "Podrás ver, agregar y editar gastos del grupo."
            : "Podrás ver y agregar transacciones al grupo compartido."}
        </p>
        <button
          onClick={handleAccept}
          disabled={joining}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600, marginBottom: 8 }}
        >
          {joining ? "Uniéndome..." : "Aceptar invitación"}
        </button>
        <button
          onClick={() => router.push("/")}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.9rem" }}
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}
