-- PR-06/H04b — preflight y verificacion de migracion 0010.
-- SOLO LECTURA. Ejecutar primero en una copia/staging aislado, nunca como
-- sustituto del backup ni directamente sobre produccion por inferencia.

-- PRE-MIGRACION: debe devolver cero filas. Un resultado requiere conciliacion
-- funcional antes de crear execution_recurring_date_idx.
SELECT
  recurring_expense_id,
  scheduled_date,
  COUNT(*) AS duplicate_count
FROM recurring_executions
GROUP BY recurring_expense_id, scheduled_date
HAVING COUNT(*) > 1;

-- PRE-MIGRACION: inventario de columnas. Permite detectar una aplicacion
-- parcial; 0010 no se debe reejecutar ciegamente si alguna columna ya existe.
SELECT 'transactions' AS table_name, name AS column_name
FROM pragma_table_info('transactions')
WHERE name = 'operation_id'
UNION ALL
SELECT 'splits', name FROM pragma_table_info('splits') WHERE name = 'operation_id'
UNION ALL
SELECT 'split_payments', name FROM pragma_table_info('split_payments') WHERE name = 'operation_id'
UNION ALL
SELECT 'reimbursement_requests', name
FROM pragma_table_info('reimbursement_requests')
WHERE name = 'operation_id';

-- PRE/POST: inventario de objetos H04a/H04b. Antes de 0010 puede existir solo
-- telegram_update_inbox; despues deben existir todos los objetos listados.
SELECT type, name, sql
FROM sqlite_master
WHERE name IN (
  'telegram_update_inbox',
  'telegram_operations',
  'telegram_delivery_outbox',
  'transactions_operation_id_idx',
  'splits_operation_id_idx',
  'split_payments_operation_id_idx',
  'reimbursement_requests_operation_id_idx',
  'execution_recurring_date_idx',
  'telegram_operations_update_kind_idx',
  'telegram_operations_namespace_idx',
  'telegram_delivery_outbox_delivery_key_idx',
  'telegram_delivery_outbox_claim_idx',
  'telegram_delivery_outbox_update_idx',
  'telegram_delivery_outbox_operation_idx'
)
ORDER BY type, name;

-- POST-MIGRACION: debe devolver 1. No habilitar flags si las FK no estan
-- activas en la conexion usada por la aplicacion.
PRAGMA foreign_keys;

-- POST-MIGRACION: las cuatro columnas deben aparecer y conservar NULL para
-- historia legacy. No se realiza backfill retrospectivo.
SELECT 'transactions' AS table_name, name, type, "notnull"
FROM pragma_table_info('transactions') WHERE name = 'operation_id'
UNION ALL
SELECT 'splits', name, type, "notnull"
FROM pragma_table_info('splits') WHERE name = 'operation_id'
UNION ALL
SELECT 'split_payments', name, type, "notnull"
FROM pragma_table_info('split_payments') WHERE name = 'operation_id'
UNION ALL
SELECT 'reimbursement_requests', name, type, "notnull"
FROM pragma_table_info('reimbursement_requests') WHERE name = 'operation_id';

-- POST-MIGRACION: deben ser cero antes de habilitar TELEGRAM_OUTBOX_ENABLED.
SELECT COUNT(*) AS orphan_outbox_rows
FROM telegram_delivery_outbox AS delivery
LEFT JOIN telegram_operations AS operation
  ON operation.operation_id = delivery.operation_id
 AND operation.bot_id = delivery.bot_id
 AND operation.update_id = delivery.update_id
WHERE operation.operation_id IS NULL;
