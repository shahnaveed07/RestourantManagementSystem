import { Hono } from 'hono';
import { z } from 'zod';
import { sanitizeText, roundCurrency } from '../services/orderCalculator.js';
import { logAudit } from '../services/orderPlacement.js';
import { authenticate, requireRole, sendOk, sendErr } from '../middleware/auth.js';

const menuRoutes = new Hono();

menuRoutes.get('/', async (c) => {
  const repo = c.get('repo');
  const [categories, items] = await Promise.all([repo.listCategories(), repo.listMenuItems(false)]);
  return sendOk(c, { categories, items });
});

menuRoutes.post('/categories', authenticate, requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(2).max(60),
    sortOrder: z.number().int().min(0).default(10),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid category details.', 400);

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  try {
    const created = await repo.createCategory({
      name: sanitizeText(parsed.data.name),
      sortOrder: parsed.data.sortOrder,
      isActive: true,
    });
    await realtime.menuUpdated({ reason: 'category_created' });
    return sendOk(c, created, 'Category created.', 201);
  } catch (err) {
    return sendErr(c, err.message || 'Category already exists.', 409);
  }
});

menuRoutes.put('/categories/:id', authenticate, requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    name: z.string().min(2).max(60).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid category update.', 400);

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const updated = await repo.updateCategory(String(c.req.param('id')), {
    ...(parsed.data.name ? { name: sanitizeText(parsed.data.name) } : {}),
    ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
  });
  if (!updated) return sendErr(c, 'Category not found.', 404);
  await realtime.menuUpdated({ reason: 'category_updated' });
  return sendOk(c, updated);
});

menuRoutes.delete('/categories/:id', authenticate, requireRole('admin', 'manager'), async (c) => {
  const categoryId = String(c.req.param('id'));
  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const items = await repo.listMenuItems(false);
  if (items.some((item) => item.categoryId === categoryId)) {
    return sendErr(c, 'Cannot delete a category that still has menu items.', 400);
  }
  const ok = await repo.deleteCategory(categoryId);
  if (!ok) return sendErr(c, 'Category not found.', 404);
  await realtime.menuUpdated({ reason: 'category_deleted' });
  return sendOk(c, { deleted: true });
});

const menuItemSchema = z.object({
  name: z.string().min(2).max(90),
  description: z.string().max(320).default(''),
  price: z.number().positive().max(10000),
  categoryId: z.string().min(1),
  imageUrl: z.string().max(250000).default(''),
  isVeg: z.boolean().default(false),
  spiceLevel: z.enum(['none', 'mild', 'medium', 'hot']).default('none'),
  allergens: z.array(z.string().max(30)).default([]),
  prepTimeMinutes: z.number().int().min(1).max(120).default(12),
  isAvailable: z.boolean().default(true),
});

menuRoutes.post('/items', authenticate, requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = menuItemSchema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid dish fields. Check name, price, and category.', 400);

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const categories = await repo.listCategories();
  if (!categories.some((cat) => cat.id === parsed.data.categoryId)) {
    return sendErr(c, 'Selected category does not exist.', 400);
  }

  const created = await repo.createMenuItem({
    name: sanitizeText(parsed.data.name),
    description: sanitizeText(parsed.data.description),
    price: roundCurrency(parsed.data.price),
    categoryId: parsed.data.categoryId,
    imageUrl: parsed.data.imageUrl.trim(),
    isVeg: parsed.data.isVeg,
    spiceLevel: parsed.data.spiceLevel,
    allergens: parsed.data.allergens.map((a) => sanitizeText(a)).filter(Boolean),
    prepTimeMinutes: parsed.data.prepTimeMinutes,
    isAvailable: parsed.data.isAvailable,
    isActive: true,
  });
  await logAudit(repo, c.get('user'), 'CREATE_MENU_ITEM', 'MenuItem', created.id, `Added "${created.name}" ($${created.price})`);
  await realtime.menuUpdated({ reason: 'item_created' });
  return sendOk(c, created, 'Menu item created.', 201);
});

menuRoutes.put('/items/:id', authenticate, requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = menuItemSchema.partial().safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid dish update.', 400);

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  if (parsed.data.categoryId !== undefined) {
    const categories = await repo.listCategories();
    if (!categories.some((cat) => cat.id === parsed.data.categoryId)) {
      return sendErr(c, 'Selected category does not exist.', 400);
    }
  }

  const patch = { ...parsed.data };
  if (typeof patch.name === 'string') patch.name = sanitizeText(patch.name);
  if (typeof patch.description === 'string') patch.description = sanitizeText(patch.description);
  if (typeof patch.price === 'number') patch.price = roundCurrency(patch.price);

  const updated = await repo.updateMenuItem(String(c.req.param('id')), patch);
  if (!updated) return sendErr(c, 'Menu item not found.', 404);
  await logAudit(repo, c.get('user'), 'UPDATE_MENU_ITEM', 'MenuItem', updated.id, `Updated "${updated.name}"`);
  await realtime.menuUpdated({ reason: 'item_updated' });
  return sendOk(c, updated);
});

menuRoutes.patch('/items/:id/availability', authenticate, requireRole('admin', 'manager', 'kitchen'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({ isAvailable: z.boolean() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'isAvailable boolean required.', 400);

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const updated = await repo.updateMenuItem(String(c.req.param('id')), {
    isAvailable: parsed.data.isAvailable,
  });
  if (!updated) return sendErr(c, 'Menu item not found.', 404);

  await logAudit(
    repo,
    c.get('user'),
    'TOGGLE_AVAILABILITY',
    'MenuItem',
    updated.id,
    `"${updated.name}" -> ${updated.isAvailable ? 'Available' : 'Sold Out'}`
  );
  await realtime.menuItemAvailabilityChanged(updated);
  return sendOk(c, updated);
});

menuRoutes.post('/items/bulk-price', authenticate, requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    categoryId: z.string().optional(),
    mode: z.enum(['percent', 'flat']),
    amount: z.number().min(-50).max(500),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return sendErr(c, 'Invalid bulk price update parameters.', 400);

  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const items = await repo.listMenuItems(false);
  const targets = parsed.data.categoryId
    ? items.filter((i) => i.categoryId === parsed.data.categoryId)
    : items;

  let updatedCount = 0;
  for (const item of targets) {
    const nextPrice =
      parsed.data.mode === 'percent'
        ? roundCurrency(item.price * (1 + parsed.data.amount / 100))
        : roundCurrency(item.price + parsed.data.amount);
    if (nextPrice > 0.5) {
      await repo.updateMenuItem(item.id, { price: nextPrice });
      updatedCount += 1;
    }
  }

  await logAudit(
    repo,
    c.get('user'),
    'BULK_PRICE_UPDATE',
    'MenuItem',
    null,
    `Adjusted ${updatedCount} items by ${parsed.data.amount}${parsed.data.mode === 'percent' ? '%' : ' USD'}`
  );
  await realtime.menuUpdated({ reason: 'bulk_price_update' });
  return sendOk(c, { updatedCount }, `Updated prices on ${updatedCount} dishes.`);
});

menuRoutes.delete('/items/:id', authenticate, requireRole('admin', 'manager'), async (c) => {
  const repo = c.get('repo');
  const realtime = c.get('realtime');
  const ok = await repo.deleteMenuItem(String(c.req.param('id')));
  if (!ok) return sendErr(c, 'Menu item not found.', 404);
  await realtime.menuUpdated({ reason: 'item_deleted' });
  return sendOk(c, { deleted: true });
});

export { menuRoutes };
