import { randomHex } from '../utils/crypto.js';

let devFallbackJwtSecret = null;
let devFallbackOtpSecret = null;

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function assertSafeDemoConfig(env = {}) {
  const environment = String(env.ENVIRONMENT || 'development').trim().toLowerCase();
  const demoMode = parseBool(env.DEMO_MODE, false);
  if (environment === 'production' && demoMode) {
    throw new Error(
      'SECURITY MISCONFIGURATION: DEMO_MODE=true is forbidden when ENVIRONMENT=production. Refusing to handle requests.'
    );
  }
}

export function getConfig(env = {}) {
  assertSafeDemoConfig(env);

  const environment = String(env.ENVIRONMENT || 'development').trim().toLowerCase();
  const isProd = environment === 'production';
  const demoMode = parseBool(env.DEMO_MODE, false);

  let jwtSecret = String(env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    if (isProd) {
      throw new Error('SECURITY MISCONFIGURATION: JWT_SECRET secret is required in production.');
    }
    if (!devFallbackJwtSecret) devFallbackJwtSecret = randomHex(32);
    jwtSecret = devFallbackJwtSecret;
  }

  let otpHashSecret = String(env.OTP_HASH_SECRET || env.OTP_SECRET || '').trim();
  if (!otpHashSecret) {
    if (isProd) {
      throw new Error('SECURITY MISCONFIGURATION: OTP_HASH_SECRET secret is required in production.');
    }
    if (!devFallbackOtpSecret) devFallbackOtpSecret = randomHex(32);
    otpHashSecret = devFallbackOtpSecret;
  }

  return {
    environment,
    isProd,
    demoMode,
    demoOtp: String(env.DEMO_OTP || '123456').trim(),
    jwtSecret,
    otpHashSecret,
    otpExpiryMinutes: Math.max(1, Math.min(30, parseNumber(env.OTP_EXPIRY_MINUTES, 5))),
    otpMaxAttempts: Math.max(1, Math.min(10, parseNumber(env.OTP_MAX_ATTEMPTS, 5))),
    restaurantName: String(env.RESTAURANT_NAME || 'PassLine Restaurant').trim(),
    taxRate: Math.max(0, Math.min(0.5, parseNumber(env.TAX_RATE, 0.08))),
    appOrigin: String(env.APP_ORIGIN || 'http://localhost:3000').trim().replace(/\/+$/, ''),
    otpSmsProvider: String(env.OTP_SMS_PROVIDER || 'twilio').trim().toLowerCase(),
    twilioAccountSid: String(env.TWILIO_ACCOUNT_SID || '').trim(),
    twilioAuthToken: String(env.TWILIO_AUTH_TOKEN || '').trim(),
    twilioFromNumber: String(env.TWILIO_FROM_NUMBER || '').trim(),
    msg91AuthKey: String(env.MSG91_AUTH_KEY || '').trim(),
    msg91TemplateId: String(env.MSG91_TEMPLATE_ID || '').trim(),
    msg91SenderId: String(env.MSG91_SENDER_ID || 'PASSLN').trim(),
    emailProvider: String(env.EMAIL_PROVIDER || 'resend').trim().toLowerCase(),
    emailApiKey: String(env.EMAIL_API_KEY || '').trim(),
    emailFrom: String(env.EMAIL_FROM || 'no-reply@passlinerestaurant.local').trim(),
    captchaProvider: String(env.CAPTCHA_PROVIDER || 'turnstile').trim().toLowerCase(),
    captchaSiteKey: String(env.CAPTCHA_SITE_KEY || '').trim(),
    captchaSecret: String(env.CAPTCHA_SECRET || '').trim(),
  };
}
