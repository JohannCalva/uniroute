# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

UniRoute — a distributed platform coordinating intercampus university buses for UDLA (Quito, Ecuador). Students board buses via QR/token, drivers report GPS and bus status, and both see live updates via WebSockets. Bus events flow through RabbitMQ; ordering across services is tracked with a Lamport clock (see `lamportClock` fields throughout `packages/shared`).

**Status:** this started as a generated infrastructure scaffold and is now partially implemented. The npm workspaces, Docker Compose topology, shared TypeScript types/constants/utils, mock data, and the Postgres schema (with seed data) are all real. `usuarios-service` has real auth: `POST /registro` (bcrypt hash, `@udla.edu.ec` email domain enforced via zod), `POST /login` (issues a JWT with `id`/`email`/`role`, 24h expiry), `GET /me`, and `GET /me/boarding-token` (STUDENT-only, issues the HMAC `boardingToken` from `boarding-token.ts`). `api-gateway` now actually proxies via `http-proxy-middleware` (`proxy.ts`, routed through `API_ROUTES`/`SERVICE_REGISTRY`) and enforces `authenticateJwt` (`middleware/auth.ts`) + fail-closed RBAC (`middleware/rbac.ts`) in front of it — see the RBAC note below. `rutas-service`, `despachos-service`, `websocket-server`, and all three frontend apps (`app-estudiante`, `app-conductor`, `dashboard-admin`) are still stubs/placeholders with no business logic. Treat the shapes in `packages/shared` and `migrations/001_initial_schema.sql` as the contract to implement against for the still-stubbed services.

## Monorepo layout

npm workspaces (`packages/*`), single root `package.json`, root `tsconfig.base.json` extended by every backend package.

| Package | Role | Port |
|---|---|---|
| `packages/shared` (`@uniroute/shared`) | Shared types, constants, utils, mocks — the source of truth for cross-service contracts | — |
| `packages/api-gateway` | Express entrypoint, routes `/api/v1/*` to backend services by prefix | 3000 |
| `packages/usuarios-service` | Users/auth — registro, login, perfil, boarding token (implemented) | 3001 |
| `packages/rutas-service` | Routes/stops/buses/trips + owns the Postgres schema/migrations | 3002 |
| `packages/websocket-server` | Socket.io server, consumes RabbitMQ bus events, pushes to clients | 3003 |
| `packages/despachos-service` | Boarding/dispatch (QR scans, proximity) | 3004 |
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
- **Bus state model:** a bus has a discrete `BusStatus` (`AT_STOP` → `DEPARTING` → `EN_ROUTE` → `FULL`/`ARRIVED`) plus live GPS/aforo (occupancy) data. State changes are emitted as `BusEvent`s (`STATUS_CHANGE`, `GPS_UPDATE`, `AFORO_UPDATE`, `PROXIMITY_UPDATE`) carrying a `lamportClock` for ordering, published to the `bus.events` topic exchange with routing keys like `bus.<busId>.status_change`, consumed by `websocket-server` off the `ws.bus.events` queue (binding `bus.#`) and re-emitted to Socket.io rooms (`route:<routeId>`).
- **Boarding flow:** students get a JWT `boardingToken` (HMAC-signed, 24h expiry, payload = student id/name/issued/expires — see `boarding-token.ts`); drivers/despachos-service validate it on QR scan to register an `abordaje` and bump `aforoActual`.
- **Auth/RBAC is fail-closed at the gateway.** `usuarios-service` issues the session JWT (`sub`/`id`/`email`/`role`, `JWT_SECRET`, 24h expiry). `api-gateway`'s `authenticateJwt` (`middleware/auth.ts`) verifies it and injects `x-user-id`/`x-user-email`/`x-user-role` headers for downstream services — those services trust the headers and don't re-verify the JWT. `authorizeByRole` (`middleware/rbac.ts`) then checks the request against a hardcoded `permissionRules` table (method + path regex → allowed roles); **any route not explicitly listed is blocked with 403 `RBAC_RULE_NOT_FOUND`**, even with a valid JWT. When adding a new endpoint to any service, you must add its rule to `permissionRules` in `rbac.ts` or it will be unreachable through the gateway. Only `POST /usuarios/registro` and `POST /usuarios/login` are public (listed separately in both `auth.ts` and `rbac.ts`).
- **Database:** `packages/rutas-service/migrations/001_initial_schema.sql` is mounted into Postgres's `docker-entrypoint-initdb.d` (runs only on first container init against an empty volume — edit-and-rerun requires dropping the `postgres_data` volume or writing a new numbered migration, there's no migration runner). Tables: `usuarios`, `rutas`, `paradas`, `buses`, `viajes`, `abordajes`, `eventos_bus`, all UUID-keyed. Seed data's UUIDs are intentionally kept in sync with `packages/shared/src/mocks/*.mock.ts` — if you change one, change the other.
- **Two different TS configs coexist:** backend packages extend root `tsconfig.base.json` (`module: CommonJS`, strict, declarations) with per-package `outDir`/`rootDir`. Frontend packages use an independent Vite-native config (`moduleResolution: bundler`, `noEmit: true`, JSX) — don't try to make them extend `tsconfig.base.json`.
- **Dockerfiles differ by tier:** backend Dockerfiles use the **repo root** as build context (so they can `COPY packages/shared` in) even though they live in `packages/<service>/Dockerfile` — check `docker-compose.yml`'s `build.context`/`dockerfile` pairing before assuming a Dockerfile builds from its own directory. Frontend Dockerfiles build from their own package directory and don't depend on `@uniroute/shared`.
- **nginx serves frontends under path prefixes**, not at `/`: `/estudiante/`, `/conductor/`, `/admin/`. Each Vite app's `base` in `vite.config.ts` matches its prefix — keep them in sync if you rename.
