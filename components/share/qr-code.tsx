'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  value: string;
}

export function QRCodeDisplay({ value }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    QRCode.toCanvas(canvasRef.current, value, {
      width: 180,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#00000000', // transparent background
      },
      errorCorrectionLevel: 'M',
    });
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative rounded-2xl border border-primary/30 bg-background/80 backdrop-blur-md p-4 shadow-[0_0_30px_rgba(var(--primary),0.15)]">
        {/* Glowing corners */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary rounded-bl-lg" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary rounded-br-lg" />

        <canvas ref={canvasRef} className="rounded-lg" />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
        Scan to join
      </span>
    </div>
  );
}
