# Decisiones de Atalaya

> Lo que el dueño ya decidió. No se vuelve a preguntar; si algo nuevo choca con esto, gana lo registrado y se avisa.

## 2026-11-17 — Arranque (dueño)
- Nombre **Atalaya**. Proyecto de **estudio** en `dvlopmnt/atalaya/`; repo **público**, licencia **MIT**.
- **Desde cero.** OmniUser (`dvlopmnt/login`) es solo referencia.
- No es básico: «mejora todo lo posible», pero sigue siendo de estudio y fácil de leer, sin código innecesario.
- **6 roles** con jerarquía: usuario → staff → manager → admin → director → super.
- Registro público **con verificación de correo**: Mailpit en local; en el demo, el servicio de correo del portafolio (Resend).
- **Google OAuth entra** (v0.5), con sus pruebas API7/API10.
- **Gemelo en Django + DRF** (lo recomendado, priorizando seguridad); empieza solo al terminar Atalaya.
- **Front único en Next.js**, también para el gemelo. Las variantes de front en Python no son el camino principal.
- **Análisis de datos de un negocio:** primero ventas en Excel/CSV, pero los demás formatos (gastos, CFDI XML, PDF) se diseñan desde el inicio y se construyen por fases.
- El **admin no ve el contenido** de los archivos de un cliente, solo metadatos.
- **Demo:** cuenta de prueba con límites claros que permita probar todo; borrado automático a las 24 h con aviso visible; datos de ejemplo obligatorios, sintéticos o abiertos tipo Kaggle, nunca reales de personas. Vive dentro de dvlopr-bn como caso de estudio.
- Código en inglés, documentación en español. Git con rama por fase, PR revisado y etiqueta por fase. Una sola guía de recorrido.
- Partes **A (acceso) y B (análisis)** en un mismo repo; A primero.

## 2026-11-17 — Técnicas (propuesta aprobada con «sí, adelante»)
- Docker para todo; dos redes (`edge` y `data` interna). El worker solo en `data`, de solo lectura, sin root, con límites.
- Caddy es la única puerta (`127.0.0.1:3070`) y pone las cabeceras de seguridad en un solo lugar. La API vive en el mismo dominio, en `/api` (cookies sin cruzar dominios, sin CORS).
- Contraseñas con **Argon2id** (el gemelo Django las lee igual).
- **TypeScript 6.0.3 en api y 5.9.3 en web:** el CLI de Nest 12 exige `~6.0.2` y openapi-typescript 7.13 exige TS 5. Forzar con `--legacy-peer-deps` sería un parche; dos versiones, cada una soportada, no lo es.
- **Prisma 7.10.1 fijado:** la etiqueta `latest` de npm apunta a 8.0.0-rc.
- **vitest 4.1** (la misma que ya funciona en dvlopr-bn), no la 5.
- Lint con `oxlint --deny-warnings`: sin esa opción, las advertencias no fallan.
- Fuera de alcance, a propósito: organizaciones (varias personas por negocio).

## 2026-11-17 — Cambio del dueño: Atalaya SÍ lleva interfaz
- Reemplaza «sin UX/UI, solo el esqueleto». El dueño (tras cerrar v0.3): una interfaz **innovadora, tecnológica, que parezca de ciencia de datos, llamativa y relativamente sencilla**. Dirección visual por elegir entre tres propuestas originales.
- **Elegida la dirección A, «Observatorio»** (2026-11-17): fondo azul noche, turquesa para lo normal y ámbar para lo anómalo, cifras en monoespaciada, radar de anomalías como pieza central. Las tres viven en un lienzo de diseño privado del dueño (fuera del repo).
- **La interfaz es su propia fase, `v0.4`**, antes del 2FA (recomendación de Claude, aplicada sin objeción del dueño): las fases siguientes se recorren una posición; la demo sigue en `v1.0`.

## 2026-11-17 — v0.6 (opción A elegida por el dueño)
- **Opción A:** todo contra un **servidor OAuth falso local** (`mock-idp/`); el cliente real de Google se agrega después con solo poner seis variables `OAUTH_*` en `.env`. La opción B (probar el botón real) queda pendiente del dueño.
- **Authorization Code + PKCE (S256) + `state` + `nonce`**, con el intento en Redis (10 min, un solo uso, solo hashes) y **atado al navegador con una cookie `__Host-` `SameSite=Lax`** (Lax y no Strict: el regreso desde Google es una navegación entre sitios).
- **`id_token` verificado a mano** (`id-token.ts`): algoritmo fijo RS256, llave por `kid` del JWKS, tamaño de módulo ≥ 2048 bits, emisor, audiencia (+`azp`), vigencia con 60 s de tolerancia, `nonce` en tiempo constante y `email_verified === true` estricto. Escrito en vez de usar una librería: se estudia entero y no hay dependencia que auditar.
- **Identidad por `sub`, nunca por correo** (`oauth_identities`, únicas por `(provider, subject)` y por `(user_id, provider)`). Vincular a una cuenta existente solo si su correo ya está verificado, y **siempre se avisa por correo** al dueño. Una cuenta nueva nace `usuario`, sin contraseña y verificada.
- **El 2FA no se salta con Google:** el regreso da un reto en el fragmento (`/login#challenge=…`) y la sesión nace al canjearlo.
- **Respuesta uniforme:** cualquier fallo → `/login?error=google`; el motivo (código fijo, sin datos) va solo al log. Destinos de redirección **fijos** (sin open redirect).
- **Consumo seguro del proveedor:** URLs de la configuración, sin redirecciones, 5 s de tiempo límite (con prueba guardián), 64 KB, solo JSON; llaves en caché 10 min y como máximo una descarga extra cada 30 s; en producción solo HTTPS (otro valor impide arrancar).
- **Una cuenta solo-Google no tiene contraseña:** activar el 2FA devuelve un `409` claro («crea una con ¿Olvidaste tu contraseña?»). Mejor mensaje y salida explícita que un «contraseña incorrecta».
- **Solo el alcance `openid email`:** Atalaya no pide ningún permiso sobre la cuenta de Google.
- **Defensa en capas, medida:** al quitar la revisión del algoritmo o la de «ya tiene otra cuenta de Google», la suite viva sigue en verde (la firma RS256 fija y la restricción única de la base lo rechazan igual) y las unitarias caen. Se mantienen **ambos** niveles de prueba.

## Diseño de las fases v0.2 a v0.10 (movido al historial, 2026-11-19)
- Son decisiones de diseño de Claude, dentro de lo aprobado, de fases ya cerradas y etiquetadas. **No se replantean**; el texto íntegro vive en `docs/historial/DECISIONES_COMPLETAS_2026-11-19.md` (los números son líneas de ese archivo). Cada fase tiene además su laboratorio y su capítulo en `docs/`.

- 2026-11-17 — v0.2: líneas 32-45
- 2026-11-17 — v0.3: líneas 51-61
- 2026-11-17 — v0.5: líneas 62-74
- 2026-11-18 — v0.7: líneas 87-99
- 2026-11-18 — v0.8, contrato: líneas 100-115
- 2026-11-18 — v0.8, worker: líneas 116-125
- 2026-11-18 — v0.8, pantalla de archivos: líneas 126-132
- 2026-11-18 — v0.9, contrato y diseño: líneas 133-159
- 2026-11-18 — v0.9, worker de análisis: líneas 160-175
- 2026-11-18 — v0.9, pantallas de análisis: líneas 176-184
- 2026-11-19 — v0.10, contrato y diseño: líneas 185-207
- 2026-11-19 — v0.10, worker de indicadores: líneas 208-227
- 2026-11-19 — v0.10, pantallas: líneas 228-237

## 2026-11-18 — v0.11, worker: reparto entre la puerta y el lector (diseño de Claude, dentro de lo aprobado)
- **Dos barreras para un XML, cada una probada por su cuenta.** La API rechaza `<!DOCTYPE`/`<!ENTITY` de un `.xml` suelto (415, antes de guardar). **La API no abre ZIP**, así que dentro de un ZIP el único control es el worker (`defusedxml` con DTD prohibido): por eso hay e2e de XXE dentro de un ZIP contra el worker real, y la falla plantada se hizo sobre esa barrera.
- **Un ZIP malo se rechaza entero** (una entrada que no es `.xml`, un ZIP anidado, un XML roto, un DOCTYPE): no se analiza «lo que sí se pudo», para no dar cifras de un archivo adulterado.
- **Lo que no es venta ni gasto en pesos se descarta contado**, nunca en silencio: `unsupported_document` (pago, traslado, nómina) y `unsupported_currency`; ambos tiran el comprobante entero y cuentan como leídos y descartados (`rowsKept + rowsDropped = rowsRead`).
- **La lista cerrada de problemas vive en dos sitios** (el contrato y `cleaner.py`): una prueba obliga a que sean iguales, porque el defecto fue justo ese (el código nuevo se perdía sin error).
- **Topes del worker:** 1 MiB por XML, profundidad 20, 50 000 elementos, 4 000 caracteres por atributo, 500 entradas y 50 MB descomprimidos por ZIP.

## 2026-11-19 — v0.11, CFDI en XML: contrato y diseño (diseño de Claude, dentro de lo aprobado; sin código aún)
- **Rama:** `fase/v0.11-cfdi`, desde un `main` que ya contiene v0.10 (PR #8, CI 5/5). Falta la etiqueta `v0.10` (con permiso del dueño). El commit de documentación de las etiquetas v0.7–v0.9, que se subió después del merge, viaja en esta rama.
- **Qué es un CFDI y qué se hace con él.** El comprobante fiscal digital mexicano es un XML: un `cfdi:Comprobante` (versión 3.3 o 4.0) con `Fecha`, `Total`, `Moneda`, `TipoDeComprobante`, un `Emisor`, un `Receptor`, uno o varios `Conceptos` (con su importe, descuento e impuestos) y un timbre del SAT con su `UUID`. Se lee para **analizarlo como ventas o gastos con la misma tubería de v0.9 y v0.10** (mapeo, limpieza, informe, indicadores); no se construye nada paralelo.
- **Dos formas de subirlo:** un `.xml` (un comprobante) y un `.zip` de comprobantes (como los baja el portal del SAT). Razón del ZIP: un negocio tiene cientos de CFDI al mes y el tope de 10 archivos por cuenta se mantiene; un ZIP trae hasta **500** (el mismo tope de entradas de v0.8). `uploads.kind` pasa a `csv | xlsx | xml | zip`.
- **La idea que lo hace caber en lo que ya existe: una tabla virtual.** El lector convierte los CFDI en una tabla con **un renglón por concepto** (`fecha, uuid, folio, tipo, emisor_rfc, emisor_nombre, receptor_rfc, receptor_nombre, concepto, cantidad, importe, iva, moneda`) y entrega un `Table` como el de un CSV. Desde ahí, **todo lo demás no cambia**: el mapeo, la limpieza, el informe de calidad, los indicadores. El pedido (`orderId`) se sugiere como el `uuid`: varios conceptos de una factura son **un** pedido, y el ticket promedio sale bien.
- **Qué se lee y cómo se calcula:**
  - `importe` = `Importe` del concepto **menos su `Descuento`**, en `Decimal` exacto (nunca flotante); `iva` = la suma de sus traslados de IVA (`Impuesto 002`), que no entran en el importe.
  - **Egreso (`E`, nota de crédito) = importe negativo**: es una devolución, y el informe ya las cuenta aparte.
  - **Ingreso (`I`)** normal. **Pago (`P`), traslado (`T`) y nómina (`N`) no se soportan** (un pago no es una venta; `Total` suele ser 0): se **descartan contados** con el problema nuevo `unsupported_document`.
  - **Solo moneda `MXN`.** Otra moneda se descarta contada (`unsupported_currency`) en vez de convertirla con un tipo de cambio que el archivo declara y nadie verifica.
  - `Fecha` es la fecha de emisión **sin hora y sin mover de zona**: el CFDI dice la hora local del lugar de expedición (`LugarExpedicion`) y no hay nada que convertir.
- **Venta o gasto lo decide la persona** (`kind` al crear), como en v0.10: los CFDI que emitiste son ventas y los que recibiste son gastos; el XML trae el emisor y el receptor, pero no sabe quién eres. No se adivina por el RFC.
- **XXE y compañía (el ataque de la fase): `defusedxml` con DTD prohibido** (ya se usa en v0.8 dentro de los `.xlsx`), y además, antes de interpretar nada: **tamaño** (1 MB por XML), **profundidad** (máximo 20 niveles) y **cantidad de elementos** (máximo 50 000 por XML); la raíz debe ser `Comprobante` en el espacio de nombres del SAT (`…/cfd/3` o `…/cfd/4`) y la versión, `3.3` o `4.0`. Un DOCTYPE, una entidad (interna o externa), una declaración de parámetros o un `XInclude` se rechazan como `corrupt`; una raíz que no es un CFDI, como `not_cfdi` (motivo nuevo de lista cerrada); demasiado complejo, `range_too_large`. **El worker no tiene red** (corre en la red interna): aunque algo intentara leer una URL, no hay a dónde ir; es una segunda barrera, no la primera.
- **Lo que el ZIP agrega:** cada entrada debe ser un `.xml` (sin carpetas con `..`, sin ZIP dentro de un ZIP, sin cifrado), con los topes de v0.8 (bomba zip, 500 entradas, 50 MB descomprimidos, razón 100:1) y cada entrada pasa por la revisión de XML de arriba. La API solo distingue por firma un `.zip` de un `.xlsx` renombrado (un libro de Excel con extensión `.zip` se rechaza).
- **Qué NO es esto, dicho de frente:** **no valida la firma del comprobante** (`Sello`, `Certificado`, el timbre del SAT), **ni su estatus** (un CFDI cancelado se ve igual que uno vigente: eso solo lo sabe el SAT) **ni su coherencia fiscal** (que el IVA cuadre). Es analítica de lo que el archivo dice, no una herramienta fiscal; la pantalla lo avisa. Un CFDI duplicado entre archivos (mismo `UUID`) cae en la regla de renglón repetido solo si es idéntico.
- **Cambios de esquema previstos:** el CHECK de `uploads.kind` admite `xml` y `zip`, y el de `uploads.reject_reason`, `not_cfdi`. El worker no necesita permisos nuevos (lee los mismos campos). `quality` suma dos problemas al contrato (`unsupported_document`, `unsupported_currency`), que **no** están en un CHECK de la base (el informe es JSON).
- **Datos personales:** un CFDI real trae RFC, nombre y domicilio fiscal de personas y de negocios. El repo es público: **solo se usan CFDI sintéticos** con los RFC de pruebas que el SAT publica (`EKU9003173C9` como emisor y `XAXX010101000` como público en general). La pantalla de subida ya dice «usa solo datos de prueba».
- **Fuera de alcance, a propósito:** Complemento de Pago, Carta Porte, Nómina y comercio exterior; conversión de moneda; validación contra el SAT; exportar los renglones a CSV (más superficie de inyección de fórmulas con nombres de conceptos).
- **Migración `20261119083000_cfdi_kinds`** (escrita a mano: no cambia el esquema de Prisma; `kind` ya es `VARCHAR(8)`): reemplaza dos CHECK de `uploads` por versiones **ampliadas** (`kind` admite `xml` y `zip`; `reject_reason` admite `not_cfdi`). Compatible hacia atrás: todo valor que ya existía sigue siendo válido, así que ninguna fila actual puede violar las nuevas restricciones y no hace falta respaldo ni dos pasos. Probada en una transacción revertida: 7 inserciones válidas pasan (tipos y motivos nuevos y viejos), 5 inválidas se bloquean (`pdf`, `XML` en mayúsculas, `xlsm`, un motivo inventado y uno con un espacio de más) y la regla de v0.8 «motivo si y solo si rechazado» sigue vigente. El worker no necesitó permisos nuevos: `permisos-worker.sh` sigue en orden.

## 2026-11-19 — v0.11, API: la puerta de `.xml` y `.zip` (diseño de Claude, dentro de lo aprobado)
- **`checkSignature` suma dos tipos** (`file-signature.ts`, ahora 106 líneas). **`.xml`:** debe ser texto UTF-8 (sin bytes nulos; el BOM y los espacios antes de la declaración se toleran), empezar con `<`, **no traer `<!DOCTYPE` ni `<!ENTITY`** (en cualquier combinación de mayúsculas) y parecer un CFDI (trae «Comprobante»). **`.zip`:** debe ser zip (firma `PK`), traer al menos una entrada `.xml` (los nombres internos de un zip van en claro) y **no ser un libro de Excel** con la extensión cambiada (`xl/workbook.xml`).
- **El DOCTYPE se rechaza YA en la puerta** (415 con un mensaje claro) **y además lo vuelve a rechazar el worker**: un CFDI legítimo nunca lo lleva, así que no hay falsos positivos que temer, y un XXE no llega ni a guardarse. Defensa en capas, con una consecuencia que queda dicha: **un XXE dentro de un `.zip` no se ve en la puerta** (la API no abre zips), así que esa ruta la prueba el worker en vivo.
- **Límites a propósito (la puerta es barata):** un XML con la palabra «Comprobante» que no es un CFDI (por ejemplo una página HTML) **pasa** y lo rechaza el worker con `not_cfdi`; un `DOCTYPE` escondido dentro de un comentario no es una declaración y también pasa (lo que importa es `<!DOCTYPE`, que el worker vuelve a prohibir). Ambos límites tienen su prueba.
- **UTF-8 y nada más:** UTF-16 (sus bytes nulos lo delatan) y latin1 se rechazan. Los CFDI del SAT son UTF-8.
- **El mensaje de extensión no admitida** ahora lista los cuatro formatos. La revisión del navegador (`precheck`) y el `accept` del selector de archivos se actualizan en el paso de pantallas.
- **Pruebas:** unitarias **283** (14 nuevas: aceptación con y sin BOM, 5 variantes de XXE y «billion laughs», DOCTYPE en mayúsculas y minúsculas, UTF-16 y latin1, un zip llamado `.xml`, un libro de Excel llamado `.zip`, y los dos límites); e2e de subidas **30** (11 nuevas, contra el sistema vivo: las dos aceptaciones y 10 rechazos 415). Mientras el worker no lea estos tipos, los archivos aceptados terminan `rejected / corrupt` sin tumbarlo (se comprobó: el worker sigue sano).
