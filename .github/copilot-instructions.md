# Hermes Finance

Antes de modificar este repositorio, leer y seguir `/AGENTS.md`: es el contrato canónico compartido por Codex, Copilot y otros agentes. Leer además los documentos de auditoría que `AGENTS.md` enruta para cambios transversales.

Reglas críticas:

- Hermes usa Next.js App Router, Turso/libSQL y Drizzle; no aplicar reglas genéricas de Express.
- Producción es solo lectura salvo autorización explícita. No ejecutar E2E, seeds o migraciones contra recursos productivos.
- Mantener aisladas legacy y evolución: worktree, DB, bot y secretos separados.
- Verificar la misma regla financiera en web, Telegram, voz, OCR, callbacks, recurrentes, dashboard, alertas y exportación según corresponda.
- No pushear, crear PR, mergear ni desplegar sin que la tarea lo autorice.
- No exigir `Closes #N` si no existe un issue.
- No aplicar observaciones de revisión ciegamente; verificar evidencia y reejecutar controles relevantes.

Si este archivo y `AGENTS.md` divergen, señalarlo y usar `AGENTS.md` para las reglas del repositorio.
