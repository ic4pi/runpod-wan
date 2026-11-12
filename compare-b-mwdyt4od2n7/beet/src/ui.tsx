import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKE, type PointerEvent as RPE } from 'react';

export type ModuleId = 'beets' | 'raw-honey' | 'pastry' | 'grocery';

export const MODULES: { id: ModuleId; name: string; tag: string; hue: number }[] = [
  { id: 'beets', name: 'Beets', tag: 'Step sequencer', hue: 340 },
  { id: 'raw-honey', name: 'Raw Honey', tag: 'EQ & FX chain', hue: 38 },
  { id: 'pastry', name: 'Pastry', tag: 'Piano roll', hue: 280 },
  { id: 'grocery', name: 'Grocery', tag: 'Sound pantry', hue: 150 },
];

type Params = { cutoff: number; resonance: number; gain: number; mix: number; eq: number[] };
const EQ_FREQS = [80, 250, 1000, 4000, 12000];
const EQ_LABELS = ['80', '250', '1k', '4k', '12k'];
const DRUMS = ['Kick', 'Snare', 'Hat', 'Clap'] as const;
type Drum = (typeof DRUMS)[number];
const ROLL_NOTES = [72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

class Engine {
  ctx: AudioContext;
  input: GainNode;
  eq: BiquadFilterNode[];
  filter: BiquadFilterNode;
  dry: GainNode;
  wet: GainNode;
  delay: DelayNode;
  fb: GainNode;
  master: GainNode;
  analyser: AnalyserNode;
  noise: AudioBuffer;
  private td: Uint8Array;

  constructor() {
    const c = (this.ctx = new AudioContext());
    this.input = c.createGain();
    this.eq = EQ_FREQS.map((f, i) => {
      const b = c.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === 4 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1;
      return b;
    });
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.dry = c.createGain();
    this.wet = c.createGain();
    this.delay = c.createDelay(1);
    this.delay.delayTime.value = 0.28;
    this.fb = c.createGain();
    this.fb.gain.value = 0.35;
    this.master = c.createGain();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 256;
    this.td = new Uint8Array(this.analyser.fftSize);

    let node: AudioNode = this.input;
    for (const b of this.eq) { node.connect(b); node = b; }
    node.connect(this.filter);
    this.filter.connect(this.dry).connect(this.master);
    this.filter.connect(this.delay);
    this.delay.connect(this.wet).connect(this.master);
    this.delay.connect(this.fb).connect(this.delay);
    this.master.connect(this.analyser).connect(c.destination);

    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  set(p: Params) {
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(20 * Math.pow(1000, p.cutoff), t, 0.02);
    this.filter.Q.setTargetAtTime(0.5 + p.resonance * 18, t, 0.02);
    this.master.gain.setTargetAtTime(p.gain * 1.2, t, 0.02);
    this.dry.gain.setTargetAtTime(1 - p.mix * 0.6, t, 0.02);
    this.wet.gain.setTargetAtTime(p.mix, t, 0.02);
    p.eq.forEach((v, i) => this.eq[i].gain.setTargetAtTime((v - 0.5) * 24, t, 0.02));
  }

  level() {
    this.analyser.getByteTimeDomainData(this.td);
    let s = 0;
    for (let i = 0; i < this.td.length; i++) { const x = (this.td[i] - 128) / 128; s += x * x; }
    return Math.sqrt(s / this.td.length);
  }

  private env(g: GainNode, t: number, peak: number, dec: number) {
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dec);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, dec: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, t, peak, dec);
    s.connect(f).connect(g).connect(this.input);
    s.start(t);
    s.stop(t + dec + 0.05);
  }

  hit(kind: Drum, t = this.ctx.currentTime) {
    if (kind === 'Kick') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      this.env(g, t, 0.9, 0.35);
      o.connect(g).connect(this.input);
      o.start(t);
      o.stop(t + 0.4);
    } else if (kind === 'Snare') this.noiseHit(t, 'highpass', 1200, 0.5, 0.18);
    else if (kind === 'Hat') this.noiseHit(t, 'highpass', 7000, 0.25, 0.05);
    else this.noiseHit(t, 'bandpass', 1500, 0.6, 0.12);
  }

  note(midi: number, t = this.ctx.currentTime, dur = 0.22) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.input);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

let engine: Engine | null = null;
function getEngine(): Engine {
  if (!engine) engine = new Engine();
  if (engine.ctx.state === 'suspended') void engine.ctx.resume();
  return engine;
}

function useSmooth(target: number[], k = 0.18): number[] {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  const tgt = useRef(target);
  tgt.current = target;
  useEffect(() => {
    let id = 0;
    const loop = () => {
      const c = cur.current;
      const t = tgt.current;
      const next = t.map((tv, i) => {
        const cv = c[i] ?? tv;
        const d = tv - cv;
        return Math.abs(d) > 0.0005 ? cv + d * k : tv;
      });
      if (next.length !== c.length || next.some((n, i) => n !== c[i])) {
        cur.current = next;
        setV(next);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [k]);
  return v;
}

const polar = (a: number, r: number): [number, number] => {
  const rad = ((a - 90) * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
};
const arcPath = (a0: number, a1: number, r: number) => {
  const end = Math.max(a1, a0 + 0.01);
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(end, r);
  return `M${x0} ${y0} A${r} ${r} 0 ${end - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

type KnobProps = {
  label: string; value: number; onChange: (v: number) => void; format: (v: number) => string;
  hue: number; def?: number; tip: string;
};

export function Knob({ label, value, onChange, format, hue, def = 0.5, tip }: KnobProps) {
  const [sv] = useSmooth([value], 0.2);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const [active, setActive] = useState(false);
  const angle = -135 + sv * 270;
  const [px, py] = polar(angle, 26);

  const down = (e: RPE<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
    setActive(true);
  };
  const move = (e: RPE<HTMLDivElement>) => {
    if (!drag.current) return;
    onChange(clamp(drag.current.v + (drag.current.y - e.clientY) / (e.shiftKey ? 600 : 180)));
  };
  const up = () => { drag.current = null; setActive(false); };
  const key = (e: RKE<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.01 : 0.05;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { onChange(clamp(value + step)); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { onChange(clamp(value - step)); e.preventDefault(); }
  };

  return (
    <div
      className={`knob ${active ? 'is-active' : ''}`}
      style={{ '--h': hue, '--v': sv } as CSSProperties}
      role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={1}
      aria-valuenow={Number(value.toFixed(2))} aria-valuetext={format(value)} title={tip}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onDoubleClick={() => onChange(def)} onKeyDown={key}
    >
      <svg viewBox="0 0 100 100">
        <defs>
          <radialGradient id={`kb-${label}`} cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#2b2d36" />
            <stop offset="1" stopColor="#0b0c10" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r={44 + sv * 4} className="knob-halo" />
        <path d={arcPath(-135, 135, 38)} className="knob-track" />
        <path d={arcPath(-135, angle, 38)} className="knob-value" />
        {Array.from({ length: 11 }, (_, i) => {
          const a = -135 + i * 27;
          const [x0, y0] = polar(a, 44);
          const [x1, y1] = polar(a, 47);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className={i / 10 <= sv ? 'tick on' : 'tick'} />;
        })}
        <circle cx="50" cy="50" r="30" fill={`url(#kb-${label})`} className="knob-cap" />
        <line x1="50" y1="50" x2={px} y2={py} className="knob-pointer" />
        <circle cx={px} cy={py} r="3" className="knob-dot" />
      </svg>
      <span className="knob-label">{label}</span>
      <span className="knob-readout">{format(value)}</span>
    </div>
  );
}

export function EQ({ bands, onChange, hue }: { bands: number[]; onChange: (b: number[]) => void; hue: number }) {
  const sb = useSmooth(bands, 0.16);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const W = 500, H = 180;
  const xs = EQ_FREQS.map((_, i) => 40 + (i * (W - 80)) / 4);
  const yOf = (v: number) => H - 20 - v * (H - 40);

  const curve = (() => {
    const pts: string[] = [];
    for (let x = 0; x <= W; x += 5) {
      let g = 0;
      sb.forEach((v, i) => {
        const d = (x - xs[i]) / 70;
        g += (v - 0.5) * Math.exp(-d * d);
      });
      pts.push(`${x},${yOf(clamp(0.5 + g))}`);
    }
    return pts;
  })();

  const setFromEvent = (e: RPE<SVGSVGElement>, i: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const y = ((e.clientY - r.top) / r.height) * H;
    const v = clamp((H - 20 - y) / (H - 40));
    onChange(bands.map((b, j) => (j === i ? v : b)));
  };

  return (
    <svg
      ref={svg} className="eq" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ '--h': hue } as CSSProperties}
      onPointerMove={(e) => dragging.current !== null && setFromEvent(e, dragging.current)}
      onPointerUp={() => (dragging.current = null)}
      onPointerLeave={() => (dragging.current = null)}
    >
      <defs>
        <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 95% 60% / .55)`} />
          <stop offset="1" stopColor={`hsl(${hue} 95% 60% / 0)`} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={yOf(g)} y2={yOf(g)} className="eq-grid" />)}
      {xs.map((x) => <line key={x} x1={x} x2={x} y1="10" y2={H - 10} className="eq-grid" />)}
      <polygon points={`0,${H} ${curve.join(' ')} ${W},${H}`} fill="url(#eqfill)" />
      <polyline points={curve.join(' ')} className="eq-line" />
      {xs.map((x, i) => (
        <g key={i} className="eq-node" onPointerDown={(e) => {
          svg.current?.setPointerCapture(e.pointerId);
          dragging.current = i;
          setFromEvent(e as unknown as RPE<SVGSVGElement>, i);
        }}>
          <title>{`Raw Honey EQ · ${EQ_LABELS[i]} Hz · ${((bands[i] - 0.5) * 24).toFixed(1)} dB`}</title>
          <circle cx={x} cy={yOf(sb[i])} r="16" className="eq-hit" />
          <circle cx={x} cy={yOf(sb[i])} r={6 + Math.abs(sb[i] - 0.5) * 8} className="eq-dot" />
          <text x={x} y={H - 4} className="eq-label">{EQ_LABELS[i]}</text>
        </g>
      ))}
    </svg>
  );
}

function Meter({ hue }: { hue: number }) {
  const [lv, setLv] = useState(0);
  useEffect(() => {
    let id = 0;
    let s = 0;
    const loop = () => {
      const target = engine ? clamp(engine.level() * 3) : 0;
      s += (target - s) * (target > s ? 0.5 : 0.08);
      setLv(s);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <svg className="meter" viewBox="0 0 24 120" style={{ '--h': hue } as CSSProperties}>
      {Array.from({ length: 20 }, (_, i) => {
        const on = (19 - i) / 20 < lv;
        return <rect key={i} x="2" y={2 + i * 6} width="20" height="4" rx="1" className={on ? (i < 4 ? 'seg hot' : 'seg on') : 'seg'} />;
      })}
    </svg>
  );
}

function Header({ active, onSelect, playing, onPlay, bpm, onBpm }: {
  active: ModuleId; onSelect: (m: ModuleId) => void; playing: boolean; onPlay: () => void; bpm: number; onBpm: (n: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mod = MODULES.find((m) => m.id === active)!;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = document.documentElement.style;
      r.setProperty('--mx', `${(e.clientX / window.innerWidth) * 100}%`);
      r.setProperty('--my', `${(e.clientY / window.innerHeight) * 100}%`);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let id = 0;
    const data = new Uint8Array(128);
    const loop = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (engine) engine.analyser.getByteFrequencyData(data);
      const n = 64, bw = w / n;
      let energy = 0;
      for (let i = 0; i < n; i++) {
        const idle = 0.12 + 0.08 * Math.sin(t / 700 + i * 0.35);
        const v = Math.max(idle, (data[i] || 0) / 255);
        energy += v;
        ctx.fillStyle = `hsl(${mod.hue + i * 1.5} 90% 60% / ${0.12 + v * 0.35})`;
        ctx.fillRect(i * bw + 1, h - v * h, bw - 2, v * h);
      }
      document.documentElement.style.setProperty('--energy', (energy / n).toFixed(3));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [mod.hue]);

  return (
    <header className="hdr">
      <div className="hdr-glow" />
      <canvas ref={canvas} className="hdr-spectrum" aria-hidden />
      <div className="hdr-inner">
        <div className="brand" title="Beets · Raw Honey · Pastry · Grocery">
          <span className="brand-mark" />
          <div>
            <strong>{mod.name}</strong>
            <nav className="crumbs" aria-label="Breadcrumb">
              <span>Beets · Raw Honey · Pastry · Grocery</span><span>/</span><span>{mod.tag}</span>
            </nav>
          </div>
        </div>
        <nav className="tabs" aria-label="Modules">
          {MODULES.map((m) => (
            <button key={m.id} className={m.id === active ? 'tab on' : 'tab'} style={{ '--h': m.hue } as CSSProperties}
              onClick={() => onSelect(m.id)} title={`${m.name} — ${m.tag}`} aria-current={m.id === active ? 'page' : undefined}>
              <i />{m.name}
            </button>
          ))}
        </nav>
        <div className="transport">
          <button className={playing ? 'play on' : 'play'} onClick={onPlay} title={playing ? 'Stop Beets & Pastry' : 'Play Beets & Pastry'}>
            {playing ? '■' : '▶'}
          </button>
          <label className="bpm" title="Tempo">
            <input type="number" min={60} max={200} value={bpm} onChange={(e) => onBpm(clamp(Number(e.target.value) || 120, 60, 200))} />
            <span>BPM</span>
          </label>
        </div>
      </div>
    </header>
  );
}

const GROCERY_ITEMS: { name: string; tag: string; drum: Drum; pattern: boolean[][] }[] = [
  { name: 'Root Cellar Kick', tag: 'Beets · four-on-floor', drum: 'Kick', pattern: pat(['x...x...x...x...', '....x.......x...', '..x...x...x...x.', '................']) },
  { name: 'Honeycomb Hats', tag: 'Raw Honey · shuffle', drum: 'Hat', pattern: pat(['x.....x...x.....', '....x.......x...', 'xx.xx.xxx.xx.xx.', '............x...']) },
  { name: 'Croissant Snap', tag: 'Pastry · backbeat', drum: 'Clap', pattern: pat(['x..x..x...x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '....x.......x..x']) },
  { name: 'Market Stall Snare', tag: 'Grocery · breakbeat', drum: 'Snare', pattern: pat(['x.x.......x.x...', '....x..x.x..x...', 'x.xxx.x.x.xxx.x.', '.......x........']) },
];
function pat(rows: string[]) { return rows.map((r) => r.split('').map((c) => c === 'x')); }

function Panel({ title, sub, children, className = '' }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-hd"><h2>{title}</h2>{sub && <span>{sub}</span>}</header>
      {children}
    </section>
  );
}

export default function Dashboard({ initial }: { initial: ModuleId }) {
  const fromHash = () => (MODULES.find((m) => `#${m.id}` === window.location.hash)?.id ?? initial);
  const [active, setActive] = useState<ModuleId>(fromHash);
  const [params, setParams] = useState<Params>({ cutoff: 0.8, resonance: 0.2, gain: 0.7, mix: 0.25, eq: [0.5, 0.5, 0.5, 0.5, 0.5] });
  const [beets, setBeets] = useState<boolean[][]>(GROCERY_ITEMS[0].pattern);
  const [pastry, setPastry] = useState<Set<string>>(() => new Set(['0:0', '4:4', '7:8', '5:12']));
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const [bpm, setBpm] = useState(118);
  const mod = MODULES.find((m) => m.id === active)!;
  const beetsRef = useRef(beets); beetsRef.current = beets;
  const pastryRef = useRef(pastry); pastryRef.current = pastry;

  const select = useCallback((m: ModuleId) => { setActive(m); window.history.replaceState(null, '', `#${m}`); }, []);
  useEffect(() => { document.title = `${mod.name} — ${mod.tag} · Beets · Raw Honey · Pastry · Grocery`; }, [mod]);
  useEffect(() => { document.documentElement.style.setProperty('--hue', String(mod.hue)); }, [mod.hue]);
  useEffect(() => { if (engine) engine.set(params); }, [params]);
  useEffect(() => {
    const f = () => setActive(fromHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  });

  useEffect(() => {
    if (!playing) { setStep(-1); return; }
    const e = getEngine();
    e.set(params);
    let s = -1;
    const id = window.setInterval(() => {
      s = (s + 1) % 16;
      const t = e.ctx.currentTime + 0.01;
      beetsRef.current.forEach((row, r) => row[s] && e.hit(DRUMS[r], t));
      ROLL_NOTES.forEach((n, r) => pastryRef.current.has(`${r}:${s}`) && e.note(n, t));
      setStep(s);
    }, 60000 / bpm / 4);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, bpm]);

  const p = (k: keyof Omit<Params, 'eq'>) => (v: number) => setParams((o) => ({ ...o, [k]: v }));
  const fx = (
    <Panel title="Raw Honey FX" sub="Drag · Shift = fine · Double-click = reset" className="rack">
      <div className="knobs">
        <Knob label="Cutoff" hue={mod.hue} value={params.cutoff} def={0.8} onChange={p('cutoff')} tip="Raw Honey filter cutoff"
          format={(v) => { const hz = 20 * Math.pow(1000, v); return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${hz.toFixed(0)}Hz`; }} />
        <Knob label="Resonance" hue={mod.hue} value={params.resonance} def={0.2} onChange={p('resonance')} tip="Raw Honey filter resonance" format={(v) => `Q ${(0.5 + v * 18).toFixed(1)}`} />
        <Knob label="Gain" hue={mod.hue} value={params.gain} def={0.7} onChange={p('gain')} tip="Raw Honey output gain" format={(v) => `${(20 * Math.log10(Math.max(v * 1.2, 0.001))).toFixed(1)}dB`} />
        <Knob label="Dry/Wet" hue={mod.hue} value={params.mix} def={0.25} onChange={p('mix')} tip="Raw Honey echo dry/wet" format={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <div className="rack-meter"><Meter hue={mod.hue} /><span>OUT</span></div>
    </Panel>
  );

  return (
    <div className="app" style={{ '--h': mod.hue } as CSSProperties}>
      <Header active={active} onSelect={select} playing={playing} onPlay={() => setPlaying((v) => !v)} bpm={bpm} onBpm={setBpm} />
      <main className="grid" key={active}>
        {active === 'beets' && (
          <Panel title="Beets" sub="16-step pattern" className="work">
            <div className="seq">
              {DRUMS.map((d, r) => (
                <div className="seq-row" key={d}>
                  <button className="seq-name" onClick={() => getEngine().hit(d)} title={`Beets · audition ${d}`}>{d}</button>
                  {beets[r].map((on, c) => (
                    <button key={c} className={`cell ${on ? 'on' : ''} ${c === step ? 'now' : ''} ${c % 4 === 0 ? 'beat' : ''}`}
                      title={`Beets · ${d} · step ${c + 1}`} aria-pressed={on}
                      onClick={() => { setBeets((b) => b.map((row, i) => (i === r ? row.map((x, j) => (j === c ? !x : x)) : row))); if (!on) getEngine().hit(d); }} />
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        )}
        {active === 'pastry' && (
          <Panel title="Pastry" sub="Piano roll · C4–C5" className="work">
            <div className="roll">
              {ROLL_NOTES.map((n, r) => (
                <div className="roll-row" key={n}>
                  <span className={`roll-key ${NOTE_NAMES[n % 12].includes('#') ? 'black' : ''}`}>{NOTE_NAMES[n % 12]}{Math.floor(n / 12) - 1}</span>
                  {Array.from({ length: 16 }, (_, c) => {
                    const on = pastry.has(`${r}:${c}`);
                    return (
                      <button key={c} className={`cell ${on ? 'on' : ''} ${c === step ? 'now' : ''} ${c % 4 === 0 ? 'beat' : ''}`}
                        title={`Pastry · ${NOTE_NAMES[n % 12]} · step ${c + 1}`} aria-pressed={on}
                        onClick={() => { setPastry((s) => { const x = new Set(s); if (on) x.delete(`${r}:${c}`); else x.add(`${r}:${c}`); return x; }); if (!on) getEngine().note(n); }} />
                    );
                  })}
                </div>
              ))}
            </div>
          </Panel>
        )}
        {active === 'raw-honey' && (
          <Panel title="Raw Honey EQ" sub="5-band · drag the nodes" className="work">
            <EQ bands={params.eq} hue={mod.hue} onChange={(eq) => setParams((o) => ({ ...o, eq }))} />
            <div className="eq-knobs">
              {params.eq.map((v, i) => (
                <Knob key={i} label={EQ_LABELS[i]} hue={mod.hue} value={v} onChange={(nv) => setParams((o) => ({ ...o, eq: o.eq.map((b, j) => (j === i ? nv : b)) }))}
                  tip={`Raw Honey EQ band ${EQ_LABELS[i]} Hz`} format={(x) => `${((x - 0.5) * 24).toFixed(1)}dB`} />
              ))}
            </div>
          </Panel>
        )}
        {active === 'grocery' && (
          <Panel title="Grocery" sub="Sound pantry" className="work">
            <ul className="pantry">
              {GROCERY_ITEMS.map((it) => (
                <li key={it.name}>
                  <button className="pantry-preview" onClick={() => getEngine().hit(it.drum)} title={`Grocery · preview ${it.name}`}>▶</button>
                  <div><strong>{it.name}</strong><span>{it.tag}</span></div>
                  <button className="pantry-load" onClick={() => { setBeets(it.pattern); select('beets'); }} title={`Grocery · stock ${it.name} into Beets`}>Stock in Beets</button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {fx}
      </main>
    </div>
  );
}
