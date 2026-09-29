# H04d — cierre formal del aislamiento beta

Estado: **abierto** (29/09/2026). Owner técnico: Codex. Owner de evidencia
legacy y aceptación residual: Esteban. `isolationVerified=false` no debe
reinterpretarse como certificado por haber pasado pruebas funcionales.

## Qué garantiza el contrato

El [contrato H04d.4](PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md) exige
comparar identidades de proveedor autenticadas, no valores financieros:
proyecto/dominios/aliases/target de Vercel; DB ID y host de Turso; bot ID,
username y webhook de Telegram; seis bindings y recibos de procedencia/
fingerprint beta; cookie, flags y modos del deployment inspeccionado.
El [verificador local](../../scripts/verify-staging-config.mjs) comprueba
consistencia y divergencia entre manifiestos, pero no consulta proveedores.
No se necesita leer filas, tokens ni secretos productivos ni hacer escrituras
en legacy.

## Evidencia lograda y huecos actuales

| Superficie | Evidencia | Hueco para certificación |
| --- | --- | --- |
| Vercel | Inspección autenticada 29/09: proyectos distintos, legacy `prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt` y beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`. Beta alias y deployment funcional. | Repetir inventario de aliases, target y nombres/tipo/alcance de bindings del deployment vigente, sin leer valores. |
| Turso | Comparación autenticada histórica H04d.3: DBs y hosts distintos (`hermes-acme` frente a `beta-hermes`). Beta DB usada solo para QA sintético. | Sesión Turso actual está cerrada; renovar consulta **solo metadata** de ambas cuentas o aportar salidas verificables actuales de ID y host. Nunca leer filas legacy. |
| Telegram | Beta `getMe`/`getWebhookInfo` fresco 29/09: ID `8739389202`, `@Hermes_beta_finantial_bot`, webhook beta. Referencia legacy aportada previamente: ID `8884948884`, `@HermesFinanceAssistBot`, webhook legacy. | Revalidar la referencia legacy con el helper read-only o declarar su antigüedad como residual explícito. Repetir el beta webhook antes de activar un nuevo scheduler. |
| Secretos y runtime | Seis fingerprints/procedencia beta históricos en archivo local ignorado del worktree original; no se imprimen valores. | Verificar vigencia de recibos versus actualizaciones beta, copiar solo metadata restringida al worktree vigente, y reconstruir manifiestos. El generador actual fija `AI_MODE/OCR_MODE=stub` y outbox apagado: **no refleja** Groq/OCR live y outbox activo. No volver a usarlo sin actualización y pruebas. |
| Política local | El verificador distingue `ok` de `isolationVerified`; no certifica proveedores. | Ejecutarlo sobre los manifiestos vigentes y adjuntar comparación autenticada, revisión humana y fecha. Un `ok: true` solo no cierra el gate. |

## Secuencia de cierre sin tocar legacy

1. Capturar de forma autenticada/read-only el inventario fresco de Vercel
   beta y legacy, Turso beta/legacy y Telegram beta/legacy. Conservar solo
   IDs, hosts, webhook y metadata de bindings; no secretos ni filas.
2. Corregir el generador/contrato para que el manifiesto describa el
   deployment beta **actual** (`inbox=true`, `outbox=true`, `worker=false`,
   Groq/OCR live según bindings), y que falle si el estado medido difiere.
   No inventar fingerprints: reutilizar recibos verificables o renovar solo
   los secretos beta cuyo valor ya no coincida con su recibo.
3. Crear ambos manifiestos ignorados con permisos privados en este worktree,
   ejecutar pruebas del generador y `staging:verify-isolation`, y revisar
   explícitamente que ningún host, bot, DB, cookie o secreto beta apunte al
   recurso legacy.
4. Registrar en el [estado operativo](IMPLEMENTATION-STATUS.md) fecha, SHA,
   deployment, resultados y límites; una persona distinta revisa la evidencia
   antes de marcar `isolationVerified=true`. Si la metadata legacy no puede
   actualizarse, mantener `false` o rotular una aceptación residual **sin**
   llamarla certificación formal.

El certificado de aislamiento no certifica semántica financiera, entrega
grupal ni recuperación de outbox: son gates independientes del mismo H04d.
