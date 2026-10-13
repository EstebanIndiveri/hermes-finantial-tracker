# ACT-17 — fotografía reproducible de outboxes beta

## Contrato del corte

**Actual:** el control de colas en el runbook requiere comandos Turso y SQL
manuales. Es fácil perder la comprobación de identidad o comparar cifras
calculadas con relojes distintos.

**Esperado:** un comando local acepta únicamente `--config-path` absoluto,
confirma cuenta Turso, nombre/ID/URL exactos de `beta-hermes`, y ejecuta una
consulta SQL fija que devuelve solo agregados Push y Telegram. La salida es
un único JSON con estados, trabajos vencidos para entrega/purga, leases
expirados y edad del trabajo abierto más antiguo. Ningún ID de fila, chat,
usuario, endpoint, texto, payload, secreto o error de proveedor aparece en
stdout/stderr. Un fallo muestra solo un código estable y no produce JSON.

**Invariantes:** el comando no acepta SQL ni DB por parámetro y no ejecuta
escrituras, claims, workers o purgas. Valida identidad antes de consultar.
No certifica permisos de solo lectura del perfil Turso, aislamiento H04d,
entrega por proveedor ni disponibilidad sostenida; cada JSON es una sola
fotografía. No cambia flags, runtime o datos QA y no se despliega.

**Pruebas:** perfil inválido, cuenta/ID/URL/nombre incorrectos, output
malformado, estado desconocido y redacción de errores; comparación de
campos y casos sin trabajos abiertos. Una lectura real beta solo después de
pasar pruebas y repetir comprobación de identidad.

**Archivos:** `scripts/beta-outbox-snapshot.mjs`, su prueba Node, runbook de
observabilidad y estado. El orquestador integra; la revisión Luna es de
solo lectura. Legacy queda fuera del alcance.
