# PassLine Restaurant — Cloudflare Full-Stack WebApp

PassLine Restaurant is a full-stack restaurant management, QR table ordering, kitchen display (KDS), waiter operations, billing, and analytics platform running **100% on Cloudflare**:

- **Frontend:** React 19 + Vite + Tailwind CSS served by Cloudflare Workers Static Assets (`./dist`) with SPA fallback.
- **Backend API:** Single Cloudflare Worker using **Hono** (`/api/*`) on the same origin (no CORS required; `HttpOnly; Secure; SameSite=Lax` cookies).
- **Database:** **Cloudflare D1 (SQLite)** with parameterized queries, batched transactions, and schema migrations (`migrations/0001_init.sql`).
- **Realtime:** **Durable Object (`Hub`)** using the **WebSocket Hibernation API** (`/ws`) for instant order, kitchen, waiter call, table status, and menu availability updates.
- **Security:** Web Crypto **PBKDF2-SHA256** (`100,000` iterations) password hashing, **`jose`** HS256 JWTs (`15m` access + `7d` rotating D1 refresh tokens), Web Crypto HMAC-SHA256 OTP verification, HTTP-only SMS (Twilio / MSG91) and Email (Resend) delivery, Durable Object rate limiting, hourly scheduled cleanup cron, and hard refusal to handle requests if `DEMO_MODE=true` in `ENVIRONMENT=production`.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy local Worker secrets template (optional in dev; auto-generated ephemeral secrets if omitted)
cp .dev.vars.example .dev.vars

# 3. Apply local D1 schema migration
npm run db:migrate:local

# 4. Seed demo data (optional — also auto-seeds on first request when DEMO_MODE=true)
npm run db:seed

# 5. Build frontend and run Cloudflare Worker + D1 + Durable Object locally on port 3000
npm run dev
```

Open `http://localhost:3000`.

### Optional Vite Dev Server with API/WS Proxy

```bash
# Terminal 1: run Worker on port 3000
npm run start
# Terminal 2: run Vite hot reload server proxying /api and /ws to port 3000
npm run dev:vite
```

### Tests & Verification

```bash
# Run pure-logic unit tests (order calculator, OTP policy, PBKDF2 crypto, cart, auth validation)
npm test

# Lint all JS/JSX files
npm run lint

# Run end-to-end API, D1, RBAC, cookie rotation, SPA fallback, and WebSocket auth smoke test
npm run smoke
```

---

## Deploying to Cloudflare

1. `npm install`
2. `npx wrangler d1 create restaurant-db`
3. Copy the returned `database_id` into `wrangler.jsonc` under `d1_databases[0].database_id`.
4. `npx wrangler d1 migrations apply restaurant-db --remote`
5. *(Optional for staging/demo)* `npx wrangler d1 execute restaurant-db --remote --file=worker/seed.sql`
6. Set production secrets via Wrangler:
   ```bash
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put OTP_HASH_SECRET
   # Production SMS / Email OTP providers (configure whichever you use):
   npx wrangler secret put TWILIO_ACCOUNT_SID
   npx wrangler secret put TWILIO_AUTH_TOKEN
   npx wrangler secret put TWILIO_FROM_NUMBER
   npx wrangler secret put EMAIL_API_KEY
   # Optional Turnstile / hCaptcha anti-spam secret:
   npx wrangler secret put CAPTCHA_SECRET
   ```
7. Update `wrangler.jsonc` `vars` for production (`"ENVIRONMENT": "production"`, `"DEMO_MODE": "false"`, `"APP_ORIGIN": "https://your-domain.workers.dev"`).
   > **Safety Guard:** The Worker refuses all requests with `503 Service Unavailable` if `DEMO_MODE="true"` when `ENVIRONMENT="production"`.
8. `npm run build`
9. `npx wrangler deploy`

---

## Demo Credentials (`DEMO_MODE=true` only)

| Role | Email | Mobile | Password / OTP |
| --- | --- | --- | --- |
| **Admin** | `admin@demo.com` | — | `Admin@123` |
| **Manager** | `manager@demo.com` | — | `Manager@123` |
| **Waiter** | `waiter@demo.com` | — | `Waiter@123` |
| **Kitchen** | `kitchen@demo.com` | — | `Kitchen@123` |
| **Customer 1** | `customer@demo.com` | `+919999999991` | OTP `123456` |
| **Customer 2** | `guest@demo.com` | `+919999999992` | OTP `123456` |

Sample Guest QR URL: `/t/t03-linden03`

---

## Rate Limits (Durable Object-Backed)

- Staff password / demo login: `60` requests / `10 min` per IP
- OTP request: `10` / `hour` per IP, `3` / `15 min` per identifier, `30s` resend cooldown
- OTP verify: `30` / `15 min` per IP, `10` / `15 min` per identifier, max `5` wrong attempts per code
- Guest QR orders & service calls: `10` / `10 min` per table session
- Customer home orders: `10` / `10 min` per customer
