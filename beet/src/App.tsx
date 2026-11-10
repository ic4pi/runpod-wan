import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FilePlus, Mic, Package, Play, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { PianoRoll, noteName } from '@/components/PianoRoll';
import { DRUM_KEYS, PIANO_KEYS, useKeyboard } from '@/hooks/useKeyboard';
import { Transport } from '@/lib/transport';
import {
  BAR_OPTIONS, MAX_TRACKS, STEPS_PER_BAR, defaultSession, isDrumTrack, loadSession, newTrack, saveSession,
  type Note, type Session, type Track,
} from '@/lib/session';
import { CATEGORIES, PRESETS, getPreset, type Category } from '@/lib/synth/presets';
import { DRUMS } from '@/lib/synth/engines';
import { exportBundle, mixToWav, renderMix } from '@/lib/render';
import { shareOrDownload } from '@/lib/audio/export';

const DRUM_ORDER = ['Kick', 'Snare', 'Clap', 'Closed Hat', 'Open Hat', 'Tom', 'Rim', 'Crash'].map((n) => DRUMS.find((d) => d.name === n)!.pitch);
const BASE_BY_CATEGORY: Record<Category, number> = { drums: 36, bass: 36, lead: 60, pad: 48, keys: 48 };
const LENGTHS = [{ v: 1, l: '1/16' }, { v: 2, l: '1/8' }, { v: 4, l: '1/4' }, { v: 8, l: '1/2' }, { v: 16, l: '1 bar' }];
const field = 'min-h-11 border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary';

export default function App() {
  const [session, setSession] = useState<Session>(loadSession);
  const [selectedId, setSelectedId] = useState(() => session.tracks[0]?.id ?? '');
  const [playing, setPlaying] = useState(false);
  const [rec, setRec] = useState(false);
  const [noteLen, setNoteLen] = useState(1);
  const [bases, setBases] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [transport] = useState(() => new Transport(() => sessionRef.current));
  const getPosition = useCallback(() => transport.position(), [transport]);

  useEffect(() => { const t = setTimeout(() => saveSession(session), 400); return () => clearTimeout(t); }, [session]);
  useEffect(() => () => transport.stop(), [transport]);

  const track = session.tracks.find((t) => t.id === selectedId) ?? session.tracks[0];
  const drum = track ? isDrumTrack(track) : false;
  const base = track ? bases[track.id] ?? BASE_BY_CATEGORY[getPreset(track.presetId).category] : 60;

  const patch = (id: string, p: Partial<Track>) =>
    setSession((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

  const togglePlay = useCallback(() => {
    if (transport.playing) { transport.stop(); setPlaying(false); } else { transport.start(); setPlaying(true); }
  }, [transport]);

  const addNoteLive = (t: Track, pitch: number) => {
    const pos = transport.position();
    if (!rec || pos === null) return;
    const total = sessionRef.current.bars * STEPS_PER_BAR;
    const step = Math.round(pos) % total;
    if (t.notes.some((n) => n.step === step && n.pitch === pitch)) return;
    patch(t.id, { notes: [...t.notes, { step, pitch, len: 1, vel: 100 }] });
  };

  useKeyboard({
    onToggle: togglePlay,
    onOctave: (d) => track && !drum && setBases((b) => ({ ...b, [track.id]: Math.max(12, Math.min(96, base + d * 12)) })),
    onKey: (k) => {
      if (!track) return;
      let pitch: number | undefined;
      if (drum) { const i = DRUM_KEYS[k]; if (i !== undefined) pitch = DRUM_ORDER[i]; }
      else { const s = PIANO_KEYS[k]; if (s !== undefined) pitch = base + s; }
      if (pitch === undefined) return;
      transport.preview(track, pitch);
      addNoteLive(track, pitch);
    },
  });

  const addTrack = (presetId: string) => {
    if (session.tracks.length >= MAX_TRACKS) return toast.error(`Up to ${MAX_TRACKS} tracks.`);
    const t = newTrack(presetId, session.tracks);
    setSession((s) => ({ ...s, tracks: [...s.tracks, t] }));
    setSelectedId(t.id);
  };

  const removeTrack = (id: string) => {
    const rest = session.tracks.filter((t) => t.id !== id);
    setSession({ ...session, tracks: rest });
    if (selectedId === id) setSelectedId(rest[0]?.id ?? '');
  };

  const newProject = () => {
    if (!window.confirm('Start a new project? This deletes the current one.')) return;
    transport.stop(); setPlaying(false);
    const s = defaultSession();
    setSession(s); setSelectedId(s.tracks[0].id); setBases({});
  };

  const exportMix = async () => {
    setBusy('mix'); transport.stop(); setPlaying(false);
    try { await shareOrDownload(mixToWav(await renderMix(session)), 'beet-mixdown.wav', 'Beet mixdown'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed'); }
    finally { setBusy(null); }
  };

  const exportStems = async () => {
    setBusy('stems'); transport.stop(); setPlaying(false);
    try {
      const blob = await exportBundle(session);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: 'beet-session.zip' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed'); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="mr-2 text-xl font-medium tracking-tight">
            BEET<span className="text-primary">.</span>
            <span className="ml-2 align-middle font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60">Synth &amp; Drums</span>
          </h1>
          <Button onClick={togglePlay} className="min-h-11 min-w-24" aria-label={playing ? 'Stop' : 'Play'}>
            {playing ? <><Square className="mr-2 h-4 w-4" /> Stop</> : <><Play className="mr-2 h-4 w-4" /> Play</>}
          </Button>
          <Button variant={rec ? 'destructive' : 'secondary'} aria-pressed={rec} onClick={() => setRec(!rec)} className="min-h-11" title="Play keys while the loop runs to record them">
            <Mic className="mr-2 h-4 w-4" /> Rec
          </Button>
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            BPM
            <input type="number" min={60} max={180} value={session.bpm} aria-label="BPM" className={`${field} w-20`}
              onChange={(e) => setSession({ ...session, bpm: Math.max(60, Math.min(180, Math.round(Number(e.target.value) || 92))) })} />
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Bars
            <select value={session.bars} aria-label="Bars" className={field}
              onChange={(e) => setSession({ ...session, bars: Number(e.target.value) })}>
              {BAR_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="min-h-11" onClick={newProject}><FilePlus className="mr-2 h-4 w-4" /> New</Button>
          </div>
        </header>

        {/* tracks */}
        <section className="flex flex-wrap gap-2" aria-label="Tracks">
          {session.tracks.map((t) => (
            <div key={t.id} className={`flex items-center border ${t.id === track?.id ? 'border-primary' : 'border-border'}`}>
              <button onClick={() => setSelectedId(t.id)} aria-pressed={t.id === track?.id}
                className={`min-h-11 px-3 text-sm ${t.id === track?.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{t.name}</button>
              <button onClick={() => patch(t.id, { mute: !t.mute })} aria-pressed={t.mute} aria-label={`Mute ${t.name}`}
                className={`min-h-11 w-9 font-mono text-xs ${t.mute ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>M</button>
              <button onClick={() => patch(t.id, { solo: !t.solo })} aria-pressed={t.solo} aria-label={`Solo ${t.name}`}
                className={`min-h-11 w-9 font-mono text-xs ${t.solo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>S</button>
            </div>
          ))}
          {session.tracks.length < MAX_TRACKS && (
            <select aria-label="Add track" className={field} value="" onChange={(e) => e.target.value && addTrack(e.target.value)}>
              <option value="">+ Add track</option>
              {CATEGORIES.map((c) => (
                <optgroup key={c} label={c}>{PRESETS.filter((p) => p.category === c).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
              ))}
            </select>
          )}
        </section>

        {track ? (
          <>
            <section className="grid grid-cols-1 gap-4 border border-border bg-card p-4 sm:grid-cols-4">
              <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Sound
                <select value={track.presetId} className={`${field} normal-case tracking-normal`}
                  onChange={(e) => patch(track.id, { presetId: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <optgroup key={c} label={c}>{PRESETS.filter((p) => p.category === c).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Name
                <input value={track.name} maxLength={24} className={`${field} normal-case tracking-normal`} onChange={(e) => patch(track.id, { name: e.target.value })} />
              </label>
              <div>
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Volume</p>
                <Slider min={0} max={1.2} step={0.01} value={[track.volume]} aria-label="Volume" onValueChange={([v]) => patch(track.id, { volume: v })} />
              </div>
              <div>
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Pan</p>
                <Slider min={-1} max={1} step={0.02} value={[track.pan]} aria-label="Pan" onValueChange={([v]) => patch(track.id, { pan: v })} />
              </div>
            </section>

            <section className="flex flex-wrap items-center gap-3">
              <div className="flex border border-border" role="group" aria-label="Note length">
                {LENGTHS.map((l) => (
                  <button key={l.v} aria-pressed={noteLen === l.v} onClick={() => setNoteLen(l.v)}
                    className={`min-h-11 px-3 font-mono text-[11px] uppercase tracking-[0.1em] ${noteLen === l.v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>{l.l}</button>
                ))}
              </div>
              {!drum && (
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  <Button variant="secondary" className="min-h-11" aria-label="Octave down" onClick={() => setBases((b) => ({ ...b, [track.id]: Math.max(12, base - 12) }))}>−</Button>
                  {noteName(base)}–{noteName(base + 23)}
                  <Button variant="secondary" className="min-h-11" aria-label="Octave up" onClick={() => setBases((b) => ({ ...b, [track.id]: Math.min(96, base + 12) }))}>+</Button>
                </div>
              )}
              <Button variant="ghost" className="ml-auto min-h-11" onClick={() => patch(track.id, { notes: [] })}>Clear notes</Button>
              <Button variant="ghost" className="min-h-11" aria-label={`Delete ${track.name}`} onClick={() => removeTrack(track.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete track</Button>
            </section>

            <PianoRoll
              notes={track.notes} bars={session.bars} drum={drum} base={base} noteLen={noteLen}
              getPosition={getPosition}
              onChange={(notes: Note[]) => patch(track.id, { notes })}
              onPreview={(p) => transport.preview(track, p)}
            />
            <p className="text-xs text-muted-foreground">
              Tap a cell to add or remove a note. Keyboard: {drum ? 'A S D F G H J K play the drums' : 'A–L play notes, W E T Y U O P are sharps, Z and X change octave'}. Space plays and stops. Turn on Rec to record keys into the loop.
            </p>
          </>
        ) : (
          <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No tracks. Use “+ Add track”.</div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-5xl gap-3 px-4 py-3">
          <Button className="flex-1" variant="secondary" disabled={!!busy} onClick={exportStems}>
            <Package className="mr-2 h-4 w-4" /> {busy === 'stems' ? 'Rendering…' : 'Stems for Bakery'}
          </Button>
          <Button className="flex-1" disabled={!!busy} onClick={exportMix}>
            <Download className="mr-2 h-4 w-4" /> {busy === 'mix' ? 'Rendering…' : 'Mixdown WAV'}
          </Button>
        </div>
      </div>
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
