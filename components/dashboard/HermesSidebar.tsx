"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GroupSwitcher } from "./GroupSwitcher";

export function HermesSidebar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month");
  const settingsHref = month
    ? { pathname: "/dashboard/settings", query: { month } }
    : "/dashboard/settings";

  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:9 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile menu button */}
      <button
        className="h-mobile-menu-btn"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          position:"fixed", top:14, left:16, zIndex:20,
          background:"var(--hsurface)", border:"1px solid var(--hborder)",
          borderRadius:8, padding:"6px 10px", cursor:"pointer",
          display:"none", alignItems:"center", gap:6,
          fontSize:13, color:"var(--htext1)"
        }}
        aria-label="Abrir menú"
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <aside className={`h-sidebar${mobileOpen ? " open" : ""}`} role="navigation">
        {/* Brand */}
        <div className="h-sidebar-brand">
          <div className="h-brand-logo">
            <div className="h-brand-icon">H</div>
            <div>
              <div className="h-brand-name">Hermes</div>
              <div className="h-brand-sub">Finance</div>
            </div>
          </div>
        </div>

        {/* Group Switcher */}
        <GroupSwitcher />

        {/* Nav */}
        <nav className="h-sidebar-nav">
          <div className="h-nav-label">Principal</div>
          <Link
            href="/dashboard"
            className={`h-nav-item${pathname === "/dashboard" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Dashboard
          </Link>
          <Link
            href="/dashboard/categories"
            className={`h-nav-item${pathname === "/dashboard/categories" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M7 7h.01M7 12h.01M7 17h.01M11 7h6M11 12h6M11 17h6"/>
            </svg>
            Categorías
          </Link>
          <Link
            href="/dashboard/compartidos"
            className={`h-nav-item${pathname.startsWith("/dashboard/compartidos") ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m9-4.13a4 4 0 11-8 0 4 4 0 018 0zM3 8a4 4 0 108 0A4 4 0 003 8z"/>
            </svg>
            Compartidos
          </Link>
          <Link
            href="/dashboard/balances"
            className={`h-nav-item${pathname.startsWith("/dashboard/balances") && !pathname.startsWith("/dashboard/balances/historial") ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M4 12h16" />
              <path d="M7 16l-3-4 3-4" />
              <path d="M17 8l3 4-3 4" />
            </svg>
            Balances
          </Link>
          <Link
            href="/dashboard/balances/historial"
            className={`h-nav-item${pathname.startsWith("/dashboard/balances/historial") ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M8 13l3-3 3 2 4-5" />
            </svg>
            Historial
          </Link>
          <Link
            href="/dashboard/reimbursements"
            className={`h-nav-item${pathname === "/dashboard/reimbursements" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7H14.5a3.5 3.5 0 010 7H6"/>
            </svg>
            Reintegros
          </Link>
          <Link
            href="/dashboard/recurrentes"
            className={`h-nav-item${pathname === "/dashboard/recurrentes" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h1m8-9v1m8 8h1M5.6 5.6l.7.7m12.1-.7l-.7.7M12 16a4 4 0 100-8 4 4 0 000 8z"/>
              <path d="M12 16v1m-4-4.5l-.5.5m9-.5l.5.5"/>
            </svg>
            Recurrentes
          </Link>

          <div className="h-nav-label" style={{ marginTop: 16 }}>Grupo</div>
          <Link
            href="/dashboard/group/settings"
            className={`h-nav-item${pathname === "/dashboard/group/settings" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            Miembros y permisos
          </Link>

          <div className="h-nav-label" style={{ marginTop: 16 }}>Configuración</div>
          <Link
            href={settingsHref}
            className={`h-nav-item${pathname === "/dashboard/settings" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Ajustes del mes
          </Link>

          <div className="h-nav-label" style={{ marginTop: 16 }}>Cuenta</div>
          <Link
            href="/dashboard/account"
            className={`h-nav-item${pathname === "/dashboard/account" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>
            </svg>
            Mi cuenta
          </Link>

          <form action="/api/auth/logout" method="POST" style={{ marginTop: 4 }}>
            <button type="submit" className="h-nav-item" style={{ width:"100%" }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
              Cerrar sesión
            </button>
          </form>
        </nav>

        {/* Theme toggle */}
        <div className="h-sidebar-footer">
          <button
            className="h-theme-toggle"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Cambiar modo claro/oscuro"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
            <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>
            <div className="h-toggle-track">
              <div className="h-toggle-thumb" />
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}
