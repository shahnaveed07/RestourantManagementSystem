import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env';
import {
  UserModel,
  TableModel,
  CategoryModel,
  MenuItemModel,
  OrderModel,
  ServiceCallModel,
  PaymentModel,
  AuditLogModel,
} from '../models/index';
import type {
  UserRole,
  TableStatus,
  OrderStatus,
  OrderItemStatus,
  ServiceCallType,
  ServiceCallStatus,
  PaymentMethod,
} from '../services/orderCalculator';

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface TableDoc {
  id: string;
  number: number;
  name: string;
  capacity: number;
  section: string;
  status: TableStatus;
  qrToken: string;
  currentSessionId: string | null;
  createdAt: string;
}

export interface CategoryDoc {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItemDoc {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  imageUrl: string;
  isVeg: boolean;
  spiceLevel: 'none' | 'mild' | 'medium' | 'hot';
  allergens: string[];
  prepTimeMinutes: number;
  isAvailable: boolean;
  isActive: boolean;
}

export interface OrderItemDoc {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
  status: OrderItemStatus;
  prepTimeMinutes: number;
}

export interface OrderDoc {
  id: string;
  orderNumber: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  sessionId: string;
  items: OrderItemDoc[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: OrderStatus;
  source: 'guest_qr' | 'staff';
  waiterId: string | null;
  waiterName: string | null;
  statusTimestamps: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCallDoc {
  id: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  sessionId: string | null;
  type: ServiceCallType;
  message: string;
  status: ServiceCallStatus;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PaymentDoc {
  id: string;
  orderIds: string[];
  tableId: string;
  tableNumber: number;
  subtotal: number;
  tax: number;
  discount: number;
  amount: number;
  method: PaymentMethod;
  status: 'completed' | 'refunded';
  processedBy: string | null;
  processedByName: string | null;
  createdAt: string;
}

export interface AuditLogDoc {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string;
  timestamp: string;
}

interface StoreSnapshot {
  users: UserDoc[];
  tables: TableDoc[];
  categories: CategoryDoc[];
  menuItems: MenuItemDoc[];
  orders: OrderDoc[];
  calls: ServiceCallDoc[];
  payments: PaymentDoc[];
  auditLogs: AuditLogDoc[];
  orderSeq: number;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'passline-db.json');

function createObjectId(): string {
  return crypto.randomBytes(12).toString('hex');
}

function emptyStore(): StoreSnapshot {
  return {
    users: [],
    tables: [],
    categories: [],
    menuItems: [],
    orders: [],
    calls: [],
    payments: [],
    auditLogs: [],
    orderSeq: 1000,
  };
}

function normalizeDoc<T extends { id?: string; _id?: unknown }>(raw: Record<string, unknown>): T {
  const obj = { ...raw };
  if (obj._id && !obj.id) {
    obj.id = String(obj._id);
  }
  delete obj._id;
  delete obj.__v;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val instanceof Date) {
      obj[key] = val.toISOString();
    }
  }
  return obj as T;
}

class Repository {
  private useMongo = false;
  private store: StoreSnapshot = emptyStore();
  private initialized = false;

  async init(): Promise<'mongodb' | 'local'> {
    if (this.initialized) {
      return this.useMongo ? 'mongodb' : 'local';
    }

    if (env.mongoUri) {
      try {
        await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
        this.useMongo = true;
        this.initialized = true;
        console.log('[DB] Connected to MongoDB via Mongoose');
        return 'mongodb';
      } catch (err) {
        console.warn('[DB] MongoDB connection failed, falling back to local persistent store:', (err as Error).message);
      }
    }

    this.loadLocalStore();
    this.useMongo = false;
    this.initialized = true;
    return 'local';
  }

  getEngine(): 'mongodb' | 'local' {
    return this.useMongo ? 'mongodb' : 'local';
  }

  private loadLocalStore() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Partial<StoreSnapshot>;
        this.store = {
          ...emptyStore(),
          ...parsed,
        };
        return;
      } catch {
        this.store = emptyStore();
      }
    }
    this.persistLocalStore();
  }

  private persistLocalStore() {
    if (this.useMongo) return;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf-8');
    fs.renameSync(tmp, DATA_FILE);
  }

  async nextOrderNumber(): Promise<string> {
    if (this.useMongo) {
      const count = await OrderModel.countDocuments();
      return `ORD-${1001 + count}`;
    }
    this.store.orderSeq += 1;
    this.persistLocalStore();
    return `ORD-${this.store.orderSeq}`;
  }

  async wipeAll(): Promise<void> {
    if (this.useMongo) {
      await Promise.all([
        UserModel.deleteMany({}),
        TableModel.deleteMany({}),
        CategoryModel.deleteMany({}),
        MenuItemModel.deleteMany({}),
        OrderModel.deleteMany({}),
        ServiceCallModel.deleteMany({}),
        PaymentModel.deleteMany({}),
        AuditLogModel.deleteMany({}),
      ]);
      return;
    }
    this.store = emptyStore();
    this.persistLocalStore();
  }

  // ---- USERS ----
  async listUsers(): Promise<UserDoc[]> {
    if (this.useMongo) {
      const rows = await UserModel.find().sort({ createdAt: 1 }).lean();
      return rows.map((r) => normalizeDoc<UserDoc>(r as Record<string, unknown>));
    }
    return [...this.store.users];
  }

  async findUserByEmail(email: string): Promise<UserDoc | null> {
    const clean = email.toLowerCase().trim();
    if (this.useMongo) {
      const row = await UserModel.findOne({ email: clean }).lean();
      return row ? normalizeDoc<UserDoc>(row as Record<string, unknown>) : null;
    }
    return this.store.users.find((u) => u.email.toLowerCase() === clean) || null;
  }

  async findUserById(id: string): Promise<UserDoc | null> {
    if (this.useMongo) {
      const row = await UserModel.findById(id).lean();
      return row ? normalizeDoc<UserDoc>(row as Record<string, unknown>) : null;
    }
    return this.store.users.find((u) => u.id === id) || null;
  }

  async createUser(data: Omit<UserDoc, 'id' | 'createdAt'>): Promise<UserDoc> {
    if (this.useMongo) {
      const doc = await UserModel.create(data);
      return normalizeDoc<UserDoc>(doc.toObject() as Record<string, unknown>);
    }
    const created: UserDoc = {
      ...data,
      email: data.email.toLowerCase().trim(),
      id: createObjectId(),
      createdAt: new Date().toISOString(),
    };
    this.store.users.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateUser(id: string, patch: Partial<UserDoc>): Promise<UserDoc | null> {
    if (this.useMongo) {
      const doc = await UserModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc<UserDoc>(doc as Record<string, unknown>) : null;
    }
    const idx = this.store.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    this.store.users[idx] = { ...this.store.users[idx], ...patch };
    this.persistLocalStore();
    return this.store.users[idx];
  }

  // ---- TABLES ----
  async listTables(): Promise<TableDoc[]> {
    if (this.useMongo) {
      const rows = await TableModel.find().sort({ number: 1 }).lean();
      return rows.map((r) => normalizeDoc<TableDoc>(r as Record<string, unknown>));
    }
    return [...this.store.tables].sort((a, b) => a.number - b.number);
  }

  async findTableById(id: string): Promise<TableDoc | null> {
    if (this.useMongo) {
      const row = await TableModel.findById(id).lean();
      return row ? normalizeDoc<TableDoc>(row as Record<string, unknown>) : null;
    }
    return this.store.tables.find((t) => t.id === id) || null;
  }

  async findTableByQrToken(qrToken: string): Promise<TableDoc | null> {
    if (this.useMongo) {
      const row = await TableModel.findOne({ qrToken }).lean();
      return row ? normalizeDoc<TableDoc>(row as Record<string, unknown>) : null;
    }
    return this.store.tables.find((t) => t.qrToken === qrToken) || null;
  }

  async createTable(data: Omit<TableDoc, 'id' | 'createdAt'>): Promise<TableDoc> {
    if (this.useMongo) {
      const doc = await TableModel.create(data);
      return normalizeDoc<TableDoc>(doc.toObject() as Record<string, unknown>);
    }
    if (this.store.tables.some((t) => t.number === data.number)) {
      throw new Error(`Table number ${data.number} already exists.`);
    }
    const created: TableDoc = {
      ...data,
      id: createObjectId(),
      createdAt: new Date().toISOString(),
    };
    this.store.tables.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateTable(id: string, patch: Partial<TableDoc>): Promise<TableDoc | null> {
    if (this.useMongo) {
      const doc = await TableModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc<TableDoc>(doc as Record<string, unknown>) : null;
    }
    const idx = this.store.tables.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.store.tables[idx] = { ...this.store.tables[idx], ...patch };
    this.persistLocalStore();
    return this.store.tables[idx];
  }

  async deleteTable(id: string): Promise<boolean> {
    if (this.useMongo) {
      const res = await TableModel.findByIdAndDelete(id);
      return Boolean(res);
    }
    const before = this.store.tables.length;
    this.store.tables = this.store.tables.filter((t) => t.id !== id);
    this.persistLocalStore();
    return this.store.tables.length < before;
  }

  // ---- CATEGORIES ----
  async listCategories(): Promise<CategoryDoc[]> {
    if (this.useMongo) {
      const rows = await CategoryModel.find().sort({ sortOrder: 1, name: 1 }).lean();
      return rows.map((r) => normalizeDoc<CategoryDoc>(r as Record<string, unknown>));
    }
    return [...this.store.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createCategory(data: Omit<CategoryDoc, 'id'>): Promise<CategoryDoc> {
    if (this.useMongo) {
      const doc = await CategoryModel.create(data);
      return normalizeDoc<CategoryDoc>(doc.toObject() as Record<string, unknown>);
    }
    const created: CategoryDoc = { ...data, id: createObjectId() };
    this.store.categories.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateCategory(id: string, patch: Partial<CategoryDoc>): Promise<CategoryDoc | null> {
    if (this.useMongo) {
      const doc = await CategoryModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc<CategoryDoc>(doc as Record<string, unknown>) : null;
    }
    const idx = this.store.categories.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.store.categories[idx] = { ...this.store.categories[idx], ...patch };
    this.persistLocalStore();
    return this.store.categories[idx];
  }

  async deleteCategory(id: string): Promise<boolean> {
    if (this.useMongo) {
      const res = await CategoryModel.findByIdAndDelete(id);
      return Boolean(res);
    }
    const before = this.store.categories.length;
    this.store.categories = this.store.categories.filter((c) => c.id !== id);
    this.persistLocalStore();
    return this.store.categories.length < before;
  }

  // ---- MENU ITEMS ----
  async listMenuItems(includeInactive = false): Promise<MenuItemDoc[]> {
    if (this.useMongo) {
      const query = includeInactive ? {} : { isActive: true };
      const rows = await MenuItemModel.find(query).sort({ name: 1 }).lean();
      return rows.map((r) => normalizeDoc<MenuItemDoc>(r as Record<string, unknown>));
    }
    const rows = includeInactive
      ? this.store.menuItems
      : this.store.menuItems.filter((m) => m.isActive);
    return [...rows];
  }

  async findMenuItemById(id: string): Promise<MenuItemDoc | null> {
    if (this.useMongo) {
      const row = await MenuItemModel.findById(id).lean();
      return row ? normalizeDoc<MenuItemDoc>(row as Record<string, unknown>) : null;
    }
    return this.store.menuItems.find((m) => m.id === id) || null;
  }

  async createMenuItem(data: Omit<MenuItemDoc, 'id'>): Promise<MenuItemDoc> {
    if (this.useMongo) {
      const doc = await MenuItemModel.create(data);
      return normalizeDoc<MenuItemDoc>(doc.toObject() as Record<string, unknown>);
    }
    const created: MenuItemDoc = { ...data, id: createObjectId() };
    this.store.menuItems.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateMenuItem(id: string, patch: Partial<MenuItemDoc>): Promise<MenuItemDoc | null> {
    if (this.useMongo) {
      const doc = await MenuItemModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc<MenuItemDoc>(doc as Record<string, unknown>) : null;
    }
    const idx = this.store.menuItems.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.store.menuItems[idx] = { ...this.store.menuItems[idx], ...patch };
    this.persistLocalStore();
    return this.store.menuItems[idx];
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    if (this.useMongo) {
      const res = await MenuItemModel.findByIdAndUpdate(id, { isActive: false });
      return Boolean(res);
    }
    const idx = this.store.menuItems.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.store.menuItems[idx].isActive = false;
    this.persistLocalStore();
    return true;
  }

  // ---- ORDERS ----
  async listOrders(filter?: {
    tableId?: string;
    sessionId?: string;
    statuses?: OrderStatus[];
    from?: string;
    to?: string;
  }): Promise<OrderDoc[]> {
    if (this.useMongo) {
      const q: Record<string, unknown> = {};
      if (filter?.tableId) q.tableId = filter.tableId;
      if (filter?.sessionId) q.sessionId = filter.sessionId;
      if (filter?.statuses?.length) q.status = { $in: filter.statuses };
      if (filter?.from || filter?.to) {
        q.createdAt = {};
        if (filter.from) (q.createdAt as Record<string, Date>).$gte = new Date(filter.from);
        if (filter.to) (q.createdAt as Record<string, Date>).$lte = new Date(filter.to);
      }
      const rows = await OrderModel.find(q).sort({ createdAt: -1 }).lean();
      return rows.map((r) => normalizeDoc<OrderDoc>(r as Record<string, unknown>));
    }

    let rows = [...this.store.orders];
    if (filter?.tableId) rows = rows.filter((o) => o.tableId === filter.tableId);
    if (filter?.sessionId) rows = rows.filter((o) => o.sessionId === filter.sessionId);
    if (filter?.statuses?.length) {
      rows = rows.filter((o) => filter.statuses!.includes(o.status));
    }
    if (filter?.from) {
      const fromMs = new Date(filter.from).getTime();
      rows = rows.filter((o) => new Date(o.createdAt).getTime() >= fromMs);
    }
    if (filter?.to) {
      const toMs = new Date(filter.to).getTime();
      rows = rows.filter((o) => new Date(o.createdAt).getTime() <= toMs);
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findOrderById(id: string): Promise<OrderDoc | null> {
    if (this.useMongo) {
      const row = await OrderModel.findById(id).lean();
      return row ? normalizeDoc<OrderDoc>(row as Record<string, unknown>) : null;
    }
    return this.store.orders.find((o) => o.id === id) || null;
  }

  async createOrder(data: Omit<OrderDoc, 'id'>): Promise<OrderDoc> {
    if (this.useMongo) {
      const doc = await OrderModel.create(data);
      return normalizeDoc<OrderDoc>(doc.toObject() as Record<string, unknown>);
    }
    const created: OrderDoc = { ...data, id: createObjectId() };
    this.store.orders.unshift(created);
    this.persistLocalStore();
    return created;
  }

  async updateOrder(id: string, patch: Partial<OrderDoc>): Promise<OrderDoc | null> {
    if (this.useMongo) {
      const doc = await OrderModel.findByIdAndUpdate(
        id,
        { ...patch, updatedAt: new Date() },
        { new: true }
      ).lean();
      return doc ? normalizeDoc<OrderDoc>(doc as Record<string, unknown>) : null;
    }
    const idx = this.store.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    this.store.orders[idx] = {
      ...this.store.orders[idx],
      ...patch,
      updatedAt: patch.updatedAt || new Date().toISOString(),
    };
    this.persistLocalStore();
    return this.store.orders[idx];
  }

  // ---- SERVICE CALLS ----
  async listCalls(filter?: {
    tableId?: string;
    sessionId?: string;
    statuses?: ServiceCallStatus[];
  }): Promise<ServiceCallDoc[]> {
    if (this.useMongo) {
      const q: Record<string, unknown> = {};
      if (filter?.tableId) q.tableId = filter.tableId;
      if (filter?.sessionId) q.sessionId = filter.sessionId;
      if (filter?.statuses?.length) q.status = { $in: filter.statuses };
      const rows = await ServiceCallModel.find(q).sort({ createdAt: -1 }).lean();
      return rows.map((r) => normalizeDoc<ServiceCallDoc>(r as Record<string, unknown>));
    }

    let rows = [...this.store.calls];
    if (filter?.tableId) rows = rows.filter((c) => c.tableId === filter.tableId);
    if (filter?.sessionId) rows = rows.filter((c) => c.sessionId === filter.sessionId);
    if (filter?.statuses?.length) {
      rows = rows.filter((c) => filter.statuses!.includes(c.status));
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findCallById(id: string): Promise<ServiceCallDoc | null> {
    if (this.useMongo) {
      const row = await ServiceCallModel.findById(id).lean();
      return row ? normalizeDoc<ServiceCallDoc>(row as Record<string, unknown>) : null;
    }
    return this.store.calls.find((c) => c.id === id) || null;
  }

  async createCall(data: Omit<ServiceCallDoc, 'id'>): Promise<ServiceCallDoc> {
    if (this.useMongo) {
      const doc = await ServiceCallModel.create(data);
      return normalizeDoc<ServiceCallDoc>(doc.toObject() as Record<string, unknown>);
    }
    const created: ServiceCallDoc = { ...data, id: createObjectId() };
    this.store.calls.unshift(created);
    this.persistLocalStore();
    return created;
  }

  async updateCall(id: string, patch: Partial<ServiceCallDoc>): Promise<ServiceCallDoc | null> {
    if (this.useMongo) {
      const doc = await ServiceCallModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc<ServiceCallDoc>(doc as Record<string, unknown>) : null;
    }
    const idx = this.store.calls.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.store.calls[idx] = { ...this.store.calls[idx], ...patch };
    this.persistLocalStore();
    return this.store.calls[idx];
  }

  // ---- PAYMENTS ----
  async listPayments(filter?: { from?: string; to?: string }): Promise<PaymentDoc[]> {
    if (this.useMongo) {
      const q: Record<string, unknown> = {};
      if (filter?.from || filter?.to) {
        q.createdAt = {};
        if (filter.from) (q.createdAt as Record<string, Date>).$gte = new Date(filter.from);
        if (filter.to) (q.createdAt as Record<string, Date>).$lte = new Date(filter.to);
      }
      const rows = await PaymentModel.find(q).sort({ createdAt: -1 }).lean();
      return rows.map((r) => normalizeDoc<PaymentDoc>(r as Record<string, unknown>));
    }

    let rows = [...this.store.payments];
    if (filter?.from) {
      const fromMs = new Date(filter.from).getTime();
      rows = rows.filter((p) => new Date(p.createdAt).getTime() >= fromMs);
    }
    if (filter?.to) {
      const toMs = new Date(filter.to).getTime();
      rows = rows.filter((p) => new Date(p.createdAt).getTime() <= toMs);
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createPayment(data: Omit<PaymentDoc, 'id'>): Promise<PaymentDoc> {
    if (this.useMongo) {
      const doc = await PaymentModel.create(data);
      return normalizeDoc<PaymentDoc>(doc.toObject() as Record<string, unknown>);
    }
    const created: PaymentDoc = { ...data, id: createObjectId() };
    this.store.payments.unshift(created);
    this.persistLocalStore();
    return created;
  }

  // ---- AUDIT LOGS ----
  async listAuditLogs(limit = 50): Promise<AuditLogDoc[]> {
    if (this.useMongo) {
      const rows = await AuditLogModel.find().sort({ timestamp: -1 }).limit(limit).lean();
      return rows.map((r) => normalizeDoc<AuditLogDoc>(r as Record<string, unknown>));
    }
    return [...this.store.auditLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async createAuditLog(data: Omit<AuditLogDoc, 'id' | 'timestamp'>): Promise<AuditLogDoc> {
    const timestamp = new Date().toISOString();
    if (this.useMongo) {
      const doc = await AuditLogModel.create({ ...data, timestamp });
      return normalizeDoc<AuditLogDoc>(doc.toObject() as Record<string, unknown>);
    }
    const created: AuditLogDoc = { ...data, id: createObjectId(), timestamp };
    this.store.auditLogs.unshift(created);
    if (this.store.auditLogs.length > 300) {
      this.store.auditLogs = this.store.auditLogs.slice(0, 300);
    }
    this.persistLocalStore();
    return created;
  }
}

export const repo = new Repository();
