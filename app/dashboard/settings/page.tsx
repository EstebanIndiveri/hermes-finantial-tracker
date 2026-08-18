import { PaymentInfoForm } from "@/components/settings/payment-info-form";

export default function SettingsPage() {
  return (
    <div className="container max-w-2xl space-y-8 py-8">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <PaymentInfoForm />
    </div>
  );
}
