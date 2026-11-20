import mongoose, { Schema } from 'mongoose';

// 1. User Model
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: null, unique: true, sparse: true, lowercase: true, trim: true },
    mobile: { type: String, default: null, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ['admin', 'manager', 'waiter', 'kitchen', 'customer'], required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 2. Table Model (indexed on unique qrToken)
const tableSchema = new Schema(
  {
    number: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1, max: 24 },
    section: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['free', 'occupied', 'reserved', 'cleaning'],
      default: 'free',
    },
    qrToken: { type: String, required: true, unique: true, index: true },
    currentSessionId: { type: String, default: null },
  },
  { timestamps: true }
);

// 3. Category Model
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// 4. MenuItem Model
const menuItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    categoryId: { type: String, required: true, index: true },
    imageUrl: { type: String, default: '' },
    isVeg: { type: Boolean, default: false },
    spiceLevel: { type: String, enum: ['none', 'mild', 'medium', 'hot'], default: 'none' },
    allergens: [{ type: String }],
    prepTimeMinutes: { type: Number, default: 12, min: 1 },
    isAvailable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// 5. Order Model (indexed on tableId and status)
const orderItemSchema = new Schema(
  {
    menuItemId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'preparing', 'ready', 'served'],
      default: 'pending',
    },
    prepTimeMinutes: { type: Number, default: 12 },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true },
    tableId: { type: String, required: true, index: true },
    tableNumber: { type: Number, required: true },
    tableName: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'paid', 'cancelled'],
      default: 'pending',
      index: true,
    },
    source: { type: String, enum: ['guest_qr', 'staff', 'customer_web'], default: 'guest_qr' },
    orderType: { type: String, enum: ['dine_in', 'pickup'], default: 'dine_in' },
    customerId: { type: String, default: null, index: true },
    customerName: { type: String, default: null },
    waiterId: { type: String, default: null },
    waiterName: { type: String, default: null },
    statusTimestamps: {
      pending: { type: Date, default: Date.now },
      accepted: { type: Date, default: null },
      preparing: { type: Date, default: null },
      ready: { type: Date, default: null },
      served: { type: Date, default: null },
      paid: { type: Date, default: null },
      cancelled: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// 6. ServiceCall Model (indexed on status)
const serviceCallSchema = new Schema(
  {
    tableId: { type: String, required: true, index: true },
    tableNumber: { type: Number, required: true },
    tableName: { type: String, required: true },
    sessionId: { type: String, default: null },
    type: {
      type: String,
      enum: ['waiter', 'bill', 'water', 'napkins', 'other'],
      default: 'waiter',
    },
    message: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
      index: true,
    },
    acknowledgedBy: { type: String, default: null },
    acknowledgedByName: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 7. Payment Model
const paymentSchema = new Schema(
  {
    orderIds: [{ type: String, required: true }],
    tableId: { type: String, required: true, index: true },
    tableNumber: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['cash', 'card', 'upi', 'demo'], required: true },
    status: { type: String, enum: ['completed', 'refunded'], default: 'completed' },
    processedBy: { type: String, default: null },
    processedByName: { type: String, default: null },
  },
  { timestamps: true }
);

// 8. AuditLog Model
const auditLogSchema = new Schema(
  {
    actorId: { type: String, default: null },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: null },
    details: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

// 9. OtpChallenge Model (stores hashed OTPs only, never plain text)
const otpChallengeSchema = new Schema(
  {
    identifier: { type: String, required: true, index: true },
    channel: { type: String, enum: ['mobile', 'email'], required: true },
    purpose: { type: String, enum: ['login', 'signup'], required: true },
    pendingName: { type: String, default: null },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    resendCount: { type: Number, default: 0 },
    windowStartedAt: { type: Date, default: Date.now },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    invalidated: { type: Boolean, default: false },
    consumedAt: { type: Date, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export const TableModel = mongoose.models.Table || mongoose.model('Table', tableSchema);
export const CategoryModel = mongoose.models.Category || mongoose.model('Category', categorySchema);
export const MenuItemModel = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);
export const OrderModel = mongoose.models.Order || mongoose.model('Order', orderSchema);
export const ServiceCallModel =
  mongoose.models.ServiceCall || mongoose.model('ServiceCall', serviceCallSchema);
export const PaymentModel = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export const OtpChallengeModel =
  mongoose.models.OtpChallenge || mongoose.model('OtpChallenge', otpChallengeSchema);

