import { Hono } from 'hono';
import { z } from 'zod';
import { hashPassword, verifyPassword, sha256Hex } from '../utils/crypto.js';
import { sanitizeText } from '../services/orderCalculator.js';
import {
  normalizeIdentifier,
  maskIdentifier,
  generateSixDigitOtp,
  hashOtp,
  evaluateResendPolicy,
  evaluateOtpVerification,
} from '../services/otpLogic.js';
import { dispatchOtp, verifyCaptchaToken } from '../services/otpService.js';
import { logAudit } from '../services/orderPlacement.js';
import {
  authenticate,
  issueAuthSession,
  rotateAuthSession,
  clearAuthCookies,
  extractBearerOrCookieToken,
  getRefreshTokenFromCookie,
  verifyAccessToken,
  sanitizeAuthUser,
  sendOk,
  sendErr,
} from '../middleware/auth.js';
import {
  createRateLimiter,
  extractClientIp,
  recordIpFailure,
  getIpFailureCount,
  clearIpFailures,
} from '../middleware/rateLimit.js';

const authRoutes = new Hono();

async function getNormalizedOtpKey(c) {
  const body = await c.req.raw.clone().json().catch(() => ({}));
  const channel =
    body.channel ||
    (typeof body.identifier === 'string' && body.identifier.includes('@') ? 'email' : 'mobile');
  const norm = normalizeIdentifier(channel, body.identifier || '', body.countryCode || '+91');
  if (norm.valid) return norm.identifier;
  return `raw:${String(body.identifier || '').trim().toLowerCase() || extractClientIp(c)}`;
}

const loginLimiter = createRateLimiter({
  prefix: 'login',
  max: 60,
  windowMs: 10 * 60 * 1000,
  message: 'Too many login attempts. Please wait a few minutes.',
});

const otpRequestIpLimiter = createRateLimiter({
  prefix: 'otp-req-ip',
  max: 10,
  windowMs: 60 * 60 * 1000,
  message: 'Too many OTP requests from this IP address. Please try again later.',
});

const otpRequestIdentifierLimiter = createRateLimiter({
  prefix: 'otp-req-id',
  max: 3,
  windowMs: 15 * 60 * 1000,
  keyFn: getNormalizedOtpKey,
  message: 'Maximum 3 OTP requests per 15 minutes reached for this mobile/email. Please wait.',
});

const otpVerifyIpLimiter = createRateLimiter({
  prefix: 'otp-ver-ip',
  max: 30,
  windowMs: 15 * 60 * 1000,
  message: 'Too many verification attempts from this IP. Please wait before retrying.',
});

const otpVerifyIdentifierLimiter = createRateLimiter({
  prefix: 'otp-ver-id',
  max: 10,
  windowMs: 15 * 60 * 1000,
  keyFn: getNormalizedOtpKey,
  message: 'Too many verification attempts for this mobile/email. Please request a new code later.',
});

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

authRoutes.post('/otp/request', otpRequestIpLimiter, otpRequestIdentifierLimiter, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = otpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return sendErr(c, 'Please enter a valid mobile number or email address.', 400);
  }

  const cfg = c.get('cfg');
  const repo = c.get('repo');
  const { channel, identifier, countryCode, purpose, name, captchaToken } = parsed.data;
  const normalized = normalizeIdentifier(channel, identifier, countryCode || '+91');
  if (!normalized.valid) {
    return sendErr(c, normalized.error, 400);
  }

  const cleanName = typeof name === 'string' ? sanitizeText(name) : '';
  if (purpose === 'signup' && cleanName.length < 2) {
    return sendErr(c, 'Please enter your full name (at least 2 characters).', 400);
  }

  const clientIp = extractClientIp(c);
  if (cfg.captchaSecret && (await getIpFailureCount(c.env, clientIp)) >= 2) {
    const captchaCheck = await verifyCaptchaToken(cfg, captchaToken, clientIp);
    if (!captchaCheck.valid) {
      return sendErr(c, captchaCheck.error || 'CAPTCHA verification required.', 400, {
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
    c.header('Retry-After', String(resendPolicy.retryAfterSeconds));
    return sendErr(c, msg, 429, {
      code: resendPolicy.code,
      retryAfterSeconds: resendPolicy.retryAfterSeconds,
    });
  }

  await repo.invalidateActiveOtps(normalized.identifier);

  const existingUser = await repo.findUserByIdentifier(channel, normalized.identifier);
  const otpCode = cfg.demoMode ? cfg.demoOtp : generateSixDigitOtp();
  const otpHash = await hashOtp(normalized.identifier, otpCode, cfg.otpHashSecret);
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + cfg.otpExpiryMinutes * 60 * 1000).toISOString();

  // Create challenge for signups and registered active accounts; keep response identical to prevent enumeration
  if (purpose === 'signup' || (existingUser && existingUser.isActive)) {
    await repo.createOtpChallenge({
      identifier: normalized.identifier,
      channel,
      purpose,
      pendingName: purpose === 'signup' ? cleanName : null,
      otpHash,
      attempts: 0,
      maxAttempts: cfg.otpMaxAttempts,
      resendCount: resendPolicy.nextResendCount,
      windowStartedAt: resendPolicy.windowStartedAt,
      lastSentAt: nowIso,
      expiresAt,
      invalidated: false,
      consumedAt: null,
      ip: clientIp,
    });

    await dispatchOtp(cfg, { channel, identifier: normalized.identifier, otp: otpCode });
  }

  const masked = maskIdentifier(channel, normalized.identifier);
  await logAudit(
    repo,
    c.get('user'),
    'OTP_REQUEST',
    'OtpChallenge',
    null,
    `OTP requested (${purpose}, ${channel}) for ${masked} from IP ${clientIp}`
  );

  return sendOk(
    c,
    {
      channel,
      identifier: normalized.identifier,
      maskedIdentifier: masked,
      purpose,
      expiresInSeconds: cfg.otpExpiryMinutes * 60,
      resendCooldownSeconds: 30,
      resendsRemaining: Math.max(0, 3 - resendPolicy.nextResendCount),
      ...(cfg.demoMode ? { demoOtp: cfg.demoOtp } : {}),
    },
    'If your details are eligible, a 6-digit verification code has been sent.'
  );
});

authRoutes.post('/otp/verify', otpVerifyIpLimiter, otpVerifyIdentifierLimiter, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return sendErr(c, 'Please enter a valid identifier and 6-digit numeric OTP.', 400);
  }

  const cfg = c.get('cfg');
  const repo = c.get('repo');
  const inferredChannel =
    parsed.data.channel || (parsed.data.identifier.includes('@') ? 'email' : 'mobile');
  const normalized = normalizeIdentifier(
    inferredChannel,
    parsed.data.identifier,
    parsed.data.countryCode || '+91'
  );
  if (!normalized.valid) {
    return sendErr(c, normalized.error, 400);
  }

  const clientIp = extractClientIp(c);
  const challenge = await repo.findActiveOtpChallenge(normalized.identifier);
  const verdict = await evaluateOtpVerification(
    challenge,
    parsed.data.otp,
    cfg.otpHashSecret,
    Date.now(),
    cfg.otpMaxAttempts
  );

  if (!verdict.valid) {
    const failures = await recordIpFailure(c.env, clientIp);
    if (challenge) {
      await repo.updateOtpChallenge(challenge.id, {
        ...(typeof verdict.nextAttempts === 'number' ? { attempts: verdict.nextAttempts } : {}),
        ...(verdict.shouldInvalidate ? { invalidated: true } : {}),
      });
    }

    const captchaRequired = Boolean(cfg.captchaSecret) && failures >= 2;
    if (verdict.reason === 'MAX_ATTEMPTS') {
      return sendErr(
        c,
        'Maximum wrong OTP attempts reached. This code has been invalidated; please request a new one.',
        401,
        { code: 'OTP_LOCKED', captchaRequired }
      );
    }
    if (verdict.reason === 'EXPIRED') {
      return sendErr(c, 'Your verification code has expired. Please request a new one.', 401, {
        code: 'OTP_EXPIRED',
        captchaRequired,
      });
    }
    if (verdict.reason === 'WRONG_OTP') {
      return sendErr(
        c,
        `Incorrect verification code. ${verdict.attemptsRemaining} attempt(s) remaining.`,
        401,
        { code: 'WRONG_OTP', attemptsRemaining: verdict.attemptsRemaining, captchaRequired }
      );
    }
    return sendErr(c, 'Invalid or expired verification code. Please request a new one.', 401, {
      code: 'NO_ACTIVE_OTP',
      captchaRequired,
    });
  }

  const nowIso = new Date().toISOString();
  await repo.updateOtpChallenge(challenge.id, { consumedAt: nowIso });
  await clearIpFailures(c.env, clientIp);

  const purpose = parsed.data.purpose || challenge.purpose || 'login';
  const existingUser = await repo.findUserByIdentifier(inferredChannel, normalized.identifier);

  let user = existingUser;
  if (purpose === 'signup') {
    if (existingUser) {
      return sendErr(
        c,
        'An account already exists with this mobile or email. Please log in instead.',
        409,
        { code: 'ACCOUNT_EXISTS' }
      );
    }
    const customerName = sanitizeText(parsed.data.name || challenge.pendingName || '');
    if (customerName.length < 2) {
      return sendErr(c, 'Please enter your full name (at least 2 characters).', 400);
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
      repo,
      c.get('user'),
      'CUSTOMER_SIGNUP',
      'User',
      user.id,
      `New customer verified via ${inferredChannel} (${maskIdentifier(inferredChannel, normalized.identifier)})`
    );
  } else {
    if (!existingUser || !existingUser.isActive) {
      return sendErr(c, 'No active account found for this identifier. Please sign up first.', 401);
    }
    if (existingUser.role !== 'customer') {
      return sendErr(c, 'Staff accounts must sign in with email and password.', 403);
    }
    user = await repo.updateUser(existingUser.id, { lastLoginAt: nowIso });
  }

  const { accessToken } = await issueAuthSession(c, user, repo, cfg);
  return sendOk(
    c,
    {
      accessToken,
      user: sanitizeAuthUser(user),
    },
    purpose === 'signup' ? 'Account verified and created.' : 'Signed in.'
  );
});

async function handleStaffPasswordLogin(c) {
  const body = await c.req.json().catch(() => null);
  const parsed = staffPasswordLoginSchema.safeParse(body);
  if (!parsed.success) {
    return sendErr(c, 'Please enter a valid email and password.', 400);
  }

  const cfg = c.get('cfg');
  const repo = c.get('repo');
  const user = await repo.findUserByEmail(parsed.data.email);
  if (!user || !user.isActive) {
    return sendErr(c, 'Invalid email or password.', 401);
  }
  if (!['admin', 'manager', 'waiter', 'kitchen'].includes(user.role)) {
    return sendErr(c, 'Customers sign in using Mobile or Email OTP.', 403);
  }
  if (!user.passwordHash) {
    return sendErr(c, 'Password login is not configured for this account.', 401);
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return sendErr(c, 'Invalid email or password.', 401);
  }

  const updated = await repo.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  const { accessToken } = await issueAuthSession(c, updated || user, repo, cfg);

  return sendOk(c, {
    accessToken,
    user: sanitizeAuthUser(updated || user),
  });
}

authRoutes.post('/password/login', loginLimiter, handleStaffPasswordLogin);
authRoutes.post('/login', loginLimiter, handleStaffPasswordLogin);

authRoutes.post('/set-password', authenticate, async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({ password: z.string().min(6).max(64) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return sendErr(c, 'Password must be at least 6 characters.', 400);
  }

  const repo = c.get('repo');
  const user = c.get('user');
  const passwordHash = await hashPassword(parsed.data.password);
  await repo.updateUser(user.userId, { passwordHash });
  return sendOk(c, { passwordSet: true }, 'Password saved.');
});

authRoutes.post('/demo-login', loginLimiter, async (c) => {
  const cfg = c.get('cfg');
  if (!cfg.demoMode) {
    return sendErr(c, 'Demo login is disabled when DEMO_MODE is false.', 403);
  }

  const body = await c.req.json().catch(() => null);
  const schema = z.object({ role: z.enum(['admin', 'manager', 'waiter', 'kitchen', 'customer']) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return sendErr(c, 'Invalid demo role requested.', 400);
  }

  const emailMap = {
    admin: 'admin@demo.com',
    manager: 'manager@demo.com',
    waiter: 'waiter@demo.com',
    kitchen: 'kitchen@demo.com',
    customer: 'customer@demo.com',
  };

  const repo = c.get('repo');
  const user = await repo.findUserByEmail(emailMap[parsed.data.role]);
  if (!user || !user.isActive) {
    return sendErr(c, 'Demo account not found. Please run seed first.', 404);
  }

  const updated = await repo.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  const { accessToken } = await issueAuthSession(c, updated || user, repo, cfg);

  return sendOk(c, {
    accessToken,
    user: sanitizeAuthUser(updated || user),
  });
});

authRoutes.post('/refresh', async (c) => {
  const cfg = c.get('cfg');
  const repo = c.get('repo');
  const refreshToken = getRefreshTokenFromCookie(c);
  const result = await rotateAuthSession(c, refreshToken, repo, cfg);
  if (!result.ok) {
    clearAuthCookies(c);
    return sendErr(c, result.error, 401);
  }
  return sendOk(c, {
    accessToken: result.accessToken,
    user: sanitizeAuthUser(result.user),
  });
});

authRoutes.post('/logout', async (c) => {
  const repo = c.get('repo');
  const refreshToken = getRefreshTokenFromCookie(c);
  if (refreshToken) {
    const tokenHash = await sha256Hex(refreshToken);
    await repo.revokeRefreshTokenByHash(tokenHash);
  }
  clearAuthCookies(c);
  return sendOk(c, { loggedOut: true }, 'Signed out.');
});

authRoutes.get('/session', async (c) => {
  const cfg = c.get('cfg');
  const repo = c.get('repo');
  const token = extractBearerOrCookieToken(c);

  if (token) {
    try {
      const payload = await verifyAccessToken(token, cfg);
      const user = await repo.findUserById(String(payload.userId));
      if (user && user.isActive) {
        return sendOk(c, sanitizeAuthUser(user));
      }
    } catch {
      // access token expired; attempt silent refresh below
    }
  }

  const refreshToken = getRefreshTokenFromCookie(c);
  if (!refreshToken) return sendOk(c, null);

  const rotated = await rotateAuthSession(c, refreshToken, repo, cfg);
  if (!rotated.ok) {
    clearAuthCookies(c);
    return sendOk(c, null);
  }
  return sendOk(c, sanitizeAuthUser(rotated.user));
});

authRoutes.get('/me', authenticate, async (c) => {
  const repo = c.get('repo');
  const authUser = c.get('user');
  const user = await repo.findUserById(authUser.userId);
  if (!user) return sendErr(c, 'User not found.', 404);
  return sendOk(c, sanitizeAuthUser(user));
});

export { authRoutes };
