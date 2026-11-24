import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { idleBands, prefersReducedMotion, readBands, readWave } from '@/lib/mvp/analyser';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** Shared high-DPI render loop: pauses off-screen, when the tab hides, and under reduced motion. */
function useCanvasLoop(draw: Draw, fps = 60) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 1; let h = 1; let raf = 0; let last = 0; let visible = true;
    const still = prefersReducedMotion();

    const paint = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ratio = canvas.width / w;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawRef.current(ctx, w, h, still ? 1.2 : now / 1000);
    };
    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - last >= 1000 / fps - 1) { paint(now); last = now; }
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && !still && visible && !document.hidden) raf = requestAnimationFrame(loop); };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      paint(performance.now());
    };
    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { rootMargin: '80px' });
    const onVis = () => start();
    ro.observe(canvas); io.observe(canvas);
    document.addEventListener('visibilitychange', onVis);
    resize(); start();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [fps]);

  return ref;
}

/* ───────────────────────── Full-screen vapor horizon ───────────────────────── */

const STARS = Array.from({ length: 140 }, (_, i) => ({
  x: ((i * 7919) % 1000) / 1000,
  y: ((i * 104729) % 1000) / 1000,
  s: 0.4 + ((i * 31) % 10) / 10,
  p: i * 0.61,
}));

export function VaporBackdrop() {
  const bands = useRef(new Float32Array(8));
  const ref = useCanvasLoop((ctx, w, h, t) => {
    const live = readBands(bands.current);
    if (!live) idleBands(bands.current, t, 0.18);
    const bass = (bands.current[0] + bands.current[1]) / 2;

    const horizon = h * 0.62;
    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#020204');
    sky.addColorStop(0.7, '#08030f');
    sky.addColorStop(1, '#1a0526');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);

    for (const s of STARS) {
      const y = s.y * horizon * 0.92;
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + s.p));
      ctx.fillStyle = `rgba(220,230,255,${a * (1 - y / horizon)})`;
      ctx.fillRect(s.x * w, y, s.s, s.s);
    }

    // Aurora haze: drifting ribbons instead of a sun
    for (let k = 0; k < 3; k += 1) {
      const hue = [184, 265, 312][k];
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = horizon * (0.42 + k * 0.1) + Math.sin(x * 0.004 + t * (0.25 + k * 0.08) + k * 2) * horizon * 0.07 + Math.sin(x * 0.011 - t * 0.4) * horizon * 0.02;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = horizon * 0.09;
      ctx.strokeStyle = `hsla(${hue},100%,60%,${0.05 + bass * 0.05})`;
      ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 50;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Wireframe orb of points, rotating and breathing with the bass
    const R = Math.min(w, h) * (0.2 + bass * 0.02);
    const cx = w * 0.5;
    const cy = horizon - R * 0.55;
    const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.2);
    halo.addColorStop(0, `rgba(139,92,255,${0.16 + bass * 0.2})`);
    halo.addColorStop(1, 'rgba(139,92,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, horizon);
    const rotY = t * 0.18; const tilt = 0.42;
    const cT = Math.cos(tilt); const sT = Math.sin(tilt);
    const cY = Math.cos(rotY); const sY = Math.sin(rotY);
    const LAT = 18; const LON = 40;
    for (let i = 1; i < LAT; i += 1) {
      const phi = (i / LAT) * Math.PI;
      for (let j = 0; j < LON; j += 1) {
        const th = (j / LON) * Math.PI * 2;
        const ripple = 1 + Math.sin(phi * 6 + t * 2) * 0.015 * (1 + bass * 4);
        let x = Math.sin(phi) * Math.cos(th) * ripple;
        let y = Math.cos(phi) * ripple;
        let z = Math.sin(phi) * Math.sin(th) * ripple;
        const x1 = x * cY - z * sY; const z1 = x * sY + z * cY; x = x1; z = z1;
        const y1 = y * cT - z * sT; const z2 = y * sT + z * cT; y = y1; z = z2;
        const depth = (z + 1) / 2;
        const px = cx + x * R; const py = cy + y * R;
        if (py > horizon) continue;
        const hue = 184 + (j / LON) * 130;
        ctx.fillStyle = `hsla(${hue},100%,${60 + depth * 25}%,${0.25 + depth * 0.75})`;
        ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = depth > 0.6 ? 6 : 0;
        const size = 1 + depth * 2.4;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
    }
    ctx.shadowBlur = 0;
    // Equator ring
    ctx.strokeStyle = `rgba(0,240,255,${0.35 + bass * 0.4})`;
    ctx.lineWidth = 1.4; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.35, R * 1.35 * 0.22, -0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,43,214,${0.2 + bass * 0.3})`; ctx.shadowColor = '#ff2bd6';
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.6, R * 1.6 * 0.18, 0.1 + t * 0.05, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Floor
    const floor = ctx.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, '#12031c'); floor.addColorStop(1, '#000');
    ctx.fillStyle = floor; ctx.fillRect(0, horizon, w, h - horizon);

    // Perspective grid
    const glow = 0.35 + bass * 0.65;
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255,43,214,${0.55 * glow})`;
    ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 8 * glow;
    const speed = (t * (0.35 + bass * 0.6)) % 1;
    for (let i = 0; i < 22; i += 1) {
      const z = (i + 1 - speed) / 22;
      const y = horizon + Math.pow(z, 2.6) * (h - horizon);
      ctx.globalAlpha = Math.min(1, z * 1.6);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(0,240,255,${0.35 * glow})`; ctx.shadowColor = '#00f0ff';
    for (let i = -24; i <= 24; i += 1) {
      ctx.beginPath(); ctx.moveTo(cx + i * w * 0.012, horizon); ctx.lineTo(cx + i * w * 0.16, h); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Horizon line + fade
    const line = ctx.createLinearGradient(0, 0, w, 0);
    line.addColorStop(0, 'rgba(0,240,255,0)'); line.addColorStop(0.5, 'rgba(255,255,255,0.9)'); line.addColorStop(1, 'rgba(0,240,255,0)');
    ctx.fillStyle = line; ctx.fillRect(0, horizon - 0.5, w, 1.2);
    const fog = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 60);
    fog.addColorStop(0, 'rgba(255,43,214,0)'); fog.addColorStop(0.5, `rgba(255,43,214,${0.08 + bass * 0.12})`); fog.addColorStop(1, 'rgba(255,43,214,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, horizon - 40, w, 100);
  }, 45);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={ref} className="h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.78)_100%)]" />
      <div className="absolute inset-0 bg-black/40" />
      <div className="vx-scanlines absolute inset-0" />
      <div className="vx-noise absolute inset-0" />
    </div>
  );
}

/* ───────────────────────── Spectrum EQ bars ───────────────────────── */

export function SpectrumBars({ bars = 48, className = '', energy = 0.75, mirror = true, live = true }: {
  bars?: number; className?: string; energy?: number; mirror?: boolean; live?: boolean;
}) {
  const data = useRef(new Float32Array(bars));
  const peaks = useRef(new Float32Array(bars));
  const smooth = useRef(new Float32Array(bars));
  const ref = useCanvasLoop((ctx, w, h, t) => {
    if (data.current.length !== bars) { data.current = new Float32Array(bars); peaks.current = new Float32Array(bars); smooth.current = new Float32Array(bars); }
    const playing = live && readBands(data.current);
    if (!playing) idleBands(data.current, t, energy);
    const gap = Math.max(1.5, w / bars * 0.28);
    const bw = (w - gap * (bars - 1)) / bars;
    const mid = mirror ? h * 0.62 : h;
    const grad = ctx.createLinearGradient(0, mid, 0, 0);
    grad.addColorStop(0, '#00f0ff'); grad.addColorStop(0.55, '#8b5cff'); grad.addColorStop(1, '#ff2bd6');
    for (let i = 0; i < bars; i += 1) {
      smooth.current[i] += (data.current[i] - smooth.current[i]) * 0.35;
      const v = smooth.current[i];
      peaks.current[i] = Math.max(v, peaks.current[i] - 0.012);
      const x = i * (bw + gap);
      const bh = Math.max(2, v * mid * 0.96);
      ctx.shadowColor = '#b44bff'; ctx.shadowBlur = playing ? 14 : 6;
      ctx.fillStyle = grad;
      ctx.fillRect(x, mid - bh, bw, bh);
      ctx.shadowBlur = 0;
      if (h > 60) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x, mid - peaks.current[i] * mid * 0.96 - 3, bw, 1.5);
      }
      if (mirror) {
        const rg = ctx.createLinearGradient(0, mid, 0, mid + bh * 0.6);
        rg.addColorStop(0, 'rgba(0,240,255,0.28)'); rg.addColorStop(1, 'rgba(0,240,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(x, mid + 2, bw, bh * 0.6);
      }
    }
  });
  return <canvas ref={ref} aria-hidden="true" className={`block ${className}`} />;
}

/* ───────────────────────── Oscilloscope line ───────────────────────── */

export function Oscilloscope({ className = '' }: { className?: string }) {
  const wave = useRef(new Float32Array(256));
  const ref = useCanvasLoop((ctx, w, h, t) => {
    const live = readWave(wave.current);
    if (!live) for (let i = 0; i < wave.current.length; i += 1) {
      const x = i / wave.current.length;
      wave.current[i] = Math.sin(x * 18 + t * 3) * 0.22 * Math.sin(x * Math.PI) + Math.sin(x * 47 - t * 5) * 0.06;
    }
    const n = wave.current.length;
    for (const [color, blur, width, off] of [['rgba(255,43,214,0.55)', 16, 3, 1.5], ['#00f0ff', 8, 1.3, 0]] as const) {
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const x = (i / (n - 1)) * w;
        const y = h / 2 + wave.current[i] * h * 0.42 + off;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.stroke();
    }
    ctx.shadowBlur = 0;
  });
  return <canvas ref={ref} aria-hidden="true" className={`block ${className}`} />;
}

/* ───────────────────────── Radial halo scope ───────────────────────── */

export function RadialScope({ className = '', active = false }: { className?: string; active?: boolean }) {
  const data = useRef(new Float32Array(96));
  const smooth = useRef(new Float32Array(96));
  const ref = useCanvasLoop((ctx, w, h, t) => {
    const live = active && readBands(data.current);
    if (!live) idleBands(data.current, t, 0.28);
    const n = data.current.length;
    const cx = w / 2; const cy = h / 2;
    const base = Math.min(w, h) * 0.36;
    const rot = t * 0.15;
    let bass = 0;
    for (let i = 0; i < 6; i += 1) bass += data.current[i] / 6;

    const halo = ctx.createRadialGradient(cx, cy, base * 0.8, cx, cy, base * 1.7);
    halo.addColorStop(0, `rgba(139,92,255,${0.12 + bass * 0.3})`); halo.addColorStop(1, 'rgba(139,92,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < n * 2; i += 1) {
      const k = i < n ? i : n * 2 - 1 - i;
      smooth.current[k] += (data.current[k] - smooth.current[k]) * 0.18;
      const v = smooth.current[k];
      const a = rot + (i / (n * 2)) * Math.PI * 2;
      const r1 = base * (1.02 + bass * 0.04);
      const r2 = r1 + 4 + v * base * 0.55;
      const hue = 185 + (i / (n * 2)) * 140;
      ctx.strokeStyle = `hsla(${hue},100%,62%,${0.55 + v * 0.45})`;
      ctx.lineWidth = Math.max(1.2, (Math.PI * 2 * r1) / (n * 2) * 0.5);
      ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.strokeStyle = `rgba(0,240,255,${0.35 - ring * 0.1})`;
      ctx.setLineDash([2, 6 + ring * 4]);
      ctx.beginPath(); ctx.arc(cx, cy, base * (1.75 + ring * 0.12), -rot * (ring + 1), -rot * (ring + 1) + Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
  });
  return <canvas ref={ref} aria-hidden="true" className={`block ${className}`} />;
}

/* ───────────────────────── Pointer tilt + spotlight ───────────────────────── */

export function tiltHandlers(strength = 8) {
  const reset = (el: HTMLElement) => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.style.setProperty('--glow', '0'); };
  return {
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
      const el = e.currentTarget; const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`);
      el.style.setProperty('--rx', `${(0.5 - y) * strength}deg`); el.style.setProperty('--ry', `${(x - 0.5) * strength}deg`);
      el.style.setProperty('--glow', '1');
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => reset(e.currentTarget),
  };
}
