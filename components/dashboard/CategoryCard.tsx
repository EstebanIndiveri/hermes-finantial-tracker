"use client";

type CatStatus = "OK" | "WARNING" | "CLOSED";

const statusConfig: Record<CatStatus, {
  badge: string;
  bar: string;
  border: string;
  glow: string;
  label: string;
}> = {
  OK: {
    badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
    bar: "bg-emerald-500",
    border: "border-emerald-500/20",
    glow: "hover:shadow-emerald-500/10",
    label: "OK",
  },
  WARNING: {
    badge: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
    bar: "bg-amber-400",
    border: "border-amber-500/20",
    glow: "hover:shadow-amber-500/10",
    label: "ALERTA",
  },
  CLOSED: {
    badge: "bg-rose-500/15 text-rose-400 border border-rose-500/25",
    bar: "bg-rose-400",
    border: "border-rose-500/20",
    glow: "hover:shadow-rose-500/10",
    label: "CERRADO",
  },
};

interface Props {
  name: string; emoji: string; status: CatStatus;
  gastado_ars: number; budget_ars: number; disponible_ars: number | null;
}

export function CategoryCard({ name, emoji, status, gastado_ars, budget_ars, disponible_ars }: Props) {
  const pct = budget_ars > 0 ? Math.min(100, Math.round((gastado_ars / budget_ars) * 100)) : 0;
  const cfg = statusConfig[status];

  return (
    <div
      className={`card-glow bg-card border ${cfg.border} rounded-2xl p-4 space-y-3 transition-shadow ${cfg.glow}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <span className="font-medium text-sm text-foreground">{name}</span>
        </div>
        <span className={`text-xs rounded-full px-2.5 py-0.5 font-semibold tracking-wide ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {budget_ars > 0 && (
        <div className="space-y-1">
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full progress-bar ${cfg.bar}`}
              style={{ "--target-width": `${pct}%`, width: `${pct}%` } as React.CSSProperties}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{pct}% usado</span>
            <span>${gastado_ars.toLocaleString("es-AR")} / ${budget_ars.toLocaleString("es-AR")}</span>
          </div>
        </div>
      )}

      {!budget_ars && (
        <p className="text-xs text-muted-foreground">
          Gastado: ${gastado_ars.toLocaleString("es-AR")}
        </p>
      )}

      {disponible_ars !== null && budget_ars > 0 && (
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <span className="text-xs text-muted-foreground">Disponible</span>
          <span className={`text-sm font-semibold font-heading ${disponible_ars < 0 ? "text-rose-400" : "text-emerald-400"}`}>
            ${disponible_ars.toLocaleString("es-AR")}
          </span>
        </div>
      )}
    </div>
  );
}
