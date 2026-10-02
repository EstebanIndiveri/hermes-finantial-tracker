# ACT-16 — precisión del porcentaje de ahorro

El dashboard beta de octubre mostraba `100%` aunque el ahorro proyectado en USD era menor que el ingreso. La causa era el redondeo del cociente a un entero, no una transacción duplicada ni un cambio del saldo persistido.

La presentación usa ahora un decimal con formato `es-AR`. Cuando el cociente real es inferior a 100%, un redondeo al límite queda en `99,9%` en lugar de comunicar falsamente `100%`. El cálculo sigue leyendo el ingreso y el ahorro proyectado persistidos en USD; no modifica los importes, la conversión, la base ni el estado financiero.

Los tests cubren el caso de octubre (`4820,25 / 4826,50`), otro cociente cercano a 100%, el 100% exacto, cero ingreso y ahorro negativo. El cambio permanece local hasta una publicación beta con sus controles de aislamiento. Owner: Codex para gates y beta; Esteban para aceptación visual de una nueva versión.
