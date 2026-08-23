import { RecurringList } from "@/components/recurring/recurring-list";
import { MonthSelectorGeneric } from "@/components/dashboard/MonthSelectorGeneric";

export const dynamic = "force-dynamic";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function RecurringPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const month =
    params.month && MONTH_REGEX.test(params.month) && params.month <= currentMonth
      ? params.month
      : currentMonth;

  const monthLabel = new Date(month + "-01").toLocaleDateString("es-AR", { 
    month: "long", 
    year: "numeric" 
  });
  const capitalizedLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gastos Recurrentes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ejecuciones de {capitalizedLabel}
          </p>
        </div>
        <MonthSelectorGeneric month={month} basePath="/dashboard/recurrentes" />
      </div>
      <RecurringList month={month} />
    </div>
  );
}
