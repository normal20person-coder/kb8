'use client';

import { useEffect, useRef } from 'react';

export default function Tactical3DBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvasRef.current) return;
      width = canvasRef.current.width = window.innerWidth;
      height = canvasRef.current.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // 3D Particles
    const particles: Array<{
      x: number;
      y: number;
      z: number;
      size: number;
      opacity: number;
      vx: number;
      vy: number;
      vz: number;
    }> = [];

    for (let i = 0; i < 70; i++) {
      particles.push({
        x: (Math.random() - 0.5) * width * 1.5,
        y: (Math.random() - 0.5) * height * 1.5,
        z: Math.random() * 1000 + 100,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.7 + 0.3,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        vz: (Math.random() - 0.5) * 0.5,
      });
    }

    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      angle += 0.005;

      const fov = 400;
      const cx = width / 2;
      const cy = height / 2;

      // Draw 3D Perspective Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.lineWidth = 1;

      // Grid lines
      const horizonY = cy + 100;
      for (let x = -width; x < width * 2; x += 80) {
        ctx.beginPath();
        ctx.moveTo(cx + (x - cx) * 0.1, horizonY);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = horizonY; y < height; y += (y - horizonY) * 0.4 + 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // Render 3D Floating Telemetry Particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        if (p.z <= 10) p.z = 1000;
        if (p.z > 1000) p.z = 10;

        const scale = fov / (fov + p.z);
        const px = cx + p.x * scale;
        const py = cy + p.y * scale;

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, p.size * scale * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 189, 248, ${p.opacity * scale})`;
          ctx.shadowBlur = 12 * scale;
          ctx.shadowColor = '#38bdf8';
          ctx.fill();
          ctx.restore();
        }
      });

      // Rotating Radar Sweeper in background
      ctx.save();
      ctx.translate(cx, cy - 80);
      ctx.beginPath();
      ctx.arc(0, 0, 180, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 100, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
      ctx.stroke();

      // Sweeper cone
      const sweepGradient = ctx.createConicGradient(angle, 0, 0);
      sweepGradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
      sweepGradient.addColorStop(0.15, 'rgba(6, 182, 212, 0.05)');
      sweepGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
      sweepGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.arc(0, 0, 180, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-slate-950">
      {/* Radial ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-tr from-indigo-600/15 via-cyan-500/10 to-teal-500/0 rounded-full blur-[120px]" />
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[140px]" />
      
      {/* 3D Canvas layer */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
