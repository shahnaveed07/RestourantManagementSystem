import dotenv from 'dotenv';

dotenv.config();

export function assertSafeDemoConfig(nodeEnv, demoMode) {
  if (String(nodeEnv).toLowerCase() === 'production' && Boolean(demoMode)) {
    throw new Error(
      'SECURITY ERROR: Refusing to start with DEMO_MODE=true while NODE_ENV=production. Set DEMO_MODE=false in production.'
    );
  }
}

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: (process.env.MONGODB_URI || '').trim(),
  jwtSecret: process.env.JWT_SECRET || 'passline_dev_access_secret_change_in_prod_928374',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'passline_dev_refresh_secret_change_in_prod_514233',
  otpSecret: process.env.OTP_SECRET || process.env.JWT_SECRET || 'passline_dev_otp_hmac_secret_771920',
  demoMode: process.env.DEMO_MODE !== 'false',
  demoOtp: String(process.env.DEMO_OTP || '123456').trim(),
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 5),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
  otpSmsProvider: (process.env.OTP_SMS_PROVIDER || 'twilio').trim().toLowerCase(),
  twilioAccountSid: (process.env.TWILIO_ACCOUNT_SID || '').trim(),
  twilioAuthToken: (process.env.TWILIO_AUTH_TOKEN || '').trim(),
  twilioFromNumber: (process.env.TWILIO_FROM_NUMBER || '').trim(),
  msg91AuthKey: (process.env.MSG91_AUTH_KEY || '').trim(),
  msg91TemplateId: (process.env.MSG91_TEMPLATE_ID || '').trim(),
  msg91SenderId: (process.env.MSG91_SENDER_ID || '').trim(),
  smtpHost: (process.env.SMTP_HOST || '').trim(),
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: (process.env.SMTP_USER || '').trim(),
  smtpPass: (process.env.SMTP_PASS || '').trim(),
  smtpFrom: (process.env.SMTP_FROM || 'no-reply@lindenandrye.local').trim(),
  captchaProvider: (process.env.CAPTCHA_PROVIDER || 'turnstile').trim().toLowerCase(),
  captchaSiteKey: (process.env.CAPTCHA_SITE_KEY || '').trim(),
  captchaSecret: (process.env.CAPTCHA_SECRET || '').trim(),
  restaurantName: process.env.RESTAURANT_NAME || 'Linden & Rye',
  taxRate: Number(process.env.TAX_RATE || 0.08),
  corsOrigin: (process.env.CORS_ORIGIN || '').trim(),
  appUrl: (process.env.APP_URL || '').trim(),
};
