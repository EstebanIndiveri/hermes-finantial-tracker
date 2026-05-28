import { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-background z-10">
        <span className="font-bold text-lg">💰 Hermes</span>
        <nav className="flex gap-2">
          <Link href="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          <Link href="/dashboard/settings"><Button variant="ghost" size="sm">Ajustes</Button></Link>
          <form action="/api/auth/logout" method="POST">
            <Button variant="ghost" size="sm" type="submit">Salir</Button>
          </form>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
