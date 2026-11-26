import { sendErr } from './auth.js';

function getHubStub(env) {
  const id = env.HUB.idFromName('global-hub');
  return env.HUB.get(id);
}

export function extractClientIp(c) {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return '127.0.0.1';
}

export async function checkRateLimit(env, { key, max, windowMs }) {
  try {
    const stub = getHubStub(env);
    const res = await stub.fetch('https://hub.internal/ratelimit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, max, windowMs }),
    });
    if (!res.ok) return { allowed: true, retryAfterSeconds: 0 };
    return await res.json();
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export function createRateLimiter({
  prefix,
  max,
  windowMs,
  message = 'Too many requests. Please try again later.',
  keyFn,
  skip,
}) {
  return async (c, next) => {
    if (typeof skip === 'function' && skip(c)) {
      return next();
    }

    let suffix = extractClientIp(c);
    if (typeof keyFn === 'function') {
      try {
        const computed = await keyFn(c);
        if (computed) suffix = computed;
      } catch {
        // fallback to client IP
      }
    }

    const result = await checkRateLimit(c.env, {
      key: `${prefix}:${suffix}`,
      max,
      windowMs,
    });

    if (!result.allowed) {
      if (result.retryAfterSeconds > 0) {
        c.header('Retry-After', String(result.retryAfterSeconds));
      }
      return sendErr(c, message, 429, {
        retryAfterSeconds: result.retryAfterSeconds || 1,
      });
    }

    return next();
  };
}

export async function recordIpFailure(env, ip) {
  try {
    const stub = getHubStub(env);
    const res = await stub.fetch('https://hub.internal/ip-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record', ip }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.count || 0);
  } catch {
    return 0;
  }
}

export async function getIpFailureCount(env, ip) {
  try {
    const stub = getHubStub(env);
    const res = await stub.fetch('https://hub.internal/ip-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', ip }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.count || 0);
  } catch {
    return 0;
  }
}

export async function clearIpFailures(env, ip) {
  try {
    const stub = getHubStub(env);
    await stub.fetch('https://hub.internal/ip-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', ip }),
    });
  } catch {
    // ignore cleanup failures
  }
}
