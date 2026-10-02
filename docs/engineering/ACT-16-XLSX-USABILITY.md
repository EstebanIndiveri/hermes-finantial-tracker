# ACT-16 — legibilidad y exploración del XLSX

Estado 02/10/2026: **corte local completo** en `codex/act16-export-usability`,
sin despliegue ni cambio de datos. 92/92 suites, 783/783 tests, typecheck,
lint sin errores (68 warnings existentes) y build pasaron con Node 22. Owner
de implementación y pruebas: Codex. Owner de aceptación visual tras un
deployment beta futuro: Esteban. El gate de dependencias runtime descrito en
`IMPLEMENTATION-STATUS.md` debe resolverse antes de ese deployment.

## Hallazgo y evidencia

El XLSX beta `hermes-2026-10.xlsx` del 02/10 contiene un gasto ARS 10.000 y un
ingreso ARS 20.000 en `Movimientos`. Solo el gasto aparece en `Resumen por
categoría` y `Presupuestos`. Esto acepta la separación financiera de ACT-07.
Las tres hojas carecen de filtros, anchos explícitos, filas congeladas y
visualización; las celdas largas pueden cortarse. Son defectos de lectura,
no de conciliación. El archivo del usuario es evidencia, no se modifica.

## Contrato del corte

- Preservar tres hojas, nombres, orden, encabezados, filas, tipos numéricos y
  la semántica ingreso/gasto de ACT-07. No cambiar CSV ni rutas de exportación.
- Dar a cada hoja filtros en las columnas del rango poblado, encabezado fijo,
  anchos legibles, texto largo ajustable y formatos numéricos ARS claros.
- Añadir barras visuales nativas de Excel en el gasto por categoría cuando
  exista al menos una categoría; deben representar los números de la misma
  hoja, sin prometer un gráfico histórico o un límite que no esté configurado.
- Mantener textos de usuario como strings, incluso si empiezan por `=`; no
  crear fórmulas ejecutables con datos financieros o texto de Telegram.
- Probar exportación vacía, ingreso+gasto, filtros/anchos/congelación/barras,
  tipos y seguridad de texto. Suite completa y build antes de declarar cierre
  local. La aceptación visual exige descargar un nuevo XLSX **beta**, no
  reutilizar el archivo adjunto de octubre.

## Exclusiones y seguimiento

Las barras de datos no son un gráfico de tendencias ni un chart separado.
ExcelJS 4.4, el writer actual, no ofrece una API de charts en el contrato
tipado instalado. Una hoja con gráficos comparativos verdaderos requiere
evaluar un writer compatible, o una composición OOXML con pruebas de apertura
en Excel/LibreOffice. Owner: Codex, siguiente subcorte ACT-16-CHARTS tras
cerrar este corte y verificar que la solución no reintroduzca la dependencia
`xlsx` reemplazada por seguridad. No se añadirá una dependencia ni un gráfico
estático engañoso solo para completar la pantalla.

La propuesta multimoneda es ACT-05/06, no parte de esta mejora visual. No se
alteran cotización, `amount_ars`, `amount_usd`, presupuestos ni esquema.
