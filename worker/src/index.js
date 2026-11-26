import { Hono } from 'hono';
import { getConfig, assertSafeDemoConfig } from './config/env.js';
import { createRepository } from './db/repository.js';
import { ensureDemoSeeded } from './seed/seedData.js';
import { createRealtimeEmitter } from './services/realtime.js';
import {
  ACCESS_COOKIE,
  verifyAccessToken,
  verifySameOriginMutation,
  sendOk,
  sendErr,
} from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { guestRoutes } from './routes/guest.js';
import { tablesRoutes } from './routes/tables.js';
import { menuRoutes } from './routes/menu.js';
import { ordersRoutes } from './routes/orders.js';
import { callsRoutes } from './routes/calls.js';
import { billingRoutes } from './routes/billing.js';
import { reportsRoutes } from './routes/reports.js';
import { staffRoutes } from './routes/staff.js';
import { demoRoutes } from './routes/demo.js';

export { Hub } from './durable/Hub.js';

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

const apiApp = new Hono().basePath('/api');

// Inject per-request config, D1 repository, and realtime broadcaster
apiApp.use('*', async (c, next) => {
  const cfg = getConfig(c.env);
  const repo = createRepository(c.env.DB);
  const realtime = createRealtimeEmitter(c.env);

  await ensureDemoSeeded(repo, cfg);

  c.set('cfg', cfg);
  c.set('repo', repo);
  c.set('realtime', realtime);

  // Baseline security headers
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  return next();
});

apiApp.use('*', verifySameOriginMutation);

// Health & public config
apiApp.get('/health', (c) => {
  const cfg = c.get('cfg');
  const repo = c.get('repo');
  return sendOk(c, {
    status: 'ok',
    engine: repo.getEngine(),
    demoMode: cfg.demoMode,
    timestamp: new Date().toISOString(),
  });
});

apiApp.get('/config', async (c) => {
  const cfg = c.get('cfg');
  const repo = c.get('repo');
  const tables = await repo.listTables();
  return sendOk(c, {
    restaurantName: cfg.restaurantName,
    demoMode: cfg.demoMode,
    demoOtpHint: cfg.demoMode ? cfg.demoOtp : null,
    otpExpiryMinutes: cfg.otpExpiryMinutes,
    captchaEnabled: Boolean(cfg.captchaSecret),
    captchaProvider: cfg.captchaProvider,
    captchaSiteKey: cfg.captchaSiteKey || null,
    taxRate: cfg.taxRate,
    tables: tables.map((t) => ({ id: t.id, number: t.number, name: t.name, section: t.section })),
    demoTables: cfg.demoMode
      ? tables.slice(0, 6).map((t) => ({ id: t.id, number: t.number, name: t.name, qrToken: t.qrToken }))
      : [],
  });
});

// Feature routes
apiApp.route('/auth', authRoutes);
apiApp.route('/guest', guestRoutes);
apiApp.route('/tables', tablesRoutes);
apiApp.route('/menu', menuRoutes);
apiApp.route('/orders', ordersRoutes);
apiApp.route('/calls', callsRoutes);
apiApp.route('/billing', billingRoutes);
apiApp.route('/reports', reportsRoutes);
apiApp.route('/staff', staffRoutes);
apiApp.route('/demo', demoRoutes);

// Explicit JSON 404 for unmatched /api/* endpoints
apiApp.notFound((c) => sendErr(c, 'API endpoint not found.', 404));

// Centralized API Error Handler
apiApp.onError((err, c) => {
  console.error('[Worker API Error]', err);
  return sendErr(c, 'Internal server error. Please try again.', 500);
});

async function handleWebSocketUpgrade(request, env, cfg) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return Response.json(
      { success: false, data: null, message: 'WebSocket upgrade required.' },
      { status: 426 }
    );
  }

  const url = new URL(request.url);
  const mode = String(url.searchParams.get('mode') || 'guest').trim().toLowerCase();
  const qrToken = String(url.searchParams.get('qrToken') || '').trim();
  const tableIdParam = String(url.searchParams.get('tableId') || '').trim();

  const cookies = parseCookieHeader(request.headers.get('Cookie'));
  const authHeader = request.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryToken = String(url.searchParams.get('token') || '').trim() || null;
  const rawToken = bearerToken || cookies[ACCESS_COOKIE] || queryToken;

  const repo = createRepository(env.DB);
  await ensureDemoSeeded(repo, cfg);

  const rooms = new Set(['all']);
  let role = 'guest';
  let userId = '';
  let resolvedTableId = tableIdParam;

  // Resolve verified JWT user if provided
  let verifiedUser = null;
  if (rawToken) {
    try {
      const payload = await verifyAccessToken(rawToken, cfg);
      const user = await repo.findUserById(String(payload.userId));
      if (user && user.isActive) {
        verifiedUser = user;
      }
    } catch {
      // invalid or expired token
    }
  }

  if (mode === 'staff') {
    if (!verifiedUser || !['admin', 'manager', 'waiter', 'kitchen'].includes(verifiedUser.role)) {
      return Response.json(
        { success: false, data: null, message: 'Staff authentication required for realtime feed.' },
        { status: 401 }
      );
    }
    role = verifiedUser.role;
    userId = verifiedUser.id;
    if (verifiedUser.role === 'kitchen') {
      rooms.add('kitchen');
    } else {
      rooms.add('staff');
      rooms.add('kitchen');
    }
  } else if (qrToken) {
    const table = await repo.findTableByQrToken(qrToken);
    if (!table) {
      return Response.json(
        { success: false, data: null, message: 'Invalid table QR token.' },
        { status: 404 }
      );
    }
    role = verifiedUser?.role || 'guest';
    userId = verifiedUser?.id || '';
    resolvedTableId = table.id;
    rooms.add(`table:${table.id}`);
    if (verifiedUser?.role === 'customer') {
      rooms.add(`customer:${verifiedUser.id}`);
    }
  } else {
    rooms.add('public');
    if (verifiedUser) {
      role = verifiedUser.role;
      userId = verifiedUser.id;
      if (verifiedUser.role === 'customer') {
        rooms.add(`customer:${verifiedUser.id}`);
      }
    }
    if (tableIdParam) {
      rooms.add(`table:${tableIdParam}`);
    }
  }

  const hubId = env.HUB.idFromName('global-hub');
  const stub = env.HUB.get(hubId);

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set('x-hub-rooms', JSON.stringify(Array.from(rooms)));
  forwardHeaders.set('x-hub-role', role);
  forwardHeaders.set('x-hub-user-id', userId);
  forwardHeaders.set('x-hub-table-id', resolvedTableId);

  return stub.fetch(
    new Request('https://hub.internal/connect', {
      method: 'GET',
      headers: forwardHeaders,
    })
  );
}

export default {
  async fetch(request, env, ctx) {
    // Hard production safety guard: refuse ALL requests if DEMO_MODE=true in production
    let cfg;
    try {
      assertSafeDemoConfig(env);
      cfg = getConfig(env);
    } catch (err) {
      console.error('[Worker Security Guard]', err.message);
      return Response.json(
        {
          success: false,
          data: null,
          message: err.message,
        },
        { status: 503 }
      );
    }

    const url = new URL(request.url);

    // Realtime WebSocket upgrade endpoint
    if (url.pathname === '/ws' || url.pathname.startsWith('/ws/')) {
      return handleWebSocketUpgrade(request, env, cfg);
    }

    // Hono JSON API
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return apiApp.fetch(request, env, ctx);
    }

    // Static SPA Assets (handled by Cloudflare Workers Static Assets binding)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          assertSafeDemoConfig(env);
          const repo = createRepository(env.DB);
          const result = await repo.cleanupExpiredAuthRecords();
          console.info(
            `[Cron Cleanup] Deleted ${result.deletedOtps} expired OTPs and ${result.deletedRefreshTokens} expired refresh tokens.`
          );
        } catch (err) {
          console.error('[Cron Cleanup Error]', err);
        }
      })()
    );
  },
};
