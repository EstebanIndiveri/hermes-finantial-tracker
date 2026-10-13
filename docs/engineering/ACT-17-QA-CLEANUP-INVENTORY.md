# ACT-17 — inventario previo a limpieza QA beta

## Alcance y precondiciones

Consulta de solo lectura realizada el 13/10/2026 con la CLI Turso aislada.
Se confirmó `auth whoami = esteban-indiveri` y `db show beta-hermes` con ID
`01a0c0bd-0601-7f27-b147-915d105b19f2`. No se consultaron secretos,
endpoints, texto de bot, importes, IDs de filas ni contenido de tickets.
No hubo escrituras, purgas, cambios de suscripción ni envíos.

Las etiquetas de grupo por sí solas no identifican un recurso: hay dos
«Mi espacio» de distintos propietarios. Cualquier futuro plan de borrado
debe usar IDs exactos obtenidos en una sesión restringida, nunca nombre,
`LIKE` ni una suposición sobre el owner.

| Owner beta | Grupo | Miembros | Categorías | Presupuestos | Movimientos | Reintegros ligados | Recurrentes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `esteban_beta_qa` | Mi espacio | 3 | 2 | 1 | 20 | 8 | 0 |
| `esteban_beta_qa` | test | 2 | 2 | 1 | 4 | 1 | 0 |
| `esteban_beta_qa2` | Mi espacio | 1 | 1 | 0 | 0 | 0 | 0 |

La cuenta `esteban_beta_qa2` tiene tres membresías: miembro de los dos
grupos de QA1 y owner de su espacio. Tiene una suscripción Push, una entrega
Push persistida y participa en un reintegro; su espacio propio vacío de
movimientos **no** implica que la cuenta sea prescindible. QA1 conserva una
suscripción Push, nueve roles en reintegros, 47 mensajes de bot y 11
importaciones de recibos. El outbox beta agregadamente tiene 1 Push y 25
Telegram `sent`, sin filas vencidas para purga en el corte previo.

## Puerta para una limpieza posterior

1. Separar retención operativa de notificaciones (Push terminal a 7 días,
   Telegram terminal a 30 días) de una eventual eliminación financiera QA.
2. Determinar con Esteban qué cuentas, grupos, movimientos y evidencias QA
   deben preservarse durante el piloto. No deducirlo de `test`, «Mi espacio»,
   montos pequeños o fecha de creación.
3. Inventariar IDs exactos y dependencias transitivas de la selección:
   movimientos → reintegros → outbox Push; categorías → presupuestos,
   movimientos y recurrentes; usuarios → grupos, membresías, suscripciones,
   chats, recibos, preferencias y propuestas/operaciones. Registrar también
   referencias a splits antes de cualquier borrado.
4. Solo después de aprobar un alcance exacto: diseñar dry-run allowlisted,
   respaldo/restauración probado, aserciones transaccionales y conciliación
   antes/después. Borrado masivo por nombre o cascada implícita no está
   autorizado por este inventario.

**Estado:** inventario agregado cerrado; limpieza abierta, owner Codex para
preparación técnica y Esteban para seleccionar el alcance cuando corresponda.
