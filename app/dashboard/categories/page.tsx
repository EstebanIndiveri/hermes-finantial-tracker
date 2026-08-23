import { Suspense } from "react";
import { CategoriesPageClient } from "./categories-client";
import CategoriesLoading from "./loading";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  return (
    <Suspense fallback={<CategoriesLoading />}>
      <CategoriesPageClient />
    </Suspense>
  );
}
