import { Suspense } from "react";
import { GroupSettingsPageClient } from "./settings-client";
import GroupSettingsLoading from "./loading";

export const dynamic = "force-dynamic";

export default function GroupSettingsPage() {
  return (
    <Suspense fallback={<GroupSettingsLoading />}>
      <GroupSettingsPageClient />
    </Suspense>
  );
}
