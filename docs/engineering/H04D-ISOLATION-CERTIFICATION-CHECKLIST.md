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
| Secretos y runtime | Seis fingerprints/procedencia beta en archivo local ignorado del worktree original (capturado 26/09); no se imprimieron valores. El endpoint beta procesó un retry del outbox a las 18:40 UTC. El deployment beta final `dpl_C1LwkDy4puiBuerqTNWgVSUoYAHr` emitió `passed:true` y `beta_secret_fingerprints_match:true` para los seis secretos del recibo, además de checks de origen/DB/bot/cookie, inbox/outbox/worker, Groq/OCR live y notificaciones apagadas; el alias beta ya apunta allí. El scheduler Cloudflare separado permanece activo. | Revisar el límite de la atestación: verifica el entorno de build del deployment activo, no los valores de una función en ejecución ni URLs de deployments anteriores. El generador preactivación fija stubs/flags apagadas y **no debe reutilizarse** para beta activo. |
| Política local | El verificador previo conserva el gate con flags apagadas. El [contrato postactivación](H04D-POST-ACTIVATION-RUNTIME-ISOLATION.md) exige flags de inbox/outbox/worker activas, Groq/OCR live y alertas proactivas apagadas. Siete recibos redaccionados privados y un manifiesto con digests pasaron el runner local: `ok:true`, `postActivationRuntimeConsistent:true`, `isolationVerified:false` (78/78 tests de harness y typecheck). | Esteban revisa la procedencia y acepta o rechaza el límite build-snapshot versus readback de funciones activas; `ok:true` no cierra el gate automáticamente. |

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
4. Registrar en el [estado operativo](IMPLEMENTATION-STATUS.md) fecha, SHA,
   deployment, resultados y límites; Esteban revisa la evidencia y decide la
   aceptación residual del snapshot de build frente al runtime antes de
   emitir un certificado humano. La ejecución local siempre conserva
   `isolationVerified=false`: no editar el resultado para aparentar cierre.

El certificado de aislamiento no certifica semántica financiera, entrega
grupal ni recuperación de outbox: son gates independientes del mismo H04d.
