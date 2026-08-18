"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Clock, DollarSign, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Reimbursement {
  id: string;
  transactionId: string;
  requesterId: string;
  payerId: string | null;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  paidAt: string | null;
  createdAt: number;
}

export function ReimbursementsList() {
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    void fetchReimbursements();
  }, []);

  async function fetchReimbursements() {
    try {
      const res = await fetch("/api/reimbursements");
      if (!res.ok) {
        return;
      }

      const data: Reimbursement[] = await res.json();
      setReimbursements(data);
    } catch (error) {
      console.error("Error fetching reimbursements:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(id: string) {
    setPaying(id);
    try {
      const res = await fetch(`/api/reimbursements/${id}/pay`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchReimbursements();
      }
    } catch (error) {
      console.error("Error paying reimbursement:", error);
    } finally {
      setPaying(null);
    }
  }

  function getStatusBadge(status: Reimbursement["status"]) {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendiente</Badge>;
      case "paid":
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> Pagado</Badge>;
      case "cancelled":
        return <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" /> Cancelado</Badge>;
      default:
        return null;
    }
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (loading) {
    return <div className="text-muted-foreground">Cargando reintegros...</div>;
  }

  const pendingToPay = reimbursements.filter((reimbursement) => reimbursement.status === "pending" && reimbursement.payerId);
  const pendingToReceive = reimbursements.filter((reimbursement) => reimbursement.status === "pending" && !reimbursement.payerId);
  const completed = reimbursements.filter((reimbursement) => reimbursement.status !== "pending");

  return (
    <div className="space-y-6">
      {pendingToPay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Reintegros por Pagar
            </CardTitle>
            <CardDescription>
              Estos reintegros te fueron asignados para pagar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingToPay.map((reimbursement) => (
              <div
                key={reimbursement.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="text-lg font-semibold">
                    ${reimbursement.amount.toLocaleString("es-AR")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(reimbursement.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge(reimbursement.status)}
                  <Button
                    onClick={() => void handlePay(reimbursement.id)}
                    disabled={paying === reimbursement.id}
                  >
                    {paying === reimbursement.id ? "Pagando..." : "Marcar Pagado"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingToReceive.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reintegros Pendientes</CardTitle>
            <CardDescription>
              Reintegros que solicitaste y están pendientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingToReceive.map((reimbursement) => (
              <div
                key={reimbursement.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="text-lg font-semibold">
                    ${reimbursement.amount.toLocaleString("es-AR")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(reimbursement.createdAt)}
                  </p>
                </div>
                {getStatusBadge(reimbursement.status)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {completed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {completed.map((reimbursement) => (
              <div
                key={reimbursement.id}
                className="flex items-center justify-between rounded-lg border p-4 opacity-75"
              >
                <div>
                  <p className="font-semibold">
                    ${reimbursement.amount.toLocaleString("es-AR")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(reimbursement.createdAt)}
                    {reimbursement.paidAt ? ` • Pagado ${formatDate(new Date(reimbursement.paidAt).getTime())}` : ""}
                  </p>
                </div>
                {getStatusBadge(reimbursement.status)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {reimbursements.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay reintegros registrados
          </CardContent>
        </Card>
      )}
    </div>
  );
}
