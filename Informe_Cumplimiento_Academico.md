# Informe de Cumplimiento Académico — UniRoute
## Proyecto Integrador — Aplicaciones Distribuidas, UDLA

> **Fecha de auditoría:** 2026-07-07
> **Alcance:** revisión de todo el código fuente del monorepo (`packages/*`, `nginx/`, `docker-compose.yml`, migraciones SQL, configuración de entorno).
> **Método:** lectura directa del código + verificación en vivo del stack en Docker (flujo de eventos en tiempo real ejercitado de punta a punta).
> **Convención:** ✅ Cumple · ⚠️ Parcial · ❌ No cumple.

---

## S2: Características de Sistemas Distribuidos

### Características Fundamentales (Tanenbaum)

#### 1. Múltiples procesos independientes
**Estado:** ✅ Cumple

**Evidencia en código:**
- **5 servicios backend** como procesos/contenedores separados, cada uno con su propio `index.ts`, `package.json` y `Dockerfile`:

| Servicio | `index.ts` | Puerto interno |
|---|---|---|
| api-gateway | `packages/api-gateway/src/index.ts` | 3000 |
| usuarios-service | `packages/usuarios-service/src/index.ts` | 3001 |
| rutas-service | `packages/rutas-service/src/index.ts` | 3002 |
| websocket-server | `packages/websocket-server/src/index.ts` | 3003 |
| despachos-service | `packages/despachos-service/src/index.ts` | 3004 |

- Además 3 frontends (PWA) + nginx + 3 servicios de infraestructura (PostgreSQL, Redis, RabbitMQ), todos definidos como contenedores separados en `docker-compose.yml` (12 servicios en total).
- Cada backend tiene `EXPOSE` y `CMD` propios, p. ej. `docker-compose.yml:65-84` (despachos-service).

#### 2. Comunicación entre procesos (intercambio de mensajes)
**Estado:** ✅ Cumple — los **tres** protocolos presentes y verificados en vivo.

- **HTTP/REST** — el Gateway hace proxy reverso a los microservicios:
  ```ts
  // packages/api-gateway/src/proxy.ts:31-39
  router: (req) => {
    const serviceName = findServiceForRequest(req as Request);
    if (!serviceName) return 'http://localhost';
    return SERVICE_REGISTRY[serviceName];
  }
  ```
- **WebSockets (Socket.io)** — push del servidor a clientes por rooms:
  ```ts
  // packages/websocket-server/src/index.ts:31-33
  socket.on('subscribe:route', (payload) => {
    socket.join(`route:${extractRouteId(payload)}`);
  });
  ```
- **AMQP** — despachos publica y websocket-server consume:
  ```ts
  // packages/despachos-service/src/services/despachos.service.ts:157
  await publishEvent(ROUTING_KEYS.statusChange(busId), event);
  ```
  ```ts
  // packages/websocket-server/src/rabbitmq-consumer.ts:60-70
  channel.consume(RABBITMQ_CONFIG.QUEUE_WS, (msg) => { ... handleEvent(io, event); channel.ack(msg); });
  ```
- **Verificado en vivo:** un cambio de estado del conductor (POST HTTP) → publicado a RabbitMQ → consumido por websocket-server → emitido por Socket.io → recibido por el cliente estudiante en <1s.

#### 3. Espacios de direcciones diferentes (sin memoria compartida)
**Estado:** ✅ Cumple

- Toda la comunicación es por red (HTTP, AMQP, TCP a Redis/PG). No hay variables compartidas en memoria entre servicios.
- **Cada servicio abre su propia conexión/pool**, no comparten pool:
  - `packages/despachos-service/src/db.ts:9` → `new Pool({ connectionString: databaseUrl, max: 10 })`
  - `packages/usuarios-service/src/db.ts` → pool propio
  - `packages/rutas-service/src/index.ts:11` → `new Pool(...)` propio + `new Redis(...)` propio (`:15`)
  - `packages/despachos-service/src/redis.ts:9` → cliente Redis propio.

#### 4. Objetivo común
**Estado:** ✅ Cumple

- Todos los servicios contribuyen a coordinar buses intercampus: usuarios (auth), rutas (catálogo), despachos (eventos en vivo), websocket (distribución), gateway (entrada única). El contrato compartido vive en `packages/shared` (`types/`, `constants/`, `utils/`).

---

### Características Intrínsecas

#### Transparencia (de ubicación)
**Estado:** ✅ Cumple

- El frontend solo conoce el origen de nginx y llama rutas relativas `/api/v1/*`; nunca direcciona `http://rutas-service:3002`. Ej.: `packages/app-estudiante/src/App.tsx:92` (`fetch('/api/v1/rutas?activa=true', ...)`).
- nginx enruta `/api/` → `api-gateway` (`nginx/nginx.conf:33-38`), y el Gateway traduce nombre lógico → dirección física vía `SERVICE_REGISTRY`.
- ⚠️ Observación: las conexiones Socket.io (`/socket.io/`) van directo de nginx → websocket-server (`nginx/nginx.conf:40-47`), **sin pasar por el Gateway**, por lo que ese canal no hereda la validación JWT del Gateway (ver Hallazgos).

#### Compartición de recursos
**Estado:** ✅ Cumple

- Múltiples clientes Socket.io comparten el mismo room y reciben el mismo estado concurrentemente (`io.to('route:...').emit(...)`, `rabbitmq-consumer.ts:26-36`).
- RabbitMQ (topic exchange) permite distribuir a múltiples suscriptores; Redis es estado compartido de buses accedido por despachos y rutas (`REDIS_KEYS.busStatus`).

#### Sistema abierto
**Estado:** ✅ Cumple

- Protocolos estándar: HTTP, AMQP 0-9-1, WebSocket.
- Tabla de servicios extensible en `packages/shared/src/constants/service-registry.ts` (`SERVICE_REGISTRY` + `API_ROUTES`): agregar un servicio nuevo es declarar una entrada en cada mapa.

#### Escalabilidad
**Estado:** ⚠️ Parcial

- ✅ El broker desacopla productor (despachos) de consumidor (websocket): `RABBITMQ_CONFIG` con exchange `bus.events` durable.
- ⚠️ **Dos componentes con estado en memoria impiden replicación horizontal directa:**
  - La cola de reordenamiento de Lamport es in-memory por instancia: `packages/despachos-service/src/services/lamport.ts:2-3` (`private queues`, `lastSeenClock`). Con 2+ réplicas de despachos, el orden causal se rompería.
  - Los rooms de Socket.io son in-memory (`websocket-server` sin adapter Redis). Con 2+ réplicas, un evento consumido por una instancia no alcanza a los clientes conectados a otra.
- Recomendación: adapter Redis para Socket.io y estado de Lamport en Redis/consumer particionado por `busId`.

#### Tolerancia a fallos
**Estado:** ⚠️ Parcial

- ✅ Reconexión a RabbitMQ en el **consumer** (`websocket-server/src/rabbitmq-consumer.ts:90-98`, reintento cada 5s sin crashear) — verificada en vivo reiniciando RabbitMQ.
- ✅ Reconexión a RabbitMQ en el **publisher** (`despachos-service/src/rabbitmq.ts:54-65`) — corregida y verificada (antes moría tras un intento).
- ✅ Socket.io provee reconexión automática de cliente por defecto (los frontends crean el socket sin desactivarla).
- ✅ Healthchecks en los 5 servicios Node + infra (`docker-compose.yml`).
- ❌ **La app del conductor NO tiene retry-pattern ni retención local de eventos ante fallo de red.** Ver S3.4 / S5.4 y Hallazgos Críticos. Este ítem está explícitamente en el rubro.

#### Seguridad
**Estado:** ✅ Cumple (con caveats de transporte, ver S3.2)

- Validación JWT fail-closed en el Gateway: `packages/api-gateway/src/middleware/auth.ts:95-102`.
  ```ts
  const decoded = jwt.verify(token, getJwtSecret());
  if (!isJwtUserPayload(decoded)) return res.status(401)...
  ```
- `helmet` y `cors` activos: `packages/api-gateway/src/index.ts:17-24`. Además `x-powered-by` deshabilitado y rate-limiting (`:26-37`).
- Contraseñas hasheadas con **bcrypt (10 rounds)**: `packages/usuarios-service/src/routes/usuarios.routes.ts:70` (`bcrypt.hash(password, 10)`) y `:113` (`bcrypt.compare`).
- RBAC fail-closed: `packages/api-gateway/src/middleware/rbac.ts:213-218` (ruta no listada → 403 `RBAC_RULE_NOT_FOUND`).
- Token de abordaje HMAC firmado (`packages/shared/src/utils/boarding-token.ts:16`, HS256).

#### Consistencia
**Estado:** ✅ Cumple

- WebSockets evitan polling (push por eventos).
- RabbitMQ con entrega confiable: `persistent: true` al publicar (`despachos-service/src/rabbitmq.ts:98`), cola `durable: true` y `ack`/`nack` en el consumer (`rabbitmq-consumer.ts:52,66,68`).
- Redis es la fuente de verdad del estado en vivo (`REDIS_KEYS.busStatus/busAforo`), leído por rutas-service para el campo `estadoEnVivo` (`rutas-service/src/index.ts:190-202`).

---

## S3: Comunicación

#### 2.1 Capa de transporte: TCP
**Estado:** ✅ Cumple

- PostgreSQL vía `pg.Pool` sobre TCP: `DATABASE_URL=postgresql://...@postgres:5432/...` (`.env.example:4`).
- Redis vía `ioredis` sobre TCP: `REDIS_URL=redis://redis:6379` (`.env.example:5`).
- RabbitMQ vía `amqplib` sobre TCP: `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672` (`.env.example:6`).

#### 2.2 Capa de seguridad: TLS
**Estado:** ❌ No cumple

- nginx solo escucha en el puerto 80, sin `ssl_certificate` ni `listen 443`: `nginx/nginx.conf:30` (`listen 80;`).
- Las conexiones WebSocket son **WS** (no WSS): los frontends crean `io('/', { path: '/socket.io/', transports: ['websocket'] })` sobre el mismo origen HTTP.
- No hay ninguna directiva TLS/SSL en todo el repositorio (los `https://` presentes son tile-servers externos del mapa, no el propio servicio).
- Aceptable para entorno de desarrollo, pero es un ítem nombrado por el rubro que hoy no está configurado.

#### 2.3 Capa de aplicación: HTTP
**Estado:** ✅ Cumple

- **Verbos correctos:** `GET` para consultas (`GET /api/v1/rutas`, `/buses`, `/usuarios/me`) y `POST` para acciones (`POST /despachos/estado`, `/gps`, `/usuarios/login`). Ej.: `rutas-service/src/index.ts:27,179` (GET) vs `despachos.routes.ts:16-23` (POST).
- **Códigos de estado bien usados:**
  - `200` OK, `201` Created (`usuarios.routes.ts:79`; `rutas-service:95`), `202` Accepted para el cambio de estado asíncrono (`despachos.controller.ts:36`).
  - `400` Bad Request / validación (`despachos.controller.ts:22`), `401` Unauthorized (`auth.ts:89`), `403` Forbidden (`rbac.ts:220-225`), `404` Not Found (`rutas-service:141`), `409` Conflict (placa/email duplicado, `rutas-service:281`, `usuarios.routes.ts:64`), `500` Internal, `502` Bad Gateway (`proxy.ts:72`), `503` en health degradado (`despachos-service/src/index.ts:22`).

#### 2.4 Retry-pattern y manejo de errores de red
**Estado:** ⚠️ Parcial

- ✅ Lado servidor: el Gateway maneja fallo de servicio interno devolviendo `502 BAD_GATEWAY` (`proxy.ts:68-83`).
- ❌ Lado cliente (conductor): **no hay retry ni cola local**. El envío de GPS traga el error sin reintentar (`app-conductor/src/App.tsx:118`, `.catch(() => {})`) y el cambio de estado solo hace `console.error` sin reintento ni rollback del reloj (`:85`). No existe buffer de eventos pendientes (el único uso de `localStorage` es persistir el auth). No hay detección de 5xx para reintento.

---

## S5: Arquitectura

#### 3.1 Arquitectura de microservicios (SRP)
**Estado:** ✅ Cumple

- Responsabilidad única por servicio:
  - **usuarios-service**: solo auth/perfiles (`usuarios.routes.ts`: registro, login, /me, boarding-token).
  - **rutas-service**: solo catálogo rutas/paradas/buses/historial (`rutas-service/src/index.ts`).
  - **despachos-service**: solo ciclo de vida del viaje y eventos en vivo (`services/despachos.service.ts`).
  - **websocket-server**: solo distribución de eventos a clientes (`index.ts` + `rabbitmq-consumer.ts`).
- Cada uno es desplegable de forma independiente (Dockerfile propio).

#### 3.2 API Gateway como punto de entrada único
**Estado:** ✅ Cumple

- Todas las peticiones REST del frontend pasan por el Gateway (`nginx` enruta `/api/` → `api-gateway`).
- Middleware de autenticación JWT + RBAC antes del proxy: `packages/api-gateway/src/index.ts:48`
  ```ts
  app.use('/api/v1', authenticateJwt, authorizeByRole, createGatewayProxy());
  ```
- Proxy reverso a servicios internos vía `http-proxy-middleware` (`proxy.ts:21-52`).
- ⚠️ Excepción: el canal WebSocket va directo nginx → websocket-server, fuera del Gateway (ver S2/Transparencia y Hallazgos).

#### 3.3 Persistencia políglota
**Estado:** ✅ Cumple

- **PostgreSQL** para datos transaccionales: `usuarios`, `rutas`, `paradas`, `buses`, `viajes`, `abordajes`, `eventos_bus` (`migrations/001_initial_schema.sql`).
- **Redis** para datos efímeros: estado/aforo/GPS del bus y alertas (`REDIS_KEYS` en `packages/shared/src/constants/redis-keys.ts`; escritura en `despachos.service.ts:73-87`).
- Separación clara: el registro histórico del viaje se persiste en PG al finalizar (`despachos.service.ts:416-419`) mientras el estado vivo se limpia de Redis (`:422-427`).

#### 3.4 Broker de mensajería
**Estado:** ✅ Cumple

- RabbitMQ desacopla productor (despachos) de consumidor (websocket).
- Exchange **topic** durable: `packages/shared/src/constants/rabbitmq.ts:1-6` (`EXCHANGE_TYPE: 'topic'`).
- Routing keys con patrón consistente `bus.{busId}.{eventType}`:
  ```ts
  // packages/shared/src/constants/rabbitmq.ts:8-13
  statusChange: (busId) => `bus.${busId}.status_change`,
  gpsUpdate:    (busId) => `bus.${busId}.gps_update`, ...
  ```
- Binding `bus.#` en el consumer (`rabbitmq-consumer.ts:52-56`).

---

## S7: Servicio de Nombres

#### 4.1 Tabla de enrutamiento estática
**Estado:** ✅ Cumple

- `packages/shared/src/constants/service-registry.ts` mapea nombre lógico → dirección física, con override por variable de entorno:
  ```ts
  export const SERVICE_REGISTRY = {
    'usuarios-service': process.env.USUARIOS_SERVICE_URL || 'http://usuarios-service:3001',
    'rutas-service':    process.env.RUTAS_SERVICE_URL   || 'http://rutas-service:3002',
    'despachos-service':process.env.DESPACHOS_SERVICE_URL|| 'http://despachos-service:3004',
  };
  ```
- El Gateway intercepta y traduce con esta tabla (`proxy.ts:7-19,38`).

#### 4.2 Transparencia de ubicación
**Estado:** ✅ Cumple

- El frontend nunca accede a `http://rutas-service:3002`; solo usa rutas relativas contra nginx. Los nombres de contenedor siguen `uniroute-[dominio]-service` (docker-compose) y las direcciones internas usan hostnames de la red compose.

#### 4.3 Nomenclatura de endpoints REST
**Estado:** ⚠️ Parcial

- ✅ Recursos en plural bajo `/api/v1/[recurso]`: `rutas`, `buses`, `paradas`, `viajes`, `usuarios`.
- ⚠️ Los endpoints de despachos son orientados a acción (RPC sobre HTTP), no recursos REST puros: `/api/v1/despachos/estado`, `/gps`, `/viaje/iniciar`, `/viaje/finalizar` (`despachos.routes.ts:16-23`). Es razonable dada la naturaleza de comandos/eventos, pero conviene documentarlo como excepción consciente al estilo REST.

#### 4.4 Extensibilidad
**Estado:** ✅ Cumple

- Agregar `uniroute-billetera-service` requeriría solo: (1) una entrada en `SERVICE_REGISTRY`, (2) un prefijo en `API_ROUTES`, (3) reglas en `permissionRules` de `rbac.ts`. No hay direcciones hardcodeadas en el frontend.

---

## S8: Coordinación de Procesos

#### 5.1 NTP — Sincronización de relojes físicos
**Estado:** ⚠️ Parcial

- ⚠️ No hay configuración NTP explícita en `docker-compose.yml` ni en los Dockerfiles; los contenedores heredan el reloj del host Docker (comportamiento por defecto, no documentado).
- ✅ Los timestamps de PostgreSQL usan **TIMESTAMPTZ** (con timezone): `migrations/001_initial_schema.sql:14,53,75` (`created_at TIMESTAMPTZ`, `inicio_at TIMESTAMPTZ`, `eventos_bus.created_at TIMESTAMPTZ`).
- ✅ Los timestamps se generan **server-side**, no se confía en el cliente: `despachos.service.ts` usa `new Date().toISOString()` para `timestamp` de cada `BusEvent` (`:152,179,213`).

#### 5.2 Relojes de Lamport — Implementación completa
**Estado:** ✅ Cumple (las 3 reglas + persistencia)

- **Módulo dedicado:** `packages/despachos-service/src/services/lamport.ts` (`LamportQueueManager`).
- **Regla 1 — incremento local antes de emitir (cliente conductor):**
  ```ts
  // packages/app-conductor/src/App.tsx:72-73
  const nuevoReloj = lamportClock + 1;
  setLamportClock(nuevoReloj);
  ```
- **Regla 2 — el reloj viaja en el payload JSON del POST:**
  ```ts
  // packages/app-conductor/src/App.tsx:77
  body: JSON.stringify({ busId, status: nuevoEstado, lamportClock: nuevoReloj })
  ```
  Validado por schema: `despachos-service/src/schemas.ts:8-12` (`lamportClock: z.number().int().min(0)`).
- **Regla 3 — recepción en servidor `L_srv = max(L_srv, L_msg) + 1`:**
  ```ts
  // packages/despachos-service/src/services/despachos.service.ts:114
  const serverLamportClock = Math.max(currentServerClock, incomingClock) + 1;
  ```
- **Almacenado en Redis** (campo `lamportClock` en hash `bus:{id}:status`): `despachos.service.ts:118-122`.
- **Persistido en PostgreSQL** (`eventos_bus.lamport_clock`): `despachos.service.ts:131-142` + esquema `migrations/001_initial_schema.sql:74`.

#### 5.3 Reordenamiento causal de eventos
**Estado:** ✅ Cumple

- Detecta salto en la secuencia (evento "del futuro") y lo retiene en cola temporal ordenada:
  ```ts
  // packages/despachos-service/src/services/lamport.ts:11-13,20-36
  const expected = this.lastSeenClock[busId] + 1;
  if (incomingClock <= expected) { ...procesar ya... }
  // futuro -> espera en cola
  return new Promise((resolve) => { ... this.queues[busId].push(...); ...sort ascendente });
  ```
- **Timeout de 5s** tras el cual se procesa igualmente: `lamport.ts:25-31` (`setTimeout(() => { ... resolve(); }, 5000)`).
- Si el evento faltante llega dentro del timeout, se procesa en orden correcto y libera a los siguientes: `processNext()` (`lamport.ts:48-70`, recursivo).
- Integrado en el flujo: `despachos.service.ts:105` (`await lamportQueue.waitForTurn(busId, incomingClock)`) y `:203` (`notifyProcessed`).
- ⚠️ Nota de escalabilidad (ya mencionada): la cola es in-memory por instancia.

#### 5.4 Retry-pattern ante fallas de omisión
**Estado:** ❌ No cumple

- La app del conductor **no** retiene eventos localmente cuando no puede enviarlos, **no** los reenvía al recuperar conexión, y por tanto no preserva el `lamportClock` original de un evento fallido. No hay cola, `localStorage` de eventos pendientes ni `event buffer`: el único `localStorage` es para el auth (`app-conductor/src/App.tsx:10,45,50`), y los `fetch` fallidos se descartan (`:85,118`).
- Este es el requisito técnico más importante que falta para la rúbrica de coordinación. Ver Hallazgos Críticos.

---

## S10/S11: Contenedores y Docker

#### 6.1 Docker Compose
**Estado:** ✅ Cumple (con 2 matices)

- ✅ Todos los servicios definidos como contenedores separados (`docker-compose.yml`, 12 servicios).
- ✅ Red interna bridge: `docker-compose.yml:177-179` (`uniroute-network: driver: bridge`).
- ⚠️ `expose` vs `ports`: los servicios Node **internos** usan `expose` correctamente (usuarios `:37`, rutas `:53`, despachos `:69`), pero **postgres, redis y rabbitmq exponen puertos al host** (`5432`, `6379`, `5672`, `15672`) — cómodo para desarrollo, pero rompe la premisa de que "solo los servicios públicos exponen puertos".
- ⚠️ Volúmenes: existe `postgres_data` (`docker-compose.yml:124-125,174-175`), pero **Redis no tiene volumen** (estado efímero por diseño; señalar si se requiere durabilidad).
- ✅ Healthchecks configurados en infra y en los 5 servicios Node (con `wget` en node:20-alpine).

#### 6.2 Dockerfiles
**Estado:** ⚠️ Parcial

- ✅ Cada servicio backend tiene su Dockerfile propio; usan `node:20-alpine`.
- ✅ Backend copia solo lo necesario, no el monorepo completo:
  ```dockerfile
  # packages/despachos-service/Dockerfile:3-8
  COPY package.json tsconfig.base.json ./
  COPY packages/shared/package.json ./packages/shared/
  COPY packages/despachos-service/package.json ./packages/despachos-service/
  RUN npm install --workspace=packages/despachos-service --workspace=packages/shared
  ```
- ⚠️ **Sin multi-stage build** y **sin `.dockerignore`** (no existe en el repo salvo dentro de `node_modules`). Las imágenes incluyen `devDependencies` y artefactos de build.
- ⚠️ Los frontends corren `npm run dev` (servidor Vite de desarrollo) dentro del contenedor en lugar de un build de producción servido estáticamente: `packages/app-estudiante/Dockerfile:7` (`CMD ["npm", "run", "dev"]`).

#### 6.3 Aislamiento
**Estado:** ✅ Cumple

- Los servicios internos `usuarios-service`, `rutas-service`, `despachos-service` usan solo `expose` → no accesibles desde fuera de la red Docker.
- `nginx`, `api-gateway` y `websocket-server` sí mapean puertos al host (entrada pública intencional).

#### 6.4 Variables de entorno
**Estado:** ✅ Cumple

- Credenciales por variables de entorno, no hardcodeadas: `docker-compose.yml:22-24,38-41,71-75` (`JWT_SECRET`, `DATABASE_URL`, `RABBITMQ_URL`, etc.).
- Existe `.env.example` con todas las claves (`.env.example:1-12`).
- `.env` está en `.gitignore` (`.gitignore:3`).

---

## Resumen General

| Sección | Requisitos totales | ✅ Cumple | ⚠️ Parcial | ❌ No cumple |
|---------|-------------------|-----------|------------|-------------|
| S2 — Características de Sistemas Distribuidos | 11 | 9 | 2 | 0 |
| S3 — Comunicación | 5 | 3 | 1 | 1 |
| S5 — Arquitectura | 4 | 4 | 0 | 0 |
| S7 — Servicio de Nombres | 5 | 4 | 1 | 0 |
| S8 — Coordinación de Procesos | 8 | 6 | 1 | 1 |
| S10/S11 — Contenedores y Docker | 12 | 9 | 3 | 0 |
| **TOTAL** | **45** | **35** | **8** | **2** |

**Nivel de cumplimiento global:** ~78% pleno (✅), ~18% parcial (⚠️), ~4% no cumplido (❌).

---

## Hallazgos Críticos (deben arreglarse para la rúbrica)

1. **❌ Falta el retry-pattern / retención local de eventos en la app del conductor (S3.4, S5.4/S8 — fallas de omisión).**
   Es el requisito técnico más señalado por la rúbrica de coordinación y hoy no existe. Cuando el conductor pierde red, los eventos (cambio de estado, GPS) se descartan silenciosamente (`app-conductor/src/App.tsx:85,118`) y no se reintentan preservando su `lamportClock` original.
   *Fix sugerido:* mantener un buffer en `localStorage`/memoria de eventos pendientes con su `lamportClock` de generación, con reintento al recuperar conexión (`navigator.onLine` / retry con backoff) antes de emitir nuevos.

2. **❌ No hay TLS/HTTPS/WSS (S3.2).**
   nginx solo escucha en `:80` sin certificados (`nginx/nginx.conf:30`); los WebSockets son WS, no WSS. Aceptable en desarrollo, pero es un ítem nombrado por la rúbrica.
   *Fix sugerido:* añadir un `server { listen 443 ssl; ... }` con certificado (self-signed para la defensa) y redirección 80→443; los frontends heredan WSS automáticamente al estar en el mismo origen.

---

## Recomendaciones (no rotas, pero mejorables para la presentación)

- **Autenticar el canal WebSocket.** El tráfico `/socket.io/` va directo nginx → websocket-server sin pasar por el Gateway (`nginx/nginx.conf:40-47`), por lo que las suscripciones a rooms no validan JWT. Añadir un handshake con token (`io(..., { auth: { token } })` + verificación en `io.use(...)`).
- **Escalabilidad horizontal real.** La cola de Lamport (`lamport.ts`) y los rooms de Socket.io son in-memory por instancia. Para replicar despachos/websocket, mover el estado de Lamport a Redis (o particionar el consumer por `busId`) y usar el adapter Redis de Socket.io.
- **Persistencia de Redis.** Añadir un volumen a Redis si se desea que el estado en vivo sobreviva a reinicios (hoy es efímero por diseño).
- **Buenas prácticas de Docker.** Introducir `.dockerignore` (excluir `node_modules`, `dist`, `.git`), usar multi-stage build en los backends (etapa builder + etapa runtime con solo `dependencies` + `dist`), y servir los frontends con un build de producción (`vite build` + nginx/serve estático) en lugar de `npm run dev`.
- **Corrección menor de código.** En `despachos.service.ts:42` se lanza `"El bus ya tiene un viaje activo"` pero el controller compara contra `"Bus ya tiene viaje activo"` (`despachos.controller.ts:24`); al no coincidir, el caso cae a `500` en lugar de `400`. Unificar el mensaje o usar un código de error tipado.
- **Nomenclatura REST de despachos.** Documentar explícitamente que los endpoints de despachos son comandos (RPC sobre HTTP) y no recursos REST, o migrarlos a un estilo de recurso (`POST /api/v1/buses/{id}/status`) si se busca coherencia total con S7.
- **NTP explícito.** Documentar/verificar la herencia del reloj del host o añadir sincronización explícita, para dejar constancia de la sincronización de relojes físicos (S8.1).

---

*Informe generado a partir de la lectura directa del código fuente y verificación en vivo del stack (flujo de eventos en tiempo real ejercitado de punta a punta a través de nginx → api-gateway → despachos-service → RabbitMQ → websocket-server → Socket.io).*
