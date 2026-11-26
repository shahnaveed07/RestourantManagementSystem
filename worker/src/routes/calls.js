import { Hono } from 'hono';
import { logAudit } from '../services/orderPlacement.js';
import { authenticate, requireRole, sendOk, sendErr } from '../middleware/auth.js';

const callsRoutes = new Hono();

callsRoutes.get('/', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const statusParam = String(c.req.query('status') || '');
  const statuses = statusParam ? statusParam.split(',').filter(Boolean) : undefined;
  const repo = c.get('repo');
  const calls = await repo.listCalls({ statuses });
  return sendOk(c, calls);
});

callsRoutes.patch('/:id/acknowledge', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const user = c.get('user');
  const call = await repo.findCallById(String(c.req.param('id')));
  if (!call) return sendErr(c, 'Service call not found.', 404);
  if (call.status !== 'open') {
    return sendErr(c, 'Only open service calls can be acknowledged.', 400);
  }

  const updated = await repo.updateCall(call.id, {
    status: 'acknowledged',
    acknowledgedBy: user.userId,
    acknowledgedByName: user.name,
  });
  if (!updated) return sendErr(c, 'Failed to acknowledge call.', 500);

  await logAudit(repo, user, 'ACKNOWLEDGE_CALL', 'ServiceCall', call.id, `Acknowledged ${call.type} call for Table #${call.tableNumber}`);
  await realtime.callAcknowledged(updated);
  return sendOk(c, updated);
});

callsRoutes.patch('/:id/resolve', authenticate, requireRole('admin', 'manager', 'waiter'), async (c) => {
  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const user = c.get('user');
  const call = await repo.findCallById(String(c.req.param('id')));
  if (!call) return sendErr(c, 'Service call not found.', 404);
  if (call.status === 'resolved') {
    return sendErr(c, 'Service call is already resolved.', 400);
  }
  if (call.status !== 'acknowledged') {
    return sendErr(c, 'Service call must be acknowledged before resolving.', 400);
  }

  const updated = await repo.updateCall(call.id, {
    status: 'resolved',
    acknowledgedBy: call.acknowledgedBy || user.userId,
    acknowledgedByName: call.acknowledgedByName || user.name,
    resolvedAt: new Date().toISOString(),
  });
  if (!updated) return sendErr(c, 'Failed to resolve call.', 500);

  await logAudit(repo, user, 'RESOLVE_CALL', 'ServiceCall', call.id, `Resolved ${call.type} call for Table #${call.tableNumber}`);
  await realtime.callResolved(updated);
  return sendOk(c, updated);
});

export { callsRoutes };
