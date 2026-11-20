import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { maskIdentifier } from './otpLogic.js';

let cachedTransporter = null;

function getMailTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return null;
  }
  cachedTransporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
  return cachedTransporter;
}

async function sendViaTwilio(toMobile, message) {
  if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioFromNumber) {
    console.info(`[OTP:SMS:Twilio-Fallback] Credentials unset; skipped live dispatch to ${maskIdentifier('mobile', toMobile)}`);
    return { delivered: false, provider: 'twilio', simulated: true };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.twilioAccountSid)}/Messages.json`;
  const authHeader = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64');
  const body = new URLSearchParams({
    To: toMobile,
    From: env.twilioFromNumber,
    Body: message,
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Twilio SMS delivery failed (${res.status}): ${errText}`);
  }
  return { delivered: true, provider: 'twilio' };
}

async function sendViaMsg91(toMobile, otp) {
  if (!env.msg91AuthKey || !env.msg91TemplateId) {
    console.info(`[OTP:SMS:MSG91-Fallback] Credentials unset; skipped live dispatch to ${maskIdentifier('mobile', toMobile)}`);
    return { delivered: false, provider: 'msg91', simulated: true };
  }

  const cleanMobile = toMobile.replace(/^\+/, '');
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: {
      authkey: env.msg91AuthKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: env.msg91TemplateId,
      sender: env.msg91SenderId || 'PASSLN',
      recipients: [
        {
          mobiles: cleanMobile,
          OTP: otp,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MSG91 SMS delivery failed (${res.status}): ${errText}`);
  }
  return { delivered: true, provider: 'msg91' };
}

async function sendSmsOtp(toMobile, otp) {
  const message = `${env.restaurantName} verification code: ${otp}. Valid for ${env.otpExpiryMinutes} minutes.`;
  if (env.otpSmsProvider === 'msg91') {
    return sendViaMsg91(toMobile, otp);
  }
  return sendViaTwilio(toMobile, message);
}

async function sendEmailOtp(toEmail, otp) {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.info(`[OTP:Email:SMTP-Fallback] SMTP unset; skipped live dispatch to ${maskIdentifier('email', toEmail)}`);
    return { delivered: false, provider: 'smtp', simulated: true };
  }

  await transporter.sendMail({
    from: env.smtpFrom,
    to: toEmail,
    subject: `${env.restaurantName} — Your verification code`,
    text: `Your ${env.restaurantName} verification code is ${otp}. It expires in ${env.otpExpiryMinutes} minutes.`,
    html: `<p>Your <strong>${env.restaurantName}</strong> verification code is <strong style="font-size:20px;letter-spacing:3px">${otp}</strong>.</p><p>This code expires in ${env.otpExpiryMinutes} minutes.</p>`,
  });
  return { delivered: true, provider: 'smtp' };
}

export async function dispatchOtp({ channel, identifier, otp }) {
  if (env.demoMode) {
    return { delivered: true, provider: 'demo', simulated: true };
  }
  if (channel === 'mobile') {
    return sendSmsOtp(identifier, otp);
  }
  return sendEmailOtp(identifier, otp);
}

export async function verifyCaptchaToken(token, remoteIp) {
  if (!env.captchaSecret) {
    return { valid: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'CAPTCHA verification required.' };
  }

  const verifyUrl =
    env.captchaProvider === 'hcaptcha'
      ? 'https://api.hcaptcha.com/siteverify'
      : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  const body = new URLSearchParams({
    secret: env.captchaSecret,
    response: token,
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  });

  const res = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    return { valid: false, error: 'Unable to verify CAPTCHA right now.' };
  }
  const data = await res.json();
  return data.success ? { valid: true } : { valid: false, error: 'CAPTCHA verification failed. Please retry.' };
}
