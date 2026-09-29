# Guía del plan de Hermes

Esta documentación de estabilización está en el worktree y la rama beta,
`codex/h04d-natural-language-e2e`. El checkout legacy de `main` no contiene
todavía estos documentos. No se promueve a `main` hasta aprobar una release.

## Orden de lectura

1. [Diagnóstico original, 16/09/2026](audit/DIAGNOSTICO-2026-09-16.md):
   inventario y hallazgos `H01`–`H20` del código legacy auditado. Es una
   fotografía histórica, no un certificado del código beta actual.
2. [Validación de Copilot y revisión de ejecución](audit/VALIDACION-LEGACY-Y-EJECUCION.md):
   contrasta el informe de Copilot con la documentación legacy, agrega `H21`
   y sustituye el orden inicial de ejecución por fases A–F con reglas de
   continuidad, migración y rollback.
3. [Plan de acción y backlog](audit/PLAN-DE-ACCION.md): define contratos,
   fases, criterios de aceptación y entregables `ACT-01`–`ACT-18`. Su
   secuencia original queda subordinada a la revisión anterior.
4. [Registro operativo vigente](engineering/IMPLEMENTATION-STATUS.md#operational-closure-register--authoritative-26092026):
   indica qué corte terminó, qué falta, su owner y la condición de reentrada.
   Es la fuente de estado para decidir el próximo trabajo; las secciones
   señaladas como *historical snapshot* dentro de ese archivo no son vigentes.
5. [Contratos de cada corte](engineering/): `PR-00`–`PR-12` detallan
   invariantes, pruebas, evidencia y límites de alcance. El
   [runbook H04d](engineering/PR-08-H04D-STAGING-REHEARSAL-RUNBOOK.md) trata
   beta; el [contrato H04d.4](engineering/PR-12-H04D4-ISOLATION-EVIDENCE-CONTRACT.md)
   registra identidades; la
   [lista de cierre de aislamiento](engineering/H04D-ISOLATION-CERTIFICATION-CHECKLIST.md)
   separa evidencia lograda de huecos actuales; la
   [evaluación del scheduler](engineering/H04D-WORKER-SCHEDULER-FINOPS.md)
   cubre recuperación y costo.

## Qué significan los identificadores

| Prefijo | Uso | Ejemplo |
| --- | --- | --- |
| `H` | Hallazgo de la auditoría original. | `H03`: membresía y contexto Telegram. |
| `ACT` | Entregable del backlog general. | `ACT-11/13/14`: canales Telegram, interpretación e imagen. |
| `PR` | Contrato y corte de implementación verificable. | `PR-12/H04d.4`: evidencia de aislamiento beta. |
| `H04d-BETA-*` | Puerta operativa específica del ensayo beta. | `H04d-BETA-OUTBOX`: persistencia y entrega. |

Los IDs no son porcentajes ni equivalen entre sí: un corte de código puede
servir a varios `ACT`, y un `ACT` puede requerir pruebas locales, reconciliación
beta y decisiones operativas antes de cerrarse. Los cambios del piloto beta
no autorizan un merge ni un despliegue del proyecto legacy.
