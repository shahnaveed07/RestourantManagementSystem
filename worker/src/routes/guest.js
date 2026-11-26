import { Hono } from 'hono';
import { z } from 'zod';
import { sanitizeText } from '../services/orderCalculator.js';
import { placeTableOrder } from '../services/orderPlacement.js';
import { authenticate, optionalAuthenticate, sendOk, sendErr } from '../middleware/auth.js';
import { createRateLimiter, extractClientIp } from '../middleware/rateLimit.js';

const guestRoutes = new Hono();

const guestOrderLimiter = createRateLimiter({
  prefix: 'guest-order',
  max: 10,
  windowMs: 10 * 60 * 1000,
  keyFn: async (c) => {
    const body = await c.req.raw.clone().json().catch(() => ({}));
    return `${c.req.param('qrToken') || ''}:${body?.sessionId || extractClientIp(c)}`;
  },
  message: 'Rate limit reached: max 10 orders per 10 minutes per table session.',
});

const guestCallLimiter = createRateLimiter({
  prefix: 'guest-call',
  max: 10,
  windowMs: 10 * 60 * 1000,
  keyFn: async (c) => {
    const body = await c.req.raw.clone().json().catch(() => ({}));
    return `${c.req.param('qrToken') || ''}:${body?.sessionId || extractClientIp(c)}`;
  },
  message: 'Rate limit reached: max 10 service calls per 10 minutes per table session.',
});

guestRoutes.get('/table/:qrToken', async (c) => {
  const qrToken = String(c.req.param('qrToken') || '').trim();
  const sessionId = String(c.req.query('sessionId') || '').trim();
  const cfg = c.get('cfg');
  const repo = c.get('repo');

  const table = await repo.findTableByQrToken(qrToken);
  if (!table) {
    return sendErr(c, 'This table QR code is invalid or has been rotated.', 404);
  }

  const [categories, menuItems, tableOrders, tableCalls] = await Promise.all([
    repo.listCategories(),
    repo.listMenuItems(false),
    repo.listOrders({
      tableId: table.id,
      statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'],
    }),
    repo.listCalls({
      tableId: table.id,
      statuses: ['open', 'acknowledged'],
    }),
  ]);

  const filteredOrders = sessionId
    ? tableOrders.filter((o) => o.sessionId === sessionId || o.sessionId === table.currentSessionId)
    : tableOrders;

  return sendOk(c, {
    restaurantName: cfg.restaurantName,
    taxRate: cfg.taxRate,
    table: {
      id: table.id,
      number: table.number,
      name: table.name,
      section: table.section,
      capacity: table.capacity,
      status: table.status,
      qrToken: table.qrToken,
    },
    categories: categories.filter((cat) => cat.isActive),
    menuItems,
    orders: filteredOrders,
    calls: tableCalls,
  });
});

const guestOrderSchema = z.object({
  sessionId: z.string().min(4).max(80),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        qty: z.number().int().min(1).max(50),
        notes: z.string().max(200).optional(),
      })
    )
    .min(1),
});

guestRoutes.post(
  '/table/:qrToken/orders',
  guestOrderLimiter,
  async (c, next) => {
    const cfg = c.get('cfg');
    if (cfg.demoMode) {
      return optionalAuthenticate(c, next);
    }
    return authenticate(c, next);
  },
  async (c) => {
    const qrToken = String(c.req.param('qrToken') || '').trim();
    const body = await c.req.json().catch(() => null);
    const parsed = guestOrderSchema.safeParse(body);
    if (!parsed.success) {
      return sendErr(c, 'Please select at least one valid menu item.', 400);
    }

    const repo = c.get('repo');
    const cfg = c.get('cfg');
    const realtime = c.get('realtime');
    const user = c.get('user');

    const table = await repo.findTableByQrToken(qrToken);
    if (!table) {
      return sendErr(c, 'Invalid table QR token.', 404);
    }

    try {
      const { order } = await placeTableOrder({
        repo,
        cfg,
        realtime,
        table,
        items: parsed.data.items,
        source: 'qr',
        requestedSessionId: parsed.data.sessionId,
        customerId: user?.role === 'customer' ? user.userId : null,
        customerName: user?.role === 'customer' ? user.name : null,
      });
      return sendOk(c, order, 'Order placed successfully.', 201);
    } catch (err) {
      return sendErr(c, err.message, err.status || 400);
    }
  }
);

const guestCallSchema = z.object({
  sessionId: z.string().min(4).max(80).optional(),
  type: z.enum(['waiter', 'bill', 'water', 'napkins', 'other']).default('waiter'),
  message: z.string().max(240).optional(),
});

guestRoutes.post('/table/:qrToken/calls', guestCallLimiter, async (c) => {
  const qrToken = String(c.req.param('qrToken') || '').trim();
  const body = await c.req.json().catch(() => null);
  const parsed = guestCallSchema.safeParse(body);
  if (!parsed.success) {
    return sendErr(c, 'Invalid service call request.', 400);
  }

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const table = await repo.findTableByQrToken(qrToken);
  if (!table) {
    return sendErr(c, 'Invalid table QR token.', 404);
  }

  const defaultMessages = {
    waiter: 'Assistance requested at table',
    bill: 'Guest requested the bill',
    water: 'Water refill requested',
    napkins: 'Fresh napkins requested',
    other: 'Guest request',
  };

  const call = await repo.createCall({
    tableId: table.id,
    tableNumber: table.number,
    tableName: table.name,
    sessionId: parsed.data.sessionId ? sanitizeText(parsed.data.sessionId) : table.currentSessionId,
    type: parsed.data.type,
    message: sanitizeText(parsed.data.message || '') || defaultMessages[parsed.data.type],
    status: 'open',
    acknowledgedBy: null,
    acknowledgedByName: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  });

  await realtime.callCreated(call);
  return sendOk(c, call, 'Waiter has been notified.', 201);
});

export { guestRoutes };
