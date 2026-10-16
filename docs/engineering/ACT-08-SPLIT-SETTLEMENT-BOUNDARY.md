# ACT-08 — deudas globales de compartidos

## Subcorte H13: solo proyección, sin escrituras

Antes, `calculateGlobalBalances` trataba el saldo neto de cada otro miembro
de una sesión como una deuda bilateral con quien consultaba. Esto inventaba
obligaciones: si B pagó 100 solo por C y A era miembro sin participar, A veía
que debía 100 a B y que C le debía 100. La regresión dirigida reprodujo el
fallo antes de cambiar el cálculo.

La vista global ahora parte de las aristas de liquidación que devuelve
`calculateSessionBalances` y conserva solo las que tienen al usuario
consultante como origen o destino. Luego agrega por contraparte entre
sesiones, como antes. Un pago parcial ya incorporado a los saldos de sesión
reduce la arista correspondiente. La política es **liquidación simplificada
por sesión**: no se afirma que la arista identifique qué gasto individual
originó la obligación.

Consumidores revisados: endpoint `/api/splits/global-balances`, dashboard de
balances y formulario/ruta de registro de pagos, que usan el desglose por
sesión. No cambian los writers de web o Telegram, las filas de splits/pagos,
el esquema, las notificaciones ni los crons. No se leen ni escriben datos
beta/legacy en esta prueba.

Pruebas: tercero paga a tercero sin deuda del observador; liquidación de
cuatro participantes; pago parcial; neteo de una contraparte entre sesiones;
API de nombres y cálculo de sesión. La aceptación de beta requiere un pase
posterior con H04d y una sesión QA apta, sin crear pagos reales para fabricar
el caso.

## H14 sigue separado

El alta web en `app/api/splits/sessions/[id]/items/route.ts` conserva los
hallazgos de la auditoría: no comprueba sumas ni pertenencia de cada
participante a la sesión y ejecuta tres inserciones sin transacción. La
edición en `app/api/splits/items/[id]/route.ts` cambia `total_amount` sin
recalcular pagadores/cuotas. H13 no corrige esas escrituras. **Owner Codex:**
preparar regresiones de API/DB real con rollback ante fallo intermedio y
definir una política explícita para editar/cancelar con pagos previos antes
de cambiar escritores. No publicar H13 en beta como cierre completo de ACT-08.

La publicación de este subcorte queda diferida hasta terminar las ventanas
automáticas ACT-17 del 16 y 18/10 para conservar un deployment de cron
estable; el trabajo local puede continuar entretanto.
