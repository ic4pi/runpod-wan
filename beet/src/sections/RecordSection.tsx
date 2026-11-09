import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Circle, Download, Headphones, Loader2, Mic, Play, Save, Share2, Square, TriangleAlert,
} from 'lucide-react';
import { engine } from '@/lib/audio/engine';
import { mixVocalTake } from '@/lib/audio/render';
import { audioBufferToWav, formatDuration } from '@/lib/audio/wav';
import { useSession } from '@/lib/session';
import { getTemplate, TEMPLATES, type Levels } from '@/lib/templates';
import { HaloVisualizer } from '@/components/HaloVisualizer';
import { LevelsPanel } from '@/components/LevelsPanel';
import { playback } from '@/lib/audio/playback';

type Phase = 'idle' | 'recording' | 'mixing' | 'done';

export function RecordSection() {
  const { templateId, setTemplateId, levels, persistTake, playingKey, playBlob, stopPlayback, takes } = useSession();
  const template = getTemplate(templateId);

  const [phase, setPhase] = useState<Phase>('idle');
  const [monitor, setMonitor] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [takeBlob, setTakeBlob] = useState<Blob | null>(null);
  const [takeDuration, setTakeDuration] = useState(0);
  const [mixUrl, setMixUrl] = useState<Blob | null>(null);
  const [abMode, setAbMode] = useState<'dry' | 'mixed'>('mixed');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Keep the live chain in sync with template + level changes
  useEffect(() => {
    if (engine.analyser && phase === 'idle') {
      void engine.applyTemplate(template, monitor, levels).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, levels]);

  useEffect(() => {
    engine.setMonitor(monitor);
  }, [monitor]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const startRecording = useCallback(async () => {
    stopPlayback();
    setMicError(null);
    try {
      if (!engine.analyser) {
        await engine.startMic(template, monitor, levels);
      }
      engine.setMonitor(monitor);
      engine.startRecording();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed((e) => e + 0.1);
      }, 100);
      setPhase('recording');
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Mic access denied. Allow the microphone in your browser settings, then try again.'
        : 'Could not start the microphone on this device.';
      setMicError(msg);
      toast.error(msg);
    }
  }, [template, monitor, levels, stopPlayback]);

  const runMix = useCallback(async (blob: Blob, tpl: typeof template, lv: Levels) => {
    setPhase('mixing');
    try {
      const { buffer } = await mixVocalTake(blob, tpl, lv);
      setMixUrl(audioBufferToWav(buffer));
      setAbMode('mixed');
      setPhase('done');
      toast.success('Mixed. Tap play — that\'s the studio version.');
    } catch {
      setPhase('done');
      toast.error('Mix render failed on this device — your dry take is still playable.');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    try {
      const { blob, duration } = await engine.stopRecording();
      if (duration < 0.4 || blob.size < 1000) {
        setPhase('idle');
        toast.error('Too short — hold the moment a little longer.');
        return;
      }
      setTakeBlob(blob);
      setTakeDuration(duration);
      setMixUrl(null);
      void runMix(blob, template, levels); // auto-mix on stop — the wow moment
    } catch {
      setPhase('idle');
      toast.error('Recording stopped unexpectedly.');
    }
  }, [runMix, template, levels]);

  // Re-mix when the template or levels change with a pending take
  const remixTimer = useRef<number | null>(null);
  useEffect(() => {
    if (takeBlob && phase === 'done') {
      stopPlayback();
      if (remixTimer.current) window.clearTimeout(remixTimer.current);
      remixTimer.current = window.setTimeout(() => {
        void runMix(takeBlob, getTemplate(templateId), levels);
      }, 450); // let fader moves settle before re-rendering
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, levels]);

  const handleKeep = useCallback(async () => {
    if (!takeBlob) return;
    setSaving(true);
    try {
      await persistTake({
        id: crypto.randomUUID(),
        name: `Take · ${template.name} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        createdAt: Date.now(),
        duration: takeDuration,
        templateId,
        blob: takeBlob,
        mixBlob: mixUrl ?? undefined,
        mixTemplateId: mixUrl ? templateId : undefined,
      });
      toast.success('Kept. Find it in the Vault.');
      setTakeBlob(null);
      setMixUrl(null);
      setPhase('idle');
    } catch {
      toast.error('Could not save on this device — download instead.');
    } finally {
      setSaving(false);
    }
  }, [takeBlob, takeDuration, templateId, template, mixUrl, persistTake]);

  const downloadBlob = useCallback((blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const handleShare = useCallback(async () => {
    const blob = abMode === 'mixed' && mixUrl ? mixUrl : takeBlob;
    if (!blob) return;
    const file = new File([blob], `levels-${template.id}-${abMode}.wav`, { type: 'audio/wav' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Levels take' });
        return;
      } catch {
        /* user cancelled */
      }
    }
    downloadBlob(blob, file.name);
  }, [abMode, mixUrl, takeBlob, template, downloadBlob]);

  const handlePlay = useCallback(async () => {
    const key = 'pending';
    if (playingKey === key) {
      stopPlayback();
      return;
    }
    const blob = abMode === 'mixed' && mixUrl ? mixUrl : takeBlob;
    if (blob) await playBlob(key, blob);
  }, [playingKey, abMode, mixUrl, takeBlob, playBlob, stopPlayback]);

  const isPlaying = playingKey === 'pending';

  return (
    <div className="flex flex-col gap-8">
      {/* Template rail */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Sound template</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TEMPLATES.map((t) => {
            const active = t.id === templateId;
            return (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                className={`group min-h-11 shrink-0 border px-4 py-2 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                }`}
              >
                <span className="block font-mono text-xs uppercase tracking-[0.15em]">{t.name}</span>
                <span className={`mt-0.5 block font-mono text-[10px] tracking-[0.1em] ${active ? 'text-primary' : 'text-muted-foreground/60'}`}>
                  {t.short}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{template.blurb}</p>
      </div>

      {/* Levels — the human-worded override faders */}
      <LevelsPanel />

      {/* Record control */}
      <div className="flex flex-col items-center gap-5">
        <div className="font-mono text-3xl tabular-nums tracking-wider text-foreground">
          {phase === 'recording' ? formatDuration(elapsed) : takeBlob ? formatDuration(takeDuration) : '0:00'}
        </div>

        <button
          onClick={phase === 'recording' ? stopRecording : startRecording}
          disabled={phase === 'mixing'}
          aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary active:scale-95 ${
            phase === 'recording'
              ? 'bg-primary text-primary-foreground'
              : 'border border-foreground/25 bg-transparent text-foreground hover:border-primary hover:text-primary'
          }`}
        >
          {phase === 'recording' && (
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/30 [animation-duration:1.6s]" />
          )}
          {phase === 'mixing'
            ? <Loader2 className="h-7 w-7 animate-spin" />
            : phase === 'recording'
              ? <Square className="h-6 w-6 fill-current" />
              : <Circle className="h-6 w-6 fill-current" />}
        </button>

        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {phase === 'recording' ? 'Recording — tap to stop' : phase === 'mixing' ? 'Mixing your take…' : 'Tap to record'}
        </p>

        {/* Monitor */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMonitor(!monitor)}
            className={`flex min-h-11 items-center gap-2 border px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              monitor ? 'border-primary/60 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Headphones className="h-4 w-4" />
            Monitor {monitor ? 'on' : 'off'}
          </button>
        </div>
        {monitor && (
          <p className="flex max-w-xs items-start gap-2 text-center text-xs leading-relaxed text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
            Use wired earbuds — Bluetooth delays your voice. Mic stays dry; the full chain lands at mixdown.
          </p>
        )}
        {micError && (
          <p className="flex max-w-xs items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {micError}
          </p>
        )}
      </div>

      {/* Pending take — A/B console */}
      {takeBlob && phase !== 'recording' && (
        <div className="border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Latest take</span>
            <div className="flex border border-border">
              {(['dry', 'mixed'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setAbMode(m); if (playingKey) stopPlayback(); }}
                  disabled={m === 'mixed' && !mixUrl}
                  className={`min-h-11 px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 ${
                    abMode === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m === 'mixed' ? 'Mixed' : 'Dry'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-4">
            <button
              onClick={handlePlay}
              disabled={phase === 'mixing'}
              aria-label={isPlaying ? 'Stop playback' : 'Play take'}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 disabled:opacity-40"
            >
              {phase === 'mixing' ? <Loader2 className="h-5 w-5 animate-spin" /> : isPlaying ? <Square className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {abMode === 'mixed' ? `${template.name} master` : 'Dry take'} · {formatDuration(takeDuration)}
              </p>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {abMode === 'mixed' ? 'EQ · de-ess · comp · space · limited' : 'Raw phone mic, untouched'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
            <button
              onClick={handleKeep}
              disabled={saving}
              className="flex min-h-11 items-center justify-center gap-2 px-3 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Keep
            </button>
            <button
              onClick={handleShare}
              className="flex min-h-11 items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <button
              onClick={() => {
                const blob = abMode === 'mixed' && mixUrl ? mixUrl : takeBlob;
                if (blob) downloadBlob(blob, `levels-${template.id}-${abMode}.wav`);
              }}
              className="flex min-h-11 items-center justify-center gap-2 px-3 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Download className="h-4 w-4" />
              WAV
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!takeBlob && phase === 'idle' && takes.length === 0 && (
        <div className="flex flex-col items-center gap-3 border border-dashed border-border px-6 py-10 text-center">
          <Mic className="h-5 w-5 text-muted-foreground" />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            No takes yet. Pick a template above, tap the circle, and sing. Mixing is automatic — dry in, master out.
          </p>
        </div>
      )}
    </div>
  );
}

/** The halo lives here so the desktop split panel can reuse it. */
export function RecordHalo({ className }: { className?: string }) {
  const { playingKey } = useSession();
  const [recLive, setRecLive] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setRecLive(engine.recording), 200);
    return () => window.clearInterval(id);
  }, []);
  const analyser = playingKey ? playback.analyser : engine.analyser;
  const mode = playingKey ? 'playback' : recLive ? 'live' : 'idle';
  return <HaloVisualizer analyser={analyser} mode={mode} className={className} />;
}
