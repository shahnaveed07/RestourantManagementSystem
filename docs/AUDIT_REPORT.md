# Passline Restaurant Management System — Audit Report

**Project Root:** `/app/applet` (Single-package MERN + Vite JSX codebase: frontend in `src/`, backend in `server/`, entry `server.js`)  
**Audit Date:** 2026-11-20  
**Scope:** Client routes, server REST API routes, Axios/fetch API calls, Socket.IO events, navigation links, environment variables, RBAC/auth logic, order/billing state machines, QR table session flow, forms/validation, and seed consistency.

---

## 1. System Inventory

### 1.1 Client Routes (`src/App.jsx` & `src/routes/ProtectedRoute.jsx`)

| Path | Component | Access / Protection | Notes |
| --- | --- | --- | --- |
| `/` | `HomePage` | Public | Storefront menu, search/filter, floating cart |
| `/login` | `LoginPage` (`initialMode="login"`) | Public | Customer OTP + Staff password + Demo quick login |
| `/signup` | `LoginPage` (`initialMode="signup"`) | Public | Customer OTP signup entry |
| `/t/:qrToken` | `GuestMenuPage` | Public (QR token verified by API) | Table QR menu, order tracker, service call |
| `/dashboard` | `DashboardPage` | `RoleRoute` (`admin`, `manager`) | Shift KPIs, charts, live pulse |
| `/orders` | `LiveOrdersPage` | `RoleRoute` (`admin`, `manager`, `waiter`) | Kanban order board |
| `/calls` | `LiveCallsPage` | `RoleRoute` (`admin`, `manager`, `waiter`) | Service call queue + overdue alerts |
| `/tables` | `TablesPage` | `RoleRoute` (`admin`, `manager`, `waiter`) | Dining floor grid, status, QR viewer |
| `/menu` | `MenuPage` | `RoleRoute` (`admin`, `manager`) | Dish/category CRUD, availability, bulk price |
| `/kitchen` | `KitchenPage` | `RoleRoute` (`admin`, `manager`, `kitchen`) | High-contrast Kitchen Display System (KDS) |
| `/waiter` | `WaiterPage` | `RoleRoute` (`admin`, `manager`, `waiter`) | Waiter floor view + manual order creation |
| `/billing` | `BillingPage` | `RoleRoute` (`admin`, `manager`, `waiter`) | Consolidated table bill settlement & receipts |
| `/reports` | `ReportsPage` | `RoleRoute` (`admin`, `manager`) | Date-filtered analytics & CSV export |
| `/staff` | `StaffPage` | `RoleRoute` (`admin`) | Staff accounts & audit log |
| `/demo-tools` | `DemoToolsPage` | `RoleRoute` (`admin`) | Demo traffic simulators, time travel, reset |
| `*` | Redirect to `/` *(Broken — should be 404 page)* | Public | Currently swallows unknown URLs |

---

### 1.2 Server REST Routes (`server/src/routes/api.js`, mounted at `/api` in `server.js:53`)

| Method | Path | Middleware | Handler / Purpose | Line |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Health check & storage engine status | `230` |
| `GET` | `/api/config` | Public | Restaurant name, demoMode, taxRate, tables | `239` |
| `POST` | `/api/auth/otp/request` | `otpRequestIpLimiter`, `otpRequestIdentifierLimiter` | Request 6-digit OTP (mobile/email) | `286` |
| `POST` | `/api/auth/otp/verify` | `otpVerifyIpLimiter`, `otpVerifyIdentifierLimiter` | Verify OTP & login/signup customer | `392` |
| `POST` | `/api/auth/password/login` | `loginLimiter` | Staff email/password login | `557` |
| `POST` | `/api/auth/login` | `loginLimiter` | Alias to `handleStaffPasswordLogin` | `558` |
| `POST` | `/api/auth/set-password` | `authenticate` | Set/update authenticated user password | `560` |
| `POST` | `/api/auth/demo-login` | `loginLimiter` | One-click demo role login (requires `DEMO_MODE=true`) | `575` |
| `POST` | `/api/auth/refresh` | Refresh cookie check | Rotate 15m access & 7d refresh tokens | `612` |
| `POST` | `/api/auth/logout` | Public | Clear `passline_access` and `passline_refresh` cookies | `638` |
| `GET` | `/api/auth/session` | Public (optional token/cookie) | Hydrate current user session | `643` |
| `GET` | `/api/auth/me` | `authenticate` | Return current user profile | `678` |
| `GET` | `/api/guest/table/:qrToken` | Public | Load table, categories, menu, active table orders & calls | `691` |
| `POST` | `/api/guest/table/:qrToken/orders` | `guestOrderLimiter`, conditional `authenticate` (`!demoMode`) | Place guest QR order | `752` |
| `POST` | `/api/guest/table/:qrToken/calls` | `guestCallLimiter` | Create guest service call | `830` |
| `GET` | `/api/tables` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | List tables enriched with open totals | `875` |
| `POST` | `/api/tables` | `authenticate`, `requireRole('admin', 'manager')` | Create dining table + QR token | `908` |
| `PUT` | `/api/tables/:id` | `authenticate`, `requireRole('admin', 'manager')` | Update table details/status | `935` |
| `PATCH` | `/api/tables/:id/status` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | Update table status | `965` |
| `POST` | `/api/tables/:id/rotate-qr` | `authenticate`, `requireRole('admin', 'manager')` *(Issue: should be `admin` only)* | Rotate table QR token | `986` |
| `DELETE` | `/api/tables/:id` | `authenticate`, `requireRole('admin', 'manager')` | Delete table | `1003` |
| `GET` | `/api/tables/:id/history` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | Table orders & calls history | `1015` |
| `GET` | `/api/menu` | Public | List active categories & menu items | `1033` |
| `POST` | `/api/menu/categories` | `authenticate`, `requireRole('admin', 'manager')` | Create menu category | `1041` |
| `PUT` | `/api/menu/categories/:id` | `authenticate`, `requireRole('admin', 'manager')` | Update menu category | `1063` |
| `DELETE` | `/api/menu/categories/:id` | `authenticate`, `requireRole('admin', 'manager')` | Delete menu category | `1087` |
| `POST` | `/api/menu/items` | `authenticate`, `requireRole('admin', 'manager')` | Create menu dish | `1112` |
| `PUT` | `/api/menu/items/:id` | `authenticate`, `requireRole('admin', 'manager')` | Update menu dish | `1139` |
| `PATCH` | `/api/menu/items/:id/availability` | `authenticate`, `requireRole('admin', 'manager', 'kitchen')` | Toggle live dish availability | `1160` |
| `POST` | `/api/menu/items/bulk-price` | `authenticate`, `requireRole('admin', 'manager')` | Bulk adjust prices | `1186` |
| `DELETE` | `/api/menu/items/:id` | `authenticate`, `requireRole('admin', 'manager')` | Delete menu dish | `1228` |
| `GET` | `/api/orders` | `authenticate` | List orders (filtered to own orders if `customer`) | `1243` |
| `POST` | `/api/orders` | `authenticate`, `requireRole('admin', 'manager', 'waiter', 'customer')` | Place customer web / staff manual order | `1277` |
| `PATCH` | `/api/orders/:id/status` | `authenticate` *(Missing `requireRole`!)* | Advance/cancel order status | `1366` |
| `PATCH` | `/api/orders/:id/items/:itemIndex/status` | `authenticate`, `requireRole('admin', 'manager', 'kitchen')` | Update single item kitchen status | `1431` |
| `GET` | `/api/calls` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | List service calls | `1476` |
| `PATCH` | `/api/calls/:id/acknowledge` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | Acknowledge service call | `1488` |
| `PATCH` | `/api/calls/:id/resolve` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | Resolve service call | `1509` |
| `GET` | `/api/billing/tables` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | Open table tabs for billing | `1534` |
| `POST` | `/api/billing/table/:tableId/pay` | `authenticate`, `requireRole('admin', 'manager', 'waiter')` | Record consolidated payment & close table | `1561` |
| `GET` | `/api/reports/summary` | `authenticate`, `requireRole('admin', 'manager')` | Shift & date-range sales analytics | `1653` |
| `GET` | `/api/reports/export` | `authenticate`, `requireRole('admin', 'manager')` | Download CSV sales report | `1791` |
| `GET` | `/api/staff` | `authenticate`, `requireRole('admin')` | List staff accounts & audit logs | `1841` |
| `POST` | `/api/staff` | `authenticate`, `requireRole('admin')` | Create staff account | `1856` |
| `PUT` | `/api/staff/:id` | `authenticate`, `requireRole('admin')` | Update staff role/active/name | `1889` |
| `POST` | `/api/staff/:id/reset-password` | `authenticate`, `requireRole('admin')` | Reset staff password | `1915` |
| `GET` | `/api/demo/status` | `authenticate`, `requireRole('admin')`, `demoMode` | Demo autoplay status | `2043` |
| `POST` | `/api/demo/simulate-order` | `authenticate`, `requireRole('admin')`, `demoMode` | Create simulated QR order | `2051` |
| `POST` | `/api/demo/simulate-call` | `authenticate`, `requireRole('admin')`, `demoMode` | Create simulated service call | `2061` |
| `POST` | `/api/demo/autoplay` | `authenticate`, `requireRole('admin')`, `demoMode` | Toggle traffic autoplay timer | `2072` |
| `POST` | `/api/demo/time-travel` | `authenticate`, `requireRole('admin')`, `demoMode` | Backdate open orders/calls | `2117` |
| `POST` | `/api/demo/reset` | `authenticate`, `requireRole('admin')`, `demoMode` | Wipe and reseed database | `2161` |

---

### 1.3 Client API Calls (`src/api/client.js` & Page Overrides)

All methods in `src/api/client.js` use Axios instance `http` (`baseURL: '/api'`, `withCredentials: true`, lines `25-29`):
- `getConfig`: `GET /config` (`100`) -> `AuthContext.jsx:27`
- `requestOtp`: `POST /auth/otp/request` (`103`) -> `AuthContext.jsx:64`
- `verifyOtp`: `POST /auth/otp/verify` (`104`) -> `AuthContext.jsx:68`
- `passwordLogin` / `login`: `POST /auth/password/login` (`107-110`) -> `AuthContext.jsx:76`
- `setPassword`: `POST /auth/set-password` (`113`) -> *(unused helper)*
- `demoLogin`: `POST /auth/demo-login` (`114`) -> `AuthContext.jsx:84`
- `refreshSession`: `POST /auth/refresh` (`115`) -> *(interceptor uses `http.post('/auth/refresh')` directly on line `58`)*
- `logout`: `POST /auth/logout` (`116`) -> `AuthContext.jsx:93`
- `me`: `GET /auth/me` (`117`) -> *(unused helper)*
- `getSession`: `GET /auth/session` (`118`) -> `AuthContext.jsx:39`
- `getGuestTableData`: `GET /guest/table/:qrToken` (`121`) -> `GuestMenuPage.jsx:97`
- `placeGuestOrder`: `POST /guest/table/:qrToken/orders` (`124`) -> `GuestMenuPage.jsx:255`
- `createGuestCall`: `POST /guest/table/:qrToken/calls` (`127`) -> `GuestMenuPage.jsx:274`
- `listTables`: `GET /tables` (`131`) -> `TablesPage.jsx:51`, `WaiterPage.jsx:51`, `DemoToolsPage.jsx:29`
- `createTable`: `POST /tables` (`132`) -> `TablesPage.jsx:125`
- `updateTable`: `PUT /tables/:id` (`133`) -> *(helper)*
- `updateTableStatus`: `PATCH /tables/:id/status` (`134`) -> `TablesPage.jsx:94`
- `rotateTableQr`: `POST /tables/:id/rotate-qr` (`135`) -> `TablesPage.jsx:107`
- `deleteTable`: `DELETE /tables/:id` (`136`) -> *(helper)*
- `getTableHistory`: `GET /tables/:id/history` (`137`) -> `TablesPage.jsx:85`
- `getMenu`: `GET /menu` (`140`) -> `HomePage.jsx:69`, `MenuPage.jsx:58`, `WaiterPage.jsx:54`, `DemoToolsPage.jsx:30`
- `createCategory`: `POST /menu/categories` (`141`) -> `MenuPage.jsx:201`
- `updateCategory`: `PUT /menu/categories/:id` (`142`) -> *(helper)*
- `deleteCategory`: `DELETE /menu/categories/:id` (`143`) -> *(helper)*
- `createMenuItem`: `POST /menu/items` (`144`) -> `MenuPage.jsx:165`
- `updateMenuItem`: `PUT /menu/items/:id` (`145`) -> `MenuPage.jsx:161`
- `toggleMenuItemAvailability`: `PATCH /menu/items/:id/availability` (`146`) -> `MenuPage.jsx:177`, `DemoToolsPage.jsx:103`
- `bulkPriceUpdate`: `POST /menu/items/bulk-price` (`148`) -> `MenuPage.jsx:222`
- `deleteMenuItem`: `DELETE /menu/items/:id` (`149`) -> `MenuPage.jsx:189`
- `listOrders`: `GET /orders` (`152`) -> `SocketContext.jsx:30`, `HomePage.jsx:123`, `DashboardPage.jsx:41`, `LiveOrdersPage.jsx:50`, `KitchenPage.jsx:18`, `WaiterPage.jsx:52`
- `createOrder` / `createStaffOrder`: `POST /orders` (`153-154`) -> `CartDrawer.jsx:67`, `GuestMenuPage.jsx:254`, `WaiterPage.jsx:154`
- `updateOrderStatus`: `PATCH /orders/:id/status` (`155`) -> `LiveOrdersPage.jsx:103`, `KitchenPage.jsx:88`, `WaiterPage.jsx:105`
- `updateOrderItemStatus`: `PATCH /orders/:id/items/:itemIndex/status` (`156`) -> `KitchenPage.jsx:69`
- `listCalls`: `GET /calls` (`160`) -> `SocketContext.jsx:33`, `DashboardPage.jsx:42`, `LiveCallsPage.jsx:24`, `WaiterPage.jsx:53`
- `acknowledgeCall`: `PATCH /calls/:id/acknowledge` (`161`) -> `LiveCallsPage.jsx:63`, `WaiterPage.jsx:115`
- `resolveCall`: `PATCH /calls/:id/resolve` (`162`) -> `LiveCallsPage.jsx:76`, `WaiterPage.jsx:125`
- `getBillingTables`: `GET /billing/tables` (`165`) -> `BillingPage.jsx:32`
- `recordPayment`: `POST /billing/table/:tableId/pay` (`166`) -> `BillingPage.jsx:82`
- `getReportsSummary`: `GET /reports/summary` (`169`) -> `DashboardPage.jsx:40`, `ReportsPage.jsx:28`
- `listStaff`: `GET /staff` (`172`) -> `StaffPage.jsx:28`
- `createStaff`: `POST /staff` (`173`) -> `StaffPage.jsx:45`
- `updateStaff`: `PUT /staff/:id` (`174`) -> `StaffPage.jsx:65, 75`
- `resetStaffPassword`: `POST /staff/:id/reset-password` (`175`) -> `StaffPage.jsx:87`
- `getDemoStatus`: `GET /demo/status` (`179`) -> `DemoToolsPage.jsx:31`
- `simulateOrder`: `POST /demo/simulate-order` (`180`) -> `DemoToolsPage.jsx:49`
- `simulateCall`: `POST /demo/simulate-call` (`181`) -> `DemoToolsPage.jsx:61`
- `setAutoPlay`: `POST /demo/autoplay` (`182`) -> `DemoToolsPage.jsx:73`
- `timeTravel`: `POST /demo/time-travel` (`184`) -> `DemoToolsPage.jsx:90`
- `resetDemoData`: `POST /demo/reset` (`185`) -> `DemoToolsPage.jsx:116`
- **Direct `fetch` bypass:** `ReportsPage.jsx:50` calls `fetch('/api/reports/export?...')` manually instead of using `http` (Axios).

---

### 1.4 Socket.IO Events

#### Client -> Server Emits
- `staff:authenticate` (`payload: token` string) — `src/context/SocketContext.jsx:69` -> handled in `server/src/sockets/index.js:67`
- `guest:joinTable` (`payload: qrToken` string) — `src/pages/GuestMenuPage.jsx:127` -> handled in `server/src/sockets/index.js:83`

#### Server -> Client Emits (`server/src/sockets/index.js`)
- `socket:ready` (`{ scope: 'guest', tableId }` or `{ scope: 'staff', role }`) — lines `40, 60, 77, 89` *(Note: no client listener currently binds to it)*
- `order:created` (`order` object) -> rooms `restaurant:main`, `table:${order.tableId}` (`100-101`). Listeners: `SocketContext.jsx:114`, `DashboardPage.jsx:66`, `LiveOrdersPage.jsx:89`, `KitchenPage.jsx:54`, `WaiterPage.jsx:83`, `TablesPage.jsx:68`, `BillingPage.jsx:58`, `GuestMenuPage.jsx:135`.
- `order:updated` (`order` object) -> rooms `restaurant:main`, `table:${order.tableId}` (`106-107`). Listeners: `SocketContext.jsx:115`, `DashboardPage.jsx:67`, `LiveOrdersPage.jsx:90`, `KitchenPage.jsx:55`, `WaiterPage.jsx:84`, `TablesPage.jsx:69`, `BillingPage.jsx:59`, `GuestMenuPage.jsx:139`.
- `order:cancelled` (`order` object) -> rooms `restaurant:main`, `table:${order.tableId}` (`112-113`). Listeners: `SocketContext.jsx:116`, `DashboardPage.jsx:68`, `LiveOrdersPage.jsx:91`, `KitchenPage.jsx:56`, `WaiterPage.jsx:85`, `GuestMenuPage.jsx:152`.
- `call:created` (`call` object) -> rooms `restaurant:main`, `table:${call.tableId}` (`118-119`). Listeners: `SocketContext.jsx:117`, `DashboardPage.jsx:69`, `LiveCallsPage.jsx:50`, `WaiterPage.jsx:86`, `TablesPage.jsx:70`, `GuestMenuPage.jsx:156`.
- `call:acknowledged` (`call` object) -> rooms `restaurant:main`, `table:${call.tableId}` (`124-125`). Listeners: `SocketContext.jsx:118`, `DashboardPage.jsx:70`, `LiveCallsPage.jsx:51`, `WaiterPage.jsx:87`, `GuestMenuPage.jsx:160`.
- `call:resolved` (`call` object) -> rooms `restaurant:main`, `table:${call.tableId}` (`130-131`). Listeners: `SocketContext.jsx:119`, `DashboardPage.jsx:71`, `LiveCallsPage.jsx:52`, `WaiterPage.jsx:88`, `TablesPage.jsx:71`, `GuestMenuPage.jsx:165`.
- `table:statusChanged` (`table` object) -> rooms `restaurant:main`, `table:${table.id}` (`136-137`). Listeners: `DashboardPage.jsx:72`, `WaiterPage.jsx:89`, `TablesPage.jsx:67`, `BillingPage.jsx:60`.
- `menu:itemAvailabilityChanged` (`menuItem` object) -> rooms `restaurant:main`, `guests:menu` (`142-143`). Listeners: `HomePage.jsx:102`, `GuestMenuPage.jsx:169`, `MenuPage.jsx:78`, `WaiterPage.jsx:90`.
- `menu:updated` (`{ reason }` object) -> rooms `restaurant:main`, `guests:menu` (`148-149`). Listeners: `HomePage.jsx:110`, `GuestMenuPage.jsx:182`, `MenuPage.jsx:79`.

---

### 1.5 Navigation Links (`<Link>`, `<NavLink>`, `navigate()`, `<a href>`)

| File & Line | Element / Target | Destination |
| --- | --- | --- |
| `src/components/StorefrontNavbar.jsx:48` | `<Link to="/">` | `/` |
| `src/components/StorefrontNavbar.jsx:64, 158` | `<a href="#menu-catalog">` | In-page anchor on `/` |
| `src/components/StorefrontNavbar.jsx:71, 166` | `<Link to={"/t/" + firstDemoTable.qrToken}>` | `/t/:qrToken` |
| `src/components/StorefrontNavbar.jsx:89, 205` | `<Link to={ROLE_HOME_ROUTE[user.role]}>` | Role workspace |
| `src/components/StorefrontNavbar.jsx:98` | `<Link to="/login">` | `/login` |
| `src/components/Layout.jsx:87` | `navigate('/login')` | `/login` |
| `src/components/Layout.jsx:122` | `<NavLink to={item.to}>` | Staff routes (`/dashboard`, `/orders`, `/calls`, `/tables`, `/menu`, `/kitchen`, `/waiter`, `/billing`, `/reports`, `/staff`, `/demo-tools`) |
| `src/components/Layout.jsx:221` | `<NavLink to="/demo-tools">` | `/demo-tools` |
| `src/pages/HomePage.jsx:205` | `<a href="#menu-catalog">` | In-page anchor on `/` |
| `src/pages/LoginPage.jsx:74, 77` | `navigate(redirectTarget)` / `navigate(ROLE_HOME_ROUTE[role])` | Return URL or role home |
| `src/pages/LoginPage.jsx:163` | `<Link to="/">` | `/` |
| `src/pages/LoginPage.jsx:344` | `<Link to={"/t/" + t.qrToken}>` | `/t/:qrToken` |
| `src/pages/GuestMenuPage.jsx:327` | `<Link to="/login">` *(Broken UX on QR error — should link `/`)* | `/login` |
| `src/pages/GuestMenuPage.jsx:491` | `<Link to="/">` | `/` |
| `src/pages/GuestMenuPage.jsx:497` | `<Link to="/login">` | `/login` |
| `src/pages/DashboardPage.jsx:261` | `<Link to="/orders">` | `/orders` |
| `src/pages/DashboardPage.jsx:317` | `<Link to="/calls">` | `/calls` |
| `src/pages/LiveOrdersPage.jsx:296` | `<Link to={"/billing?tableId=" + order.tableId}>` | `/billing?tableId=...` |
| `src/pages/WaiterPage.jsx:356` | `<Link to="/billing">` | `/billing` |
| `src/pages/WaiterPage.jsx:391` | `<Link to={"/billing?tableId=" + t.id}>` | `/billing?tableId=...` |
| `src/pages/TablesPage.jsx:363` | `<Link to={"/t/" + selectedTable.qrToken}>` | `/t/:qrToken` |
| `src/pages/TablesPage.jsx:370` | `<Link to={"/billing?tableId=" + selectedTable.id}>` | `/billing?tableId=...` |
| `src/components/QrModal.jsx:116, 200` | `<Link to={"/t/" + table.qrToken}>` | `/t/:qrToken` |
| `src/pages/DemoToolsPage.jsx:346` | `<Link to={"/t/" + t.qrToken}>` | `/t/:qrToken` |

---

### 1.6 Environment Variables (`process.env.*` & `import.meta.env.*`)

All server env vars are defined in `server/src/config/env.js:14-42` and present in `.env.example`:
- `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OTP_SECRET`, `DEMO_MODE`, `DEMO_OTP`, `OTP_EXPIRY_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`, `RESTAURANT_NAME`, `TAX_RATE`, `CORS_ORIGIN`, `APP_URL`.
- `vite.config.js:39-40` uses `process.env.DISABLE_HMR` (runtime AI Studio container flag, optional).
- `src/` uses **zero** `import.meta.env.*` vars (public config is fetched via `GET /api/config`).

---

## 2. Prioritized Issue List

### Critical

1. **Customers can mutate any order's kitchen/payment status (`PATCH /api/orders/:id/status`)**
   - **Location:** `server/src/routes/api.js:1366-1391`
   - **Detail:** Route applies `authenticate` without `requireRole('admin', 'manager', 'waiter', 'kitchen')`. Role checks on lines `1385-1390` only constrain `kitchen` and `waiter`, leaving `customer` unrestricted to mark any order `accepted`, `preparing`, `ready`, `served`, `paid`, or `cancelled`.
2. **Billing allows closing tables with unserved orders and does not validate payment amount**
   - **Location:** `server/src/routes/api.js:1561-1616`, `src/pages/BillingPage.jsx:78-87`
   - **Detail:** `POST /api/billing/table/:tableId/pay` closes the table even when open orders are still `pending`, `accepted`, `preparing`, or `ready`. It also does not verify a submitted `amount` against the authoritative server-computed `bill.total`.
3. **Socket.IO grants `customer` users access to internal `restaurant:main` staff room without role or DB active check**
   - **Location:** `server/src/sockets/index.js:45-81`
   - **Detail:** Both initial handshake JWT handling and `socket.on('staff:authenticate')` join `'restaurant:main'` and `role:${decoded.role}` for *any* valid JWT (including `customer`), and skip checking `user && user.isActive` in DB.
4. **QR generation/rotation route and UI allow `manager` instead of rejecting non-admin with 403**
   - **Location:** `server/src/routes/api.js:986-990`, `src/pages/TablesPage.jsx:28, 524`
   - **Detail:** `POST /api/tables/:id/rotate-qr` uses `requireRole('admin', 'manager')` instead of `requireRole('admin')`. `TablesPage.jsx` also passes `canRotate={canManage}` to `QrModal`, exposing QR rotation to managers.

### High

5. **Order status state machine violates strict transition sequence & cancel rules**
   - **Location:** `server/src/services/orderCalculator.js:83-91`, `src/pages/LiveOrdersPage.jsx:10-37, 286-316`, `src/pages/KitchenPage.jsx:85-96, 248-258`, `server/src/routes/api.js:1431-1470`
   - **Detail:** `ORDER_TRANSITIONS` allows `pending -> preparing`, `pending -> ready`, `preparing -> served`, `preparing -> cancelled`, and `ready -> paid`. Per spec, transitions must follow `pending -> accepted -> preparing -> ready -> served -> paid` (and `cancelled` only from `pending` or `accepted`). `LiveOrdersPage` currently shows a Cancel button on the `preparing` column and jumps `pending -> preparing`; `KitchenPage` bumps directly to `ready` from `pending`; `PATCH /orders/:id/items/:itemIndex/status` does not reject `served`/`paid`/`cancelled` orders.
6. **Service calls can be acknowledged after resolution or re-resolved repeatedly**
   - **Location:** `server/src/routes/api.js:1488-1529`
   - **Detail:** `PATCH /api/calls/:id/acknowledge` does not check `call.status === 'open'` (allowing a `resolved` call to be reopened as `acknowledged`). `PATCH /api/calls/:id/resolve` does not guard `call.status !== 'resolved'` (overwriting `resolvedAt`).
7. **Missing 404 page, missing Unauthorized page, and dropped return URL on protected routes**
   - **Location:** `src/App.jsx:143`, `src/routes/ProtectedRoute.jsx:19, 36-42`
   - **Detail:** Unknown routes (`*`) silently redirect to `/` instead of displaying a 404 page with a Home link. `RoleRoute` redirects unauthenticated users to `/login` without `state={{ from: location.pathname + location.search }}`, and redirects wrong-role users silently instead of displaying an "Unauthorized" page. `LoginPage.jsx:70-78` also fails to guard against external redirect targets.
8. **Storefront Socket.IO never joins `'guests:menu'` room & guest sockets leak listeners**
   - **Location:** `server/src/sockets/index.js:35-42, 83-91`, `src/pages/HomePage.jsx:96-117`, `src/pages/GuestMenuPage.jsx:118-189`
   - **Detail:** `HomePage` connects with `auth: { mode: 'guest' }` (no `qrToken`), so the server never runs `socket.join('guests:menu')`, meaning `menu:itemAvailabilityChanged` and `menu:updated` never arrive on `/`. In addition, `guest:joinTable` does not leave previous `table:*` rooms when switching tables, and `HomePage`/`GuestMenuPage` disconnect without calling `s.off(...)`.
9. **QR table switching does not reset guest session or invalidate prior table's cart; QR 404 page lacks Home link**
   - **Location:** `src/pages/GuestMenuPage.jsx:52, 66-93, 319-336`
   - **Detail:** `sessionId` and `cart` use `useState` initializers that do not reset when the `:qrToken` URL param changes, and prior table carts remain in `localStorage`. Also the invalid QR screen (`!table || error`) says `"Table QR Code Not Recognized"` and links to `/login` instead of `"Table not found or QR expired"` with a link back to `/`.
10. **Inconsistent client error handling, raw `fetch` CSV export bypass, and stale auth state on 401 expiry**
    - **Location:** `src/api/client.js:41-96`, `src/context/AuthContext.jsx:34-61`, `src/pages/ReportsPage.jsx:50-55`, `server/src/routes/api.js:2175-2182`
    - **Detail:** When 401 refresh fails in Axios, `AuthContext` retains stale `user` state instead of clearing session and redirecting to `/login`. `unwrap` does not standardize 403/404/429/500 messages and the server 500 handler leaks raw `err.message`. `ReportsPage.jsx` uses raw `fetch` for CSV export, bypassing Axios token refresh.
11. **Logout `clearAuthCookies` misses `httpOnly` and `secure` cookie flags**
    - **Location:** `server/src/middleware/auth.js:36-39`
    - **Detail:** Cookie options do not match `setAuthCookies` (`httpOnly: true`, `secure: isProd`), which can prevent cookie deletion in strict browsers/HTTPS.

### Medium

12. **Forms and action buttons lack double-submit protection and inline error state**
    - **Location:** `src/pages/TablesPage.jsx:116-139, 509-515`, `src/pages/MenuPage.jsx:136-233`, `src/pages/StaffPage.jsx:42-94`, `src/pages/WaiterPage.jsx:103-131`
    - **Detail:** Modal submit buttons in Tables, Menu, and Staff pages lack `saving`/`submitting` disabled guards (allowing duplicate submissions) and inline form error alerts. `WaiterPage` call/served action buttons lack `busyId` disabled state.
13. **Guest QR cart lacks max qty (50) clamp and 2-decimal currency rounding**
    - **Location:** `src/pages/GuestMenuPage.jsx:191-236`
    - **Detail:** `GuestMenuPage` manages cart state inline without clamping quantities to `[1..50]` (causing 400 on backend if >50) and computes `cartSubtotal`/`cartTax`/`cartTotal` without `roundCurrency`.
14. **Reports "Today" calculations on Dashboard fetch all-time totals without local-day boundaries**
    - **Location:** `src/pages/DashboardPage.jsx:39-44`
    - **Detail:** `DashboardPage` calls `api.getReportsSummary()` without `from`/`to` parameters, causing `"Today's Settled Sales"` to include prior days if historical orders exist.
15. **Missing referential integrity guards on Menu Categories and Tables deletion/updates**
    - **Location:** `server/src/routes/api.js:1003-1013, 1087-1097, 1112-1158`
    - **Detail:** Creating/updating a menu item does not check that `categoryId` exists; deleting a category does not check for active items referencing it; deleting a table does not prevent removing a table with open orders or calls.

### Low

16. **Standalone Vite config lacks `/api` and `/socket.io` dev proxy fallback**
    - **Location:** `vite.config.js:38-41`
    - **Detail:** Although `server.js` mounts Vite in `middlewareMode`, adding `server.proxy` protects against broken API calls if Vite is ever launched standalone.

---

## 3. Resolution Log

All **16** prioritized issues identified in Section 2 have been resolved with minimal, scoped changes:

| # | Severity | Resolution Summary | Modified / Added Files |
| --- | --- | --- | --- |
| 1 | Critical | Added `requireRole('admin', 'manager', 'waiter', 'kitchen')` to `PATCH /api/orders/:id/status` and updated kitchen transition error text. | `server/src/routes/api.js` |
| 2 | Critical | `POST /api/billing/table/:tableId/pay` now rejects settling unserved orders (`400`) and validates optional `amount` against `bill.total`; `BillingPage` warns on unserved orders, disables settlement, and sends exact `amount`. | `server/src/routes/api.js`, `src/pages/BillingPage.jsx` |
| 3 | Critical | Added `authenticateStaffSocket` verifying JWT + active DB user + staff role (`admin`, `manager`, `waiter`, `kitchen`) before joining `restaurant:main`; `customer` JWTs are excluded. | `server/src/sockets/index.js` |
| 4 | Critical | Restricted `POST /api/tables/:id/rotate-qr` to `requireRole('admin')`; gated `"All QR Sheet"` and `QrModal` `canRotate` to `user?.role === 'admin'`. | `server/src/routes/api.js`, `src/pages/TablesPage.jsx` |
| 5 | High | Enforced strict `ORDER_TRANSITIONS` (`pending -> accepted -> preparing -> ready -> served -> paid`; `cancelled` only from `pending`/`accepted`), updated unit tests, blocked item mutations on closed orders, and updated `LiveOrdersPage` + `KitchenPage` stage transitions. | `server/src/services/orderCalculator.js`, `server/src/services/orderCalculator.test.js`, `server/src/routes/api.js`, `src/pages/LiveOrdersPage.jsx`, `src/pages/KitchenPage.jsx` |
| 6 | High | Guarded `PATCH /api/calls/:id/acknowledge` (`call.status === 'open'`) and `PATCH /api/calls/:id/resolve` (`call.status !== 'resolved'`). | `server/src/routes/api.js` |
| 7 | High | Added `NotFoundPage` (`*`) and `UnauthorizedPage` (wrong-role `RoleRoute`), preserved `state={{ from }}` return URL on redirects to `/login`, sanitized post-login relative redirects, and fixed logout ordering in `Layout.jsx` + `AuthContext.jsx` so signing out never carries the prior protected route into the next login. | `src/pages/NotFoundPage.jsx`, `src/pages/UnauthorizedPage.jsx`, `src/App.jsx`, `src/routes/ProtectedRoute.jsx`, `src/pages/LoginPage.jsx`, `src/components/Layout.jsx`, `src/context/AuthContext.jsx` |
| 8 | High | Joined `'guests:menu'` when `auth.mode === 'guest' || auth.qrToken`, left prior `table:*` rooms on `guest:joinTable`, and added explicit `.off()` listener cleanup on unmount. | `server/src/sockets/index.js`, `src/pages/HomePage.jsx`, `src/pages/GuestMenuPage.jsx` |
| 9 | High | Reset guest session & cart when `:qrToken` changes, cleared stale table carts (`clearOtherQrCarts`), and updated invalid QR fallback to `"Table not found or QR expired"` with `"Back to Home"`. | `src/pages/GuestMenuPage.jsx` |
| 10 | High | Added `setUnauthorizedHandler` on Axios refresh failure synced to `AuthContext`, standardized HTTP error mapping, added `api.exportReportsCsv` (`responseType: 'blob'`) replacing raw `fetch`, and sanitized 500 error responses. | `src/api/client.js`, `src/context/AuthContext.jsx`, `src/pages/ReportsPage.jsx`, `server/src/routes/api.js` |
| 11 | High | Matched `clearAuthCookies` options (`httpOnly`, `sameSite: 'lax'`, `secure: isProd`) with `setAuthCookies`. | `server/src/middleware/auth.js` |
| 12 | Medium | Added loading/disabled guards (`savingItem`, `savingCat`, `savingBulk`, `busyItemId`, `creating`, `resetting`, `busyUserId`, `busyId`) and inline error states across forms/actions. | `src/pages/TablesPage.jsx`, `src/pages/MenuPage.jsx`, `src/pages/StaffPage.jsx`, `src/pages/WaiterPage.jsx` |
| 13 | Medium | Enforced `[1..50]` quantity clamp and `roundCurrency` in `GuestMenuPage` cart calculations. | `src/pages/GuestMenuPage.jsx` |
| 14 | Medium | Passed local-day `from`/`to` timestamps on `DashboardPage` KPI fetch and clamped seeded historical "today" timestamps to stay after local `00:05`. | `src/pages/DashboardPage.jsx`, `server/src/seed/seedData.js` |
| 15 | Medium | Added referential checks for `categoryId` on dish create/update, blocked category deletion with active dishes, and blocked table deletion with open orders/calls. | `server/src/routes/api.js` |
| 16 | Low | Added `server.proxy` rules (`/api` and `/socket.io`) to Vite config as standalone dev fallback. | `vite.config.js` |

*(Verified via JS-only scan, `node --test` unit suite, Vite production build + ESLint, `scripts/smoke-test.js`, and headless Chromium Playwright E2E checks.)*

