"use client";

import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PaymentMethod = "cbu" | "alias" | "efectivo";

interface PaymentInfo {
  id: string;
  paymentMethod: PaymentMethod;
  value: string | null;
  isDefault: boolean;
}

function getMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "cbu":
      return "CBU";
    case "alias":
      return "Alias";
    case "efectivo":
      return "Efectivo";
    default:
      return method;
  }
}

export function PaymentInfoForm() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newMethod, setNewMethod] = useState<PaymentMethod>("cbu");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    void fetchPaymentInfo();
  }, []);

  async function fetchPaymentInfo() {
    try {
      const response = await fetch("/api/user/payment-info");

      if (!response.ok) {
        return;
      }

      const data: PaymentInfo[] = await response.json();
      setPaymentMethods(data);
    } catch (error) {
      console.error("Error fetching payment info:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (newMethod !== "efectivo" && !newValue.trim()) {
      return;
    }

    setAdding(true);
    try {
      const response = await fetch("/api/user/payment-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: newMethod,
          value: newMethod === "efectivo" ? null : newValue.trim(),
          isDefault: paymentMethods.length === 0,
        }),
      });

      if (!response.ok) {
        return;
      }

      setNewValue("");
      await fetchPaymentInfo();
    } catch (error) {
      console.error("Error adding payment info:", error);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/user/payment-info?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchPaymentInfo();
      }
    } catch (error) {
      console.error("Error deleting payment info:", error);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Cargando...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de Pago</CardTitle>
        <CardDescription>
          Configura tus métodos de pago para recibir reintegros
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paymentMethods.length > 0 && (
          <div className="space-y-2">
            {paymentMethods.map((paymentMethod) => (
              <div
                key={paymentMethod.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  {paymentMethod.isDefault ? (
                    <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  ) : null}
                  <span className="font-medium">
                    {getMethodLabel(paymentMethod.paymentMethod)}
                  </span>
                  {paymentMethod.value ? (
                    <span className="text-muted-foreground">: {paymentMethod.value}</span>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    void handleDelete(paymentMethod.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 border-t pt-4">
          <div className="flex-1 space-y-2">
            <Label>Método</Label>
            <Select
              value={newMethod}
              onValueChange={(value) => {
                setNewMethod(value as PaymentMethod);
                if (value === "efectivo") {
                  setNewValue("");
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cbu">CBU</SelectItem>
                <SelectItem value="alias">Alias</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {newMethod !== "efectivo" ? (
            <div className="flex-[2] space-y-2">
              <Label>{newMethod === "cbu" ? "Número de CBU" : "Alias"}</Label>
              <Input
                placeholder={newMethod === "cbu" ? "0000000000000000000000" : "mi.alias"}
                value={newValue}
                onChange={(event) => {
                  setNewValue(event.target.value);
                }}
              />
            </div>
          ) : null}

          <Button
            onClick={() => {
              void handleAdd();
            }}
            disabled={adding || (newMethod !== "efectivo" && !newValue.trim())}
          >
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
