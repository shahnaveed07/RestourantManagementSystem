import { generateId } from '../utils/crypto.js';

function parseJson(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    mobile: row.mobile || null,
    role: row.role,
    passwordHash: row.password_hash || null,
    isActive: Boolean(row.is_active),
    isDemo: Boolean(row.is_demo),
    assignedTables: parseJson(row.assigned_tables_json, []),
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTable(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: Number(row.number),
    name: row.name,
    capacity: Number(row.capacity),
    section: row.section,
    status: row.status,
    qrToken: row.qr_token,
    qrVersion: Number(row.qr_version || 1),
    assignedWaiterId: row.assigned_waiter_id || null,
    currentSessionId: row.current_session_id || null,
    isActive: Boolean(row.is_active),
    lastActivityAt: row.last_activity_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMenuItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description || '',
    price: Number(row.price),
    imageUrl: row.image_url || '',
    isVeg: Boolean(row.is_veg),
    spiceLevel: row.spice_level || 'none',
    allergens: parseJson(row.allergens_json, []),
    prepTimeMinutes: Number(row.prep_time_minutes || 12),
    isAvailable: Boolean(row.is_available),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderItem(row) {
  return {
    id: row.id,
    menuItemId: row.menu_item_id || '',
    name: row.name_snapshot,
    price: Number(row.unit_price_snapshot),
    qty: Number(row.qty),
    notes: row.notes || '',
    status: row.status,
    prepTimeMinutes: Number(row.prep_time_minutes || 12),
  };
}

function mapOrder(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    tableId: row.table_id,
    tableNumber: Number(row.table_number),
    tableNumberSnapshot: Number(row.table_number_snapshot),
    tableName: row.table_name || '',
    source: row.source,
    orderType: row.order_type || 'dine_in',
    sessionId: row.session_id,
    customerId: row.customer_id || null,
    customerName: row.customer_name || null,
    waiterId: row.waiter_id || null,
    waiterName: row.waiter_name || null,
    status: row.status,
    notes: row.notes || '',
    items,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    discount: Number(row.discount),
    total: Number(row.total),
    statusTimestamps: parseJson(row.status_timestamps_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    tableId: row.table_id,
    tableNumber: Number(row.table_number),
    tableName: row.table_name || '',
    sessionId: row.session_id || null,
    type: row.type,
    message: row.message || '',
    status: row.status,
    acknowledgedBy: row.acknowledged_by || null,
    acknowledgedByName: row.acknowledged_by_name || null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
    updatedAt: row.updated_at,
  };
}

function mapPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    tableId: row.table_id,
    tableNumber: Number(row.table_number),
    orderIds: parseJson(row.order_ids_json, []),
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    discount: Number(row.discount),
    amount: Number(row.amount),
    method: row.method,
    status: row.status,
    receiptNumber: row.receipt_number,
    processedBy: row.processed_by || null,
    processedByName: row.processed_by_name || null,
    createdAt: row.created_at,
  };
}

function mapAuditLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorId: row.actor_id || null,
    actorName: row.actor_name || 'System',
    actorRole: row.actor_role || 'system',
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id || null,
    details: row.details || '',
    createdAt: row.created_at,
  };
}

function mapOtpChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    identifier: row.identifier,
    channel: row.channel,
    purpose: row.purpose,
    pendingName: row.pending_name || null,
    otpHash: row.otp_hash,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 5),
    resendCount: Number(row.resend_count || 0),
    windowStartedAt: row.window_started_at,
    lastSentAt: row.last_sent_at,
    expiresAt: row.expires_at,
    invalidated: Boolean(row.invalidated),
    consumedAt: row.consumed_at || null,
    ip: row.ip || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRepository(db) {
  async function attachItemsToOrders(orderRows) {
    if (!orderRows || orderRows.length === 0) return [];
    const orderIds = orderRows.map((o) => o.id);
    const byOrderId = new Map();
    // Chunk IN(...) queries below D1's bound-variable limit (100 params max per statement)
    const CHUNK_SIZE = 80;
    for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
      const chunk = orderIds.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const itemsRes = await db
        .prepare(
          `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id ASC, item_index ASC`
        )
        .bind(...chunk)
        .all();

      for (const row of itemsRes.results || []) {
        const list = byOrderId.get(row.order_id) || [];
        list.push(mapOrderItem(row));
        byOrderId.set(row.order_id, list);
      }
    }

    return orderRows.map((row) => mapOrder(row, byOrderId.get(row.id) || []));
  }

  return {
    getEngine() {
      return 'cloudflare-d1';
    },

    async wipeAll() {
      await db.batch([
        db.prepare('DELETE FROM order_items'),
        db.prepare('DELETE FROM orders'),
        db.prepare('DELETE FROM service_calls'),
        db.prepare('DELETE FROM payments'),
        db.prepare('DELETE FROM menu_items'),
        db.prepare('DELETE FROM categories'),
        db.prepare('DELETE FROM tables'),
        db.prepare('DELETE FROM audit_logs'),
        db.prepare('DELETE FROM otp_requests'),
        db.prepare('DELETE FROM refresh_tokens'),
        db.prepare('DELETE FROM users'),
        db.prepare('DELETE FROM sequences'),
      ]);
    },

    // ==========================================
    // SEQUENCES
    // ==========================================
    async nextOrderNumber() {
      const row = await db
        .prepare(
          `INSERT INTO sequences (name, value) VALUES ('order_number', 1001)
           ON CONFLICT(name) DO UPDATE SET value = value + 1
           RETURNING value`
        )
        .first();
      const seq = Number(row?.value || 1001);
      return `ORD-${seq}`;
    },

    async nextReceiptNumber() {
      const row = await db
        .prepare(
          `INSERT INTO sequences (name, value) VALUES ('receipt_number', 5001)
           ON CONFLICT(name) DO UPDATE SET value = value + 1
           RETURNING value`
        )
        .first();
      const seq = Number(row?.value || 5001);
      return `RCP-${seq}`;
    },

    // ==========================================
    // USERS
    // ==========================================
    async listUsers() {
      const res = await db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
      return (res.results || []).map(mapUser);
    },

    async countUsers() {
      const row = await db.prepare('SELECT COUNT(*) AS count FROM users').first();
      return Number(row?.count || 0);
    },

    async findUserById(id) {
      const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      return mapUser(row);
    },

    async findUserByEmail(email) {
      const clean = String(email || '').trim().toLowerCase();
      if (!clean) return null;
      const row = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').bind(clean).first();
      return mapUser(row);
    },

    async findUserByMobile(mobile) {
      const clean = String(mobile || '').trim();
      if (!clean) return null;
      const row = await db.prepare('SELECT * FROM users WHERE mobile = ?').bind(clean).first();
      return mapUser(row);
    },

    async findUserByIdentifier(channel, identifier) {
      if (channel === 'email') return this.findUserByEmail(identifier);
      return this.findUserByMobile(identifier);
    },

    async createUser(data) {
      const id = data.id || generateId();
      const nowIso = new Date().toISOString();
      const email = data.email ? String(data.email).trim().toLowerCase() : null;
      const mobile = data.mobile ? String(data.mobile).trim() : null;
      await db
        .prepare(
          `INSERT INTO users (
            id, name, email, mobile, role, password_hash, is_active, is_demo,
            assigned_tables_json, last_login_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          data.name,
          email,
          mobile,
          data.role,
          data.passwordHash ?? null,
          data.isActive === false ? 0 : 1,
          data.isDemo ? 1 : 0,
          JSON.stringify(data.assignedTables || []),
          data.lastLoginAt ?? null,
          data.createdAt || nowIso,
          data.updatedAt || nowIso
        )
        .run();
      return this.findUserById(id);
    },

    async updateUser(id, patch) {
      const existing = await this.findUserById(id);
      if (!existing) return null;
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `UPDATE users SET
            name = ?, email = ?, mobile = ?, role = ?, password_hash = ?,
            is_active = ?, is_demo = ?, assigned_tables_json = ?,
            last_login_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          patch.name !== undefined ? patch.name : existing.name,
          patch.email !== undefined ? (patch.email ? patch.email.toLowerCase().trim() : null) : existing.email,
          patch.mobile !== undefined ? (patch.mobile ? patch.mobile.trim() : null) : existing.mobile,
          patch.role !== undefined ? patch.role : existing.role,
          patch.passwordHash !== undefined ? patch.passwordHash : existing.passwordHash,
          patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
          patch.isDemo !== undefined ? (patch.isDemo ? 1 : 0) : existing.isDemo ? 1 : 0,
          JSON.stringify(patch.assignedTables !== undefined ? patch.assignedTables : existing.assignedTables),
          patch.lastLoginAt !== undefined ? patch.lastLoginAt : existing.lastLoginAt,
          nowIso,
          id
        )
        .run();
      return this.findUserById(id);
    },

    // ==========================================
    // REFRESH TOKENS
    // ==========================================
    async storeRefreshToken({ id = generateId(), userId, tokenHash, expiresAt }) {
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
           VALUES (?, ?, ?, ?, NULL, ?)`
        )
        .bind(id, userId, tokenHash, expiresAt, nowIso)
        .run();
      return { id, userId, tokenHash, expiresAt, createdAt: nowIso };
    },

    async findRefreshTokenByHash(tokenHash) {
      return db
        .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
        .bind(tokenHash)
        .first();
    },

    async revokeRefreshTokenByHash(tokenHash) {
      const nowIso = new Date().toISOString();
      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
        .bind(nowIso, tokenHash)
        .run();
    },

    async revokeAllUserRefreshTokens(userId) {
      const nowIso = new Date().toISOString();
      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .bind(nowIso, userId)
        .run();
    },

    async rotateRefreshToken(oldTokenHash, { userId, newTokenHash, expiresAt }) {
      const nowIso = new Date().toISOString();
      const newId = generateId();
      await db.batch([
        db
          .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
          .bind(nowIso, oldTokenHash),
        db
          .prepare(
            `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
             VALUES (?, ?, ?, ?, NULL, ?)`
          )
          .bind(newId, userId, newTokenHash, expiresAt, nowIso),
      ]);
      return { id: newId, userId, tokenHash: newTokenHash, expiresAt, createdAt: nowIso };
    },

    // ==========================================
    // TABLES
    // ==========================================
    async listTables() {
      const res = await db
        .prepare('SELECT * FROM tables WHERE is_active = 1 ORDER BY number ASC')
        .all();
      return (res.results || []).map(mapTable);
    },

    async findTableById(id) {
      const row = await db.prepare('SELECT * FROM tables WHERE id = ?').bind(id).first();
      return mapTable(row);
    },

    async findTableByNumber(number) {
      const row = await db
        .prepare('SELECT * FROM tables WHERE number = ? AND is_active = 1')
        .bind(Number(number))
        .first();
      return mapTable(row);
    },

    async findTableByQrToken(qrToken) {
      const row = await db
        .prepare('SELECT * FROM tables WHERE qr_token = ? AND is_active = 1')
        .bind(String(qrToken || '').trim())
        .first();
      return mapTable(row);
    },

    async createTable(data) {
      const existing = await this.findTableByNumber(data.number);
      if (existing) {
        throw new Error(`Table #${data.number} already exists.`);
      }
      const id = data.id || generateId();
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO tables (
            id, number, name, capacity, section, status, qr_token, qr_version,
            assigned_waiter_id, current_session_id, is_active, last_activity_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          Number(data.number),
          data.name,
          Number(data.capacity || 4),
          data.section || 'Main Dining',
          data.status || 'free',
          data.qrToken,
          Number(data.qrVersion || 1),
          data.assignedWaiterId ?? null,
          data.currentSessionId ?? null,
          data.isActive === false ? 0 : 1,
          data.lastActivityAt ?? nowIso,
          nowIso,
          nowIso
        )
        .run();
      return this.findTableById(id);
    },

    async updateTable(id, patch) {
      const existing = await this.findTableById(id);
      if (!existing) return null;
      const nowIso = new Date().toISOString();
      const nextQrVersion =
        patch.qrToken && patch.qrToken !== existing.qrToken
          ? existing.qrVersion + 1
          : patch.qrVersion !== undefined
            ? Number(patch.qrVersion)
            : existing.qrVersion;

      await db
        .prepare(
          `UPDATE tables SET
            name = ?, capacity = ?, section = ?, status = ?, qr_token = ?, qr_version = ?,
            assigned_waiter_id = ?, current_session_id = ?, is_active = ?,
            last_activity_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          patch.name !== undefined ? patch.name : existing.name,
          patch.capacity !== undefined ? Number(patch.capacity) : existing.capacity,
          patch.section !== undefined ? patch.section : existing.section,
          patch.status !== undefined ? patch.status : existing.status,
          patch.qrToken !== undefined ? patch.qrToken : existing.qrToken,
          nextQrVersion,
          patch.assignedWaiterId !== undefined ? patch.assignedWaiterId : existing.assignedWaiterId,
          patch.currentSessionId !== undefined ? patch.currentSessionId : existing.currentSessionId,
          patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
          nowIso,
          nowIso,
          id
        )
        .run();
      return this.findTableById(id);
    },

    async deleteTable(id) {
      const res = await db.prepare('DELETE FROM tables WHERE id = ?').bind(id).run();
      return (res.meta?.changes || 0) > 0;
    },

    // ==========================================
    // CATEGORIES & MENU ITEMS
    // ==========================================
    async listCategories() {
      const res = await db
        .prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
        .all();
      return (res.results || []).map(mapCategory);
    },

    async createCategory(data) {
      const id = data.id || generateId();
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO categories (id, name, description, sort_order, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          data.name,
          data.description || '',
          Number(data.sortOrder ?? 10),
          data.isActive === false ? 0 : 1,
          nowIso,
          nowIso
        )
        .run();
      const row = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
      return mapCategory(row);
    },

    async updateCategory(id, patch) {
      const existingRow = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
      if (!existingRow) return null;
      const existing = mapCategory(existingRow);
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `UPDATE categories SET name = ?, description = ?, sort_order = ?, is_active = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          patch.name !== undefined ? patch.name : existing.name,
          patch.description !== undefined ? patch.description : existing.description,
          patch.sortOrder !== undefined ? Number(patch.sortOrder) : existing.sortOrder,
          patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
          nowIso,
          id
        )
        .run();
      const updated = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
      return mapCategory(updated);
    },

    async deleteCategory(id) {
      const res = await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
      return (res.meta?.changes || 0) > 0;
    },

    async listMenuItems(includeInactive = false) {
      const sql = includeInactive
        ? 'SELECT * FROM menu_items ORDER BY name ASC'
        : 'SELECT * FROM menu_items WHERE is_active = 1 ORDER BY name ASC';
      const res = await db.prepare(sql).all();
      return (res.results || []).map(mapMenuItem);
    },

    async findMenuItemById(id) {
      const row = await db.prepare('SELECT * FROM menu_items WHERE id = ?').bind(id).first();
      return mapMenuItem(row);
    },

    async createMenuItem(data) {
      const id = data.id || generateId();
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO menu_items (
            id, category_id, name, description, price, image_url, is_veg,
            spice_level, allergens_json, prep_time_minutes, is_available, is_active,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          data.categoryId,
          data.name,
          data.description || '',
          Number(data.price),
          data.imageUrl || '',
          data.isVeg ? 1 : 0,
          data.spiceLevel || 'none',
          JSON.stringify(data.allergens || []),
          Number(data.prepTimeMinutes || 12),
          data.isAvailable === false ? 0 : 1,
          data.isActive === false ? 0 : 1,
          nowIso,
          nowIso
        )
        .run();
      return this.findMenuItemById(id);
    },

    async updateMenuItem(id, patch) {
      const existing = await this.findMenuItemById(id);
      if (!existing) return null;
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `UPDATE menu_items SET
            category_id = ?, name = ?, description = ?, price = ?, image_url = ?,
            is_veg = ?, spice_level = ?, allergens_json = ?, prep_time_minutes = ?,
            is_available = ?, is_active = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
          patch.name !== undefined ? patch.name : existing.name,
          patch.description !== undefined ? patch.description : existing.description,
          patch.price !== undefined ? Number(patch.price) : existing.price,
          patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
          patch.isVeg !== undefined ? (patch.isVeg ? 1 : 0) : existing.isVeg ? 1 : 0,
          patch.spiceLevel !== undefined ? patch.spiceLevel : existing.spiceLevel,
          JSON.stringify(patch.allergens !== undefined ? patch.allergens : existing.allergens),
          patch.prepTimeMinutes !== undefined ? Number(patch.prepTimeMinutes) : existing.prepTimeMinutes,
          patch.isAvailable !== undefined ? (patch.isAvailable ? 1 : 0) : existing.isAvailable ? 1 : 0,
          patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
          nowIso,
          id
        )
        .run();
      return this.findMenuItemById(id);
    },

    async deleteMenuItem(id) {
      const res = await db.prepare('DELETE FROM menu_items WHERE id = ?').bind(id).run();
      return (res.meta?.changes || 0) > 0;
    },

    // ==========================================
    // ORDERS (with transactional D1 batching)
    // ==========================================
    async listOrders({ tableId, statuses, from, to } = {}) {
      const clauses = [];
      const params = [];

      if (tableId) {
        clauses.push('table_id = ?');
        params.push(tableId);
      }
      if (Array.isArray(statuses) && statuses.length > 0) {
        clauses.push(`status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      }
      if (from) {
        clauses.push('created_at >= ?');
        params.push(new Date(from).toISOString());
      }
      if (to) {
        clauses.push('created_at <= ?');
        params.push(new Date(to).toISOString());
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const res = await db
        .prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC`)
        .bind(...params)
        .all();

      return attachItemsToOrders(res.results || []);
    },

    async findOrderById(id) {
      const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
      if (!row) return null;
      const orders = await attachItemsToOrders([row]);
      return orders[0] || null;
    },

    async createOrder(data) {
      const id = data.id || generateId();
      const nowIso = data.createdAt || new Date().toISOString();
      const updatedIso = data.updatedAt || nowIso;

      const statements = [
        db
          .prepare(
            `INSERT INTO orders (
              id, order_number, table_id, table_number, table_number_snapshot, table_name,
              source, order_type, session_id, customer_id, customer_name, waiter_id, waiter_name,
              status, notes, subtotal, tax, discount, total, status_timestamps_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            data.orderNumber,
            data.tableId,
            Number(data.tableNumber),
            Number(data.tableNumberSnapshot ?? data.tableNumber),
            data.tableName || '',
            data.source || 'qr',
            data.orderType || 'dine_in',
            data.sessionId,
            data.customerId ?? null,
            data.customerName ?? null,
            data.waiterId ?? null,
            data.waiterName ?? null,
            data.status || 'pending',
            data.notes || '',
            Number(data.subtotal || 0),
            Number(data.tax || 0),
            Number(data.discount || 0),
            Number(data.total || 0),
            JSON.stringify(data.statusTimestamps || {}),
            nowIso,
            updatedIso
          ),
      ];

      const items = Array.isArray(data.items) ? data.items : [];
      items.forEach((item, idx) => {
        statements.push(
          db
            .prepare(
              `INSERT INTO order_items (
                id, order_id, item_index, menu_item_id, name_snapshot,
                unit_price_snapshot, qty, notes, status, prep_time_minutes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              generateId(),
              id,
              idx,
              item.menuItemId || null,
              item.name,
              Number(item.price),
              Number(item.qty),
              item.notes || '',
              item.status || 'pending',
              Number(item.prepTimeMinutes || 12)
            )
        );
      });

      await db.batch(statements);
      return this.findOrderById(id);
    },

    async createOrderWithTableUpdate(orderData, tableId, sessionId) {
      const id = orderData.id || generateId();
      const nowIso = orderData.createdAt || new Date().toISOString();
      const updatedIso = orderData.updatedAt || nowIso;

      const statements = [
        db
          .prepare(
            `INSERT INTO orders (
              id, order_number, table_id, table_number, table_number_snapshot, table_name,
              source, order_type, session_id, customer_id, customer_name, waiter_id, waiter_name,
              status, notes, subtotal, tax, discount, total, status_timestamps_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            orderData.orderNumber,
            orderData.tableId,
            Number(orderData.tableNumber),
            Number(orderData.tableNumberSnapshot ?? orderData.tableNumber),
            orderData.tableName || '',
            orderData.source || 'qr',
            orderData.orderType || 'dine_in',
            orderData.sessionId,
            orderData.customerId ?? null,
            orderData.customerName ?? null,
            orderData.waiterId ?? null,
            orderData.waiterName ?? null,
            orderData.status || 'pending',
            orderData.notes || '',
            Number(orderData.subtotal || 0),
            Number(orderData.tax || 0),
            Number(orderData.discount || 0),
            Number(orderData.total || 0),
            JSON.stringify(orderData.statusTimestamps || {}),
            nowIso,
            updatedIso
          ),
      ];

      const items = Array.isArray(orderData.items) ? orderData.items : [];
      items.forEach((item, idx) => {
        statements.push(
          db
            .prepare(
              `INSERT INTO order_items (
                id, order_id, item_index, menu_item_id, name_snapshot,
                unit_price_snapshot, qty, notes, status, prep_time_minutes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              generateId(),
              id,
              idx,
              item.menuItemId || null,
              item.name,
              Number(item.price),
              Number(item.qty),
              item.notes || '',
              item.status || 'pending',
              Number(item.prepTimeMinutes || 12)
            )
        );
      });

      statements.push(
        db
          .prepare(
            `UPDATE tables SET status = 'occupied', current_session_id = ?, last_activity_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .bind(sessionId, nowIso, nowIso, tableId)
      );

      await db.batch(statements);
      const [order, updatedTable] = await Promise.all([
        this.findOrderById(id),
        this.findTableById(tableId),
      ]);
      return { order, updatedTable };
    },

    async updateOrder(id, patch) {
      const existing = await this.findOrderById(id);
      if (!existing) return null;
      const nowIso = patch.updatedAt || new Date().toISOString();

      const statements = [
        db
          .prepare(
            `UPDATE orders SET
              status = ?, waiter_id = ?, waiter_name = ?, notes = ?,
              discount = ?, total = ?, status_timestamps_json = ?,
              created_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .bind(
            patch.status !== undefined ? patch.status : existing.status,
            patch.waiterId !== undefined ? patch.waiterId : existing.waiterId,
            patch.waiterName !== undefined ? patch.waiterName : existing.waiterName,
            patch.notes !== undefined ? patch.notes : existing.notes,
            patch.discount !== undefined ? Number(patch.discount) : existing.discount,
            patch.total !== undefined ? Number(patch.total) : existing.total,
            JSON.stringify(
              patch.statusTimestamps !== undefined ? patch.statusTimestamps : existing.statusTimestamps
            ),
            patch.createdAt !== undefined ? patch.createdAt : existing.createdAt,
            nowIso,
            id
          ),
      ];

      if (Array.isArray(patch.items)) {
        statements.push(db.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id));
        patch.items.forEach((item, idx) => {
          statements.push(
            db
              .prepare(
                `INSERT INTO order_items (
                  id, order_id, item_index, menu_item_id, name_snapshot,
                  unit_price_snapshot, qty, notes, status, prep_time_minutes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                item.id || generateId(),
                id,
                idx,
                item.menuItemId || null,
                item.name,
                Number(item.price),
                Number(item.qty),
                item.notes || '',
                item.status || 'pending',
                Number(item.prepTimeMinutes || 12)
              )
          );
        });
      }

      await db.batch(statements);
      return this.findOrderById(id);
    },

    // ==========================================
    // SERVICE CALLS
    // ==========================================
    async listCalls({ tableId, statuses } = {}) {
      const clauses = [];
      const params = [];
      if (tableId) {
        clauses.push('table_id = ?');
        params.push(tableId);
      }
      if (Array.isArray(statuses) && statuses.length > 0) {
        clauses.push(`status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const res = await db
        .prepare(`SELECT * FROM service_calls ${where} ORDER BY created_at DESC`)
        .bind(...params)
        .all();
      return (res.results || []).map(mapCall);
    },

    async findCallById(id) {
      const row = await db.prepare('SELECT * FROM service_calls WHERE id = ?').bind(id).first();
      return mapCall(row);
    },

    async createCall(data) {
      const id = data.id || generateId();
      const nowIso = data.createdAt || new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO service_calls (
            id, table_id, table_number, table_name, session_id, type, message,
            status, acknowledged_by, acknowledged_by_name, created_at, resolved_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          data.tableId,
          Number(data.tableNumber),
          data.tableName || '',
          data.sessionId ?? null,
          data.type || 'waiter',
          data.message || '',
          data.status || 'open',
          data.acknowledgedBy ?? null,
          data.acknowledgedByName ?? null,
          nowIso,
          data.resolvedAt ?? null,
          nowIso
        )
        .run();
      return this.findCallById(id);
    },

    async updateCall(id, patch) {
      const existing = await this.findCallById(id);
      if (!existing) return null;
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `UPDATE service_calls SET
            status = ?, acknowledged_by = ?, acknowledged_by_name = ?,
            created_at = ?, resolved_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          patch.status !== undefined ? patch.status : existing.status,
          patch.acknowledgedBy !== undefined ? patch.acknowledgedBy : existing.acknowledgedBy,
          patch.acknowledgedByName !== undefined ? patch.acknowledgedByName : existing.acknowledgedByName,
          patch.createdAt !== undefined ? patch.createdAt : existing.createdAt,
          patch.resolvedAt !== undefined ? patch.resolvedAt : existing.resolvedAt,
          nowIso,
          id
        )
        .run();
      return this.findCallById(id);
    },

    // ==========================================
    // PAYMENTS & ATOMIC SETTLEMENT
    // ==========================================
    async listPayments({ from, to } = {}) {
      const clauses = [];
      const params = [];
      if (from) {
        clauses.push('created_at >= ?');
        params.push(new Date(from).toISOString());
      }
      if (to) {
        clauses.push('created_at <= ?');
        params.push(new Date(to).toISOString());
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const res = await db
        .prepare(`SELECT * FROM payments ${where} ORDER BY created_at DESC`)
        .bind(...params)
        .all();
      return (res.results || []).map(mapPayment);
    },

    async createPayment(data) {
      const id = data.id || generateId();
      const nowIso = data.createdAt || new Date().toISOString();
      const receiptNumber = data.receiptNumber || (await this.nextReceiptNumber());
      await db
        .prepare(
          `INSERT INTO payments (
            id, table_id, table_number, order_ids_json, subtotal, tax, discount, amount,
            method, status, receipt_number, processed_by, processed_by_name, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          data.tableId,
          Number(data.tableNumber),
          JSON.stringify(data.orderIds || []),
          Number(data.subtotal || 0),
          Number(data.tax || 0),
          Number(data.discount || 0),
          Number(data.amount || 0),
          data.method,
          data.status || 'completed',
          receiptNumber,
          data.processedBy ?? null,
          data.processedByName ?? null,
          nowIso
        )
        .run();
      const row = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first();
      return mapPayment(row);
    },

    async settleTablePayment({
      table,
      openOrders,
      openCalls,
      bill,
      method,
      nextTableStatus,
      actorId,
      actorName,
      nowIso,
    }) {
      const paymentId = generateId();
      const receiptNumber = await this.nextReceiptNumber();

      const statements = [
        db
          .prepare(
            `INSERT INTO payments (
              id, table_id, table_number, order_ids_json, subtotal, tax, discount, amount,
              method, status, receipt_number, processed_by, processed_by_name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`
          )
          .bind(
            paymentId,
            table.id,
            Number(table.number),
            JSON.stringify(openOrders.map((o) => o.id)),
            Number(bill.subtotal),
            Number(bill.tax),
            Number(bill.discount),
            Number(bill.total),
            method,
            receiptNumber,
            actorId ?? null,
            actorName ?? null,
            nowIso
          ),
      ];

      for (const order of openOrders) {
        const nextTs = { ...order.statusTimestamps, paid: nowIso };
        statements.push(
          db
            .prepare(
              `UPDATE orders SET status = 'paid', status_timestamps_json = ?, updated_at = ?
               WHERE id = ?`
            )
            .bind(JSON.stringify(nextTs), nowIso, order.id)
        );
      }

      for (const call of openCalls) {
        statements.push(
          db
            .prepare(
              `UPDATE service_calls SET
                status = 'resolved',
                acknowledged_by = COALESCE(acknowledged_by, ?),
                acknowledged_by_name = COALESCE(acknowledged_by_name, ?),
                resolved_at = ?,
                updated_at = ?
               WHERE id = ?`
            )
            .bind(actorId ?? null, actorName ?? null, nowIso, nowIso, call.id)
        );
      }

      statements.push(
        db
          .prepare(
            `UPDATE tables SET status = ?, current_session_id = NULL, last_activity_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .bind(nextTableStatus, nowIso, nowIso, table.id)
      );

      await db.batch(statements);

      const [paymentRow, updatedTable, settledOrders, resolvedCalls] = await Promise.all([
        db.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first(),
        this.findTableById(table.id),
        Promise.all(openOrders.map((o) => this.findOrderById(o.id))),
        Promise.all(openCalls.map((c) => this.findCallById(c.id))),
      ]);

      return {
        payment: mapPayment(paymentRow),
        updatedTable,
        settledOrders: settledOrders.filter(Boolean),
        resolvedCalls: resolvedCalls.filter(Boolean),
      };
    },

    // ==========================================
    // OTP REQUESTS
    // ==========================================
    async findLatestOtpChallenge(identifier) {
      const row = await db
        .prepare('SELECT * FROM otp_requests WHERE identifier = ? ORDER BY created_at DESC LIMIT 1')
        .bind(identifier)
        .first();
      return mapOtpChallenge(row);
    },

    async findActiveOtpChallenge(identifier) {
      const row = await db
        .prepare(
          `SELECT * FROM otp_requests
           WHERE identifier = ? AND invalidated = 0 AND consumed_at IS NULL
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(identifier)
        .first();
      return mapOtpChallenge(row);
    },

    async invalidateActiveOtps(identifier) {
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `UPDATE otp_requests SET invalidated = 1, updated_at = ?
           WHERE identifier = ? AND invalidated = 0 AND consumed_at IS NULL`
        )
        .bind(nowIso, identifier)
        .run();
    },

    async createOtpChallenge(data) {
      const id = data.id || generateId();
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO otp_requests (
            id, identifier, channel, purpose, pending_name, otp_hash, attempts, max_attempts,
            resend_count, window_started_at, last_sent_at, expires_at, invalidated,
            consumed_at, ip, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          data.identifier,
          data.channel,
          data.purpose || 'login',
          data.pendingName ?? null,
          data.otpHash,
          Number(data.attempts || 0),
          Number(data.maxAttempts || 5),
          Number(data.resendCount || 0),
          data.windowStartedAt || nowIso,
          data.lastSentAt || nowIso,
          data.expiresAt,
          data.invalidated ? 1 : 0,
          data.consumedAt ?? null,
          data.ip || '',
          nowIso,
          nowIso
        )
        .run();
      const row = await db.prepare('SELECT * FROM otp_requests WHERE id = ?').bind(id).first();
      return mapOtpChallenge(row);
    },

    async updateOtpChallenge(id, patch) {
      const existingRow = await db.prepare('SELECT * FROM otp_requests WHERE id = ?').bind(id).first();
      if (!existingRow) return null;
      const existing = mapOtpChallenge(existingRow);
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `UPDATE otp_requests SET attempts = ?, invalidated = ?, consumed_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          patch.attempts !== undefined ? Number(patch.attempts) : existing.attempts,
          patch.invalidated !== undefined ? (patch.invalidated ? 1 : 0) : existing.invalidated ? 1 : 0,
          patch.consumedAt !== undefined ? patch.consumedAt : existing.consumedAt,
          nowIso,
          id
        )
        .run();
      const updated = await db.prepare('SELECT * FROM otp_requests WHERE id = ?').bind(id).first();
      return mapOtpChallenge(updated);
    },

    // ==========================================
    // AUDIT LOGS
    // ==========================================
    async createAuditLog(data) {
      const id = data.id || generateId();
      const nowIso = data.createdAt || new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity, entity_id, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          data.actorId ?? null,
          data.actorName || 'System',
          data.actorRole || 'system',
          data.action,
          data.entity,
          data.entityId ?? null,
          data.details || '',
          nowIso
        )
        .run();
      return { id, ...data, createdAt: nowIso };
    },

    async listAuditLogs(limit = 50) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
      const res = await db
        .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
        .bind(safeLimit)
        .all();
      return (res.results || []).map(mapAuditLog);
    },

    // ==========================================
    // SCHEDULED CLEANUP
    // ==========================================
    async cleanupExpiredAuthRecords(nowIso = new Date().toISOString()) {
      const cutoffConsumed = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const cutoffAuditLogs = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [otpRes, refreshRes, auditRes] = await db.batch([
        db
          .prepare(
            'DELETE FROM otp_requests WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)'
          )
          .bind(nowIso, cutoffConsumed),
        db
          .prepare(
            'DELETE FROM refresh_tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)'
          )
          .bind(nowIso, cutoffConsumed),
        db
          .prepare('DELETE FROM audit_logs WHERE created_at < ?')
          .bind(cutoffAuditLogs),
      ]);
      return {
        deletedOtps: otpRes.meta?.changes || 0,
        deletedRefreshTokens: refreshRes.meta?.changes || 0,
        deletedAuditLogs: auditRes.meta?.changes || 0,
      };
    },
  };
}
