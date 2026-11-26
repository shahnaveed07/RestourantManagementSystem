-- PassLine Restaurant D1 (SQLite) initial schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  mobile TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'waiter', 'kitchen', 'customer')),
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  assigned_tables_json TEXT NOT NULL DEFAULT '[]',
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  section TEXT NOT NULL DEFAULT 'Main Dining',
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'reserved', 'cleaning')),
  qr_token TEXT NOT NULL UNIQUE,
  qr_version INTEGER NOT NULL DEFAULT 1,
  assigned_waiter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  current_session_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_activity_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  is_veg INTEGER NOT NULL DEFAULT 0,
  spice_level TEXT NOT NULL DEFAULT 'none' CHECK (spice_level IN ('none', 'mild', 'medium', 'hot')),
  allergens_json TEXT NOT NULL DEFAULT '[]',
  prep_time_minutes INTEGER NOT NULL DEFAULT 12,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  table_id TEXT NOT NULL REFERENCES tables(id),
  table_number INTEGER NOT NULL,
  table_number_snapshot INTEGER NOT NULL,
  table_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'qr' CHECK (source IN ('qr', 'home', 'staff')),
  order_type TEXT NOT NULL DEFAULT 'dine_in',
  session_id TEXT NOT NULL,
  customer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT,
  waiter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  waiter_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'served', 'paid', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status_timestamps_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL,
  menu_item_id TEXT,
  name_snapshot TEXT NOT NULL,
  unit_price_snapshot REAL NOT NULL,
  qty INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  prep_time_minutes INTEGER NOT NULL DEFAULT 12
);

CREATE TABLE IF NOT EXISTS service_calls (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id),
  table_number INTEGER NOT NULL,
  table_name TEXT NOT NULL DEFAULT '',
  session_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('waiter', 'water', 'bill', 'napkins', 'other')),
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_by_name TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES tables(id),
  table_number INTEGER NOT NULL,
  order_ids_json TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'upi', 'demo')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'paid', 'refunded')),
  receipt_number TEXT NOT NULL UNIQUE,
  processed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  processed_by_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT NOT NULL DEFAULT 'System',
  actor_role TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'mobile')),
  purpose TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login', 'signup')),
  pending_name TEXT,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  resend_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  last_sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  invalidated INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sequences (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Indexes for query performance and uniqueness
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id, item_index);
CREATE INDEX IF NOT EXISTS idx_service_calls_status ON service_calls(status);
CREATE INDEX IF NOT EXISTS idx_service_calls_table_status ON service_calls(table_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_table_id ON payments(table_id);
CREATE INDEX IF NOT EXISTS idx_otp_identifier_created ON otp_requests(identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
