# H04d — cierre formal del aislamiento beta

Estado: **cerrado exclusivamente para el piloto beta** (29/09/2026), por
aceptación explícita de Esteban de la limitación residual documentada. Owner
técnico de la evidencia: Codex; owner de la aceptación: Esteban. El resultado
automático `isolationVerified=false` sigue siendo correcto: el certificado
humano acotado no transforma la declaración local en prueba de runtime.

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

## Evidencia lograda y límites aceptados

| Superficie | Evidencia | Hueco para certificación |
| --- | --- | --- |
| Vercel | Inspección autenticada 29/09: proyectos distintos, legacy `prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt` y beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`; deployments activos `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx` y `dpl_HNDia23nZzffCKety38UUUcPsHdY`, aliases canónicos distintos y beta target `production` dentro del proyecto beta. Inventario de nombres/tipos/alcances de bindings beta sin valores. | El pull de valores cifrados no aportó prueba; el gate de build del deployment beta activo sí verificó los bindings al construirlo. No equivale a leer directamente cada función en ejecución. |
| Turso | Consultas autenticadas read-only del 29/09: beta ID `01a0c0bd-0601-7f27-b147-915d105b19f2`, host `beta-hermes-esteban-indiveri.aws-us-east-2.turso.io`; legacy ID `019e71ab-9501-7c05-a672-b41db7a2cb27`, host `hermes-acme-eindiveri.aws-ap-northeast-1.turso.io`. No se leyeron filas. | Incorporar las salidas redacted como recibos de evidencia con procedencia y digest. |
| Telegram | Beta `getMe`/`getWebhookInfo` fresco 29/09: ID `8739389202`, `@Hermes_beta_finantial_bot`, webhook beta. El operador ejecutó el 29/09 `getMe`/`getWebhookInfo` para legacy y compartió ID `8884948884`, `@HermesFinanceAssistBot` y webhook `https://hermes-finantial-tracker.vercel.app/api/telegram/webhook`. | Conservar recibo redacted del JSON legacy y registrar revisión de su procedencia; no se necesita token en el repositorio. |
| Secretos y runtime | Seis fingerprints/procedencia beta en archivo local ignorado del worktree original (capturado 26/09); no se imprimieron valores. El endpoint beta procesó un retry del outbox a las 18:40 UTC. El deployment beta final `dpl_HNDia23nZzffCKety38UUUcPsHdY`, desde commit local limpio `e019a2f`, emitió `passed:true` y `beta_secret_fingerprints_match:true` para los seis secretos del recibo, además de checks de origen/DB/bot/cookie, inbox/outbox/worker, Groq/OCR live y notificaciones apagadas; el alias beta ya apunta allí. El scheduler Cloudflare separado permanece activo. | Revisar el límite de la atestación: verifica el entorno de build del deployment activo, no los valores de una función en ejecución ni URLs de deployments anteriores. El generador preactivación fija stubs/flags apagadas y **no debe reutilizarse** para beta activo. |
| Política local | El verificador previo conserva el gate con flags apagadas. El [contrato postactivación](H04D-POST-ACTIVATION-RUNTIME-ISOLATION.md) exige flags de inbox/outbox/worker activas, Groq/OCR live y alertas proactivas apagadas. Siete recibos redaccionados privados y un manifiesto con digests pasaron el runner local: `ok:true`, `postActivationRuntimeConsistent:true`, `isolationVerified:false` (78/78 tests de harness y typecheck). | Esteban aceptó explícitamente el límite build-snapshot frente a readback de funciones activas **solo para el piloto beta**. El resultado automático conserva su semántica y no debe cambiarse. |

## Decisión de cierre y vigencia

Esteban aceptó explícitamente el 29/09/2026 la limitación residual para cerrar
H04d como **certificación de aislamiento del piloto beta actual**. Cubre el
deployment beta `dpl_HNDia23nZzffCKety38UUUcPsHdY` servido por el alias
`hermes-finantial-tracker-z2.vercel.app` y las identidades de Vercel, Turso y
Telegram registradas arriba. No certifica URLs de deployments anteriores,
lectura directa de secretos dentro de todas las funciones, seguridad absoluta
ni preparación para promover a `main`/producción legacy. No hubo push o deploy
legacy, migración ni consulta de filas financieras productivas para cerrarlo.

Esta aceptación se debe revalidar si cambian el deployment/alias activo, los
bindings de Vercel, los secretos beta, la DB, el bot o el webhook. Antes de
cualquier promoción a producción se exige una revisión de URLs antiguas,
repetir la atestación sobre el deployment candidato y autorización explícita
de release. Es un gate futuro con owner Codex (evidencia) y Esteban (release),
no una tarea pendiente para el piloto beta ya certificado.

## Secuencia de cierre sin tocar legacy

1. Capturar de forma autenticada/read-only el inventario fresco de Vercel
   beta y legacy, Turso beta/legacy y Telegram beta/legacy. Conservar solo
   IDs, hosts, webhook y metadata de bindings; no secretos ni filas.
2. Usar el contrato postactivación para describir el deployment beta **actual**
   (`inbox=true`, `outbox=true`, `worker=true`, Groq/OCR live según el runtime
   inspeccionado). `worker` aquí es `TELEGRAM_OUTBOX_WORKER_ENABLED` en Vercel;
   el Cron Trigger de Cloudflare es otro componente. No inferir estos valores
   de `vercel env pull` cuando los bindings cifrados salen vacíos, ni inventar
   fingerprints: reutilizar recibos verificables o renovar solo los secretos
   beta cuyo valor ya no coincida con su recibo.
3. **Cumplido localmente el 29/09:** evidencia postactivación privada con
   permisos restringidos, digests reales y runner endurecido. Este no invoca
   `staging:verify-isolation`, que corresponde al ensayo preactivación. El
   manifiesto y los recibos declaran recursos beta distintos de legacy; el
   build gate del deployment vigente los contrastó con el entorno real de
   build, incluidos los seis fingerprints beta.
4. **Cumplido el 29/09:** registrar en el [estado operativo](IMPLEMENTATION-STATUS.md)
   fecha, SHA, deployment, resultados, límites y la aceptación explícita de
   Esteban. La ejecución local siempre conserva `isolationVerified=false`:
   no editar el resultado para aparentar una prueba de runtime que no existe.

El certificado de aislamiento no certifica semántica financiera, entrega
grupal ni recuperación de outbox: son gates independientes del mismo H04d.
