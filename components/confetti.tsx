'use client';

import { useEffect, useRef } from 'react';

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const COLORS = [
  '#00dbd3', // primary cyan
  '#22d3ee', // lighter cyan
  '#34d399', // emerald
  '#a78bfa', // purple
  '#f472b6', // pink
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#ffffff', // white
];

export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces: ConfettiPiece[] = [];
    const PIECE_COUNT = 120;

    // Create confetti pieces from the center-top
    for (let i = 0; i < PIECE_COUNT; i++) {
      pieces.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 3,
        vx: (Math.random() - 0.5) * 15,
        vy: -Math.random() * 12 - 4,
        size: Math.random() * 8 + 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }

    let animationId: number;
    let frame = 0;
    const maxFrames = 180; // ~3 seconds at 60fps

    function animate() {
      if (!ctx || !canvas) return;
      frame++;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const piece of pieces) {
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.vy += 0.2; // gravity
        piece.vx *= 0.99; // air resistance
        piece.rotation += piece.rotationSpeed;

        // Fade out in the last 60 frames
        if (frame > maxFrames - 60) {
          piece.opacity = Math.max(0, piece.opacity - 0.02);
        }

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate((piece.rotation * Math.PI) / 180);
        ctx.globalAlpha = piece.opacity;
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        ctx.restore();
      }

      if (frame < maxFrames) {
        animationId = requestAnimationFrame(animate);
      }
    }

    animationId = requestAnimationFrame(animate);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[100] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
