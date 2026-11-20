import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { repo } from '../db/repository.js';

export function signAccessToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '12h' });
}

export function signRefreshToken(user) {
  return jwt.sign({ userId: user.id }, env.jwtRefreshSecret, { expiresIn: '7d' });
}

export function setAuthCookies(res, accessToken, refreshToken) {
  const isProd = env.nodeEnv === 'production';
  res.cookie('passline_access', accessToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.cookie('passline_refresh', refreshToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie('passline_access');
  res.clearCookie('passline_refresh');
}

export function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.passline_access;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, data: null, message: 'Authentication required.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await repo.findUserById(decoded.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, data: null, message: 'Account is inactive or not found.' });
      return;
    }
    req.user = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ success: false, data: null, message: 'Session expired. Please sign in again.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ success: false, data: null, message: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        data: null,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

export function sendOk(res, data, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, data, message });
}

export function sendErr(res, message, status = 400, data = null) {
  return res.status(status).json({ success: false, data, message });
}
