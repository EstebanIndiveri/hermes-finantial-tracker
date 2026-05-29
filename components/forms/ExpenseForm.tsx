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
      <form onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Monto (ARS)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="47000"
            />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select value={catId} onValueChange={(val) => setCatId(val ?? "")}>
              <SelectTrigger><SelectValue placeholder="Seleccioná..." /></SelectTrigger>
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
        <div>
          <Label>Comercio (opcional)</Label>
          <Input
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            placeholder="Ej: Carrefour"
            maxLength={100}
          />
        </div>
        <div>
          <Label>Descripción (opcional)</Label>
          <Input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Ej: compra semanal"
            maxLength={300}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
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
