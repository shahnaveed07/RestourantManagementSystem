export const COUNTRY_CODES = [
  { code: '+91', label: '+91 (IN)' },
  { code: '+1', label: '+1 (US/CA)' },
  { code: '+44', label: '+44 (UK)' },
  { code: '+61', label: '+61 (AU)' },
  { code: '+65', label: '+65 (SG)' },
  { code: '+971', label: '+971 (UAE)' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateMobileInput(rawNumber, countryCode = '+91') {
  const digits = String(rawNumber || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) {
    return {
      valid: false,
      error: 'Enter a valid 10-digit mobile number.',
    };
  }
  return {
    valid: true,
    localDigits: digits,
    identifier: `${countryCode}${digits}`,
  };
}

export function validateEmailInput(rawEmail) {
  const clean = String(rawEmail || '').trim().toLowerCase();
  if (!clean || !EMAIL_REGEX.test(clean)) {
    return {
      valid: false,
      error: 'Enter a valid email address.',
    };
  }
  return {
    valid: true,
    identifier: clean,
  };
}

export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
