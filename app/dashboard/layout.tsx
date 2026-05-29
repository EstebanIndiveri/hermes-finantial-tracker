import { ReactNode } from "react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-sm">
              💰
            </div>
            <span className="font-heading font-bold text-base tracking-tight">Hermes</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="/dashboard" className="px-3 py-1.5 rounded-md text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors">
              Dashboard
            </Link>
            <Link href="/dashboard/settings" className="px-3 py-1.5 rounded-md text-sm font-medium text-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors">
              Ajustes
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium text-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors">
                Salir
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
