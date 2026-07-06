# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

UniRoute — a distributed platform coordinating intercampus university buses for UDLA (Quito, Ecuador). Students board buses via QR/token, drivers report GPS and bus status, and both see live updates via WebSockets. Bus events flow through RabbitMQ; ordering across services is tracked with a Lamport clock (see `lamportClock` fields throughout `packages/shared`).

**Status:** this started as a generated infrastructure scaffold and is now mostly implemented on the backend. The npm workspaces, Docker Compose topology, shared TypeScript types/constants/utils, mock data, and the Postgres schema (with seed data) are all real. `usuarios-service` has real auth: `POST /registro` (bcrypt hash, `@udla.edu.ec` email domain enforced via zod), `POST /login` (issues a JWT with `id`/`email`/`role`, 24h expiry), `GET /me`, and `GET /me/boarding-token` (STUDENT-only, issues the HMAC `boardingToken` from `boarding-token.ts`). `api-gateway` actually proxies via `http-proxy-middleware` (`proxy.ts`, routed through `API_ROUTES`/`SERVICE_REGISTRY`) and enforces `authenticateJwt` (`middleware/auth.ts`) + fail-closed RBAC (`middleware/rbac.ts`) in front of it — see the RBAC note below. `rutas-service` has the full CRUD from `Contratos_API_REST.md` §2 (rutas, buses, paradas, historial — see the rutas-service note below). `despachos-service` has the full dispatch engine (`Contratos_API_REST.md` §3: iniciar/finalizar viaje, cambio de estado with Lamport clock, GPS, boarding QR, proximity) behind a `routes/controllers/services` layering. `websocket-server` only has the Socket.io side (`subscribe:route`/`unsubscribe:route` rooms) — it does **not** yet consume RabbitMQ, so events published by `despachos-service` never reach connected clients (see the websocket-server note below). The three frontend apps (`app-estudiante`, `app-conductor`, `dashboard-admin`) are still placeholder Vite+React apps with no real UI. Treat `packages/shared`, `migrations/001_initial_schema.sql`, and `Contratos_API_REST.md`/`Contratos_Eventos_RabbitMQ.md` as the contract to implement against for anything still incomplete — don't assume a service's PR description matches its actual code; verify against a clean `docker compose build`.

## Monorepo layout

npm workspaces (`packages/*`), single root `package.json`, root `tsconfig.base.json` extended by every backend package.

| Package | Role | Port |
|---|---|---|
| `packages/shared` (`@uniroute/shared`) | Shared types, constants, utils, mocks — the source of truth for cross-service contracts | — |
| `packages/api-gateway` | Express entrypoint, routes `/api/v1/*` to backend services by prefix | 3000 |
| `packages/usuarios-service` | Users/auth — registro, login, perfil, boarding token (implemented) | 3001 |
| `packages/rutas-service` | Routes/stops/buses/trips CRUD (implemented) + owns the Postgres schema/migrations | 3002 |
| `packages/websocket-server` | Socket.io server — room subscribe/unsubscribe works; RabbitMQ consumer not yet wired | 3003 |
| `packages/despachos-service` | Boarding/dispatch — viaje lifecycle, GPS, QR boarding, proximity (implemented) | 3004 |
| `packages/app-estudiante` | Student PWA (Vite+React) | 5173 (dev) |
| `packages/app-conductor` | Driver app (Vite+React) | 5174 (dev) |
| `packages/dashboard-admin` | Admin dashboard (Vite+React) | 5175 (dev) |
| `nginx` | Reverse proxy: `/api/*` → api-gateway, `/socket.io/*` → websocket-server (upgrade), `/estudiante/`, `/conductor/`, `/admin/` → each frontend, `/` → redirect to `/estudiante/` | 80 |

Infra: PostgreSQL 16 (5432), Redis 7 (6379), RabbitMQ 3-management (5672, mgmt UI 15672).

## Commands

Everything runs through Docker Compose; there is no working native (non-Docker) run path since services depend on each other's compose-network hostnames (`postgres`, `redis`, `rabbitmq`, `api-gateway`, etc.) baked into `.env`/`.env.example` URLs.

```bash
npm install                              # install all workspaces from root
npm run dev                              # docker compose up --build — full stack
npm run build                            # tsc build across all workspaces (--if-present)
npm run build:shared                     # build only @uniroute/shared (do this after editing shared/src)
docker compose config                    # validate compose file
docker compose up --build <service>      # bring up one service (+ its depends_on chain)
docker compose logs -f <service>         # tail logs for one service
```

Per-package (from a package dir, or `--workspace=packages/<name>` from root):
- Backend services (`api-gateway`, `usuarios-service`, `rutas-service`, `despachos-service`, `websocket-server`): `npm run build` (tsc), `npm run dev` (ts-node), `npm run start` (node dist).
- `shared`: `npm run build` (tsc), `npm run dev` (tsc --watch). **Any consumer of `@uniroute/shared` needs it built first** — Dockerfiles do this automatically, but local/non-Docker workflows must run `npm run build:shared` before other packages will pick up type/const changes (they resolve `@uniroute/shared` to `packages/shared/dist`, not `src`).
- Frontend apps (`app-estudiante`, `app-conductor`, `dashboard-admin`): `npm run dev` (vite), `npm run build` (tsc && vite build), `npm run preview`.

There are no lint or test scripts configured in any package yet.

## Architecture notes

- **`@uniroute/shared` is the contract.** `types/` (user, route, bus, trip, events, api-responses), `constants/` (bus status, user roles, Redis key builders, RabbitMQ exchange/routing-key builders, service registry + `/api/v1` prefix → service-name map), and `utils/` (`boarding-token.ts` for JWT-based QR boarding tokens, `haversine.ts` for distance/ETA). All re-exported from `src/index.ts`. When adding a new cross-service concept, define it here first.
- **Routing table lives in shared, not nginx.** `API_ROUTES` (prefix → service name) and `SERVICE_REGISTRY` (service name → base URL, defaulting to compose hostnames, overridable via `*_SERVICE_URL` env vars) in `constants/service-registry.ts` are what `api-gateway` is meant to use to proxy `/api/v1/*`. nginx only fans out to `api-gateway` as a whole, plus the frontends and the WS server.
- **Bus state model:** a bus has a discrete `BusStatus` (`AT_STOP` → `DEPARTING` → `EN_ROUTE` → `FULL`/`ARRIVED`) plus live GPS/aforo (occupancy) data. State changes are emitted as `BusEvent`s (`STATUS_CHANGE`, `GPS_UPDATE`, `AFORO_UPDATE`, `PROXIMITY_UPDATE`) carrying a `lamportClock` for ordering, published by `despachos-service` to the `bus.events` topic exchange with routing keys like `bus.<busId>.status_change`. The intended consumer is `websocket-server`, off a `ws.bus.events` queue (binding `bus.#`), re-emitting to Socket.io rooms (`route:<routeId>`) — but that consumer isn't implemented yet, see the websocket-server note below.
- **Boarding flow:** students get a JWT `boardingToken` (HMAC-signed, 24h expiry, payload = student id/name/issued/expires — see `boarding-token.ts`); drivers/despachos-service validate it on QR scan to register an `abordaje` and bump `aforoActual`.
- **Auth/RBAC is fail-closed at the gateway.** `usuarios-service` issues the session JWT (`sub`/`id`/`email`/`role`, `JWT_SECRET`, 24h expiry). `api-gateway`'s `authenticateJwt` (`middleware/auth.ts`) verifies it and injects `x-user-id`/`x-user-email`/`x-user-role` headers for downstream services — those services trust the headers and don't re-verify the JWT. `authorizeByRole` (`middleware/rbac.ts`) then checks the request against a hardcoded `permissionRules` table (method + path regex → allowed roles); **any route not explicitly listed is blocked with 403 `RBAC_RULE_NOT_FOUND`**, even with a valid JWT. When adding a new endpoint to any service, you must add its rule to `permissionRules` in `rbac.ts` or it will be unreachable through the gateway. Only `POST /usuarios/registro` and `POST /usuarios/login` are public (listed separately in both `auth.ts` and `rbac.ts`). **Known drift:** `rbac.ts` currently restricts `GET /api/v1/buses` and `GET /api/v1/buses/:id` to `ADMIN` only, while `Contratos_API_REST.md` documents them as `STUDENT, DRIVER, ADMIN` — worth reconciling before students/drivers need bus listings.
- **`rutas-service` implements the full `Contratos_API_REST.md` §2 contract** in a single `index.ts` (no routes/controllers split, unlike `despachos-service`): `GET/POST/PUT/DELETE /rutas`, `GET/POST /rutas/:rutaId/paradas`, `PUT /paradas/:id`, `GET/POST /buses`, `GET /buses/:id`, `PUT /buses/:id/asignar`, `GET /viajes/historial`. Live bus data merges two sources: relational fields from Postgres (`buses`/`rutas` tables) plus ephemeral state read straight from Redis via `REDIS_KEYS.busStatus`/`busAforo` (never hardcode the `bus:{id}:status` key strings). `POST /buses` catches Postgres's `23505` unique-violation code to return `409` on a duplicate `placa`. `GET /health` is a static stub (`{status: 'ok'}`) — it does **not** actually check the Postgres/Redis connections, so a 200 there doesn't mean those dependencies are reachable.
- **`despachos-service` implements the full `Contratos_API_REST.md` §3 contract**, structured as `routes/despachos.routes.ts` → `controllers/despachos.controller.ts` → `services/despachos.service.ts`, with `rabbitmq.ts` (publisher, asserts the `bus.events` topic exchange), `redis.ts`, and `services/lamport.ts` (the `L_srv = max(L_srv, L_msg) + 1` rule) as separate concerns. `requireGatewayAuth`/`requireRole` in `middleware/auth-context.ts` trust the `x-user-*` headers the gateway injects (see the RBAC note above).
- **`websocket-server` is only half-built.** `io.on('connection', ...)` handles `subscribe:route`/`unsubscribe:route` to join/leave Socket.io rooms (`route:{routeId}`), but there is no `amqplib` consumer — it never declares a queue, binds it to the `bus.events` exchange, or re-emits incoming `BusEvent`s to those rooms. `despachos-service` publishes events correctly on its end; they currently have nowhere to land. This is the main remaining piece of T5.9.
- **Workspace dependency gotcha:** each backend service's Dockerfile only runs `npm install --workspace=packages/<service> --workspace=packages/shared` (see the Dockerfile note below), so a dependency declared on the **root** `package.json` instead of the service's own `package.json` installs fine for local/root `npm install` (it gets hoisted) but is invisible inside that service's Docker build — `tsc` fails there with `Cannot find module`. This exact bug happened with `ioredis` in `rutas-service`. Always add a new backend dependency to the specific `packages/<service>/package.json` that imports it, and validate with `docker compose build <service>` (not just a local/root `npm install`) before calling a service done.
- **Database:** `packages/rutas-service/migrations/001_initial_schema.sql` is mounted into Postgres's `docker-entrypoint-initdb.d` (runs only on first container init against an empty volume — edit-and-rerun requires dropping the `postgres_data` volume or writing a new numbered migration, there's no migration runner). Tables: `usuarios`, `rutas`, `paradas`, `buses`, `viajes`, `abordajes`, `eventos_bus`, all UUID-keyed. Seed data's UUIDs are intentionally kept in sync with `packages/shared/src/mocks/*.mock.ts` — if you change one, change the other.
- **Two different TS configs coexist:** backend packages extend root `tsconfig.base.json` (`module: CommonJS`, strict, declarations) with per-package `outDir`/`rootDir`. Frontend packages use an independent Vite-native config (`moduleResolution: bundler`, `noEmit: true`, JSX) — don't try to make them extend `tsconfig.base.json`.
- **Dockerfiles differ by tier:** backend Dockerfiles use the **repo root** as build context (so they can `COPY packages/shared` in) even though they live in `packages/<service>/Dockerfile` — check `docker-compose.yml`'s `build.context`/`dockerfile` pairing before assuming a Dockerfile builds from its own directory. Frontend Dockerfiles build from their own package directory and don't depend on `@uniroute/shared`.
- **nginx serves frontends under path prefixes**, not at `/`: `/estudiante/`, `/conductor/`, `/admin/`. Each Vite app's `base` in `vite.config.ts` matches its prefix — keep them in sync if you rename.
