import { Hono } from 'hono';
import { escapeCsvCell, roundCurrency } from '../services/orderCalculator.js';
import { authenticate, requireRole, sendOk } from '../middleware/auth.js';

const reportsRoutes = new Hono();

reportsRoutes.get('/summary', authenticate, requireRole('admin', 'manager'), async (c) => {
  const from = c.req.query('from') || undefined;
  const to = c.req.query('to') || undefined;
  const repo = c.get('repo');

  const [orders, payments, tables, calls, categories, menuItems] = await Promise.all([
    repo.listOrders({ from, to }),
    repo.listPayments({ from, to }),
    repo.listTables(),
    repo.listCalls({ statuses: ['open', 'acknowledged'] }),
    repo.listCategories(),
    repo.listMenuItems(true),
  ]);

  const nonCancelledOrders = orders.filter((o) => o.status !== 'cancelled');
  const paidOrders = orders.filter((o) => o.status === 'paid');
  const openOrders = orders.filter((o) =>
    ['pending', 'accepted', 'preparing', 'ready', 'served'].includes(o.status)
  );

  const totalSales = roundCurrency(payments.reduce((sum, p) => sum + p.amount, 0));
  const activeTables = tables.filter((t) => t.status === 'occupied').length;

  const prepDurations = [];
  for (const o of nonCancelledOrders) {
    const start = o.statusTimestamps?.pending || o.createdAt;
    const end = o.statusTimestamps?.ready || o.statusTimestamps?.served;
    if (start && end) {
      const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
      if (mins > 0 && mins < 180) prepDurations.push(mins);
    }
  }
  const avgPrepMinutes =
    prepDurations.length > 0
      ? Math.round((prepDurations.reduce((a, b) => a + b, 0) / prepDurations.length) * 10) / 10
      : 13.5;

  const hourBuckets = new Map();
  for (let h = 0; h < 24; h += 1) {
    hourBuckets.set(h, { hour: `${String(h).padStart(2, '0')}:00`, sales: 0, orders: 0 });
  }
  let minHour = 23;
  let maxHour = 0;
  for (const o of nonCancelledOrders) {
    const h = new Date(o.createdAt).getHours();
    minHour = Math.min(minHour, h);
    maxHour = Math.max(maxHour, h);
    const bucket = hourBuckets.get(h);
    if (bucket) {
      bucket.sales = roundCurrency(bucket.sales + o.total);
      bucket.orders += 1;
    }
  }
  const currentHour = new Date().getHours();
  const startHour =
    nonCancelledOrders.length > 0
      ? Math.min(minHour, Math.max(0, currentHour - 6))
      : Math.max(0, currentHour - 6);
  const endHour = nonCancelledOrders.length > 0 ? Math.max(maxHour, currentHour) : currentHour;
  const salesByHour = Array.from(hourBuckets.values()).slice(startHour, endHour + 1);

  const itemStats = new Map();
  const categoryNameMap = new Map(categories.map((cat) => [cat.id, cat.name]));
  const itemCategoryMap = new Map(
    menuItems.map((m) => [m.id, categoryNameMap.get(m.categoryId) || 'Other'])
  );
  const salesByCategoryMap = new Map();

  for (const o of nonCancelledOrders) {
    for (const item of o.items) {
      const rev = roundCurrency(item.price * item.qty);
      const cur = itemStats.get(item.name) || { name: item.name, qty: 0, revenue: 0 };
      cur.qty += item.qty;
      cur.revenue = roundCurrency(cur.revenue + rev);
      itemStats.set(item.name, cur);

      const catName = itemCategoryMap.get(item.menuItemId) || 'Other';
      const catCur = salesByCategoryMap.get(catName) || { category: catName, qty: 0, revenue: 0 };
      catCur.qty += item.qty;
      catCur.revenue = roundCurrency(catCur.revenue + rev);
      salesByCategoryMap.set(catName, catCur);
    }
  }

  const topItems = Array.from(itemStats.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const salesByCategory = Array.from(salesByCategoryMap.values()).sort(
    (a, b) => b.revenue - a.revenue
  );

  const waiterMap = new Map();
  for (const o of nonCancelledOrders) {
    const label = o.waiterName || (o.source === 'home' ? 'Home Self-Order' : 'Guest QR Self-Order');
    const cur = waiterMap.get(label) || { waiter: label, orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue = roundCurrency(cur.revenue + o.total);
    waiterMap.set(label, cur);
  }

  const tableSalesMap = new Map();
  for (const o of nonCancelledOrders) {
    const tableNum = o.tableNumberSnapshot ?? o.tableNumber;
    const cur = tableSalesMap.get(tableNum) || {
      tableNumber: tableNum,
      tableName: o.tableName,
      orders: 0,
      revenue: 0,
    };
    cur.orders += 1;
    cur.revenue = roundCurrency(cur.revenue + o.total);
    tableSalesMap.set(tableNum, cur);
  }

  return sendOk(c, {
    kpis: {
      todaySales: totalSales,
      totalOrders: nonCancelledOrders.length,
      paidOrdersCount: paidOrders.length,
      openOrdersCount: openOrders.length,
      activeTables,
      totalTables: tables.length,
      openCallsCount: calls.length,
      avgPrepMinutes,
      avgCheckSize: paidOrders.length > 0 ? roundCurrency(totalSales / paidOrders.length) : 0,
    },
    salesByHour,
    topItems,
    salesByCategory,
    salesByWaiter: Array.from(waiterMap.values()).sort((a, b) => b.revenue - a.revenue),
    salesByTable: Array.from(tableSalesMap.values()).sort((a, b) => b.revenue - a.revenue),
    recentPayments: payments.slice(0, 20),
  });
});

reportsRoutes.get('/export', authenticate, requireRole('admin', 'manager'), async (c) => {
  const from = c.req.query('from') || undefined;
  const to = c.req.query('to') || undefined;
  const repo = c.get('repo');
  const orders = await repo.listOrders({ from, to });

  const header = [
    'Order Number',
    'Date',
    'Table',
    'Source',
    'Waiter',
    'Status',
    'Items',
    'Subtotal',
    'Tax',
    'Discount',
    'Total',
  ];
  const rows = orders.map((o) =>
    [
      o.orderNumber,
      o.createdAt,
      `Table ${o.tableNumberSnapshot ?? o.tableNumber}`,
      o.source,
      o.waiterName || (o.source === 'home' ? 'Home Self-Order' : 'Guest QR'),
      o.status,
      o.items.map((i) => `${i.qty}x ${i.name}`).join('; '),
      o.subtotal.toFixed(2),
      o.tax.toFixed(2),
      o.discount.toFixed(2),
      o.total.toFixed(2),
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  const csv = [header.join(','), ...rows].join('\n');
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="passline-sales-report.csv"',
    },
  });
});

export { reportsRoutes };
