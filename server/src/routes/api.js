import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit, { MemoryStore, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { repo } from '../db/repository.js';
import {
  authenticate,
  requireRole,
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  sendOk,
  sendErr,
} from '../middleware/auth.js';
import { socketEmitter } from '../sockets/index.js';
import {
  computeAuthoritativeOrder,
  computeConsolidatedBill,
  canTransitionOrderStatus,
  deriveOrderStatusFromItems,
  generateQrToken,
  sanitizeText,
  escapeCsvCell,
  roundCurrency,
  validateTableForOrder,
  resolveOrderSessionId,
  resolveOrderSource,
  toPublicTableSummary,
} from '../services/orderCalculator.js';
import {
  normalizeIdentifier,
  maskIdentifier,
  generateSixDigitOtp,
  hashOtp,
  evaluateResendPolicy,
  evaluateOtpVerification,
} from '../services/otpLogic.js';
import { dispatchOtp, verifyCaptchaToken } from '../services/otpService.js';
import { seedDatabase } from '../seed/seedData.js';

const router = Router();

function extractClientIp(req) {
  const forwarded = req.headers.forwarded;
  if (typeof forwarded === 'string') {
    const match = forwarded.match(/for="?\[?([^;\s",]+?)\]?(?::\d+)?"?(?:;|,|$)/i);
    if (match?.[1]) {
      return ipKeyGenerator(match[1]);
    }
  }
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || '127.0.0.1');
}

function getNormalizedOtpKey(req) {
  const body = req.body || {};
  const channel =
    body.channel || (typeof body.identifier === 'string' && body.identifier.includes('@') ? 'email' : 'mobile');
  const norm = normalizeIdentifier(channel, body.identifier || '', body.countryCode || '+91');
  if (norm.valid) return norm.identifier;
  return `raw:${String(body.identifier || '').trim().toLowerCase() || extractClientIp(req)}`;
}

// Track failed OTP verification/CAPTCHA attempts per IP for optional CAPTCHA trigger (>= 2 failures)
const failedIpAttempts = new Map();

function recordIpFailure(ip) {
  const now = Date.now();
  const prev = failedIpAttempts.get(ip);
  if (!prev || now - prev.updatedAt > 60 * 60 * 1000) {
    failedIpAttempts.set(ip, { count: 1, updatedAt: now });
    return 1;
  }
  const nextCount = prev.count + 1;
  failedIpAttempts.set(ip, { count: nextCount, updatedAt: now });
  return nextCount;
}

function getIpFailureCount(ip) {
  const prev = failedIpAttempts.get(ip);
  if (!prev || Date.now() - prev.updatedAt > 60 * 60 * 1000) return 0;
  return prev.count;
}

function clearIpFailures(ip) {
  failedIpAttempts.delete(ip);
}

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => `login:${extractClientIp(req)}`,
  validate: { forwardedHeader: false },
  message: { success: false, data: null, message: 'Too many login attempts. Please wait a few minutes.' },
});

const otpRequestIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => `otp-req-ip:${extractClientIp(req)}`,
  validate: { forwardedHeader: false },
  message: {
    success: false,
    data: null,
    message: 'Too many OTP requests from this IP address. Please try again later.',
  },
});

const otpRequestIdentifierLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => `otp-req-id:${getNormalizedOtpKey(req)}`,
  validate: { forwardedHeader: false },
  message: {
    success: false,
    data: null,
    message: 'Maximum 3 OTP requests per 15 minutes reached for this mobile/email. Please wait.',
  },
});

const otpVerifyIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => `otp-ver-ip:${extractClientIp(req)}`,
  validate: { forwardedHeader: false },
  message: {
    success: false,
    data: null,
    message: 'Too many verification attempts from this IP. Please wait before retrying.',
  },
});

const otpVerifyIdentifierLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => `otp-ver-id:${getNormalizedOtpKey(req)}`,
  validate: { forwardedHeader: false },
  message: {
    success: false,
    data: null,
    message: 'Too many verification attempts for this mobile/email. Please request a new code later.',
  },
});

const guestCallLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body || {};
    return `call:${req.params.qrToken || ''}:${body?.sessionId || extractClientIp(req)}`;
  },
  validate: { forwardedHeader: false },
  message: {
    success: false,
    data: null,
    message: 'Rate limit reached: max 10 service calls per 10 minutes per table session.',
  },
});

const guestOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body || {};
    return `order:${req.params.qrToken || ''}:${body?.sessionId || extractClientIp(req)}`;
  },
  validate: { forwardedHeader: false },
  message: {
    success: false,
    data: null,
    message: 'Rate limit reached: max 10 orders per 10 minutes per table session.',
  },
});

const customerOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['admin', 'manager', 'waiter'].includes(req.user?.role),
  keyGenerator: (req) => `cust-order:${req.user?.userId || extractClientIp(req)}`,
  validate: { forwardedHeader: false },
  message: {
    success: false,
    data: null,
    message: 'Rate limit reached: maximum 10 orders per 10 minutes per customer.',
  },
});

// Auto-Play Demo Engine state
let autoPlayTimer = null;
let autoPlayIntervalSeconds = 10;

async function logAudit(req, action, entity, entityId, details) {
  await repo.createAuditLog({
    actorId: req.user?.userId || null,
    actorName: req.user?.name || 'System',
    actorRole: req.user?.role || 'system',
    action,
    entity,
    entityId,
    details,
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function sanitizeAuthUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email || null,
    mobile: user.mobile || null,
    role: user.role,
    isDemo: Boolean(user.isDemo),
    lastLoginAt: user.lastLoginAt || null,
  };
}

class OrderValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function placeTableOrder({
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
    totals = computeAuthoritativeOrder(items, menuMap, env.taxRate);
  } catch (err) {
    throw new OrderValidationError(err.message, 400);
  }

  const nowIso = new Date().toISOString();
  const orderNumber = await repo.nextOrderNumber();
  const sessionId = resolveOrderSessionId(table, requestedSessionId, Date.now());

  const order = await repo.createOrder({
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
  });

  const updatedTable = await repo.updateTable(table.id, {
    status: 'occupied',
    currentSessionId: sessionId,
  });

  socketEmitter.orderCreated(order);
  if (updatedTable) socketEmitter.tableStatusChanged(updatedTable);

  return { order, updatedTable };
}

// ==========================================
// HEALTH & PUBLIC CONFIG
// ==========================================
router.get('/health', (_req, res) => {
  sendOk(res, {
    status: 'ok',
    engine: repo.getEngine(),
    demoMode: env.demoMode,
    timestamp: new Date().toISOString(),
  });
});

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const tables = await repo.listTables();
    sendOk(res, {
      restaurantName: env.restaurantName,
      demoMode: env.demoMode,
      demoOtpHint: env.demoMode ? env.demoOtp : null,
      otpExpiryMinutes: env.otpExpiryMinutes,
      captchaEnabled: Boolean(env.captchaSecret),
      captchaProvider: env.captchaProvider,
      captchaSiteKey: env.captchaSiteKey || null,
      taxRate: env.taxRate,
      tables: tables.map((t) => ({ id: t.id, number: t.number, name: t.name, section: t.section })),
      demoTables: env.demoMode
        ? tables.slice(0, 6).map((t) => ({ id: t.id, number: t.number, name: t.name, qrToken: t.qrToken }))
        : [],
    });
  })
);

// ==========================================
// AUTHENTICATION (CUSTOMER OTP + STAFF PASSWORD)
// ==========================================
const otpRequestSchema = z.object({
  channel: z.enum(['mobile', 'email']),
  identifier: z.string().min(3).max(120),
  countryCode: z.string().max(6).optional(),
  purpose: z.enum(['login', 'signup']).default('login'),
  name: z.string().max(80).optional(),
  captchaToken: z.string().max(4096).optional(),
});

const otpVerifySchema = z.object({
  channel: z.enum(['mobile', 'email']).optional(),
  identifier: z.string().min(3).max(120),
  countryCode: z.string().max(6).optional(),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code.'),
  purpose: z.enum(['login', 'signup']).optional(),
  name: z.string().max(80).optional(),
});

const staffPasswordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

router.post(
  '/auth/otp/request',
  otpRequestIpLimiter,
  otpRequestIdentifierLimiter,
  asyncHandler(async (req, res) => {
    const parsed = otpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendErr(res, 'Please enter a valid mobile number or email address.', 400);
    }

    const { channel, identifier, countryCode, purpose, name, captchaToken } = parsed.data;
    const normalized = normalizeIdentifier(channel, identifier, countryCode || '+91');
    if (!normalized.valid) {
      return sendErr(res, normalized.error, 400);
    }

    const cleanName = typeof name === 'string' ? sanitizeText(name) : '';
    if (purpose === 'signup' && cleanName.length < 2) {
      return sendErr(res, 'Please enter your full name (at least 2 characters).', 400);
    }

    const clientIp = extractClientIp(req);
    if (env.captchaSecret && getIpFailureCount(clientIp) >= 2) {
      const captchaCheck = await verifyCaptchaToken(captchaToken, clientIp);
      if (!captchaCheck.valid) {
        return sendErr(res, captchaCheck.error || 'CAPTCHA verification required.', 400, {
          captchaRequired: true,
        });
      }
    }

    const nowMs = Date.now();
    const latestChallenge = await repo.findLatestOtpChallenge(normalized.identifier);
    const resendPolicy = evaluateResendPolicy(latestChallenge, nowMs, {
      cooldownSeconds: 30,
      maxResends: 3,
      windowMinutes: 15,
    });

    if (!resendPolicy.allowed) {
      const msg =
        resendPolicy.code === 'COOLDOWN'
          ? `Please wait ${resendPolicy.retryAfterSeconds}s before requesting a new code.`
          : 'Maximum 3 resends per 15 minutes reached. Please try again later.';
      return sendErr(res, msg, 429, {
        code: resendPolicy.code,
        retryAfterSeconds: resendPolicy.retryAfterSeconds,
      });
    }

    await repo.invalidateActiveOtps(normalized.identifier);

    const existingUser = await repo.findUserByIdentifier(channel, normalized.identifier);
    const otpCode = env.demoMode ? env.demoOtp : generateSixDigitOtp();
    const otpHash = hashOtp(normalized.identifier, otpCode, env.otpSecret);
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + env.otpExpiryMinutes * 60 * 1000).toISOString();

    // Create challenge for signups and for registered login accounts; keep response identical to prevent enumeration
    if (purpose === 'signup' || (existingUser && existingUser.isActive)) {
      await repo.createOtpChallenge({
        identifier: normalized.identifier,
        channel,
        purpose,
        pendingName: purpose === 'signup' ? cleanName : null,
        otpHash,
        attempts: 0,
        maxAttempts: env.otpMaxAttempts,
        resendCount: resendPolicy.nextResendCount,
        windowStartedAt: resendPolicy.windowStartedAt,
        lastSentAt: nowIso,
        expiresAt,
        invalidated: false,
        consumedAt: null,
        ip: clientIp,
      });

      await dispatchOtp({ channel, identifier: normalized.identifier, otp: otpCode });
    }

    const masked = maskIdentifier(channel, normalized.identifier);
    await logAudit(
      req,
      'OTP_REQUEST',
      'OtpChallenge',
      null,
      `OTP requested (${purpose}, ${channel}) for ${masked} from IP ${clientIp}`
    );

    return sendOk(
      res,
      {
        channel,
        identifier: normalized.identifier,
        maskedIdentifier: masked,
        purpose,
        expiresInSeconds: env.otpExpiryMinutes * 60,
        resendCooldownSeconds: 30,
        resendsRemaining: Math.max(0, 3 - resendPolicy.nextResendCount),
        ...(env.demoMode ? { demoOtp: env.demoOtp } : {}),
      },
      'If your details are eligible, a 6-digit verification code has been sent.'
    );
  })
);

router.post(
  '/auth/otp/verify',
  otpVerifyIpLimiter,
  otpVerifyIdentifierLimiter,
  asyncHandler(async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendErr(res, 'Please enter a valid identifier and 6-digit numeric OTP.', 400);
    }

    const inferredChannel =
      parsed.data.channel || (parsed.data.identifier.includes('@') ? 'email' : 'mobile');
    const normalized = normalizeIdentifier(
      inferredChannel,
      parsed.data.identifier,
      parsed.data.countryCode || '+91'
    );
    if (!normalized.valid) {
      return sendErr(res, normalized.error, 400);
    }

    const clientIp = extractClientIp(req);
    const challenge = await repo.findActiveOtpChallenge(normalized.identifier);
    const verdict = evaluateOtpVerification(
      challenge,
      parsed.data.otp,
      env.otpSecret,
      Date.now(),
      env.otpMaxAttempts
    );

    if (!verdict.valid) {
      const failures = recordIpFailure(clientIp);
      if (challenge) {
        await repo.updateOtpChallenge(challenge.id, {
          ...(typeof verdict.nextAttempts === 'number' ? { attempts: verdict.nextAttempts } : {}),
          ...(verdict.shouldInvalidate ? { invalidated: true } : {}),
        });
      }

      const captchaRequired = Boolean(env.captchaSecret) && failures >= 2;
      if (verdict.reason === 'MAX_ATTEMPTS') {
        return sendErr(
          res,
          'Maximum wrong OTP attempts reached. This code has been invalidated; please request a new one.',
          401,
          { code: 'OTP_LOCKED', captchaRequired }
        );
      }
      if (verdict.reason === 'EXPIRED') {
        return sendErr(res, 'Your verification code has expired. Please request a new one.', 401, {
          code: 'OTP_EXPIRED',
          captchaRequired,
        });
      }
      if (verdict.reason === 'WRONG_OTP') {
        return sendErr(
          res,
          `Incorrect verification code. ${verdict.attemptsRemaining} attempt(s) remaining.`,
          401,
          { code: 'WRONG_OTP', attemptsRemaining: verdict.attemptsRemaining, captchaRequired }
        );
      }
      return sendErr(res, 'Invalid or expired verification code. Please request a new one.', 401, {
        code: 'NO_ACTIVE_OTP',
        captchaRequired,
      });
    }

    const nowIso = new Date().toISOString();
    await repo.updateOtpChallenge(challenge.id, { consumedAt: nowIso });
    clearIpFailures(clientIp);

    const purpose = parsed.data.purpose || challenge.purpose || 'login';
    const existingUser = await repo.findUserByIdentifier(inferredChannel, normalized.identifier);

    let user = existingUser;
    if (purpose === 'signup') {
      if (existingUser) {
        return sendErr(
          res,
          'An account already exists with this mobile or email. Please log in instead.',
          409,
          { code: 'ACCOUNT_EXISTS' }
        );
      }
      const customerName = sanitizeText(parsed.data.name || challenge.pendingName || '');
      if (customerName.length < 2) {
        return sendErr(res, 'Please enter your full name (at least 2 characters).', 400);
      }
      user = await repo.createUser({
        name: customerName,
        email: inferredChannel === 'email' ? normalized.identifier : null,
        mobile: inferredChannel === 'mobile' ? normalized.identifier : null,
        passwordHash: null,
        role: 'customer',
        isActive: true,
        lastLoginAt: nowIso,
        isDemo: false,
      });
      await logAudit(
        req,
        'CUSTOMER_SIGNUP',
        'User',
        user.id,
        `New customer verified via ${inferredChannel} (${maskIdentifier(inferredChannel, normalized.identifier)})`
      );
    } else {
      if (!existingUser || !existingUser.isActive) {
        return sendErr(res, 'No active account found for this identifier. Please sign up first.', 401);
      }
      if (existingUser.role !== 'customer') {
        return sendErr(res, 'Staff accounts must sign in with email and password.', 403);
      }
      user = await repo.updateUser(existingUser.id, { lastLoginAt: nowIso });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    setAuthCookies(res, accessToken, refreshToken);

    return sendOk(
      res,
      {
        accessToken,
        user: sanitizeAuthUser(user),
      },
      purpose === 'signup' ? 'Account verified and created.' : 'Signed in.'
    );
  })
);

async function handleStaffPasswordLogin(req, res) {
  const parsed = staffPasswordLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendErr(res, 'Please enter a valid email and password.', 400);
  }

  const user = await repo.findUserByEmail(parsed.data.email);
  if (!user || !user.isActive) {
    return sendErr(res, 'Invalid email or password.', 401);
  }
  if (!['admin', 'manager', 'waiter', 'kitchen'].includes(user.role)) {
    return sendErr(res, 'Customers sign in using Mobile or Email OTP.', 403);
  }
  if (!user.passwordHash) {
    return sendErr(res, 'Password login is not configured for this account.', 401);
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return sendErr(res, 'Invalid email or password.', 401);
  }

  await repo.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  setAuthCookies(res, accessToken, refreshToken);

  return sendOk(res, {
    accessToken,
    user: sanitizeAuthUser(user),
  });
}

router.post('/auth/password/login', loginLimiter, asyncHandler(handleStaffPasswordLogin));
router.post('/auth/login', loginLimiter, asyncHandler(handleStaffPasswordLogin));

router.post(
  '/auth/set-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({ password: z.string().min(6).max(64) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendErr(res, 'Password must be at least 6 characters.', 400);
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await repo.updateUser(req.user.userId, { passwordHash });
    return sendOk(res, { passwordSet: true }, 'Password saved.');
  })
);

router.post(
  '/auth/demo-login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    if (!env.demoMode) {
      return sendErr(res, 'Demo login is disabled when DEMO_MODE is false.', 403);
    }
    const schema = z.object({ role: z.enum(['admin', 'manager', 'waiter', 'kitchen', 'customer']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendErr(res, 'Invalid demo role requested.', 400);
    }

    const emailMap = {
      admin: 'admin@demo.com',
      manager: 'manager@demo.com',
      waiter: 'waiter@demo.com',
      kitchen: 'kitchen@demo.com',
      customer: 'customer@demo.com',
    };
    const user = await repo.findUserByEmail(emailMap[parsed.data.role]);
    if (!user || !user.isActive) {
      return sendErr(res, 'Demo account not found. Please run seed first.', 404);
    }

    await repo.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    setAuthCookies(res, accessToken, refreshToken);

    return sendOk(res, {
      accessToken,
      user: sanitizeAuthUser(user),
    });
  })
);

router.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.passline_refresh;
    if (!refreshToken) {
      return sendErr(res, 'Refresh token missing.', 401);
    }
    try {
      const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);
      const user = await repo.findUserById(decoded.userId);
      if (!user || !user.isActive) {
        return sendErr(res, 'User no longer active.', 401);
      }
      const accessToken = signAccessToken(user);
      const newRefresh = signRefreshToken(user);
      setAuthCookies(res, accessToken, newRefresh);
      return sendOk(res, {
        accessToken,
        user: sanitizeAuthUser(user),
      });
    } catch {
      return sendErr(res, 'Invalid refresh token.', 401);
    }
  })
);

router.post('/auth/logout', (_req, res) => {
  clearAuthCookies(res);
  sendOk(res, { loggedOut: true }, 'Signed out.');
});

router.get(
  '/auth/session',
  asyncHandler(async (req, res) => {
    const token =
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null) || (typeof req.cookies?.passline_access === 'string' ? req.cookies.passline_access : null);

    if (token) {
      try {
        const decoded = jwt.verify(token, env.jwtSecret);
        const user = await repo.findUserById(decoded.userId);
        if (user && user.isActive) return sendOk(res, sanitizeAuthUser(user));
      } catch {
        // access token expired; try refresh cookie below
      }
    }

    const refreshToken = req.cookies?.passline_refresh;
    if (!refreshToken) return sendOk(res, null);

    try {
      const decodedRefresh = jwt.verify(refreshToken, env.jwtRefreshSecret);
      const user = await repo.findUserById(decodedRefresh.userId);
      if (!user || !user.isActive) return sendOk(res, null);
      const newAccess = signAccessToken(user);
      const newRefresh = signRefreshToken(user);
      setAuthCookies(res, newAccess, newRefresh);
      return sendOk(res, sanitizeAuthUser(user));
    } catch {
      return sendOk(res, null);
    }
  })
);

router.get(
  '/auth/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await repo.findUserById(req.user.userId);
    if (!user) return sendErr(res, 'User not found.', 404);
    return sendOk(res, sanitizeAuthUser(user));
  })
);

// ==========================================
// GUEST QR MENU ENDPOINTS (PUBLIC + RATE LIMITED)
// ==========================================
router.get(
  '/guest/table/:qrToken',
  asyncHandler(async (req, res) => {
    const qrToken = String(req.params.qrToken || '').trim();
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

    const table = await repo.findTableByQrToken(qrToken);
    if (!table) {
      return sendErr(res, 'This table QR code is invalid or has been rotated.', 404);
    }

    const [categories, menuItems, tableOrders, tableCalls] = await Promise.all([
      repo.listCategories(),
      repo.listMenuItems(false),
      repo.listOrders({
        tableId: table.id,
        statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'],
      }),
      repo.listCalls({
        tableId: table.id,
        statuses: ['open', 'acknowledged'],
      }),
    ]);

    const filteredOrders = sessionId
      ? tableOrders.filter((o) => o.sessionId === sessionId || o.sessionId === table.currentSessionId)
      : tableOrders;

    return sendOk(res, {
      restaurantName: env.restaurantName,
      taxRate: env.taxRate,
      table: {
        id: table.id,
        number: table.number,
        name: table.name,
        section: table.section,
        capacity: table.capacity,
        status: table.status,
        qrToken: table.qrToken,
      },
      categories: categories.filter((c) => c.isActive),
      menuItems,
      orders: filteredOrders,
      calls: tableCalls,
    });
  })
);

const guestOrderSchema = z.object({
  sessionId: z.string().min(4).max(80),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        qty: z.number().int().min(1).max(50),
        notes: z.string().max(200).optional(),
      })
    )
    .min(1),
});

router.post(
  '/guest/table/:qrToken/orders',
  guestOrderLimiter,
  (req, res, next) => {
    // Allow unauthenticated QR ordering only when in demo guest mode; otherwise require JWT login
    if (env.demoMode) return next();
    return authenticate(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const qrToken = String(req.params.qrToken || '').trim();
    const parsed = guestOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendErr(res, 'Please select at least one valid menu item.', 400);
    }

    const table = await repo.findTableByQrToken(qrToken);
    if (!table) {
      return sendErr(res, 'Invalid table QR token.', 404);
    }

    try {
      const { order } = await placeTableOrder({
        table,
        items: parsed.data.items,
        source: 'qr',
        requestedSessionId: parsed.data.sessionId,
        customerId: req.user?.role === 'customer' ? req.user.userId : null,
        customerName: req.user?.role === 'customer' ? req.user.name : null,
      });
      return sendOk(res, order, 'Order placed successfully.', 201);
    } catch (err) {
      return sendErr(res, err.message, err.status || 400);
    }
  })
);

const guestCallSchema = z.object({
  sessionId: z.string().min(4).max(80).optional(),
  type: z.enum(['waiter', 'bill', 'water', 'napkins', 'other']).default('waiter'),
  message: z.string().max(240).optional(),
});

router.post(
  '/guest/table/:qrToken/calls',
  guestCallLimiter,
  asyncHandler(async (req, res) => {
    const qrToken = String(req.params.qrToken || '').trim();
    const parsed = guestCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendErr(res, 'Invalid service call request.', 400);
    }

    const table = await repo.findTableByQrToken(qrToken);
    if (!table) {
      return sendErr(res, 'Invalid table QR token.', 404);
    }

    const defaultMessages = {
      waiter: 'Assistance requested at table',
      bill: 'Guest requested the bill',
      water: 'Water refill requested',
      napkins: 'Fresh napkins requested',
      other: 'Guest request',
    };

    const call = await repo.createCall({
      tableId: table.id,
      tableNumber: table.number,
      tableName: table.name,
      sessionId: parsed.data.sessionId ? sanitizeText(parsed.data.sessionId) : table.currentSessionId,
      type: parsed.data.type,
      message: sanitizeText(parsed.data.message || '') || defaultMessages[parsed.data.type],
      status: 'open',
      acknowledgedBy: null,
      acknowledgedByName: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    });

    socketEmitter.callCreated(call);
    return sendOk(res, call, 'Waiter has been notified.', 201);
  })
);

// ==========================================
// TABLES & QR MANAGEMENT
// ==========================================
router.get(
  '/tables/public',
  asyncHandler(async (_req, res) => {
    const tables = await repo.listTables();
    return sendOk(res, tables.map(toPublicTableSummary));
  })
);

router.get(
  '/tables/public/lookup',
  asyncHandler(async (req, res) => {
    const num = Number(req.query.number);
    if (!Number.isInteger(num) || num < 1) {
      return sendErr(res, 'Table not found', 404);
    }
    const table = await repo.findTableByNumber(num);
    if (!table) {
      return sendErr(res, 'Table not found', 404);
    }
    return sendOk(res, toPublicTableSummary(table));
  })
);

router.get(
  '/tables',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (_req, res) => {
    const [tables, openOrders, openCalls] = await Promise.all([
      repo.listTables(),
      repo.listOrders({ statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'] }),
      repo.listCalls({ statuses: ['open', 'acknowledged'] }),
    ]);

    const enriched = tables.map((t) => {
      const ordersForTable = openOrders.filter((o) => o.tableId === t.id);
      const callsForTable = openCalls.filter((c) => c.tableId === t.id);
      const openTotal = roundCurrency(ordersForTable.reduce((s, o) => s + o.total, 0));
      return {
        ...t,
        openOrderCount: ordersForTable.length,
        openCallCount: callsForTable.length,
        openTotal,
      };
    });
    return sendOk(res, enriched);
  })
);

const tableCreateSchema = z.object({
  number: z.number().int().min(1).max(999),
  name: z.string().min(2).max(80),
  capacity: z.number().int().min(1).max(24),
  section: z.string().min(2).max(50),
});

router.post(
  '/tables',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const parsed = tableCreateSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid table details.', 400);

    try {
      const created = await repo.createTable({
        number: parsed.data.number,
        name: sanitizeText(parsed.data.name),
        capacity: parsed.data.capacity,
        section: sanitizeText(parsed.data.section),
        status: 'free',
        qrToken: generateQrToken(parsed.data.number),
        currentSessionId: null,
        isActive: true,
      });
      await logAudit(req, 'CREATE_TABLE', 'Table', created.id, `Created ${created.name} (#${created.number})`);
      socketEmitter.tableStatusChanged(created);
      return sendOk(res, created, 'Table created.', 201);
    } catch (err) {
      return sendErr(res, err.message, 409);
    }
  })
);

router.put(
  '/tables/:id',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      capacity: z.number().int().min(1).max(24).optional(),
      section: z.string().min(2).max(50).optional(),
      status: z.enum(['free', 'occupied', 'reserved', 'cleaning']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid table update data.', 400);

    const patch = {};
    if (parsed.data.name) patch.name = sanitizeText(parsed.data.name);
    if (parsed.data.capacity) patch.capacity = parsed.data.capacity;
    if (parsed.data.section) patch.section = sanitizeText(parsed.data.section);
    if (parsed.data.status) {
      patch.status = parsed.data.status;
      if (parsed.data.status === 'free') patch.currentSessionId = null;
    }

    const updated = await repo.updateTable(String(req.params.id), patch);
    if (!updated) return sendErr(res, 'Table not found.', 404);
    socketEmitter.tableStatusChanged(updated);
    return sendOk(res, updated, 'Table updated.');
  })
);

router.patch(
  '/tables/:id/status',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (req, res) => {
    const schema = z.object({ status: z.enum(['free', 'occupied', 'reserved', 'cleaning']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid status.', 400);

    const patch = { status: parsed.data.status };
    if (parsed.data.status === 'free') patch.currentSessionId = null;

    const updated = await repo.updateTable(String(req.params.id), patch);
    if (!updated) return sendErr(res, 'Table not found.', 404);

    await logAudit(req, 'UPDATE_TABLE_STATUS', 'Table', updated.id, `Table #${updated.number} -> ${updated.status}`);
    socketEmitter.tableStatusChanged(updated);
    return sendOk(res, updated);
  })
);

router.post(
  '/tables/:id/rotate-qr',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const table = await repo.findTableById(String(req.params.id));
    if (!table) return sendErr(res, 'Table not found.', 404);

    const updated = await repo.updateTable(table.id, {
      qrToken: generateQrToken(table.number),
    });
    await logAudit(req, 'ROTATE_QR', 'Table', table.id, `Rotated QR token for Table #${table.number}`);
    if (updated) socketEmitter.tableStatusChanged(updated);
    return sendOk(res, updated, 'QR token rotated.');
  })
);

router.delete(
  '/tables/:id',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const tableId = String(req.params.id);
    const [openOrders, activeCalls] = await Promise.all([
      repo.listOrders({
        tableId,
        statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'],
      }),
      repo.listCalls({ tableId, statuses: ['open', 'acknowledged'] }),
    ]);
    if (openOrders.length > 0 || activeCalls.length > 0) {
      return sendErr(res, 'Cannot delete a table with open orders or active service calls.', 400);
    }

    const ok = await repo.deleteTable(tableId);
    if (!ok) return sendErr(res, 'Table not found.', 404);
    await logAudit(req, 'DELETE_TABLE', 'Table', tableId, 'Deleted table');
    return sendOk(res, { deleted: true });
  })
);

router.get(
  '/tables/:id/history',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (req, res) => {
    const table = await repo.findTableById(String(req.params.id));
    if (!table) return sendErr(res, 'Table not found.', 404);
    const [orders, calls] = await Promise.all([
      repo.listOrders({ tableId: table.id }),
      repo.listCalls({ tableId: table.id }),
    ]);
    return sendOk(res, { table, orders, calls });
  })
);

// ==========================================
// MENU & CATEGORY MANAGEMENT
// ==========================================
router.get(
  '/menu',
  asyncHandler(async (_req, res) => {
    const [categories, items] = await Promise.all([repo.listCategories(), repo.listMenuItems(false)]);
    return sendOk(res, { categories, items });
  })
);

router.post(
  '/menu/categories',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(60),
      sortOrder: z.number().int().min(0).default(10),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid category details.', 400);

    const created = await repo.createCategory({
      name: sanitizeText(parsed.data.name),
      sortOrder: parsed.data.sortOrder,
      isActive: true,
    });
    socketEmitter.menuUpdated({ reason: 'category_created' });
    return sendOk(res, created, 'Category created.', 201);
  })
);

router.put(
  '/menu/categories/:id',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(60).optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid category update.', 400);

    const updated = await repo.updateCategory(String(req.params.id), {
      ...(parsed.data.name ? { name: sanitizeText(parsed.data.name) } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    });
    if (!updated) return sendErr(res, 'Category not found.', 404);
    socketEmitter.menuUpdated({ reason: 'category_updated' });
    return sendOk(res, updated);
  })
);

router.delete(
  '/menu/categories/:id',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const categoryId = String(req.params.id);
    const items = await repo.listMenuItems(false);
    if (items.some((item) => item.categoryId === categoryId)) {
      return sendErr(res, 'Cannot delete a category that still has menu items.', 400);
    }
    const ok = await repo.deleteCategory(categoryId);
    if (!ok) return sendErr(res, 'Category not found.', 404);
    socketEmitter.menuUpdated({ reason: 'category_deleted' });
    return sendOk(res, { deleted: true });
  })
);

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

router.post(
  '/menu/items',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const parsed = menuItemSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid dish fields. Check name, price, and category.', 400);

    const categories = await repo.listCategories();
    if (!categories.some((c) => c.id === parsed.data.categoryId)) {
      return sendErr(res, 'Selected category does not exist.', 400);
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
    await logAudit(req, 'CREATE_MENU_ITEM', 'MenuItem', created.id, `Added "${created.name}" ($${created.price})`);
    socketEmitter.menuUpdated({ reason: 'item_created' });
    return sendOk(res, created, 'Menu item created.', 201);
  })
);

router.put(
  '/menu/items/:id',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const parsed = menuItemSchema.partial().safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid dish update.', 400);

    if (parsed.data.categoryId !== undefined) {
      const categories = await repo.listCategories();
      if (!categories.some((c) => c.id === parsed.data.categoryId)) {
        return sendErr(res, 'Selected category does not exist.', 400);
      }
    }

    const patch = { ...parsed.data };
    if (typeof patch.name === 'string') patch.name = sanitizeText(patch.name);
    if (typeof patch.description === 'string') patch.description = sanitizeText(patch.description);
    if (typeof patch.price === 'number') patch.price = roundCurrency(patch.price);

    const updated = await repo.updateMenuItem(String(req.params.id), patch);
    if (!updated) return sendErr(res, 'Menu item not found.', 404);
    await logAudit(req, 'UPDATE_MENU_ITEM', 'MenuItem', updated.id, `Updated "${updated.name}"`);
    socketEmitter.menuUpdated({ reason: 'item_updated' });
    return sendOk(res, updated);
  })
);

router.patch(
  '/menu/items/:id/availability',
  authenticate,
  requireRole('admin', 'manager', 'kitchen'),
  asyncHandler(async (req, res) => {
    const schema = z.object({ isAvailable: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'isAvailable boolean required.', 400);

    const updated = await repo.updateMenuItem(String(req.params.id), {
      isAvailable: parsed.data.isAvailable,
    });
    if (!updated) return sendErr(res, 'Menu item not found.', 404);

    await logAudit(
      req,
      'TOGGLE_AVAILABILITY',
      'MenuItem',
      updated.id,
      `"${updated.name}" -> ${updated.isAvailable ? 'Available' : 'Sold Out'}`
    );
    socketEmitter.menuItemAvailabilityChanged(updated);
    return sendOk(res, updated);
  })
);

router.post(
  '/menu/items/bulk-price',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      categoryId: z.string().optional(),
      mode: z.enum(['percent', 'flat']),
      amount: z.number().min(-50).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid bulk price update parameters.', 400);

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
      req,
      'BULK_PRICE_UPDATE',
      'MenuItem',
      null,
      `Adjusted ${updatedCount} items by ${parsed.data.amount}${parsed.data.mode === 'percent' ? '%' : ' USD'}`
    );
    socketEmitter.menuUpdated({ reason: 'bulk_price_update' });
    return sendOk(res, { updatedCount }, `Updated prices on ${updatedCount} dishes.`);
  })
);

router.delete(
  '/menu/items/:id',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const ok = await repo.deleteMenuItem(String(req.params.id));
    if (!ok) return sendErr(res, 'Menu item not found.', 404);
    socketEmitter.menuUpdated({ reason: 'item_deleted' });
    return sendOk(res, { deleted: true });
  })
);

// ==========================================
// ORDERS & KITCHEN DISPLAY
// ==========================================
router.get(
  '/orders',
  authenticate,
  asyncHandler(async (req, res) => {
    const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
    const tableId = typeof req.query.tableId === 'string' ? req.query.tableId : undefined;
    const statuses = statusParam ? statusParam.split(',').filter(Boolean) : undefined;

    const orders = await repo.listOrders({ tableId, statuses });
    if (req.user.role === 'customer') {
      return sendOk(
        res,
        orders.filter((o) => o.customerId === req.user.userId)
      );
    }
    return sendOk(res, orders);
  })
);

const createOrderSchema = z.object({
  tableId: z.string().min(1).optional().nullable(),
  qrToken: z.string().min(1).optional().nullable(),
  sessionId: z.string().max(80).optional(),
  source: z.enum(['qr', 'home', 'staff']).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        qty: z.number().int().min(1).max(50),
        notes: z.string().max(200).optional(),
      })
    )
    .min(1),
});

router.post(
  '/orders',
  authenticate,
  requireRole('admin', 'manager', 'waiter', 'customer'),
  customerOrderLimiter,
  asyncHandler(async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendErr(res, 'Please select at least one valid menu item.', 400);
    }

    const rawTableId = typeof parsed.data.tableId === 'string' ? parsed.data.tableId.trim() : '';
    const rawQrToken = typeof parsed.data.qrToken === 'string' ? parsed.data.qrToken.trim() : '';

    if (!rawQrToken && (!rawTableId || rawTableId === 'pickup')) {
      return sendErr(res, 'Please select your table number to continue.', 400);
    }

    let table = null;
    if (rawQrToken) {
      table = await repo.findTableByQrToken(rawQrToken);
      if (!table) return sendErr(res, 'Invalid table QR token.', 404);
      if (rawTableId && rawTableId !== table.id) {
        return sendErr(res, 'Table mismatch for QR code.', 400);
      }
    } else {
      table = await repo.findTableById(rawTableId);
      if (!table) return sendErr(res, 'Table not found.', 404);
    }

    const isStaffRole = ['admin', 'manager', 'waiter'].includes(req.user.role);
    const source = resolveOrderSource({
      qrToken: rawQrToken,
      userRole: req.user.role,
      requestedSource: parsed.data.source,
    });
    const isStaffOrder = source === 'staff' && isStaffRole;

    try {
      const { order } = await placeTableOrder({
        table,
        items: parsed.data.items,
        source,
        requestedSessionId: parsed.data.sessionId || '',
        customerId: req.user.role === 'customer' ? req.user.userId : null,
        customerName: req.user.role === 'customer' ? req.user.name : null,
        waiterId: isStaffOrder ? req.user.userId : null,
        waiterName: isStaffOrder ? req.user.name : null,
      });

      await logAudit(
        req,
        'CREATE_ORDER',
        'Order',
        order.id,
        `${source.toUpperCase()} order ${order.orderNumber} for Table #${table.number}`
      );
      return sendOk(res, order, 'Order placed successfully.', 201);
    } catch (err) {
      return sendErr(res, err.message, err.status || 400);
    }
  })
);

router.patch(
  '/orders/:id/status',
  authenticate,
  requireRole('admin', 'manager', 'waiter', 'kitchen'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.enum(['pending', 'accepted', 'preparing', 'ready', 'served', 'paid', 'cancelled']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid order status.', 400);

    const order = await repo.findOrderById(String(req.params.id));
    if (!order) return sendErr(res, 'Order not found.', 404);

    const nextStatus = parsed.data.status;
    if (!canTransitionOrderStatus(order.status, nextStatus)) {
      return sendErr(res, `Cannot move order from ${order.status} to ${nextStatus}.`, 400);
    }

    const role = req.user.role;
    if (role === 'kitchen' && !['accepted', 'preparing', 'ready'].includes(nextStatus)) {
      return sendErr(res, 'Kitchen staff can only move orders to accepted, preparing, or ready.', 403);
    }
    if (role === 'waiter' && !['accepted', 'preparing', 'ready', 'served', 'cancelled'].includes(nextStatus)) {
      return sendErr(res, 'Waiter cannot directly set this status.', 403);
    }

    const nowIso = new Date().toISOString();
    const updatedItems = order.items.map((item) => {
      if (nextStatus === 'preparing' && item.status === 'pending') {
        return { ...item, status: 'preparing' };
      }
      if (nextStatus === 'ready' && (item.status === 'pending' || item.status === 'preparing')) {
        return { ...item, status: 'ready' };
      }
      if (nextStatus === 'served') {
        return { ...item, status: 'served' };
      }
      return item;
    });

    const updated = await repo.updateOrder(order.id, {
      status: nextStatus,
      items: updatedItems,
      waiterId: order.waiterId || (role === 'waiter' ? req.user.userId : null),
      waiterName: order.waiterName || (role === 'waiter' ? req.user.name : null),
      statusTimestamps: {
        ...order.statusTimestamps,
        [nextStatus]: nowIso,
      },
      updatedAt: nowIso,
    });

    if (!updated) return sendErr(res, 'Failed to update order.', 500);
    await logAudit(req, 'UPDATE_ORDER_STATUS', 'Order', order.id, `${order.orderNumber} -> ${nextStatus}`);

    if (nextStatus === 'cancelled') {
      socketEmitter.orderCancelled(updated);
    } else {
      socketEmitter.orderUpdated(updated);
    }

    return sendOk(res, updated);
  })
);

router.patch(
  '/orders/:id/items/:itemIndex/status',
  authenticate,
  requireRole('admin', 'manager', 'kitchen'),
  asyncHandler(async (req, res) => {
    const schema = z.object({ status: z.enum(['pending', 'preparing', 'ready', 'served']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid item status.', 400);

    const order = await repo.findOrderById(String(req.params.id));
    if (!order) return sendErr(res, 'Order not found.', 404);
    if (['served', 'paid', 'cancelled'].includes(order.status)) {
      return sendErr(res, 'Cannot update items on a served, paid, or cancelled order.', 400);
    }

    const idx = Number(req.params.itemIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= order.items.length) {
      return sendErr(res, 'Invalid item index.', 400);
    }

    const updatedItems = order.items.map((item, i) =>
      i === idx ? { ...item, status: parsed.data.status } : item
    );
    const derivedStatus = deriveOrderStatusFromItems(
      order.status,
      updatedItems.map((i) => i.status)
    );
    const nowIso = new Date().toISOString();
    const nextTimestamps = { ...order.statusTimestamps };
    if (derivedStatus !== order.status) {
      if ((derivedStatus === 'preparing' || derivedStatus === 'ready') && !nextTimestamps.accepted) {
        nextTimestamps.accepted = nowIso;
      }
      if (derivedStatus === 'ready' && !nextTimestamps.preparing) {
        nextTimestamps.preparing = nowIso;
      }
      nextTimestamps[derivedStatus] = nowIso;
    }

    const updated = await repo.updateOrder(order.id, {
      items: updatedItems,
      status: derivedStatus,
      statusTimestamps: nextTimestamps,
      updatedAt: nowIso,
    });

    if (!updated) return sendErr(res, 'Failed to update item.', 500);
    socketEmitter.orderUpdated(updated);
    return sendOk(res, updated);
  })
);

// ==========================================
// LIVE SERVICE CALLS
// ==========================================
router.get(
  '/calls',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (req, res) => {
    const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
    const statuses = statusParam ? statusParam.split(',').filter(Boolean) : undefined;
    const calls = await repo.listCalls({ statuses });
    return sendOk(res, calls);
  })
);

router.patch(
  '/calls/:id/acknowledge',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (req, res) => {
    const call = await repo.findCallById(String(req.params.id));
    if (!call) return sendErr(res, 'Service call not found.', 404);
    if (call.status !== 'open') {
      return sendErr(res, 'Only open service calls can be acknowledged.', 400);
    }

    const updated = await repo.updateCall(call.id, {
      status: 'acknowledged',
      acknowledgedBy: req.user.userId,
      acknowledgedByName: req.user.name,
    });
    if (!updated) return sendErr(res, 'Failed to acknowledge call.', 500);

    await logAudit(req, 'ACKNOWLEDGE_CALL', 'ServiceCall', call.id, `Acknowledged ${call.type} call for Table #${call.tableNumber}`);
    socketEmitter.callAcknowledged(updated);
    return sendOk(res, updated);
  })
);

router.patch(
  '/calls/:id/resolve',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (req, res) => {
    const call = await repo.findCallById(String(req.params.id));
    if (!call) return sendErr(res, 'Service call not found.', 404);
    if (call.status === 'resolved') {
      return sendErr(res, 'Service call is already resolved.', 400);
    }
    if (call.status !== 'acknowledged') {
      return sendErr(res, 'Service call must be acknowledged before resolving.', 400);
    }

    const updated = await repo.updateCall(call.id, {
      status: 'resolved',
      acknowledgedBy: call.acknowledgedBy || req.user.userId,
      acknowledgedByName: call.acknowledgedByName || req.user.name,
      resolvedAt: new Date().toISOString(),
    });
    if (!updated) return sendErr(res, 'Failed to resolve call.', 500);

    await logAudit(req, 'RESOLVE_CALL', 'ServiceCall', call.id, `Resolved ${call.type} call for Table #${call.tableNumber}`);
    socketEmitter.callResolved(updated);
    return sendOk(res, updated);
  })
);

// ==========================================
// BILLING & PAYMENTS
// ==========================================
router.get(
  '/billing/tables',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (_req, res) => {
    const [tables, activeOrders] = await Promise.all([
      repo.listTables(),
      repo.listOrders({ statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'] }),
    ]);

    const tabs = tables
      .map((table) => {
        const orders = activeOrders.filter((o) => o.tableId === table.id);
        const totals = computeConsolidatedBill(orders, env.taxRate, 0, 0);
        return {
          table,
          orders,
          ...totals,
          itemCount: orders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.qty, 0), 0),
        };
      })
      .filter((tab) => tab.orders.length > 0 || tab.table.status === 'occupied');

    return sendOk(res, { taxRate: env.taxRate, tabs });
  })
);

router.post(
  '/billing/table/:tableId/pay',
  authenticate,
  requireRole('admin', 'manager', 'waiter'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      method: z.enum(['cash', 'card', 'upi', 'demo']),
      discountPercent: z.number().min(0).max(100).default(0),
      flatDiscount: z.number().min(0).max(10000).default(0),
      amount: z.number().nonnegative().optional(),
      nextTableStatus: z.enum(['free', 'cleaning']).default('cleaning'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid payment parameters.', 400);

    const table = await repo.findTableById(String(req.params.tableId));
    if (!table) return sendErr(res, 'Table not found.', 404);

    const openOrders = await repo.listOrders({
      tableId: table.id,
      statuses: ['pending', 'accepted', 'preparing', 'ready', 'served'],
    });
    if (openOrders.length === 0) {
      return sendErr(res, 'No open orders to settle for this table.', 400);
    }

    const unservedOrders = openOrders.filter((o) => !['served', 'paid'].includes(o.status));
    if (unservedOrders.length > 0) {
      return sendErr(res, 'All open orders on this table must be served before settling the bill.', 400);
    }

    const bill = computeConsolidatedBill(
      openOrders,
      env.taxRate,
      parsed.data.discountPercent,
      parsed.data.flatDiscount
    );
    if (
      parsed.data.amount !== undefined &&
      Math.abs(roundCurrency(parsed.data.amount) - bill.total) > 0.01
    ) {
      return sendErr(res, `Payment amount must match the bill total ($${bill.total.toFixed(2)}).`, 400);
    }

    const nowIso = new Date().toISOString();

    const payment = await repo.createPayment({
      orderIds: openOrders.map((o) => o.id),
      tableId: table.id,
      tableNumber: table.number,
      subtotal: bill.subtotal,
      tax: bill.tax,
      discount: bill.discount,
      amount: bill.total,
      method: parsed.data.method,
      status: 'completed',
      processedBy: req.user.userId,
      processedByName: req.user.name,
      createdAt: nowIso,
    });

    for (const order of openOrders) {
      const updatedOrder = await repo.updateOrder(order.id, {
        status: 'paid',
        statusTimestamps: { ...order.statusTimestamps, paid: nowIso },
        updatedAt: nowIso,
      });
      if (updatedOrder) socketEmitter.orderUpdated(updatedOrder);
    }

    const openCalls = await repo.listCalls({
      tableId: table.id,
      statuses: ['open', 'acknowledged'],
    });
    for (const call of openCalls) {
      const resolved = await repo.updateCall(call.id, {
        status: 'resolved',
        acknowledgedBy: call.acknowledgedBy || req.user.userId,
        acknowledgedByName: call.acknowledgedByName || req.user.name,
        resolvedAt: nowIso,
      });
      if (resolved) socketEmitter.callResolved(resolved);
    }

    const updatedTable = await repo.updateTable(table.id, {
      status: parsed.data.nextTableStatus,
      currentSessionId: null,
    });
    if (updatedTable) socketEmitter.tableStatusChanged(updatedTable);

    await logAudit(
      req,
      'RECORD_PAYMENT',
      'Payment',
      payment.id,
      `Settled Table #${table.number} ($${payment.amount.toFixed(2)} via ${payment.method})`
    );

    return sendOk(res, { payment, table: updatedTable, settledOrders: openOrders }, 'Payment recorded and table closed.');
  })
);

// ==========================================
// REPORTS & ANALYTICS + CSV EXPORT
// ==========================================
router.get(
  '/reports/summary',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined;

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

    const totalSales = roundCurrency(
      payments.reduce((sum, p) => sum + p.amount, 0)
    );
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

    // Sales by hour — contiguous window spanning all active order hours up to current hour
    const hourBuckets = new Map();
    for (let h = 0; h < 24; h++) {
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
    const startHour = nonCancelledOrders.length > 0 ? Math.min(minHour, Math.max(0, currentHour - 6)) : Math.max(0, currentHour - 6);
    const endHour = nonCancelledOrders.length > 0 ? Math.max(maxHour, currentHour) : currentHour;
    const salesByHour = Array.from(hourBuckets.values()).slice(startHour, endHour + 1);

    // Top selling items
    const itemStats = new Map();
    const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
    const itemCategoryMap = new Map(menuItems.map((m) => [m.id, categoryNameMap.get(m.categoryId) || 'Other']));
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
      const label =
        o.waiterName || (o.source === 'home' ? 'Home Self-Order' : 'Guest QR Self-Order');
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

    return sendOk(res, {
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
  })
);

router.get(
  '/reports/export',
  authenticate,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : undefined;
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
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="passline-sales-report.csv"');
    res.send(csv);
  })
);

// ==========================================
// STAFF MANAGEMENT & AUDIT LOGS (ADMIN ONLY)
// ==========================================
router.get(
  '/staff',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const [users, auditLogs] = await Promise.all([repo.listUsers(), repo.listAuditLogs(40)]);
    return sendOk(res, {
      users: users
        .filter((u) => u.role !== 'customer')
        .map(({ passwordHash: _pw, ...safe }) => safe),
      auditLogs,
    });
  })
);

router.post(
  '/staff',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80),
      email: z.string().email(),
      password: z.string().min(6).max(64),
      role: z.enum(['admin', 'manager', 'waiter', 'kitchen']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Valid name, email, role, and 6+ char password required.', 400);

    const existing = await repo.findUserByEmail(parsed.data.email);
    if (existing) return sendErr(res, 'A staff member with this email already exists.', 409);

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const created = await repo.createUser({
      name: sanitizeText(parsed.data.name),
      email: parsed.data.email.toLowerCase().trim(),
      passwordHash,
      role: parsed.data.role,
      isActive: true,
      lastLoginAt: null,
      isDemo: false,
    });
    await logAudit(req, 'CREATE_STAFF', 'User', created.id, `Created ${created.role} account for ${created.email}`);
    const { passwordHash: _pw, ...safe } = created;
    return sendOk(res, safe, 'Staff account created.', 201);
  })
);

router.put(
  '/staff/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      role: z.enum(['admin', 'manager', 'waiter', 'kitchen']).optional(),
      isActive: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid staff update payload.', 400);

    const updated = await repo.updateUser(String(req.params.id), {
      ...(parsed.data.name ? { name: sanitizeText(parsed.data.name) } : {}),
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    });
    if (!updated) return sendErr(res, 'User not found.', 404);

    await logAudit(req, 'UPDATE_STAFF', 'User', updated.id, `Updated ${updated.email} (${updated.role}, active=${updated.isActive})`);
    const { passwordHash: _pw, ...safe } = updated;
    return sendOk(res, safe);
  })
);

router.post(
  '/staff/:id/reset-password',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const schema = z.object({ newPassword: z.string().min(6).max(64) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Password must be at least 6 characters.', 400);

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    const updated = await repo.updateUser(String(req.params.id), { passwordHash });
    if (!updated) return sendErr(res, 'User not found.', 404);

    await logAudit(req, 'RESET_PASSWORD', 'User', updated.id, `Reset password for ${updated.email}`);
    return sendOk(res, { updated: true }, 'Password reset successfully.');
  })
);

// ==========================================
// DEMO TOOLS (ADMIN ONLY, GATED BY DEMO_MODE=true)
// ==========================================
async function createSimulatedGuestOrder(targetTableId, simulatedSource = 'qr') {
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
    table,
    items: requested,
    source: simulatedSource === 'home' ? 'home' : 'qr',
  });
  return order;
}

async function createSimulatedCall(targetTableId, callType) {
  const tables = await repo.listTables();
  if (tables.length === 0) throw new Error('No tables available.');
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

  socketEmitter.callCreated(call);
  return call;
}

router.use('/demo', authenticate, requireRole('admin'), (_req, res, next) => {
  if (!env.demoMode) {
    sendErr(res, 'Demo tools are disabled (DEMO_MODE=false).', 403);
    return;
  }
  next();
});

router.get('/demo/status', (_req, res) => {
  sendOk(res, {
    demoMode: env.demoMode,
    autoPlayRunning: Boolean(autoPlayTimer),
    intervalSeconds: autoPlayIntervalSeconds,
  });
});

router.post(
  '/demo/simulate-order',
  asyncHandler(async (req, res) => {
    const tableId = typeof req.body?.tableId === 'string' && req.body.tableId ? req.body.tableId : undefined;
    const source = req.body?.source === 'home' ? 'home' : 'qr';
    try {
      const order = await createSimulatedGuestOrder(tableId, source);
      await logAudit(
        req,
        'DEMO_SIMULATE_ORDER',
        'Order',
        order.id,
        `Simulated ${order.source.toUpperCase()} guest order ${order.orderNumber} on Table #${order.tableNumber}`
      );
      return sendOk(res, order, `Simulated ${order.source === 'home' ? 'Home' : 'QR'} order on Table ${order.tableNumber}.`, 201);
    } catch (err) {
      return sendErr(res, err.message, err.status || 400);
    }
  })
);

router.post(
  '/demo/simulate-call',
  asyncHandler(async (req, res) => {
    const tableId = typeof req.body?.tableId === 'string' && req.body.tableId ? req.body.tableId : undefined;
    const type = typeof req.body?.type === 'string' && req.body.type ? req.body.type : undefined;
    const call = await createSimulatedCall(tableId, type);
    await logAudit(req, 'DEMO_SIMULATE_CALL', 'ServiceCall', call.id, `Simulated ${call.type} call on Table #${call.tableNumber}`);
    return sendOk(res, call, `Simulated ${call.type} call on Table ${call.tableNumber}.`, 201);
  })
);

router.post(
  '/demo/autoplay',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      enabled: z.boolean(),
      intervalSeconds: z.number().int().min(3).max(60).default(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid auto-play config.', 400);

    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }

    autoPlayIntervalSeconds = parsed.data.intervalSeconds;
    if (parsed.data.enabled) {
      autoPlayTimer = setInterval(async () => {
        try {
          if (Math.random() < 0.65) {
            await createSimulatedGuestOrder();
          } else {
            await createSimulatedCall();
          }
        } catch {
          // ignore transient errors during autoplay
        }
      }, autoPlayIntervalSeconds * 1000);
    }

    await logAudit(
      req,
      'DEMO_AUTOPLAY',
      'System',
      null,
      parsed.data.enabled ? `Started Auto-Play every ${autoPlayIntervalSeconds}s` : 'Stopped Auto-Play'
    );

    return sendOk(res, {
      autoPlayRunning: Boolean(autoPlayTimer),
      intervalSeconds: autoPlayIntervalSeconds,
    });
  })
);

router.post(
  '/demo/time-travel',
  asyncHandler(async (req, res) => {
    const schema = z.object({ minutesBack: z.number().int().min(1).max(120).default(10) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 'Invalid minutesBack.', 400);

    const deltaMs = parsed.data.minutesBack * 60 * 1000;
    const [activeOrders, openCalls] = await Promise.all([
      repo.listOrders({ statuses: ['pending', 'accepted', 'preparing', 'ready'] }),
      repo.listCalls({ statuses: ['open', 'acknowledged'] }),
    ]);

    for (const order of activeOrders) {
      const shifted = new Date(new Date(order.createdAt).getTime() - deltaMs).toISOString();
      const updated = await repo.updateOrder(order.id, {
        createdAt: shifted,
        statusTimestamps: { ...order.statusTimestamps, pending: shifted },
      });
      if (updated) socketEmitter.orderUpdated(updated);
    }

    for (const call of openCalls) {
      const shifted = new Date(new Date(call.createdAt).getTime() - deltaMs).toISOString();
      const updated = await repo.updateCall(call.id, { createdAt: shifted });
      if (updated) socketEmitter.callAcknowledged(updated);
    }

    await logAudit(
      req,
      'DEMO_TIME_TRAVEL',
      'System',
      null,
      `Backdated ${activeOrders.length} active orders and ${openCalls.length} open calls by ${parsed.data.minutesBack}m`
    );

    return sendOk(
      res,
      { ordersShifted: activeOrders.length, callsShifted: openCalls.length },
      `Backdated active orders and calls by ${parsed.data.minutesBack} minutes.`
    );
  })
);

router.post(
  '/demo/reset',
  asyncHandler(async (_req, res) => {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
    const summary = await seedDatabase(true);
    socketEmitter.menuUpdated({ reason: 'demo_reset' });
    return sendOk(res, summary, 'Demo database reset and reseeded.');
  })
);

// Explicit JSON 404 for unmatched /api/* endpoints (never fall through to SPA HTML)
router.use((_req, res) => {
  sendErr(res, 'API endpoint not found.', 404);
});

// Centralized API Error Handler
router.use((err, _req, res, _next) => {
  console.error('[API Error]', err);
  res.status(500).json({
    success: false,
    data: null,
    message: 'Internal server error. Please try again.',
  });
});

export default router;
