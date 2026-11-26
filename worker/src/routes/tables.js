import { Hono } from 'hono';
import { z } from 'zod';
import {
  generateQrToken,
  sanitizeText,
  roundCurrency,
  toPublicTableSummary,
} from '../services/orderCalculator.js';
import { logAudit } from '../services/orderPlacement.js';
import { authenticate, requireRole, sendOk, sendErr } from '../middleware/auth.js';

const tablesRoutes = new Hono();

tablesRoutes.get('/public', async (c) => {
  const repo = c.get('repo');
  const tables = await repo.listTables();
  return sendOk(c, tables.map(toPublicTableSummary));
});

tablesRoutes.get('/public/lookup', async (c) => {
  const num = Number(c.req.query('number'));
  if (!Number.isInteger(num) || num < 1) {
    return sendErr(c, 'Table not found', 404);
  }
  const repo = c.get('repo');
  const table = await repo.findTableByNumber(num);
  if (!table) {
    return sendErr(c, 'Table not found', 404);
  }
  return sendOk(c, toPublicTableSummary(table));
});

tablesRoutes.get('/', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const repo = c.get('repo');
  const [tables, openOrders, openCalls] = await Promise.all([
    repo.listTables(),
    repo.listOrders({ statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'] }),
    repo.listCalls({ statuses: ['open', 'acknowledged'] }),
  ]);

  const enriched = tables.map((t) => {
    const ordersForTable = openOrders.filter((o) => o.tableId === t.id);
    const callsForTable = openCalls.filter((call) => call.tableId === t.id);
    const openTotal = roundCurrency(ordersForTable.reduce((s, o) => s + o.total, 0));
    return {
      ...t,
      openOrderCount: ordersForTable.length,
      openCallCount: callsForTable.length,
      openTotal,
    };
  });
  return sendOk(c, enriched);
});

const tableCreateSchema = z.object({
  number: z.number().int().min(1).max(999),
  name: z.string().min(2).max(80),
  capacity: z.number().int().min(1).max(24),
  section: z.string().min(2).max(50),
});

tablesRoutes.post('/', authenticate, requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = tableCreateSchema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid table details.', 400);

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  try {
    const created = await repo.createTable({
      number: parsed.data.number,
      name: sanitizeText(parsed.data.name),
      capacity: parsed.data.capacity,
      section: sanitizeText(parsed.data.section),
      status: 'free',
      qrToken: generateQrToken(parsed.data.number),
      currentSessionId: null,
      isActive: true,
    });
    await logAudit(repo, c.get('user'), 'CREATE_TABLE', 'Table', created.id, `Created ${created.name} (#${created.number})`);
    await realtime.tableStatusChanged(created);
    return sendOk(c, created, 'Table created.', 201);
  } catch (err) {
    return sendErr(c, err.message, 409);
  }
});

tablesRoutes.put('/:id', authenticate, requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(2).max(80).optional(),
    capacity: z.number().int().min(1).max(24).optional(),
    section: z.string().min(2).max(50).optional(),
    status: z.enum(['free', 'occupied', 'reserved', 'cleaning']).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid table update data.', 400);

  const patch = {};
  if (parsed.data.name) patch.name = sanitizeText(parsed.data.name);
  if (parsed.data.capacity) patch.capacity = parsed.data.capacity;
  if (parsed.data.section) patch.section = sanitizeText(parsed.data.section);
  if (parsed.data.status) {
    patch.status = parsed.data.status;
    if (parsed.data.status === 'free') patch.currentSessionId = null;
  }

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const updated = await repo.updateTable(String(c.req.param('id')), patch);
  if (!updated) return sendErr(c, 'Table not found.', 404);
  await realtime.tableStatusChanged(updated);
  return sendOk(c, updated, 'Table updated.');
});

tablesRoutes.patch('/:id/status', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({ status: z.enum(['free', 'occupied', 'reserved', 'cleaning']) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid status.', 400);

  const patch = { status: parsed.data.status };
  if (parsed.data.status === 'free') patch.currentSessionId = null;

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const updated = await repo.updateTable(String(c.req.param('id')), patch);
  if (!updated) return sendErr(c, 'Table not found.', 404);

  await logAudit(repo, c.get('user'), 'UPDATE_TABLE_STATUS', 'Table', updated.id, `Table #${updated.number} -> ${updated.status}`);
  await realtime.tableStatusChanged(updated);
  return sendOk(c, updated);
});

tablesRoutes.post('/:id/rotate-qr', authenticate, requireRole('admin'), async (c) => {
  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const table = await repo.findTableById(String(c.req.param('id')));
  if (!table) return sendErr(c, 'Table not found.', 404);

  const updated = await repo.updateTable(table.id, {
    qrToken: generateQrToken(table.number),
  });
  await logAudit(repo, c.get('user'), 'ROTATE_QR', 'Table', table.id, `Rotated QR token for Table #${table.number}`);
  if (updated) await realtime.tableStatusChanged(updated);
  return sendOk(c, updated, 'QR token rotated.');
});

tablesRoutes.delete('/:id', authenticate, requireRole('admin', 'manager'), async (c) => {
  const tableId = String(c.req.param('id'));
  const repo = c.get('repo');
  const [openOrders, activeCalls] = await Promise.all([
    repo.listOrders({
      tableId,
      statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'],
    }),
    repo.listCalls({ tableId, statuses: ['open', 'acknowledged'] }),
  ]);
  if (openOrders.length > 0 || activeCalls.length > 0) {
    return sendErr(c, 'Cannot delete a table with open orders or active service calls.', 400);
  }

  const ok = await repo.deleteTable(tableId);
  if (!ok) return sendErr(c, 'Table not found.', 404);
  await logAudit(repo, c.get('user'), 'DELETE_TABLE', 'Table', tableId, 'Deleted table');
  return sendOk(c, { deleted: true });
});

tablesRoutes.get('/:id/history', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const repo = c.get('repo');
  const table = await repo.findTableById(String(c.req.param('id')));
  if (!table) return sendErr(c, 'Table not found.', 404);
  const [orders, calls] = await Promise.all([
    repo.listOrders({ tableId: table.id }),
    repo.listCalls({ tableId: table.id }),
  ]);
  return sendOk(c, { table, orders, calls });
});

export { tablesRoutes };
