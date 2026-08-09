'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function RotatingEarthBackground() {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/signup') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Globe parameters
    let rotation = 0;
    const dots: { lat: number; lng: number; size: number; pulse: number }[] = [];

    // Seed telemetry dots across globe coordinates
    for (let i = 0; i < 50; i++) {
      dots.push({
        lat: (Math.random() - 0.5) * Math.PI * 0.85,
        lng: Math.random() * Math.PI * 2,
        size: 2.5 + Math.random() * 2.5,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // World Map approximation clusters
    const landParticles: { lat: number; lng: number }[] = [];
    const landClusters = [
      { lat: 0.7, lng: -1.7, spread: 0.85, count: 90 },  // North America
      { lat: -0.3, lng: -1.0, spread: 0.65, count: 70 }, // South America
      { lat: 0.8, lng: 0.2, spread: 0.55, count: 75 },   // Europe
      { lat: 0.1, lng: 0.4, spread: 0.75, count: 85 },   // Africa
      { lat: 0.6, lng: 1.8, spread: 1.1, count: 120 },   // Asia
      { lat: -0.4, lng: 2.3, spread: 0.55, count: 50 },  // Australia
    ];

    landClusters.forEach((cluster) => {
      for (let i = 0; i < cluster.count; i++) {
        landParticles.push({
          lat: cluster.lat + (Math.random() - 0.5) * cluster.spread,
          lng: cluster.lng + (Math.random() - 0.5) * cluster.spread,
        });
      }
    });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const globeRadius = Math.min(width, height) * 0.40;
      const centerX = width * 0.5;
      const centerY = height * 0.5;

      rotation += 0.003;

      // Draw subtle atmospheric outer glow ring
      const glowGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        globeRadius * 0.85,
        centerX,
        centerY,
        globeRadius * 1.4
      );
      glowGrad.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
      glowGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.12)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, globeRadius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Draw Globe Sphere Base
      const globeBg = ctx.createRadialGradient(
        centerX - globeRadius * 0.3,
        centerY - globeRadius * 0.3,
        globeRadius * 0.1,
        centerX,
        centerY,
        globeRadius
      );
      globeBg.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      globeBg.addColorStop(0.7, 'rgba(8, 14, 28, 0.98)');
      globeBg.addColorStop(1, 'rgba(2, 6, 23, 1.0)');

      ctx.fillStyle = globeBg;
      ctx.beginPath();
      ctx.arc(centerX, centerY, globeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Orthographic projection helper
      const project = (lat: number, lng: number) => {
        const currentLng = lng + rotation;
        const x3d = globeRadius * Math.cos(lat) * Math.sin(currentLng);
        const y3d = globeRadius * Math.sin(lat);
        const z3d = globeRadius * Math.cos(lat) * Math.cos(currentLng);

        return {
          x: centerX + x3d,
          y: centerY - y3d,
          z: z3d,
          visible: z3d > 0,
        };
      };

      // Draw Latitude Lines (Parallels)
      for (let lat = -Math.PI / 3; lat <= Math.PI / 3; lat += Math.PI / 6) {
        ctx.beginPath();
        let started = false;
        for (let lng = 0; lng <= Math.PI * 2; lng += 0.06) {
          const pt = project(lat, lng);
          if (pt.visible) {
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            started = false;
          }
        }
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Draw Longitude Lines (Meridians)
      for (let lng = 0; lng < Math.PI * 2; lng += Math.PI / 6) {
        ctx.beginPath();
        let started = false;
        for (let lat = -Math.PI / 2; lat <= Math.PI / 2; lat += 0.06) {
          const pt = project(lat, lng);
          if (pt.visible) {
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            started = false;
          }
        }
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Draw Land Particles (Continents)
      landParticles.forEach((lp) => {
        const pt = project(lp.lat, lp.lng);
        if (pt.visible) {
          const opacity = (pt.z / globeRadius) * 0.75;
          ctx.fillStyle = `rgba(56, 189, 248, ${opacity})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Draw Active Telemetry Nodes
      dots.forEach((dot) => {
        dot.pulse += 0.05;
        const pt = project(dot.lat, dot.lng);

        if (pt.visible) {
          const depthRatio = pt.z / globeRadius;
          const pulseScale = 1 + Math.sin(dot.pulse) * 0.4;
          const alpha = depthRatio * 0.95;

          // Outer pulsing ripple ring
          ctx.strokeStyle = `rgba(99, 102, 241, ${alpha * 0.6})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, dot.size * 3.5 * pulseScale, 0, Math.PI * 2);
          ctx.stroke();

          // Core node dot
          ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, dot.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [pathname]);

  if (pathname === '/login' || pathname === '/signup') {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-slate-950">
      {/* 3D Rotating Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-90" />

      {/* Vignette Overlay for Contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/80 pointer-events-none" />
    </div>
  );
}
