'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import Image from 'next/image';

interface QRCodeDisplayProps {
  value: string;
}

export function QRCodeDisplay({ value }: QRCodeDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!value) return;

    QRCode.toDataURL(value, {
      width: 512,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#00000000', // transparent background
      },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl);
  }, [value]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-62.5 sm:max-w-70 rounded-[28px] border border-primary/30 bg-linear-to-b from-card/70 to-background/70 p-4 sm:p-5 shadow-[0_0_40px_rgba(var(--primary),0.15)]"
      >
        <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(var(--primary),0.18),transparent_60%)]" />

        <motion.div
          aria-hidden
          className="absolute left-0 top-0 h-full w-16 rounded-full"
          animate={{ x: ['-40%', '160%'] }}
          transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
        />

        <div className="relative z-10 rounded-xl border border-white/10 bg-black/95 p-2 sm:p-3 backdrop-blur-md">
          {qrDataUrl ? (
            <Image
              src={qrDataUrl}
              alt="QR Code"
              width={220}
              height={220}
              className="h-40 w-40 sm:h-50 sm:w-50 rounded-xl mx-auto select-none pointer-events-none"
              unoptimized
            />
          ) : (
            <div className="h-40 w-40 sm:h-50 sm:w-50 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
          )}
        </div>
      </motion.div>

      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-[9px] sm:text-[10px] font-mono text-primary uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
          Scan to Receive Files
        </span>
      </div>
    </div>
  );
}
