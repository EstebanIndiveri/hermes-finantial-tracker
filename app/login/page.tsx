"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError("Token incorrecto.");
        setLoading(false);
        return;
      }
      router.push(redirectTo);
    } catch (err) {
      console.error("Login error:", err);
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
          <h1
            style={{
              fontSize: "1.4rem",
              fontWeight: 700,
              color: "var(--htext1)",
              margin: 0,
            }}
          >
            Hermes Finance
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--htext3)", marginTop: 4 }}>
            Ingresá tu token de acceso
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="token"
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 500,
                color: "var(--htext2)",
                marginBottom: 6,
              }}
            >
              Token de acceso
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--hborder)",
                background: "var(--hsurface2)",
                color: "var(--htext1)",
                fontSize: "0.9rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <p
              style={{
                fontSize: "0.82rem",
                color: "var(--hred)",
                marginBottom: 12,
                padding: "8px 12px",
                background: "var(--hred-soft)",
                borderRadius: 6,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "11px",
              borderRadius: 8,
              border: "none",
              background: loading ? "var(--htext3)" : "var(--haccent)",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          data-hermes=""
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--hbg)",
          }}
        >
          <p style={{ color: "var(--htext2)" }}>Cargando...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
