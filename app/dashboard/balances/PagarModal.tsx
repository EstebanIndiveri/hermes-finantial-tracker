"use client";

import { useMemo, useRef, useState } from "react";
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
  const pendingOperation = useRef<{ id: string; payload: string } | null>(null);

  const numericAmount = Number(amount.replace(",", "."));
  const maxAmount = selectedSessionId === "all"
    ? debtAmount
    : sessionOptions.find((session) => session.sessionId === selectedSessionId)?.amount ?? debtAmount;

  async function handleSubmit(): Promise<void> {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }

    const payment = {
      payeeUserId: partner.partner.userId,
      payeeTempId: partner.partner.tempUserId,
      amount: numericAmount,
      sessionId: selectedSessionId === "all" ? undefined : selectedSessionId,
    };
    const payload = JSON.stringify(payment);
    if (pendingOperation.current && pendingOperation.current.payload !== payload) {
      toast.error("El pago anterior pudo haberse guardado. Revisá el saldo antes de cambiarlo y volver a registrar.");
      return;
    }
    pendingOperation.current ??= { id: crypto.randomUUID(), payload };
    setSubmitting(true);
    let confirmed = false;
    try {
      const response = await fetch("/api/splits/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payment, operationId: pendingOperation.current.id }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 409) pendingOperation.current = null;
        toast.error(response.status >= 500
          ? "No se pudo confirmar la respuesta. Revisá el saldo o reintentá este mismo pago sin cambiarlo."
          : data?.error ?? "No se pudo registrar el pago");
        return;
      }

      if (data.notificationFailed === true) {
        toast.warning("Pago registrado; no se pudo confirmar el aviso por Telegram.");
      } else if (data.replayed) {
        toast.success("Pago ya registrado; no se duplicó.");
      } else {
        toast.success(`Pago registrado ✅ Restan $${formatAmount(data.remainingDebt)}`);
      }
      confirmed = true;
    } catch {
      toast.error("Respuesta incierta. Revisá el saldo o reintentá el mismo pago sin cambiarlo.");
    } finally {
      setSubmitting(false);
    }
    if (confirmed) {
      try {
        await onSuccess();
      } catch {
        toast.error("El pago se guardó, pero no se pudo actualizar el saldo. Recargá la página.");
      }
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
