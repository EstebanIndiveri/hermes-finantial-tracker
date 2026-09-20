# Contrato de trabajo — PR-09/H04d.1 aislamiento efectivo de runtime

Fecha: 20/09/2026.

## Punto de partida y alcance

- Base: `dbf0f83122ccca79303b6650b2c5c2bba8e786ae` (H04d).
- Rama/worktree: `codex/h04d-staging-rehearsal` en
  `/private/tmp/hermes-h04d-staging-rehearsal`.
- Clasificacion: refactor compatible y salvaguardas de staging.
- Produccion legacy conserva el comportamiento actual cuando las nuevas variables
  no existen. No se cambian DB, migraciones, webhook, ramas remotas ni despliegues.

## Resultado esperado

1. `AI_MODE=stub` impide llamadas a Groq de texto y voz y devuelve una salida
   degradada explicita que los consumidores actuales puedan manejar sin escribir.
2. `OCR_MODE=stub` impide llamadas a OCR.Space y entrega un resultado no fiable,
   sin inventar texto ni monto.
3. `NOTIFICATIONS_ENABLED=false` evita envios proactivos de Telegram y push desde
   crons/servicios de notificacion; no desactiva respuestas solicitadas por un
   usuario en un webhook autorizado.
4. `SESSION_COOKIE_NAME` centraliza el nombre de la cookie de sesion. Si falta se
   conserva `hermes_session`; staging puede usar un nombre distinto.
5. Valores presentes pero desconocidos fallan cerrados antes de contactar un
   proveedor o aceptar una sesion bajo una configuracion ambigua.

## Matriz de configuracion

| Variable | Legacy compatible (ausente/default) | Beta aislada | Efecto ante valor presente desconocido |
| --- | --- | --- | --- |
| `AI_MODE` | `live` | `stub` | No se contacta Groq. |
| `OCR_MODE` | `live` | `stub` | No se contacta OCR.Space. |
| `NOTIFICATIONS_ENABLED` | `true` | `false` | No se entrega una notificacion proactiva; las respuestas directas de un webhook autorizado siguen siendo posibles. |
| `SESSION_COOKIE_NAME` | `hermes_session` | `hermes_beta_session` | La sesion no se acepta bajo un nombre ambiguo. |

Los cuatro valores beta son controles complementarios: no reemplazan DB, bot,
webhook, secretos ni chat sintéticos independientes. Tampoco habilitan una
operación remota por sí solos.

## Invariantes

- La ausencia de las nuevas variables no modifica el despliegue legacy.
- Ningun modo `stub` realiza red, persiste una operacion ni fabrica un resultado
  exitoso.
- Las rutas siguen verificando sesion con la misma firma y atributos de cookie.
- Telegram inbox, outbox y worker permanecen apagados en staging.
- No se registran secretos, texto OCR, audio ni contenido financiero nuevo.
- Un solo escritor por archivo durante la ola de subagentes.

## Archivos y frentes

- IA/OCR: adaptadores bajo `lib/ai/` y sus pruebas.
- Cookie: helper comun, middleware/rutas que leen o escriben la cookie y pruebas.
- Notificaciones: crons y emisor push/Telegram proactivo con pruebas fail-closed.
- Integracion: README, `.env.example`, runbook H04d y verificacion completa del
  coordinador.

## Pruebas y puertas

- Pruebas dirigidas demuestran cero invocaciones de red en modos deshabilitados.
- Casos default prueban compatibilidad legacy.
- Configuracion invalida se rechaza de forma determinista.
- Jest dirigido, TypeScript, lint disponible, build y `git diff --check`.
- Revision independiente prioriza bypasses, defaults inseguros y regresiones de
  autenticacion.

## Fuera de alcance

- Cambiar modelos, prompts, parser financiero o semantica OCR.
- Aplicar migraciones o datos en Turso beta.
- Configurar webhook, crear usuarios, enviar mensajes o activar notificaciones.
- Push, PR, merge o deployment.
