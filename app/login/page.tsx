"use client";
import { useState, Suspense } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Usuario o contraseña incorrectos.");
        setLoading(false);
        return;
      }
      router.push(redirectTo);
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
      setLoading(false);
    }
  }

  return (
    <div
      data-hermes=""
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--hbg)",
        padding: "20px",
        width: "100%",
        boxSizing: "border-box" as const,
      }}
    >
      <div
        style={{
          background: "var(--hsurface)",
          border: "1px solid var(--hborder)",
          borderRadius: 16,
          padding: "40px 32px",
          width: "100%",
          maxWidth: 360,
          boxShadow: "var(--hshadow-lg)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>💰</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--htext1)", margin: 0 }}>
            Hermes Finance
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--htext3)", marginTop: 4 }}>
            Ingresá con tu usuario y contraseña
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="username"
              style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 6 }}
            >
              Usuario
            </label>
            <input
              id="username"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="tu_usuario"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--hborder)",
                background: "var(--hsurface2)",
                color: "var(--htext1)",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 6 }}
            >
              Contraseña
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: "100%",
                  padding: "12px 40px 12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--hborder)",
                  background: "var(--hsurface2)",
                  color: "var(--htext1)",
                  fontSize: "16px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
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
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: "var(--herror)", fontSize: "0.85rem", marginBottom: 16, textAlign: "center" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 10,
              border: "none",
              background: loading ? "var(--htext3)" : "var(--haccent)",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
