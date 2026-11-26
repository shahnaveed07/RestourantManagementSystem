import { hmacSha256Hex, timingSafeEqualStrings } from '../utils/crypto.js';

export const COUNTRY_CODES = [
  { code: '+91', label: 'India (+91)' },
  { code: '+1', label: 'US / Canada (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+65', label: 'Singapore (+65)' },
  { code: '+971', label: 'UAE (+971)' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeMobileIdentifier(rawInput, countryCode = '+91') {
  const cleanCode = String(countryCode || '+91').trim();
  if (!/^\+\d{1,4}$/.test(cleanCode)) {
    return { valid: false, error: 'Please select a valid country code.' };
  }

  const stripped = String(rawInput || '').replace(/[\s\-().]/g, '');
  let localDigits = stripped;

  if (stripped.startsWith('+')) {
    const matchedCode = COUNTRY_CODES.find((c) => stripped.startsWith(c.code));
    if (matchedCode) {
      localDigits = stripped.slice(matchedCode.code.length);
      if (!/^\d{10}$/.test(localDigits)) {
        return { valid: false, error: 'Enter a valid 10-digit mobile number.' };
      }
      return {
        valid: true,
        channel: 'mobile',
        countryCode: matchedCode.code,
        localNumber: localDigits,
        identifier: `${matchedCode.code}${localDigits}`,
      };
    }
    return { valid: false, error: 'Enter a valid 10-digit mobile number with country code.' };
  }

  if (!/^\d{10}$/.test(localDigits)) {
    return { valid: false, error: 'Enter a valid 10-digit mobile number.' };
  }

  return {
    valid: true,
    channel: 'mobile',
    countryCode: cleanCode,
    localNumber: localDigits,
    identifier: `${cleanCode}${localDigits}`,
  };
}

export function normalizeEmailIdentifier(rawEmail) {
  const clean = String(rawEmail || '').trim().toLowerCase();
  if (!clean || !EMAIL_REGEX.test(clean)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return {
    valid: true,
    channel: 'email',
    identifier: clean,
  };
}

export function normalizeIdentifier(channel, identifier, countryCode = '+91') {
  if (channel === 'mobile') {
    return normalizeMobileIdentifier(identifier, countryCode);
  }
  if (channel === 'email') {
    return normalizeEmailIdentifier(identifier);
  }
  return { valid: false, error: 'Authentication channel must be mobile or email.' };
}

export function maskIdentifier(channel, identifier) {
  const value = String(identifier || '').trim();
  if (!value) return '***';

  if (channel === 'mobile' || value.startsWith('+') || /^\d+$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `******${last4}`;
  }

  const [local, domain] = value.split('@');
  if (!domain) return '***';
  const prefix = local.slice(0, 1) || '*';
  return `${prefix}***@${domain}`;
}

export function generateSixDigitOtp() {
  // Rejection sampling over Uint32 for uniform [100000, 999999]
  const range = 900000;
  const maxUnbiased = Math.floor(0xffffffff / range) * range;
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= maxUnbiased);
  return String(100000 + (value % range));
}

export async function hashOtp(identifier, otp, secret) {
  return hmacSha256Hex(String(secret), `${String(identifier)}:${String(otp)}`);
}

export async function verifyOtpHash(identifier, otp, storedHash, secret) {
  if (!storedHash || !otp || !/^\d{6}$/.test(String(otp))) return false;
  const candidate = await hashOtp(identifier, String(otp), secret);
  return timingSafeEqualStrings(candidate, String(storedHash));
}

export function evaluateResendPolicy(
  latestChallenge,
  nowMs = Date.now(),
  { cooldownSeconds = 30, maxResends = 3, windowMinutes = 15 } = {}
) {
  if (!latestChallenge) {
    return {
      allowed: true,
      nextResendCount: 0,
      windowStartedAt: new Date(nowMs).toISOString(),
    };
  }

  const lastSentMs = new Date(latestChallenge.lastSentAt || latestChallenge.createdAt).getTime();
  const elapsedSeconds = Math.floor((nowMs - lastSentMs) / 1000);
  if (elapsedSeconds < cooldownSeconds) {
    return {
      allowed: false,
      code: 'COOLDOWN',
      retryAfterSeconds: Math.max(1, cooldownSeconds - elapsedSeconds),
    };
  }

  const windowStartMs = new Date(
    latestChallenge.windowStartedAt || latestChallenge.createdAt
  ).getTime();
  const windowDurationMs = windowMinutes * 60 * 1000;

  if (nowMs - windowStartMs < windowDurationMs) {
    const currentResends = Number(latestChallenge.resendCount || 0);
    if (currentResends >= maxResends) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowDurationMs - nowMs) / 1000));
      return {
        allowed: false,
        code: 'MAX_RESENDS',
        retryAfterSeconds,
      };
    }
    return {
      allowed: true,
      nextResendCount: currentResends + 1,
      windowStartedAt: new Date(windowStartMs).toISOString(),
    };
  }

  return {
    allowed: true,
    nextResendCount: 0,
    windowStartedAt: new Date(nowMs).toISOString(),
  };
}

export async function evaluateOtpVerification(
  challenge,
  submittedOtp,
  secret,
  nowMs = Date.now(),
  maxAttempts = 5
) {
  if (!challenge || challenge.invalidated || challenge.consumedAt) {
    return { valid: false, reason: 'NO_ACTIVE_OTP', shouldInvalidate: false };
  }

  const expiresMs = new Date(challenge.expiresAt).getTime();
  if (Number.isNaN(expiresMs) || nowMs > expiresMs) {
    return { valid: false, reason: 'EXPIRED', shouldInvalidate: true };
  }

  const currentAttempts = Number(challenge.attempts || 0);
  if (currentAttempts >= maxAttempts) {
    return { valid: false, reason: 'MAX_ATTEMPTS', shouldInvalidate: true, attemptsRemaining: 0 };
  }

  const matched = await verifyOtpHash(
    challenge.identifier,
    String(submittedOtp || '').trim(),
    challenge.otpHash,
    secret
  );
  if (matched) {
    return { valid: true };
  }

  const nextAttempts = currentAttempts + 1;
  const locked = nextAttempts >= maxAttempts;
  return {
    valid: false,
    reason: locked ? 'MAX_ATTEMPTS' : 'WRONG_OTP',
    nextAttempts,
    attemptsRemaining: Math.max(0, maxAttempts - nextAttempts),
    shouldInvalidate: locked,
  };
}
