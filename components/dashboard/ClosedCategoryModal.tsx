"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  categoryName: string;
  isHardLimit: boolean;
  onConfirmException?: () => void;
}

export function ClosedCategoryModal({ open, onClose, categoryName, isHardLimit, onConfirmException }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🔴 Categoría cerrada: {categoryName}</DialogTitle>
          <DialogDescription>
            {isHardLimit
              ? "Esta categoría tiene límite duro y superó su presupuesto mensual. No se puede registrar el gasto."
              : "Esta categoría superó su presupuesto. Podés registrarlo como excepción si es necesario."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!isHardLimit && onConfirmException && (
            <Button variant="destructive" onClick={onConfirmException}>Registrar como excepción</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
