"use client";
import { useRouter } from "next/navigation";

interface Props {
  month: string; // YYYY-MM
}

export function MonthSelector({ month }: Props) {
  const router = useRouter();

  function navigate(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/dashboard?month=${next}`);
  }

  const label = new Date(month + "-15").toLocaleDateString("es-AR", {
    month: "long", year: "numeric",
  });
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);

  // Determine if this is current month to disable "next"
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = month === currentMonth;
  const isFutureMonth = month > currentMonth;

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      background: "var(--hsurface2)",
      border: "1px solid var(--hborder)",
      borderRadius: 8,
      padding: "4px 8px",
    }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--htext2)", padding: "2px 6px", borderRadius: 4,
          fontSize: 14, lineHeight: 1, transition: "color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--haccent)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--htext2)")}
        aria-label="Mes anterior"
      >
        ‹
      </button>

      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: isCurrentMonth ? "var(--haccent)" : "var(--htext1)",
        minWidth: 130,
        textAlign: "center",
        padding: "0 4px",
      }}>
        {capitalized}
        {isCurrentMonth && (
          <span style={{ fontSize: 10, color: "var(--haccent)", marginLeft: 4, opacity: 0.7 }}>actual</span>
        )}
      </span>

      <button
        type="button"
        onClick={() => navigate(1)}
        disabled={isCurrentMonth || isFutureMonth}
        style={{
          background: "none", border: "none",
          cursor: isCurrentMonth || isFutureMonth ? "default" : "pointer",
          color: isCurrentMonth || isFutureMonth ? "var(--hborder)" : "var(--htext2)",
          padding: "2px 6px", borderRadius: 4,
          fontSize: 14, lineHeight: 1, transition: "color 0.15s",
        }}
        onMouseEnter={e => {
          if (!isCurrentMonth && !isFutureMonth) e.currentTarget.style.color = "var(--haccent)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = isCurrentMonth || isFutureMonth ? "var(--hborder)" : "var(--htext2)";
        }}
        aria-label="Mes siguiente"
      >
        ›
      </button>
    </div>
  );
}
