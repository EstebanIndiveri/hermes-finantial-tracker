import { formatTransactionConfirm, formatResumen, formatDisponible, formatPuedo } from "../formatters";

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

  it("should format projected savings in ARS for ARS_ARS mode without USD or FX", () => {
    const result = formatTransactionConfirm({
      currency_mode: "ARS_ARS",
      amount_ars: 12000,
      category: "Supermercado",
      emoji: "🛒",
      gastado_ars: 12000,
      budget_ars: 50000,
      disponible_ars: 38000,
      status: "OK",
      ahorro_proyectado_ars: 250000,
    });

    expect(result).toContain(`💰 Ahorro proyectado: $${nbsp}250.000`);
    expect(result).not.toContain("USD");
    expect(result).not.toContain("ARS/USD");
  });

  it("should omit projected savings when it is unavailable in USD_ARS mode", () => {
    const result = formatTransactionConfirm({
      amount_ars: 12000,
      category: "Supermercado",
      emoji: "🛒",
      gastado_ars: 12000,
      budget_ars: 50000,
      disponible_ars: 38000,
      status: "OK",
    });

    expect(result).not.toContain("Ahorro proyectado");
  });

  it("should omit projected savings when it is unavailable in ARS_ARS mode", () => {
    const result = formatTransactionConfirm({
      currency_mode: "ARS_ARS",
      amount_ars: 12000,
      category: "Supermercado",
      emoji: "🛒",
      gastado_ars: 12000,
      budget_ars: 50000,
      disponible_ars: 38000,
      status: "OK",
    });

    expect(result).not.toContain("Ahorro proyectado");
    expect(result).not.toContain("USD");
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
    expect(result).toContain("Ingreso: USD $2,000.00");
    expect(result).toContain("Gastado: USD $1,200.00");
    expect(result).toContain("Ahorro proyectado: USD $800.00");
    expect(result).toContain("Tipo de cambio: 1.050 ARS/USD");
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

  it("should format an ARS-only summary without USD or exchange-rate output", () => {
    const result = formatResumen({
      currency_mode: "ARS_ARS",
      month: "2026-10",
      income_ars: 1200000,
      total_spent_ars: 450000,
      ahorro_proyectado_ars: 750000,
      status: "GREEN",
    });

    expect(result).toContain(`Ingreso: ARS $${nbsp}1.200.000`);
    expect(result).toContain(`Gastado: ARS $${nbsp}450.000`);
    expect(result).toContain(`Ahorro proyectado: ARS $${nbsp}750.000`);
    expect(result).not.toContain("USD");
    expect(result).not.toContain("ARS/USD");
    expect(result).not.toContain("Tipo de cambio");
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

  it("should label ARS-only category amounts and preserve unlimited budgets", () => {
    const result = formatDisponible({
      currency_mode: "ARS_ARS",
      category: "Supermercado",
      emoji: "🛒",
      budget_ars: 0,
      gastado_ars: 15000,
      disponible_ars: null,
      status: "OK",
    });

    expect(result).toContain("Presupuesto: Sin límite");
    expect(result).toContain(`Gastado: ARS $${nbsp}15.000`);
    expect(result).toContain("Sin límite definido");
    expect(result).not.toContain("USD");
    expect(result).not.toContain("ARS/USD");
  });
});

describe("formatPuedo", () => {
  it("should format an ARS-only simulation in ARS including savings and goal", () => {
    const result = formatPuedo({
      currency_mode: "ARS_ARS",
      amount_ars: 10000,
      category: "Supermercado",
      emoji: "🛒",
      gastado_ars: 25000,
      budget_ars: 50000,
      newCategoryStatus: "OK",
      disponible_after: 15000,
      ahorro_ars_before: 250000,
      ahorro_ars_after: 240000,
      newMonthStatus: "GREEN",
      saving_goal_ars: 200000,
    });

    expect(result).toContain(`¿Podés gastar ARS $${nbsp}10.000`);
    expect(result).toContain(`Gastado: ARS $${nbsp}35.000 de ARS $${nbsp}50.000`);
    expect(result).toContain(`Disponible: ARS $${nbsp}15.000`);
    expect(result).toContain(`Antes: ARS $${nbsp}250.000 → Después: ARS $${nbsp}240.000`);
    expect(result).toContain(`Meta: ARS $${nbsp}200.000 (120% alcanzado)`);
    expect(result).not.toContain("USD");
    expect(result).not.toContain("ARS/USD");
  });

  it("should preserve USD_ARS simulation formatting", () => {
    const result = formatPuedo({
      amount_ars: 10000,
      category: "Supermercado",
      emoji: "🛒",
      gastado_ars: 25000,
      budget_ars: 50000,
      newCategoryStatus: "OK",
      disponible_after: 15000,
      ahorro_usd_before: 250,
      ahorro_usd_after: 240,
      newMonthStatus: "GREEN",
      saving_goal_usd: 200,
    });

    expect(result).toContain("Antes: $250.00 → Después: $240.00");
    expect(result).toContain("Meta: $200.00 (120% alcanzado)");
    expect(result).not.toContain("ARS $250.00");
  });
});
