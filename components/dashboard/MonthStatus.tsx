"use client";

type Status = "GREEN" | "YELLOW" | "RED";

const config: Record<Status, {
  label: string;
  dotClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  pulse: boolean;
}> = {
  GREEN: {
    label: "En objetivo",
    dotClass: "bg-emerald-400",
    bgClass: "bg-emerald-500/5",
    borderClass: "border-emerald-500/20",
    textClass: "text-emerald-400",
    pulse: false,
  },
  YELLOW: {
    label: "En alerta",
    dotClass: "bg-amber-400",
    bgClass: "bg-amber-500/5",
    borderClass: "border-amber-500/20",
    textClass: "text-amber-400",
    pulse: true,
  },
  RED: {
    label: "Fuera de objetivo",
    dotClass: "bg-rose-400",
    bgClass: "bg-rose-500/5",
    borderClass: "border-rose-500/20",
    textClass: "text-rose-400",
    pulse: true,
  },
};

export function MonthStatus({
  status,
  ahorro_usd,
  saving_goal_usd,
}: {
  status: Status;
  ahorro_usd: number;
  saving_goal_usd: number;
}) {
  const c = config[status];
  const pct = saving_goal_usd > 0 ? Math.min(100, Math.round((ahorro_usd / saving_goal_usd) * 100)) : 0;

  return (
    <div className={`card-glow rounded-2xl border ${c.borderClass} ${c.bgClass} px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 animate-fade-in-up`}>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <div className={`w-12 h-12 rounded-full ${c.dotClass} opacity-20 ${c.pulse ? "animate-ping absolute inset-0" : ""}`} />
          <div className={`relative w-12 h-12 rounded-full ${c.dotClass} flex items-center justify-center`}>
            <div className="w-5 h-5 rounded-full bg-white/30" />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-0.5">Estado del mes</p>
          <p className={`font-heading font-bold text-xl ${c.textClass}`}>{c.label}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 sm:ml-auto">
        <div className="flex flex-col items-center bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 min-w-[110px]">
          <span className="text-xs text-muted-foreground mb-1">Ahorro proyectado</span>
          <span className={`font-heading font-bold text-lg ${c.textClass}`}>
            USD {ahorro_usd.toFixed(0)}
          </span>
        </div>
        <div className="flex flex-col items-center bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 min-w-[110px]">
          <span className="text-xs text-muted-foreground mb-1">Meta</span>
          <span className="font-heading font-bold text-lg text-foreground/70">
            USD {saving_goal_usd.toFixed(0)}
          </span>
        </div>
        <div className="flex flex-col items-center bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 min-w-[80px]">
          <span className="text-xs text-muted-foreground mb-1">Avance</span>
          <span className={`font-heading font-bold text-lg ${c.textClass}`}>{pct}%</span>
        </div>
      </div>
    </div>
  );
}
