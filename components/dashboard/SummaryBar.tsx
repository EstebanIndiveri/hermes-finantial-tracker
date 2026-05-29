"use client";

interface Props { label: string; value: string; sub?: string; icon?: string; }

export function SummaryBar({ label, value, sub, icon }: Props) {
  return (
    <div className="card-glow bg-card border border-border/60 rounded-2xl p-5 flex flex-col gap-2">
      {icon && (
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-base mb-1">
          {icon}
        </div>
      )}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className="font-heading font-bold text-2xl text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
