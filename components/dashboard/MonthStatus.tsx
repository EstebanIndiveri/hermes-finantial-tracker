"use client";

type Status = "GREEN" | "YELLOW" | "RED";

const labels: Record<Status, string> = {
  GREEN: "🟢 En objetivo",
  YELLOW: "🟡 En alerta",
  RED: "🔴 Fuera de objetivo",
};

const colors: Record<Status, string> = {
  GREEN: "bg-emerald-900/30 border-emerald-500 text-emerald-400",
  YELLOW: "bg-yellow-900/30 border-yellow-500 text-yellow-400",
  RED: "bg-red-900/30 border-red-500 text-red-400",
};

export function MonthStatus({ status, ahorro_usd, saving_goal_usd }: { status: Status; ahorro_usd: number; saving_goal_usd: number }) {
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${colors[status]}`}>
      <span className="font-semibold text-sm">{labels[status]}</span>
      <span className="text-xs opacity-80">Ahorro: USD {ahorro_usd.toFixed(0)} / meta USD {saving_goal_usd.toFixed(0)}</span>
    </div>
  );
}
