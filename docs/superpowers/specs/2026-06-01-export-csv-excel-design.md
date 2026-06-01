# Export CSV / Excel del Mes — Spec de diseño

**Fecha:** 2026-06-01  
**Estado:** Aprobado  
**Alcance:** Web dashboard únicamente (sin Telegram)

---

## Resumen

Permitir al usuario exportar la ficha mensual de Hermes Finance en formato CSV o Excel (.xlsx), eligiendo el mes desde un selector. El CSV entrega los movimientos en formato plano ideal para Google Sheets u otras apps. El Excel entrega un reporte completo con tres hojas.

---

## Comportamiento esperado

1. El usuario abre el Dashboard.
2. Ve un panel "Exportar" cerca de la sección de movimientos.
3. Elige el mes desde un selector (default: mes en curso).
4. Hace clic en "⬇ CSV" o "⬇ Excel".
5. El browser descarga el archivo con nombre `hermes-YYYY-MM.csv` o `hermes-YYYY-MM.xlsx`.

---

## Arquitectura

### Endpoint

`GET /api/export?month=YYYY-MM&format=csv|xlsx`

- Autenticado (misma sesión de Next.js que el dashboard).
- Genera el archivo en memoria y lo devuelve con headers correctos:
  - CSV: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="hermes-2026-05.csv"`
  - XLSX: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- No escribe archivos a disco — todo en buffer.
- Si el mes no tiene datos, devuelve archivo vacío (con headers de columna).

### UI Component

`components/dashboard/ExportPanel.tsx`

- Client component.
- Estado local: mes seleccionado (string `YYYY-MM`), formato.
- Los botones CSV y Excel hacen `window.location.href` al endpoint con los params correspondientes.
- Muestra estado de carga (disabled + spinner) mientras descarga.

---

## Contenido de los archivos

### CSV — hoja única: Movimientos

| Columna | Fuente |
|---------|--------|
| Fecha | `transaction.date` (formato DD/MM/YYYY) |
| Comercio | `transaction.merchant` |
| Categoría | `category.name` |
| Monto (ARS) | `transaction.amount_ars` |
| Tipo | `transaction.type` (gasto / ingreso) |
| Notas | `transaction.notes` |

### Excel .xlsx — 3 hojas

**Hoja 1: Movimientos** — mismas columnas que el CSV.

**Hoja 2: Resumen por Categoría**

| Columna | Descripción |
|---------|-------------|
| Categoría | Nombre + emoji |
| Presupuesto | Límite mensual configurado |
| Gastado | Suma de transacciones del mes |
| Saldo | Presupuesto − Gastado |
| % Usado | Gastado / Presupuesto × 100 |

**Hoja 3: Presupuestos**

| Columna | Descripción |
|---------|-------------|
| Categoría | Nombre + emoji |
| Límite mensual | Monto configurado |
| Estado | activo / cerrado |

---

## Dependencias

| Paquete | Uso | Tamaño |
|---------|-----|--------|
| `xlsx` | Generación de archivos `.xlsx` | ~400KB |
| — | CSV generado con strings nativos, sin librería | — |

---

## Archivos a crear / modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `app/api/export/route.ts` | Crear | Endpoint GET con lógica de generación CSV y XLSX |
| `components/dashboard/ExportPanel.tsx` | Crear | UI: selector de mes + botones de descarga |
| `app/dashboard/page.tsx` | Modificar | Importar y renderizar `<ExportPanel />` |
| `app/hermes.css` | Modificar | Estilos del panel de exportación |
| `package.json` | Modificar | Agregar dependencia `xlsx` |

---

## Casos de borde

| Caso | Comportamiento |
|------|---------------|
| Mes sin movimientos | Devuelve archivo con headers pero sin filas de datos |
| Categoría sin presupuesto | En la hoja Resumen, Presupuesto = "Sin límite", % Usado = "—" |
| Monto null | Se exporta como 0 |
| Usuario no autenticado | 401, no genera archivo |
| `month` param inválido | 400 Bad Request |

---

## Fuera de alcance (MVP)

- Export desde Telegram bot
- Rango de fechas libre (solo por mes)
- Export en PDF
- Export de múltiples meses a la vez
- Envío por email
