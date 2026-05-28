import { formatTransactionConfirm, formatResumen, formatDisponible } from "../formatters";

const nbsp = "\u00A0"; // non-breaking space used by Intl.NumberFormat

describe("formatTransactionConfirm", () => {
  it("should format transaction with normal values and OK status", () => {
    const result = formatTransactionConfirm({
      amount_ars: 47000,
      category: "Supermercado",
      emoji: "🛒",
      gastado_ars: 150000,
      budget_ars: 200000,
      disponible_ars: 50000,
      status: "OK",
      ahorro_proyectado_usd: 500,
    });

    expect(result).toContain(`✅ Registrado: $${nbsp}47.000 en 🛒 Supermercado.`);
    expect(result).toContain("🛒 Supermercado — este mes:");
    expect(result).toContain(`Presupuesto: $${nbsp}200.000`);
    expect(result).toContain(`Gastado: $${nbsp}150.000`);
    expect(result).toContain(`Disponible: $${nbsp}50.000`);
    expect(result).toContain("Estado: 🟢 OK");
    expect(result).toContain("💰 Ahorro proyectado: $500.00");
  });

  it("should format transaction with WARNING status", () => {
    const result = formatTransactionConfirm({
      amount_ars: 10000,
      category: "Salidas Pareja",
      emoji: "💑",
      gastado_ars: 90000,
      budget_ars: 100000,
      disponible_ars: 10000,
      status: "WARNING",
      ahorro_proyectado_usd: 300,
    });

    expect(result).toContain("Estado: 🟡 WARNING");
  });

  it("should format transaction with CLOSED status", () => {
    const result = formatTransactionConfirm({
      amount_ars: 5000,
      category: "Viaje",
      emoji: "✈️",
      gastado_ars: 150000,
      budget_ars: 150000,
      disponible_ars: 0,
      status: "CLOSED",
      ahorro_proyectado_usd: 100,
    });

    expect(result).toContain("Estado: 🔴 CLOSED");
    expect(result).toContain(`Disponible: $${nbsp}0`);
  });

  it("should format transaction with budget_ars = 0 (unlimited)", () => {
    const result = formatTransactionConfirm({
      amount_ars: 30000,
      category: "Imprevistos",
      emoji: "⚠️",
      gastado_ars: 50000,
      budget_ars: 0,
      disponible_ars: null,
      status: "OK",
      ahorro_proyectado_usd: 450,
    });

    expect(result).toContain("Presupuesto: Sin límite");
    expect(result).not.toContain("Disponible:");
  });

  it("should format transaction with disponible_ars = null", () => {
    const result = formatTransactionConfirm({
      amount_ars: 20000,
      category: "Servicios",
      emoji: "📱",
      gastado_ars: 100000,
      budget_ars: 0,
      disponible_ars: null,
      status: "OK",
      ahorro_proyectado_usd: 600,
    });

    expect(result).not.toContain("Disponible:");
  });
});

describe("formatResumen", () => {
  it("should format summary with GREEN status", () => {
    const result = formatResumen({
      month: "2025-05",
      income_usd: 2000,
      total_spent_usd: 1200,
      ahorro_proyectado_usd: 800,
      status: "GREEN",
      exchange_rate: 1050,
    });

    expect(result).toContain("📊 Resumen 2025-05");
    expect(result).toContain("Ingreso: $2,000.00");
    expect(result).toContain("Gastado: $1,200.00");
    expect(result).toContain("Ahorro proyectado: $800.00");
    expect(result).toContain("Tipo de cambio: $1.050");
    expect(result).toContain("Estado: 🟢 GREEN");
  });

  it("should format summary with YELLOW status", () => {
    const result = formatResumen({
      month: "2025-06",
      income_usd: 2000,
      total_spent_usd: 1700,
      ahorro_proyectado_usd: 300,
      status: "YELLOW",
      exchange_rate: 1100,
    });

    expect(result).toContain("Estado: 🟡 YELLOW");
  });

  it("should format summary with RED status", () => {
    const result = formatResumen({
      month: "2025-07",
      income_usd: 2000,
      total_spent_usd: 2100,
      ahorro_proyectado_usd: -100,
      status: "RED",
      exchange_rate: 1150,
    });

    expect(result).toContain("Estado: 🔴 RED");
  });
});

describe("formatDisponible", () => {
  it("should format category with normal budget and OK status", () => {
    const result = formatDisponible({
      category: "Supermercado",
      emoji: "🛒",
      budget_ars: 200000,
      gastado_ars: 100000,
      disponible_ars: 100000,
      status: "OK",
    });

    expect(result).toContain("<b>🛒 Supermercado</b>");
    expect(result).toContain(`Presupuesto: $${nbsp}200.000`);
    expect(result).toContain(`Gastado: $${nbsp}100.000`);
    expect(result).toContain(`Disponible: $${nbsp}100.000`);
    expect(result).toContain("Estado: 🟢 OK");
  });

  it("should format category with WARNING status", () => {
    const result = formatDisponible({
      category: "Verdulería",
      emoji: "🥬",
      budget_ars: 50000,
      gastado_ars: 45000,
      disponible_ars: 5000,
      status: "WARNING",
    });

    expect(result).toContain("Estado: 🟡 WARNING");
  });

  it("should format category with CLOSED status", () => {
    const result = formatDisponible({
      category: "Restaurante",
      emoji: "🍽️",
      budget_ars: 80000,
      gastado_ars: 80000,
      disponible_ars: 0,
      status: "CLOSED",
    });

    expect(result).toContain("Estado: 🔴 CLOSED");
  });

  it("should format category with budget_ars = 0 (unlimited)", () => {
    const result = formatDisponible({
      category: "Imprevistos",
      emoji: "⚠️",
      budget_ars: 0,
      gastado_ars: 30000,
      disponible_ars: null,
      status: "OK",
    });

    expect(result).toContain("Presupuesto: Sin límite");
    expect(result).toContain("Sin límite definido");
    expect(result).not.toContain("Disponible: $");
  });

  it("should format category with disponible_ars = null", () => {
    const result = formatDisponible({
      category: "Compras Personales",
      emoji: "🛍️",
      budget_ars: 0,
      gastado_ars: 15000,
      disponible_ars: null,
      status: "OK",
    });

    expect(result).toContain("Sin límite definido");
  });
});
