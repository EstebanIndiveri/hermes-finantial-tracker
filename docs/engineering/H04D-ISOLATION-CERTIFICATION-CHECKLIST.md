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
| Vercel | Inspección autenticada 29/09: proyectos distintos, legacy `prj_i4rqNVGyw28Ed6m02ZoR7ErghTKt` y beta `prj_MAAh80ZRdBzQGCANu5sSGdGp8DPF`; deployments `dpl_Ga5jL5Vh7tP2NoaVRw6cobcTDUVx` y `dpl_464YgY9UzBCuupqiKNHqug5pQHPb`, aliases canónicos distintos y beta target `production` dentro del proyecto beta. Inventario de nombres/tipos/alcances de bindings beta sin valores. | Verificar referencias efectivas de los bindings del deployment activo. `vercel env pull --id` rechazó el deployment READY y `--environment production` entregó valores cifrados vacíos; ni el inventario ni ese archivo prueban el valor en runtime. El archivo temporal se eliminó. |
| Turso | Consultas autenticadas read-only del 29/09: beta ID `01a0c0bd-0601-7f27-b147-915d105b19f2`, host `beta-hermes-esteban-indiveri.aws-us-east-2.turso.io`; legacy ID `019e71ab-9501-7c05-a672-b41db7a2cb27`, host `hermes-acme-eindiveri.aws-ap-northeast-1.turso.io`. No se leyeron filas. | Incorporar las salidas redacted como recibos de evidencia con procedencia y digest. |
| Telegram | Beta `getMe`/`getWebhookInfo` fresco 29/09: ID `8739389202`, `@Hermes_beta_finantial_bot`, webhook beta. El operador ejecutó el 29/09 `getMe`/`getWebhookInfo` para legacy y compartió ID `8884948884`, `@HermesFinanceAssistBot` y webhook `https://hermes-finantial-tracker.vercel.app/api/telegram/webhook`. | Conservar recibo redacted del JSON legacy y registrar revisión de su procedencia; no se necesita token en el repositorio. |
| Secretos y runtime | Seis fingerprints/procedencia beta en archivo local ignorado del worktree original (capturado 26/09); no se imprimieron valores. El endpoint beta procesó un retry del outbox a las 18:40 UTC, evidencia de que su kill switch estaba habilitado en ese deployment; el scheduler Cloudflare separado está activo. | Comprobar vigencia de recibos frente a cambios de bindings y demostrar los valores efectivos de los flags/modos del deployment. La exportación CLI de valores cifrados no sirve para ello. El generador preactivación fija stubs/flags apagadas y **no debe reutilizarse** para beta activo. |
| Política local | El verificador previo conserva el gate con flags apagadas. El [contrato postactivación](H04D-POST-ACTIVATION-RUNTIME-ISOLATION.md) exige flags de inbox/outbox/worker activas, Groq/OCR live y alertas proactivas apagadas; nunca certifica por sí solo. | Crear/revisar recibos actuales, ejecutar el contrato postactivación y adjuntar revisión humana de procedencia y bindings. `ok: true` no cierra el gate. |

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
3. Crear evidencia postactivación privada con permisos restringidos en este worktree,
   ejecutar pruebas del contrato postactivación (no `staging:verify-isolation`,
   que corresponde al ensayo preactivación), y revisar
   explícitamente que ningún host, bot, DB, cookie o secreto beta apunte al
   recurso legacy.
4. Registrar en el [estado operativo](IMPLEMENTATION-STATUS.md) fecha, SHA,
   deployment, resultados y límites; una persona distinta revisa la evidencia
   antes de marcar `isolationVerified=true`. Si la metadata legacy no puede
   actualizarse, mantener `false` o rotular una aceptación residual **sin**
   llamarla certificación formal.

El certificado de aislamiento no certifica semántica financiera, entrega
grupal ni recuperación de outbox: son gates independientes del mismo H04d.
