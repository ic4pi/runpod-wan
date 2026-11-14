import { useEffect, useRef } from 'react';

type PackageSpec = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  code: string;
};

const PACKAGES: PackageSpec[] = [
  { x: 0.075, y: 0.19, w: 0.22, h: 0.29, color: '#44A6E4', code: 'Q–01' },
  { x: 0.39, y: 0.13, w: 0.2, h: 0.35, color: '#F7E84C', code: 'Q–02' },
  { x: 0.705, y: 0.23, w: 0.21, h: 0.25, color: '#F0EEE6', code: 'Q–03' },
  { x: 0.09, y: 0.62, w: 0.19, h: 0.21, color: '#F0EEE6', code: 'Q–04' },
  { x: 0.385, y: 0.56, w: 0.23, h: 0.27, color: '#2979FF', code: 'Q–05' },
  { x: 0.72, y: 0.6, w: 0.18, h: 0.23, color: '#D97757', code: 'Q–06' },
];

const PARTICLES = Array.from({ length: 54 }, (_, index) => ({
  x: ((index * 47) % 101) / 101,
  y: ((index * 71 + 13) % 97) / 97,
  size: 0.45 + (index % 4) * 0.35,
  phase: index * 0.73,
}));

/** A high-DPI, pointer-reactive wave field arranged as a microscopic grocery shelf. */
export function QuantumShelf() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    let width = 1;
    let height = 1;
    let ratio = 1;
    let frameId = 0;
    let lastFrame = 0;
    let inView = true;
    const pointer = { x: 0.64, y: 0.42, targetX: 0.64, targetY: 0.42, force: 0, targetForce: 0 };

    const drawPackage = (spec: PackageSpec, index: number, seconds: number) => {
      const x = spec.x * width;
      const y = spec.y * height;
      const w = spec.w * width;
      const h = spec.h * height;
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const distance = Math.hypot(centerX / width - pointer.x, centerY / height - pointer.y);
      const influence = Math.max(0, 1 - distance * 2.2) * pointer.force;
      const lift = reducedMotion ? 0 : Math.sin(seconds * 0.65 + index * 1.7) * 1.5 - influence * 5;
      const lean = reducedMotion ? 0 : (pointer.x - centerX / width) * influence * 0.025;

      context.save();
      context.translate(centerX, centerY + lift);
      context.transform(1, 0, lean, 1, 0, 0);
      context.translate(-w / 2, -h / 2);

      context.fillStyle = 'rgba(0, 0, 0, 0.34)';
      context.fillRect(7, 9, w, h);
      context.fillStyle = spec.color;
      context.fillRect(0, 0, w, h);
      context.fillStyle = 'rgba(0, 0, 0, 0.2)';
      context.beginPath();
      context.moveTo(w * 0.87, 0);
      context.lineTo(w, 0);
      context.lineTo(w, h);
      context.lineTo(w * 0.87, h * 0.96);
      context.closePath();
      context.fill();
      context.strokeStyle = 'rgba(244, 244, 244, 0.34)';
      context.lineWidth = 0.75;
      context.strokeRect(0.5, 0.5, w - 1, h - 1);

      const ink = spec.color === '#2979FF' ? '#F4F4F4' : '#080B0B';
      context.fillStyle = ink;
      context.font = `500 ${Math.max(7, Math.min(10, w * 0.065))}px "JetBrains Mono", monospace`;
      context.textBaseline = 'top';
      context.fillText('GROCERY', w * 0.09, h * 0.09);
      context.fillText(spec.code, w * 0.09, h * 0.86);

      context.strokeStyle = ink;
      context.globalAlpha = 0.7;
      context.lineWidth = 0.8;
      const orbitY = h * 0.49;
      for (let ring = 0; ring < 5; ring += 1) {
        context.beginPath();
        context.ellipse(w * 0.45, orbitY, w * (0.29 - ring * 0.025), h * (0.1 + ring * 0.025), ring * 0.42 + seconds * 0.025, 0, Math.PI * 2);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(w * 0.45, orbitY, Math.max(2, w * 0.027), 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const draw = (timestamp: number) => {
      const seconds = reducedMotion ? 0 : timestamp / 1000;
      pointer.x += (pointer.targetX - pointer.x) * 0.075;
      pointer.y += (pointer.targetY - pointer.y) * 0.075;
      pointer.force += (pointer.targetForce - pointer.force) * 0.065;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#080B0B';
      context.fillRect(0, 0, width, height);

      const grid = Math.max(34, width / 13);
      context.strokeStyle = 'rgba(68, 166, 228, 0.075)';
      context.lineWidth = 0.65;
      for (let x = grid; x < width; x += grid) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      for (let y = grid; y < height; y += grid) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }

      const sourceX = pointer.x * width;
      const sourceY = pointer.y * height;
      const glow = context.createRadialGradient(sourceX, sourceY, 0, sourceX, sourceY, width * 0.44);
      glow.addColorStop(0, `rgba(68, 166, 228, ${0.055 + pointer.force * 0.07})`);
      glow.addColorStop(0.55, 'rgba(68, 166, 228, 0.018)');
      glow.addColorStop(1, 'rgba(8, 11, 11, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      // Two distance fields interfere; the pointer bends the local field instead of
      // merely moving a decorative gradient.
      for (let row = 0; row < 24; row += 1) {
        const baseY = ((row + 0.5) / 24) * height;
        context.beginPath();
        for (let x = -8; x <= width + 8; x += 7) {
          const d1 = Math.hypot(x - sourceX, baseY - sourceY);
          const d2 = Math.hypot(x - width * 0.16, baseY - height * 0.77);
          const wave = Math.sin(d1 * 0.047 - seconds * 1.25) + Math.sin(d2 * 0.055 + seconds * 0.85);
          const envelope = 1.6 + pointer.force * 2.5;
          const y = baseY + wave * envelope;
          if (x === -8) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.strokeStyle = row % 6 === 0 ? 'rgba(247, 232, 76, 0.18)' : 'rgba(68, 166, 228, 0.13)';
        context.lineWidth = row % 6 === 0 ? 0.9 : 0.65;
        context.stroke();
      }

      PARTICLES.forEach((particle) => {
        const drift = reducedMotion ? 0 : Math.sin(seconds * 0.35 + particle.phase) * 0.012;
        const x = (particle.x + drift) * width;
        const y = (particle.y + Math.cos(seconds * 0.28 + particle.phase) * (reducedMotion ? 0 : 0.008)) * height;
        const distance = Math.hypot(x - sourceX, y - sourceY);
        const alpha = 0.12 + Math.max(0, 1 - distance / (width * 0.35)) * pointer.force * 0.55;
        context.fillStyle = `rgba(240, 238, 230, ${alpha})`;
        context.fillRect(x, y, particle.size, particle.size);
      });

      [0.5, 0.855].forEach((shelfY) => {
        const y = shelfY * height;
        context.fillStyle = 'rgba(0, 0, 0, 0.45)';
        context.fillRect(width * 0.035, y + 7, width * 0.93, 10);
        context.fillStyle = '#334144';
        context.fillRect(width * 0.035, y, width * 0.93, 2);
        context.fillStyle = 'rgba(240, 238, 230, 0.34)';
        context.fillRect(width * 0.035, y, width * 0.93, 0.65);
      });

      PACKAGES.forEach((spec, index) => drawPackage(spec, index, seconds));

      context.strokeStyle = 'rgba(240, 238, 230, 0.16)';
      context.lineWidth = 1;
      context.strokeRect(0.5, 0.5, width - 1, height - 1);
    };

    const frame = (timestamp: number) => {
      frameId = 0;
      if (reducedMotion || !inView || document.hidden) return;
      if (timestamp - lastFrame >= 1000 / 30) {
        draw(timestamp);
        lastFrame = timestamp;
      }
      frameId = window.requestAnimationFrame(frame);
    };

    const requestFrame = () => {
      if (!frameId && !reducedMotion && inView && !document.hidden) frameId = window.requestAnimationFrame(frame);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw(performance.now());
      requestFrame();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion) return;
      const bounds = canvas.getBoundingClientRect();
      pointer.targetX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      pointer.targetY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      pointer.targetForce = 1;
    };
    const onPointerLeave = () => {
      pointer.targetX = 0.64;
      pointer.targetY = 0.42;
      pointer.targetForce = 0;
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else requestFrame();
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      window.cancelAnimationFrame(frameId);
      frameId = 0;
      draw(performance.now());
      requestFrame();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else requestFrame();
    }, { rootMargin: '100px' });

    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    motionQuery.addEventListener('change', onMotionChange);
    resize();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotionChange);
    };
  }, []);

  return (
    <figure className="quantum-shelf relative m-0 min-h-[420px] overflow-hidden bg-[#080b0b] sm:min-h-[520px] lg:min-h-[600px]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-crosshair" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#9aa7a9] sm:p-6">
        <span><i className="mr-2 inline-block h-1.5 w-1.5 bg-[#44a6e4]" />Live interference field</span>
        <span className="text-right">Move pointer<br />to disturb</span>
      </div>
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.16em] text-[#9aa7a9] sm:p-6">
        <span>Planck provisions<br />Shelf study / 001</span>
        <span className="text-right text-[#f4f4f4]">ℓₚ ≈ 1.616 × 10⁻³⁵ m</span>
      </figcaption>
    </figure>
  );
}
