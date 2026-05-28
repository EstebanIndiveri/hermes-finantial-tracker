"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface MonthlySettings {
  income_usd: number;
  exchange_rate: number;
  saving_goal_usd: number;
  saving_goal_yellow: number;
}

interface Category {
  id: string;
  name: string;
  emoji: string;
}

interface BudgetItem {
  budget_ars: number;
  hard_limit: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<MonthlySettings | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Record<string, BudgetItem>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/monthly").then(r => r.json() as Promise<MonthlySettings>),
      fetch("/api/categories").then(r => r.json() as Promise<Category[]>),
    ]).then(([s, c]) => {
      setSettings(s);
      setCats(c);
    }).catch(err => {
      console.error("Error loading settings:", err);
      toast.error("Error al cargar configuración");
    });
  }, []);

  async function saveMonthly() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/monthly", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          income_usd: settings.income_usd,
          exchange_rate: settings.exchange_rate,
        }),
      });
      if (res.ok) toast.success("Configuración mensual guardada");
      else toast.error("Error al guardar");
    } catch (err) {
      console.error("Error saving monthly:", err);
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function saveThresholds() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saving_goal_usd: settings.saving_goal_usd,
          saving_goal_yellow: settings.saving_goal_yellow,
        }),
      });
      if (res.ok) toast.success("Umbrales guardados");
      else toast.error("Error al guardar");
    } catch (err) {
      console.error("Error saving thresholds:", err);
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function saveBudgets() {
    const items = Object.entries(budgets).map(([category_id, b]) => ({
      category_id,
      budget_ars: b.budget_ars,
      hard_limit: b.hard_limit,
    }));
    if (items.length === 0) {
      toast.error("No hay presupuestos para guardar");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/budgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) toast.success("Presupuestos guardados");
      else toast.error("Error al guardar");
    } catch (err) {
      console.error("Error saving budgets:", err);
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <p className="text-muted-foreground text-sm">Cargando...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <Card>
        <CardHeader><CardTitle>Configuración mensual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Ingreso mensual (USD)</Label>
            <Input
              type="number"
              value={settings.income_usd}
              onChange={e => setSettings({ ...settings, income_usd: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Tipo de cambio (ARS por USD)</Label>
            <Input
              type="number"
              value={settings.exchange_rate}
              onChange={e => setSettings({ ...settings, exchange_rate: Number(e.target.value) })}
            />
          </div>
          <Button onClick={() => void saveMonthly()} disabled={saving}>Guardar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Semáforo de ahorro</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Meta verde (USD) — Ahorro objetivo</Label>
            <Input
              type="number"
              value={settings.saving_goal_usd}
              onChange={e => setSettings({ ...settings, saving_goal_usd: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Umbral amarillo (USD) — Alerta de ahorro</Label>
            <Input
              type="number"
              value={settings.saving_goal_yellow}
              onChange={e => setSettings({ ...settings, saving_goal_yellow: Number(e.target.value) })}
            />
          </div>
          <Button onClick={() => void saveThresholds()} disabled={saving}>Guardar umbrales</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Presupuestos por categoría</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="w-36 text-sm truncate">{cat.emoji} {cat.name}</span>
              <Input
                type="number"
                min="0"
                placeholder="0 = sin límite"
                className="flex-1"
                value={budgets[cat.id]?.budget_ars ?? ""}
                onChange={e => setBudgets(b => ({
                  ...b,
                  [cat.id]: {
                    budget_ars: Number(e.target.value),
                    hard_limit: b[cat.id]?.hard_limit ?? true,
                  },
                }))}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch
                  checked={budgets[cat.id]?.hard_limit ?? true}
                  onCheckedChange={v => setBudgets(b => ({
                    ...b,
                    [cat.id]: {
                      budget_ars: b[cat.id]?.budget_ars ?? 0,
                      hard_limit: v,
                    },
                  }))}
                />
                <span className="text-xs text-muted-foreground">Límite duro</span>
              </div>
            </div>
          ))}
          <Button onClick={() => void saveBudgets()} disabled={saving}>Guardar presupuestos</Button>
        </CardContent>
      </Card>
    </div>
  );
}
