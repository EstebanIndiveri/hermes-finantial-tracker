import { ReactNode } from "react";
import { HermesSidebar } from "@/components/dashboard/HermesSidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div data-hermes="">
      <HermesSidebar />
      <main className="h-main">
        <div className="h-content">
          {children}
        </div>
      </main>
    </div>
  );
}
