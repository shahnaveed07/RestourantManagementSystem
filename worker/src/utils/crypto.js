const PBKDF2_PREFIX = 'pbkdf2_sha256';
const DEFAULT_PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

const textEncoder = new TextEncoder();

export function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex) {
  const clean = String(hex || '').trim();
  if (clean.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function generateId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  }
  return randomHex(12);
}

export function timingSafeEqualBytes(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function timingSafeEqualStrings(a, b) {
  const aBytes = textEncoder.encode(String(a || ''));
  const bBytes = textEncoder.encode(String(b || ''));
  return timingSafeEqualBytes(aBytes, bBytes);
}

export async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(String(input || '')));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(String(message || '')));
  return bytesToHex(new Uint8Array(signature));
}

export async function hashPassword(password, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const iter = Math.max(DEFAULT_PBKDF2_ITERATIONS, Number(iterations) || DEFAULT_PBKDF2_ITERATIONS);
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(String(password || '')),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: iter,
      hash: 'SHA-256',
    },
    keyMaterial,
    DERIVED_KEY_BITS
  );

  const hashHex = bytesToHex(new Uint8Array(derived));
  return `${PBKDF2_PREFIX}$${iter}$${bytesToHex(salt)}$${hashHex}`;
}

export async function verifyPassword(password, storedHash) {
  const raw = String(storedHash || '');
  const parts = raw.split('$');
  if (parts.length !== 4) return false;

  const [scheme, iterRaw, saltHex, expectedHex] = parts;
  if (scheme !== PBKDF2_PREFIX) return false;

  const iterations = Number(iterRaw);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
    return false;
  }

  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(expectedHex);
  if (salt.length === 0 || expected.length === 0) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(String(password || '')),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    expected.length * 8
  );

  return timingSafeEqualBytes(new Uint8Array(derived), expected);
}
