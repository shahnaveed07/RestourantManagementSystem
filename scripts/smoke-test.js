import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

const BASE_ORIGIN = (process.env.SMOKE_ORIGIN || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const BASE_URL = process.env.SMOKE_BASE_URL || `${BASE_ORIGIN}/api`;

function extractCookieHeader(headers) {
  const rawList = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean);
  return rawList.map((c) => c.split(';')[0]).join('; ');
}

async function apiRequest(
  path,
  { method = 'GET', token = null, cookie = null, body = null, expectStatus = null } = {}
) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body !== null) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (expectStatus !== null) {
    assert.equal(
      res.status,
      expectStatus,
      `${method} ${path} expected HTTP ${expectStatus}, got ${res.status}: ${
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      }`
    );
  }

  if (contentType.includes('application/json')) {
    assert.equal(typeof payload.success, 'boolean', `${method} ${path} missing boolean envelope.success`);
    assert.ok('data' in payload, `${method} ${path} missing envelope.data`);
    assert.equal(typeof payload.message, 'string', `${method} ${path} missing string envelope.message`);
  }

  return { status: res.status, headers: res.headers, cookie: extractCookieHeader(res.headers), payload };
}

async function run() {
  console.log(`[smoke-test] Running against ${BASE_URL}`);

  // 1. Public health, config, menu, and SPA fallback routes
  const health = await apiRequest('/health', { expectStatus: 200 });
  assert.equal(health.payload.data.status, 'ok');
  assert.equal(health.payload.data.engine, 'cloudflare-d1');

  // Unmatched /api/* returns JSON 404 (not SPA HTML)
  const missingApi = await apiRequest('/does-not-exist', { expectStatus: 404 });
  assert.equal(missingApi.payload.success, false);

  // SPA fallback returns 200 HTML for client routes
  for (const spaPath of ['/t/t03-linden03', '/dashboard']) {
    const spaRes = await fetch(`${BASE_ORIGIN}${spaPath}`);
    assert.equal(spaRes.status, 200, `Expected 200 SPA fallback for ${spaPath}`);
    const html = await spaRes.text();
    assert.ok(html.includes('<div id="root">'), `Expected React root in SPA fallback for ${spaPath}`);
  }

  // Unauthenticated staff WebSocket upgrade must be rejected (401)
  const unauthWsStatus = await new Promise((resolve, reject) => {
    const wsTarget = new URL(`${BASE_ORIGIN}/ws?mode=staff`);
    const transport = wsTarget.protocol === 'https:' ? https : http;
    const req = transport.request(
      wsTarget,
      {
        method: 'GET',
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on('upgrade', (_res, socket) => {
      socket.destroy();
      resolve(101);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(unauthWsStatus, 401, 'Unauthenticated staff /ws must return 401');

  const config = await apiRequest('/config', { expectStatus: 200 });
  assert.ok(config.payload.data.restaurantName);

  const menuRes = await apiRequest('/menu', { expectStatus: 200 });
  const categories = menuRes.payload.data.categories;
  const items = menuRes.payload.data.items;
  assert.ok(categories.length > 0, 'Expected seeded menu categories');
  const availableDish = items.find((i) => i.isAvailable);
  assert.ok(availableDish, 'Expected at least one available dish');

  // 2. Guest QR lookup (valid & 404)
  const guestTableRes = await apiRequest('/guest/table/t03-linden03', { expectStatus: 200 });
  const table3 = guestTableRes.payload.data.table;
  assert.equal(table3.qrToken, 't03-linden03');
  await apiRequest('/guest/table/invalid-qr-token-xyz', { expectStatus: 404 });

  // 3. Unauthenticated guards
  await apiRequest('/staff', { expectStatus: 401 });
  await apiRequest('/orders', { method: 'POST', body: { orderType: 'pickup', items: [] }, expectStatus: 401 });
  await apiRequest('/orders/nonexistent/status', {
    method: 'PATCH',
    body: { status: 'accepted' },
    expectStatus: 401,
  });

  // 4. Staff PBKDF2 password login + HttpOnly cookie refresh rotation & logout revocation
  const pwLogin = await apiRequest('/auth/password/login', {
    method: 'POST',
    body: { email: 'manager@demo.com', password: 'Manager@123' },
    expectStatus: 200,
  });
  assert.equal(pwLogin.payload.data.user.role, 'manager');
  assert.ok(pwLogin.cookie.includes('passline_access='), 'Expected passline_access cookie');
  assert.ok(pwLogin.cookie.includes('passline_refresh='), 'Expected passline_refresh cookie');

  // Rotate refresh token via HttpOnly cookie
  const rotated = await apiRequest('/auth/refresh', {
    method: 'POST',
    cookie: pwLogin.cookie,
    expectStatus: 200,
  });
  assert.ok(rotated.cookie.includes('passline_refresh='), 'Expected rotated refresh cookie');

  // Logout revokes the rotated refresh token
  await apiRequest('/auth/logout', {
    method: 'POST',
    cookie: rotated.cookie,
    expectStatus: 200,
  });
  await apiRequest('/auth/refresh', {
    method: 'POST',
    cookie: rotated.cookie,
    expectStatus: 401,
  });

  // 5. Demo logins for all roles
  const tokens = {};
  for (const role of ['admin', 'manager', 'waiter', 'kitchen', 'customer']) {
    const loginRes = await apiRequest('/auth/demo-login', {
      method: 'POST',
      body: { role },
      expectStatus: 200,
    });
    assert.equal(loginRes.payload.data.user.role, role);
    tokens[role] = loginRes.payload.data.accessToken;
    assert.ok(tokens[role], `Expected accessToken for role ${role}`);
  }

  // 6. RBAC 403 checks
  await apiRequest(`/tables/${table3.id}/rotate-qr`, {
    method: 'POST',
    token: tokens.manager,
    expectStatus: 403,
  });
  await apiRequest('/staff', { token: tokens.manager, expectStatus: 403 });
  await apiRequest('/orders', {
    method: 'POST',
    token: tokens.kitchen,
    body: { tableId: table3.id, items: [{ menuItemId: availableDish.id, qty: 1 }] },
    expectStatus: 403,
  });
  await apiRequest('/reports/summary', { token: tokens.waiter, expectStatus: 403 });

  // 7. Order state machine & billing invariants
  const sessionId = `smoke-sess-${Date.now()}`;
  const orderCreate = await apiRequest(`/guest/table/${table3.qrToken}/orders`, {
    method: 'POST',
    body: {
      sessionId,
      items: [{ menuItemId: availableDish.id, qty: 2, notes: 'Smoke test' }],
    },
    expectStatus: 201,
  });
  const order = orderCreate.payload.data;
  assert.equal(order.status, 'pending');

  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.customer,
    body: { status: 'accepted' },
    expectStatus: 403,
  });
  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.kitchen,
    body: { status: 'preparing' },
    expectStatus: 400,
  });
  await apiRequest(`/billing/table/${table3.id}/pay`, {
    method: 'POST',
    token: tokens.waiter,
    body: { method: 'card', nextTableStatus: 'free' },
    expectStatus: 400,
  });

  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.kitchen,
    body: { status: 'accepted' },
    expectStatus: 200,
  });
  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.kitchen,
    body: { status: 'preparing' },
    expectStatus: 200,
  });
  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.waiter,
    body: { status: 'cancelled' },
    expectStatus: 400,
  });
  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.kitchen,
    body: { status: 'ready' },
    expectStatus: 200,
  });
  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.kitchen,
    body: { status: 'served' },
    expectStatus: 403,
  });
  await apiRequest(`/orders/${order.id}/status`, {
    method: 'PATCH',
    token: tokens.waiter,
    body: { status: 'served' },
    expectStatus: 200,
  });
  await apiRequest(`/billing/table/${table3.id}/pay`, {
    method: 'POST',
    token: tokens.waiter,
    body: { method: 'card', amount: Number((order.total + 5).toFixed(2)), nextTableStatus: 'free' },
    expectStatus: 400,
  });

  const payRes = await apiRequest(`/billing/table/${table3.id}/pay`, {
    method: 'POST',
    token: tokens.waiter,
    body: { method: 'card', amount: order.total, nextTableStatus: 'free' },
    expectStatus: 200,
  });
  assert.equal(payRes.payload.data.table.status, 'free');

  // 8. Service call lifecycle guards
  const callRes = await apiRequest(`/guest/table/${table3.qrToken}/calls`, {
    method: 'POST',
    body: { sessionId, type: 'water', message: 'Smoke test water refill' },
    expectStatus: 201,
  });
  const callId = callRes.payload.data.id;
  await apiRequest(`/calls/${callId}/resolve`, { method: 'PATCH', token: tokens.waiter, expectStatus: 400 });
  await apiRequest(`/calls/${callId}/acknowledge`, { method: 'PATCH', token: tokens.waiter, expectStatus: 200 });
  await apiRequest(`/calls/${callId}/acknowledge`, { method: 'PATCH', token: tokens.waiter, expectStatus: 400 });
  await apiRequest(`/calls/${callId}/resolve`, { method: 'PATCH', token: tokens.waiter, expectStatus: 200 });
  await apiRequest(`/calls/${callId}/resolve`, { method: 'PATCH', token: tokens.waiter, expectStatus: 400 });

  // 9. Referential integrity & reports
  await apiRequest('/menu/items', {
    method: 'POST',
    token: tokens.manager,
    body: { name: 'Invalid Category Dish', description: 'Test', price: 10, categoryId: 'nonexistent-category-id' },
    expectStatus: 400,
  });
  await apiRequest(`/menu/categories/${categories[0].id}`, {
    method: 'DELETE',
    token: tokens.manager,
    expectStatus: 400,
  });
  await apiRequest('/reports/summary', { token: tokens.manager, expectStatus: 200 });
  const csvRes = await apiRequest('/reports/export', { token: tokens.manager, expectStatus: 200 });
  assert.ok((csvRes.headers.get('content-type') || '').includes('text/csv'));
  assert.ok(String(csvRes.payload).startsWith('Order Number,Date,'));

  // 10. Home storefront ordering flow & table status guards
  const publicTablesRes = await apiRequest('/tables/public', { expectStatus: 200 });
  const publicTables = publicTablesRes.payload.data;
  assert.ok(Array.isArray(publicTables) && publicTables.length >= 1);
  assert.equal('qrToken' in publicTables[0], false);

  await apiRequest('/orders', {
    method: 'POST',
    token: tokens.customer,
    body: { source: 'home', items: [{ menuItemId: availableDish.id, qty: 1 }] },
    expectStatus: 400,
  });

  const reservedTable = publicTables.find((t) => t.status === 'reserved' || t.status === 'cleaning');
  if (reservedTable) {
    await apiRequest('/orders', {
      method: 'POST',
      token: tokens.customer,
      body: { tableId: reservedTable.id, source: 'home', items: [{ menuItemId: availableDish.id, qty: 1 }] },
      expectStatus: 409,
    });
  }

  const homeOrderRes = await apiRequest('/orders', {
    method: 'POST',
    token: tokens.customer,
    body: {
      tableId: table3.id,
      source: 'home',
      items: [{ menuItemId: availableDish.id, qty: 1, notes: 'Home order smoke test' }],
    },
    expectStatus: 201,
  });
  const homeOrder = homeOrderRes.payload.data;
  assert.equal(homeOrder.source, 'home');
  assert.equal(homeOrder.tableId, table3.id);
  assert.equal(homeOrder.tableNumberSnapshot, table3.number);

  for (const [role, status] of [
    ['kitchen', 'accepted'],
    ['kitchen', 'preparing'],
    ['kitchen', 'ready'],
    ['waiter', 'served'],
  ]) {
    await apiRequest(`/orders/${homeOrder.id}/status`, {
      method: 'PATCH',
      token: tokens[role],
      body: { status },
      expectStatus: 200,
    });
  }
  const settleHomeRes = await apiRequest(`/billing/table/${table3.id}/pay`, {
    method: 'POST',
    token: tokens.waiter,
    body: { method: 'card', amount: homeOrder.total },
    expectStatus: 200,
  });
  assert.equal(settleHomeRes.payload.data.table.status, 'cleaning');

  // 11. Demo customer OTP login
  await apiRequest('/auth/otp/request', {
    method: 'POST',
    body: { channel: 'email', identifier: 'guest@demo.com', purpose: 'login' },
    expectStatus: 200,
  });
  const guestOtpRes = await apiRequest('/auth/otp/verify', {
    method: 'POST',
    body: { channel: 'email', identifier: 'guest@demo.com', purpose: 'login', otp: '123456' },
    expectStatus: 200,
  });
  assert.equal(guestOtpRes.payload.data.user.email, 'guest@demo.com');
  assert.equal(guestOtpRes.payload.data.user.mobile, '+919999999992');

  // 12. Restore clean seed state
  await apiRequest('/demo/reset', { method: 'POST', token: tokens.admin, expectStatus: 200 });

  console.log('[smoke-test] All Cloudflare Worker, D1, Cookie/JWT, RBAC, WebSocket auth, OTP, and billing assertions passed!');
}

run().catch((err) => {
  console.error('[smoke-test] FAILED:', err);
  process.exit(1);
});
