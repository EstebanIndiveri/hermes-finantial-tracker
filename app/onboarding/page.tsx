"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = 1 | 2 | 3;

interface UserInfo {
  name: string;
  has_telegram: boolean;
  onboarding_completed: boolean;
}

const TOUR_SLIDES = [
  { icon: "📊", title: "Dashboard", desc: "Resumen mensual de ingresos, gastos, ahorro y distribución por categoría." },
  { icon: "➕", title: "Registrar gastos", desc: "Agregá transacciones desde la web o directamente con el bot de Telegram." },
  { icon: "🗂️", title: "Categorías y presupuesto", desc: "Configurá límites por categoría y controlá en qué gastás más cada mes." },
  { icon: "🤖", title: "Bot de Telegram", desc: "Escribí gastos en lenguaje natural y consultá tu saldo desde cualquier lugar." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [slideIndex, setSlideIndex] = useState(0);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [telegramCode, setTelegramCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.replace("/login?redirect=/onboarding");
          return;
        }
        const data = await res.json();
        if (!data || typeof data.name !== "string") {
          router.replace("/login?redirect=/onboarding");
          return;
        }
        if (data.onboarding_completed === true) {
          router.replace("/dashboard");
          return;
        }
        setUser(data);
        setDisplayName(data.name);
        setTelegramLinked(data.has_telegram === true);
      } catch (err) {
        console.error("Error loading user:", err);
        router.replace("/login?redirect=/onboarding");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router]);

  async function fetchTelegramCode() {
    setLoadingCode(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/telegram/link-code", { method: "POST" });
      if (!res.ok) {
        setError("No se pudo generar el código. Tocá 'Saltar' e intentalo desde Configuración.");
        return;
      }
      const data = await res.json();
      if (data?.code && typeof data.code === "string") {
        setTelegramCode(data.code);
      } else {
        setError("Respuesta inválida del servidor. Podés saltar este paso.");
      }
    } catch {
      setError("Error de conexión al generar el código de Telegram.");
    } finally {
      setLoadingCode(false);
    }
  }

  async function completeOnboarding() {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboarding_completed: true,
          name: displayName.trim() || user?.name || "",
        }),
      });
      if (!res.ok) {
        setError("No se pudo guardar el progreso. Intentá de nuevo.");
        setCompleting(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Error de conexión. Verificá tu internet.");
      setCompleting(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--hbg)",
    padding: 20,
    width: "100%",
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--hsurface)",
    border: "1px solid var(--hborder)",
    borderRadius: 20,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "var(--hshadow-lg)",
    position: "relative",
  };

  const btnPrimary: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    border: "none",
    background: "var(--haccent)",
    color: "white",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
    marginBottom: 8,
  };

  const btnSecondary: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    borderRadius: 10,
    border: "1px solid var(--hborder)",
    background: "transparent",
    color: "var(--htext2)",
    cursor: "pointer",
    fontSize: "0.88rem",
  };

  const btnGhost: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "var(--htext3)",
    cursor: "pointer",
    fontSize: "0.82rem",
    textDecoration: "underline",
    padding: "8px",
  };

  if (loading) {
    return (
      <div data-hermes="" style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ color: "var(--htext2)", textAlign: "center" }}>Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const progressBarStyle: React.CSSProperties = {
    display: "flex",
    gap: 6,
    marginBottom: 28,
  };

  const segmentStyle = (index: number): React.CSSProperties => ({
    flex: 1,
    height: 4,
    borderRadius: 2,
    background:
      index < step
        ? "var(--haccent)"
        : index === step
        ? "var(--haccent)"
        : "var(--hborder)",
    transition: "background 0.3s ease",
    opacity: index < step ? 0.6 : 1,
  });

  return (
    <div data-hermes="" style={containerStyle}>
      <div style={cardStyle}>
        {/* Progress bar */}
        <div style={progressBarStyle}>
          <div style={segmentStyle(1)} />
          <div style={segmentStyle(2)} />
          <div style={segmentStyle(3)} />
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>👋</div>
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--htext1)",
                  margin: 0,
                  marginBottom: 6,
                }}
              >
                ¡Bienvenido/a, {user.name}!
              </h1>
              <p style={{ fontSize: "0.88rem", color: "var(--htext3)", margin: 0 }}>
                Te damos la bienvenida a Hermes Finance
              </p>
            </div>

            <div
              style={{
                background: "var(--haccent-soft)",
                borderRadius: 12,
                padding: "18px 20px",
                marginBottom: 24,
              }}
            >
              <h2
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  color: "var(--htext1)",
                  marginTop: 0,
                  marginBottom: 10,
                }}
              >
                Tus permisos en el grupo
              </h2>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  color: "var(--htext2)",
                  fontSize: "0.85rem",
                  lineHeight: 1.6,
                }}
              >
                <li>Ver resumen y estadísticas del grupo</li>
                <li>Registrar gastos e ingresos</li>
                <li>Consultar historial de transacciones</li>
                <li>Usar el bot de Telegram</li>
              </ul>
            </div>

            {/* Display name editor */}
            <div style={{ margin: "20px 0 8px" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 500, color: "var(--htext2)", marginBottom: 6 }}>
                ¿Cómo querés que te llamemos?
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                maxLength={50}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--hborder)",
                  background: "var(--hsurface2)",
                  color: "var(--htext1)",
                  fontSize: "16px",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--htext3)", marginTop: 4, display: "block" }}>
                Este nombre es visible en la app. Podés cambiarlo después en Configuración.
              </span>
            </div>

            {error && (
              <div style={{
                background: "var(--hred-soft)",
                border: "1px solid var(--hred)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 12,
                fontSize: "0.82rem",
                color: "var(--hred)",
              }}>
                {error}
              </div>
            )}

            <button onClick={() => {
              setError(null);
              setStep(2);
            }} disabled={completing} style={btnPrimary}>
              Ver qué puedo hacer →
            </button>
            <button onClick={completeOnboarding} disabled={completing} style={btnGhost}>
              {completing ? "Guardando..." : "Ir al dashboard directo"}
            </button>
          </div>
        )}

        {/* Step 2: Tour */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: "3.5rem", marginBottom: 12 }}>
                {TOUR_SLIDES[slideIndex].icon}
              </div>
              <h2
                style={{
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: "var(--htext1)",
                  margin: 0,
                  marginBottom: 8,
                }}
              >
                {TOUR_SLIDES[slideIndex].title}
              </h2>
              <p
                style={{
                  fontSize: "0.88rem",
                  color: "var(--htext2)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {TOUR_SLIDES[slideIndex].desc}
              </p>
            </div>

            {/* Dots navigation */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginBottom: 24,
              }}
            >
              {TOUR_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlideIndex(i)}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    border: "none",
                    background: i === slideIndex ? "var(--haccent)" : "var(--hborder)",
                    cursor: "pointer",
                    padding: 0,
                    transition: "background 0.2s ease",
                  }}
                  aria-label={`Ir a slide ${i + 1}`}
                />
              ))}
            </div>

            {/* Navigation arrows */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <button
                onClick={() => setSlideIndex(Math.max(0, slideIndex - 1))}
                disabled={slideIndex === 0}
                style={{
                  ...btnSecondary,
                  width: "auto",
                  padding: "8px 16px",
                  opacity: slideIndex === 0 ? 0.4 : 1,
                  cursor: slideIndex === 0 ? "not-allowed" : "pointer",
                }}
              >
                ← Anterior
              </button>
              <button
                onClick={() =>
                  setSlideIndex(Math.min(TOUR_SLIDES.length - 1, slideIndex + 1))
                }
                disabled={slideIndex === TOUR_SLIDES.length - 1}
                style={{
                  ...btnSecondary,
                  width: "auto",
                  padding: "8px 16px",
                  opacity: slideIndex === TOUR_SLIDES.length - 1 ? 0.4 : 1,
                  cursor: slideIndex === TOUR_SLIDES.length - 1 ? "not-allowed" : "pointer",
                }}
              >
                Siguiente →
              </button>
            </div>

            {error && (
              <div style={{
                background: "var(--hred-soft)",
                border: "1px solid var(--hred)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 12,
                fontSize: "0.82rem",
                color: "var(--hred)",
              }}>
                {error}
              </div>
            )}

            <button
              onClick={() => {
                if (slideIndex === TOUR_SLIDES.length - 1) {
                  setError(null);
                  setStep(3);
                  if (!telegramLinked && !telegramCode) {
                    fetchTelegramCode();
                  }
                } else {
                  setSlideIndex(slideIndex + 1);
                }
              }}
              style={btnPrimary}
            >
              {slideIndex === TOUR_SLIDES.length - 1 ? "Continuar →" : "Siguiente →"}
            </button>
            <button
              onClick={() => {
                setError(null);
                setStep(3);
                if (!telegramLinked && !telegramCode) {
                  fetchTelegramCode();
                }
              }}
              style={btnGhost}
            >
              Saltar y ir al dashboard
            </button>
          </div>
        )}

        {/* Step 3: Telegram */}
        {step === 3 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🤖</div>
              <h1
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  color: "var(--htext1)",
                  margin: 0,
                  marginBottom: 6,
                }}
              >
                {telegramLinked ? "Telegram ya conectado" : "Conectar Telegram"}
              </h1>
              <p style={{ fontSize: "0.88rem", color: "var(--htext3)", margin: 0 }}>
                {telegramLinked
                  ? "Tu cuenta ya está vinculada al bot"
                  : "Registrá gastos desde cualquier lugar"}
              </p>
            </div>

            {telegramLinked ? (
              <div
                style={{
                  background: "var(--haccent-soft)",
                  borderRadius: 12,
                  padding: "20px",
                  marginBottom: 24,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>✅</div>
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--htext1)",
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  Telegram ya conectado
                </p>
              </div>
            ) : (
              <>
                {loadingCode ? (
                  <div
                    style={{
                      background: "var(--hsurface2)",
                      borderRadius: 12,
                      padding: "24px",
                      marginBottom: 20,
                      textAlign: "center",
                    }}
                  >
                    <p style={{ color: "var(--htext2)", margin: 0 }}>
                      Generando código...
                    </p>
                  </div>
                ) : telegramCode ? (
                  <>
                    <div
                      style={{
                        background: "var(--hsurface2)",
                        borderRadius: 12,
                        padding: "20px",
                        marginBottom: 12,
                        textAlign: "center",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "0.82rem",
                          color: "var(--htext3)",
                          marginTop: 0,
                          marginBottom: 10,
                        }}
                      >
                        Tu código de vinculación:
                      </p>
                      <div
                        style={{
                          fontSize: "2rem",
                          fontWeight: 700,
                          color: "var(--haccent)",
                          letterSpacing: 4,
                          fontFamily: "monospace",
                          margin: 0,
                        }}
                      >
                        {telegramCode.slice(0, 3)} {telegramCode.slice(3)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const botUsername =
                          process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
                          "HermesFinanceAssistBot";
                        window.open(
                          `https://t.me/${botUsername}?start=link_${telegramCode}`,
                          "_blank"
                        );
                      }}
                      style={{ ...btnPrimary, marginBottom: 12 }}
                    >
                      Abrir en Telegram y vincular
                    </button>
                  </>
                ) : (
                  <button
                    onClick={fetchTelegramCode}
                    style={{ ...btnPrimary, marginBottom: 12 }}
                  >
                    Generar código de vinculación
                  </button>
                )}
              </>
            )}

            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--htext3)",
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              Podés conectarlo después en Configuración
            </p>

            {error && (
              <div style={{
                background: "var(--hred-soft)",
                border: "1px solid var(--hred)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 12,
                fontSize: "0.82rem",
                color: "var(--hred)",
              }}>
                {error}
              </div>
            )}

            <button
              onClick={completeOnboarding}
              disabled={completing}
              style={{
                ...btnPrimary,
                background: completing ? "var(--htext3)" : "var(--haccent)",
                cursor: completing ? "not-allowed" : "pointer",
              }}
            >
              {completing
                ? "Guardando..."
                : telegramLinked
                ? "¡Listo! Ir al dashboard 🚀"
                : "Continuar sin Telegram"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
