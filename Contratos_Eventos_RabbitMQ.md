# Contratos de Eventos RabbitMQ — UniRoute

> Este documento define la estructura exacta de cada mensaje que fluye por el broker.
> Rol 3 (Despachos) PUBLICA estos eventos. Rol 5 (WebSocket Server) los CONSUME.
> Ambos deben importar las interfaces de `packages/shared/src/types/events.ts`.

---

## Configuración del broker

| Parámetro | Valor |
|-----------|-------|
| Exchange name | `bus.events` |
| Exchange type | `topic` |
| Durable | `true` (sobrevive reinicios de RabbitMQ) |
| Cola del WS Server | `ws.bus.events` |
| Binding key de la cola | `bus.#` (recibe todos los eventos) |
| Prefetch | `10` (procesa 10 mensajes a la vez) |
| Ack mode | Manual (ack después de emitir por Socket.io) |

---

## Formato base de todos los eventos

Todos los mensajes publicados en el exchange siguen esta estructura envolvente:

```typescript
interface BusEvent {
  eventId: string;          // UUID v4 único por evento
  type: BusEventType;       // Discriminador del tipo de evento
  busId: string;            // UUID del bus que origina el evento
  routeId: string;          // UUID de la ruta activa del bus
  tripId: string;           // UUID del viaje activo
  lamportClock: number;     // Reloj lógico del servidor al procesar
  timestamp: string;        // ISO 8601, momento de procesamiento en servidor
  payload: EventPayload;    // Datos específicos del tipo de evento
}

type BusEventType =
  | 'STATUS_CHANGE'
  | 'GPS_UPDATE'
  | 'AFORO_UPDATE'
  | 'PROXIMITY_UPDATE';
```

**Propiedades del mensaje AMQP:**

| Propiedad | Valor |
|-----------|-------|
| `contentType` | `application/json` |
| `persistent` | `true` |
| `messageId` | Mismo valor que `eventId` |
| `timestamp` | Unix timestamp en segundos |

---

## Evento 1: STATUS_CHANGE

**Routing key:** `bus.{busId}.status_change`

**Se publica cuando:** El conductor cambia el estado del bus (Saliendo, Lleno, En Parada, Llegada).

**Payload:**

```typescript
interface StatusChangePayload {
  previousStatus: BusStatus | null;
  newStatus: BusStatus;
  triggeredBy: 'DRIVER';    // Siempre el conductor en esta versión
}

type BusStatus =
  | 'AT_STOP'       // En parada, esperando pasajeros
  | 'DEPARTING'     // Saliendo en ~5 minutos
  | 'EN_ROUTE'      // En camino entre paradas
  | 'FULL'          // Bus lleno (override manual)
  | 'ARRIVED';      // Llegó al destino final
```

**Ejemplo completo del mensaje:**

```json
{
  "eventId": "evt-a1b2c3d4",
  "type": "STATUS_CHANGE",
  "busId": "bus-001-uuid",
  "routeId": "ruta-001-uuid",
  "tripId": "viaje-001-uuid",
  "lamportClock": 4,
  "timestamp": "2026-06-28T14:30:00.000Z",
  "payload": {
    "previousStatus": "AT_STOP",
    "newStatus": "DEPARTING",
    "triggeredBy": "DRIVER"
  }
}
```

**Acción del WS Server al recibir:**
1. Emitir al room `ruta:{routeId}` el evento Socket.io `bus:status` con el mensaje completo.
2. Si `newStatus` es `DEPARTING`, el frontend muestra la alerta "¡El bus sale en 5 minutos!".
3. Si `newStatus` es `FULL`, el frontend muestra "BUS LLENO".
4. Si `newStatus` es `ARRIVED`, el frontend limpia la suscripción de ese viaje.

---

## Evento 2: GPS_UPDATE

**Routing key:** `bus.{busId}.gps_update`

**Se publica cuando:** El conductor transmite su posición GPS (cada 3-5 segundos).

**Payload:**

```typescript
interface GpsUpdatePayload {
  latitude: number;     // Decimal con 7 dígitos de precisión
  longitude: number;    // Decimal con 7 dígitos de precisión
}
```

**Ejemplo completo:**

```json
{
  "eventId": "evt-e5f6g7h8",
  "type": "GPS_UPDATE",
  "busId": "bus-001-uuid",
  "routeId": "ruta-001-uuid",
  "tripId": "viaje-001-uuid",
  "lamportClock": 5,
  "timestamp": "2026-06-28T14:30:03.000Z",
  "payload": {
    "latitude": -0.1710,
    "longitude": -78.4830
  }
}
```

**Acción del WS Server al recibir:**
1. Emitir al room `ruta:{routeId}` el evento Socket.io `bus:gps` con el mensaje completo.
2. El frontend mueve el marcador del bus en el mapa de Leaflet a las nuevas coordenadas.

**Nota de rendimiento:** Este es el evento de mayor frecuencia. El WS Server no debe hacer ningún procesamiento adicional, solo reenviar.

---

## Evento 3: AFORO_UPDATE

**Routing key:** `bus.{busId}.aforo_update`

**Se publica cuando:** Un estudiante aborda (escaneo QR exitoso), o el conductor hace override manual (Bus Lleno), o el viaje finaliza (reset).

**Payload:**

```typescript
interface AforoUpdatePayload {
  aforoActual: number;      // Pasajeros actualmente a bordo
  capacidadMaxima: number;  // Capacidad total del bus
  porcentaje: number;       // aforoActual / capacidadMaxima * 100
  trigger: 'QR_SCAN' | 'DRIVER_OVERRIDE' | 'TRIP_RESET';
  studentName?: string;     // Solo cuando trigger = QR_SCAN
}
```

**Ejemplo (escaneo QR):**

```json
{
  "eventId": "evt-i9j0k1l2",
  "type": "AFORO_UPDATE",
  "busId": "bus-001-uuid",
  "routeId": "ruta-001-uuid",
  "tripId": "viaje-001-uuid",
  "lamportClock": 6,
  "timestamp": "2026-06-28T14:31:00.000Z",
  "payload": {
    "aforoActual": 29,
    "capacidadMaxima": 45,
    "porcentaje": 64.4,
    "trigger": "QR_SCAN",
    "studentName": "Juan Pérez"
  }
}
```

**Ejemplo (override Bus Lleno):**

```json
{
  "eventId": "evt-m3n4o5p6",
  "type": "AFORO_UPDATE",
  "busId": "bus-001-uuid",
  "routeId": "ruta-001-uuid",
  "tripId": "viaje-001-uuid",
  "lamportClock": 7,
  "timestamp": "2026-06-28T14:32:00.000Z",
  "payload": {
    "aforoActual": 45,
    "capacidadMaxima": 45,
    "porcentaje": 100,
    "trigger": "DRIVER_OVERRIDE"
  }
}
```

**Acción del WS Server al recibir:**
1. Emitir al room `ruta:{routeId}` el evento Socket.io `bus:aforo` con el mensaje completo.
2. El frontend actualiza el indicador de aforo ("29/45 asientos").

---

## Evento 4: PROXIMITY_UPDATE

**Routing key:** `bus.{busId}.proximity_update`

**Se publica cuando:** Un estudiante activa "Estoy llegando" y el sistema agrega las solicitudes activas.

**Payload:**

```typescript
interface ProximityUpdatePayload {
  totalStudentsWaiting: number;   // Cuántos estudiantes están acercándose
  maxEtaSeconds: number;          // ETA del estudiante más lejano
  nearestStopName: string;        // Nombre de la parada más cercana
  students: ProximityStudent[];   // Detalle individual (máx. 10)
}

interface ProximityStudent {
  etaSeconds: number;
  distanceMeters: number;
}
```

**Ejemplo completo:**

```json
{
  "eventId": "evt-q7r8s9t0",
  "type": "PROXIMITY_UPDATE",
  "busId": "bus-001-uuid",
  "routeId": "ruta-001-uuid",
  "tripId": "viaje-001-uuid",
  "lamportClock": 8,
  "timestamp": "2026-06-28T14:33:00.000Z",
  "payload": {
    "totalStudentsWaiting": 3,
    "maxEtaSeconds": 120,
    "nearestStopName": "UDLA Granados",
    "students": [
      { "etaSeconds": 45, "distanceMeters": 62 },
      { "etaSeconds": 80, "distanceMeters": 111 },
      { "etaSeconds": 120, "distanceMeters": 166 }
    ]
  }
}
```

**Acción del WS Server al recibir:**
1. Emitir al room `conductor:{busId}` el evento Socket.io `proximity:update` con el payload.
2. El frontend del conductor muestra: "3 estudiantes acercándose — el más lejano a 2 min".
3. NO se emite al room de la ruta general (los demás estudiantes no necesitan ver esto).

---

## Rooms de Socket.io (WS Server)

| Room | Quién se suscribe | Qué eventos recibe |
|------|--------------------|--------------------|
| `ruta:{routeId}` | Estudiantes consultando esa ruta | `bus:status`, `bus:gps`, `bus:aforo` |
| `conductor:{busId}` | El conductor de ese bus | `proximity:update` |
| `admin:fleet` | El dashboard admin | Todos los eventos de todos los buses |

> **Nota de implementación:** el stub actual de `packages/websocket-server/src/index.ts` (entregable de Fase 0, aún sin lógica real) usa el room `route:{routeId}` (inglés) y recibe `routeId` como string plano en el evento `subscribe:route`, en vez de `ruta:{routeId}` con payload `{ routeId }` como define este contrato. Rol 5 debe alinear el código a este documento al implementar T5.9 — este contrato es la fuente de verdad, no el stub.

### Protocolo de suscripción del cliente Socket.io

**Estudiante se suscribe a una ruta:**
```typescript
// Cliente emite:
socket.emit('subscribe:route', { routeId: 'ruta-001-uuid' });

// Servidor lo añade al room:
socket.join(`ruta:${routeId}`);

// Servidor confirma:
socket.emit('subscribed', { room: `ruta:${routeId}` });
```

**Conductor se suscribe a su bus:**
```typescript
// Cliente emite:
socket.emit('subscribe:driver', { busId: 'bus-001-uuid' });

// Servidor lo añade al room:
socket.join(`conductor:${busId}`);
```

**Admin se suscribe a toda la flota:**
```typescript
// Cliente emite:
socket.emit('subscribe:admin');

// Servidor lo añade al room:
socket.join('admin:fleet');
```

---

## Diagrama de flujo del evento

```
Conductor presiona "Saliendo"
        │
        ▼
  App Conductor
  (incrementa Lamport local)
        │
        ▼ POST /api/v1/despachos/estado
        │
  API Gateway
  (valida JWT, proxy)
        │
        ▼
  Despachos Service
  (aplica Lamport servidor,
   actualiza Redis,
   persiste PostgreSQL)
        │
        ▼ amqplib.publish()
        │
  RabbitMQ
  exchange: bus.events
  routing key: bus.{busId}.status_change
        │
        ▼ consume()
        │
  WebSocket Server
  (parsea BusEvent)
        │
        ├──▶ room ruta:{routeId}
        │    evento: "bus:status"
        │         │
        │         ▼
        │    App Estudiante
        │    "¡El bus sale en 5 min!"
        │
        └──▶ room admin:fleet
             evento: "bus:status"
                  │
                  ▼
             Dashboard Admin
             (actualiza tabla de flota)
```
