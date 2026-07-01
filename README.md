# UniRoute

Plataforma distribuida para coordinar buses intercampus universitarios de la UDLA (Quito, Ecuador). Estudiantes abordan vía QR, conductores reportan GPS y estado del bus, y ambos ven actualizaciones en vivo por WebSockets. Los eventos viajan por RabbitMQ y se ordenan con reloj de Lamport.

## Documentación del proyecto

| Documento                                                          | Para qué sirve                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [`Roles_y_Plan_de_Trabajo.md`](./Roles_y_Plan_de_Trabajo.md)       | Roles del equipo, tareas de cada uno, dependencias y cronograma. Empezá por acá.                                  |
| [`Contratos_API_REST.md`](./Contratos_API_REST.md)                 | Todos los endpoints REST: path, método, request y response body.                                                  |
| [`Contratos_Eventos_RabbitMQ.md`](./Contratos_Eventos_RabbitMQ.md) | Estructura de los eventos que publica `despachos-service` y consume `websocket-server`, y los rooms de Socket.io. |
| [`CLAUDE.md`](./CLAUDE.md)                                         | Guía para Claude Code sobre la arquitectura del repo (útil también para onboarding humano).                       |

## Quickstart

Requisitos: Docker + Docker Compose, Node.js 20+.

```bash
git clone https://github.com/JohannCalva/uniroute
cd uniroute
cp .env.example .env
docker compose up --build
```

Esto levanta los 12 contenedores (nginx, api-gateway, usuarios-service, rutas-service, despachos-service, websocket-server, rabbitmq, postgres, redis, app-estudiante, app-conductor, dashboard-admin). Postgres corre la migración inicial (`packages/rutas-service/migrations/001_initial_schema.sql`) automáticamente la primera vez que el volumen está vacío, con seed data de rutas/paradas/buses/usuarios de prueba.

Accedé a:

- `http://localhost/estudiante/`, `/conductor/`, `/admin/` — las tres apps, vía nginx.
- `http://localhost:3000/health` — API Gateway.
- `http://localhost:3003/health` — WebSocket server.
- `http://localhost:15672` — panel admin de RabbitMQ (`guest`/`guest`).

Si el puerto 80 ya está ocupado en tu máquina (por ejemplo IIS en Windows), definí `NGINX_PORT=8080` (u otro puerto libre) en tu `.env` local — no requiere tocar `docker-compose.yml`.

### Verificar que levantó bien

```bash
docker compose ps                                    # los 12 deberían estar "Up"
curl localhost:3000/health                           # api-gateway
curl localhost:3003/health                           # websocket-server
docker compose exec usuarios-service wget -qO- localhost:3001/health
docker compose exec rutas-service wget -qO- localhost:3002/health
docker compose exec despachos-service wget -qO- localhost:3004/health
```

`usuarios-service`, `rutas-service` y `despachos-service` no publican puerto al host (solo `expose`), por eso se prueban con `docker compose exec` en vez de `curl localhost:PUERTO`.

## Regla de oro del monorepo

Cada integrante modifica solo los archivos de su rol (ver la tabla de dominios en `Roles_y_Plan_de_Trabajo.md`). La única carpeta que todos tocan es `packages/shared` — los tipos TypeScript, constantes y utils que cruzan fronteras entre servicios. Antes de escribir un endpoint o publicar un evento, revisá que su forma ya esté definida ahí; si no está, se agrega vía PR.

## Reglas de colaboración

- Nadie hace merge directo a `main`. Todo va por pull request con al menos un reviewer.
- Cambios en `packages/shared` requieren revisión de al menos dos personas: quien lo escribe y alguien de un rol que lo consuma.
- Nunca hardcodear credenciales, URLs ni secretos. Todo va en `.env` (nunca se commitea) — `.env.example` sí se versiona y documenta cada variable, sin valores reales de producción.
