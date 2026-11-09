import { useEffect, useRef } from 'react';

/**
 * The halo. A circular FFT visualizer — frequency bands displace the ring
 * radially, so the voice physically bends the circle. Idle: slow breathing.
 * This is the only loud element in the app; everything else whispers.
 */
interface Props {
  analyser: AnalyserNode | null;
  /** recording boosts gain + amber heat; idle breathes */
  mode: 'idle' | 'live' | 'playback';
  className?: string;
}

const BINS = 128;
const AMBER = '247, 160, 38';

export function HaloVisualizer({ analyser, mode, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ smooth: new Float32Array(BINS), raf: 0, t: 0 });
  const modeRef = useRef(mode);
  const analyserRef = useRef(analyser);
  // Refs updated in an effect — never during render.
  useEffect(() => {
    modeRef.current = mode;
    analyserRef.current = analyser;
  }, [mode, analyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const freq = new Uint8Array(BINS * 2);

    const s = stateRef.current;
    const frame = () => {
      s.t += reduced ? 0.002 : 0.008;
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.31;

      // Sample the spectrum (voice lives in the lower ~2/3 of bins)
      const an = analyserRef.current;
      if (an) {
        an.getByteFrequencyData(freq);
      }
      const live = modeRef.current !== 'idle' && an;
      for (let i = 0; i < BINS; i++) {
        let target: number;
        if (live) {
          const bin = Math.min(freq.length - 1, Math.floor(Math.pow(i / BINS, 1.4) * freq.length * 0.66));
          target = freq[bin] / 255;
        } else {
          // idle breathing — slow organic undulation
          target =
            0.06 +
            0.035 * Math.sin(s.t * 1.7 + i * 0.32) +
            0.02 * Math.sin(s.t * 0.9 + i * 0.11);
        }
        s.smooth[i] += (target - s.smooth[i]) * (live ? 0.35 : 0.04);
      }

      ctx.clearRect(0, 0, w, h);

      // hairline dial ticks — console dial DNA
      ctx.strokeStyle = 'rgba(245, 243, 238, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const inner = base * 1.42;
        const outer = inner + (i % 5 === 0 ? 8 : 4);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();
      }
      // base circle
      ctx.beginPath();
      ctx.arc(cx, cy, base, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245, 243, 238, 0.14)';
      ctx.stroke();

      // displaced halo path
      const pts: [number, number][] = [];
      const gain = modeRef.current === 'idle' ? base * 0.9 : base * 0.75;
      for (let i = 0; i <= BINS; i++) {
        const idx = i % BINS;
        const a = (idx / BINS) * Math.PI * 2 - Math.PI / 2;
        const r = base + s.smooth[idx] * gain;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      const drawRing = (stroke: string, width: number, blur: number, blurColor: string) => {
        ctx.beginPath();
        ctx.moveTo((pts[0][0] + pts[BINS][0]) / 2, (pts[0][1] + pts[BINS][1]) / 2);
        for (let i = 0; i < BINS; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[i + 1];
          ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
        }
        ctx.closePath();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.shadowBlur = blur;
        ctx.shadowColor = blurColor;
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      const heat = modeRef.current === 'live' ? 1 : modeRef.current === 'playback' ? 0.85 : 0.55;
      drawRing(`rgba(${AMBER}, ${0.12 * heat})`, 7, 26, `rgba(${AMBER}, 0.55)`);
      drawRing(`rgba(${AMBER}, ${0.5 * heat})`, 2.4, 14, `rgba(${AMBER}, 0.7)`);
      drawRing(`rgba(255, 248, 235, ${0.92 * heat})`, 1.1, 0, 'transparent');

      // center level dot — subtle meter
      let level = 0;
      for (let i = 0; i < BINS; i++) level += s.smooth[i];
      level /= BINS;
      const dotR = 2 + level * (live ? 14 : 6);
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${AMBER}, ${0.5 + 0.4 * heat})`;
      ctx.shadowBlur = 18;
      ctx.shadowColor = `rgba(${AMBER}, 0.8)`;
      ctx.fill();
      ctx.shadowBlur = 0;

      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(s.raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
