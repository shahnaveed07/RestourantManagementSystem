import React, { useState, useEffect } from 'react';
import { ArrowRight, Smartphone, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  COUNTRY_CODES,
  validateMobileInput,
  validateEmailInput,
  formatCountdown,
} from '../utils/authValidation';
import { OtpDigitInput } from './OtpDigitInput';

export function CustomerAuthForm({ initialMode = 'login', onSuccess, resetKey = 0 }) {
  const { config, requestOtp, verifyOtp } = useAuth();

  const [mode, setMode] = useState(initialMode);
  const [channel, setChannel] = useState('mobile');
  const [step, setStep] = useState('identifier'); // 'identifier' | 'otp'

  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileInput, setMobileInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [otp, setOtp] = useState('');

  const [normalizedIdentifier, setNormalizedIdentifier] = useState('');
  const [maskedIdentifier, setMaskedIdentifier] = useState('');
  const [expirySeconds, setExpirySeconds] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [resendsRemaining, setResendsRemaining] = useState(3);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    setMode(initialMode);
    setStep('identifier');
    setOtp('');
    setError(null);
    setErrorCode(null);
  }, [initialMode, resetKey]);

  // Countdown timers for OTP expiry and 30s resend cooldown
  useEffect(() => {
    if (step !== 'otp') return undefined;
    const timer = window.setInterval(() => {
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  const validateStep1 = () => {
    if (mode === 'signup' && (!name.trim() || name.trim().length < 2)) {
      return { valid: false, error: 'Please enter your full name (at least 2 characters).' };
    }
    if (channel === 'mobile') {
      return validateMobileInput(mobileInput, countryCode);
    }
    return validateEmailInput(emailInput);
  };

  const handleRequestOtp = async (e) => {
    e?.preventDefault();
    setError(null);
    setErrorCode(null);

    const check = validateStep1();
    if (!check.valid) {
      setError(check.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestOtp({
        channel,
        identifier: check.identifier,
        countryCode: channel === 'mobile' ? countryCode : undefined,
        purpose: mode,
        name: mode === 'signup' ? name.trim() : undefined,
        captchaToken: captchaRequired ? captchaToken.trim() : undefined,
      });

      setNormalizedIdentifier(res.identifier);
      setMaskedIdentifier(res.maskedIdentifier);
      setExpirySeconds(res.expiresInSeconds || 300);
      setCooldownSeconds(res.resendCooldownSeconds || 30);
      setResendsRemaining(
        typeof res.resendsRemaining === 'number' ? res.resendsRemaining : 3
      );
      setOtp(config.demoMode ? String(res.demoOtp || config.demoOtpHint || '123456') : '');
      setStep('otp');
      toast.success('Verification code sent.');
    } catch (err) {
      setError(err.message);
      setErrorCode(err.code || null);
      if (err.data?.captchaRequired) {
        setCaptchaRequired(true);
      }
      if (typeof err.data?.retryAfterSeconds === 'number') {
        setCooldownSeconds(err.data.retryAfterSeconds);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setErrorCode(null);

    if (!/^\d{6}$/.test(otp)) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    setSubmitting(true);
    try {
      const signedInUser = await verifyOtp({
        channel,
        identifier: normalizedIdentifier || (channel === 'mobile' ? `${countryCode}${mobileInput}` : emailInput),
        countryCode: channel === 'mobile' ? countryCode : undefined,
        otp,
        purpose: mode,
        name: mode === 'signup' ? name.trim() : undefined,
      });
      toast.success(
        mode === 'signup'
          ? `Welcome, ${signedInUser.name}!`
          : `Signed in as ${signedInUser.name}`
      );
      onSuccess?.(signedInUser);
    } catch (err) {
      setError(err.message);
      setErrorCode(err.code || null);
      if (err.data?.captchaRequired) {
        setCaptchaRequired(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchToLogin = () => {
    setMode('login');
    setStep('identifier');
    setOtp('');
    setError(null);
    setErrorCode(null);
  };

  return (
    <div className="space-y-4">
      {/* Log In / Sign Up Tabs */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => {
            setMode('login');
            setStep('identifier');
            setOtp('');
            setError(null);
            setErrorCode(null);
          }}
          className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
            mode === 'login'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Log In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => {
            setMode('signup');
            setStep('identifier');
            setOtp('');
            setError(null);
            setErrorCode(null);
          }}
          className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
            mode === 'signup'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Sign Up
        </button>
      </div>

      {step === 'identifier' ? (
        <form onSubmit={handleRequestOtp} className="space-y-3.5" noValidate>
          {/* Channel Toggle: Mobile | Email */}
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Customer verification channel">
            <button
              type="button"
              role="tab"
              aria-selected={channel === 'mobile'}
              onClick={() => {
                setChannel('mobile');
                setError(null);
              }}
              className={`min-h-[44px] px-3 rounded-lg border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                channel === 'mobile'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              Mobile
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={channel === 'email'}
              onClick={() => {
                setChannel('email');
                setError(null);
              }}
              className={`min-h-[44px] px-3 rounded-lg border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                channel === 'email'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Mail className="w-4 h-4 shrink-0" />
              Email
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
            >
              {error}
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label htmlFor="otp-customer-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                Full Name
              </label>
              <input
                id="otp-customer-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                autoComplete="name"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          {channel === 'mobile' ? (
            <div>
              <label htmlFor="otp-mobile-number" className="block text-xs font-medium text-slate-700 mb-1.5">
                Mobile Number
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="Country code"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="min-h-[44px] px-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600 shrink-0"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  id="otp-mobile-number"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={mobileInput}
                  onChange={(e) => setMobileInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder={mode === 'signup' ? '9999999993' : '9999999991'}
                  autoComplete="tel-national"
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Enter a 10-digit mobile number to receive a 6-digit verification code.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="otp-email-address" className="block text-xs font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                id="otp-email-address"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={mode === 'signup' ? 'newguest@demo.com' : 'customer@demo.com'}
                autoComplete="email"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          {captchaRequired && config.captchaEnabled && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Security verification required</span>
              </div>
              <input
                type="text"
                value={captchaToken}
                onChange={(e) => setCaptchaToken(e.target.value)}
                placeholder={`Paste ${config.captchaProvider} verification token`}
                aria-label="CAPTCHA verification token"
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-base sm:text-xs text-slate-900"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {submitting ? 'Sending Code...' : 'Send OTP'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Verification code sent to</p>
              <p className="text-sm font-semibold text-slate-900 truncate">
                {normalizedIdentifier || maskedIdentifier}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep('identifier');
                setOtp('');
                setError(null);
                setErrorCode(null);
              }}
              className="min-h-[44px] px-2.5 text-xs font-semibold text-teal-700 hover:text-teal-900 shrink-0"
            >
              Change
            </button>
          </div>

          {config.demoMode && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
              <span>
                <strong>DEMO: OTP is {config.demoOtpHint || '123456'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setOtp(config.demoOtpHint || '123456')}
                className="min-h-[44px] px-3 rounded-lg bg-amber-100 hover:bg-amber-200 font-semibold text-amber-950 shrink-0"
              >
                Auto-fill
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium space-y-2"
            >
              <p>{error}</p>
              {errorCode === 'ACCOUNT_EXISTS' && (
                <button
                  type="button"
                  onClick={handleSwitchToLogin}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-white border border-red-300 text-red-800 font-semibold hover:bg-red-50"
                >
                  Log In Instead
                </button>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-700">Enter 6-digit OTP</label>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {expirySeconds > 0 ? `Expires in ${formatCountdown(expirySeconds)}` : 'Code expired'}
              </span>
            </div>
            <OtpDigitInput value={otp} onChange={setOtp} disabled={submitting} />
          </div>

          <button
            type="submit"
            disabled={submitting || otp.length < 6}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {submitting
              ? 'Verifying...'
              : mode === 'signup'
                ? 'Verify & Create Account'
                : 'Verify & Sign In'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500">
              {resendsRemaining} resend{resendsRemaining === 1 ? '' : 's'} left
            </span>
            <button
              type="button"
              disabled={submitting || cooldownSeconds > 0 || resendsRemaining <= 0}
              onClick={handleRequestOtp}
              className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:text-slate-400 disabled:hover:bg-transparent inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {cooldownSeconds > 0 ? `Resend OTP (${cooldownSeconds}s)` : 'Resend OTP'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
