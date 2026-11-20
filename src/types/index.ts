export type UserRole = 'admin' | 'manager' | 'waiter' | 'kitchen';
export type TableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning';
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'paid'
  | 'cancelled';
export type OrderItemStatus = 'pending' | 'preparing' | 'ready' | 'served';
export type ServiceCallType = 'waiter' | 'bill' | 'water' | 'napkins' | 'other';
export type ServiceCallStatus = 'open' | 'acknowledged' | 'resolved';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'demo';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isDemo: boolean;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

export interface AppConfig {
  restaurantName: string;
  demoMode: boolean;
  taxRate: number;
  demoTables: Array<{ number: number; name: string; qrToken: string }>;
}

export interface TableItem {
  id: string;
  number: number;
  name: string;
  capacity: number;
  section: string;
  status: TableStatus;
  qrToken: string;
  currentSessionId: string | null;
  openOrderCount?: number;
  openCallCount?: number;
  openTotal?: number;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
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

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
  status: OrderItemStatus;
  prepTimeMinutes: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  sessionId: string;
  items: OrderItem[];
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

export interface ServiceCall {
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

export interface Payment {
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

export interface AuditLog {
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

export interface BillingTab {
  table: TableItem;
  orders: Order[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface ReportsSummary {
  kpis: {
    todaySales: number;
    totalOrders: number;
    paidOrdersCount: number;
    openOrdersCount: number;
    activeTables: number;
    totalTables: number;
    openCallsCount: number;
    avgPrepMinutes: number;
    avgCheckSize: number;
  };
  salesByHour: Array<{ hour: string; sales: number; orders: number }>;
  topItems: Array<{ name: string; qty: number; revenue: number }>;
  salesByCategory: Array<{ category: string; qty: number; revenue: number }>;
  salesByWaiter: Array<{ waiter: string; orders: number; revenue: number }>;
  salesByTable: Array<{ tableNumber: number; tableName: string; orders: number; revenue: number }>;
  recentPayments: Payment[];
}
