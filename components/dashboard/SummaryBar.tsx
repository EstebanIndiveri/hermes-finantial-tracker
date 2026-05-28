"use client";
interface Props { label: string; value: string; sub?: string; }
export function SummaryBar({ label, value, sub }: Props) {
  return (
    <div className="bg-card rounded-xl border p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
