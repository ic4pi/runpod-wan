import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Circle, Download, Headphones, Loader2, Mic, Play, Share2, Square, Trash2, TriangleAlert, Upload, Volume2, VolumeX } from 'lucide-react';
import { engine } from '@/lib/audio/engine';
import { cancelBleed, decodeBlob, mixStems } from '@/lib/audio/render';
import { downloadBlob, shareOrDownload } from '@/lib/audio/export';
import { audioBufferToWav, formatDuration } from '@/lib/audio/wav';
import { useSession } from '@/lib/session';
import { TEMPLATES, getTemplate, guessRole } from '@/lib/templates';
import { LevelsPanel } from '@/components/LevelsPanel';

/**
 * Sprouts Pro mixer: exactly four tracks.
 * Track 1 is the vocal and it records (headphones or speaker, with the other
 * tracks playing along). Tracks 2-4 take a beat, bass or any stem.
 * Mix runs everything through the chosen template, then masters to WAV.
 */
interface Slot {
  name: string;
  buffer: AudioBuffer;
  volume: number; // 0..1.5
  pan: number; // -1..1
  muted: boolean;
  role: 'beat' | 'bass';
}

const MAX_FILE_BYTES = 60 * 1024 * 1024;
const SLOT_COUNT = 4;

/** Apply volume and balance to a copy of a buffer (stereo out). Unity at centre. */
function shape(src: AudioBuffer, volume: number, pan: number): AudioBuffer {
  const out = new AudioBuffer({ length: src.length, numberOfChannels: 2, sampleRate: src.sampleRate });
  const gl = volume * (pan <= 0 ? 1 : Math.cos(pan * Math.PI / 2));
  const gr = volume * (pan >= 0 ? 1 : Math.cos(-pan * Math.PI / 2));
  for (let c = 0; c < 2; c++) {
    const s = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
    const o = out.getChannelData(c);
    const g = c === 0 ? gl : gr;
    for (let i = 0; i < s.length; i++) o[i] = s[i] * g;
  }
  return out;
}

/** Plain sum of the playing tracks, used as the headphone/speaker backing while recording. */
function sumBacking(buffers: AudioBuffer[]): AudioBuffer {
  const sr = buffers[0].sampleRate;
  const len = Math.max(...buffers.map((b) => b.length));
  const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  const trim = 1 / Math.sqrt(buffers.length);
  for (let c = 0; c < 2; c++) {
    const o = out.getChannelData(c);
    for (const b of buffers) {
      const s = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      for (let i = 0; i < s.length; i++) o[i] += s[i] * trim;
    }
  }
  return out;
}

export function MixerSection() {
  const { templateId, setTemplateId, levels, playingKey, playBlob, stopPlayback } = useSession();
  const template = getTemplate(templateId);
  const [slots, setSlots] = useState<(Slot | null)[]>(() => Array.from({ length: SLOT_COUNT }, () => null));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [monitor, setMonitor] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [mixing, setMixing] = useState(false);
  const [master, setMaster] = useState<Blob | null>(null);
  const timerRef = useRef<number | null>(null);

  const update = useCallback((next: (Slot | null)[]) => {
    slotsRef.current = next;
    setSlots(next);
    setMaster(null);
  }, []);
  const patch = (i: number, p: Partial<Slot>) => {
    const cur = slotsRef.current[i];
    if (!cur) return;
    const next = [...slotsRef.current];
    next[i] = { ...cur, ...p };
    update(next);
  };
  const clearSlot = (i: number) => {
    stopPlayback();
    const next = [...slotsRef.current];
    next[i] = null;
    update(next);
  };

  // A changed template or Levels setting means the old mix is stale.
  useEffect(() => { setMaster(null); }, [templateId, levels]);
  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const addFile = async (i: number, file: File) => {
    if (!(file.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|opus|flac|webm)$/i.test(file.name))) {
      toast.error('That is not an audio file — WAV, MP3, M4A all work.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Over 60 MB — bounce it smaller first.');
      return;
    }
    try {
      const buffer = await decodeBlob(file);
      if (buffer.duration > 600) {
        toast.error('Over 10 minutes — too long.');
        return;
      }
      stopPlayback();
      const next = [...slotsRef.current];
      next[i] = { name: file.name, buffer, volume: 1, pan: 0, muted: false, role: guessRole(file.name) === 'bass' ? 'bass' : 'beat' };
      update(next);
    } catch {
      toast.error('Could not decode that file.');
    }
  };

  const musicPlaying = () => slotsRef.current.slice(1).filter((s): s is Slot => !!s && !s.muted);

  const startRecording = async () => {
    stopPlayback();
    setMicError(null);
    try {
      if (!engine.analyser) await engine.startMic(template, monitor, levels);
      else await engine.applyTemplate(template, monitor, levels);
      engine.setMonitor(monitor);
      if (!engine.startRecording()) return;
      const music = musicPlaying();
      if (music.length > 0) {
        const backing = sumBacking(music.map((s) => shape(s.buffer, s.volume, s.pan)));
        try {
          if (monitor) engine.startBacking(backing, 0.9);
          else engine.startBackingSpeaker(backing, 0.25);
        } catch { /* backing is a nicety: never block recording on it */ }
      }
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
      setRecording(true);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Mic access denied. Allow the microphone in your browser settings, then try again.'
        : 'Could not start the microphone on this device.';
      setMicError(msg);
      toast.error(msg);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    const speakerBacking = engine.backingRef;
    engine.stopBacking();
    try {
      const { blob, duration } = await engine.stopRecording();
      setRecording(false);
      if (duration < 0.4 || blob.size < 1000) {
        engine.clearBackingRef();
        toast.error('Too short — hold the moment a little longer.');
        return;
      }
      let buffer = await decodeBlob(blob);
      if (speakerBacking && speakerBacking.length > 0) {
        try { buffer = cancelBleed(buffer, speakerBacking); } catch { /* keep the raw take */ }
      }
      engine.clearBackingRef();
      const next = [...slotsRef.current];
      next[0] = { name: 'Vocal', buffer, volume: 1, pan: 0, muted: false, role: 'beat' };
      update(next);
      toast.success('Vocal recorded on track 1.');
    } catch {
      setRecording(false);
      toast.error('Recording stopped unexpectedly.');
    }
  };

  const filled = slots.filter((s): s is Slot => !!s && !s.muted);
  const handleMix = async () => {
    if (filled.length === 0) return;
    setMixing(true);
    setMaster(null);
    try {
      const stems = slotsRef.current.flatMap((s, i) => (s && !s.muted
        ? [{ name: s.name, buffer: shape(s.buffer, s.volume, s.pan), role: (i === 0 ? 'voice' : s.role) as 'voice' | 'beat' | 'bass' }]
        : []));
      const rendered = await mixStems(stems, template, levels);
      setMaster(audioBufferToWav(rendered));
      toast.success('Mix complete. Press play.');
    } catch {
      toast.error('Mix failed — try shorter tracks.');
    } finally {
      setMixing(false);
    }
  };

  const isPlaying = playingKey === 'mixer-master';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">4-track mixer</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Track 1 is your vocal — record it here over your beat. Tracks 2–4 take a beat, bass or any stem.
          Everything runs through the <span className="text-foreground">{template.name}</span> template.
        </p>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Sound template</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TEMPLATES.map((t) => {
            const active = t.id === templateId;
            return (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                aria-pressed={active}
                className={`min-h-11 shrink-0 border px-4 py-2 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
                  active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                }`}
              >
                <span className="block font-mono text-xs uppercase tracking-[0.15em]">{t.name}</span>
                <span className={`mt-0.5 block font-mono text-[10px] tracking-[0.1em] ${active ? 'text-primary' : 'text-muted-foreground/60'}`}>{t.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <LevelsPanel />

      <ul className="border border-border">
        {slots.map((s, i) => (
          <li key={i} className={`border-b border-border px-4 py-4 last:border-b-0 ${s?.muted ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="w-6 font-mono text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{s ? s.name : i === 0 ? 'Vocal — record' : 'Beat, bass or stem — upload'}</p>
                {s && <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{formatDuration(s.buffer.duration)}</p>}
              </div>
              {i === 0 ? (
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={mixing}
                  className={`flex min-h-11 items-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] focus-visible:outline-2 focus-visible:outline-primary ${
                    recording ? 'bg-primary text-primary-foreground' : 'border border-foreground/25 text-foreground hover:border-primary hover:text-primary'
                  }`}
                >
                  {recording ? <><Square className="h-4 w-4 fill-current" /> Stop {formatDuration(elapsed)}</> : <><Circle className="h-4 w-4 fill-current" /> {s ? 'Redo' : 'Record'}</>}
                </button>
              ) : (
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-border px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
                  <Upload className="h-4 w-4" /> {s ? 'Replace' : 'Add'}
                  <input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.opus,.flac,.webm" className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(i, f); e.target.value = ''; }} />
                </label>
              )}
              {s && (
                <>
                  <button onClick={() => patch(i, { muted: !s.muted })} aria-label={s.muted ? `Unmute track ${i + 1}` : `Mute track ${i + 1}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                    {s.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button onClick={() => clearSlot(i)} aria-label={`Remove track ${i + 1}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            {s && (
              <div className="mt-3 grid grid-cols-2 gap-6 pl-9">
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Volume</span>
                  <input type="range" min={0} max={1.5} step={0.01} value={s.volume} aria-label={`Volume track ${i + 1}`}
                    onChange={(e) => patch(i, { volume: parseFloat(e.target.value) })}
                    className="h-1 w-full cursor-pointer appearance-none bg-border accent-[hsl(var(--primary))]" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Pan</span>
                  <input type="range" min={-1} max={1} step={0.02} value={s.pan} aria-label={`Pan track ${i + 1}`}
                    onChange={(e) => patch(i, { pan: parseFloat(e.target.value) })}
                    className="h-1 w-full cursor-pointer appearance-none bg-border accent-[hsl(var(--primary))]" />
                </label>
              </div>
            )}
            {s && i > 0 && (
              <div className="mt-3 flex items-center gap-2 pl-9">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Treat as</span>
                <div className="flex border border-border">
                  {(['beat', 'bass'] as const).map((r) => (
                    <button key={r} onClick={() => patch(i, { role: r })} aria-pressed={s.role === r}
                      className={`min-h-11 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] focus-visible:outline-2 focus-visible:outline-primary ${
                        s.role === r ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                      }`}>{r}</button>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => setMonitor(!monitor)}
          className={`flex min-h-11 items-center gap-2 border px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] focus-visible:outline-2 focus-visible:outline-primary ${
            monitor ? 'border-primary/60 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Headphones className="h-4 w-4" /> {monitor ? 'Headphones' : 'Speaker'}
        </button>
        <p className="flex max-w-xs items-start gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
          {monitor ? 'Use wired earbuds — Bluetooth delays your voice. Tracks 2–4 play in your ears while you sing.' : 'Tracks 2–4 play quietly from the speaker; the bleed is cancelled out of your take.'}
        </p>
        {micError && <p className="flex max-w-xs items-start gap-2 text-sm text-destructive"><Mic className="mt-0.5 h-4 w-4 shrink-0" />{micError}</p>}
      </div>

      {filled.length > 0 && !master && (
        <button
          onClick={handleMix}
          disabled={mixing || recording}
          className="flex min-h-14 w-full items-center justify-center gap-3 bg-foreground font-mono text-sm uppercase tracking-[0.2em] text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {mixing && <Loader2 className="h-5 w-5 animate-spin" />}
          {mixing ? 'Mixing…' : `Mix ${filled.length} track${filled.length > 1 ? 's' : ''}`}
        </button>
      )}

      {master && (
        <div className="border border-primary/50 bg-primary/5">
          <div className="flex items-center gap-3 px-4 py-4">
            <button
              onClick={() => (isPlaying ? stopPlayback() : void playBlob('mixer-master', master))}
              aria-label={isPlaying ? 'Stop mix' : 'Play mix'}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background focus-visible:outline-2 focus-visible:outline-primary"
            >
              {isPlaying ? <Square className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{template.name} mix</p>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Leveled · glued · limited to {template.master.ceilingDb} dB</p>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-primary/30 border-t border-primary/30">
            <button onClick={() => void shareOrDownload(master, `sprouts-${template.id}-mix.wav`, 'Sprouts mix')}
              className="flex min-h-11 items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button onClick={() => downloadBlob(master, `sprouts-${template.id}-mix.wav`)}
              className="flex min-h-11 items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">
              <Download className="h-4 w-4" /> WAV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
