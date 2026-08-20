"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Clock, DollarSign, XCircle, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

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

interface CurrentUser {
  id: string;
}

interface Stats {
  totalRequested: number;
  totalPaid: number;
  totalPending: number;
  requestedByMe: number;
  paidByMe: number;
}

export function ReimbursementsList() {
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    void fetchData();
  }, []);

  async function fetchData() {
    try {
      const [reimbRes, userRes] = await Promise.all([
        fetch("/api/reimbursements"),
        fetch("/api/auth/me"),
      ]);

      if (reimbRes.ok) {
        const data: Reimbursement[] = await reimbRes.json();
        setReimbursements(data);
      }

      if (userRes.ok) {
        const user: CurrentUser = await userRes.json();
        setCurrentUser(user);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
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
        await fetchData();
      }
    } catch (error) {
      console.error("Error paying reimbursement:", error);
    } finally {
      setPaying(null);
    }
  }

  function getStatusBadge(status: Reimbursement["status"]) {
    const badgeStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 10px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: 500,
    };

    switch (status) {
      case "pending":
        return (
          <span style={{ ...badgeStyle, background: "var(--haccent2)", color: "var(--htext1)" }}>
            <Clock style={{ width: 12, height: 12 }} /> Pendiente
          </span>
        );
      case "paid":
        return (
          <span style={{ ...badgeStyle, background: "#22c55e", color: "white" }}>
            <CheckCircle style={{ width: 12, height: 12 }} /> Pagado
          </span>
        );
      case "cancelled":
        return (
          <span style={{ ...badgeStyle, background: "var(--hborder)", color: "var(--htext2)" }}>
            <XCircle style={{ width: 12, height: 12 }} /> Cancelado
          </span>
        );
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

  function calculateStats(): Stats {
    const userId = currentUser?.id;
    return {
      totalRequested: reimbursements
        .filter((r) => r.requesterId === userId)
        .reduce((sum, r) => sum + r.amount, 0),
      totalPaid: reimbursements
        .filter((r) => r.status === "paid" && r.payerId === userId)
        .reduce((sum, r) => sum + r.amount, 0),
      totalPending: reimbursements
        .filter((r) => r.status === "pending")
        .reduce((sum, r) => sum + r.amount, 0),
      requestedByMe: reimbursements
        .filter((r) => r.requesterId === userId && r.status === "paid")
        .reduce((sum, r) => sum + r.amount, 0),
      paidByMe: reimbursements
        .filter((r) => r.payerId === userId && r.status === "paid")
        .reduce((sum, r) => sum + r.amount, 0),
    };
  }

  if (loading) {
    return (
      <div style={{ color: "var(--htext2)", padding: "2rem", textAlign: "center" }}>
        Cargando reintegros...
      </div>
    );
  }

  const userId = currentUser?.id;
  const stats = calculateStats();

  // Reintegros que el usuario puede pagar:
  // - Assigned to this user (payerId === userId)
  // - Open (payerId === null) AND not requested by this user
  const canPay = (r: Reimbursement) => 
    r.status === "pending" && (
      r.payerId === userId || 
      (r.payerId === null && r.requesterId !== userId)
    );

  // Reintegros que el usuario solicitó (pendientes de recibir)
  const pendingToReceive = reimbursements.filter(
    (r) => r.status === "pending" && r.requesterId === userId
  );

  // Reintegros que el usuario puede pagar
  const pendingToPay = reimbursements.filter(canPay);

  const completed = reimbursements.filter((r) => r.status !== "pending");

  const cardTitleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--htext1)",
  };

  const cardDescStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    color: "var(--htext2)",
    marginTop: "4px",
  };

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid var(--hborder)",
    background: "var(--hbg2)",
    marginBottom: "0.75rem",
  };

  const amountStyle: React.CSSProperties = {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "var(--htext1)",
  };

  const dateStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    color: "var(--htext2)",
  };

  const statCardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "1rem",
    borderRadius: "8px",
    background: "var(--hbg2)",
    border: "1px solid var(--hborder)",
    flex: 1,
    minWidth: "120px",
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "var(--htext1)",
    marginTop: "0.5rem",
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--htext2)",
    textAlign: "center",
    marginTop: "0.25rem",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Stats Section */}
      <div className="h-card h-animate">
        <div className="h-card-header">
          <h2 style={cardTitleStyle}>
            <BarChart3 style={{ width: 20, height: 20 }} />
            Estadísticas
          </h2>
        </div>
        <div className="h-card-body" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={statCardStyle}>
            <TrendingUp style={{ width: 20, height: 20, color: "#22c55e" }} />
            <span style={statValueStyle}>
              ${stats.requestedByMe.toLocaleString("es-AR")}
            </span>
            <span style={statLabelStyle}>Recibido</span>
          </div>
          <div style={statCardStyle}>
            <TrendingDown style={{ width: 20, height: 20, color: "#f97316" }} />
            <span style={statValueStyle}>
              ${stats.paidByMe.toLocaleString("es-AR")}
            </span>
            <span style={statLabelStyle}>Pagado</span>
          </div>
          <div style={statCardStyle}>
            <Clock style={{ width: 20, height: 20, color: "var(--haccent)" }} />
            <span style={statValueStyle}>
              ${stats.totalPending.toLocaleString("es-AR")}
            </span>
            <span style={statLabelStyle}>Pendiente</span>
          </div>
        </div>
      </div>
      {pendingToPay.length > 0 && (
        <div className="h-card h-animate">
          <div className="h-card-header">
            <h2 style={cardTitleStyle}>
              <DollarSign style={{ width: 20, height: 20 }} />
              Reintegros por Pagar
            </h2>
            <p style={cardDescStyle}>
              Estos reintegros te fueron asignados para pagar
            </p>
          </div>
          <div className="h-card-body">
            {pendingToPay.map((reimbursement) => (
              <div key={reimbursement.id} style={itemStyle}>
                <div>
                  <p style={amountStyle}>
                    ${reimbursement.amount.toLocaleString("es-AR")}
                  </p>
                  <p style={dateStyle}>
                    {formatDate(reimbursement.createdAt)}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {getStatusBadge(reimbursement.status)}
                  <button
                    className="h-btn-submit"
                    onClick={() => void handlePay(reimbursement.id)}
                    disabled={paying === reimbursement.id}
                    style={{ padding: "8px 16px", fontSize: "14px" }}
                  >
                    {paying === reimbursement.id ? "Pagando..." : "Marcar Pagado"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingToReceive.length > 0 && (
        <div className="h-card h-animate">
          <div className="h-card-header">
            <h2 style={cardTitleStyle}>Reintegros Pendientes</h2>
            <p style={cardDescStyle}>
              Reintegros que solicitaste y están pendientes
            </p>
          </div>
          <div className="h-card-body">
            {pendingToReceive.map((reimbursement) => (
              <div key={reimbursement.id} style={itemStyle}>
                <div>
                  <p style={amountStyle}>
                    ${reimbursement.amount.toLocaleString("es-AR")}
                  </p>
                  <p style={dateStyle}>
                    {formatDate(reimbursement.createdAt)}
                  </p>
                </div>
                {getStatusBadge(reimbursement.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="h-card h-animate">
          <div className="h-card-header">
            <h2 style={cardTitleStyle}>Historial</h2>
          </div>
          <div className="h-card-body">
            {completed.map((reimbursement) => (
              <div key={reimbursement.id} style={{ ...itemStyle, opacity: 0.75 }}>
                <div>
                  <p style={{ ...amountStyle, fontSize: "1rem" }}>
                    ${reimbursement.amount.toLocaleString("es-AR")}
                  </p>
                  <p style={dateStyle}>
                    {formatDate(reimbursement.createdAt)}
                    {reimbursement.paidAt ? ` • Pagado ${formatDate(new Date(reimbursement.paidAt).getTime())}` : ""}
                  </p>
                </div>
                {getStatusBadge(reimbursement.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {reimbursements.length === 0 && (
        <div className="h-card h-animate">
          <div className="h-card-body" style={{ padding: "3rem", textAlign: "center", color: "var(--htext2)" }}>
            No hay reintegros registrados
          </div>
        </div>
      )}
    </div>
  );
}
