"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PartnerBalance } from "@/lib/splits/types";

interface PagarModalProps {
  partner: PartnerBalance;
  debtAmount: number;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function PagarModal({ partner, debtAmount, onClose, onSuccess }: PagarModalProps) {
  const sessionOptions = useMemo(
    () => partner.sessionBreakdown.filter((session) => session.net < 0 || partner.net < 0).map((session) => ({
      sessionId: session.sessionId,
      label: session.sessionName,
      amount: Math.abs(session.net),
    })),
    [partner],
  );

  const [amount, setAmount] = useState(String(debtAmount));
  const [selectedSessionId, setSelectedSessionId] = useState<string>(sessionOptions.length === 1 ? sessionOptions[0].sessionId : "all");
  const [submitting, setSubmitting] = useState(false);

  const numericAmount = Number(amount.replace(",", "."));
  const maxAmount = selectedSessionId === "all"
    ? debtAmount
    : sessionOptions.find((session) => session.sessionId === selectedSessionId)?.amount ?? debtAmount;

  async function handleSubmit(): Promise<void> {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/splits/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payeeUserId: partner.partner.userId,
          payeeTempId: partner.partner.tempUserId,
          amount: numericAmount,
          sessionId: selectedSessionId === "all" ? undefined : selectedSessionId,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "No se pudo registrar el pago");
        return;
      }

      toast.success(`Pago registrado ✅ Restan $${formatAmount(data.remainingDebt)}`);
      await onSuccess();
    } catch {
      toast.error("Error de conexión al registrar el pago");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Registrá cuánto le pagaste a {partner.partnerName ?? "esta persona"}.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gap: 14 }}>
          <div className="h-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: "var(--htext2)", marginBottom: 4 }}>Persona</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--htext1)" }}>{partner.partnerName ?? "Sin nombre"}</div>
            <div style={{ fontSize: 13, color: "#EF4444", marginTop: 8 }}>Deuda total: ${formatAmount(debtAmount)}</div>
          </div>

          {sessionOptions.length > 1 && (
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--htext2)", marginBottom: 6 }}>Sesión</label>
              <Select value={selectedSessionId} onValueChange={(value) => setSelectedSessionId(value ?? "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas las sesiones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sesiones</SelectItem>
                  {sessionOptions.map((session) => (
                    <SelectItem key={session.sessionId} value={session.sessionId}>
                      {session.label} · ${formatAmount(session.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label htmlFor="payment-amount" style={{ display: "block", fontSize: 12, color: "var(--htext2)", marginBottom: 6 }}>
              Monto a pagar
            </label>
            <Input
              id="payment-amount"
              type="number"
              min="0.01"
              max={String(maxAmount)}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.currentTarget.value)}
            />
            <div style={{ fontSize: 11, color: "var(--htext3)", marginTop: 6 }}>Máximo disponible: ${formatAmount(maxAmount)}</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => setAmount(String(maxAmount))}>Pagar todo</Button>
            <Button variant="outline" onClick={() => setAmount(String(Math.max(0.01, Math.round((maxAmount / 2) * 100) / 100)))}>Pagar mitad</Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Registrando..." : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
