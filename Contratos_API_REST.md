# Contratos de API REST — UniRoute

> Este documento es la fuente de verdad para la comunicación entre el frontend y los microservicios.
> Cada endpoint está tipado. El frontend construye sus mocks con estas estructuras exactas.
> Si un campo cambia aquí, debe cambiar en `packages/shared/src/types/`.

---

## Convenciones generales

- **Base URL:** Todas las peticiones pasan por el API Gateway: `https://{domain}/api/v1/`
- **Autenticación:** Header `Authorization: Bearer <JWT>` en todas las rutas excepto registro y login.
- **Formato:** Request y response en JSON. Header `Content-Type: application/json`.
- **IDs:** Todos los identificadores son UUID v4.
- **Timestamps:** Formato ISO 8601 (`2026-06-28T15:30:00.000Z`).
- **Errores:** Formato unificado `{ "error": "mensaje descriptivo", "code": "ERROR_CODE" }`.
- **Paginación:** Query params `?page=1&limit=20`. Response incluye `{ data: [], total: number, page: number, limit: number }`.

---

## 1. Usuarios Service (Rol 2)

Base interna: `http://usuarios-service:3001`

### POST /api/v1/usuarios/registro

Crea una nueva cuenta de usuario.

**Acceso:** Público (sin JWT).

**Request body:**
```json
{
  "email": "juan.perez@udla.edu.ec",
  "password": "MiClaveSegura123",
  "nombre": "Juan Pérez",
  "rol": "STUDENT"
}
```

**Validaciones:**
- `email` debe terminar en `@udla.edu.ec`.
- `password` mínimo 8 caracteres.
- `rol` debe ser `STUDENT`, `DRIVER` o `ADMIN`.
- `email` no debe existir previamente en la base de datos.

**Response 201:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "juan.perez@udla.edu.ec",
  "nombre": "Juan Pérez",
  "rol": "STUDENT",
  "createdAt": "2026-06-28T10:00:00.000Z"
}
```

**Errores posibles:**
- `400` — Validación fallida (email no @udla, password corta, rol inválido).
- `409` — Email ya registrado.

---

### POST /api/v1/usuarios/login

Autentica un usuario y retorna un JWT.

**Acceso:** Público (sin JWT).

**Request body:**
```json
{
  "email": "juan.perez@udla.edu.ec",
  "password": "MiClaveSegura123"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "juan.perez@udla.edu.ec",
    "nombre": "Juan Pérez",
    "rol": "STUDENT"
  },
  "expiresIn": 86400
}
```

**Errores posibles:**
- `401` — Credenciales incorrectas.

---

### GET /api/v1/usuarios/me

Retorna el perfil del usuario autenticado.

**Acceso:** `STUDENT`, `DRIVER`, `ADMIN`.

**Response 200:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "juan.perez@udla.edu.ec",
  "nombre": "Juan Pérez",
  "rol": "STUDENT",
  "createdAt": "2026-06-28T10:00:00.000Z"
}
```

---

### GET /api/v1/usuarios/me/boarding-token

Genera un token de abordaje firmado con HMAC-SHA256 para que el estudiante lo muestre como QR.

**Acceso:** `STUDENT`.

**Response 200:**
```json
{
  "boardingToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-06-29T10:00:00.000Z"
}
```

**Contenido del token firmado (payload interno, NO se expone al cliente):**
```json
{
  "studentId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "studentName": "Juan Pérez",
  "issuedAt": 1719568800,
  "expiresAt": 1719655200
}
```

**Errores posibles:**
- `403` — Solo estudiantes pueden generar tokens de abordaje.

---

## 2. Rutas Service (Rol 4)

Base interna: `http://rutas-service:3002`

### GET /api/v1/rutas

Lista todas las rutas activas con sus paradas.

**Acceso:** `STUDENT`, `DRIVER`, `ADMIN`.

**Query params opcionales:** `?activa=true`

**Response 200:**
```json
{
  "data": [
    {
      "id": "ruta-001-uuid",
      "nombre": "Campus Express",
      "origen": "Campus Granados",
      "destino": "UDLAPark",
      "precio": 0.00,
      "activa": true,
      "horarioInicio": "06:30",
      "horarioFin": "21:00",
      "paradas": [
        {
          "id": "parada-001-uuid",
          "nombre": "Estación Metro Jipijapa",
          "latitud": -0.1695,
          "longitud": -78.4865,
          "orden": 1
        },
        {
          "id": "parada-002-uuid",
          "nombre": "UDLA Granados",
          "latitud": -0.1720,
          "longitud": -78.4800,
          "orden": 2
        }
      ]
    }
  ],
  "total": 3
}
```

---

### GET /api/v1/rutas/:id

Detalle de una ruta específica con paradas ordenadas.

**Acceso:** `STUDENT`, `DRIVER`, `ADMIN`.

**Response 200:** Mismo objeto que un elemento del array de `GET /api/v1/rutas`.

**Errores posibles:**
- `404` — Ruta no encontrada.

---

### POST /api/v1/rutas

Crea una nueva ruta.

**Acceso:** `ADMIN`.

**Request body:**
```json
{
  "nombre": "Campus Norte",
  "origen": "Campus Colón",
  "destino": "Campus Norte",
  "precio": 4.50,
  "horarioInicio": "07:00",
  "horarioFin": "20:00"
}
```

**Response 201:** Objeto de ruta creado (sin paradas aún).

---

### PUT /api/v1/rutas/:id

Actualiza una ruta existente.

**Acceso:** `ADMIN`.

**Request body:** Campos parciales (solo los que se quieren actualizar).

**Response 200:** Objeto de ruta actualizado.

---

### DELETE /api/v1/rutas/:id

Desactiva una ruta (soft delete, pone `activa = false`).

**Acceso:** `ADMIN`.

**Response 200:**
```json
{
  "message": "Ruta desactivada",
  "id": "ruta-001-uuid"
}
```

---

### GET /api/v1/rutas/:rutaId/paradas

Paradas de una ruta en orden ascendente.

**Acceso:** `STUDENT`, `DRIVER`, `ADMIN`.

**Response 200:**
```json
{
  "data": [
    {
      "id": "parada-001-uuid",
      "rutaId": "ruta-001-uuid",
      "nombre": "Estación Metro Jipijapa",
      "latitud": -0.1695,
      "longitud": -78.4865,
      "orden": 1
    }
  ],
  "total": 5
}
```

---

### POST /api/v1/rutas/:rutaId/paradas

Agrega una parada a una ruta.

**Acceso:** `ADMIN`.

**Request body:**
```json
{
  "nombre": "Parada Río Coca",
  "latitud": -0.1650,
  "longitud": -78.4850,
  "orden": 3
}
```

**Response 201:** Objeto de parada creado.

---

### PUT /api/v1/paradas/:id

Actualiza una parada existente.

**Acceso:** `ADMIN`.

**Request body:** Campos parciales.

**Response 200:** Objeto de parada actualizado.

---

### GET /api/v1/buses

Lista todos los buses con su estado actual (consultando Redis para estado en vivo).

**Acceso:** `STUDENT`, `DRIVER`, `ADMIN`.

**Response 200:**
```json
{
  "data": [
    {
      "id": "bus-001-uuid",
      "placa": "PCY-1234",
      "capacidadMaxima": 45,
      "rutaAsignada": {
        "id": "ruta-001-uuid",
        "nombre": "Campus Express"
      },
      "estadoEnVivo": {
        "status": "EN_ROUTE",
        "lat": -0.1710,
        "lng": -78.4830,
        "aforoActual": 28,
        "lamportClock": 7,
        "lastUpdate": "2026-06-28T14:30:00.000Z"
      }
    }
  ],
  "total": 5
}
```

**Nota:** El campo `estadoEnVivo` se obtiene de Redis (`bus:{busId}:status` + `bus:{busId}:aforo`). Si el bus no tiene estado en Redis (está inactivo), `estadoEnVivo` es `null`.

---

### GET /api/v1/buses/:id

Detalle de un bus con su ruta asignada y estado en vivo.

**Acceso:** `STUDENT`, `DRIVER`, `ADMIN`.

**Response 200:** Mismo objeto que un elemento del array de `GET /api/v1/buses`.

---

### POST /api/v1/buses

Registra un nuevo bus.

**Acceso:** `ADMIN`.

**Request body:**
```json
{
  "placa": "PCY-1234",
  "capacidadMaxima": 45
}
```

**Response 201:** Objeto de bus creado (sin ruta asignada).

---

### PUT /api/v1/buses/:id/asignar

Asigna o reasigna un bus a una ruta.

**Acceso:** `ADMIN`.

**Request body:**
```json
{
  "rutaId": "ruta-001-uuid"
}
```

**Response 200:** Objeto de bus actualizado con la ruta asignada.

---

### GET /api/v1/viajes/historial

Historial de viajes completados con paginación y filtros.

**Acceso:** `ADMIN`.

**Query params:** `?page=1&limit=20&rutaId=xxx&busId=xxx&desde=2026-06-01&hasta=2026-06-30`

**Response 200:**
```json
{
  "data": [
    {
      "id": "viaje-001-uuid",
      "bus": { "id": "bus-001-uuid", "placa": "PCY-1234" },
      "ruta": { "id": "ruta-001-uuid", "nombre": "Campus Express" },
      "conductor": { "id": "user-002-uuid", "nombre": "Carlos López" },
      "inicioAt": "2026-06-28T07:00:00.000Z",
      "finAt": "2026-06-28T07:35:00.000Z",
      "pasajerosTotal": 38,
      "estado": "COMPLETED"
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 20
}
```

---

## 3. Despachos Service (Rol 3)

Base interna: `http://despachos-service:3004`

### POST /api/v1/despachos/viaje/iniciar

El conductor inicia un viaje. Crea el registro en PostgreSQL e inicializa el estado en Redis.

**Acceso:** `DRIVER`.

**Request body:**
```json
{
  "busId": "bus-001-uuid",
  "rutaId": "ruta-001-uuid"
}
```

**Response 201:**
```json
{
  "viajeId": "viaje-001-uuid",
  "busId": "bus-001-uuid",
  "rutaId": "ruta-001-uuid",
  "estado": "ACTIVE",
  "inicioAt": "2026-06-28T07:00:00.000Z",
  "lamportClock": 0
}
```

**Acciones internas:**
1. Crear registro en tabla `viajes` con estado `ACTIVE`.
2. Inicializar Redis: `bus:{busId}:status` → hash con status=EN_PARADA, lamportClock=0.
3. Inicializar Redis: `bus:{busId}:aforo` → "0".
4. Copiar capacidad del bus a Redis: `bus:{busId}:capacidad`.
5. Crear Redis: `viaje:{viajeId}:activo` → busId.

**Errores posibles:**
- `400` — El bus ya tiene un viaje activo.
- `404` — Bus o ruta no encontrados.

---

### POST /api/v1/despachos/estado

El conductor cambia el estado del bus. Aplica Relojes de Lamport.

**Acceso:** `DRIVER`.

**Request body:**
```json
{
  "busId": "bus-001-uuid",
  "status": "DEPARTING",
  "lamportClock": 3
}
```

**Valores posibles de `status`:** `AT_STOP`, `DEPARTING`, `EN_ROUTE`, `FULL`, `ARRIVED`.

**Response 202:**
```json
{
  "accepted": true,
  "serverLamportClock": 4,
  "busId": "bus-001-uuid",
  "status": "DEPARTING"
}
```

**Acciones internas:**
1. Aplicar regla Lamport: `L_srv = max(L_srv, L_msg) + 1`.
2. Actualizar hash Redis `bus:{busId}:status`.
3. Insertar en tabla `eventos_bus`.
4. Si status = `FULL`, hacer override del aforo (ver T3.9).
5. Publicar evento en RabbitMQ: `bus.{busId}.status_change`.

**Errores posibles:**
- `400` — Status inválido.
- `404` — Bus no tiene viaje activo.

---

### POST /api/v1/despachos/gps

El conductor envía su posición GPS actual.

**Acceso:** `DRIVER`.

**Request body:**
```json
{
  "busId": "bus-001-uuid",
  "latitude": -0.1710,
  "longitude": -78.4830
}
```

**Response 200:**
```json
{
  "received": true
}
```

**Acciones internas:**
1. Actualizar campos `lat` y `lng` en hash Redis `bus:{busId}:status`.
2. Actualizar campo `lastUpdate` con timestamp actual.
3. Publicar evento en RabbitMQ: `bus.{busId}.gps_update`.
4. NO persiste en PostgreSQL (alta frecuencia, dato efímero).

---

### POST /api/v1/despachos/abordaje

El conductor escanea el QR de un estudiante. Verifica legitimidad e incrementa aforo.

**Acceso:** `DRIVER`.

**Request body:**
```json
{
  "busId": "bus-001-uuid",
  "boardingToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 200:**
```json
{
  "valid": true,
  "studentId": "student-001-uuid",
  "studentName": "Juan Pérez",
  "aforoActual": 29,
  "capacidadMaxima": 45
}
```

**Acciones internas:**
1. Verificar firma HMAC del token usando `verifyBoardingToken()` de shared.
2. Verificar que no esté expirado.
3. `INCR bus:{busId}:aforo` en Redis.
4. Insertar en tabla `abordajes` (viaje_id, estudiante_id).
5. Publicar evento en RabbitMQ: `bus.{busId}.aforo_update`.

**Errores posibles:**
- `400` — Token inválido o expirado.
- `404` — Bus no tiene viaje activo.
- `409` — Estudiante ya abordó en este viaje.

---

### POST /api/v1/despachos/proximidad

Un estudiante envía su ubicación para avisar al conductor que está llegando.

**Acceso:** `STUDENT`.

**Request body:**
```json
{
  "rutaId": "ruta-001-uuid",
  "latitude": -0.1700,
  "longitude": -78.4840
}
```

**Response 200:**
```json
{
  "received": true,
  "etaSeconds": 90,
  "distanceMeters": 125,
  "nearestStop": {
    "id": "parada-002-uuid",
    "nombre": "UDLA Granados"
  }
}
```

**Acciones internas:**
1. Obtener paradas de la ruta (desde Redis cache o PostgreSQL).
2. Calcular distancia a la parada más cercana con Haversine.
3. Aplicar factor de corrección 1.3 a la distancia.
4. Calcular ETA con velocidad promedio 5 km/h.
5. Almacenar en sorted set Redis `ruta:{rutaId}:esperando` (score=ETA, member=studentId).
6. Agregar todas las alertas activas de esa ruta.
7. Publicar evento en RabbitMQ: `bus.{busId}.proximity_update` con resumen agregado.

---

### POST /api/v1/despachos/viaje/finalizar

El conductor finaliza el viaje. Resetea aforo y limpia estado efímero.

**Acceso:** `DRIVER`.

**Request body:**
```json
{
  "busId": "bus-001-uuid"
}
```

**Response 200:**
```json
{
  "viajeId": "viaje-001-uuid",
  "estado": "COMPLETED",
  "pasajerosTotal": 38,
  "finAt": "2026-06-28T07:35:00.000Z"
}
```

**Tipos en shared:** `EndTripRequest` / `EndTripResponse` (`packages/shared/src/types/trip.ts`).

**Acciones internas:**
1. Leer aforo actual de Redis → guardar como `pasajeros_total` en tabla `viajes`.
2. Actualizar estado del viaje a `COMPLETED` y `fin_at` en PostgreSQL.
3. Limpiar Redis: `DEL bus:{busId}:status`, `DEL bus:{busId}:aforo`, `DEL bus:{busId}:capacidad`.
4. Limpiar alertas: `DEL ruta:{rutaId}:esperando`.
5. Limpiar lookup: `DEL viaje:{viajeId}:activo`.
6. Publicar evento en RabbitMQ: `bus.{busId}.status_change` con status `ARRIVED`.

---

### GET /api/v1/despachos/bus/:busId/estado

Consulta el estado en vivo de un bus (lectura de Redis).

**Acceso:** `STUDENT`, `DRIVER`, `ADMIN`.

**Response 200:**
```json
{
  "busId": "bus-001-uuid",
  "status": "EN_ROUTE",
  "lat": -0.1710,
  "lng": -78.4830,
  "aforoActual": 28,
  "capacidadMaxima": 45,
  "lamportClock": 7,
  "lastUpdate": "2026-06-28T14:30:00.000Z",
  "estudiantesEsperando": 3,
  "etaMaxEsperando": 120
}
```

**Errores posibles:**
- `404` — Bus sin estado activo en Redis (no hay viaje en curso).

**Tipo en shared:** `BusStatusResponse` (`packages/shared/src/types/trip.ts`).
