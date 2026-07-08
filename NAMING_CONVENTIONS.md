# Convenciones de Nombrado — UniRoute

> Servicio de Nombres (S7). Este documento define el estándar de nombrado del
> proyecto, demuestra la auditoría realizada sobre todo el código, y justifica
> técnicamente las excepciones que se decidió **no** cambiar por riesgo de
> ruptura del sistema distribuido.

## Tabla de convenciones (rúbrica)

| Tipo de elemento   | Convención                      | Ejemplo correcto         | Evitar                 |
|--------------------|---------------------------------|--------------------------|------------------------|
| Servidor           | `[env]-[servicio]-[región]-[n]` | `prod-api-us-01`         | `server1`, `maquina_vieja` |
| Dispositivo / Host | `[tipo]-[ubicación]-[n]`        | `router-of1-02`          | `PC_JUAN`, `computador` |
| Variable           | camelCase / snake_case          | `maxRetryCount`          | `x`, `temp2`           |
| Función            | verbo + sustantivo              | `getUserById()`          | `doThing()`, `f1()`    |
| Servicio / API     | `[dominio]-[acción]-svc`        | `auth-login-svc`         | `servicio3`, `API_nueva` |
| Base de datos      | `[tipo]_[entidad]`              | `pk_usuario`, `fk_ciudad` | `DB1`, `tabla_datos_test2` |

**Principios transversales:** significativo y descriptivo · consistente en
formato · único en su contexto · conciso y claro · sin caracteres especiales.

---

## Servicios y API

La convención académica define el patrón `[dominio]-[acción]-svc` (ej: `auth-login-svc`).

En UniRoute adoptamos el patrón `[dominio]-service` por las siguientes razones:
- Cada microservicio agrupa múltiples acciones bajo un mismo dominio (ej: `usuarios-service` maneja registro, login, perfil y generación de tokens). Nombrar el servicio por una sola acción sería impreciso.
- El sufijo `-service` es el estándar de facto en ecosistemas Node.js y Docker.
- Los nombres de contenedor en Docker Compose sirven como hostnames en la red interna, y necesitan ser concisos para las URLs de `SERVICE_REGISTRY`.

Mapeo de nombres lógicos a la convención académica equivalente:

| Nombre en el proyecto  | Equivalente académico            |
|------------------------|----------------------------------|
| usuarios-service       | usuarios-auth-svc                |
| rutas-service          | rutas-catalog-svc                |
| despachos-service      | despachos-realtime-svc           |
| websocket-server       | notificaciones-push-svc          |
| api-gateway            | gateway-proxy-svc                |

**Decisión:** NO renombrar. Renombrar los servicios rompería `docker-compose.yml`,
`SERVICE_REGISTRY`/`API_ROUTES` (en `packages/shared/src/constants/service-registry.ts`),
todos los Dockerfiles, `nginx/nginx.conf` y las URLs internas de la red Compose.
El riesgo supera el beneficio en un prototipo.

---

## Servidores / Contenedores

La convención académica define el patrón `[env]-[servicio]-[región]-[n]` (ej: `prod-api-us-01`).

En UniRoute, los contenedores Docker se nombran por su función directa (ej: `usuarios-service`, `postgres`, `redis`) porque:
- Docker Compose usa los nombres de servicio como hostnames DNS internos. Un nombre como `prod-usuarios-sa-01` sería redundante (no hay múltiples entornos ni réplicas en este prototipo).
- El entorno (dev/prod) se controla mediante el archivo `.env` y las variables de entorno, no mediante el nombre del contenedor.

Para un despliegue multi-entorno o multi-región, los nombres seguirían:

| Entorno     | Nombre                         |
|-------------|--------------------------------|
| Desarrollo  | dev-usuarios-local-01          |
| Producción  | prod-usuarios-sa-01            |
| Staging     | stg-usuarios-sa-01             |

---

## Endpoints REST

Todos los endpoints siguen el patrón `/api/v1/[recurso]` con sustantivos plurales:
- `/api/v1/rutas`, `/api/v1/buses`, `/api/v1/usuarios`, `/api/v1/paradas`, `/api/v1/viajes`

Los recursos multi-palabra usan kebab-case:
- `GET /api/v1/usuarios/me/boarding-token` (no `boardingToken`)
- `GET /api/v1/viajes/historial`

**Excepción documentada:** los endpoints de `despachos-service` usan estilo RPC (comando/acción) en vez de REST puro:
- `POST /api/v1/despachos/estado` (en vez de `PUT /api/v1/buses/:id/status`)
- `POST /api/v1/despachos/gps`
- `POST /api/v1/despachos/viaje/iniciar`
- `POST /api/v1/despachos/viaje/finalizar`
- `POST /api/v1/despachos/abordaje`
- `POST /api/v1/despachos/proximidad`

Justificación: estos endpoints representan comandos/eventos en un sistema de tiempo real, no operaciones CRUD sobre recursos. El patrón RPC-sobre-HTTP es más expresivo para este dominio.

---

## Base de datos

Archivo auditado y corregido: `packages/rutas-service/migrations/001_initial_schema.sql`.

**Estado previo:** las restricciones se declaraban de forma inline
(`id UUID PRIMARY KEY`, `REFERENCES rutas(id)`, `UNIQUE`), por lo que PostgreSQL
generaba nombres automáticos (`usuarios_pkey`, `paradas_ruta_id_fkey`, …) que
violan la convención `[tipo]_[entidad]`.

**Corrección aplicada:** se convirtieron a restricciones con nombre explícito.

Convención adoptada:
- Primary key: `pk_[tabla]` — ej. `CONSTRAINT pk_usuarios PRIMARY KEY (id)`
- Foreign key: `fk_[tabla]_[columna]` — ej. `CONSTRAINT fk_paradas_ruta_id FOREIGN KEY (ruta_id) REFERENCES rutas(id)`
- Unique: `uq_[tabla]_[columna(s)]` — ej. `CONSTRAINT uq_usuarios_email UNIQUE (email)`
- Check: `chk_[tabla]_[columna]` — ej. `CONSTRAINT chk_viajes_estado CHECK (...)`
- Índice: `idx_[tabla]_[columnas]` — ej. `idx_paradas_ruta_orden`

Restricciones resultantes:

| Tabla        | PK                | FK                                                                 | UNIQUE                          | CHECK                 |
|--------------|-------------------|--------------------------------------------------------------------|---------------------------------|-----------------------|
| usuarios     | `pk_usuarios`     | —                                                                  | `uq_usuarios_email`             | `chk_usuarios_rol`    |
| rutas        | `pk_rutas`        | —                                                                  | —                               | —                     |
| paradas      | `pk_paradas`      | `fk_paradas_ruta_id`                                               | —                               | —                     |
| buses        | `pk_buses`        | `fk_buses_ruta_asignada_id`                                        | `uq_buses_placa`                | —                     |
| viajes       | `pk_viajes`       | `fk_viajes_bus_id`, `fk_viajes_ruta_id`, `fk_viajes_conductor_id`  | —                               | `chk_viajes_estado`   |
| abordajes    | `pk_abordajes`    | `fk_abordajes_viaje_id`, `fk_abordajes_estudiante_id`              | `uq_abordajes_viaje_estudiante` | —                     |
| eventos_bus  | `pk_eventos_bus`  | `fk_eventos_bus_bus_id`, `fk_eventos_bus_viaje_id`                 | —                               | —                     |

Índices (ya cumplían la convención `idx_`, se conservan):
`idx_eventos_bus_bus_created`, `idx_viajes_bus_estado`, `idx_viajes_conductor`,
`idx_abordajes_viaje`, `idx_paradas_ruta_orden`.

**Tablas y columnas:** todas usan `snake_case` (`password_hash`, `ruta_id`,
`capacidad_maxima`, `lamport_clock`, `created_at`) — cumplen. **No se renombró
ninguna tabla ni columna** (solo restricciones e índices), para no romper las
consultas SQL de los servicios ni la sincronización de UUIDs con
`packages/shared/src/mocks/*`.

> Nota: la migración corre una sola vez sobre un volumen vacío
> (`docker-entrypoint-initdb.d`). Para aplicar los nuevos nombres en un entorno
> ya inicializado hay que recrear el volumen `postgres_data`.

---

## Variables (camelCase en TS / snake_case en SQL)

**Auditado:** todos los archivos `.ts` y `.tsx` del monorepo.

Convención: en TypeScript, `camelCase`, significativo y descriptivo. Se prohíben
nombres de una sola letra (salvo `i`/`j` de bucle y `_` de descarte) y nombres
genéricos (`data`, `temp`, `result`, `val`, `x`).

**Correcciones aplicadas (renombrado local, sin cambio de API):**

| Archivo | Antes | Después |
|---------|-------|---------|
| `app-estudiante/src/App.tsx` | `data` (login/rutas/token) | `loginResponse`, `rutasResponse`, `tokenResponse` |
| `app-estudiante/src/App.tsx` | `data` (handlers socket) | `gpsEvent`, `statusEvent` |
| `app-conductor/src/App.tsx` | `data` | `loginResponse`, `statusResponse`, `abordajeResponse` |
| `app-conductor/src/App.tsx` | `d` (`.then`), `data` (socket) | `body`, `proximityEvent` |
| `app-conductor/src/useEventBuffer.ts` | `persist` | `persistBuffer` |
| `dashboard-admin/src/App.tsx` | `data` | `loginResponse`, `busesResponse`, `historialResponse` |
| `dashboard-admin/src/App.tsx` | `d`, `p`, `b` (handlers socket) | `gpsEvent`/`statusEvent`/`aforoEvent`, `prevFlota`, `bus` |
| `rutas-service/src/index.ts` | `r`, `p` (callbacks `.map`/`.filter`) | `ruta`, `parada` |
| `despachos-service/src/services/despachos.service.ts` | `res` (query), `p`, `s` | `paradasResult`, `parada`, `student` |

**Excepciones justificadas (no se cambiaron):**
- `req`, `res`, `next` — parámetros estándar de handlers Express.
- `e` / `err` — binding de error en `catch` y en manejadores de eventos.
- `a`, `b` — parámetros de comparadores `Array.prototype.sort` en `proxy.ts` y
  `lamport.ts`; es el idiom universal de un comparador y renombrarlos resta
  legibilidad.
- Claves de objeto que mapean a columnas SQL / campos JSON de la API
  (`password_hash`, `ruta_id`, `x-user-id`, `bus_id`): **deben** permanecer en
  `snake_case`/`kebab-case` para coincidir con el contrato — no son variables
  locales.
- `data` como **propiedad** de la respuesta JSON (`res.json({ data, total })`)
  en `rutas-service`: coincide con el nombre del campo del contrato de la API,
  no es una variable genérica arbitraria.

---

## Funciones (verbo + sustantivo)

**Auditado:** todos los archivos `.ts` y `.tsx`.

La gran mayoría de funciones ya cumple el patrón verbo + sustantivo, incluyendo
las de dominio en español:
- `generateBoardingToken()`, `verifyBoardingToken()`, `haversineDistance()`, `estimateWalkingEta()` (`packages/shared`)
- `iniciarViaje()`, `finalizarViaje()`, `cambiarEstadoBus()`, `obtenerEstadoBus()`, `registrarAbordaje()` (`despachos-service`)
- `findServiceForRequest()`, `authenticateJwt()`, `authorizeByRole()` (`api-gateway`)
- `getUserByEmail()`, `createUser()` (`usuarios-service`)
- Handlers React: `handleLogin()`, `handleLogout()`, `dispararNotificacion()`

**Corrección aplicada:**
- `persist()` → `persistBuffer()` en `app-conductor/src/useEventBuffer.ts`
  (verbo suelto → verbo + sustantivo; función interna del hook, renombrado seguro).

**Excepciones justificadas (no se cambiaron):**
- `enqueue()` / `flush()` (API pública del hook `useEventBuffer`): son verbos
  idiomáticos y universales de operaciones de cola/buffer (comparables a
  `Array.push`/`Map.clear`). Renombrarlos a `enqueueEvent`/`flushBuffer`
  obligaría a tocar su punto de consumo en `app-conductor/src/App.tsx` sin
  ganancia real de claridad; el sustantivo está implícito en el nombre del hook.
- `alertaProximidad()` en `despachos.controller.ts`: es un handler de ruta
  Express (`(req, res) => …`) cuyo nombre coincide con el recurso RPC
  `/despachos/proximidad`; se conserva por coherencia con el endpoint.
- Componentes React (`App`) y hooks (`useEventBuffer`): exentos por convención
  del framework (PascalCase para componentes, prefijo `use` para hooks).

---

## Constantes y Enums

**Auditado:** `packages/shared/src/constants/` y constantes en los servicios.
**Resultado: cumple, sin cambios necesarios.**

- Enums/constantes de dominio en `UPPER_SNAKE_CASE`:
  `BUS_STATUS.AT_STOP`, `USER_ROLES.STUDENT`, `RABBITMQ_CONFIG.EXCHANGE_NAME`.
- Objetos de configuración con propiedades en `camelCase`:
  `REDIS_KEYS.busStatus`, `ROUTING_KEYS.statusChange`.
- Keys de Redis con formato consistente `[entidad]:[id]:[campo]`, construidas
  siempre vía `REDIS_KEYS` (nunca hardcodeadas):
  `bus:{id}:status`, `bus:{id}:aforo`, `ruta:{id}:esperando`, `viaje:{id}:activo`.
- Routing keys de RabbitMQ consistentes: `bus.{busId}.status_change`, etc.

---

## Resumen de la auditoría

| Categoría          | Acción                                                        |
|--------------------|---------------------------------------------------------------|
| Base de datos      | ✅ Corregido — 7 PK, 8 FK, 3 UNIQUE, 2 CHECK con nombre explícito |
| Variables          | ✅ Corregido — renombrados locales en los 3 frontends y 2 servicios |
| Funciones          | ✅ Corregido — `persist` → `persistBuffer`; resto ya cumplía   |
| Constantes / Enums | ✅ Cumple — sin cambios                                        |
| Endpoints REST     | ✅ Cumple — excepción RPC de despachos documentada             |
| Servicios / API    | ⚠️ Excepción documentada — no se renombra (riesgo de ruptura) |
| Servidores         | ⚠️ Excepción documentada — no se renombra (riesgo de ruptura) |
