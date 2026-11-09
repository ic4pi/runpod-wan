import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, Package, Play, Square, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_MASTER, forget, measure, play, renderMaster, renderStem, toWav,
  type BTrack, type Master, type Player,
} from '@/lib/engine';
import { importFiles } from '@/lib/importer';
import { shareOrDownload } from '@/lib/audio/export';
import { formatDuration } from '@/lib/audio/wav';

const MAX_TRACKS = 16;
const fmtDb = (x: number) => (isFinite(x) ? `${x.toFixed(1)} dB` : '-inf');

function Knob({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{label}</span><span>{unit === 'dB' ? `${value > 0 ? '+' : ''}${value.toFixed(0)}` : value.toFixed(2)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={label} />
    </div>
  );
}

export default function App() {
  const [tracks, setTracks] = useState<BTrack[]>([]);
  const [master, setMaster] = useState<Master>(DEFAULT_MASTER);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<{ peakDb: number; rmsDb: number } | null>(null);
  const player = useRef<Player | null>(null);
  const live = useRef({ tracks, master });
  live.current = { tracks, master };

  useEffect(() => { player.current?.update(tracks, master); }, [tracks, master]);

  const stop = () => { player.current?.stop(); player.current = null; setPlaying(false); };

  const toggle = async () => {
    if (playing) return stop();
    try {
      const p = await play(live.current.tracks, live.current.master);
      player.current = p; setPlaying(true);
      p.ended.then(() => { if (player.current === p) { player.current = null; setPlaying(false); } });
    } catch { toast.error('Could not play audio'); }
  };

  const patch = (id: string, p: Partial<BTrack>) =>
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  const remove = (id: string) => { stop(); forget(id); setTracks((ts) => ts.filter((t) => t.id !== id)); };

  const onImport = async (list: FileList | null) => {
    if (!list?.length) return;
    const room = MAX_TRACKS - tracks.length;
    const { tracks: added, skipped } = await importFiles([...list]);
    if (added.length > room) toast.error(`Track limit is ${MAX_TRACKS}. Extra tracks were not added.`);
    stop();
    setTracks((ts) => [...ts, ...added.slice(0, Math.max(0, room))]);
    if (skipped.length) toast.error(`Skipped: ${skipped.join(', ')}`);
  };

  const exportMaster = async () => {
    setBusy('master'); stop();
    try {
      const buf = await renderMaster(tracks, master);
      const m = measure(buf);
      setReport({ peakDb: m.peakDb, rmsDb: m.rmsDb });
      await shareOrDownload(toWav(buf), 'bakery-master.wav', 'Bakery master');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed'); }
    finally { setBusy(null); }
  };

  const exportStems = async () => {
    setBusy('stems'); stop();
    try {
      const zip = new JSZip();
      const names = new Map<string, number>();
      for (const t of tracks) {
        const n = (names.get(t.name) ?? 0) + 1; names.set(t.name, n);
        zip.file(`${t.name}${n > 1 ? `-${n}` : ''}.wav`, toWav(await renderStem(t)));
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'bakery-stems.zip' });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { toast.error('Stem export failed'); }
    finally { setBusy(null); }
  };

  const has = tracks.length > 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-5 pb-36 pt-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-medium tracking-tight">
            BAKERY<span className="text-primary">.</span>
            <span className="ml-2 align-middle font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60">Mix &amp; Master</span>
          </h1>
          <label className="inline-flex cursor-pointer items-center bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            <Upload className="mr-2 h-4 w-4" /> Import
            <input type="file" multiple accept="audio/*,.zip,application/zip" className="sr-only"
              onChange={(e) => { onImport(e.target.files); e.target.value = ''; }} />
          </label>
        </header>

        <p className="mt-4 text-sm text-muted-foreground">
          Import audio files or a Produce session .zip (from Sprouts, Beet or Produce). Shape each track, set the master, export.
        </p>

        {!has && (
          <div className="mt-8 border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No tracks yet. Tap Import.
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {tracks.map((t) => (
            <li key={t.id} className="border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatDuration(t.duration)}{t.offset > 0 ? ` · starts ${t.offset.toFixed(1)}s` : ''}
                  </p>
                </div>
                <Button size="sm" variant={t.mute ? 'default' : 'secondary'} aria-pressed={t.mute} onClick={() => patch(t.id, { mute: !t.mute })}>M</Button>
                <Button size="sm" variant={t.solo ? 'default' : 'secondary'} aria-pressed={t.solo} onClick={() => patch(t.id, { solo: !t.solo })}>S</Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${t.name}`} onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Knob label="Volume" value={t.volume} min={0} max={1.5} step={0.01} onChange={(v) => patch(t.id, { volume: v })} />
                <Knob label="Pan" value={t.pan} min={-1} max={1} step={0.02} onChange={(v) => patch(t.id, { pan: v })} />
                <Knob label="Compress" value={t.comp} min={0} max={1} step={0.01} onChange={(v) => patch(t.id, { comp: v })} />
                <Knob label="Low" unit="dB" value={t.eq.low} min={-12} max={12} step={1} onChange={(v) => patch(t.id, { eq: { ...t.eq, low: v } })} />
                <Knob label="Mid" unit="dB" value={t.eq.mid} min={-12} max={12} step={1} onChange={(v) => patch(t.id, { eq: { ...t.eq, mid: v } })} />
                <Knob label="High" unit="dB" value={t.eq.high} min={-12} max={12} step={1} onChange={(v) => patch(t.id, { eq: { ...t.eq, high: v } })} />
              </div>
            </li>
          ))}
        </ul>

        {has && (
          <section className="mt-8 border border-primary/40 bg-card p-4">
            <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-primary">Master</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Knob label="Glue" value={master.glue} min={0} max={1} step={0.01} onChange={(v) => setMaster({ ...master, glue: v })} />
              <Knob label="Loudness" value={master.loudness} min={0} max={1} step={0.01} onChange={(v) => setMaster({ ...master, loudness: v })} />
              <Knob label="Ceiling dB" value={master.ceilingDb} min={-6} max={0} step={0.1} onChange={(v) => setMaster({ ...master, ceilingDb: v })} />
            </div>
            {report && (
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                Last export: peak {fmtDb(report.peakDb)} · average level (RMS) {fmtDb(report.rmsDb)}
              </p>
            )}
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-3xl gap-3 px-5 py-3">
          <Button className="flex-1" variant="secondary" disabled={!has} onClick={toggle}>
            {playing ? <><Square className="mr-2 h-4 w-4" /> Stop</> : <><Play className="mr-2 h-4 w-4" /> Play</>}
          </Button>
          <Button className="flex-1" variant="secondary" disabled={!has || !!busy} onClick={exportStems}>
            <Package className="mr-2 h-4 w-4" /> {busy === 'stems' ? 'Bouncing…' : 'Stems'}
          </Button>
          <Button className="flex-1" disabled={!has || !!busy} onClick={exportMaster}>
            <Download className="mr-2 h-4 w-4" /> {busy === 'master' ? 'Mastering…' : 'Master WAV'}
          </Button>
        </div>
      </div>
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
