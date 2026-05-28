"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props { data: { name: string; gastado: number; budget: number; status: string }[] }

const barColor: Record<string, string> = { OK: "#10b981", WARNING: "#f59e0b", CLOSED: "#f43f5e" };

export function SpendingChart({ data }: Props) {
  const filtered = data.filter(d => d.budget > 0 || d.gastado > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={filtered} margin={{ left: 8, right: 8 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `$${v.toLocaleString("es-AR")}` : ''} />
        <Bar dataKey="gastado" name="Gastado" radius={[4,4,0,0]}>
          {filtered.map((d, i) => <Cell key={i} fill={barColor[d.status] ?? "#6366f1"} />)}
        </Bar>
        <Bar dataKey="budget" name="Presupuesto" fill="#334155" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
