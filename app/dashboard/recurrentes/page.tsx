import { RecurringList } from "@/components/recurring/recurring-list";

export default function RecurringPage() {
  return (
    <div className="container max-w-2xl py-8">
      <h1 className="mb-6 text-2xl font-bold">Gastos Recurrentes</h1>
      <RecurringList />
    </div>
  );
}
