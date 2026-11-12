import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Dices, Play, Plus, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { getCtx } from '@/lib/audio';
import { audioBufferToWav } from '@/lib/audio/wav';
import { KEY_NAMES, MAX_BPM, MIN_BPM, TEMPLATES, clampBpm, generateBeat, getTemplate } from '@/lib/beat/patterns';
import { renderBeat } from '@/lib/beat/render';
import { BASS, LEADS, PADS, find } from '@/lib/beat/sounds';

const field = 'min-h-11 w-full border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary';
const label = 'flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground';

interface Props {
  /** false when all 5 backing slots are in use */
  canAdd: boolean;
  onAdd: (blob: Blob, name: string, duration: number) => void;
  /** pause the main player when a preview starts */
  onPreviewStart: () => void;
  startOpen: boolean;
}

export function BeatMaker({ canAdd, onAdd, onPreviewStart, startOpen }: Props) {
  const [open, setOpen] = useState(startOpen);
  const [kit, setKit] = useState('boom');
  const [bpm, setBpm] = useState(() => getTemplate('boom').bpm);
  const [key, setKey] = useState(9); // A
  const [bars, setBars] = useState(16);
  const [bass, setBass] = useState('sub');
  const [pad, setPad] = useState('warm');
  const [lead, setLead] = useState('soft');
  const [seed, setSeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const source = useRef<AudioBufferSourceNode | null>(null);
  const cache = useRef<{ id: string; buffer: AudioBuffer } | null>(null);
  const settingsId = JSON.stringify([kit, bpm, key, bars, bass, pad, lead, seed]);
  const settingsRef = useRef(settingsId);
  settingsRef.current = settingsId;

  const template = getTemplate(kit);
  const pickKit = (id: string) => { setKit(id); setBpm(getTemplate(id).bpm); }; // a new kit starts at its own tempo

  const stopPreview = useCallback(() => {
    const s = source.current;
    if (s) { s.onended = null; try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    source.current = null; setPreviewing(false);
  }, []);
  useEffect(() => stopPreview, [stopPreview]);

  /** Renders the beat for the current settings, reusing the last render if nothing changed. */
  const ensure = useCallback(async (): Promise<AudioBuffer> => {
    const id = settingsRef.current;
    if (cache.current?.id === id) return cache.current.buffer;
    const tpl = getTemplate(kit);
    const plan = generateBeat({ template: tpl, key, bars, seed, bpm });
    const buffer = await renderBeat(plan, tpl, { bass: find(BASS, bass), pad: find(PADS, pad), lead: find(LEADS, lead) });
    cache.current = { id, buffer };
    return buffer;
  }, [kit, bpm, key, bars, bass, pad, lead, seed]);

  const startPreview = useCallback(async () => {
    setBusy(true);
    try {
      const buffer = await ensure();
      const ctx = getCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      stopPreview(); onPreviewStart();
      const src = ctx.createBufferSource();
      src.buffer = buffer; src.loop = true; src.connect(ctx.destination); src.start();
      source.current = src; setPreviewing(true);
    } catch { toast.error('Could not make the beat'); }
    finally { setBusy(false); }
  }, [ensure, onPreviewStart, stopPreview]);

  // changing a choice while it plays re-makes the beat and keeps going
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!source.current) return;
    const t = setTimeout(() => { void startPreview(); }, 300);
    return () => clearTimeout(t);
  }, [settingsId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    setBusy(true);
    try {
      const buffer = await ensure();
      stopPreview();
      onAdd(audioBufferToWav(buffer), `Beat: ${template.name}`, buffer.duration);
      toast.success('Added to your project as a backing track.');
    } catch { toast.error('Could not make the beat'); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-6 border border-border bg-card" aria-label="Make a beat">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left focus-visible:outline-2 focus-visible:outline-primary">
        <span>
          <span className="block text-sm font-medium">Make a beat</span>
          <span className="block text-xs text-muted-foreground">Pick a kit and a few sounds. No music skills needed.</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <div>
            <p className={`${label} mb-2`}>Kit</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Kit">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" aria-pressed={t.id === kit} onClick={() => pickKit(t.id)}
                  className={`min-h-14 border px-2 text-left text-sm ${t.id === kit ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <span className="block">{t.name}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{t.bpm} BPM</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{template.blurb}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Tempo</span>
              <button type="button" disabled={bpm === template.bpm} onClick={() => setBpm(template.bpm)}
                className="min-h-9 px-2 normal-case tracking-normal text-muted-foreground hover:text-foreground disabled:opacity-40">
                Reset to {template.bpm}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" className="min-h-11 min-w-11" aria-label="Slower by 1 BPM" onClick={() => setBpm((b) => clampBpm(b - 1))}>{'\u2212'}</Button>
              <input type="number" inputMode="numeric" min={MIN_BPM} max={MAX_BPM} value={bpm} aria-label="Tempo in BPM"
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && e.target.value !== '') setBpm(Math.max(1, Math.min(999, Math.round(v)))); }}
                onBlur={() => setBpm((b) => clampBpm(b))}
                className="min-h-11 w-20 border border-border bg-card px-2 text-center text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary" />
              <Button size="sm" variant="secondary" className="min-h-11 min-w-11" aria-label="Faster by 1 BPM" onClick={() => setBpm((b) => clampBpm(b + 1))}>+</Button>
              <Slider min={MIN_BPM} max={MAX_BPM} step={1} value={[clampBpm(bpm)]} aria-label="Tempo" onValueChange={([v]) => setBpm(v)} />
              <span className="w-10 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">BPM</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <label className={label}>Key
              <select className={field} value={key} aria-label="Key" onChange={(e) => setKey(Number(e.target.value))}>
                {KEY_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
              </select>
            </label>
            <label className={label}>Bass
              <select className={field} value={bass} aria-label="Bass sound" onChange={(e) => setBass(e.target.value)}>
                <option value="off">Off</option>{BASS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className={label}>Pad
              <select className={field} value={pad} aria-label="Pad sound" onChange={(e) => setPad(e.target.value)}>
                <option value="off">Off</option>{PADS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className={label}>Lead
              <select className={field} value={lead} aria-label="Lead sound" onChange={(e) => setLead(e.target.value)}>
                <option value="off">Off</option>{LEADS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className={label}>Length
              <select className={field} value={bars} aria-label="Length in bars" onChange={(e) => setBars(Number(e.target.value))}>
                {[8, 16, 32].map((b) => <option key={b} value={b}>{b} bars</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => (previewing ? stopPreview() : void startPreview())}>
              {previewing ? <><Square className="mr-2 h-4 w-4" /> Stop</> : <><Play className="mr-2 h-4 w-4" /> {busy ? 'Making…' : 'Preview'}</>}
            </Button>
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setSeed((s) => s + 1)} title="New bass and melody ideas">
              <Dices className="mr-2 h-4 w-4" /> Shuffle
            </Button>
            <Button className="min-h-11" disabled={busy || !canAdd} onClick={() => void add()}>
              <Plus className="mr-2 h-4 w-4" /> Add to project
            </Button>
          </div>
          {!canAdd && <p className="text-xs text-muted-foreground">All 5 backing slots are in use. Remove one to add this beat.</p>}
        </div>
      )}
    </section>
  );
}
