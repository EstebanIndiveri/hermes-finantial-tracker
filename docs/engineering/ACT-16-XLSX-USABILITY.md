# ACT-16 — legibilidad y exploración del XLSX

Estado 02/10/2026: **implementación completa y desplegada solo en beta** desde
`e724b44`; aceptación visual del nuevo XLSX pendiente. 92/92 suites,
784/784 tests, typecheck, lint sin errores (68 warnings existentes) y build
pasaron con Node 22. La auditoría de dependencias de runtime reporta cero
hallazgos. Owner de implementación y pruebas: Codex. Owner de aceptación
visual: Esteban. No hubo cambio de datos.

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
- Añadir barras de datos en gasto y un gráfico nativo editable de barras
  agrupadas para presupuesto vs. gasto por categoría. El gráfico debe referir
  las celdas de esta misma hoja; una categoría sin límite queda sin barra de
  presupuesto, no se dibuja como presupuesto cero.
- Mantener textos de usuario como strings, incluso si empiezan por `=`; no
  crear fórmulas ejecutables con datos financieros o texto de Telegram.
- Probar exportación vacía, ingreso+gasto, filtros/anchos/congelación/barras,
  tipos y seguridad de texto. Suite completa y build antes de declarar cierre
  local. La aceptación visual exige descargar un nuevo XLSX **beta**, no
  reutilizar el archivo adjunto de octubre.

## Gráfico y aceptación pendiente

El exportador inserta un gráfico nativo editable mediante partes OOXML
conectadas a las celdas existentes de presupuesto y gasto de `Resumen por
categoría`. Como ExcelJS 4.4 no incluye una API tipada para charts, `fflate`
actualiza el paquete XLSX; no se reintroduce la dependencia `xlsx`. Una
categoría sin límite queda sin barra de presupuesto. Las pruebas revisan
relaciones, referencias y lectura del libro con ExcelJS. LibreOffice abrió y
renderizó la gráfica, que sobrevivió un guardado de ida y vuelta a XLSX.

La aceptación visual en Microsoft Excel de un nuevo XLSX beta sigue abierta
bajo Esteban.

Verificación local final: 92 suites/784 tests, typecheck, build, auditoría de
runtime (cero hallazgos) y lint sin errores. Una apertura independiente con
openpyxl reconoció un `BarChart`, las tres hojas, la regla de formato y las
cifras sintéticas de presupuesto/gasto; sus avisos sobre extensiones de
formato condicional no implicaron pérdida del gráfico en la carga. El método
ZIP recompone el archivo entero en memoria, igual que el writer actual:
Codex debe medir tamaño, memoria y latencia antes de habilitar exportaciones
de grupos con volumen muy superior al piloto. No hay cambio de esquema ni
escritura financiera.

La propuesta multimoneda es ACT-05/06, no parte de esta mejora visual. No se
alteran cotización, `amount_ars`, `amount_usd`, presupuestos ni esquema.
