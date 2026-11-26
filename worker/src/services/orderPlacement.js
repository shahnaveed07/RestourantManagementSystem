import {
  computeAuthoritativeOrder,
  validateTableForOrder,
  resolveOrderSessionId,
} from './orderCalculator.js';

export class OrderValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function logAudit(repo, user, action, entity, entityId, details) {
  await repo.createAuditLog({
    actorId: user?.userId || null,
    actorName: user?.name || 'System',
    actorRole: user?.role || 'system',
    action,
    entity,
    entityId: entityId || null,
    details,
  });
}

export async function placeTableOrder({
  repo,
  cfg,
  realtime,
  table,
  items,
  source,
  requestedSessionId = '',
  customerId = null,
  customerName = null,
  waiterId = null,
  waiterName = null,
}) {
  const tableCheck = validateTableForOrder(table);
  if (!tableCheck.ok) {
    throw new OrderValidationError(tableCheck.message, tableCheck.status);
  }

  const allMenu = await repo.listMenuItems(true);
  const menuMap = new Map(allMenu.map((m) => [m.id, m]));

  let totals;
  try {
    totals = computeAuthoritativeOrder(items, menuMap, cfg.taxRate);
  } catch (err) {
    throw new OrderValidationError(err.message, 400);
  }

  const nowIso = new Date().toISOString();
  const orderNumber = await repo.nextOrderNumber();
  const sessionId = resolveOrderSessionId(table, requestedSessionId, Date.now());

  const { order, updatedTable } = await repo.createOrderWithTableUpdate(
    {
      orderNumber,
      tableId: table.id,
      tableNumber: table.number,
      tableNumberSnapshot: table.number,
      tableName: table.name,
      sessionId,
      items: totals.items,
      subtotal: totals.subtotal,
      tax: totals.tax,
      discount: 0,
      total: totals.total,
      status: 'pending',
      source,
      orderType: 'dine_in',
      customerId,
      customerName,
      waiterId,
      waiterName,
      statusTimestamps: {
        pending: nowIso,
        accepted: null,
        preparing: null,
        ready: null,
        served: null,
        paid: null,
        cancelled: null,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    table.id,
    sessionId
  );

  if (realtime) {
    await realtime.orderCreated(order);
    if (updatedTable) await realtime.tableStatusChanged(updatedTable);
  }

  return { order, updatedTable };
}

export async function createSimulatedGuestOrder({ repo, cfg, realtime, targetTableId, simulatedSource = 'qr' }) {
  const [tables, menuItems] = await Promise.all([repo.listTables(), repo.listMenuItems(false)]);
  const availableItems = menuItems.filter((m) => m.isAvailable);
  const eligibleTables = tables.filter((t) => t.status === 'free' || t.status === 'occupied');
  if (tables.length === 0 || availableItems.length === 0) {
    throw new OrderValidationError('No tables or available menu items to simulate.', 400);
  }

  let table = null;
  if (targetTableId) {
    table = tables.find((t) => t.id === targetTableId) || null;
  } else {
    if (eligibleTables.length === 0) {
      throw new OrderValidationError('No free or occupied tables available to simulate.', 409);
    }
    table = eligibleTables[Math.floor(Math.random() * eligibleTables.length)];
  }

  const count = 1 + Math.floor(Math.random() * 3);
  const shuffled = [...availableItems].sort(() => Math.random() - 0.5).slice(0, count);
  const sampleNotes = ['', '', 'No onions please', 'Extra sauce on the side', 'Allergy: tree nuts'];
  const requested = shuffled.map((item) => ({
    menuItemId: item.id,
    qty: 1 + Math.floor(Math.random() * 2),
    notes: sampleNotes[Math.floor(Math.random() * sampleNotes.length)],
  }));

  const { order } = await placeTableOrder({
    repo,
    cfg,
    realtime,
    table,
    items: requested,
    source: simulatedSource === 'home' ? 'home' : 'qr',
  });
  return order;
}

export async function createSimulatedCall({ repo, realtime, targetTableId, callType }) {
  const tables = await repo.listTables();
  if (tables.length === 0) throw new OrderValidationError('No tables available.', 400);
  const table = targetTableId
    ? tables.find((t) => t.id === targetTableId) || tables[0]
    : tables[Math.floor(Math.random() * tables.length)];

  const types = ['waiter', 'water', 'napkins', 'bill', 'other'];
  const chosenType = callType || types[Math.floor(Math.random() * types.length)];
  const msgMap = {
    waiter: 'Could someone stop by our table?',
    water: 'Could we get another carafe of still water?',
    napkins: 'Extra cloth napkins please.',
    bill: 'Ready to settle our check.',
    other: 'Question about tonight’s specials.',
  };

  const call = await repo.createCall({
    tableId: table.id,
    tableNumber: table.number,
    tableName: table.name,
    sessionId: table.currentSessionId,
    type: chosenType,
    message: msgMap[chosenType],
    status: 'open',
    acknowledgedBy: null,
    acknowledgedByName: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  });

  if (realtime) {
    await realtime.callCreated(call);
  }
  return call;
}
