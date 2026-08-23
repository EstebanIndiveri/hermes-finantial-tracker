import { Suspense } from "react";
import { SettingsPageClient } from "./settings-client";
import SettingsLoading from "./loading";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsPageClient />
    </Suspense>
  );
}
