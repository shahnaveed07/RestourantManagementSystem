import { Hono } from 'hono';
import { z } from 'zod';
import {
  canTransitionOrderStatus,
  deriveOrderStatusFromItems,
  resolveOrderSource,
} from '../services/orderCalculator.js';
import { placeTableOrder, logAudit } from '../services/orderPlacement.js';
import { authenticate, requireRole, sendOk, sendErr } from '../middleware/auth.js';
import { createRateLimiter, extractClientIp } from '../middleware/rateLimit.js';

const ordersRoutes = new Hono();

const customerOrderLimiter = createRateLimiter({
  prefix: 'cust-order',
  max: 10,
  windowMs: 10 * 60 * 1000,
  skip: (c) => ['admin', 'manager', 'waiter'].includes(c.get('user')?.role),
  keyFn: (c) => c.get('user')?.userId || extractClientIp(c),
  message: 'Rate limit reached: maximum 10 orders per 10 minutes per customer.',
});

ordersRoutes.get('/', authenticate, async (c) => {
  const statusParam = String(c.req.query('status') || '');
  const tableId = c.req.query('tableId') || undefined;
  const statuses = statusParam ? statusParam.split(',').filter(Boolean) : undefined;

  const repo = c.get('repo');
  const user = c.get('user');
  const orders = await repo.listOrders({ tableId, statuses });
  if (user.role === 'customer') {
    return sendOk(
      c,
      orders.filter((o) => o.customerId === user.userId)
    );
  }
  return sendOk(c, orders);
});

const createOrderSchema = z.object({
  tableId: z.string().min(1).optional().nullable(),
  qrToken: z.string().min(1).optional().nullable(),
  sessionId: z.string().max(80).optional(),
  source: z.enum(['qr', 'home', 'staff']).optional(),
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

ordersRoutes.post(
  '/',
  authenticate,
  requireRole('admin', 'manager', 'waiter', 'customer'),
  customerOrderLimiter,
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return sendErr(c, 'Please select at least one valid menu item.', 400);
    }

    const rawTableId = typeof parsed.data.tableId === 'string' ? parsed.data.tableId.trim() : '';
    const rawQrToken = typeof parsed.data.qrToken === 'string' ? parsed.data.qrToken.trim() : '';

    if (!rawQrToken && (!rawTableId || rawTableId === 'pickup')) {
      return sendErr(c, 'Please select your table number to continue.', 400);
    }

    const repo = c.get('repo');
    const cfg = c.get('cfg');
    const realtime = c.get('realtime');
    const user = c.get('user');

    let table = null;
    if (rawQrToken) {
      table = await repo.findTableByQrToken(rawQrToken);
      if (!table) return sendErr(c, 'Invalid table QR token.', 404);
      if (rawTableId && rawTableId !== table.id) {
        return sendErr(c, 'Table mismatch for QR code.', 400);
      }
    } else {
      table = await repo.findTableById(rawTableId);
      if (!table) return sendErr(c, 'Table not found.', 404);
    }

    const isStaffRole = ['admin', 'manager', 'waiter'].includes(user.role);
    const source = resolveOrderSource({
      qrToken: rawQrToken,
      userRole: user.role,
      requestedSource: parsed.data.source,
    });
    const isStaffOrder = source === 'staff' && isStaffRole;

    try {
      const { order } = await placeTableOrder({
        repo,
        cfg,
        realtime,
        table,
        items: parsed.data.items,
        source,
        requestedSessionId: parsed.data.sessionId || '',
        customerId: user.role === 'customer' ? user.userId : null,
        customerName: user.role === 'customer' ? user.name : null,
        waiterId: isStaffOrder ? user.userId : null,
        waiterName: isStaffOrder ? user.name : null,
      });

      await logAudit(
        repo,
        user,
        'CREATE_ORDER',
        'Order',
        order.id,
        `${source.toUpperCase()} order ${order.orderNumber} for Table #${table.number}`
      );
      return sendOk(c, order, 'Order placed successfully.', 201);
    } catch (err) {
      return sendErr(c, err.message, err.status || 400);
    }
  }
);

ordersRoutes.patch(
  '/:id/status',
  authenticate,
  requireRole('admin', 'manager', 'waiter', 'kitchen'),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const schema = z.object({
      status: z.enum(['pending', 'accepted', 'preparing', 'ready', 'served', 'paid', 'cancelled']),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return sendErr(c, 'Invalid order status.', 400);

    const repo = c.get('repo');
    const realtime = c.get('realtime');
    const user = c.get('user');
    const order = await repo.findOrderById(String(c.req.param('id')));
    if (!order) return sendErr(c, 'Order not found.', 404);

    const nextStatus = parsed.data.status;
    if (!canTransitionOrderStatus(order.status, nextStatus)) {
      return sendErr(c, `Cannot move order from ${order.status} to ${nextStatus}.`, 400);
    }

    const role = user.role;
    if (role === 'kitchen' && !['accepted', 'preparing', 'ready'].includes(nextStatus)) {
      return sendErr(c, 'Kitchen staff can only move orders to accepted, preparing, or ready.', 403);
    }
    if (role === 'waiter' && !['accepted', 'preparing', 'ready', 'served', 'cancelled'].includes(nextStatus)) {
      return sendErr(c, 'Waiter cannot directly set this status.', 403);
    }

    const nowIso = new Date().toISOString();
    const updatedItems = order.items.map((item) => {
      if (nextStatus === 'preparing' && item.status === 'pending') {
        return { ...item, status: 'preparing' };
      }
      if (nextStatus === 'ready' && (item.status === 'pending' || item.status === 'preparing')) {
        return { ...item, status: 'ready' };
      }
      if (nextStatus === 'served') {
        return { ...item, status: 'served' };
      }
      return item;
    });

    const updated = await repo.updateOrder(order.id, {
      status: nextStatus,
      items: updatedItems,
      waiterId: order.waiterId || (role === 'waiter' ? user.userId : null),
      waiterName: order.waiterName || (role === 'waiter' ? user.name : null),
      statusTimestamps: {
        ...order.statusTimestamps,
        [nextStatus]: nowIso,
      },
      updatedAt: nowIso,
    });

    if (!updated) return sendErr(c, 'Failed to update order.', 500);
    await logAudit(repo, user, 'UPDATE_ORDER_STATUS', 'Order', order.id, `${order.orderNumber} -> ${nextStatus}`);

    if (nextStatus === 'cancelled') {
      await realtime.orderCancelled(updated);
    } else {
      await realtime.orderUpdated(updated);
    }

    return sendOk(c, updated);
  }
);

ordersRoutes.patch(
  '/:id/items/:itemIndex/status',
  authenticate,
  requireRole('admin', 'manager', 'kitchen'),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const schema = z.object({ status: z.enum(['pending', 'preparing', 'ready', 'served']) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return sendErr(c, 'Invalid item status.', 400);

    const repo = c.get('repo');
    const realtime = c.get('realtime');
    const order = await repo.findOrderById(String(c.req.param('id')));
    if (!order) return sendErr(c, 'Order not found.', 404);
    if (['served', 'paid', 'cancelled'].includes(order.status)) {
      return sendErr(c, 'Cannot update items on a served, paid, or cancelled order.', 400);
    }

    const idx = Number(c.req.param('itemIndex'));
    if (!Number.isInteger(idx) || idx < 0 || idx >= order.items.length) {
      return sendErr(c, 'Invalid item index.', 400);
    }

    const updatedItems = order.items.map((item, i) =>
      i === idx ? { ...item, status: parsed.data.status } : item
    );
    const derivedStatus = deriveOrderStatusFromItems(
      order.status,
      updatedItems.map((i) => i.status)
    );
    const nowIso = new Date().toISOString();
    const nextTimestamps = { ...order.statusTimestamps };
    if (derivedStatus !== order.status) {
      if ((derivedStatus === 'preparing' || derivedStatus === 'ready') && !nextTimestamps.accepted) {
        nextTimestamps.accepted = nowIso;
      }
      if (derivedStatus === 'ready' && !nextTimestamps.preparing) {
        nextTimestamps.preparing = nowIso;
      }
      nextTimestamps[derivedStatus] = nowIso;
    }

    const updated = await repo.updateOrder(order.id, {
      items: updatedItems,
      status: derivedStatus,
      statusTimestamps: nextTimestamps,
      updatedAt: nowIso,
    });

    if (!updated) return sendErr(c, 'Failed to update item.', 500);
    await realtime.orderUpdated(updated);
    return sendOk(c, updated);
  }
);

export { ordersRoutes };
