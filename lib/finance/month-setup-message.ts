/** Guidance only: a missing month never copies prior settings or writes data. */
export function missingMonthSettingsMessage(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00.000Z`));
  const monthName = label.charAt(0).toUpperCase() + label.slice(1);
  const shortMonth = label.split(" ")[0];
  return `${monthName} todavía no está configurado en este grupo. Abrí Dashboard → Ajustes del mes y configurá ${shortMonth} para ver el resumen. Hermes no copia automáticamente presupuestos ni metas del mes anterior.`;
}
