# Betco Traders Backend

NestJS API for the Betco Aqua Traders mobile application. It uses Neon PostgreSQL through TypeORM and exposes URI-versioned routes under `/v1`.

## Production deployment

This project is ready for a Render Web Service with these commands:

```text
Build Command: npm ci && npm run build
Start Command: npm run start:prod
Health Check Path: /health
```

`start:prod` runs `node dist/main`. The application binds to `0.0.0.0` and reads Render's `PORT` variable. The repository contains an `.npmrc` with `include=dev`; this ensures the Nest CLI and TypeScript compiler are available to the exact build command even when Render builds with `NODE_ENV=production`.

Create the Render service, add the environment variables below, deploy, then confirm:

```text
GET https://<your-render-service>.onrender.com/health
```

The health endpoint is intentionally a lightweight liveness check. A successful response is wrapped in the standard API envelope.

## Required environment variables

Copy `.env.example` for local development. Do not upload `.env` or database credentials to Git.

| Variable                                        | Required           | Production value                                                                    |
| ----------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                                  | Yes                | Neon pooled or direct PostgreSQL connection string with `sslmode=require`           |
| `JWT_SECRET`                                    | Yes                | Long random secret, unique to this environment                                      |
| `NODE_ENV`                                      | Yes                | `production`                                                                        |
| `PORT`                                          | Render supplies it | Do not hardcode it                                                                  |
| `DATABASE_SSL`                                  | Recommended        | `true` for Neon                                                                     |
| `JWT_EXPIRES_IN`                                | No                 | Token lifetime, default `15d`                                                       |
| `CORS_ORIGIN`                                   | Optional           | Explicit comma-separated HTTPS browser origins; leave empty for a native-only app   |
| `SWAGGER_ENABLED`                               | Optional           | `false` by default in production; set `true` only when public API docs are intended |
| `TALLY_CONNECTOR_ID` / `TALLY_CONNECTOR_SECRET` | Optional           | Set only when the Tally connector is used                                           |

`JWT_EXPIRES` remains accepted for compatibility with older Render environments, but new deployments should use `JWT_EXPIRES_IN`.

Firebase is not configured in this backend, so no Firebase environment variables are required.

## Neon database

The API reads `DATABASE_URL` at startup, enables TLS for Neon and in production, retries initial connections, limits its pool size, and keeps `synchronize: false`. It never auto-runs schema changes.

Apply the SQL files in `src/database/migrations` manually, in numeric order, using the **Neon SQL Editor** for the target database. The current migration set is `001` through `012`; `012_admin_dealer_analytics_indexes.sql` is the latest performance index migration.

Do not run the development seed against a production Neon database. `npm run seed:dev` refuses `NODE_ENV=production`.

The business calendar is fixed to `Asia/Kolkata` throughout stock and order logic. Render's server timezone does not alter those calculations.

## Security and observability

- Helmet, compression, strict global validation, request IDs, JSON logs, and a global request throttle are enabled.
- CORS is disabled for browser requests by default in production. If a browser client needs it, set explicit origins; `CORS_ORIGIN=*` is rejected in production.
- JWT signing and verification fail fast when `JWT_SECRET` is missing.
- Unexpected server errors are logged server-side with their request ID, while clients receive a generic `Internal server error` rather than database details.
- Swagger is available at `/api/docs` in development. It is disabled by default in production.

## Verification commands

```bash
npm ci
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run start:prod
```

After startup, use `GET /health` and then stop the local process. No uploads, local data storage, Windows-only paths, or Firebase initialization are required by the running service.

## API conventions

Controllers use URI versioning (`/v1/...`), except for the neutral `/health` route. Successful responses use:

```json
{
  "success": true,
  "message": "Request completed",
  "data": {},
  "timestamp": "2026-07-27T00:00:00.000Z"
}
```
