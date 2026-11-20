import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMobileIdentifier,
  normalizeEmailIdentifier,
  maskIdentifier,
  generateSixDigitOtp,
  hashOtp,
  verifyOtpHash,
  evaluateResendPolicy,
  evaluateOtpVerification,
} from './otpLogic.js';
import { assertSafeDemoConfig } from '../config/env.js';

test('normalizeMobileIdentifier validates 10-digit numbers with default +91', () => {
  const valid = normalizeMobileIdentifier('9999999991');
  assert.equal(valid.valid, true);
  assert.equal(valid.identifier, '+919999999991');
  assert.equal(valid.countryCode, '+91');

  const spaced = normalizeMobileIdentifier('99999 99992', '+1');
  assert.equal(spaced.valid, true);
  assert.equal(spaced.identifier, '+19999999992');

  const tooShort = normalizeMobileIdentifier('12345');
  assert.equal(tooShort.valid, false);

  const nonDigits = normalizeMobileIdentifier('99999abc91');
  assert.equal(nonDigits.valid, false);
});

test('normalizeEmailIdentifier normalizes to lowercase and rejects invalid emails', () => {
  const res = normalizeEmailIdentifier('  Guest@Demo.COM ');
  assert.equal(res.valid, true);
  assert.equal(res.identifier, 'guest@demo.com');

  assert.equal(normalizeEmailIdentifier('bad-email').valid, false);
});

test('maskIdentifier masks mobile and email identifiers for AuditLog', () => {
  assert.equal(maskIdentifier('mobile', '+919876544321'), '******4321');
  assert.equal(maskIdentifier('email', 'customer@demo.com'), 'c***@demo.com');
});

test('hashOtp and verifyOtpHash verify 6-digit OTPs securely via HMAC-SHA256', () => {
  const otp = generateSixDigitOtp();
  assert.match(otp, /^\d{6}$/);

  const secret = 'unit-test-secret';
  const digest = hashOtp('+919999999991', otp, secret);
  assert.notEqual(digest, otp);
  assert.equal(verifyOtpHash('+919999999991', otp, digest, secret), true);
  assert.equal(verifyOtpHash('+919999999991', '000000', digest, secret), false);
  assert.equal(verifyOtpHash('+919999999992', otp, digest, secret), false);
});

test('evaluateResendPolicy enforces 30s cooldown and max 3 resends per 15 min', () => {
  const t0 = 1_700_000_000_000;
  const first = evaluateResendPolicy(null, t0);
  assert.equal(first.allowed, true);
  assert.equal(first.nextResendCount, 0);

  const challenge = {
    createdAt: new Date(t0).toISOString(),
    lastSentAt: new Date(t0).toISOString(),
    windowStartedAt: new Date(t0).toISOString(),
    resendCount: 0,
  };

  const tooSoon = evaluateResendPolicy(challenge, t0 + 10_000);
  assert.equal(tooSoon.allowed, false);
  assert.equal(tooSoon.code, 'COOLDOWN');
  assert.equal(tooSoon.retryAfterSeconds, 20);

  const afterCooldown = evaluateResendPolicy(challenge, t0 + 31_000);
  assert.equal(afterCooldown.allowed, true);
  assert.equal(afterCooldown.nextResendCount, 1);

  const maxed = evaluateResendPolicy(
    { ...challenge, resendCount: 3, lastSentAt: new Date(t0 + 120_000).toISOString() },
    t0 + 160_000
  );
  assert.equal(maxed.allowed, false);
  assert.equal(maxed.code, 'MAX_RESENDS');

  const afterWindow = evaluateResendPolicy(
    { ...challenge, resendCount: 3, lastSentAt: new Date(t0 + 120_000).toISOString() },
    t0 + 16 * 60 * 1000
  );
  assert.equal(afterWindow.allowed, true);
  assert.equal(afterWindow.nextResendCount, 0);
});

test('evaluateOtpVerification enforces 5-minute expiry and 5 wrong-attempt lockout', () => {
  const t0 = 1_700_000_000_000;
  const secret = 'unit-test-secret';
  const challenge = {
    identifier: '+919999999992',
    otpHash: hashOtp('+919999999992', '654321', secret),
    attempts: 0,
    expiresAt: new Date(t0 + 5 * 60 * 1000).toISOString(),
    invalidated: false,
    consumedAt: null,
  };

  // Wrong attempt #1
  const wrong1 = evaluateOtpVerification(challenge, '111111', secret, t0 + 5_000, 5);
  assert.equal(wrong1.valid, false);
  assert.equal(wrong1.reason, 'WRONG_OTP');
  assert.equal(wrong1.attemptsRemaining, 4);
  assert.equal(wrong1.shouldInvalidate, false);

  // Wrong attempt #5 locks/invalidates OTP
  const wrong5 = evaluateOtpVerification({ ...challenge, attempts: 4 }, '111111', secret, t0 + 10_000, 5);
  assert.equal(wrong5.valid, false);
  assert.equal(wrong5.reason, 'MAX_ATTEMPTS');
  assert.equal(wrong5.attemptsRemaining, 0);
  assert.equal(wrong5.shouldInvalidate, true);

  // Expired after 5 minutes
  const expired = evaluateOtpVerification(challenge, '654321', secret, t0 + 5 * 60 * 1000 + 1, 5);
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, 'EXPIRED');
  assert.equal(expired.shouldInvalidate, true);

  // Valid within window
  const ok = evaluateOtpVerification(challenge, '654321', secret, t0 + 60_000, 5);
  assert.equal(ok.valid, true);
});

test('assertSafeDemoConfig refuses production startup when DEMO_MODE=true', () => {
  assert.throws(() => assertSafeDemoConfig('production', true), /DEMO_MODE=true/);
  assert.doesNotThrow(() => assertSafeDemoConfig('production', false));
  assert.doesNotThrow(() => assertSafeDemoConfig('development', true));
});
