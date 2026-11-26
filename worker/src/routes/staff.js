import { Hono } from 'hono';
import { z } from 'zod';
import { hashPassword } from '../utils/crypto.js';
import { sanitizeText } from '../services/orderCalculator.js';
import { logAudit } from '../services/orderPlacement.js';
import { authenticate, requireRole, sendOk, sendErr } from '../middleware/auth.js';

const staffRoutes = new Hono();

staffRoutes.get('/', authenticate, requireRole('admin'), async (c) => {
  const repo = c.get('repo');
  const [users, auditLogs] = await Promise.all([repo.listUsers(), repo.listAuditLogs(40)]);
  return sendOk(c, {
    users: users
      .filter((u) => u.role !== 'customer')
      .map(({ passwordHash: _pw, ...safe }) => safe),
    auditLogs,
  });
});

staffRoutes.post('/', authenticate, requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(6).max(64),
    role: z.enum(['admin', 'manager', 'waiter', 'kitchen']),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Valid name, email, role, and 6+ char password required.', 400);

  const repo = c.get('repo');
  const existing = await repo.findUserByEmail(parsed.data.email);
  if (existing) return sendErr(c, 'A staff member with this email already exists.', 409);

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await repo.createUser({
    name: sanitizeText(parsed.data.name),
    email: parsed.data.email.toLowerCase().trim(),
    passwordHash,
    role: parsed.data.role,
    isActive: true,
    lastLoginAt: null,
    isDemo: false,
  });
  await logAudit(repo, c.get('user'), 'CREATE_STAFF', 'User', created.id, `Created ${created.role} account for ${created.email}`);
  const { passwordHash: _pw, ...safe } = created;
  return sendOk(c, safe, 'Staff account created.', 201);
});

staffRoutes.put('/:id', authenticate, requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(2).max(80).optional(),
    role: z.enum(['admin', 'manager', 'waiter', 'kitchen']).optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid staff update payload.', 400);

  const repo = c.get('repo');
  const updated = await repo.updateUser(String(c.req.param('id')), {
    ...(parsed.data.name ? { name: sanitizeText(parsed.data.name) } : {}),
    ...(parsed.data.role ? { role: parsed.data.role } : {}),
    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
  });
  if (!updated) return sendErr(c, 'User not found.', 404);

  if (parsed.data.isActive === false) {
    await repo.revokeAllUserRefreshTokens(updated.id);
  }

  await logAudit(
    repo,
    c.get('user'),
    'UPDATE_STAFF',
    'User',
    updated.id,
    `Updated ${updated.email} (${updated.role}, active=${updated.isActive})`
  );
  const { passwordHash: _pw, ...safe } = updated;
  return sendOk(c, safe);
});

staffRoutes.post('/:id/reset-password', authenticate, requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({ newPassword: z.string().min(6).max(64) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Password must be at least 6 characters.', 400);

  const repo = c.get('repo');
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const updated = await repo.updateUser(String(c.req.param('id')), { passwordHash });
  if (!updated) return sendErr(c, 'User not found.', 404);

  await repo.revokeAllUserRefreshTokens(updated.id);
  await logAudit(repo, c.get('user'), 'RESET_PASSWORD', 'User', updated.id, `Reset password for ${updated.email}`);
  return sendOk(c, { updated: true }, 'Password reset successfully.');
});

export { staffRoutes };
