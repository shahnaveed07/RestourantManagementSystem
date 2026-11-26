import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, sha256Hex, timingSafeEqualStrings } from './crypto.js';

test('hashPassword uses PBKDF2-SHA256 with >= 100000 iterations and unique random salt', async () => {
  const h1 = await hashPassword('Admin@123');
  const h2 = await hashPassword('Admin@123');

  assert.match(h1, /^pbkdf2_sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.notEqual(h1, h2);
  assert.equal(await verifyPassword('Admin@123', h1), true);
  assert.equal(await verifyPassword('WrongPass', h1), false);
  assert.equal(await verifyPassword('Admin@123', 'invalid-hash'), false);
});

test('sha256Hex and timingSafeEqualStrings work deterministically', async () => {
  const d1 = await sha256Hex('passline-token');
  const d2 = await sha256Hex('passline-token');
  const d3 = await sha256Hex('other-token');

  assert.equal(d1.length, 64);
  assert.equal(timingSafeEqualStrings(d1, d2), true);
  assert.equal(timingSafeEqualStrings(d1, d3), false);
});
