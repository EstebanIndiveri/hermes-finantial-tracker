"use client";

import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
      if (!response.ok) return;
      const data: PaymentInfo[] = await response.json();
      setPaymentMethods(data);
    } catch (error) {
      console.error("Error fetching payment info:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (newMethod !== "efectivo" && !newValue.trim()) return;

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

      if (response.ok) {
        setNewValue("");
        toast.success("Método de pago agregado ✅");
        await fetchPaymentInfo();
      } else {
        toast.error("Error al agregar");
      }
    } catch {
      toast.error("Error de conexión");
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
        toast.success("Método eliminado");
        await fetchPaymentInfo();
      }
    } catch {
      toast.error("Error al eliminar");
    }
  }

  if (loading) {
    return (
      <div className="h-card h-animate">
        <div className="h-card-body" style={{ textAlign: "center", padding: 32, color: "var(--htext3)" }}>
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <div className="h-card h-animate">
      <div className="h-card-header" style={{ paddingBottom: 16, borderBottom: "1px solid var(--hborder)" }}>
        <div>
          <h2 className="h-card-title" style={{ fontSize: 14, fontWeight: 600, color: "var(--htext1)" }}>
            💳 Datos de Pago
          </h2>
          <p style={{ fontSize: 12, color: "var(--htext3)", marginTop: 2 }}>
            Configura tus métodos de pago para recibir reintegros
          </p>
        </div>
      </div>
      <div className="h-card-body">
        {/* Lista de métodos existentes */}
        {paymentMethods.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {paymentMethods.map((pm) => (
              <div
                key={pm.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--hbg2)",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {pm.isDefault && (
                    <Star style={{ width: 16, height: 16, color: "#eab308", fill: "#eab308" }} />
                  )}
                  <span style={{ fontWeight: 500, color: "var(--htext1)" }}>
                    {getMethodLabel(pm.paymentMethod)}
                  </span>
                  {pm.value && (
                    <span style={{ color: "var(--htext3)" }}>: {pm.value}</span>
                  )}
                </div>
                <button
                  onClick={() => void handleDelete(pm.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 8,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Eliminar"
                >
                  <Trash2 style={{ width: 16, height: 16, color: "var(--hred)" }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Formulario para agregar */}
        <div className="h-form-grid" style={{ alignItems: "flex-end", gap: 12 }}>
          <div className="h-form-group">
            <label className="h-form-label">Método</label>
            <select
              className="h-form-control"
              value={newMethod}
              onChange={(e) => {
                setNewMethod(e.target.value as PaymentMethod);
                if (e.target.value === "efectivo") setNewValue("");
              }}
              style={{ minWidth: 120 }}
            >
              <option value="cbu">CBU</option>
              <option value="alias">Alias</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </div>

          {newMethod !== "efectivo" && (
            <div className="h-form-group" style={{ flex: 2 }}>
              <label className="h-form-label">
                {newMethod === "cbu" ? "Número de CBU" : "Alias"}
              </label>
              <input
                className="h-form-control"
                type="text"
                placeholder={newMethod === "cbu" ? "0000000000000000000000" : "mi.alias"}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
            </div>
          )}

          <button
            className="h-btn-submit"
            style={{ 
              width: "auto", 
              padding: "9px 20px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: adding || (newMethod !== "efectivo" && !newValue.trim()) ? 0.5 : 1,
            }}
            onClick={() => void handleAdd()}
            disabled={adding || (newMethod !== "efectivo" && !newValue.trim())}
          >
            <Plus style={{ width: 16, height: 16 }} />
            {adding ? "Agregando..." : "Agregar"}
          </button>
        </div>

        {paymentMethods.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--htext3)", marginTop: 12, textAlign: "center" }}>
            No tenés métodos de pago configurados. Agregá uno para recibir reintegros.
          </p>
        )}
      </div>
    </div>
  );
}
