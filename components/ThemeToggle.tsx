"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-9 h-5" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Cambiar tema"
      className="relative inline-flex h-5 w-9 items-center rounded-full border border-border/60 bg-muted transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-primary shadow-sm transition-transform duration-200 ${
          isDark ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
      <span className="sr-only">{isDark ? "Modo claro" : "Modo oscuro"}</span>
    </button>
  );
}
