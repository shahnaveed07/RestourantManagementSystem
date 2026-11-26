import { maskIdentifier } from './otpLogic.js';

function encodeBase64Ascii(str) {
  return btoa(str);
}

async function sendViaTwilio(cfg, toMobile, message) {
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.twilioFromNumber) {
    console.info(
      `[OTP:SMS:Twilio-Fallback] Credentials unset; skipped live dispatch to ${maskIdentifier('mobile', toMobile)}`
    );
    return { delivered: false, provider: 'twilio', simulated: true };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.twilioAccountSid)}/Messages.json`;
  const authHeader = encodeBase64Ascii(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`);
  const body = new URLSearchParams({
    To: toMobile,
    From: cfg.twilioFromNumber,
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

async function sendViaMsg91(cfg, toMobile, otp) {
  if (!cfg.msg91AuthKey || !cfg.msg91TemplateId) {
    console.info(
      `[OTP:SMS:MSG91-Fallback] Credentials unset; skipped live dispatch to ${maskIdentifier('mobile', toMobile)}`
    );
    return { delivered: false, provider: 'msg91', simulated: true };
  }

  const cleanMobile = toMobile.replace(/^\+/, '');
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: {
      authkey: cfg.msg91AuthKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: cfg.msg91TemplateId,
      sender: cfg.msg91SenderId || 'PASSLN',
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

async function sendSmsOtp(cfg, toMobile, otp) {
  const message = `${cfg.restaurantName} verification code: ${otp}. Valid for ${cfg.otpExpiryMinutes} minutes.`;
  if (cfg.otpSmsProvider === 'msg91') {
    return sendViaMsg91(cfg, toMobile, otp);
  }
  return sendViaTwilio(cfg, toMobile, message);
}

async function sendEmailOtp(cfg, toEmail, otp) {
  if (!cfg.emailApiKey) {
    console.info(
      `[OTP:Email:Resend-Fallback] EMAIL_API_KEY unset; skipped live dispatch to ${maskIdentifier('email', toEmail)}`
    );
    return { delivered: false, provider: cfg.emailProvider || 'resend', simulated: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.emailApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: cfg.emailFrom,
      to: [toEmail],
      subject: `${cfg.restaurantName} — Your verification code`,
      text: `Your ${cfg.restaurantName} verification code is ${otp}. It expires in ${cfg.otpExpiryMinutes} minutes.`,
      html: `<p>Your <strong>${cfg.restaurantName}</strong> verification code is <strong style="font-size:20px;letter-spacing:3px">${otp}</strong>.</p><p>This code expires in ${cfg.otpExpiryMinutes} minutes.</p>`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Email OTP delivery failed (${res.status}): ${errText}`);
  }
  return { delivered: true, provider: 'resend' };
}

export async function dispatchOtp(cfg, { channel, identifier, otp }) {
  if (cfg.demoMode) {
    return { delivered: true, provider: 'demo', simulated: true };
  }
  if (channel === 'mobile') {
    return sendSmsOtp(cfg, identifier, otp);
  }
  return sendEmailOtp(cfg, identifier, otp);
}

export async function verifyCaptchaToken(cfg, token, remoteIp) {
  if (!cfg.captchaSecret) {
    return { valid: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'CAPTCHA verification required.' };
  }

  const verifyUrl =
    cfg.captchaProvider === 'hcaptcha'
      ? 'https://api.hcaptcha.com/siteverify'
      : 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  const body = new URLSearchParams({
    secret: cfg.captchaSecret,
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
  return data.success
    ? { valid: true }
    : { valid: false, error: 'CAPTCHA verification failed. Please retry.' };
}
