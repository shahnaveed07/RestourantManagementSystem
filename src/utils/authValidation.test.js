import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRY_CODES,
  validateMobileInput,
  validateEmailInput,
  formatCountdown,
} from './authValidation.js';

test('validateMobileInput defaults to +91 and validates 10-digit mobile numbers', () => {
  assert.equal(COUNTRY_CODES[0].code, '+91');
  const ok = validateMobileInput('9999999991', '+91');
  assert.equal(ok.valid, true);
  assert.equal(ok.identifier, '+919999999991');

  const invalid = validateMobileInput('123456', '+91');
  assert.equal(invalid.valid, false);
});

test('validateEmailInput normalizes email to lowercase and validates format', () => {
  const ok = validateEmailInput('  Guest@Demo.COM ');
  assert.equal(ok.valid, true);
  assert.equal(ok.identifier, 'guest@demo.com');

  const bad = validateEmailInput('invalid-email');
  assert.equal(bad.valid, false);
});

test('formatCountdown formats seconds as mm:ss', () => {
  assert.equal(formatCountdown(300), '05:00');
  assert.equal(formatCountdown(30), '00:30');
  assert.equal(formatCountdown(-5), '00:00');
});
