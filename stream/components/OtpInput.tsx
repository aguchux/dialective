'use client';

import { ClipboardEvent, KeyboardEvent, useRef } from 'react';

const LENGTH = 6;

/**
 * Six separate single-digit boxes for OTP entry, shared by login/register's
 * full-page verification step and AuthGateDialog's inline one. Deliberately
 * not a single wide text input (the old pattern) -- this is the standard
 * OTP UX: autoComplete="off" per box (no browser-password-manager overlay
 * fighting six tiny fields, unlike the old single input which triggered
 * Chrome's inline autofill icon), one real paste target (pasting a full
 * 6-digit code into any box fills all six and focuses the last), and
 * backspace on an empty box clears+focuses the previous box instead of
 * doing nothing.
 */
export function OtpInput({
  value,
  onChange,
  className = '',
  disabled,
  id,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  function setDigitAt(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, LENGTH));
  }

  function handleChange(index: number, raw: string) {
    // Only the last typed character matters -- a box can briefly hold two
    // characters mid-keystroke on some IME/mobile keyboards.
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigitAt(index, digit);
    if (digit && index < LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        // Box has a digit -- clear it, stay put (matches native single-input backspace).
        setDigitAt(index, '');
        return;
      }
      // Box is already empty -- move back and clear the previous digit too,
      // so repeated backspace deletes right-to-left the way one continuous
      // input would, instead of getting stuck once a box is empty.
      if (index > 0) {
        e.preventDefault();
        setDigitAt(index - 1, '');
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const next = digits.slice();
    for (let i = 0; i < pasted.length && index + i < LENGTH; i++) {
      next[index + i] = pasted[i];
    }
    onChange(next.join('').slice(0, LENGTH));
    const lastFilled = Math.min(index + pasted.length, LENGTH) - 1;
    inputRefs.current[Math.max(lastFilled, 0)]?.focus();
  }

  return (
    <div className="flex gap-2" id={id} role="group">
      {digits.map((digit, index) => (
        <input
          aria-label={`Verification code digit ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={index === 0 && autoFocus}
          className={className}
          disabled={disabled}
          inputMode="numeric"
          key={index}
          maxLength={1}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          pattern="[0-9]*"
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          value={digit}
        />
      ))}
    </div>
  );
}
