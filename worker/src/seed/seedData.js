import { hashPassword } from '../utils/crypto.js';
import { roundCurrency } from '../services/orderCalculator.js';

const IMG_STARTER = '/src/assets/images/dish_burrata_starter_1795178821594.jpg';
const IMG_SALMON = '/src/assets/images/dish_seared_salmon_1795178823192.jpg';
const IMG_PASTA = '/src/assets/images/dish_truffle_pasta_1795178825033.jpg';
const IMG_PIZZA = '/src/assets/images/dish_woodfired_pizza_1795178824146.jpg';
const IMG_DESSERT = '/src/assets/images/dish_tiramisu_dessert_1795178823665.jpg';
const IMG_DRINK = '/src/assets/images/dish_craft_beverage_1795178823569.jpg';

let seedInFlight = null;

export async function ensureDemoSeeded(repo, cfg) {
  if (!cfg.demoMode) return;
  const count = await repo.countUsers();
  if (count > 0) return;

  if (!seedInFlight) {
    seedInFlight = seedDatabase(repo, cfg, false).finally(() => {
      seedInFlight = null;
    });
  }
  await seedInFlight;
}

export async function seedDatabase(repo, cfg, forceReset = false) {
  const existingUsers = await repo.listUsers();
  if (!forceReset && existingUsers.length > 0) {
    const requiredDemoCustomers = [
      { name: 'Alex Rivera', email: 'customer@demo.com', mobile: '+919999999991' },
      { name: 'Maya Patel', email: 'guest@demo.com', mobile: '+919999999992' },
    ];
    for (const spec of requiredDemoCustomers) {
      const existing = existingUsers.find((u) => u.email?.toLowerCase() === spec.email);
      if (!existing) {
        await repo.createUser({
          name: spec.name,
          email: spec.email,
          mobile: spec.mobile,
          passwordHash: null,
          role: 'customer',
          isActive: true,
          lastLoginAt: null,
          isDemo: true,
        });
      } else if (!existing.mobile) {
        await repo.updateUser(existing.id, { mobile: spec.mobile });
      }
    }

    const [tables, cats, items, orders] = await Promise.all([
      repo.listTables(),
      repo.listCategories(),
      repo.listMenuItems(false),
      repo.listOrders(),
    ]);
    return {
      users: [
        { role: 'admin', email: 'admin@demo.com', password: 'Admin@123' },
        { role: 'manager', email: 'manager@demo.com', password: 'Manager@123' },
        { role: 'waiter', email: 'waiter@demo.com', password: 'Waiter@123' },
        { role: 'kitchen', email: 'kitchen@demo.com', password: 'Kitchen@123' },
        { role: 'customer', email: 'customer@demo.com', mobile: '+919999999991', password: null },
        { role: 'customer', email: 'guest@demo.com', mobile: '+919999999992', password: null },
      ],
      tables: tables.map((t) => ({
        number: t.number,
        name: t.name,
        section: t.section,
        qrToken: t.qrToken,
      })),
      categoriesCount: cats.length,
      menuItemsCount: items.length,
      ordersCount: orders.length,
    };
  }

  await repo.wipeAll();

  // 1. Seed Demo Accounts (Staff with PBKDF2-SHA256 hashes + OTP Customers)
  const demoAccounts = [
    { name: 'Elena Vance', email: 'admin@demo.com', mobile: null, password: 'Admin@123', role: 'admin' },
    { name: 'Marcus Chen', email: 'manager@demo.com', mobile: null, password: 'Manager@123', role: 'manager' },
    { name: 'Sofia Morales', email: 'waiter@demo.com', mobile: null, password: 'Waiter@123', role: 'waiter' },
    { name: 'Devon Brooks', email: 'kitchen@demo.com', mobile: null, password: 'Kitchen@123', role: 'kitchen' },
    { name: 'Alex Rivera', email: 'customer@demo.com', mobile: '+919999999991', password: null, role: 'customer' },
    { name: 'Maya Patel', email: 'guest@demo.com', mobile: '+919999999992', password: null, role: 'customer' },
  ];

  const createdUsers = [];
  for (const acc of demoAccounts) {
    const passwordHash = acc.password ? await hashPassword(acc.password) : null;
    const user = await repo.createUser({
      name: acc.name,
      email: acc.email,
      mobile: acc.mobile,
      passwordHash,
      role: acc.role,
      isActive: true,
      lastLoginAt: null,
      isDemo: true,
    });
    createdUsers.push(user);
  }
  const waiterUser = createdUsers.find((u) => u.role === 'waiter');
  const adminUser = createdUsers.find((u) => u.role === 'admin');

  // 2. Seed 12 Tables across 3 sections
  const tableSpecs = [
    { number: 1, name: 'Table 1 — Window Two-Top', capacity: 2, section: 'Main Dining', status: 'occupied', qrToken: 't01-linden01' },
    { number: 2, name: 'Table 2 — Window Four-Top', capacity: 4, section: 'Main Dining', status: 'occupied', qrToken: 't02-linden02' },
    { number: 3, name: 'Table 3 — Oak Banquette', capacity: 4, section: 'Main Dining', status: 'free', qrToken: 't03-linden03' },
    { number: 4, name: 'Table 4 — Center Round', capacity: 6, section: 'Main Dining', status: 'occupied', qrToken: 't04-linden04' },
    { number: 5, name: 'Table 5 — Chef Pass Counter', capacity: 2, section: 'Main Dining', status: 'reserved', qrToken: 't05-linden05' },
    { number: 6, name: 'Table 6 — Corner Booth', capacity: 6, section: 'Main Dining', status: 'free', qrToken: 't06-linden06' },
    { number: 7, name: 'Table 7 — Olive Tree Patio', capacity: 4, section: 'Patio Terrace', status: 'free', qrToken: 't07-patio07' },
    { number: 8, name: 'Table 8 — Pergola Lounge', capacity: 4, section: 'Patio Terrace', status: 'cleaning', qrToken: 't08-patio08' },
    { number: 9, name: 'Table 9 — Garden Six-Top', capacity: 6, section: 'Patio Terrace', status: 'reserved', qrToken: 't09-patio09' },
    { number: 10, name: 'Table 10 — Slate Bar High', capacity: 2, section: 'Bar Lounge', status: 'free', qrToken: 't10-lounge10' },
    { number: 11, name: 'Table 11 — Cellar Nook', capacity: 4, section: 'Bar Lounge', status: 'free', qrToken: 't11-lounge11' },
    { number: 12, name: 'Table 12 — Private Alcove', capacity: 8, section: 'Bar Lounge', status: 'free', qrToken: 't12-lounge12' },
  ];

  const tables = [];
  for (const spec of tableSpecs) {
    const t = await repo.createTable({
      ...spec,
      isActive: true,
      currentSessionId: spec.status === 'occupied' ? `sess-demo-t${spec.number}` : null,
    });
    tables.push(t);
  }

  // 3. Seed 4 Categories
  const catSmallPlates = await repo.createCategory({ name: 'Small Plates & Starters', sortOrder: 1, isActive: true });
  const catMains = await repo.createCategory({ name: 'Wood-Fired Mains & Pasta', sortOrder: 2, isActive: true });
  const catFlatbreads = await repo.createCategory({ name: 'Sourdough Flatbreads & Sides', sortOrder: 3, isActive: true });
  const catDessertsDrinks = await repo.createCategory({ name: 'Desserts & Craft Drinks', sortOrder: 4, isActive: true });

  // 4. Seed 30 Dishes
  const dishSpecs = [
    // Small Plates & Starters (8)
    {
      name: 'Heirloom Tomato & Burrata',
      description: 'Creamy Pugliese burrata, charred sourdough crostini, cold-pressed basil oil, Maldon sea salt.',
      price: 16.5,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_STARTER,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Gluten'],
      prepTimeMinutes: 7,
      isAvailable: true,
    },
    {
      name: 'Charred Shishito Peppers',
      description: 'Blistered over white oak embers with smoked yuzu kosho aioli and toasted sesame.',
      price: 12.0,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_PIZZA,
      isVeg: true,
      spiceLevel: 'mild',
      allergens: ['Sesame', 'Egg'],
      prepTimeMinutes: 8,
      isAvailable: true,
    },
    {
      name: 'Crispy Calamari Fritti',
      description: 'Semolina-dusted Pacific squid, Calabrian chili marinara, charred Meyer lemon.',
      price: 17.5,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_SALMON,
      isVeg: false,
      spiceLevel: 'medium',
      allergens: ['Shellfish', 'Gluten'],
      prepTimeMinutes: 10,
      isAvailable: true,
    },
    {
      name: 'Roasted Beet & Goat Cheese Carpaccio',
      description: 'Salt-baked ruby beets, whipped chèvre, candied pistachios, aged sherry reduction.',
      price: 15.0,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_STARTER,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Tree Nuts'],
      prepTimeMinutes: 8,
      isAvailable: true,
    },
    {
      name: 'Yellowfin Tuna Crudo',
      description: 'Line-caught ahi, blood orange segments, pickled shallots, crispy capers, Fresno chili.',
      price: 21.0,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_SALMON,
      isVeg: false,
      spiceLevel: 'mild',
      allergens: ['Fish'],
      prepTimeMinutes: 9,
      isAvailable: true,
    },
    {
      name: 'Whipped Ricotta & Wild Honey',
      description: 'House-pulled sheep milk ricotta, thyme blossom honey, cracked Tellicherry pepper, country levain.',
      price: 14.0,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_STARTER,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Gluten'],
      prepTimeMinutes: 6,
      isAvailable: true,
    },
    {
      name: 'Spicy Nduja Mussels',
      description: 'Prince Edward Island mussels steamed in dry vermouth, spicy Calabrian nduja, grilled focaccia.',
      price: 19.5,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_SALMON,
      isVeg: false,
      spiceLevel: 'hot',
      allergens: ['Shellfish', 'Gluten'],
      prepTimeMinutes: 12,
      isAvailable: true,
    },
    {
      name: 'Truffle Arancini Trio',
      description: 'Crisp Carnaroli risotto spheres stuffed with fontina fonduta and black summer truffle.',
      price: 15.5,
      categoryId: catSmallPlates.id,
      imageUrl: IMG_PASTA,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Gluten', 'Egg'],
      prepTimeMinutes: 11,
      isAvailable: false,
    },

    // Wood-Fired Mains & Pasta (8)
    {
      name: 'Pan-Seared Atlantic Salmon',
      description: 'Crispy-skin wild fillet over charred broccolini, saffron fennel purée, caper herb butter.',
      price: 32.0,
      categoryId: catMains.id,
      imageUrl: IMG_SALMON,
      isVeg: false,
      spiceLevel: 'none',
      allergens: ['Fish', 'Dairy'],
      prepTimeMinutes: 16,
      isAvailable: true,
    },
    {
      name: 'Wild Chanterelle Truffle Tagliatelle',
      description: 'Hand-rolled egg ribbons, roasted golden chanterelles, 24-month Parmigiano, shaved black truffle.',
      price: 28.5,
      categoryId: catMains.id,
      imageUrl: IMG_PASTA,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Gluten', 'Egg', 'Dairy'],
      prepTimeMinutes: 14,
      isAvailable: true,
    },
    {
      name: 'Hearth-Roasted Half Chicken',
      description: 'Brined heritage poultry, rosemary jus, crispy fingerling potatoes, blistered heirloom carrots.',
      price: 29.0,
      categoryId: catMains.id,
      imageUrl: IMG_SALMON,
      isVeg: false,
      spiceLevel: 'none',
      allergens: [],
      prepTimeMinutes: 20,
      isAvailable: true,
    },
    {
      name: 'Spicy Vodka Rigatoni',
      description: 'Bronze-die rigatoni in slow-simmered San Marzano tomato cream, Calabrian chili oil, basil.',
      price: 24.0,
      categoryId: catMains.id,
      imageUrl: IMG_PASTA,
      isVeg: true,
      spiceLevel: 'medium',
      allergens: ['Gluten', 'Dairy'],
      prepTimeMinutes: 13,
      isAvailable: true,
    },
    {
      name: 'Prime Hanger Steak Frites',
      description: 'Oak-grilled 9oz prime hanger, black garlic compound butter, rosemary tallow fries.',
      price: 38.0,
      categoryId: catMains.id,
      imageUrl: IMG_SALMON,
      isVeg: false,
      spiceLevel: 'none',
      allergens: ['Dairy'],
      prepTimeMinutes: 18,
      isAvailable: true,
    },
    {
      name: 'Braised Short Rib Pappardelle',
      description: '12-hour Barolo braised beef ragu, wide ribbon pasta, gremolata, pecorino snow.',
      price: 31.0,
      categoryId: catMains.id,
      imageUrl: IMG_PASTA,
      isVeg: false,
      spiceLevel: 'none',
      allergens: ['Gluten', 'Egg', 'Dairy'],
      prepTimeMinutes: 15,
      isAvailable: true,
    },
    {
      name: 'Miso-Glazed Black Cod',
      description: 'Sustainably caught sablefish, dashi-braised bok choy, crispy ginger rice cake.',
      price: 36.0,
      categoryId: catMains.id,
      imageUrl: IMG_SALMON,
      isVeg: false,
      spiceLevel: 'mild',
      allergens: ['Fish', 'Soy'],
      prepTimeMinutes: 17,
      isAvailable: false,
    },
    {
      name: 'Charred Maitake & Polenta Bowl',
      description: 'Wood-roasted hen-of-the-woods mushroom, creamy heirloom polenta, crispy sage, pine nuts.',
      price: 25.0,
      categoryId: catMains.id,
      imageUrl: IMG_PASTA,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Tree Nuts'],
      prepTimeMinutes: 14,
      isAvailable: true,
    },

    // Sourdough Flatbreads & Sides (7)
    {
      name: 'Wood-Fired Margherita Flatbread',
      description: '72-hour fermented sourdough crust, crushed San Marzano tomatoes, fior di latte, garden basil.',
      price: 19.0,
      categoryId: catFlatbreads.id,
      imageUrl: IMG_PIZZA,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Gluten', 'Dairy'],
      prepTimeMinutes: 11,
      isAvailable: true,
    },
    {
      name: 'Hot Honey & Soppressata Flatbread',
      description: 'Crisp artisan salami, smoked provolone, pickled jalapeños, wildflower chili honey.',
      price: 22.0,
      categoryId: catFlatbreads.id,
      imageUrl: IMG_PIZZA,
      isVeg: false,
      spiceLevel: 'hot',
      allergens: ['Gluten', 'Dairy'],
      prepTimeMinutes: 12,
      isAvailable: true,
    },
    {
      name: 'Roasted Mushroom & Taleggio Flatbread',
      description: 'Garlic confit base, thyme-roasted cremini, melted Taleggio, baby arugula.',
      price: 21.0,
      categoryId: catFlatbreads.id,
      imageUrl: IMG_PIZZA,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Gluten', 'Dairy'],
      prepTimeMinutes: 12,
      isAvailable: true,
    },
    {
      name: 'Rosemary Sea Salt Focaccia',
      description: 'Warm house-baked olive oil focaccia served with roasted garlic oil and aged balsamic.',
      price: 9.5,
      categoryId: catFlatbreads.id,
      imageUrl: IMG_PIZZA,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Gluten'],
      prepTimeMinutes: 5,
      isAvailable: true,
    },
    {
      name: 'Crispy Brussels & Pancetta',
      description: 'Flash-fried sprouts, smoky cured pancetta, cider glaze, toasted hazelnuts.',
      price: 13.0,
      categoryId: catFlatbreads.id,
      imageUrl: IMG_STARTER,
      isVeg: false,
      spiceLevel: 'none',
      allergens: ['Tree Nuts'],
      prepTimeMinutes: 9,
      isAvailable: true,
    },
    {
      name: 'Parmesan Truffle Pommes Frites',
      description: 'Twice-cooked Kennebec potatoes, white truffle oil, aged parmesan, garlic aioli.',
      price: 11.5,
      categoryId: catFlatbreads.id,
      imageUrl: IMG_PASTA,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Egg'],
      prepTimeMinutes: 8,
      isAvailable: true,
    },
    {
      name: 'Little Gem Caesar Salad',
      description: 'Crisp baby gem leaves, sourdough pangrattato, white anchovy dressing, shaved grana.',
      price: 14.5,
      categoryId: catFlatbreads.id,
      imageUrl: IMG_STARTER,
      isVeg: false,
      spiceLevel: 'none',
      allergens: ['Fish', 'Dairy', 'Gluten', 'Egg'],
      prepTimeMinutes: 7,
      isAvailable: true,
    },

    // Desserts & Craft Drinks (7)
    {
      name: 'Espresso Mascarpone Tiramisu',
      description: 'Savoiardi soaked in single-origin espresso, whipped mascarpone zabaglione, Valrhona cocoa.',
      price: 13.5,
      categoryId: catDessertsDrinks.id,
      imageUrl: IMG_DESSERT,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Egg', 'Gluten'],
      prepTimeMinutes: 5,
      isAvailable: true,
    },
    {
      name: 'Burnt Basque Cheesecake',
      description: 'Caramelized crust with custardy vanilla bean center and macerated blackberry compote.',
      price: 14.0,
      categoryId: catDessertsDrinks.id,
      imageUrl: IMG_DESSERT,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Egg'],
      prepTimeMinutes: 5,
      isAvailable: true,
    },
    {
      name: 'Dark Chocolate Olive Oil Torte',
      description: 'Flourless 70% dark chocolate cake, flaky sea salt, crème fraîche.',
      price: 13.0,
      categoryId: catDessertsDrinks.id,
      imageUrl: IMG_DESSERT,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy', 'Egg'],
      prepTimeMinutes: 5,
      isAvailable: true,
    },
    {
      name: 'Blood Orange & Rosemary Spritz',
      description: 'Fresh-pressed blood orange, botanical bitter aperitif (zero-proof), rosemary sprig, tonic.',
      price: 11.0,
      categoryId: catDessertsDrinks.id,
      imageUrl: IMG_DRINK,
      isVeg: true,
      spiceLevel: 'none',
      allergens: [],
      prepTimeMinutes: 4,
      isAvailable: true,
    },
    {
      name: 'Yuzu Ginger Highball',
      description: 'Japanese yuzu juice, house-brewed spicy ginger beer, lime leaf, clear ice spear.',
      price: 10.5,
      categoryId: catDessertsDrinks.id,
      imageUrl: IMG_DRINK,
      isVeg: true,
      spiceLevel: 'mild',
      allergens: [],
      prepTimeMinutes: 4,
      isAvailable: true,
    },
    {
      name: 'Smoked Orchard Old Fashioned',
      description: 'Small-batch rye, spiced apple reduction, aromatic bitters, expressed orange peel.',
      price: 16.0,
      categoryId: catDessertsDrinks.id,
      imageUrl: IMG_DRINK,
      isVeg: true,
      spiceLevel: 'none',
      allergens: [],
      prepTimeMinutes: 5,
      isAvailable: true,
    },
    {
      name: 'Single-Origin Cold Brew Tonic',
      description: '18-hour Ethiopian cold brew layered over artisanal Indian tonic and grapefruit twist.',
      price: 8.5,
      categoryId: catDessertsDrinks.id,
      imageUrl: IMG_DRINK,
      isVeg: true,
      spiceLevel: 'none',
      allergens: [],
      prepTimeMinutes: 3,
      isAvailable: true,
    },
  ];

  const menuItems = [];
  for (const d of dishSpecs) {
    const item = await repo.createMenuItem({ ...d, isActive: true });
    menuItems.push(item);
  }

  // 5. Seed Historical Paid Orders & Payments across earlier hours today
  const now = Date.now();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 5, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const findItem = (namePart) =>
    menuItems.find((m) => m.name.toLowerCase().includes(namePart.toLowerCase())) || menuItems[0];

  const pastOrderTemplates = [
    { hoursAgo: 6, tableIdx: 2, method: 'card', items: [findItem('Burrata'), findItem('Salmon'), findItem('Spritz')] },
    { hoursAgo: 5, tableIdx: 5, method: 'card', items: [findItem('Tagliatelle'), findItem('Margherita'), findItem('Tiramisu')] },
    { hoursAgo: 4, tableIdx: 6, method: 'upi', items: [findItem('Steak'), findItem('Calamari'), findItem('Old Fashioned'), findItem('Cheesecake')] },
    { hoursAgo: 3, tableIdx: 9, method: 'cash', items: [findItem('Rigatoni'), findItem('Focaccia'), findItem('Highball')] },
    { hoursAgo: 2, tableIdx: 10, method: 'card', items: [findItem('Short Rib'), findItem('Salmon'), findItem('Tiramisu'), findItem('Spritz')] },
    { hoursAgo: 1.5, tableIdx: 7, method: 'demo', items: [findItem('Soppressata'), findItem('Caesar'), findItem('Chicken')] },
  ];

  let totalSeededOrders = 0;
  for (let tplIdx = 0; tplIdx < pastOrderTemplates.length; tplIdx += 1) {
    const tpl = pastOrderTemplates[tplIdx];
    const table = tables[tpl.tableIdx];
    const desiredMs = now - tpl.hoursAgo * 60 * 60 * 1000;
    const clampedCreatedMs = Math.max(startOfTodayMs + tplIdx * 60 * 1000, Math.min(now - 60000, desiredMs));
    const createdDate = new Date(clampedCreatedMs);
    const prepDone = new Date(Math.min(now - 30000, clampedCreatedMs + 14 * 60 * 1000));
    const servedAt = new Date(Math.min(now - 20000, clampedCreatedMs + 17 * 60 * 1000));
    const paidAt = new Date(Math.min(now - 10000, clampedCreatedMs + 45 * 60 * 1000));

    const items = tpl.items.map((m) => ({
      menuItemId: m.id,
      name: m.name,
      price: m.price,
      qty: 1,
      notes: '',
      status: 'served',
      prepTimeMinutes: m.prepTimeMinutes,
    }));
    const subtotal = roundCurrency(items.reduce((s, i) => s + i.price * i.qty, 0));
    const tax = roundCurrency(subtotal * cfg.taxRate);
    const total = roundCurrency(subtotal + tax);
    const orderNumber = await repo.nextOrderNumber();

    const order = await repo.createOrder({
      orderNumber,
      tableId: table.id,
      tableNumber: table.number,
      tableNumberSnapshot: table.number,
      tableName: table.name,
      sessionId: `past-sess-${orderNumber}`,
      items,
      subtotal,
      tax,
      discount: 0,
      total,
      status: 'paid',
      source: tplIdx % 2 === 0 ? 'qr' : 'home',
      orderType: 'dine_in',
      waiterId: waiterUser.id,
      waiterName: waiterUser.name,
      statusTimestamps: {
        pending: createdDate.toISOString(),
        accepted: new Date(createdDate.getTime() + 60 * 1000).toISOString(),
        preparing: new Date(createdDate.getTime() + 2 * 60 * 1000).toISOString(),
        ready: prepDone.toISOString(),
        served: servedAt.toISOString(),
        paid: paidAt.toISOString(),
        cancelled: null,
      },
      createdAt: createdDate.toISOString(),
      updatedAt: paidAt.toISOString(),
    });

    await repo.createPayment({
      orderIds: [order.id],
      tableId: table.id,
      tableNumber: table.number,
      subtotal,
      tax,
      discount: 0,
      amount: total,
      method: tpl.method,
      status: 'completed',
      processedBy: waiterUser.id,
      processedByName: waiterUser.name,
      createdAt: paidAt.toISOString(),
    });
    totalSeededOrders += 1;
  }

  // 6. Seed 3 Active Live Orders (Pending, Preparing, Ready) for occupied Tables 1, 2, 4
  const liveSpecs = [
    {
      table: tables[0],
      minsAgo: 3,
      status: 'pending',
      source: 'qr',
      items: [
        { item: findItem('Burrata'), qty: 1, notes: 'Dressing on the side', status: 'pending' },
        { item: findItem('Tagliatelle'), qty: 1, notes: 'Extra parmesan', status: 'pending' },
        { item: findItem('Spritz'), qty: 2, notes: '', status: 'pending' },
      ],
    },
    {
      table: tables[1],
      minsAgo: 11,
      status: 'preparing',
      source: 'home',
      items: [
        { item: findItem('Salmon'), qty: 2, notes: 'Medium-rare', status: 'preparing' },
        { item: findItem('Margherita'), qty: 1, notes: 'Well done crust', status: 'ready' },
      ],
    },
    {
      table: tables[3],
      minsAgo: 16,
      status: 'ready',
      source: 'staff',
      items: [
        { item: findItem('Steak'), qty: 1, notes: 'Medium', status: 'ready' },
        { item: findItem('Tiramisu'), qty: 2, notes: 'Serve after mains', status: 'ready' },
      ],
    },
  ];

  for (const spec of liveSpecs) {
    const createdAt = new Date(now - spec.minsAgo * 60 * 1000).toISOString();
    const items = spec.items.map((x) => ({
      menuItemId: x.item.id,
      name: x.item.name,
      price: x.item.price,
      qty: x.qty,
      notes: x.notes,
      status: x.status,
      prepTimeMinutes: x.item.prepTimeMinutes,
    }));
    const subtotal = roundCurrency(items.reduce((s, i) => s + i.price * i.qty, 0));
    const tax = roundCurrency(subtotal * cfg.taxRate);
    const total = roundCurrency(subtotal + tax);
    const orderNumber = await repo.nextOrderNumber();

    await repo.createOrder({
      orderNumber,
      tableId: spec.table.id,
      tableNumber: spec.table.number,
      tableNumberSnapshot: spec.table.number,
      tableName: spec.table.name,
      sessionId: spec.table.currentSessionId || `sess-demo-t${spec.table.number}`,
      items,
      subtotal,
      tax,
      discount: 0,
      total,
      status: spec.status,
      source: spec.source,
      orderType: 'dine_in',
      waiterId: waiterUser.id,
      waiterName: waiterUser.name,
      statusTimestamps: {
        pending: createdAt,
        accepted: spec.status !== 'pending' ? createdAt : null,
        preparing: spec.status === 'preparing' || spec.status === 'ready' ? createdAt : null,
        ready: spec.status === 'ready' ? new Date(now - 60 * 1000).toISOString() : null,
        served: null,
        paid: null,
        cancelled: null,
      },
      createdAt,
      updatedAt: createdAt,
    });
    totalSeededOrders += 1;
  }

  // 7. Seed 2 Active Service Calls
  await repo.createCall({
    tableId: tables[1].id,
    tableNumber: tables[1].number,
    tableName: tables[1].name,
    sessionId: tables[1].currentSessionId,
    type: 'water',
    message: 'Sparkling water refill for the table please.',
    status: 'open',
    acknowledgedBy: null,
    acknowledgedByName: null,
    createdAt: new Date(now - 4.5 * 60 * 1000).toISOString(),
    resolvedAt: null,
  });

  await repo.createCall({
    tableId: tables[3].id,
    tableNumber: tables[3].number,
    tableName: tables[3].name,
    sessionId: tables[3].currentSessionId,
    type: 'bill',
    message: 'Ready for the check when convenient.',
    status: 'open',
    acknowledgedBy: null,
    acknowledgedByName: null,
    createdAt: new Date(now - 1.2 * 60 * 1000).toISOString(),
    resolvedAt: null,
  });

  await repo.createAuditLog({
    actorId: adminUser.id,
    actorName: adminUser.name,
    actorRole: adminUser.role,
    action: 'SEED_DATABASE',
    entity: 'System',
    entityId: null,
    details: 'Initialized 4 demo staff accounts, 2 demo customers, 12 tables, 4 categories, 30 menu items, and live shift data.',
  });

  return {
    users: demoAccounts.map(({ role, email, mobile, password }) => ({ role, email, mobile, password })),
    tables: tables.map((t) => ({
      number: t.number,
      name: t.name,
      section: t.section,
      qrToken: t.qrToken,
    })),
    categoriesCount: 4,
    menuItemsCount: menuItems.length,
    ordersCount: totalSeededOrders,
  };
}
