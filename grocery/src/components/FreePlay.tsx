import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { getEngine, type P } from '@/lib/beat/engines';
import { LEADS } from '@/lib/beat/sounds';

/**
 * Free Play — the hub's one free synth (Soft lead). Tap the keys or play a
 * Bluetooth/USB MIDI keyboard. Beet ($4.99) unlocks all 51 presets, 5 engines
 * and the drum kit — this is the taste.
 */

const SOUND = LEADS[0]; // Soft — warm triangle lead
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK: { semi: number; after: number }[] = [
  { semi: 1, after: 0 }, { semi: 3, after: 1 }, { semi: 6, after: 3 }, { semi: 8, after: 4 }, { semi: 10, after: 5 },
];
const BASE = 60; // C4

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (p: number) => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`;

export function FreePlay() {
  const ctxRef = useRef<AudioContext | null>(null);
  const outRef = useRef<GainNode | null>(null);
  const [octave, setOctave] = useState(0);
  const [pressed, setPressed] = useState<number | null>(null);
  const [midi, setMidi] = useState<'off' | 'on' | 'unsupported'>('off');

  const ensure = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const master = ctx.createGain(); master.gain.value = 0.85;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -4; lim.ratio.value = 12; lim.knee.value = 3; lim.attack.value = 0.003; lim.release.value = 0.1;
      master.connect(lim); lim.connect(ctx.destination);
      ctxRef.current = ctx; outRef.current = master;
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return { ctx: ctxRef.current, out: outRef.current! };
  };

  const play = (pitch: number, vel = 100) => {
    const { ctx, out } = ensure();
    const engine = getEngine(SOUND.engine);
    const params = { ...engine.defaults, ...SOUND.params } as P;
    engine.play(ctx, out, { pitch, vel: vel * SOUND.trim, time: ctx.currentTime + 0.01, dur: 0.25 }, params);
  };

  const tap = (pitch: number) => {
    play(pitch);
    setPressed(pitch);
    window.setTimeout(() => setPressed((p) => (p === pitch ? null : p)), 140);
  };

  // Hardware MIDI keyboard (Web MIDI) — same path as tapping keys.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) { setMidi('unsupported'); return; }
    let access: MIDIAccess | null = null;
    let alive = true;
    const bind = () => {
      if (!access || !alive) return;
      let count = 0;
      access.inputs.forEach((input) => {
        count++;
        input.onmidimessage = (e) => {
          const d = e.data;
          if (d && (d[0] & 0xf0) === 0x90 && d[2] > 0) play(d[1], d[2]);
        };
      });
      setMidi(count ? 'on' : 'off');
    };
    navigator.requestMIDIAccess().then((a) => { access = a; a.onstatechange = bind; bind(); }).catch(() => { if (alive) setMidi('unsupported'); });
    return () => { alive = false; if (access) { access.onstatechange = null; access.inputs.forEach((i) => { i.onmidimessage = null; }); } };
  }, []);

  const base = BASE + octave * 12;
  const whites: number[] = [];
  const blacks: { pitch: number; left: number }[] = [];
  for (let oct = 0; oct < 2; oct++) {
    for (const w of WHITE) whites.push(base + oct * 12 + w);
    for (const b of BLACK) blacks.push({ pitch: base + oct * 12 + b.semi, left: ((oct * 7 + b.after + 1) / 14) * 100 });
  }

  return (
    <section className="mt-6 border border-border bg-card p-4" aria-label="Free play synth">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Free play — {SOUND.name} synth
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
            {midi === 'on' ? 'MIDI on' : 'Tap keys or use a MIDI keyboard'}
          </span>
          <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
            <button onClick={() => setOctave((o) => Math.max(-2, o - 1))} aria-label="Octave down"
              className="flex h-9 w-9 items-center justify-center border border-border hover:border-foreground/40 hover:text-foreground">−</button>
            <button onClick={() => setOctave((o) => Math.min(2, o + 1))} aria-label="Octave up"
              className="flex h-9 w-9 items-center justify-center border border-border hover:border-foreground/40 hover:text-foreground">+</button>
          </div>
        </div>
      </div>

      <div className="relative select-none" style={{ touchAction: 'none' }}>
        <div className="flex gap-0.5">
          {whites.map((p) => (
            <button
              key={p}
              onPointerDown={() => tap(p)}
              aria-label={`Play ${noteName(p)}`}
              className={`h-24 flex-1 border-b-2 border-border bg-background transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-primary ${
                pressed === p ? 'bg-primary/25' : 'hover:bg-foreground/5 active:bg-primary/15'
              }`}
            >
              <span className="sr-only">{noteName(p)}</span>
            </button>
          ))}
        </div>
        {blacks.map((b) => (
          <button
            key={b.pitch}
            onPointerDown={() => tap(b.pitch)}
            aria-label={`Play ${noteName(b.pitch)}`}
            className={`absolute top-0 h-14 border border-border bg-foreground/90 transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-primary ${
              pressed === b.pitch ? 'bg-primary' : 'hover:bg-foreground active:bg-primary/80'
            }`}
            style={{ left: `calc(${b.left}% - 1.75%)`, width: '3.5%' }}
          >
            <span className="sr-only">{noteName(b.pitch)}</span>
          </button>
        ))}
      </div>

      <a href="/beet/" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Sparkles className="h-3.5 w-3.5 text-primary/70" />
        One sound here — Beet has all 51 presets, 5 engines and the full drum kit.
      </a>
    </section>
  );
}
