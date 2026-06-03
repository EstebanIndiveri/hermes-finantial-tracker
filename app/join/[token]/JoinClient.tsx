"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

interface InvitationInfo {
  group: { id: string; name: string };
  invited_by: { name: string };
  role: "admin" | "member";
  expires_at: number;
}

type Status = "loading" | "ready" | "register" | "error" | "expired" | "used";

export default function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [joining, setJoining] = useState(false);

  // Registration form state
  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regToken, setRegToken] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch(`/api/join/${token}`)
      .then(async r => {
        if (r.status === 401) { setStatus("register"); return; }
        if (r.status === 410) { setStatus("expired"); return; }
        if (r.status === 409) { setStatus("used"); return; }
        if (!r.ok) { setStatus("error"); setErrorMsg("Invitación no encontrada."); return; }
        const data = await r.json();
        setInfo(data);
        setStatus("ready");
      })
      .catch(() => { setStatus("error"); setErrorMsg("Error de red."); });
  }, [token]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");

    const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
    if (!regUsername || regUsername.length < 3 || !USERNAME_REGEX.test(regUsername)) {
      setRegError("El usuario debe tener al menos 3 caracteres (letras, números, - y _).");
      return;
    }
    if (regToken.length < 8) { setRegError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (regToken !== regConfirm) { setRegError("Las contraseñas no coinciden."); return; }

    setRegistering(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, username: regUsername, password: regToken, invite_token: token }),
      });
      if (!res.ok) {
        const d = await res.json();
        setRegError(d.error ?? "Error al crear cuenta.");
        setRegistering(false);
        return;
      }
      // User created + session set — now accept the invitation
      const joinRes = await fetch(`/api/join/${token}`, { method: "POST" });
      if (!joinRes.ok) {
        const d = await joinRes.json();
        setRegError(d.error ?? "Error al unirse al grupo.");
        setRegistering(false);
        return;
      }
      const joinData = await joinRes.json();
      await fetch("/api/groups/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: joinData.group_id }),
      });
      router.push("/dashboard");
    } catch {
      setRegError("Error de red.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleAccept() {
    setJoining(true);
    try {
      const res = await fetch(`/api/join/${token}`, { method: "POST" });
      if (res.status === 401) { setStatus("register"); setJoining(false); return; }
      if (!res.ok) {
        const d = await res.json();
        setStatus("error");
        setErrorMsg(d.error ?? "Error al unirse");
        return;
      }
      const data = await res.json();
      await fetch("/api/groups/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: data.group_id }),
      });
      router.push("/dashboard");
    } catch { setStatus("error"); setErrorMsg("Error de red."); }
    finally { setJoining(false); }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--hbg)", padding: 20, width: "100%", boxSizing: "border-box",
  };
  const cardStyle: React.CSSProperties = {
    background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 16,
    padding: "36px 28px", width: "100%", maxWidth: 380, boxShadow: "var(--hshadow-lg)",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid var(--hborder)", background: "var(--hsurface2)",
    color: "var(--htext1)", fontSize: "16px", outline: "none", boxSizing: "border-box",
    marginTop: 4,
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 2,
  };
  const btnPrimary: React.CSSProperties = {
    width: "100%", padding: "11px", borderRadius: 8, border: "none",
    background: "var(--haccent)", color: "white", cursor: "pointer",
    fontSize: "0.9rem", fontWeight: 600, marginBottom: 8,
  };
  const btnSecondary: React.CSSProperties = {
    width: "100%", padding: "11px", borderRadius: 8,
    border: "1px solid var(--hborder)", background: "transparent",
    color: "var(--htext2)", cursor: "pointer", fontSize: "0.9rem",
  };
  const passwordWrapperStyle: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
  };
  const eyeBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: 10,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--htext3)",
    fontSize: "1rem",
    padding: "4px",
    display: "flex",
    alignItems: "center",
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
        <p style={{ color: "var(--htext3)", fontSize: "0.85rem" }}>Este link ya fue utilizado.</p>
        <button onClick={() => router.push("/dashboard")} style={{ ...btnPrimary, marginTop: 16 }}>
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

  if (status === "register") return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: "2rem" }}>👋</div>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--htext1)", marginTop: 8, marginBottom: 4 }}>
            Creá tu acceso
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--htext3)" }}>
            Necesitás una cuenta para unirte al grupo
          </p>
        </div>
        <form onSubmit={handleRegister}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Tu nombre</label>
            <input
              type="text"
              value={regName}
              onChange={e => {
                setRegName(e.target.value);
                if (!regUsername) {
                  setRegUsername(
                    e.target.value.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "")
                  );
                }
              }}
              placeholder="Ej: María García"
              style={inputStyle}
              required
              maxLength={50}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nombre de usuario</label>
            <input
              style={inputStyle}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="ej: esteban_ind"
              value={regUsername}
              onChange={e => {
                const val = e.target.value.toLowerCase().replace(/\s/g, "_");
                setRegUsername(val);
              }}
              required
            />
            <span style={{ fontSize: "0.75rem", color: "var(--htext3)", marginTop: 2, display: "block" }}>
              Solo letras, números, - y _
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Contraseña (mínimo 8 caracteres)</label>
            <div style={passwordWrapperStyle}>
              <input
                type={showPassword ? "text" : "password"}
                value={regToken}
                onChange={e => setRegToken(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 36 }}
                required
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} style={eyeBtnStyle}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Confirmar contraseña</label>
            <div style={passwordWrapperStyle}>
              <input
                type={showConfirm ? "text" : "password"}
                value={regConfirm}
                onChange={e => setRegConfirm(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 36 }}
                required
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)} style={eyeBtnStyle}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {regError && (
            <p style={{ fontSize: "0.82rem", color: "var(--hred)", background: "var(--hred-soft)", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}>
              {regError}
            </p>
          )}
          <button
            type="submit"
            disabled={registering || !regName.trim() || !regUsername || !regToken || !regConfirm}
            style={{ ...btnPrimary, background: registering || !regName.trim() || !regUsername || !regToken || !regConfirm ? "var(--htext3)" : "var(--haccent)", cursor: registering ? "not-allowed" : "pointer" }}
          >
            {registering ? "Creando cuenta..." : "Crear cuenta y unirme"}
          </button>
        </form>
        <p style={{ fontSize: "0.78rem", color: "var(--htext3)", textAlign: "center", marginTop: 12 }}>
          ¿Ya tenés cuenta? <a href={`/login?redirect=/join/${token}`} style={{ color: "var(--haccent)" }}>Iniciá sesión</a>
        </p>
      </div>
    </div>
  );

  return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12, textAlign: "center" }}>🏠</div>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4, textAlign: "center" }}>Te invitaron al grupo</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--haccent-soft)", borderRadius: 8, padding: "10px 16px", margin: "12px 0 16px", width: "100%", boxSizing: "border-box" }}>
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
          style={{ ...btnPrimary, background: joining ? "var(--htext3)" : "var(--haccent)", cursor: joining ? "not-allowed" : "pointer" }}
        >
          {joining ? "Uniéndome..." : "Aceptar invitación"}
        </button>
        <button onClick={() => router.push("/")} style={btnSecondary}>
          Rechazar
        </button>
      </div>
    </div>
  );
}
