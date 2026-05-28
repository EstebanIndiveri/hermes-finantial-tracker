"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#10b981","#f59e0b","#3b82f6","#8b5cf6","#f43f5e","#06b6d4","#84cc16","#fb923c","#a78bfa","#e879f9"];

interface CatData { name: string; gastado_ars: number; emoji: string; }

export function CategoryDonut({ data }: { data: CatData[] }) {
  const filtered = data.filter(d => d.gastado_ars > 0);
  if (!filtered.length) return <p className="text-muted-foreground text-sm text-center py-8">Sin gastos registrados</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={filtered} dataKey="gastado_ars" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
          {filtered.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `$${v.toLocaleString("es-AR")}` : ''} />
      </PieChart>
    </ResponsiveContainer>
  );
}
