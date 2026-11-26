# PassLine Restaurant — Restaurant Management System

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
   node --test server/src/services/orderCalculator.test.js server/src/services/otpLogic.test.js src/utils/cart.test.js src/utils/authValidation.test.js
   ```

## Ordering flow

Every order in the system is linked to a dining table (`tableId`, `tableNumberSnapshot`, and `source`: `qr`, `home`, or `staff`):

- **QR table ordering (`/t/:qrToken`)**: Guests scanning a table QR code have their table automatically bound and locked (`Table N (from QR code)`). They can place table orders and send waiter/bill service calls directly to that table's open session.
- **Home storefront ordering (`/`)**: Guests can browse the menu and build a cart without logging in. At checkout, they select an available table (`free` or `occupied`) from the public table grid (`GET /api/tables/public`), authenticate via Mobile or Email OTP, and submit (`POST /api/orders` with `source: "home"`). Tables marked `reserved` or `cleaning` cannot accept new orders (HTTP `409`).
- **Unified Staff & Billing flow**: Both QR and Home orders on the same table share the table's active `sessionId`, stream live over Socket.IO to Kitchen, Waiter, and Live Orders with a `QR` / `Home` / `Staff` badge, and consolidate onto one table bill. Settling a table defaults its status to `cleaning` until staff confirms it `free`.

## Demo Accounts (`DEMO_MODE=true`)

| Role | Identifier | Credential / OTP | Access |
|---|---|---|---|
| **Admin** | `admin@demo.com` | `Admin@123` | Full access: Overview, Live Orders, Live Calls, Tables & QR, Menu, Kitchen, Waiter, Billing, Reports, Staff & Audit, Demo Tools |
| **Manager** | `manager@demo.com` | `Manager@123` | Overview, Live Orders, Live Calls, Tables & QR, Menu, Kitchen, Waiter, Billing, Reports |
| **Waiter** | `waiter@demo.com` | `Waiter@123` | Waiter Floor, Live Orders, Live Calls, Tables & QR, Billing |
| **Kitchen** | `kitchen@demo.com` | `Kitchen@123` | High-contrast Kitchen Display System (KDS) |
| **Customer 1** | `9999999991` / `customer@demo.com` | OTP `123456` (or 1-click Demo Customer) | Home storefront checkout, table selection, live My Orders |
| **Customer 2** | `9999999992` / `guest@demo.com` | OTP `123456` | Home storefront checkout, table selection, live My Orders |
| **Guest (QR)** | *(unauthenticated)* | — | Scan or open `/t/<qrToken>` (e.g. `/t/t01-linden01`) |

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP + WebSocket server port | `3000` |
| `NODE_ENV` | Runtime environment (`development` or `production`) | `development` |
| `MONGODB_URI` | MongoDB connection string (optional; falls back to persistent local store) | `""` |
| `JWT_SECRET` | Secret for signing 15-minute JWT access tokens | dev default |
| `JWT_REFRESH_SECRET` | Secret for signing 7-day JWT refresh tokens | dev default |
| `DEMO_MODE` | Enables DEMO banner, 1-click demo login, fixed demo OTP, and Admin Demo Tools (server refuses to start if `true` in `production`) | `true` |
| `DEMO_OTP` | Fixed 6-digit OTP accepted only when `DEMO_MODE=true` | `123456` |
| `OTP_EXPIRY_MINUTES` | OTP validity window in minutes | `5` |
| `OTP_MAX_ATTEMPTS` | Maximum wrong OTP attempts before invalidation | `5` |
| `OTP_SECRET` | Secret key used to HMAC-SHA256 hash stored OTPs | dev default |
| `OTP_SMS_PROVIDER` | SMS provider (`twilio` or `msg91`) | `twilio` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (for production SMS OTP) | `""` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | `""` |
| `TWILIO_FROM_NUMBER` | Twilio sender phone number | `""` |
| `MSG91_AUTH_KEY` | MSG91 API auth key (alternative SMS provider) | `""` |
| `MSG91_TEMPLATE_ID` | MSG91 DLT template ID | `""` |
| `MSG91_SENDER_ID` | MSG91 sender ID | `""` |
| `SMTP_HOST` | SMTP host for Nodemailer email OTP delivery | `""` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `""` |
| `SMTP_PASS` | SMTP password | `""` |
| `SMTP_FROM` | Sender address for OTP emails | `no-reply@passlinerestaurant.local` |
| `CAPTCHA_PROVIDER` | Optional CAPTCHA provider (`turnstile` or `hcaptcha`) | `turnstile` |
| `CAPTCHA_SITE_KEY` | Optional CAPTCHA site key | `""` |
| `CAPTCHA_SECRET` | Optional CAPTCHA verification secret (enabled when set) | `""` |
| `RESTAURANT_NAME` | Restaurant name shown across dashboards, QR sheets, and receipts | `PassLine Restaurant` |
| `TAX_RATE` | Decimal tax rate applied server-side to orders and bills | `0.08` |
| `CORS_ORIGIN` | Optional comma-separated CORS allow-list | same-origin |
| `APP_URL` | Public URL used for self-referential QR links | `http://localhost:3000` |
