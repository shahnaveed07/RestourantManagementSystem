import { Hono } from 'hono';
import { z } from 'zod';
import { seedDatabase } from '../seed/seedData.js';
import { createSimulatedGuestOrder, createSimulatedCall, logAudit } from '../services/orderPlacement.js';
import { authenticate, requireRole, sendOk, sendErr } from '../middleware/auth.js';

const demoRoutes = new Hono();

function getHubStub(env) {
  return env.HUB.get(env.HUB.idFromName('global-hub'));
}

demoRoutes.use('*', authenticate, requireRole('admin'), async (c, next) => {
  const cfg = c.get('cfg');
  if (!cfg.demoMode) {
    return sendErr(c, 'Demo tools are disabled (DEMO_MODE=false).', 403);
  }
  return next();
});

demoRoutes.get('/status', async (c) => {
  const cfg = c.get('cfg');
  let state = { autoPlayRunning: false, intervalSeconds: 10 };
  try {
    const res = await getHubStub(c.env).fetch('https://hub.internal/autoplay');
    if (res.ok) state = await res.json();
  } catch {
    // fallback default state
  }
  return sendOk(c, {
    demoMode: cfg.demoMode,
    autoPlayRunning: Boolean(state.autoPlayRunning),
    intervalSeconds: Number(state.intervalSeconds || 10),
  });
});

demoRoutes.post('/seed', async (c) => {
  const repo = c.get('repo');
  const cfg = c.get('cfg');
  const realtime = c.get('realtime');
  const summary = await seedDatabase(repo, cfg, false);
  await realtime.menuUpdated({ reason: 'demo_seed' });
  return sendOk(c, summary, 'Demo database seeded.');
});

demoRoutes.post('/simulate-order', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const tableId = typeof body?.tableId === 'string' && body.tableId ? body.tableId : undefined;
  const source = body?.source === 'home' ? 'home' : 'qr';

  const repo = c.get('repo');
  const cfg = c.get('cfg');
  const realtime = c.get('realtime');

  try {
    const order = await createSimulatedGuestOrder({
      repo,
      cfg,
      realtime,
      targetTableId: tableId,
      simulatedSource: source,
    });
    await logAudit(
      repo,
      c.get('user'),
      'DEMO_SIMULATE_ORDER',
      'Order',
      order.id,
      `Simulated ${order.source.toUpperCase()} guest order ${order.orderNumber} on Table #${order.tableNumber}`
    );
    return sendOk(
      c,
      order,
      `Simulated ${order.source === 'home' ? 'Home' : 'QR'} order on Table ${order.tableNumber}.`,
      201
    );
  } catch (err) {
    return sendErr(c, err.message, err.status || 400);
  }
});

demoRoutes.post('/simulate-call', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const tableId = typeof body?.tableId === 'string' && body.tableId ? body.tableId : undefined;
  const type = typeof body?.type === 'string' && body.type ? body.type : undefined;

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  try {
    const call = await createSimulatedCall({ repo, realtime, targetTableId: tableId, callType: type });
    await logAudit(
      repo,
      c.get('user'),
      'DEMO_SIMULATE_CALL',
      'ServiceCall',
      call.id,
      `Simulated ${call.type} call on Table #${call.tableNumber}`
    );
    return sendOk(c, call, `Simulated ${call.type} call on Table ${call.tableNumber}.`, 201);
  } catch (err) {
    return sendErr(c, err.message, err.status || 400);
  }
});

demoRoutes.post('/autoplay', async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    enabled: z.boolean(),
    intervalSeconds: z.number().int().min(3).max(60).default(8),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid auto-play config.', 400);

  const res = await getHubStub(c.env).fetch('https://hub.internal/autoplay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  const state = await res.json();

  await logAudit(
    c.get('repo'),
    c.get('user'),
    'DEMO_AUTOPLAY',
    'System',
    null,
    parsed.data.enabled
      ? `Started Auto-Play every ${state.intervalSeconds}s`
      : 'Stopped Auto-Play'
  );

  return sendOk(c, state);
});

demoRoutes.post('/time-travel', async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({ minutesBack: z.number().int().min(1).max(120).default(10) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid minutesBack.', 400);

  const deltaMs = parsed.data.minutesBack * 60 * 1000;
  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const [activeOrders, openCalls] = await Promise.all([
    repo.listOrders({ statuses: ['pending', 'accepted', 'preparing', 'ready'] }),
    repo.listCalls({ statuses: ['open', 'acknowledged'] }),
  ]);

  for (const order of activeOrders) {
    const shifted = new Date(new Date(order.createdAt).getTime() - deltaMs).toISOString();
    const updated = await repo.updateOrder(order.id, {
      createdAt: shifted,
      statusTimestamps: { ...order.statusTimestamps, pending: shifted },
    });
    if (updated) await realtime.orderUpdated(updated);
  }

  for (const call of openCalls) {
    const shifted = new Date(new Date(call.createdAt).getTime() - deltaMs).toISOString();
    const updated = await repo.updateCall(call.id, { createdAt: shifted });
    if (updated) await realtime.callAcknowledged(updated);
  }

  await logAudit(
    repo,
    c.get('user'),
    'DEMO_TIME_TRAVEL',
    'System',
    null,
    `Backdated ${activeOrders.length} active orders and ${openCalls.length} open calls by ${parsed.data.minutesBack}m`
  );

  return sendOk(
    c,
    { ordersShifted: activeOrders.length, callsShifted: openCalls.length },
    `Backdated active orders and calls by ${parsed.data.minutesBack} minutes.`
  );
});

demoRoutes.post('/reset', async (c) => {
  try {
    await getHubStub(c.env).fetch('https://hub.internal/autoplay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, intervalSeconds: 10 }),
    });
  } catch {
    // ignore autoplay stop failure
  }

  const repo = c.get('repo');
  const cfg = c.get('cfg');
  const realtime = c.get('realtime');
  const summary = await seedDatabase(repo, cfg, true);
  await realtime.menuUpdated({ reason: 'demo_reset' });
  return sendOk(c, summary, 'Demo database reset and reseeded.');
});

export { demoRoutes };
