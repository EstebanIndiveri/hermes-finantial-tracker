# ACT-17 — unicidad del endpoint Web Push en beta

## Contrato del corte

- Actual: el writer serializa el alta, pero `push_subscriptions.endpoint` no
  tiene restricción única en DB. Una escritura fuera del writer puede crear
  dos titulares para el mismo navegador; la lectura de titularidad falla
  cerrada ante esa ambigüedad.
- Resultado: índice único aditivo por endpoint. La migración aborta antes del
  DDL si encuentra grupos duplicados; nunca borra ni reasigna filas para
  satisfacer el índice. El DDL y la fila del ledger son una transacción.
- Invariantes: dos endpoints actuales y sus titulares quedan intactos; el
  writer y la UX de asociación explícita conservan su contrato vigente;
  ningún gasto, bot, webhook, cron ni envío Push cambia. Solo `beta-hermes`
  recibe la migración, tras export fresco, drift check y ensayo local.
- Regresión: una DB canónica nueva exige el índice y rechaza un segundo
  endpoint igual; una DB preíndice con datos distintos migra preservándolos;
  una DB preíndice con duplicados falla sin índice, ledger nuevo ni borrados;
  una segunda aplicación es no-op. Mantener la prueba de alta concurrente.
- Riesgo: un escritor externo que hoy inserte duplicados fallará con
  constraint en lugar de generar ambigüedad. No se conocen otros writers en
  este repositorio. Si aparecen duplicados reales en el preflight, detener el
  rollout y resolver su titularidad con una decisión separada.
- Exclusiones: no cambiar la asociación explícita de un navegador entre
  cuentas; no limpiar el canary Push ni habilitar avisos proactivos aquí. No
  restaurar un backup sobre la DB activa como rollback ordinario.
