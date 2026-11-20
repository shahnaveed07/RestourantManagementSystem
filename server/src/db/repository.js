import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import {
  UserModel,
  TableModel,
  CategoryModel,
  MenuItemModel,
  OrderModel,
  ServiceCallModel,
  PaymentModel,
  AuditLogModel,
  OtpChallengeModel,
} from '../models/index.js';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'passline-db.json');

function createObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

function emptyStore() {
  return {
    users: [],
    tables: [],
    categories: [],
    menuItems: [],
    orders: [],
    calls: [],
    payments: [],
    auditLogs: [],
    otpChallenges: [],
    orderSeq: 1000,
  };
}

function normalizeDoc(raw) {
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
    } else if (val instanceof mongoose.Types.ObjectId || val?._bsontype === 'ObjectId') {
      obj[key] = String(val);
    }
  }
  return obj;
}

class Repository {
  constructor() {
    this.useMongo = false;
    this.store = emptyStore();
    this.initialized = false;
  }

  async init() {
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
        console.warn('[DB] MongoDB connection failed, falling back to local persistent store:', err.message);
      }
    }

    this.loadLocalStore();
    this.useMongo = false;
    this.initialized = true;
    return 'local';
  }

  getEngine() {
    return this.useMongo ? 'mongodb' : 'local';
  }

  loadLocalStore() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        const nextStore = {
          ...emptyStore(),
          ...parsed,
        };
        if (Array.isArray(nextStore.tables)) {
          nextStore.tables = nextStore.tables.map((t) => ({
            ...t,
            isActive: t.isActive !== false,
          }));
        }
        if (Array.isArray(nextStore.orders)) {
          nextStore.orders = nextStore.orders.map((o) => ({
            ...o,
            tableNumberSnapshot: o.tableNumberSnapshot ?? o.tableNumber ?? 0,
            source:
              o.source === 'guest_qr'
                ? 'qr'
                : o.source === 'customer_web'
                  ? 'home'
                  : o.source || 'qr',
            orderType: 'dine_in',
          }));
        }
        this.store = nextStore;
        return;
      } catch {
        this.store = emptyStore();
      }
    }
    this.persistLocalStore();
  }

  persistLocalStore() {
    if (this.useMongo) return;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf-8');
    fs.renameSync(tmp, DATA_FILE);
  }

  async nextOrderNumber() {
    if (this.useMongo) {
      const count = await OrderModel.countDocuments();
      return `ORD-${1001 + count}`;
    }
    this.store.orderSeq += 1;
    this.persistLocalStore();
    return `ORD-${this.store.orderSeq}`;
  }

  async wipeAll() {
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
        OtpChallengeModel.deleteMany({}),
      ]);
      return;
    }
    this.store = emptyStore();
    this.persistLocalStore();
  }

  // ---- USERS ----
  async listUsers() {
    if (this.useMongo) {
      const rows = await UserModel.find().sort({ createdAt: 1 }).lean();
      return rows.map((r) => normalizeDoc(r));
    }
    return [...this.store.users];
  }

  async findUserByEmail(email) {
    if (!email) return null;
    const clean = email.toLowerCase().trim();
    if (this.useMongo) {
      const row = await UserModel.findOne({ email: clean }).lean();
      return row ? normalizeDoc(row) : null;
    }
    return this.store.users.find((u) => u.email && u.email.toLowerCase() === clean) || null;
  }

  async findUserByMobile(mobile) {
    if (!mobile) return null;
    const clean = String(mobile).trim();
    if (this.useMongo) {
      const row = await UserModel.findOne({ mobile: clean }).lean();
      return row ? normalizeDoc(row) : null;
    }
    return this.store.users.find((u) => u.mobile && u.mobile === clean) || null;
  }

  async findUserByIdentifier(channel, identifier) {
    if (channel === 'mobile') {
      return this.findUserByMobile(identifier);
    }
    return this.findUserByEmail(identifier);
  }

  async findUserById(id) {
    if (this.useMongo) {
      const row = await UserModel.findById(id).lean();
      return row ? normalizeDoc(row) : null;
    }
    return this.store.users.find((u) => u.id === id) || null;
  }

  async createUser(data) {
    if (this.useMongo) {
      const doc = await UserModel.create({
        ...data,
        email: data.email ? data.email.toLowerCase().trim() : null,
        mobile: data.mobile ? String(data.mobile).trim() : null,
      });
      return normalizeDoc(doc.toObject());
    }
    const created = {
      ...data,
      email: data.email ? data.email.toLowerCase().trim() : null,
      mobile: data.mobile ? String(data.mobile).trim() : null,
      id: createObjectId(),
      createdAt: new Date().toISOString(),
    };
    this.store.users.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateUser(id, patch) {
    if (this.useMongo) {
      const doc = await UserModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc(doc) : null;
    }
    const idx = this.store.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    this.store.users[idx] = { ...this.store.users[idx], ...patch };
    this.persistLocalStore();
    return this.store.users[idx];
  }

  // ---- TABLES ----
  async listTables() {
    if (this.useMongo) {
      const rows = await TableModel.find({ isActive: { $ne: false } }).sort({ number: 1 }).lean();
      return rows.map((r) => normalizeDoc(r));
    }
    return [...this.store.tables]
      .filter((t) => t.isActive !== false)
      .sort((a, b) => a.number - b.number);
  }

  async findTableById(id) {
    if (!id) return null;
    if (this.useMongo) {
      if (!mongoose.isValidObjectId(id)) return null;
      const row = await TableModel.findById(id).lean();
      return row && row.isActive !== false ? normalizeDoc(row) : null;
    }
    const found = this.store.tables.find((t) => t.id === id);
    return found && found.isActive !== false ? found : null;
  }

  async findTableByNumber(number) {
    const num = Number(number);
    if (!Number.isInteger(num) || num < 1) return null;
    if (this.useMongo) {
      const row = await TableModel.findOne({ number: num, isActive: { $ne: false } }).lean();
      return row ? normalizeDoc(row) : null;
    }
    const found = this.store.tables.find((t) => t.number === num);
    return found && found.isActive !== false ? found : null;
  }

  async findTableByQrToken(qrToken) {
    if (!qrToken) return null;
    if (this.useMongo) {
      const row = await TableModel.findOne({ qrToken, isActive: { $ne: false } }).lean();
      return row ? normalizeDoc(row) : null;
    }
    const found = this.store.tables.find((t) => t.qrToken === qrToken);
    return found && found.isActive !== false ? found : null;
  }

  async createTable(data) {
    if (this.useMongo) {
      const doc = await TableModel.create(data);
      return normalizeDoc(doc.toObject());
    }
    if (this.store.tables.some((t) => t.number === data.number)) {
      throw new Error(`Table number ${data.number} already exists.`);
    }
    const created = {
      ...data,
      id: createObjectId(),
      createdAt: new Date().toISOString(),
    };
    this.store.tables.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateTable(id, patch) {
    if (this.useMongo) {
      const doc = await TableModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc(doc) : null;
    }
    const idx = this.store.tables.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.store.tables[idx] = { ...this.store.tables[idx], ...patch };
    this.persistLocalStore();
    return this.store.tables[idx];
  }

  async deleteTable(id) {
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
  async listCategories() {
    if (this.useMongo) {
      const rows = await CategoryModel.find().sort({ sortOrder: 1, name: 1 }).lean();
      return rows.map((r) => normalizeDoc(r));
    }
    return [...this.store.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createCategory(data) {
    if (this.useMongo) {
      const doc = await CategoryModel.create(data);
      return normalizeDoc(doc.toObject());
    }
    const created = { ...data, id: createObjectId() };
    this.store.categories.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateCategory(id, patch) {
    if (this.useMongo) {
      const doc = await CategoryModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc(doc) : null;
    }
    const idx = this.store.categories.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.store.categories[idx] = { ...this.store.categories[idx], ...patch };
    this.persistLocalStore();
    return this.store.categories[idx];
  }

  async deleteCategory(id) {
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
  async listMenuItems(includeInactive = false) {
    if (this.useMongo) {
      const query = includeInactive ? {} : { isActive: true };
      const rows = await MenuItemModel.find(query).sort({ name: 1 }).lean();
      return rows.map((r) => normalizeDoc(r));
    }
    const rows = includeInactive
      ? this.store.menuItems
      : this.store.menuItems.filter((m) => m.isActive);
    return [...rows];
  }

  async findMenuItemById(id) {
    if (this.useMongo) {
      const row = await MenuItemModel.findById(id).lean();
      return row ? normalizeDoc(row) : null;
    }
    return this.store.menuItems.find((m) => m.id === id) || null;
  }

  async createMenuItem(data) {
    if (this.useMongo) {
      const doc = await MenuItemModel.create(data);
      return normalizeDoc(doc.toObject());
    }
    const created = { ...data, id: createObjectId() };
    this.store.menuItems.push(created);
    this.persistLocalStore();
    return created;
  }

  async updateMenuItem(id, patch) {
    if (this.useMongo) {
      const doc = await MenuItemModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc(doc) : null;
    }
    const idx = this.store.menuItems.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.store.menuItems[idx] = { ...this.store.menuItems[idx], ...patch };
    this.persistLocalStore();
    return this.store.menuItems[idx];
  }

  async deleteMenuItem(id) {
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
  async listOrders(filter) {
    if (this.useMongo) {
      const q = {};
      if (filter?.tableId) q.tableId = filter.tableId;
      if (filter?.sessionId) q.sessionId = filter.sessionId;
      if (filter?.statuses?.length) q.status = { $in: filter.statuses };
      if (filter?.from || filter?.to) {
        q.createdAt = {};
        if (filter.from) q.createdAt.$gte = new Date(filter.from);
        if (filter.to) q.createdAt.$lte = new Date(filter.to);
      }
      const rows = await OrderModel.find(q).sort({ createdAt: -1 }).lean();
      return rows.map((r) => normalizeDoc(r));
    }

    let rows = [...this.store.orders];
    if (filter?.tableId) rows = rows.filter((o) => o.tableId === filter.tableId);
    if (filter?.sessionId) rows = rows.filter((o) => o.sessionId === filter.sessionId);
    if (filter?.statuses?.length) {
      rows = rows.filter((o) => filter.statuses.includes(o.status));
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

  async findOrderById(id) {
    if (this.useMongo) {
      const row = await OrderModel.findById(id).lean();
      return row ? normalizeDoc(row) : null;
    }
    return this.store.orders.find((o) => o.id === id) || null;
  }

  async createOrder(data) {
    if (this.useMongo) {
      const doc = await OrderModel.create(data);
      return normalizeDoc(doc.toObject());
    }
    const created = { ...data, id: createObjectId() };
    this.store.orders.unshift(created);
    this.persistLocalStore();
    return created;
  }

  async updateOrder(id, patch) {
    if (this.useMongo) {
      const doc = await OrderModel.findByIdAndUpdate(
        id,
        { ...patch, updatedAt: new Date() },
        { new: true }
      ).lean();
      return doc ? normalizeDoc(doc) : null;
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
  async listCalls(filter) {
    if (this.useMongo) {
      const q = {};
      if (filter?.tableId) q.tableId = filter.tableId;
      if (filter?.sessionId) q.sessionId = filter.sessionId;
      if (filter?.statuses?.length) q.status = { $in: filter.statuses };
      const rows = await ServiceCallModel.find(q).sort({ createdAt: -1 }).lean();
      return rows.map((r) => normalizeDoc(r));
    }

    let rows = [...this.store.calls];
    if (filter?.tableId) rows = rows.filter((c) => c.tableId === filter.tableId);
    if (filter?.sessionId) rows = rows.filter((c) => c.sessionId === filter.sessionId);
    if (filter?.statuses?.length) {
      rows = rows.filter((c) => filter.statuses.includes(c.status));
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findCallById(id) {
    if (this.useMongo) {
      const row = await ServiceCallModel.findById(id).lean();
      return row ? normalizeDoc(row) : null;
    }
    return this.store.calls.find((c) => c.id === id) || null;
  }

  async createCall(data) {
    if (this.useMongo) {
      const doc = await ServiceCallModel.create(data);
      return normalizeDoc(doc.toObject());
    }
    const created = { ...data, id: createObjectId() };
    this.store.calls.unshift(created);
    this.persistLocalStore();
    return created;
  }

  async updateCall(id, patch) {
    if (this.useMongo) {
      const doc = await ServiceCallModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc(doc) : null;
    }
    const idx = this.store.calls.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.store.calls[idx] = { ...this.store.calls[idx], ...patch };
    this.persistLocalStore();
    return this.store.calls[idx];
  }

  // ---- PAYMENTS ----
  async listPayments(filter) {
    if (this.useMongo) {
      const q = {};
      if (filter?.from || filter?.to) {
        q.createdAt = {};
        if (filter.from) q.createdAt.$gte = new Date(filter.from);
        if (filter.to) q.createdAt.$lte = new Date(filter.to);
      }
      const rows = await PaymentModel.find(q).sort({ createdAt: -1 }).lean();
      return rows.map((r) => normalizeDoc(r));
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

  async createPayment(data) {
    if (this.useMongo) {
      const doc = await PaymentModel.create(data);
      return normalizeDoc(doc.toObject());
    }
    const created = { ...data, id: createObjectId() };
    this.store.payments.unshift(created);
    this.persistLocalStore();
    return created;
  }

  // ---- AUDIT LOGS ----
  async listAuditLogs(limit = 50) {
    if (this.useMongo) {
      const rows = await AuditLogModel.find().sort({ timestamp: -1 }).limit(limit).lean();
      return rows.map((r) => normalizeDoc(r));
    }
    return [...this.store.auditLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async createAuditLog(data) {
    const timestamp = new Date().toISOString();
    if (this.useMongo) {
      const doc = await AuditLogModel.create({ ...data, timestamp });
      return normalizeDoc(doc.toObject());
    }
    const created = { ...data, id: createObjectId(), timestamp };
    this.store.auditLogs.unshift(created);
    if (this.store.auditLogs.length > 300) {
      this.store.auditLogs = this.store.auditLogs.slice(0, 300);
    }
    this.persistLocalStore();
    return created;
  }

  // ---- OTP CHALLENGES ----
  async findLatestOtpChallenge(identifier) {
    if (this.useMongo) {
      const row = await OtpChallengeModel.findOne({ identifier }).sort({ createdAt: -1 }).lean();
      return row ? normalizeDoc(row) : null;
    }
    const matches = (this.store.otpChallenges || [])
      .filter((c) => c.identifier === identifier)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches[0] || null;
  }

  async findActiveOtpChallenge(identifier) {
    if (this.useMongo) {
      const row = await OtpChallengeModel.findOne({
        identifier,
        invalidated: false,
        consumedAt: null,
      })
        .sort({ createdAt: -1 })
        .lean();
      return row ? normalizeDoc(row) : null;
    }
    const matches = (this.store.otpChallenges || [])
      .filter((c) => c.identifier === identifier && !c.invalidated && !c.consumedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches[0] || null;
  }

  async invalidateActiveOtps(identifier) {
    if (this.useMongo) {
      await OtpChallengeModel.updateMany(
        { identifier, invalidated: false, consumedAt: null },
        { invalidated: true }
      );
      return;
    }
    if (!Array.isArray(this.store.otpChallenges)) this.store.otpChallenges = [];
    let changed = false;
    for (const c of this.store.otpChallenges) {
      if (c.identifier === identifier && !c.invalidated && !c.consumedAt) {
        c.invalidated = true;
        changed = true;
      }
    }
    if (changed) this.persistLocalStore();
  }

  async createOtpChallenge(data) {
    if (this.useMongo) {
      const doc = await OtpChallengeModel.create(data);
      return normalizeDoc(doc.toObject());
    }
    if (!Array.isArray(this.store.otpChallenges)) this.store.otpChallenges = [];
    const nowIso = new Date().toISOString();
    const created = {
      ...data,
      id: createObjectId(),
      createdAt: data.createdAt || nowIso,
      updatedAt: nowIso,
    };
    this.store.otpChallenges.unshift(created);
    if (this.store.otpChallenges.length > 500) {
      this.store.otpChallenges = this.store.otpChallenges.slice(0, 500);
    }
    this.persistLocalStore();
    return created;
  }

  async updateOtpChallenge(id, patch) {
    if (this.useMongo) {
      const doc = await OtpChallengeModel.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? normalizeDoc(doc) : null;
    }
    if (!Array.isArray(this.store.otpChallenges)) this.store.otpChallenges = [];
    const idx = this.store.otpChallenges.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.store.otpChallenges[idx] = {
      ...this.store.otpChallenges[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.persistLocalStore();
    return this.store.otpChallenges[idx];
  }
}

export const repo = new Repository();
