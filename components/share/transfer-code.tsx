'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

import { HugeiconsIcon } from '@hugeicons/react';
import { Tick01Icon, Copy01Icon } from '@hugeicons/core-free-icons';

interface TransferCodeProps {
  mode: 'display' | 'input';
  code?: string;
  onCodeSubmit?: (code: string) => void;
}

export function TransferCode({ mode, code, onCodeSubmit }: TransferCodeProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [copied, setCopied] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;

      const newDigits = [...digits];
      newDigits[index] = value.slice(-1);
      setDigits(newDigits);

      // Auto-focus next field
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto-submit when all digits are filled
      if (newDigits.every((d) => d !== '') && onCodeSubmit) {
        onCodeSubmit(newDigits.join(''));
      }
    },
    [digits, onCodeSubmit],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (pasted.length === 6) {
        const newDigits = pasted.split('');
        setDigits(newDigits);
        inputRefs.current[5]?.focus();
        onCodeSubmit?.(pasted);
      }
    },
    [onCodeSubmit],
  );

  const copyCode = useCallback(async () => {
    if (code) {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  if (mode === 'display' && code) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center justify-center gap-2">
          {code.split('').map((digit, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 20,
                delay: i * 0.08,
              }}
              className="flex h-12 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-2xl font-mono font-bold text-primary shadow-[0_0_10px_rgba(var(--primary),0.2)]"
            >
              {digit}
            </motion.div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyCode}
          className="text-[10px] font-mono uppercase tracking-widest text-primary/80 hover:text-primary hover:bg-primary/10"
        >
          <AnimatePresence mode="wait">
            {copied ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <HugeiconsIcon icon={Tick01Icon} className="w-4 h-4" />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
            {copied ? 'Copied!' : 'Copy Key'}
          </Button>
      </div>
    );
  }

  if (mode === 'input') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center justify-center gap-2">
          {digits.map((digit, i) => (
            <motion.input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex h-12 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-center text-2xl font-mono font-bold text-primary shadow-[0_0_10px_rgba(var(--primary),0.1)] outline-none transition-all focus:border-primary focus:bg-primary/10 focus:shadow-[0_0_15px_rgba(var(--primary),0.3)]"
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}
