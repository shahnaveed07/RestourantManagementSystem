import React, { useRef } from 'react';

export function OtpDigitInput({ value = '', onChange, disabled = false }) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const focusIndex = (idx) => {
    const el = inputRefs.current[idx];
    if (el) {
      el.focus();
      el.select?.();
    }
  };

  const handleChange = (index, raw) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      onChange(next.join(''));
      return;
    }

    // Handle multi-digit paste/autofill into a single input
    if (cleaned.length > 1) {
      const sliced = cleaned.slice(0, 6);
      onChange(sliced);
      focusIndex(Math.min(5, sliced.length - 1));
      return;
    }

    const next = [...digits];
    next[index] = cleaned;
    onChange(next.join(''));
    if (index < 5) {
      focusIndex(index + 1);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        onChange(next.join(''));
      } else if (index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        onChange(next.join(''));
        focusIndex(index - 1);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focusIndex(Math.min(5, pasted.length - 1));
  };

  return (
    <div
      className="flex items-center justify-center gap-1.5 sm:gap-2.5"
      role="group"
      aria-label="6-digit verification code"
      onPaste={handlePaste}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`OTP digit ${index + 1}`}
          className="w-10 sm:w-12 h-12 min-h-[48px] text-center text-lg font-mono font-bold rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 disabled:bg-slate-100"
        />
      ))}
    </div>
  );
}
