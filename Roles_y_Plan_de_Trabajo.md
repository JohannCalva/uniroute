# UniRoute — Roles, Responsabilidades y Plan de Ejecución

## Índice

1. Visión general del equipo
2. Fase 0: Trabajo colaborativo obligatorio (Semana 1)
3. Rol 1: Frontend y Experiencia de Usuario
4. Rol 2: Gateway y Seguridad
5. Rol 3: Motor de Despachos
6. Rol 4: Catálogo y Persistencia
7. Rol 5: DevOps, Infraestructura y Tiempo Real
8. Mapa de dependencias entre tareas
9. Cronograma visual por fases

---

## 1. Visión general del equipo

El proyecto UniRoute se divide en cinco roles. Cada rol es dueño de uno o más contenedores Docker y de una porción específica del monorepo. La regla fundamental es: **si tu código compila contra las interfaces de `packages/shared`, tu trabajo encajará con el de los demás.** Esa es la red de seguridad contra los problemas de integración.

### Estructura del monorepo

```
uniroute/
├── docker-compose.yml              ← Rol 5
├── .env.example                    ← Rol 5
├── packages/
│   ├── shared/                     ← Rol 5 mantiene, todos contribuyen
│   │   ├── src/
│   │   │   ├── types/              ← Interfaces TypeScript compartidas
│   │   │   ├── constants/          ← Enums, estados, routing keys
│   │   │   ├── utils/              ← Funciones compartidas (QR token)
│   │   │   └── mocks/             ← Datos de prueba tipados
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── app-estudiante/             ← Rol 1
│   ├── app-conductor/              ← Rol 1
│   ├── dashboard-admin/            ← Rol 1
│   ├── api-gateway/                ← Rol 2
│   ├── usuarios-service/           ← Rol 2
│   ├── despachos-service/          ← Rol 3
│   ├── rutas-service/              ← Rol 4
│   └── websocket-server/           ← Rol 5
└── nginx/
    └── nginx.conf                  ← Rol 5
```

### Regla de oro

Cada integrante SOLO modifica archivos dentro de sus carpetas asignadas. La única carpeta que todos tocan es `packages/shared`, y los cambios ahí se hacen mediante pull request revisado por al menos otro integrante.

---

## 2. Fase 0: Trabajo colaborativo obligatorio (Semana 1)

**Antes de que nadie escriba lógica de negocio, todo el equipo debe producir estos entregables juntos.** Esta fase elimina el 80% de los problemas de integración futuros.

### Entregable 1: Interfaces TypeScript en `packages/shared`

Todos los cinco integrantes se reúnen y definen en código las estructuras de datos que cruzan fronteras entre servicios. Esto incluye:

- Tipos de usuario (`Student`, `Driver`, `Admin`) con sus campos exactos.
- Tipos de ruta (`Route`, `Stop`, `Bus`) con todos los atributos.
- Tipos de eventos del bus (`BusEvent`, `StatusChangePayload`, `GpsUpdatePayload`, `AforoUpdatePayload`).
- Tipos de respuesta de cada endpoint REST (lo que retorna cada API).
- Enums de estados (`BusStatus.DEPARTING`, `BusStatus.FULL`, etc.).
- Constantes de RabbitMQ (nombre del exchange, formato de routing keys).
- Constantes de Redis (funciones generadoras de keys).
- Funciones compartidas de QR (`generateBoardingToken`, `verifyBoardingToken`).
- Datos mock tipados para que el frontend trabaje sin backend.

**Responsable de mantenimiento posterior:** Rol 5.
**Quién contribuye:** Todos.

### Entregable 2: Esquema de base de datos

Rol 4 presenta el diagrama entidad-relación de PostgreSQL y la estructura de keys de Redis. Los cinco lo revisan y validan:

- Rol 2 confirma que la tabla `usuarios` cubre auth, roles y correo @udla.edu.ec.
- Rol 3 confirma que las tablas `viajes`, `abordajes` y la estructura Redis cubren aforo, GPS y Lamport.
- Rol 4 incorpora las correcciones y publica las migraciones SQL en su carpeta del monorepo.

### Entregable 3: Contrato de endpoints REST

Cada rol backend (2, 3, 4) lista los endpoints que su servicio expone. Como mínimo, para cada endpoint: el path, el método HTTP, el body del request y el body del response (referenciando los tipos de shared). Esto puede ser un archivo markdown o directamente las interfaces TypeScript ya escritas.

### Entregable 4: Infraestructura base funcionando

Rol 5 entrega el `docker-compose.yml` con los doce contenedores arrancando (9 backend/infra + 3 frontends; aunque los servicios Node.js solo tengan un endpoint `/health` que responda `200 OK`). Todo el equipo hace `docker compose up` y verifica que levanta.

---

## 3. Rol 1: Frontend y Experiencia de Usuario

### Persona asignada
*(Asignar nombre)*

### Dominio de acción
Contenedor `nginx-frontend` y las tres aplicaciones cliente dentro del monorepo.

### Tecnologías y herramientas

| Categoría | Herramienta | Propósito |
|-----------|-------------|-----------|
| Framework | React 18+ | Componentes de interfaz |
| Bundler | Vite 5+ | Build y dev server con HMR |
| Lenguaje | TypeScript (strict mode) | Tipado estático |
| Estilos | SCSS con BEM o Tailwind CSS | Diseño responsivo |
| Mapas | Leaflet + react-leaflet | Mapa interactivo del bus |
| WebSockets | socket.io-client | Recepción de eventos push |
| Escáner QR | html5-qrcode | Cámara del conductor para escanear |
| QR Display | qrcode.react | Mostrar QR del estudiante |
| HTTP Client | fetch nativo o axios | Peticiones REST al Gateway |
| PWA | vite-plugin-pwa | Service Worker, manifest, offline |
| Testing | Vitest + Testing Library | Tests unitarios de componentes |

### Tareas detalladas

#### T1.1 — Configurar el workspace de las tres apps
Crear las tres carpetas (`app-estudiante`, `app-conductor`, `dashboard-admin`) con Vite + React + TypeScript. Configurar el workspace del monorepo para que las tres importen de `packages/shared`. Configurar los alias de TypeScript.
- **Depende de:** Nada. Puede empezar de inmediato.
- **Bloquea a:** Nadie directamente, pero las demás tareas del Rol 1 dependen de esto.

#### T1.2 — App Estudiante: pantalla de selección de ruta
Selector de origen y destino (dropdowns), botón de búsqueda, lista de rutas disponibles con ETA y estado. Consume el endpoint `GET /api/v1/rutas` (usar mock hasta que Rol 4 lo tenga listo).
- **Depende de:** T1.1 + interfaces de `Ruta` y `Parada` en shared (Fase 0).
- **Puede hacerse en paralelo con:** Todo el backend.

#### T1.3 — App Estudiante: mapa en vivo con Leaflet
Mapa interactivo mostrando la posición del bus como marcador en movimiento. Se suscribe al room de Socket.io de la ruta seleccionada para recibir actualizaciones de GPS.
- **Depende de:** T1.2 + interfaz `GpsUpdatePayload` en shared.
- **Para probar sin backend:** Usar un script que emita coordenadas falsas por Socket.io cada 2 segundos.

#### T1.4 — App Estudiante: pantalla de QR de abordaje
Muestra el código QR del estudiante autenticado. El QR contiene el token JWT de abordaje generado por usuarios-service. Se regenera cada vez que el estudiante abre la pantalla.
- **Depende de:** T1.1 + endpoint `GET /api/v1/usuarios/me/boarding-token` (Rol 2).
- **Puede trabajar con mock:** Generar un JWT hardcoded localmente.

#### T1.5 — App Estudiante: botón "Estoy llegando"
Captura la posición GPS del estudiante mediante la Geolocation API del navegador. Envía `POST /api/v1/despachos/proximidad` con lat/lng y el ID de la ruta. Muestra confirmación visual.
- **Depende de:** T1.2 + interfaz `ProximityAlert` en shared.

#### T1.6 — App Estudiante: notificaciones push
Recibir eventos del servidor WebSocket y mostrarlos como banners en la interfaz: "¡El bus sale en 5 minutos!", "BUS LLENO", etc. Implementar el Service Worker para notificaciones en segundo plano (Android).
- **Depende de:** T1.3 + interfaz `BusEvent` en shared.

#### T1.7 — App Conductor: panel de estados
Interfaz con botones grandes ("Saliendo en 5 min", "Bus Lleno", "En Parada", "Llegada"). Cada pulsación envía `POST /api/v1/despachos/estado`. Mostrar feedback visual (spinner → check verde).
- **Depende de:** T1.1 + interfaz `StatusChangePayload` en shared.

#### T1.8 — App Conductor: modo escáner QR
Pantalla con acceso a la cámara para escanear QR de estudiantes. Al escanear, envía el token a `POST /api/v1/despachos/abordaje`. Muestra confirmación ("Estudiante registrado - 29/45") o error ("QR inválido").
- **Depende de:** T1.1 + librería html5-qrcode + interfaz `BoardingResponse` en shared.

#### T1.9 — App Conductor: recepción de alertas "Estoy llegando"
Mostrar un contador no intrusivo: "3 estudiantes acercándose — el más lejano a 2 min". Se suscribe a un evento Socket.io específico del canal del conductor.
- **Depende de:** T1.7 + interfaz `ProximityAggregation` en shared.

#### T1.10 — App Conductor: transmisión GPS continua
Usar la Geolocation API con `watchPosition()` para enviar coordenadas periódicamente a `POST /api/v1/despachos/gps`. Implementar Wake Lock API para mantener la pantalla activa.
- **Depende de:** T1.7 + interfaz `GpsUpdatePayload`.

#### T1.11 — Dashboard Admin: mapa general de flota
Mapa Leaflet con todos los buses activos como marcadores. Tabla lateral con estado, ruta asignada y aforo de cada unidad. Consume WebSocket para actualizaciones en vivo.
- **Depende de:** T1.1 + interfaces de `Bus` y `BusEvent` en shared.

#### T1.12 — Dashboard Admin: historial y analíticas
Tabla con historial de viajes (fecha, ruta, duración, pasajeros). Consume `GET /api/v1/rutas/viajes/historial`.
- **Depende de:** Endpoint real de Rol 4. Se puede dejar para el final.

#### T1.13 — Configuración Nginx
Escribir el `nginx.conf` que sirva las tres PWAs bajo rutas distintas (`/estudiante`, `/conductor`, `/admin`) y haga proxy reverso a los servicios expuestos.
- **Depende de:** T1.1. Puede coordinarse con Rol 5 que maneja la infraestructura Docker.

### Archivos que este rol modifica
- `packages/app-estudiante/**`
- `packages/app-conductor/**`
- `packages/dashboard-admin/**`
- `nginx/nginx.conf`

---

## 4. Rol 2: Gateway y Seguridad

### Persona asignada
*(Asignar nombre)*

### Dominio de acción
Contenedores `api-gateway` y `usuarios-service`.

### Tecnologías y herramientas

| Categoría | Herramienta | Propósito |
|-----------|-------------|-----------|
| Runtime | Node.js 20+ | Ejecución del servidor |
| Framework | Express 4 | Routing y middleware |
| Lenguaje | TypeScript (strict mode) | Tipado estático |
| Auth | jsonwebtoken (JWT) | Generación y verificación de tokens |
| Hashing | bcrypt | Hash de contraseñas |
| QR Token | Función HMAC-SHA256 en shared | Firma de tokens de abordaje |
| Seguridad HTTP | helmet | Headers de seguridad |
| CORS | cors | Control de orígenes |
| Rate Limiting | express-rate-limit | Protección contra abuso |
| HTTP Proxy | http-proxy-middleware | Reenvío al clúster interno |
| BD Client | pg (node-postgres) | Conexión a PostgreSQL |
| Validación | zod o joi | Validación de inputs |
| Testing | Vitest + supertest | Tests de endpoints |

### Tareas detalladas

#### T2.1 — Configurar el workspace del API Gateway
Crear `packages/api-gateway` con Express + TypeScript. Configurar el middleware base: helmet, cors, express-rate-limit, morgan (logging). El Gateway arranca y responde `/health` con 200.
- **Depende de:** Nada. Puede empezar de inmediato.

#### T2.2 — Implementar la tabla de nombres y proxy reverso
Programar el enrutamiento del Gateway usando la constante `SERVICE_REGISTRY` de shared. Toda petición a `/api/v1/usuarios/**` se redirige a `http://usuarios-service:3001`, `/api/v1/rutas/**` a `http://rutas-service:3002`, `/api/v1/despachos/**` a `http://despachos-service:3004`.
- **Depende de:** T2.1 + constante `SERVICE_REGISTRY` definida en Fase 0.
- **Bloquea a:** Roles 1, 3 y 4 no pueden probar sus servicios a través del Gateway hasta que esto esté listo (pero pueden probar directo a sus puertos internos).

#### T2.3 — Middleware de autenticación JWT
Interceptar todas las peticiones (excepto `POST /api/v1/usuarios/registro` y `POST /api/v1/usuarios/login`). Verificar el header `Authorization: Bearer <token>`. Decodificar el JWT. Inyectar el objeto `user` (id, role) en el request. Rechazar con 401 si no hay token o es inválido. Rechazar con 403 si el rol no tiene permiso para ese endpoint.
- **Depende de:** T2.1.
- **Bloquea a:** Rol 1 necesita esto para probar flujos autenticados (pero puede trabajar con mocks mientras tanto).

#### T2.4 — Configurar el workspace de Usuarios Service
Crear `packages/usuarios-service` con Express + TypeScript. Configurar conexión a PostgreSQL usando el cliente `pg`. El servicio arranca y responde `/health` con 200.
- **Depende de:** Nada. Puede empezar en paralelo con T2.1.

#### T2.5 — Endpoint de registro de usuario
`POST /api/v1/usuarios/registro` recibe email, password, nombre y rol. Valida que el email termine en `@udla.edu.ec`. Hashea la contraseña con bcrypt. Inserta en la tabla `usuarios` de PostgreSQL. Retorna el usuario creado (sin el hash).
- **Depende de:** T2.4 + tabla `usuarios` en PostgreSQL (Rol 4 debe tener las migraciones listas).
- **Si Rol 4 no ha terminado la migración:** Crear una tabla temporal localmente para desarrollo.

#### T2.6 — Endpoint de login
`POST /api/v1/usuarios/login` recibe email y password. Busca el usuario en PostgreSQL. Compara el hash con bcrypt. Si es correcto, genera un JWT con el id, email y rol del usuario. Retorna el token con un tiempo de expiración de 24 horas.
- **Depende de:** T2.5.

#### T2.7 — Endpoint de perfil y token de abordaje
`GET /api/v1/usuarios/me` retorna el perfil del usuario autenticado. `GET /api/v1/usuarios/me/boarding-token` genera un token de abordaje firmado con HMAC-SHA256 usando la función `generateBoardingToken()` de shared, y lo retorna como string para que el frontend lo convierta en QR.
- **Depende de:** T2.6 + función `generateBoardingToken` en shared (Fase 0).
- **Bloquea a:** Rol 1 (T1.4) necesita este endpoint para mostrar el QR. Rol 3 necesita que el token sea compatible con `verifyBoardingToken`.

#### T2.8 — Control de roles (RBAC)
Middleware que verifica que el usuario autenticado tenga el rol correcto para cada endpoint. Ejemplo: solo `DRIVER` puede acceder a `POST /api/v1/despachos/estado`, solo `STUDENT` puede acceder a `POST /api/v1/despachos/proximidad`.
- **Depende de:** T2.3.

### Archivos que este rol modifica
- `packages/api-gateway/**`
- `packages/usuarios-service/**`

### Variable de entorno compartida
Este rol CONSUME la variable `QR_HMAC_SECRET` que Rol 5 define en `.env`. La usa para firmar los tokens de abordaje. Rol 3 usa la misma variable para verificarlos. Nunca hardcodear la clave.

---

## 5. Rol 3: Motor de Despachos

### Persona asignada
*(Asignar nombre)*

### Dominio de acción
Contenedor `despachos-service`.

### Tecnologías y herramientas

| Categoría | Herramienta | Propósito |
|-----------|-------------|-----------|
| Runtime | Node.js 20+ | Ejecución del servidor |
| Framework | Express 4 | Routing y middleware |
| Lenguaje | TypeScript (strict mode) | Tipado estático |
| Message Broker | amqplib | Cliente AMQP para publicar en RabbitMQ |
| Redis | ioredis | Lectura/escritura de estado efímero |
| BD Client | pg (node-postgres) | Persistencia de historial en PostgreSQL |
| QR Verify | Función HMAC-SHA256 en shared | Verificación de tokens de abordaje |
| Geolocalización | Fórmula de Haversine (manual) | Cálculo de distancia para proximidad |
| Validación | zod o joi | Validación de inputs |
| Testing | Vitest + supertest | Tests unitarios y de integración |

### Tareas detalladas

#### T3.1 — Configurar el workspace de Despachos Service
Crear `packages/despachos-service` con Express + TypeScript. Configurar conexiones a PostgreSQL, Redis y RabbitMQ. El servicio arranca y responde `/health` con 200.
- **Depende de:** Nada para la estructura base. Las conexiones reales dependen de que Rol 5 tenga Docker funcionando.
- **Sin Docker:** Puede usar instancias locales o mockear las conexiones.

#### T3.2 — Conexión al exchange de RabbitMQ
Al arrancar, el servicio se conecta a RabbitMQ y declara el exchange `bus.events` de tipo `topic`. Implementar una función `publishEvent(routingKey, payload)` reutilizable que serialice el objeto `BusEvent` de shared y lo publique.
- **Depende de:** T3.1 + RabbitMQ funcionando (Rol 5) + interfaz `BusEvent` en shared.
- **Bloquea a:** Rol 5 (T5.9) necesita que los eventos se publiquen para que el WS Server los consuma.
- **Puede probar solo:** Publicar eventos manualmente desde el panel admin de RabbitMQ (puerto 15672) o con un script de prueba.

#### T3.3 — Endpoint de cambio de estado del bus
`POST /api/v1/despachos/estado` recibe `{ busId, status, lamportClock }` desde la app del conductor. Aplica la regla de Lamport: `L_srv = max(L_srv, L_msg) + 1`. Actualiza el hash Redis `bus:{busId}:status` con el nuevo estado y el reloj. Persiste en PostgreSQL (tabla `eventos_bus`). Publica el evento en RabbitMQ con routing key `bus.{busId}.status_change`.
- **Depende de:** T3.2 + estructura Redis (Rol 4) + tabla `eventos_bus` (Rol 4).
- **Bloquea a:** Rol 1 (T1.7) necesita este endpoint para los botones del conductor.

#### T3.4 — Reordenamiento causal de eventos desordenados
Implementar la lógica que detecta cuando un evento llega con un reloj de Lamport mayor al esperado (indicando que faltan eventos intermedios). El servicio retiene el evento en una cola temporal en memoria y espera al evento faltante. Si no llega en un timeout configurable (5 segundos), procesa igualmente para no bloquear el sistema.
- **Depende de:** T3.3.

#### T3.5 — Endpoint de recepción GPS
`POST /api/v1/despachos/gps` recibe `{ busId, latitude, longitude }` desde la app del conductor (ver `GpsUpdateRequest` en shared — el timestamp lo genera el servidor al procesar, no viaja en el request). Actualiza el hash Redis `bus:{busId}:status` con las nuevas coordenadas. Publica el evento en RabbitMQ con routing key `bus.{busId}.gps_update`. No persiste en PostgreSQL (dato efímero, alta frecuencia).
- **Depende de:** T3.2 + estructura Redis (Rol 4).

#### T3.6 — Endpoint de abordaje QR
`POST /api/v1/despachos/abordaje` recibe `{ busId, boardingToken }` desde la app del conductor (que escaneó el QR del estudiante). Verifica el token usando la función `verifyBoardingToken()` de shared. Si es válido, incrementa el contador de aforo en Redis (`INCR bus:{busId}:aforo`). Registra el abordaje en PostgreSQL (tabla `abordajes`). Publica evento con routing key `bus.{busId}.aforo_update`. Retorna `{ valid: true, studentName, currentAforo, maxCapacity }`.
- **Depende de:** T3.2 + función `verifyBoardingToken` en shared (Fase 0) + tabla `abordajes` (Rol 4) + variable `QR_HMAC_SECRET`.
- **Bloquea a:** Rol 1 (T1.8) necesita este endpoint para el escáner.

#### T3.7 — Reset de aforo al finalizar viaje
Cuando el conductor emite el estado `ARRIVED`, el servicio resetea el contador de aforo de ese bus en Redis a 0. Persiste el total de pasajeros del viaje en la tabla `viajes` de PostgreSQL. Limpia las alertas de proximidad activas de esa ruta en Redis.
- **Depende de:** T3.3 + T3.6.

#### T3.8 — Endpoint de alerta "Estoy llegando"
`POST /api/v1/despachos/proximidad` recibe `{ rutaId, latitude, longitude }` desde la app del estudiante (ver `ProximityRequest` en shared). Calcula la distancia a la parada más cercana usando la fórmula de Haversine (la función puede vivir en shared o en despachos-service). Aplica el factor de corrección de 1.3. Calcula el ETA asumiendo 5 km/h. Almacena en Redis como sorted set `ruta:{rutaId}:esperando` con el ETA como score. Publica un evento agregado con routing key `bus.{busId}.proximity_update` que incluye el conteo total de estudiantes esperando y el ETA del más lejano.
- **Depende de:** T3.2 + estructura Redis (Rol 4).
- **Bloquea a:** Rol 1 (T1.5 y T1.9).

#### T3.9 — Override manual de "Bus Lleno"
Si el conductor emite el estado `FULL`, el servicio establece el aforo al máximo en Redis (ignora el contador incremental del QR). Publica el evento con routing key `bus.{busId}.aforo_update` indicando capacidad completa.
- **Depende de:** T3.3 + T3.6.

### Archivos que este rol modifica
- `packages/despachos-service/**`

### Variable de entorno que consume
- `QR_HMAC_SECRET` (para verificar tokens de abordaje, misma clave que Rol 2 usa para generarlos).
- `RABBITMQ_URL` (conexión al broker).
- `REDIS_URL` (conexión a Redis).
- `DATABASE_URL` (conexión a PostgreSQL).

---

## 6. Rol 4: Catálogo y Persistencia

### Persona asignada
*(Asignar nombre)*

### Dominio de acción
Contenedor `rutas-service`. Diseño del esquema PostgreSQL y las estructuras Redis.

### Tecnologías y herramientas

| Categoría | Herramienta | Propósito |
|-----------|-------------|-----------|
| Runtime | Node.js 20+ | Ejecución del servidor |
| Framework | Express 4 | Routing y middleware |
| Lenguaje | TypeScript (strict mode) | Tipado estático |
| ORM/Query Builder | Prisma o Knex.js | Migraciones y consultas SQL tipadas |
| BD Client | pg (node-postgres) | Conexión directa si no usa ORM |
| Redis | ioredis | Gestión de caché y estructuras efímeras |
| Seeding | Script SQL o Prisma seed | Datos iniciales de rutas y paradas |
| Testing | Vitest | Tests unitarios de queries |

### Tareas detalladas

#### T4.1 — Diseñar el esquema relacional de PostgreSQL
Producir el diagrama entidad-relación completo y las migraciones SQL. Las tablas mínimas son:

- `usuarios` (id UUID PK, email, password_hash, nombre, rol, created_at)
- `rutas` (id UUID PK, nombre, origen, destino, precio, activa, horario_inicio, horario_fin)
- `paradas` (id UUID PK, ruta_id FK, nombre, latitud, longitud, orden)
- `buses` (id UUID PK, placa, capacidad_maxima, ruta_asignada_id FK nullable)
- `viajes` (id UUID PK, bus_id FK, ruta_id FK, conductor_id FK, inicio_at, fin_at, pasajeros_total, estado)
- `abordajes` (id UUID PK, viaje_id FK, estudiante_id FK, timestamp)
- `eventos_bus` (id UUID PK, bus_id FK, tipo, payload JSONB, lamport_clock, timestamp)

- **Depende de:** Nada. Esta es la primera tarea crítica. Debe presentarse al equipo en la Fase 0.
- **Bloquea a:** Roles 2, 3 (necesitan las tablas para sus servicios). Esta tarea es la de mayor prioridad del proyecto.

#### T4.2 — Diseñar las estructuras de Redis
Documentar y exportar en shared las keys y tipos de dato Redis:

- `bus:{busId}:status` → Hash con campos: `status`, `lat`, `lng`, `lamportClock`, `lastUpdate`
- `bus:{busId}:aforo` → String (contador entero)
- `ruta:{rutaId}:esperando` → Sorted Set (score = ETA en segundos, member = studentId)
- `viaje:{viajeId}:activo` → String con el busId (para lookup inverso)

- **Depende de:** Nada. Puede hacerse en paralelo con T4.1.
- **Bloquea a:** Rol 3 (necesita saber las keys exactas para escribir en Redis).

#### T4.3 — Configurar el workspace de Rutas Service
Crear `packages/rutas-service` con Express + TypeScript. Configurar conexión a PostgreSQL (con Prisma o Knex). Configurar conexión a Redis (ioredis). El servicio arranca y responde `/health` con 200.
- **Depende de:** Nada.

#### T4.4 — Ejecutar migraciones automáticas al arrancar
Configurar el servicio (o un script separado) para que al hacer `docker compose up`, las migraciones SQL se ejecuten automáticamente y la base de datos quede en el estado correcto. Si usan Prisma: `prisma migrate deploy`. Si usan Knex: `knex migrate:latest`.
- **Depende de:** T4.1 + T4.3.
- **Bloquea a:** Todos los roles backend necesitan las tablas creadas para funcionar.

#### T4.5 — Seed de datos iniciales
Script que inserta datos de prueba: al menos 3 rutas reales de la UDLA (ej. Granados → UDLAPark, Granados → Colón, Colón → Norte), con sus paradas y coordenadas GPS reales, y al menos 5 buses asignados. También crear usuarios de prueba (1 admin, 2 conductores, 5 estudiantes).
- **Depende de:** T4.4.
- **Facilita a:** Rol 1 puede ver datos reales en las interfaces.

#### T4.6 — Endpoints CRUD de rutas
- `GET /api/v1/rutas` — Lista todas las rutas activas con sus paradas.
- `GET /api/v1/rutas/:id` — Detalle de una ruta con paradas ordenadas.
- `POST /api/v1/rutas` — Crear ruta (solo admin).
- `PUT /api/v1/rutas/:id` — Actualizar ruta (solo admin).
- `DELETE /api/v1/rutas/:id` — Desactivar ruta (solo admin).
- **Depende de:** T4.4.
- **Bloquea a:** Rol 1 (T1.2) necesita `GET /api/v1/rutas` para el selector de rutas.

#### T4.7 — Endpoints CRUD de buses
- `GET /api/v1/buses` — Lista todos los buses con su estado actual (consultando Redis).
- `GET /api/v1/buses/:id` — Detalle del bus con su ruta asignada.
- `POST /api/v1/buses` — Registrar bus (solo admin).
- `PUT /api/v1/buses/:id/asignar` — Asignar bus a una ruta (solo admin).
- **Depende de:** T4.4 + T4.2 (para leer estado de Redis).

#### T4.8 — Endpoints CRUD de paradas
- `GET /api/v1/rutas/:rutaId/paradas` — Paradas de una ruta en orden.
- `POST /api/v1/rutas/:rutaId/paradas` — Agregar parada (solo admin).
- `PUT /api/v1/paradas/:id` — Actualizar coordenadas o nombre.
- **Depende de:** T4.4.

#### T4.9 — Endpoint de historial de viajes
`GET /api/v1/viajes/historial` con filtros opcionales (fecha, ruta, bus). Consulta a PostgreSQL con paginación. Usado por el dashboard admin.
- **Depende de:** T4.4. Puede hacerse al final cuando las tablas tengan datos reales de viajes.

### Archivos que este rol modifica
- `packages/rutas-service/**`
- Archivos de migración SQL dentro de su carpeta de servicio.

---

## 7. Rol 5: DevOps, Infraestructura y Tiempo Real

### Persona asignada
*(Asignar nombre)*

### Dominio de acción
Máquina Virtual en Oracle Cloud, `docker-compose.yml`, red virtual, contenedor `websocket-server`, configuración de RabbitMQ y mantenimiento de `packages/shared`.

### Tecnologías y herramientas

| Categoría | Herramienta | Propósito |
|-----------|-------------|-----------|
| Contenedores | Docker + Docker Compose | Orquestación de los 12 servicios (9 backend/infra + 3 frontends) |
| Cloud | Oracle Cloud Free Tier | VM ARM Ampere A1 |
| SO | Ubuntu 24.04 | Sistema operativo de la VM |
| Proxy | Nginx | Proxy reverso y TLS termination |
| TLS | Let's Encrypt + certbot | Certificados SSL gratuitos |
| Runtime | Node.js 20+ | WebSocket server |
| WebSockets | socket.io (server) | Conexiones persistentes con clientes |
| Message Broker | RabbitMQ 3.13+ | Distribución de eventos |
| AMQP Client | amqplib | Consumir eventos desde RabbitMQ |
| Lenguaje | TypeScript (strict mode) | WebSocket server tipado |
| Monorepo | npm workspaces | Gestión del paquete shared |
| Firewall | iptables / Oracle Cloud Security Lists | Control de puertos |

### Tareas detalladas

#### T5.1 — Crear el docker-compose.yml
Definir los 12 servicios (9 backend/infra + 3 frontends) con sus imágenes base, puertos, variables de entorno, volúmenes y dependencias (`depends_on`). Definir la red `uniroute-network`. Crear el archivo `.env.example` con todas las variables necesarias (DATABASE_URL, REDIS_URL, RABBITMQ_URL, QR_HMAC_SECRET, JWT_SECRET, etc.).
- **Depende de:** Nada. Es la primera tarea crítica del Rol 5.
- **Bloquea a:** Todo el equipo necesita esto para levantar el entorno de desarrollo.

#### T5.2 — Escribir los Dockerfiles
Un Dockerfile por cada servicio Node.js (gateway, usuarios, rutas, despachos, websocket). Todos siguen el mismo patrón: imagen base `node:20-alpine`, copiar `package.json`, instalar dependencias, copiar código, compilar TypeScript, arrancar con `node dist/index.js`. También el Dockerfile para nginx-frontend que hace build de las 3 PWAs y sirve los archivos estáticos.
- **Depende de:** T5.1.
- **Bloquea a:** Nadie directamente (cada rol puede desarrollar con `npm run dev` localmente), pero necesario para el despliegue.

#### T5.3 — Provisionar la VM en Oracle Cloud
Crear la instancia ARM Ampere A1 (4 OCPU, 24 GB RAM). Instalar Docker y Docker Compose. Configurar SSH. Abrir los puertos 80, 443, 3000 y 3003 en las Security Lists de Oracle Cloud y en iptables.
- **Depende de:** Nada. Puede hacerse en paralelo con T5.1.

#### T5.4 — Configurar TLS con Let's Encrypt
Obtener un dominio (puede ser gratuito con servicios como DuckDNS o Freenom) o usar la IP directa con un certificado autofirmado para desarrollo. Configurar certbot para renovación automática. Actualizar nginx.conf para servir HTTPS en el puerto 443 y redirigir HTTP a HTTPS.
- **Depende de:** T5.3. Puede hacerse al final cuando todo funcione en HTTP.

#### T5.5 — Configurar RabbitMQ
Usando la imagen oficial `rabbitmq:3-management`. Habilitar el plugin de management para el panel admin (puerto 15672). Crear el usuario de la aplicación con permisos sobre el virtual host. Documentar las credenciales en `.env.example`.
- **Depende de:** T5.1.
- **Bloquea a:** Rol 3 (T3.2) necesita RabbitMQ funcionando para publicar eventos.

#### T5.6 — Configurar health checks en Docker Compose
Agregar `healthcheck` a cada servicio en docker-compose.yml para que Docker sepa cuándo cada contenedor está listo. RabbitMQ: `rabbitmq-diagnostics -q ping`. PostgreSQL: `pg_isready`. Redis: `redis-cli ping`. Servicios Node: `curl localhost:PORT/health`.
- **Depende de:** T5.1.

#### T5.7 — Inicializar y mantener `packages/shared`
Crear la estructura del paquete compartido. Configurar el `tsconfig.json` para que los demás paquetes lo importen. Configurar los workspaces de npm. Cuando otros roles necesiten agregar tipos, este rol revisa que la estructura sea consistente y no se dupliquen interfaces.
- **Depende de:** Nada. Debe hacerse en la Fase 0.
- **Bloquea a:** Todos los roles dependen de shared para sus importaciones.

#### T5.8 — Configurar el workspace del WebSocket Server
Crear `packages/websocket-server` con Socket.io + TypeScript. Configurar la conexión a RabbitMQ como consumidor. El servicio arranca y responde `/health` con 200.
- **Depende de:** T5.1 + T5.5.

#### T5.9 — Implementar la lógica del WebSocket Server
Al arrancar, el servidor se conecta a RabbitMQ y se suscribe a la cola vinculada al exchange `bus.events` con binding key `bus.#` (recibe todos los eventos). Cuando llega un evento:

1. Parsear el mensaje como `BusEvent` (tipo de shared).
2. Extraer el `routeId` del evento.
3. Emitir el evento al room de Socket.io `ruta:{routeId}` (para que todos los estudiantes suscritos a esa ruta lo reciban).
4. Si es un evento de proximidad, emitir al room `conductor:{busId}` (para que el conductor reciba las alertas).

Gestionar la conexión/desconexión de clientes: cuando un cliente se conecta, recibe un evento `subscribe` con el `routeId` y se une al room correspondiente.

- **Depende de:** T5.8 + interfaz `BusEvent` en shared + RabbitMQ configurado (T5.5).
- **Puede probar sin Rol 3:** Publicar eventos de prueba manualmente en RabbitMQ desde el panel admin y verificar que llegan a los clientes Socket.io.

#### T5.10 — Script de despliegue
Crear un script `deploy.sh` que se conecte por SSH a la VM, haga `git pull`, `docker compose build` y `docker compose up -d`. Documentar el proceso de despliegue paso a paso.
- **Depende de:** T5.3 + que el código esté en un repositorio Git.

### Archivos que este rol modifica
- `docker-compose.yml`
- `.env.example`
- `packages/shared/**`
- `packages/websocket-server/**`
- `nginx/nginx.conf` (en coordinación con Rol 1)
- Dockerfiles de todos los servicios

---

## 8. Mapa de dependencias entre tareas

### Leyenda
- ✅ = Puede empezar inmediatamente, sin depender de nadie.
- ⏳ = Depende de una tarea de la Fase 0 (trabajo grupal de Semana 1).
- 🔗 = Depende de una tarea específica de otro rol.
- 🔄 = Puede usar mocks mientras espera la dependencia real.

### Tabla de dependencias

| Tarea | Rol | Puede empezar | Depende de | Bloquea a |
|-------|-----|---------------|------------|-----------|
| T5.1 docker-compose | 5 | ✅ Inmediato | — | Todos |
| T5.7 shared package | 5 | ✅ Inmediato | — | Todos |
| T4.1 Esquema PostgreSQL | 4 | ✅ Inmediato | — | Roles 2, 3, 4 |
| T4.2 Estructura Redis | 4 | ✅ Inmediato | — | Rol 3 |
| T5.3 VM Oracle Cloud | 5 | ✅ Inmediato | — | Despliegue |
| T5.5 Config RabbitMQ | 5 | ✅ Inmediato | T5.1 | Rol 3 |
| T1.1 Workspace frontend | 1 | ✅ Inmediato | — | Todas las T1.x |
| T2.1 Workspace gateway | 2 | ✅ Inmediato | — | T2.2, T2.3 |
| T2.4 Workspace usuarios | 2 | ✅ Inmediato | — | T2.5 |
| T3.1 Workspace despachos | 3 | ✅ Inmediato | — | T3.2 |
| T4.3 Workspace rutas | 4 | ✅ Inmediato | — | T4.4 |
| — | — | **FASE 0 COMPLETADA** | — | — |
| T4.4 Migraciones auto | 4 | ⏳ Tras Fase 0 | T4.1, T4.3 | Roles 2, 3 |
| T4.5 Seed datos | 4 | 🔗 | T4.4 | Rol 1 (datos reales) |
| T2.2 Tabla nombres + proxy | 2 | ⏳ Tras Fase 0 | T2.1, shared | — |
| T2.3 Auth JWT middleware | 2 | ⏳ Tras Fase 0 | T2.1 | Rol 1 (flujos auth) |
| T2.5 Registro usuario | 2 | 🔗 | T2.4, T4.4 | T2.6 |
| T2.6 Login | 2 | 🔗 | T2.5 | T2.7 |
| T2.7 Token QR | 2 | 🔗 | T2.6, shared | Rol 1, Rol 3 |
| T3.2 Conexión RabbitMQ | 3 | 🔗 | T3.1, T5.5, shared | T3.3, T3.5 |
| T3.3 Cambio de estado | 3 | 🔗 | T3.2, T4.1, T4.2 | Rol 1 (T1.7) |
| T3.5 Recepción GPS | 3 | 🔗 | T3.2, T4.2 | Rol 1 (T1.10) |
| T3.6 Abordaje QR | 3 | 🔗 | T3.2, T4.1, shared | Rol 1 (T1.8) |
| T3.8 Alerta proximidad | 3 | 🔗 | T3.2, T4.2 | Rol 1 (T1.5, T1.9) |
| T5.8 Workspace WS Server | 5 | 🔗 | T5.1, T5.5 | T5.9 |
| T5.9 Lógica WS Server | 5 | 🔗 | T5.8, shared | Rol 1 (T1.3, T1.6) |
| T1.2 Selector de rutas | 1 | 🔄 Mock | shared | — |
| T1.3 Mapa en vivo | 1 | 🔄 Mock | T1.2, shared | — |
| T1.4 QR abordaje | 1 | 🔄 Mock | T1.1, shared | — |
| T1.7 Panel conductor | 1 | 🔄 Mock | T1.1, shared | — |
| T1.8 Escáner QR | 1 | 🔄 Mock | T1.1, shared | — |
| T1.11 Dashboard admin | 1 | 🔄 Mock | T1.1, shared | — |

---

## 9. Cronograma visual por fases

### Fase 0 — Semana 1: Cimientos (todos juntos)

```
Día 1-2:
  [Rol 5] ──── docker-compose.yml + shared package ────────────────►
  [Rol 4] ──── Diseño esquema PostgreSQL + Redis ──────────────────►
  [Rol 1] ──── Configurar workspaces de las 3 apps ────────────────►
  [Rol 2] ──── Configurar workspaces gateway + usuarios ───────────►
  [Rol 3] ──── Configurar workspace despachos ─────────────────────►

Día 3:
  [TODOS] ──── Sesión grupal: definir interfaces en shared ────────►
              (tipos, enums, constantes, mocks, funciones QR)

Día 4:
  [Rol 4] ──── Presentar esquema BD → equipo valida ───────────────►
  [Rol 5] ──── VM Oracle Cloud + RabbitMQ configurado ─────────────►

Día 5:
  [Rol 4] ──── Migraciones SQL + seed de datos ────────────────────►
  [TODOS] ──── docker compose up → los 12 contenedores arrancan ───►
```

### Fase 1 — Semanas 2-3: Desarrollo en paralelo

```
  [Rol 1] ──── T1.2 Selector rutas (mock) ────────────────────────►
           ──── T1.3 Mapa Leaflet (mock GPS) ─────────────────────►
           ──── T1.4 QR estudiante (mock token) ──────────────────►
           ──── T1.7 Panel conductor (mock) ──────────────────────►
           ──── T1.8 Escáner QR (mock) ───────────────────────────►

  [Rol 2] ──── T2.2 Proxy reverso ────────────────────────────────►
           ──── T2.3 JWT middleware ───────────────────────────────►
           ──── T2.5 Registro ─── T2.6 Login ─── T2.7 QR token ──►
           ──── T2.8 RBAC ────────────────────────────────────────►

  [Rol 3] ──── T3.2 Conexión RabbitMQ ────────────────────────────►
           ──── T3.3 Cambio estado + Lamport ─────────────────────►
           ──── T3.5 GPS ── T3.6 Abordaje QR ── T3.8 Proximidad ─►
           ──── T3.4 Reordenamiento causal ── T3.7 Reset aforo ──►

  [Rol 4] ──── T4.6 CRUD rutas ───────────────────────────────────►
           ──── T4.7 CRUD buses ───────────────────────────────────►
           ──── T4.8 CRUD paradas ─────────────────────────────────►
           ──── T4.9 Historial ────────────────────────────────────►

  [Rol 5] ──── T5.2 Dockerfiles ───────────────────────────────────►
           ──── T5.8 WS Server workspace ── T5.9 Lógica WS ──────►
           ──── T5.6 Health checks ────────────────────────────────►
```

### Fase 2 — Semana 4: Integración y despliegue

```
Día 1-2:
  [Rol 1] ──── Reemplazar mocks por URLs reales del Gateway ──────►
  [Todos] ──── Tests de integración end-to-end ────────────────────►

Día 3-4:
  [Rol 5] ──── T5.10 Deploy a Oracle Cloud ────────────────────────►
  [Rol 5] ──── T5.4 Certificados TLS ─────────────────────────────►
  [Todos] ──── Pruebas en producción ──────────────────────────────►

Día 5:
  [Todos] ──── Fix de bugs finales + documentación ───────────────►
```

---

## Notas finales

### Comunicación mínima diaria
Cada integrante reporta al final del día en el canal del equipo: qué tarea terminó, qué tarea empieza mañana, y si algo lo bloquea. Si algo te bloquea, el equipo lo resuelve al día siguiente, no al final del proyecto.

### Regla de merge
Nadie hace merge directo a `main`. Todo va por pull request con al menos un reviewer. Los cambios en `packages/shared` requieren revisión de al menos dos personas (el que lo escribe y uno de los roles que lo consume).

### Regla de variables de entorno
Nunca hardcodear credenciales, URLs ni secretos en el código. Todo va en `.env` (local) y en las variables de entorno del `docker-compose.yml`. El archivo `.env` está en `.gitignore`. El archivo `.env.example` (sin valores reales) sí se versiona.
