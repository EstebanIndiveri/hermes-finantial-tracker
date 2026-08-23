import { Suspense } from "react";
import NuevaSessionClient from "./nueva-client";

export const dynamic = "force-dynamic";

export default function NuevaSessionPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <NuevaSessionClient />
    </Suspense>
  );
}
