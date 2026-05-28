"use client";

type CatStatus = "OK" | "WARNING" | "CLOSED";

const statusColors: Record<CatStatus, string> = {
  OK: "border-l-emerald-500",
  WARNING: "border-l-yellow-500",
  CLOSED: "border-l-red-500",
};

const statusBadge: Record<CatStatus, string> = {
  OK: "bg-emerald-900/40 text-emerald-400",
  WARNING: "bg-yellow-900/40 text-yellow-400",
  CLOSED: "bg-red-900/40 text-red-400",
};

interface Props {
  name: string; emoji: string; status: CatStatus;
  gastado_ars: number; budget_ars: number; disponible_ars: number | null;
}

export function CategoryCard({ name, emoji, status, gastado_ars, budget_ars, disponible_ars }: Props) {
  const pct = budget_ars > 0 ? Math.min(100, Math.round((gastado_ars / budget_ars) * 100)) : 0;
  return (
    <div className={`rounded-xl border border-l-4 ${statusColors[status]} bg-card p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{emoji} {name}</span>
        <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${statusBadge[status]}`}>{status}</span>
      </div>
      {budget_ars > 0 && (
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${status === "CLOSED" ? "bg-red-500" : status === "WARNING" ? "bg-yellow-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Gastado: ${gastado_ars.toLocaleString("es-AR")}</span>
        {budget_ars > 0 && <span>Presupuesto: ${budget_ars.toLocaleString("es-AR")}</span>}
        {disponible_ars !== null && <span>Disp: ${disponible_ars.toLocaleString("es-AR")}</span>}
      </div>
    </div>
  );
}
