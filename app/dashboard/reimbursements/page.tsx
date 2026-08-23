import { ReimbursementsList } from "@/components/reimbursements/reimbursements-list";

export const dynamic = "force-dynamic";

export default function ReimbursementsPage() {
  return (
    <div className="container max-w-2xl py-8">
      <h1 className="mb-6 text-2xl font-bold">Reintegros</h1>
      <ReimbursementsList />
    </div>
  );
}
