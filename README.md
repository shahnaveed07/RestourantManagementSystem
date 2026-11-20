# Passline — Restaurant Management System

Full-stack restaurant operations platform built with Express.js, Mongoose (MongoDB), Socket.IO, React, Vite, Tailwind CSS, Recharts, and `qrcode.react`.

## Setup Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env`.
   - Set `MONGODB_URI` to connect to local MongoDB or MongoDB Atlas.
   - Leave `MONGODB_URI` empty to use the built-in persistent local JSON store (`.data/passline-db.json`) automatically.

3. **Seed demo data (staff accounts, 12 tables with QR tokens, 4 categories, 30 dishes, sample sales):**
   ```bash
   npm run seed
   ```

4. **Run the full-stack server (API + Socket.IO + React client on port 3000):**
   ```bash
   npm run dev
   ```

5. **Run unit tests:**
   ```bash
   npx --yes tsx --test server/src/services/orderCalculator.test.ts
   ```

## Demo Accounts (`DEMO_MODE=true`)

| Role | Email | Password | Access |
|---|---|---|---|
| **Admin** | `admin@demo.com` | `Admin@123` | Full access: Overview, Live Orders, Live Calls, Tables & QR, Menu, Kitchen, Waiter, Billing, Reports, Staff & Audit, Demo Tools |
| **Manager** | `manager@demo.com` | `Manager@123` | Overview, Live Orders, Live Calls, Tables & QR, Menu, Kitchen, Waiter, Billing, Reports |
| **Waiter** | `waiter@demo.com` | `Waiter@123` | Waiter Floor, Live Orders, Live Calls, Tables & QR, Billing |
| **Kitchen** | `kitchen@demo.com` | `Kitchen@123` | High-contrast Kitchen Display System (KDS) |
| **Guest** | *(unauthenticated)* | — | Scan or open `/t/<qrToken>` (e.g. `/t/t01-linden01`) |

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP + WebSocket server port | `3000` |
| `MONGODB_URI` | MongoDB connection string (optional; falls back to persistent local store) | `""` |
| `JWT_SECRET` | Secret for signing JWT access tokens | dev default |
| `JWT_REFRESH_SECRET` | Secret for signing JWT refresh tokens | dev default |
| `DEMO_MODE` | Enables DEMO banner, 1-click demo login, and Admin Demo Tools | `true` |
| `RESTAURANT_NAME` | Restaurant name shown across dashboards, QR sheets, and receipts | `Linden & Rye` |
| `TAX_RATE` | Decimal tax rate applied server-side to orders and bills | `0.08` |
| `CORS_ORIGIN` | Optional comma-separated CORS allow-list | same-origin |
| `APP_URL` | Public URL used for self-referential links | `http://localhost:3000` |
