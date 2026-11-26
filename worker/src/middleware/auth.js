import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { generateId, sha256Hex } from '../utils/crypto.js';

export const ACCESS_COOKIE = 'passline_access';
export const REFRESH_COOKIE = 'passline_refresh';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const textEncoder = new TextEncoder();

function secretKey(secret) {
  return textEncoder.encode(String(secret));
}

function isSecureCookieRequest(c) {
  const cfg = c.get('cfg');
  if (cfg?.isProd) return true;
  try {
    const url = new URL(c.req.url);
    if (url.protocol === 'https:') return true;
  } catch {
    // ignore malformed URL
  }
  const forwardedProto = c.req.header('x-forwarded-proto') || '';
  return forwardedProto.toLowerCase().includes('https');
}

export function sanitizeAuthUser(user) {
  if (!user) return null;
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

export function sendOk(c, data, message = 'OK', status = 200) {
  return c.json({ success: true, data, message }, status);
}

export function sendErr(c, message, status = 400, data = null) {
  return c.json({ success: false, data, message }, status);
}

export async function signAccessToken(user, cfg) {
  return new SignJWT({
    userId: user.id,
    role: user.role,
    email: user.email || null,
    mobile: user.mobile || null,
    name: user.name,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secretKey(cfg.jwtSecret));
}

export async function signRefreshToken(user, cfg) {
  return new SignJWT({
    userId: user.id,
    role: user.role,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(generateId())
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(secretKey(cfg.jwtSecret));
}

export async function verifyAccessToken(token, cfg) {
  const { payload } = await jwtVerify(token, secretKey(cfg.jwtSecret), {
    algorithms: ['HS256'],
  });
  if (payload.type !== 'access' || !payload.userId) {
    throw new Error('Invalid access token type');
  }
  return payload;
}

export async function verifyRefreshToken(token, cfg) {
  const { payload } = await jwtVerify(token, secretKey(cfg.jwtSecret), {
    algorithms: ['HS256'],
  });
  if (payload.type !== 'refresh' || !payload.userId) {
    throw new Error('Invalid refresh token type');
  }
  return payload;
}

export function setAuthCookies(c, accessToken, refreshToken) {
  const secure = isSecureCookieRequest(c);
  setCookie(c, ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: ACCESS_TTL_SECONDS,
  });
  setCookie(c, REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export function clearAuthCookies(c) {
  const secure = isSecureCookieRequest(c);
  deleteCookie(c, ACCESS_COOKIE, { path: '/', secure, sameSite: 'Lax' });
  deleteCookie(c, REFRESH_COOKIE, { path: '/', secure, sameSite: 'Lax' });
}

export async function issueAuthSession(c, user, repo, cfg) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user, cfg),
    signRefreshToken(user, cfg),
  ]);
  const tokenHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
  await repo.storeRefreshToken({ userId: user.id, tokenHash, expiresAt });
  setAuthCookies(c, accessToken, refreshToken);
  return { accessToken, refreshToken };
}

export async function rotateAuthSession(c, rawRefreshToken, repo, cfg) {
  if (!rawRefreshToken) {
    return { ok: false, error: 'Refresh token missing.' };
  }

  let payload;
  try {
    payload = await verifyRefreshToken(rawRefreshToken, cfg);
  } catch {
    return { ok: false, error: 'Invalid refresh token.' };
  }

  const oldHash = await sha256Hex(rawRefreshToken);
  const stored = await repo.findRefreshTokenByHash(oldHash);
  if (!stored) {
    return { ok: false, error: 'Refresh session not found.' };
  }
  if (stored.revoked_at) {
    // Possible refresh token reuse — revoke all active sessions for this user
    await repo.revokeAllUserRefreshTokens(stored.user_id);
    return { ok: false, error: 'Refresh token has been revoked.' };
  }
  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: 'Refresh token expired.' };
  }

  const user = await repo.findUserById(String(payload.userId));
  if (!user || !user.isActive) {
    await repo.revokeRefreshTokenByHash(oldHash);
    return { ok: false, error: 'User no longer active.' };
  }

  const [accessToken, nextRefreshToken] = await Promise.all([
    signAccessToken(user, cfg),
    signRefreshToken(user, cfg),
  ]);
  const nextHash = await sha256Hex(nextRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();

  await repo.rotateRefreshToken(oldHash, {
    userId: user.id,
    newTokenHash: nextHash,
    expiresAt,
  });

  setAuthCookies(c, accessToken, nextRefreshToken);
  return { ok: true, accessToken, user };
}

export function extractBearerOrCookieToken(c) {
  const authHeader = c.req.header('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieToken = getCookie(c, ACCESS_COOKIE);
  return cookieToken || null;
}

export function getRefreshTokenFromCookie(c) {
  return getCookie(c, REFRESH_COOKIE) || null;
}

/**
 * Verifies Origin header on state-changing requests authenticated via cookies.
 */
export async function verifySameOriginMutation(c, next) {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const origin = c.req.header('origin');
  if (!origin) {
    return next();
  }

  const cfg = c.get('cfg');
  let requestOrigin = '';
  try {
    requestOrigin = new URL(c.req.url).origin;
  } catch {
    requestOrigin = '';
  }

  const allowedOrigins = new Set([requestOrigin, cfg?.appOrigin].filter(Boolean));
  if (!allowedOrigins.has(origin)) {
    return sendErr(c, 'Cross-origin request blocked.', 403);
  }
  return next();
}

export async function authenticate(c, next) {
  const token = extractBearerOrCookieToken(c);
  if (!token) {
    return sendErr(c, 'Authentication required.', 401);
  }

  const cfg = c.get('cfg');
  const repo = c.get('repo');
  try {
    const payload = await verifyAccessToken(token, cfg);
    const user = await repo.findUserById(String(payload.userId));
    if (!user || !user.isActive) {
      return sendErr(c, 'Account is inactive or no longer exists.', 401);
    }
    c.set('user', {
      userId: user.id,
      role: user.role,
      email: user.email,
      mobile: user.mobile,
      name: user.name,
    });
    return next();
  } catch {
    return sendErr(c, 'Invalid or expired session token.', 401);
  }
}

export async function optionalAuthenticate(c, next) {
  const token = extractBearerOrCookieToken(c);
  if (token) {
    const cfg = c.get('cfg');
    const repo = c.get('repo');
    try {
      const payload = await verifyAccessToken(token, cfg);
      const user = await repo.findUserById(String(payload.userId));
      if (user && user.isActive) {
        c.set('user', {
          userId: user.id,
          role: user.role,
          email: user.email,
          mobile: user.mobile,
          name: user.name,
        });
      }
    } catch {
      // ignore invalid optional token
    }
  }
  return next();
}

export function requireRole(...allowedRoles) {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return sendErr(c, 'Authentication required.', 401);
    }
    if (!allowedRoles.includes(user.role)) {
      return sendErr(c, 'Insufficient permissions for this action.', 403);
    }
    return next();
  };
}
