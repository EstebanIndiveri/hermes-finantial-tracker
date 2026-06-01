# Export CSV / Excel del Mes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un panel en el Dashboard que permita al usuario descargar los movimientos del mes en formato CSV o Excel (.xlsx), eligiendo el mes desde un selector.

**Architecture:** Una API Route en `/api/export` genera el archivo en memoria y lo devuelve con `Content-Disposition: attachment`. El componente `ExportPanel` en el dashboard hace `window.location.href` al endpoint. La lógica de generación queda en funciones puras en `lib/export/generate.ts` (testeable de forma aislada).

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, `xlsx` (nueva dependencia), TypeScript.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|----------------|
| `lib/export/generate.ts` | Crear | Funciones puras: `generateCSV` y `generateXLSX` |
| `app/api/export/route.ts` | Crear | Endpoint GET: autentica, consulta DB, llama generate, devuelve archivo |
| `components/dashboard/ExportPanel.tsx` | Crear | UI: selector de mes + botones CSV/XLSX |
| `app/dashboard/page.tsx` | Modificar | Importar y renderizar `<ExportPanel month={month} />` |
| `app/hermes.css` | Modificar | Estilos del panel de exportación |
| `__tests__/export.test.ts` | Crear | Tests para funciones de generación |
| `package.json` | Modificar | Agregar `xlsx` |

---

## Task 1: Instalar dependencia `xlsx`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar el paquete**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npm install xlsx
```

Expected output: `added 1 package` (o similar), sin errores.

- [ ] **Step 2: Verificar que quedó en dependencies**

```bash
cat package.json | grep xlsx
```

Expected: `"xlsx": "^0.18.x"` (o la versión instalada).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xlsx dependency for export feature"
```

---

## Task 2: Funciones puras de generación — TDD

**Files:**
- Create: `lib/export/generate.ts`
- Create: `__tests__/export.test.ts`

### Tipos compartidos

Las funciones reciben estos tipos:

```typescript
// En lib/export/generate.ts (escribir al principio del archivo)

export interface ExportTransaction {
  date: string;           // "2026-05-15"
  merchant: string | null;
  categoryName: string;
  categoryEmoji: string;
  amount_ars: number;
  description: string | null;
}

export interface ExportCategory {
  name: string;
  emoji: string;
  budget_ars: number;     // 0 = sin límite
  gastado_ars: number;
  hard_limit: number;     // 1 = activo, 0 = cerrado
}
```

- [ ] **Step 1: Escribir los tests que van a fallar**

Crear `__tests__/export.test.ts`:

```typescript
import { generateCSV, generateXLSX } from "@/lib/export/generate";
import type { ExportTransaction, ExportCategory } from "@/lib/export/generate";

const sampleTxs: ExportTransaction[] = [
  {
    date: "2026-05-10",
    merchant: "Disco",
    categoryName: "Supermercado",
    categoryEmoji: "🛒",
    amount_ars: 15000,
    description: "compras semana",
  },
  {
    date: "2026-05-15",
    merchant: null,
    categoryName: "Salidas",
    categoryEmoji: "🍽️",
    amount_ars: 8500,
    description: null,
  },
];

const sampleCats: ExportCategory[] = [
  { name: "Supermercado", emoji: "🛒", budget_ars: 50000, gastado_ars: 15000, hard_limit: 1 },
  { name: "Salidas", emoji: "🍽️", budget_ars: 0, gastado_ars: 8500, hard_limit: 1 },
];

describe("generateCSV", () => {
  it("includes the correct header row", () => {
    const csv = generateCSV(sampleTxs);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("Fecha,Comercio,Categoría,Monto (ARS),Descripción");
  });

  it("generates one data row per transaction", () => {
    const csv = generateCSV(sampleTxs);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("formats date as DD/MM/YYYY", () => {
    const csv = generateCSV(sampleTxs);
    expect(csv).toContain("10/05/2026");
  });

  it("formats amount with dot as decimal separator", () => {
    const csv = generateCSV(sampleTxs);
    expect(csv).toContain("15000");
  });

  it("uses empty string for null merchant", () => {
    const csv = generateCSV(sampleTxs);
    const secondRow = csv.split("\n")[2];
    expect(secondRow).toContain(",,"); // merchant vacío produce doble coma
  });

  it("returns empty CSV with only header when no transactions", () => {
    const csv = generateCSV([]);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});

describe("generateXLSX", () => {
  it("returns a Buffer", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it("starts with xlsx magic bytes (PK zip header)", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    // xlsx files are ZIP archives — start with PK (0x50, 0x4B)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("returns a non-empty buffer", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx jest __tests__/export.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '@/lib/export/generate'"

- [ ] **Step 3: Crear `lib/export/generate.ts` con la implementación mínima**

```typescript
import * as XLSX from "xlsx";

export interface ExportTransaction {
  date: string;
  merchant: string | null;
  categoryName: string;
  categoryEmoji: string;
  amount_ars: number;
  description: string | null;
}

export interface ExportCategory {
  name: string;
  emoji: string;
  budget_ars: number;
  gastado_ars: number;
  hard_limit: number;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function generateCSV(txs: ExportTransaction[]): string {
  const header = "Fecha,Comercio,Categoría,Monto (ARS),Descripción";
  const rows = txs.map(tx => {
    const date = formatDate(tx.date);
    const merchant = tx.merchant ?? "";
    const category = `${tx.categoryEmoji} ${tx.categoryName}`;
    const amount = tx.amount_ars.toString();
    const description = tx.description ?? "";
    // Escape values that contain commas
    const escape = (v: string) => v.includes(",") ? `"${v}"` : v;
    return [date, escape(merchant), escape(category), amount, escape(description)].join(",");
  });
  return [header, ...rows].join("\n");
}

export function generateXLSX(
  txs: ExportTransaction[],
  cats: ExportCategory[],
): Buffer {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Movimientos
  const txRows = [
    ["Fecha", "Comercio", "Categoría", "Monto (ARS)", "Descripción"],
    ...txs.map(tx => [
      formatDate(tx.date),
      tx.merchant ?? "",
      `${tx.categoryEmoji} ${tx.categoryName}`,
      tx.amount_ars,
      tx.description ?? "",
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(txRows);
  XLSX.utils.book_append_sheet(wb, ws1, "Movimientos");

  // Sheet 2: Resumen por categoría
  const summaryRows = [
    ["Categoría", "Presupuesto (ARS)", "Gastado (ARS)", "Saldo (ARS)", "% Usado"],
    ...cats.map(cat => {
      const saldo = cat.budget_ars > 0 ? cat.budget_ars - cat.gastado_ars : null;
      const pct = cat.budget_ars > 0 ? Math.round((cat.gastado_ars / cat.budget_ars) * 100) : null;
      return [
        `${cat.emoji} ${cat.name}`,
        cat.budget_ars > 0 ? cat.budget_ars : "Sin límite",
        cat.gastado_ars,
        saldo !== null ? saldo : "—",
        pct !== null ? `${pct}%` : "—",
      ];
    }),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws2, "Resumen por categoría");

  // Sheet 3: Presupuestos
  const budgetRows = [
    ["Categoría", "Límite mensual (ARS)", "Estado"],
    ...cats.map(cat => [
      `${cat.emoji} ${cat.name}`,
      cat.budget_ars > 0 ? cat.budget_ars : "Sin límite",
      cat.hard_limit === 1 ? "activo" : "cerrado",
    ]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(budgetRows);
  XLSX.utils.book_append_sheet(wb, ws3, "Presupuestos");

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
npx jest __tests__/export.test.ts --no-coverage
```

Expected: PASS — todos los tests en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/export/generate.ts __tests__/export.test.ts
git commit -m "feat: add CSV and XLSX generation functions with tests"
```

---

## Task 3: API Route `/api/export`

**Files:**
- Create: `app/api/export/route.ts`

- [ ] **Step 1: Crear el endpoint**

```typescript
// app/api/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { transactions, budgets, categories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateCSV, generateXLSX } from "@/lib/export/generate";
import type { ExportTransaction, ExportCategory } from "@/lib/export/generate";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month") ?? "";
  const format = searchParams.get("format") ?? "";

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: "Parámetro month inválido. Usar formato YYYY-MM." }, { status: 400 });
  }
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "Parámetro format inválido. Usar csv o xlsx." }, { status: 400 });
  }

  // Fetch transactions with their category
  const txRows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.user_id, userId),
      eq(transactions.month, month),
      eq(transactions.status, "active"),
    ),
    orderBy: (t, { asc }) => asc(t.date),
    with: { category: true },
  });

  const exportTxs: ExportTransaction[] = txRows.map(tx => ({
    date: tx.date,
    merchant: tx.merchant,
    categoryName: tx.category.name,
    categoryEmoji: tx.category.emoji,
    amount_ars: tx.amount_ars,
    description: tx.description,
  }));

  // Fetch all active categories + their budgets for the month
  const allCats = await db.query.categories.findMany({
    where: eq(categories.is_active, 1),
    orderBy: (c, { asc }) => asc(c.sort_order),
  });

  const budgetRows = await db.query.budgets.findMany({
    where: and(eq(budgets.user_id, userId), eq(budgets.month, month)),
  });
  const budgetMap = Object.fromEntries(budgetRows.map(b => [b.category_id, b]));

  // Sum spending per category
  const spentMap: Record<string, number> = {};
  for (const tx of txRows) {
    spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + tx.amount_ars;
  }

  const exportCats: ExportCategory[] = allCats.map(cat => ({
    name: cat.name,
    emoji: cat.emoji,
    budget_ars: budgetMap[cat.id]?.budget_ars ?? 0,
    gastado_ars: spentMap[cat.id] ?? 0,
    hard_limit: budgetMap[cat.id]?.hard_limit ?? 1,
  }));

  const filename = `hermes-${month}`;

  if (format === "csv") {
    const csv = generateCSV(exportTxs);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // format === "xlsx"
  const buffer = generateXLSX(exportTxs, exportCats);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
```

- [ ] **Step 2: Verificar que el archivo tiene la estructura correcta (TypeScript)**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores de TypeScript relacionados con el archivo nuevo.

- [ ] **Step 3: Commit**

```bash
git add app/api/export/route.ts
git commit -m "feat: add GET /api/export endpoint for CSV and XLSX download"
```

---

## Task 4: Componente `ExportPanel`

**Files:**
- Create: `components/dashboard/ExportPanel.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// components/dashboard/ExportPanel.tsx
"use client";

import { useState } from "react";

interface ExportPanelProps {
  month: string; // "YYYY-MM"
}

export function ExportPanel({ month }: ExportPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | null>(null);

  function handleDownload(format: "csv" | "xlsx") {
    setDownloading(format);
    const url = `/api/export?month=${selectedMonth}&format=${format}`;
    // Trigger browser download
    const a = document.createElement("a");
    a.href = url;
    a.download = `hermes-${selectedMonth}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Reset after a short delay (browser handles the download)
    setTimeout(() => setDownloading(null), 1500);
  }

  return (
    <div className="h-export-panel">
      <div className="h-export-row">
        <label className="h-export-label" htmlFor="export-month">
          Exportar mes
        </label>
        <input
          id="export-month"
          type="month"
          className="h-export-month-input"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          max={month}
        />
      </div>
      <div className="h-export-btns">
        <button
          className="h-export-btn"
          onClick={() => handleDownload("csv")}
          disabled={downloading !== null}
          aria-label="Descargar CSV"
        >
          {downloading === "csv" ? (
            <span className="h-export-spinner" aria-hidden="true" />
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
          CSV
        </button>
        <button
          className="h-export-btn h-export-btn-xl"
          onClick={() => handleDownload("xlsx")}
          disabled={downloading !== null}
          aria-label="Descargar Excel"
        >
          {downloading === "xlsx" ? (
            <span className="h-export-spinner" aria-hidden="true" />
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
          Excel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/ExportPanel.tsx
git commit -m "feat: add ExportPanel component with month selector and download buttons"
```

---

## Task 5: CSS para el panel de exportación

**Files:**
- Modify: `app/hermes.css` (agregar al final del archivo)

- [ ] **Step 1: Agregar estilos al final de `app/hermes.css`**

```css
/* ── Export Panel ──────────────────────────────────────────── */
.h-export-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.h-export-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.h-export-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--htext2);
  white-space: nowrap;
}

.h-export-month-input {
  padding: 6px 10px;
  border: 1px solid var(--hborder);
  border-radius: var(--hradius-sm);
  background: var(--hsurface);
  color: var(--htext1);
  font-size: 13px;
  font-family: inherit;
  transition: var(--htransition);
  cursor: pointer;
}

.h-export-month-input:focus {
  outline: none;
  border-color: var(--haccent);
  box-shadow: 0 0 0 3px var(--haccent-soft);
}

.h-export-btns {
  display: flex;
  gap: 8px;
}

.h-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--hborder);
  border-radius: var(--hradius-sm);
  background: var(--hsurface);
  color: var(--htext1);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: var(--htransition);
}

.h-export-btn:hover:not(:disabled) {
  border-color: var(--haccent);
  color: var(--haccent);
  background: var(--haccent-soft);
}

.h-export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.h-export-btn-xl {
  border-color: var(--hgreen);
  color: var(--hgreen);
}

.h-export-btn-xl:hover:not(:disabled) {
  background: var(--hgreen-soft);
  border-color: var(--hgreen);
  color: var(--hgreen);
}

.h-export-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: h-spin 0.6s linear infinite;
}

@keyframes h-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .h-export-panel {
    flex-direction: column;
    align-items: flex-start;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/hermes.css
git commit -m "style: add export panel CSS"
```

---

## Task 6: Integrar ExportPanel en el Dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Agregar el import al principio del archivo**

En `app/dashboard/page.tsx`, agregar al bloque de imports existente:

```typescript
import { ExportPanel } from "@/components/dashboard/ExportPanel";
```

- [ ] **Step 2: Agregar el panel justo después del bloque de Transactions**

Localizar el bloque `{/* ── Transactions ── */}` al final del return y agregar `ExportPanel` debajo, dentro del mismo wrapper de card:

```tsx
      {/* ── Export ── */}
      <div className="h-card h-animate" style={{ animationDelay: "0.3s" }}>
        <div className="h-card-header">
          <h2 className="h-card-title">Exportar movimientos</h2>
        </div>
        <div className="h-card-body">
          <ExportPanel month={month} />
        </div>
      </div>
```

Agregar este bloque justo **antes** del `</>` de cierre del return, después del bloque Transactions.

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: integrate ExportPanel in dashboard"
```

---

## Task 7: Build y deploy

- [ ] **Step 1: Correr suite completa de tests**

```bash
cd /Users/estebanindiveri/Downloads/hermes-finantial-tracker
npx jest --no-coverage 2>&1 | tail -20
```

Expected: todos los tests pasan.

- [ ] **Step 2: Build de producción**

```bash
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` sin errores.

- [ ] **Step 3: Push a main**

```bash
git push origin main
```

Expected: push sin conflictos. Vercel desplegará automáticamente.

- [ ] **Step 4: Verificar en producción**

Abrir la app en producción, ir al Dashboard, verificar que aparece la sección "Exportar movimientos" con el selector de mes y los botones CSV y Excel. Probar la descarga de ambos formatos.

---

## Checklist pre-PR / pre-merge

- [ ] `npx jest --no-coverage` — todos en verde
- [ ] `npm run build` — sin errores
- [ ] Tests cubren CSV (headers, rows, fechas, nulls) y XLSX (Buffer, magic bytes)
- [ ] ExportPanel responde bien en mobile (layout vertical)
- [ ] Descarga de CSV funciona en producción
- [ ] Descarga de XLSX funciona en producción y abre en Excel/Google Sheets
