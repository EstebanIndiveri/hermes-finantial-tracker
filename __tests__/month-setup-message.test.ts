import { missingMonthSettingsMessage } from "@/lib/finance/month-setup-message";

describe("missing monthly configuration guidance", () => {
  it("names the active month and group, without implying automatic rollover", () => {
    expect(missingMonthSettingsMessage("2026-10")).toBe(
      "Octubre de 2026 todavía no está configurado en este grupo. Abrí Dashboard → Ajustes del mes y configurá octubre para ver el resumen. Hermes no copia automáticamente presupuestos ni metas del mes anterior.",
    );
  });

  it("handles year rollover and rejects an invalid month", () => {
    expect(missingMonthSettingsMessage("2027-01")).toContain("Enero de 2027");
    expect(() => missingMonthSettingsMessage("2026-13")).toThrow("Invalid month");
  });
});
