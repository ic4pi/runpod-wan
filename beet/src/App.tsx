import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, FileMusic, FilePlus, Mic, Package, Play, Redo2, Square, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { PianoRoll, noteName, type Picked, type Tool } from '@/components/PianoRoll';
import { DRUM_KEYS, PIANO_KEYS, useKeyboard } from '@/hooks/useKeyboard';
import { useMidiInput } from '@/hooks/useMidiInput';
import { Transport } from '@/lib/transport';
import {
  BAR_OPTIONS, MAX_TRACKS, STEPS_PER_BAR, defaultSession, entryStep, isDrumTrack, loadSession, newTrack, saveSession,
  type Note, type Session, type Track,
} from '@/lib/session';
import { maxLength, copyBar } from '@/lib/notes';
import { CATEGORIES, PRESETS, getPreset, type Category } from '@/lib/synth/presets';
import { DRUMS } from '@/lib/synth/engines';
import { exportBundle, mixToWav, renderMix } from '@/lib/render';
import { sessionToMidi } from '@/lib/midi';
import { shareOrDownload } from '@/lib/audio/export';

const DRUM_ORDER = ['Kick', 'Snare', 'Clap', 'Closed Hat', 'Open Hat', 'Tom', 'Rim', 'Crash'].map((n) => DRUMS.find((d) => d.name === n)!.pitch);
const BASE_BY_CATEGORY: Record<Category, number> = { drums: 36, bass: 36, lead: 60, pad: 48, keys: 48 };
const LENGTHS = [{ v: 1, l: '1/16' }, { v: 2, l: '1/8' }, { v: 4, l: '1/4' }, { v: 8, l: '1/2' }, { v: 16, l: '1 bar' }];
const field = 'min-h-11 border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary';
const label = 'flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function App() {
  const [session, setSession] = useState<Session>(loadSession);
  const [selectedId, setSelectedId] = useState(() => session.tracks[0]?.id ?? '');
  const [playing, setPlaying] = useState(false);
  const [rec, setRec] = useState(false);
  const [noteLen, setNoteLen] = useState(1);
  const [tool, setTool] = useState<Tool>('draw');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [bases, setBases] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [barFrom, setBarFrom] = useState(0);
  const [barTo, setBarTo] = useState(1);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const past = useRef<Session[]>([]);
  const future = useRef<Session[]>([]);
  const [transport] = useState(() => new Transport(() => sessionRef.current));
  const getPosition = useCallback(() => transport.position(), [transport]);

  useEffect(() => { const t = setTimeout(() => saveSession(session), 400); return () => clearTimeout(t); }, [session]);
  useEffect(() => () => transport.stop(), [transport]);

  /** Apply a change. record=true makes it undoable (sliders and typing are not recorded). */
  const apply = useCallback((fn: (s: Session) => Session, record = false) => {
    const prev = sessionRef.current;
    const next = fn(prev);
    if (next === prev) return;
    if (record) { past.current.push(prev); if (past.current.length > 100) past.current.shift(); future.current = []; }
    sessionRef.current = next;
    setSession(next);
  }, []);

  const track = session.tracks.find((t) => t.id === selectedId) ?? session.tracks[0];
  const drum = track ? isDrumTrack(track) : false;
  const base = track ? bases[track.id] ?? BASE_BY_CATEGORY[getPreset(track.presetId).category] : 60;
  const cols = session.bars * STEPS_PER_BAR;
  const pickedNote = track && picked ? track.notes.findIndex((n) => n.pitch === picked.pitch && n.step === picked.step) : -1;

  const patch = (id: string, p: Partial<Track>, record = false) =>
    apply((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...p } : t)) }), record);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(sessionRef.current);
    sessionRef.current = prev; setSession(prev); setPicked(null);
    setSelectedId((id) => (prev.tracks.some((t) => t.id === id) ? id : prev.tracks[0]?.id ?? ''));
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(sessionRef.current);
    sessionRef.current = next; setSession(next); setPicked(null);
    setSelectedId((id) => (next.tracks.some((t) => t.id === id) ? id : next.tracks[0]?.id ?? ''));
  }, []);

  const togglePlay = useCallback(() => {
    if (transport.playing) { transport.stop(); setPlaying(false); } else { transport.start(); setPlaying(true); }
  }, [transport]);

  /** Play a pitch on the selected track (keyboard or MIDI), and record it if Rec is on. */
  const hit = (pitch: number, vel = 100) => {
    if (!track) return;
    transport.preview(track, pitch, vel);
    const pos = transport.position();
    if (!rec || pos === null) return;
    const step = Math.round(pos) % cols;
    if (track.notes.some((n) => n.step === step && n.pitch === pitch)) return;
    patch(track.id, { notes: [...track.notes, { step, pitch, len: 1, vel }] }, true);
  };

  useKeyboard({
    onToggle: togglePlay, onUndo: undo, onRedo: redo,
    onOctave: (d) => track && !drum && setBases((b) => ({ ...b, [track.id]: Math.max(12, Math.min(96, base + d * 12)) })),
    onKey: (k) => {
      if (drum) { const i = DRUM_KEYS[k]; if (i !== undefined) hit(DRUM_ORDER[i]); }
      else { const s = PIANO_KEYS[k]; if (s !== undefined) hit(base + s); }
    },
  });

  const midi = useMidiInput((pitch, vel) => {
    // pads on a drum track: use the drum note if it is one, otherwise spread across the 8 drums
    hit(drum ? (DRUMS.some((d) => d.pitch === pitch) ? pitch : DRUM_ORDER[pitch % 8]) : pitch, vel);
  });

  const addTrack = (presetId: string) => {
    if (session.tracks.length >= MAX_TRACKS) return toast.error(`Up to ${MAX_TRACKS} tracks.`);
    const t = newTrack(presetId, session.tracks);
    apply((s) => ({ ...s, tracks: [...s.tracks, t] }), true);
    setSelectedId(t.id); setPicked(null);
  };

  const duplicateTrack = () => {
    if (!track) return;
    if (session.tracks.length >= MAX_TRACKS) return toast.error(`Up to ${MAX_TRACKS} tracks.`);
    const t: Track = { ...newTrack(track.presetId, session.tracks), name: `${track.name} copy`.slice(0, 24), volume: track.volume, pan: track.pan, startBar: track.startBar, reverb: track.reverb, delay: track.delay, humanize: track.humanize, notes: track.notes.map((n) => ({ ...n })) };
    apply((s) => ({ ...s, tracks: [...s.tracks, t] }), true);
    setSelectedId(t.id);
  };

  const removeTrack = (id: string) => {
    const rest = session.tracks.filter((t) => t.id !== id);
    apply((s) => ({ ...s, tracks: rest }), true);
    if (selectedId === id) setSelectedId(rest[0]?.id ?? '');
    setPicked(null);
  };

  const setBars = (bars: number) => apply((s) => ({ ...s, bars, tracks: s.tracks.map((t) => ({ ...t, startBar: Math.min(t.startBar, bars - 1), notes: t.notes.filter((n) => n.step < bars * STEPS_PER_BAR).map((n) => ({ ...n, len: Math.min(n.len, bars * STEPS_PER_BAR - n.step) })) })) }), true);

  const newProject = () => {
    if (!window.confirm('Start a new project? This deletes the current one.')) return;
    transport.stop(); setPlaying(false);
    const s = defaultSession();
    past.current = []; future.current = [];
    sessionRef.current = s; setSession(s); setSelectedId(s.tracks[0].id); setBases({}); setPicked(null);
  };

  const editNote = (p: Partial<Note>, record: boolean) => {
    if (!track || pickedNote < 0) return;
    const notes = track.notes.map((n, i) => (i === pickedNote ? { ...n, ...p } : n));
    patch(track.id, { notes }, record);
  };
  const changeLen = (d: number) => {
    if (!track || pickedNote < 0) return;
    const n = track.notes[pickedNote];
    const len = Math.max(1, Math.min(n.len + d, maxLength(track.notes, n, pickedNote, cols)));
    if (len !== n.len) editNote({ len }, true);
  };
  const deletePicked = () => {
    if (!track || pickedNote < 0) return;
    patch(track.id, { notes: track.notes.filter((_, i) => i !== pickedNote) }, true); setPicked(null);
  };

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind); transport.stop(); setPlaying(false);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(null); }
  };
  const exportMix = () => run('mix', async () => { await shareOrDownload(mixToWav(await renderMix(session)), 'beet-mixdown.wav', 'Beet mixdown'); });
  const exportStems = () => run('stems', async () => download(await exportBundle(session), 'beet-session.zip'));
  const exportMidi = () => run('midi', async () => {
    const bytes = sessionToMidi(session);
    if (bytes.length < 40) throw new Error('Nothing to export. Add some notes first.');
    download(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' }), 'beet-session.mid');
  });

  const midiLabel = midi === 'connected' ? 'MIDI on' : midi === 'none' ? 'No MIDI' : 'MIDI n/a';

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
          <Button variant={rec ? 'destructive' : 'secondary'} aria-pressed={rec} onClick={() => setRec(!rec)} className="min-h-11" title="Play keys or pads while the loop runs to record them">
            <Mic className="mr-2 h-4 w-4" /> Rec
          </Button>
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Undo" disabled={!past.current.length} onClick={undo}><Undo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Redo2 className="h-4 w-4" /></Button>
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            BPM
            <input type="number" min={60} max={180} value={session.bpm} aria-label="BPM" className={`${field} w-20`}
              onChange={(e) => apply((s) => ({ ...s, bpm: Math.max(60, Math.min(180, Math.round(Number(e.target.value) || 92))) }))} />
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Bars
            <select value={session.bars} aria-label="Bars" className={field} onChange={(e) => setBars(Number(e.target.value))}>
              {BAR_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground" aria-label="MIDI status">{midiLabel}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="min-h-11" onClick={newProject}><FilePlus className="mr-2 h-4 w-4" /> New</Button>
          </div>
        </header>

        <section className="flex flex-wrap gap-2" aria-label="Tracks">
          {session.tracks.map((t) => (
            <div key={t.id} className={`flex items-center border ${t.id === track?.id ? 'border-primary' : 'border-border'}`}>
              <button onClick={() => { setSelectedId(t.id); setPicked(null); }} aria-pressed={t.id === track?.id}
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
            <section className="grid grid-cols-2 gap-4 border border-border bg-card p-4 sm:grid-cols-4">
              <label className={label}>Sound
                <select value={track.presetId} className={`${field} normal-case tracking-normal`} onChange={(e) => patch(track.id, { presetId: e.target.value }, true)}>
                  {CATEGORIES.map((c) => (
                    <optgroup key={c} label={c}>{PRESETS.filter((p) => p.category === c).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                  ))}
                </select>
              </label>
              <label className={label}>Name
                <input value={track.name} maxLength={24} className={`${field} normal-case tracking-normal`} onChange={(e) => patch(track.id, { name: e.target.value })} />
              </label>
              <div><p className={`${label} mb-3`}>Volume</p><Slider min={0} max={1.2} step={0.01} value={[track.volume]} aria-label="Volume" onValueChange={([v]) => patch(track.id, { volume: v })} /></div>
              <div><p className={`${label} mb-3`}>Pan</p><Slider min={-1} max={1} step={0.02} value={[track.pan]} aria-label="Pan" onValueChange={([v]) => patch(track.id, { pan: v })} /></div>
              <div><p className={`${label} mb-3`}>Reverb</p><Slider min={0} max={1} step={0.01} value={[track.reverb]} aria-label="Reverb" onValueChange={([v]) => patch(track.id, { reverb: v })} /></div>
              <div><p className={`${label} mb-3`}>Delay</p><Slider min={0} max={1} step={0.01} value={[track.delay]} aria-label="Delay" onValueChange={([v]) => patch(track.id, { delay: v })} /></div>
              <div><p className={`${label} mb-3`}>Feel (human timing)</p><Slider min={0} max={1} step={0.01} value={[track.humanize]} aria-label="Feel" onValueChange={([v]) => patch(track.id, { humanize: v })} /></div>
              <label className={label}>Enters at bar
                <select value={track.startBar} aria-label="Enters at bar" className={field} onChange={(e) => patch(track.id, { startBar: Number(e.target.value) }, true)}>
                  {Array.from({ length: session.bars }, (_, b) => <option key={b} value={b}>{b + 1}</option>)}
                </select>
              </label>
            </section>

            <section className="flex flex-wrap items-center gap-3">
              <div className="flex border border-border" role="group" aria-label="Tool">
                {(['draw', 'edit'] as Tool[]).map((tl) => (
                  <button key={tl} aria-pressed={tool === tl} onClick={() => { setTool(tl); setPicked(null); }}
                    className={`min-h-11 px-3 font-mono text-[11px] uppercase tracking-[0.1em] ${tool === tl ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>{tl === 'draw' ? 'Draw' : 'Edit notes'}</button>
                ))}
              </div>
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
            </section>

            {tool === 'edit' && (
              <section className="flex flex-wrap items-center gap-4 border border-border bg-card p-3" aria-label="Selected note">
                {pickedNote >= 0 ? (
                  <>
                    <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      {drum ? DRUMS.find((d) => d.pitch === track.notes[pickedNote].pitch)?.name : noteName(track.notes[pickedNote].pitch)} · step {track.notes[pickedNote].step + 1}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <Button variant="secondary" className="min-h-11" aria-label="Shorter" onClick={() => changeLen(-1)}>−</Button>
                      <span aria-label="Length">Length {track.notes[pickedNote].len}</span>
                      <Button variant="secondary" className="min-h-11" aria-label="Longer" onClick={() => changeLen(1)}>+</Button>
                    </div>
                    <div className="flex min-w-48 flex-1 items-center gap-3 font-mono text-xs">
                      Velocity {track.notes[pickedNote].vel}
                      <Slider min={1} max={127} step={1} value={[track.notes[pickedNote].vel]} aria-label="Velocity" onValueChange={([v]) => editNote({ vel: v }, false)} />
                    </div>
                    <Button variant="ghost" className="min-h-11" onClick={deletePicked}><Trash2 className="mr-2 h-4 w-4" /> Delete note</Button>
                  </>
                ) : <span className="text-sm text-muted-foreground">Tap a note to change its length or how hard it hits.</span>}
              </section>
            )}

            <PianoRoll
              notes={track.notes} bars={session.bars} drum={drum} base={base} noteLen={noteLen} tool={tool} picked={picked}
              entry={entryStep(track)} getPosition={getPosition}
              onChange={(notes) => patch(track.id, { notes }, true)}
              onPick={setPicked}
              onPreview={(p) => transport.preview(track, p)}
            />

            <section className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              <label className="flex items-center gap-2">Copy bar
                <select aria-label="Copy from bar" value={barFrom} className={field} onChange={(e) => setBarFrom(Number(e.target.value))}>
                  {Array.from({ length: session.bars }, (_, b) => <option key={b} value={b}>{b + 1}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2">to
                <select aria-label="Copy to bar" value={barTo} className={field} onChange={(e) => setBarTo(Number(e.target.value))}>
                  {Array.from({ length: session.bars }, (_, b) => <option key={b} value={b}>{b + 1}</option>)}
                </select>
              </label>
              <Button variant="secondary" className="min-h-11" disabled={barFrom === barTo || barFrom >= session.bars || barTo >= session.bars} onClick={() => patch(track.id, { notes: copyBar(track.notes, barFrom, barTo) }, true)}>
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={duplicateTrack}>Duplicate track</Button>
              <Button variant="ghost" className="min-h-11" onClick={() => patch(track.id, { notes: [] }, true)}>Clear notes</Button>
              <Button variant="ghost" className="min-h-11" aria-label={`Delete ${track.name}`} onClick={() => removeTrack(track.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete track</Button>
            </section>

            <p className="text-xs normal-case tracking-normal text-muted-foreground">
              Tap a cell to add or remove a note. Keyboard: {drum ? 'A S D F G H J K play the drums' : 'A–L play notes, W E T Y U O P are sharps, Z and X change octave'}. Space plays and stops, Ctrl/Cmd+Z undoes. A plugged-in MIDI keyboard or pad plays the selected track. Turn on Rec to record into the loop.
            </p>
          </>
        ) : (
          <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No tracks. Use “+ Add track”.</div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-5xl gap-2 px-4 py-3">
          <Button className="flex-1" variant="secondary" disabled={!!busy} onClick={exportStems}>
            <Package className="mr-2 h-4 w-4" /> {busy === 'stems' ? 'Rendering…' : 'Stems for Pastry'}
          </Button>
          <Button className="flex-1" variant="secondary" disabled={!!busy} onClick={exportMidi}>
            <FileMusic className="mr-2 h-4 w-4" /> MIDI file
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
