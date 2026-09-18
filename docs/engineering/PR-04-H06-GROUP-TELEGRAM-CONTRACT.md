# Contrato de trabajo — PR-04 límites de Telegram grupal

Fecha: 18/09/2026.

## Punto de partida

- SHA: `a844f946eda16be87fb91523336dad882b182bdc` sobre
  `codex/h06-group-routing`.
- Clasificación: corrección compatible de routing y autorización contextual
  para H06; sin migraciones ni cambios del contrato financiero.
- `main` y la versión legacy productiva permanecen en
  `7034107ff322b6331029f493cc0d871c3a2b586f`.

## Riesgo reproducido

- Voz/audio de `group` y `supergroup` entra en la rama personal antes de
  clasificar el chat. Usa `active_telegram_group_id`, llama al handler personal
  y puede publicar datos personales en el grupo de origen.
- Los callbacks Split confían en un `session_id` persistido sin exigir que la
  sesión continúe abierta y vinculada al mismo chat.
- Varias transiciones aceptan cualquier `state.step`; un botón antiguo puede
  accionar un flujo diferente del que creó ese teclado.
- Confirmaciones de gasto, pago y OCR no revalidan de forma uniforme la
  identidad y pertenencia del actor inmediatamente antes de mutar.

## Política compatible

### Mensajes nuevos

- El secret del webhook se valida antes de procesar cualquier update.
- `private`, `group` y `supergroup` se clasifican antes de STT, OCR o IA.
- Voz grupal se transcribe y vuelve a entrar en `handleSplitGroupMessage` como
  texto del mismo chat y actor; nunca usa el grupo personal ni el handler
  financiero personal.
- Se conserva el onboarding vigente: un participante que puede enviar un
  mensaje nuevo al grupo puede registrarse automáticamente como miembro de la
  sesión Split abierta. Después de esa incorporación, una operación activa
  debe resolver explícitamente sesión, identidad y membership.
- `/activar` conserva su excepción de bootstrap y exige una cuenta Hermes para
  crear la sesión. `/ayuda` y `/help` continúan siendo públicos y sin datos
  financieros.

### Callbacks y estado previo

- Un callback nunca auto-registra ni restaura membresía.
- El estado debe pertenecer a `(chatId, telegramUserId)`, tener el `step`
  esperado y apuntar a una sesión `open` cuyo `telegram_chat_id` sea el chat
  actual.
- El actor Telegram debe resolver a un `user` o `temp_user` que ya sea miembro
  de esa sesión.
- El pagador/acreedor seleccionado debe pertenecer a la misma sesión; una
  confirmación no incorpora participantes implícitamente.
- El contexto se revalida inmediatamente antes de insertar `splits`,
  `split_payers`, `split_items` o `split_payments`.

## Resultado esperado

1. Audio privado conserva el pipeline personal autorizado de H03.
2. Audio grupal usa exclusivamente el pipeline Split y sus adaptadores de
   respuesta.
3. Un callback de una sesión cerrada, rotada, de otro chat o de un actor ya no
   miembro no lee ni escribe datos de esa sesión.
4. Un callback cuyo tipo no coincide con `state.step` se rechaza sin mutación.
5. Texto, foto/OCR, audio transcripto y callbacks convergen en la misma regla
   de sesión/actor/membership.
6. El comportamiento positivo actual de sesiones abiertas y miembros vigentes
   se preserva.

## Archivos previstos

- Routing: `app/api/telegram/webhook/route.ts` y su prueba.
- Contexto Split: helper nuevo bajo `lib/telegram/splits/`, integración en
  `handler.ts` y pruebas unitarias.
- Callbacks: `lib/telegram/splits/callback-handler.ts` y sus pruebas.
- OCR/comandos solo si necesitan consumir el contexto común, con un escritor
  único por archivo.

## Pruebas de aceptación

1. Voz en `group` y `supergroup` llama STT y luego Split; cero lookup/handler
   personal y cero respuesta mediante el adaptador personal.
2. Error/null de STT grupal usa respuesta Split y no filtra datos personales.
3. Voz privada no llega a STT si usuario o grupo no están autorizados.
4. Mensaje grupal nuevo mantiene el auto-registro compatible y luego resuelve
   un contexto activo autorizado.
5. Callback válido de miembro en sesión abierta del mismo chat conserva su
   comportamiento.
6. Sesión cerrada, otro chat, actor no miembro o `step` incompatible producen
   rechazo y cero writers.
7. `participants:all`, confirmación de pago y confirmación OCR revalidan el
   contexto antes de escribir.

## Verificación

1. Regresiones primero y falla por la causa observada.
2. Cambio mínimo por módulos con un escritor por archivo.
3. Pruebas dirigidas, suite unitaria, harness, typecheck, lint y build aislado.
4. Revisión independiente GPT-5.6 Luna del diff final.

## Exclusiones

- H04/H05: inbox/idempotencia durable, correlación de updates y propuestas
  persistidas con versión.
- H13/H14: cálculo, redondeo, validación matemática y rediseño de balances.
- Consultar `getChatMember` en Telegram en cada operación o sincronizar bajas
  reales del grupo; requiere una decisión operativa separada.
- Push, PR, merge, deploy, migraciones, secretos, webhook o acceso a producción.
