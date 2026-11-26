import { Hono } from 'hono';
import { z } from 'zod';
import { computeConsolidatedBill, roundCurrency } from '../services/orderCalculator.js';
import { logAudit } from '../services/orderPlacement.js';
import { authenticate, requireRole, sendOk, sendErr } from '../middleware/auth.js';

const billingRoutes = new Hono();

billingRoutes.get('/tables', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const repo = c.get('repo');
  const cfg = c.get('cfg');
  const [tables, activeOrders] = await Promise.all([
    repo.listTables(),
    repo.listOrders({ statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'] }),
  ]);

  const tabs = tables
    .map((table) => {
      const orders = activeOrders.filter((o) => o.tableId === table.id);
      const totals = computeConsolidatedBill(orders, cfg.taxRate, 0, 0);
      return {
        table,
        orders,
        ...totals,
        itemCount: orders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.qty, 0), 0),
      };
    })
    .filter((tab) => tab.orders.length > 0 || tab.table.status === 'occupied');

  return sendOk(c, { taxRate: cfg.taxRate, tabs });
});

billingRoutes.post('/table/:tableId/pay', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    method: z.enum(['cash', 'card', 'upi', 'demo']),
    discountPercent: z.number().min(0).max(100).default(0),
    flatDiscount: z.number().min(0).max(10000).default(0),
    amount: z.number().nonnegative().optional(),
    nextTableStatus: z.enum(['free', 'cleaning']).default('cleaning'),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid payment parameters.', 400);

  const repo = c.get('repo');
  const cfg = c.get('cfg');
  const realtime = c.get('realtime');
  const user = c.get('user');

  const table = await repo.findTableById(String(c.req.param('tableId')));
  if (!table) return sendErr(c, 'Table not found.', 404);

  const openOrders = await repo.listOrders({
    tableId: table.id,
    statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'],
  });
  if (openOrders.length === 0) {
    return sendErr(c, 'No open orders to settle for this table.', 400);
  }

  const unservedOrders = openOrders.filter((o) => !['served', 'paid'].includes(o.status));
  if (unservedOrders.length > 0) {
    return sendErr(c, 'All open orders on this table must be served before settling the bill.', 400);
  }

  const bill = computeConsolidatedBill(
    openOrders,
    cfg.taxRate,
    parsed.data.discountPercent,
    parsed.data.flatDiscount
  );
  if (
    parsed.data.amount !== undefined &&
    Math.abs(roundCurrency(parsed.data.amount) - bill.total) > 0.01
  ) {
    return sendErr(c, `Payment amount must match the bill total ($${bill.total.toFixed(2)}).`, 400);
  }

  const openCalls = await repo.listCalls({
    tableId: table.id,
    statuses: ['open', 'acknowledged'],
  });

  const nowIso = new Date().toISOString();
  const { payment, updatedTable, settledOrders, resolvedCalls } = await repo.settleTablePayment({
    table,
    openOrders,
    openCalls,
    bill,
    method: parsed.data.method,
    nextTableStatus: parsed.data.nextTableStatus,
    actorId: user.userId,
    actorName: user.name,
    nowIso,
  });

  for (const order of settledOrders) {
    await realtime.orderUpdated(order);
  }
  for (const call of resolvedCalls) {
    await realtime.callResolved(call);
  }
  if (updatedTable) {
    await realtime.tableStatusChanged(updatedTable);
  }

  await logAudit(
    repo,
    user,
    'RECORD_PAYMENT',
    'Payment',
    payment.id,
    `Settled Table #${table.number} ($${payment.amount.toFixed(2)} via ${payment.method})`
  );

  return sendOk(
    c,
    { payment, table: updatedTable, settledOrders },
    'Payment recorded and table closed.'
  );
});

export { billingRoutes };
