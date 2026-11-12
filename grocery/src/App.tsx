import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FilePlus, Mic, Play, Square, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MAX_NUDGE, clearSession, emptySlots, loadSession, saveSession, type Slots, type Track } from '@/lib/store';
import { forget, forgetAll, inspect, mixdown, play, type Player } from '@/lib/audio';
import { formatDuration } from '@/lib/audio/wav';
import { shareOrDownload } from '@/lib/audio/export';
import { useSmk } from '@/lib/smk';
import { BeatMaker } from '@/components/BeatMaker';
import { FreePlay } from '@/components/FreePlay';

const newId = () => crypto.randomUUID();

export default function App() {
  const [slots, setSlots] = useState<Slots>(emptySlots());
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const player = useRef<Player | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useEffect(() => { loadSession().then((s) => { setSlots(s); setReady(true); }); }, []);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => saveSession(slots), 400);
    return () => clearTimeout(t);
  }, [slots, ready]);
  useEffect(() => { player.current?.update(slots); }, [slots]);

  const hasAudio = slots.some(Boolean);

  const stopPlayback = useCallback(() => {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(async (skipSlot?: number) => {
    stopPlayback();
    try {
      const p = await play(slotsRef.current, skipSlot);
      player.current = p;
      setPlaying(true);
      p.ended.then(() => { if (player.current === p) { player.current = null; setPlaying(false); } });
    } catch {
      toast.error('Could not play audio');
    }
  }, [stopPlayback]);

  const setTrack = (i: number, t: Track | null) =>
    setSlots((s) => { const n = [...s]; n[i] = t; return n; });

  const patch = (i: number, p: Partial<Track>) =>
    setSlots((s) => { const n = [...s]; const t = n[i]; if (t) n[i] = { ...t, ...p }; return n; });

  /** Moving a track while it plays restarts playback so you hear the new timing. */
  const restartIfPlaying = () => { if (player.current) setTimeout(() => { void startPlayback(); }, 60); };
  const nudgeTo = (i: number, seconds: number) => patch(i, { offset: Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, Math.round(seconds * 1000) / 1000)) });
  const nudgeBy = (i: number, delta: number) => { nudgeTo(i, (slotsRef.current[i]?.offset ?? 0) + delta); restartIfPlaying(); };

  const uploads = slots.filter((t): t is Track => !!t && t.origin === 'upload');
  const lengths = uploads.map((t) => t.duration);
  const lengthMismatch = uploads.length >= 2 && Math.max(...lengths) - Math.min(...lengths) > 0.05;
  const fmtMs = (sec: number) => `${sec < 0 ? '−' : '+'}${Math.round(Math.abs(sec) * 1000)} ms`;

  /** The beat maker hands over a finished beat; it takes the first empty backing slot. */
  const addBeat = (blob: Blob, name: string, duration: number) => {
    const free = slotsRef.current.findIndex((t, i) => i > 0 && !t);
    if (free < 0) return;
    stopPlayback();
    setTrack(free, { id: newId(), name, kind: 'backing', blob, duration, volume: 0.8, pan: 0, offset: 0, lead: 0, origin: 'beat' });
  };
  const hasFreeBacking = slots.some((t, i) => i > 0 && !t);

  const remove = (i: number) => {
    const t = slots[i];
    if (t) forget(t.id);
    stopPlayback();
    setTrack(i, null);
  };

  const addFile = async (i: number, file: File) => {
    try {
      const { duration, lead } = await inspect(file);
      stopPlayback();
      setTrack(i, {
        id: newId(), name: file.name.replace(/\.[^.]+$/, ''), kind: 'backing',
        blob: file, duration, volume: 0.8, pan: 0, offset: 0, lead, origin: 'upload',
      });
    } catch {
      toast.error('That file is not audio this device can read');
    }
  };

  const toggleRecord = async () => {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopPlayback();
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType });
        try {
          const { duration, lead } = await inspect(blob);
          const old = slotsRef.current[0];
          if (old) forget(old.id);
          setTrack(0, { id: newId(), name: 'Vocal', kind: 'vocal', blob, duration, volume: 1, pan: 0, offset: 0, lead, origin: 'rec' });
        } catch {
          toast.error('Recording could not be read');
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      // Backing tracks play while you record. Headphones recommended.
      if (slotsRef.current.slice(1).some(Boolean)) startPlayback(0);
    } catch {
      toast.error('Microphone blocked. Allow it in your browser settings.');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      stopPlayback();
      const wav = await mixdown(slots);
      await shareOrDownload(wav, 'grocery-mixdown.wav', 'Grocery mixdown');
    } catch {
      toast.error('Mixdown failed');
    } finally {
      setBusy(false);
    }
  };

  const newProject = async () => {
    stopPlayback();
    forgetAll();
    await clearSession();
    setSlots(emptySlots());
    setConfirmNew(false);
  };

  // SMK-25 knobs + transport (see lib/smk.ts). Bank A knobs 1–6 ride the six
  // track volumes; transport plays, stops, and toggles recording.
  const smk = useSmk((a) => {
    if (a.type === 'play') void startPlayback();
    else if (a.type === 'stop') stopPlayback();
    else if (a.type === 'record-toggle') void toggleRecord();
    else if (a.type === 'knob' && a.index < 6) patch(a.index, { volume: Math.round(a.value * 1.5 * 100) / 100 });
  });

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-5 pb-32 pt-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-medium tracking-tight">
            GROCERY<span className="text-primary">.</span>
            <span className="ml-2 align-middle font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60">Free</span>
          </h1>
          <div className="flex items-center gap-1">
            {smk === 'connected' && (
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">SMK on</span>
            )}
            <a
              href="/account/"
              className="inline-flex min-h-9 items-center px-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              More modules
            </a>
            <Button variant="ghost" size="sm" onClick={() => (hasAudio ? setConfirmNew(true) : newProject())}>
              <FilePlus className="mr-2 h-4 w-4" /> New project
            </Button>
          </div>
        </header>

        <p className="mt-4 text-sm text-muted-foreground">
          Record a vocal, add up to 5 backing tracks, set levels, save the mixdown. One project at a time.
        </p>

        <BeatMaker canAdd={hasFreeBacking} onAdd={addBeat} onPreviewStart={stopPlayback} startOpen={!slots.slice(1).some(Boolean)} />

        <FreePlay />

        {lengthMismatch && (
          <p role="status" className="mt-4 border border-primary/40 bg-primary/5 p-3 text-sm text-foreground">
            Your uploaded tracks are different lengths ({Math.min(...lengths).toFixed(1)}s to {Math.max(...lengths).toFixed(1)}s).
            Tracks exported from one project are normally exactly the same length. If one was trimmed at the start,
            it will play too early. Use <strong>Nudge</strong> on that track to line it up, then press Play.
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {slots.map((t, i) => (
            <li key={i} className="border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="w-6 font-mono text-xs text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t ? t.name : i === 0 ? 'Vocal (record)' : 'Backing track (upload)'}</p>
                  {t && <p className="font-mono text-[10px] text-muted-foreground">{formatDuration(t.duration)}</p>}
                </div>
                {i === 0 && (
                  <Button size="sm" variant={recording ? 'destructive' : 'secondary'} onClick={toggleRecord}>
                    {recording ? <><Square className="mr-2 h-4 w-4" /> Stop</> : <><Mic className="mr-2 h-4 w-4" /> {t ? 'Redo' : 'Record'}</>}
                  </Button>
                )}
                {i > 0 && (
                  <label className="inline-flex cursor-pointer items-center bg-secondary px-3 py-2 text-xs hover:bg-secondary/80">
                    <Upload className="mr-2 h-4 w-4" /> {t ? 'Replace' : 'Add'}
                    <input type="file" accept="audio/*" className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(i, f); e.target.value = ''; }} />
                  </label>
                )}
                {t && (
                  <Button size="icon" variant="ghost" aria-label={`Remove track ${i + 1}`} onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {t && (
                <div className="mt-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Volume</p>
                    <Slider min={0} max={1.5} step={0.01} value={[t.volume]} onValueChange={([v]) => patch(i, { volume: v })} />
                  </div>
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Pan</p>
                    <Slider min={-1} max={1} step={0.02} value={[t.pan]} onValueChange={([v]) => patch(i, { pan: v })} />
                  </div>
                </div>
              )}
              {t && (
                <div className="mt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span>Nudge {fmtMs(t.offset)}</span>
                    <span>{t.lead > 0.05 ? `first sound at ${t.lead.toFixed(2)}s` : 'starts right away'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" aria-label={`Move track ${i + 1} earlier by 10 milliseconds`} onClick={() => nudgeBy(i, -0.01)}>{'−'}10</Button>
                    <Slider min={-2000} max={2000} step={5} value={[Math.round(t.offset * 1000)]} aria-label={`Nudge track ${i + 1}`}
                      onValueChange={([v]) => nudgeTo(i, v / 1000)} onValueCommit={() => restartIfPlaying()} />
                    <Button size="sm" variant="secondary" aria-label={`Move track ${i + 1} later by 10 milliseconds`} onClick={() => nudgeBy(i, 0.01)}>+10</Button>
                    <Button size="sm" variant="ghost" disabled={t.offset === 0} onClick={() => { nudgeTo(i, 0); restartIfPlaying(); }}>Reset</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur-sm"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-2xl gap-3 px-5 py-3">
          <Button className="flex-1" variant="secondary" disabled={!hasAudio || recording}
            onClick={() => (playing ? stopPlayback() : startPlayback())}>
            {playing ? <><Square className="mr-2 h-4 w-4" /> Stop</> : <><Play className="mr-2 h-4 w-4" /> Play</>}
          </Button>
          <Button className="flex-1" disabled={!hasAudio || recording || busy} onClick={save}>
            <Download className="mr-2 h-4 w-4" /> {busy ? 'Mixing…' : 'Save mixdown'}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmNew} onOpenChange={setConfirmNew}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new project?</AlertDialogTitle>
            <AlertDialogDescription>
              The free version keeps one project. Starting a new one deletes the current project. Save the mixdown first if you want to keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current</AlertDialogCancel>
            <AlertDialogAction onClick={newProject}>Delete and start new</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
