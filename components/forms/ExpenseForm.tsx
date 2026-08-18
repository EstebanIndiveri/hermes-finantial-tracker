"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClosedCategoryModal } from "@/components/dashboard/ClosedCategoryModal";
import { toast } from "sonner";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  status: string;
  hard_limit: number;
}

export function ExpenseForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [desc, setDesc] = useState("");
  const [requiresReimbursement, setRequiresReimbursement] = useState(false);
  const [loading, setLoading] = useState(false);
  const [closedModal, setClosedModal] = useState<{ open: boolean; isHard: boolean; name: string } | null>(null);
  const [pendingException, setPendingException] = useState(false);

  async function submit(isException = false) {
    if (!amount || !catId) {
      toast.error("Monto y categoría requeridos");
      return;
    }
    const num = parseFloat(amount.replace(",", "."));
    if (isNaN(num) || num <= 0) {
      toast.error("Monto inválido");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_ars: num,
          category_id: catId,
          merchant: merchant || undefined,
          description: desc || undefined,
          is_exception: isException,
          requiresReimbursement,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "CATEGORY_CLOSED") {
          const cat = categories.find(c => c.id === catId);
          setClosedModal({ open: true, isHard: true, name: cat?.name ?? "" });
          return;
        }
        if (data.code === "BUDGET_EXCEEDED_SOFT") {
          const cat = categories.find(c => c.id === catId);
          setClosedModal({ open: true, isHard: false, name: cat?.name ?? "" });
          setPendingException(true);
          return;
        }
        toast.error(data.message ?? "Error al registrar");
        return;
      }

      toast.success(`$${num.toLocaleString("es-AR")} registrado ✅`);
      setAmount("");
      setCatId("");
      setMerchant("");
      setDesc("");
      setRequiresReimbursement(false);
      setPendingException(false);
      router.refresh();
    } catch (err) {
      console.error("Error registering expense:", err);
      toast.error("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        onSubmit={e => { e.preventDefault(); void submit(); }}
        className="bg-card border border-border/60 rounded-2xl p-5 space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monto (ARS)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="47000"
              className="bg-background/50 border-border/60 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categoría</Label>
            <Select value={catId} onValueChange={(val) => setCatId(val ?? "")}>
              <SelectTrigger className="bg-background/50 border-border/60 focus:ring-indigo-500/50">
                <SelectValue placeholder="Seleccioná..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    disabled={c.status === "CLOSED" && c.hard_limit === 1}
                  >
                    {c.emoji} {c.name} {c.status === "CLOSED" ? "🔴" : c.status === "WARNING" ? "🟡" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Comercio (opcional)</Label>
          <Input
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            placeholder="Ej: Carrefour"
            maxLength={100}
            className="bg-background/50 border-border/60 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descripción (opcional)</Label>
          <Input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Ej: compra semanal"
            maxLength={300}
            className="bg-background/50 border-border/60 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50"
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            id="requiresReimbursement"
            type="checkbox"
            checked={requiresReimbursement}
            onChange={(event) => setRequiresReimbursement(event.target.checked)}
          />
          <Label htmlFor="requiresReimbursement">Requiere reintegro</Label>
        </div>

        <Button
          type="submit"
          className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold shadow-lg shadow-indigo-500/20 transition-all"
          disabled={loading}
        >
          {loading ? "Guardando..." : "Registrar gasto"}
        </Button>
      </form>

      {closedModal && (
        <ClosedCategoryModal
          open={closedModal.open}
          onClose={() => {
            setClosedModal(null);
            setPendingException(false);
          }}
          categoryName={closedModal.name}
          isHardLimit={closedModal.isHard}
          onConfirmException={
            pendingException
              ? () => { setClosedModal(null); void submit(true); }
              : undefined
          }
        />
      )}
    </>
  );
}
