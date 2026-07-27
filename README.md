# Betco Traders Backend

NestJS architecture for Betco Aqua Traders, covering the future dealer and administration workflows for batteries, inverters, and solar products.

## What is included

- NestJS v11 modular foundation with v1 API routing and Swagger at `/api/docs`.
- PostgreSQL/Neon TypeORM configuration using `DATABASE_URL`, TLS, retries, and a connection-pool limit. `synchronize` is explicitly disabled; versioned SQL migrations create the authentication and product-catalogue tables.
- Implemented authentication, dealer profile, catalogue, daily-stock, order, and administration modules. Billing, payments, notifications, and Tally remain structural modules.
- Username/password JWT authentication with database-controlled `ADMIN` and `USER` roles. The mobile app has one sign-in form; it never lets the device choose a role.
- Global validation, standardized success/error response envelopes, request logging, request IDs, Helmet, compression, CORS, rate limiting, and Winston logging.
- A public health endpoint at `/health`. It is the only functional business-adjacent endpoint.

## Setup

```bash
npm install
Copy-Item .env.example .env
```

Set every value in `.env`, especially `DATABASE_URL`, before starting the API. For Neon, use its PostgreSQL connection string with SSL enabled.

## Neon authentication setup

1. In the Neon SQL Editor, run [`src/database/migrations/001_create_auth_users.sql`](src/database/migrations/001_create_auth_users.sql), followed by [`src/database/migrations/002_create_product_catalog.sql`](src/database/migrations/002_create_product_catalog.sql), [`src/database/migrations/003_create_order_booking_tables.sql`](src/database/migrations/003_create_order_booking_tables.sql), [`src/database/migrations/004_admin_catalogue_daily_stock.sql`](src/database/migrations/004_admin_catalogue_daily_stock.sql), [`src/database/migrations/005_dealer_profile_address.sql`](src/database/migrations/005_dealer_profile_address.sql), [`src/database/migrations/006_orders_status_index.sql`](src/database/migrations/006_orders_status_index.sql), [`src/database/migrations/007_ensure_product_active.sql`](src/database/migrations/007_ensure_product_active.sql), [`src/database/migrations/008_order_workflow_safety_constraints.sql`](src/database/migrations/008_order_workflow_safety_constraints.sql), and [`src/database/migrations/009_add_betco_product_categories.sql`](src/database/migrations/009_add_betco_product_categories.sql).
2. Create a user with a unique username, a phone number, a **bcrypt hash** of that phone number, and role `ADMIN` or `USER`. Do not store a plaintext phone number in `password_hash`.
3. The user signs in once using that phone number as their initial password, then must set a personal password through `POST /v1/auth/change-password`.

The Flutter app calls `POST /v1/auth/login` through the deployed NestJS API. It must not contain `DATABASE_URL` or connect to Neon directly. Neon requires SSL/TLS connections; retain `sslmode=require` in the server-side connection string. [Neon connection guidance](https://neon.com/docs/connect/query-with-psql-editor) and [security overview](https://neon.com/docs/security/security-overview) provide the current SSL requirements.

## Product catalogue

The authenticated `GET /v1/products` endpoint reads active products and category summaries from Neon, in category/name order. It returns an empty array until products are added. The Flutter home screen and Products tab both use this endpoint, so new active records appear automatically after refresh.

Run `002_create_product_catalog.sql` in Neon before using the endpoint. It creates an empty catalogue deliberately; the SQL file includes commented examples for adding a category and product later.

## Dealer order booking

`GET /v1/daily-stock/today` returns every active product, its category, and its current quantity for the Indian calendar day. Products without a row or without positive stock return `quantity: 0` and `isAvailable: false`, so the mobile app displays **Yet to come**. `POST /v1/orders` creates a pending dealer order and reserves the selected quantity atomically, so stock immediately refreshes to the remaining amount. `GET /v1/orders/my-orders` returns the signed-in dealer's booking history with its date, time, status, and total quantity.

Run `003_create_order_booking_tables.sql` before using this feature. It intentionally contains no sample stock, so unavailable products display as **Yet to come** until an administrator adds today's stock record.

## Admin catalogue and stock management

Authenticated administrators can prepare the dealer catalogue without using the Neon SQL editor:

- `GET|POST|PATCH|DELETE /v1/admin/categories`
- `GET|POST|PATCH|DELETE /v1/admin/products`
- `GET|PUT /v1/admin/daily-stock/:date`, `PATCH /v1/admin/daily-stock/:date/products/:productId`, and `POST /v1/admin/daily-stock/:date/copy`
- `GET /v1/admin/dashboard/summary`

Stock records keep both `totalQuantity` and `availableQuantity`; booked quantity is derived as `totalQuantity - availableQuantity`. Admin bulk updates accept `totalQuantity` (recommended) or `availableQuantity`, never both. Updating total stock below the already booked quantity returns a conflict.

Run the new `004_admin_catalogue_daily_stock.sql` migration before using any admin endpoints.

## Admin orders

Administrators can review dealer bookings without direct Neon access:

- `GET /v1/admin/orders` supports pagination, search, status, dealer, date, and sort filters.
- `GET /v1/admin/orders/:id` returns the dealer profile summary and booked product items.

Run `006_orders_status_index.sql` after the earlier migrations. It adds a safe, reversible index for status/date filtered admin-order lists; it does not change existing order data.

## Dealer profile

Authenticated users can read and update only their own profile with:

- `GET /v1/profile`
- `PATCH /v1/profile`

The profile reuses `dealers.business_name` as `shopName` and `dealers.phone` as `contactNumber`. The only new database field is `dealers.address` (`TEXT NULL`) from migration `005_dealer_profile_address.sql`; its rollback is included in that file. The endpoint accepts only `username`, `shopName`, `contactNumber`, and `address`, validates and trims them, and rejects protected fields through the global validation pipe.

Do not run the production migration automatically from the API. To apply only this migration to an explicitly configured Neon database from PowerShell, run:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f src/database/migrations/005_dealer_profile_address.sql
```

To apply the new order-list index only, run:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f src/database/migrations/006_orders_status_index.sql
```

If an older existing `products` table is missing `is_active`, run
`007_ensure_product_active.sql` in the Neon SQL Editor after the earlier migrations.

## Development seed

After applying the migrations, use `npm.cmd run seed:dev` only against a development database. The seed creates or updates two accounts (`admin` and `dealer`) with credentials supplied by `SEED_ADMIN_PASSWORD` and `SEED_USER_PASSWORD`, plus sample categories, products, and today’s stock. It refuses to run with `NODE_ENV=production`.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP server port (default `3000`) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `DATABASE_SSL` | Set `true` for Neon; set `false` only for an intentionally non-TLS local database |
| `JWT_SECRET` | Future JWT signing secret |
| `JWT_EXPIRES` | Access-token lifetime, set to `15d` by default |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated |
| `NODE_ENV` | `development`, `test`, or `production` |
| `TALLY_CONNECTOR_SECRET` | Future Tally connector credential |
| `TALLY_CONNECTOR_ID` | Future Tally connector identifier |

## Commands

```bash
npm run build
npm run start:dev
npm run lint
npm test
npm run test:e2e
```

All successful application endpoints use this envelope:

```json
{
  "success": true,
  "message": "Request completed",
  "data": {},
  "timestamp": "2026-07-25T00:00:00.000Z"
}
```

## Render deployment

1. Create a new Render Web Service from this repository.
2. Set the build command to `npm install && npm run build`.
3. Set the start command to `npm run start:prod`.
4. Add the environment variables from `.env.example` in Render’s environment settings; use your Neon `DATABASE_URL`.
5. Set `NODE_ENV=production` and configure `CORS_ORIGIN` to the deployed Flutter web origin if applicable.

TallyPrime, billing, payments, and notifications remain structural placeholders. Catalogue, daily stock, dealer profile, and order booking are implemented server-side.
#   B E T C O _ A P P  
 