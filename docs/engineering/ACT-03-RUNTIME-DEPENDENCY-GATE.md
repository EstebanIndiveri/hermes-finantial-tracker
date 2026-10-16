# ACT-03 — dependencias de runtime antes del próximo beta

## Contrato de corte local (15/10/2026)

`npm audit --omit=dev` detecta tres paquetes con advisories HIGH:
`next@16.3.6`, `sharp@0.35.4` y `source-map-js@1.2.1`. El árbol muestra
`sharp` como dependencia de Next y `source-map-js` vía PostCSS/Tailwind.
La prueba roja de este corte es ese audit, no un test de comportamiento
fabricado. Los advisories publicados indican versiones corregidas Next
16.3.8, sharp 0.35.5 y source-map-js 1.2.2.

Resultado esperado: actualizar solo el rango/parche compatible y lockfile,
sin cambio de API, esquema, datos ni configuración de cron. Invariantes:
`npm audit --omit=dev` sin avisos conocidos, suite completa, typecheck,
lint y build aprobados. Riesgos: cambio de runtime Next y empaquetado de
Sharp; no declarar el deployment beta seguro sin un build y smoke del
deployment exacto. Exclusiones: no tocar legacy ni promover alias beta
antes de cerrar las ventanas ACT-17; vulnerabilidades de herramientas de
desarrollo se registran aparte y no se silencian con excepciones amplias.

**Owner Codex** hasta integración/atestación H04d posterior a ACT-17.

## Resultado local

Se fijó `next@16.3.8` y se forzaron solo los mínimos corregidos de sus
dependencias transitivas (`sharp@0.35.5`, `source-map-js@1.2.2`). El lockfile
también actualizó paquetes binarios de Sharp dentro de la misma familia.
Después de `npm ci --ignore-scripts`, `npm audit --omit=dev` informó cero
avisos. El audit del árbol completo informó 36 avisos (25 moderados,
9 altos, 2 críticos) en dependencias de desarrollo; no equivale a cero
riesgo general ni se aplicó `npm audit fix --force`.

Gates: harness 130/130, Jest 130 suites/1129 pruebas, typecheck, lint
(0 errores/61 advertencias preexistentes) y build aprobados. El build con
Next 16.3.8 emitió avisos de Edge Runtime sobre `process.cwd` dentro de
`next/dist`; requiere observar el smoke beta exacto cuando se publique,
sin inferir una falla a partir de esa advertencia. Este corte no se ha
desplegado ni cambia la observabilidad del cron vigente.
