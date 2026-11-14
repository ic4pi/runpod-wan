import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpRight, AudioWaveform, Circle, Download, Headphones, Layers2, Loader2, Music2, Package, Play, Plus, Save, Share2, Sparkles, Square, TriangleAlert, VolumeX, Volume2, X,
} from 'lucide-react';
import { engine } from '@/lib/audio/engine';
import { cancelBleed, makeDouble, mixLayers, mixStems, decodeBlob } from '@/lib/audio/render';
import { downloadBlob, shareOrDownload } from '@/lib/audio/export';
import { exportGroceryBundle } from '@/lib/audio/exportGrocery';
import { stagePastryHandoff } from '@/lib/audio/handoff';
import { consumeGroceryBeat } from '@/lib/audio/groceryHandoff';
import { FX_LIST } from '@/lib/audio/fx';
import { audioBufferToWav, formatBytes, formatDuration } from '@/lib/audio/wav';
import { useSession } from '@/lib/session';
import { getTemplate, guessRole, TEMPLATES, type Levels } from '@/lib/templates';
import { smk } from '@/lib/audio/midi';
import { ControllerPanel } from '@/components/ControllerPanel';
import { HaloVisualizer } from '@/components/HaloVisualizer';
import { LevelsPanel } from '@/components/LevelsPanel';
import { playback } from '@/lib/audio/playback';
import type { LayerRole, StoredStack } from '@/lib/audio/db';

type Phase = 'idle' | 'recording' | 'mixing' | 'done';

interface Layer {
  id: string;
  role: LayerRole;
  blob: Blob;
  duration: number;
  pan: number | null;
  gain: number | null;
  muted: boolean;
  mixBlob: Blob | null; // cached rendered mix of the vocal stack
  fx?: string; // per-layer FX insert id
}

interface BackingStem {
  id: string;
  name: string;
  size: number;
  buffer: AudioBuffer;
  role: 'beat' | 'bass';
}

interface Beat {
  name: string;
  size: number;
  /** Unprocessed backing mix used only for monitoring while recording. */
  buffer: AudioBuffer;
  /** Original music stems retained for the final mix and Pastry handoff. */
  stems: BackingStem[];
}

const ROLE_LABELS: Record<LayerRole, string> = { lead: 'Lead', double: 'Double', backup: 'Backup', adlib: 'Ad-lib' };
const ROLE_HINTS: Record<LayerRole, string> = {
  lead: 'Center, front',
  double: 'Auto-made · flared L/R',
  backup: 'Behind lead · wetter',
  adlib: 'Wide, tucked back',
};

function nextRole(layers: Layer[], preferred: 'adlib' | 'backup' = 'adlib'): LayerRole {
  if (layers.length === 0) return 'lead';
  return preferred;
}

/** Sum uploaded music stems without mastering them; this is the record monitor. */
async function mixBackingForMonitor(stems: BackingStem[]): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const duration = Math.max(...stems.map((stem) => stem.buffer.duration));
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const trim = offline.createGain();
  trim.gain.value = 1 / Math.sqrt(stems.length);
  trim.connect(offline.destination);
  for (const stem of stems) {
    const source = offline.createBufferSource();
    source.buffer = stem.buffer;
    source.connect(trim);
    source.start();
  }
  return offline.startRendering();
}

/** Mix music stems + vocal stack into the final song. Every stem keeps its bus. */
async function renderSong(
  beat: Beat,
  layers: Layer[],
  template: ReturnType<typeof getTemplate>,
  levels: Levels,
): Promise<Blob | null> {
  const active = layers.filter((l) => !l.muted);
  try {
    // vocal stack first (panned by role), then stem-mix it with the beat —
    // mixStems sidechains the beat under the vocal bus automatically
    const vocalStack = active.length > 0
      ? await mixLayers(
          await Promise.all(active.map(async (l) => ({
            buffer: await decodeBlob(l.blob),
            role: l.role,
            pan: l.pan,
            gain: l.gain,
            fx: l.fx,
          }))),
          template,
          levels,
        )
      : null;
    const songStems: { name: string; buffer: AudioBuffer; role: 'beat' | 'bass' | 'voice' }[] =
      beat.stems.map((stem) => ({ name: stem.name, buffer: stem.buffer, role: stem.role }));
    if (vocalStack) songStems.push({ name: 'vocals', buffer: vocalStack, role: 'voice' });
    const rendered = await mixStems(songStems, template, levels);
    return audioBufferToWav(rendered);
  } catch (err) {
    console.error('[levels] song render failed', err);
    return null;
  }
}

export function RecordSection() {
  const { templateId, setTemplateId, levels, setLevels, persistStack, playingKey, playBlob, stopPlayback, stacks } = useSession();
  const template = getTemplate(templateId);

  const [phase, setPhase] = useState<Phase>('idle');
  const [monitor, setMonitor] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const layersRef = useRef<Layer[]>([]);
  const [mixingStack, setMixingStack] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nextRecordRole, setNextRecordRole] = useState<'adlib' | 'backup'>('adlib');
  const [bpm, setBpm] = useState(90);
  const [exportingGrocery, setExportingGrocery] = useState(false);
  const [beat, setBeat] = useState<Beat | null>(null);
  const beatRef = useRef<Beat | null>(null);
  const [groceryBeatNotice, setGroceryBeatNotice] = useState<string | null>(null);
  const groceryHandoffStartedRef = useRef(false);
  const [songBlob, setSongBlob] = useState<Blob | null>(null);
  const beatInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  const syncLayers = useCallback((next: Layer[]) => {
    layersRef.current = next;
    setLayers(next);
  }, []);

  const setBeatState = useCallback((b: Beat | null) => {
    beatRef.current = b;
    setBeat(b);
  }, []);

  // Live chain follows template + level moves
  useEffect(() => {
    if (engine.analyser && phase === 'idle') {
      engine.applyTemplate(template, monitor, levels).catch(() => undefined);
    }
  }, [templateId, levels, monitor, phase, template]);

  useEffect(() => {
    engine.setMonitor(monitor);
  }, [monitor]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    engine.stopBacking();
  }, []);

  // --- SMK controller actions (hardware + virtual pads share this path) ---
  const handlePad = useCallback((pad: number) => {
    if (pad === 0) void playSongRef.current();
    else if (pad === 1) stopPlayback();
    else if (pad === 2) recordToggleRef.current();
    else if (pad === 3) setNextRecordRole((r) => (r === 'adlib' ? 'backup' : 'adlib'));
    else if (pad >= 4 && pad <= 11) {
      // pads L1–L8: toggle mute on layer N
      const layer = layersRef.current[pad - 4];
      if (layer) void toggleMuteRef.current(layer.id);
    }
    // pads FX1–FX4 (12-15): reserved — live FX scenes land with Grocer/Beet
  }, [stopPlayback]);

  const playSongRef = useRef<() => Promise<void>>(async () => {});
  const recordToggleRef = useRef<() => void>(() => {});
  const toggleMuteRef = useRef<(id: string) => Promise<void>>(async () => {});

  useEffect(() => smk.onAction((a) => {
    if (a.type === 'record-toggle') recordToggleRef.current();
    else if (a.type === 'stop') stopPlayback();
    else if (a.type === 'play-mix') void playSongRef.current();
    else if (a.type === 'pad-layer') handlePad(a.pad);
    else if (a.type === 'role-next') setNextRecordRole((r) => (r === 'adlib' ? 'backup' : 'adlib'));
    else if (a.type === 'fader') {
      // SMK knob Bank A 1-4 → Warmth/Brightness/Punch/Space, mapped 0..2
      // (the SMK-25 has no faders — these knobs ARE the faders)
      const keys: (keyof Levels)[] = ['warmth', 'brightness', 'punch', 'space'];
      const key = keys[a.index];
      if (key) setLevels({ ...levelsRef.current, [key]: Math.round(a.value * 2 * 100) / 100 });
    } else if (a.type === 'knob') {
      // knobs 5-8 (both banks) → layer pans: knob N pans layer N across L/C/R
      const layer = layersRef.current[a.index];
      if (layer) {
        const pan = Math.round((a.value * 2 - 1) * 20) / 20;
        void setPanRef.current(layer.id, pan);
      }
    } else if (a.type === 'volume') {
      // knob Bank B 1-4 → ride a whole role's level: lead / doubles / backups / ad-libs
      const roles: LayerRole[] = ['lead', 'double', 'backup', 'adlib'];
      const role = roles[a.group];
      if (role) void setGainRef.current(role, Math.round(a.value * 2 * 100) / 100);
    }
    // mod strip + pitch strip: reserved for live FX depth (Grocer territory)
  }), [handlePad, stopPlayback]);

  const levelsRef = useRef(levels);
  useEffect(() => { levelsRef.current = levels; }, [levels]);
  const setPanRef = useRef<(id: string, pan: number) => Promise<void>>(async () => {});
  const setGainRef = useRef<(role: LayerRole, gain: number) => Promise<void>>(async () => {});

  /** Load one instrumental or up to eight individual music stems. */
  const addBeat = useCallback(async (files: FileList | File[]) => {
    setGroceryBeatNotice(null);
    const audioFiles = Array.from(files).filter((file) =>
      file.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|opus|flac|webm)$/i.test(file.name));
    if (audioFiles.length === 0) {
      toast.error('That doesn\'t look like audio — WAV, MP3, M4A all work.');
      return;
    }
    if (audioFiles.length > 8) {
      toast.error('Choose up to 8 backing stems at a time.');
      return;
    }
    const tooBig = audioFiles.find((file) => file.size > 60 * 1024 * 1024);
    if (tooBig) {
      toast.error(`${tooBig.name} is over 60 MB — bounce it smaller first.`);
      return;
    }
    if (audioFiles.reduce((total, file) => total + file.size, 0) > 200 * 1024 * 1024) {
      toast.error('Those backing stems total over 200 MB — bounce them lighter first.');
      return;
    }

    try {
      const stems: BackingStem[] = [];
      for (const file of audioFiles) {
        const buffer = await decodeBlob(file);
        if (buffer.duration > 600) {
          toast.error(`${file.name} is over 10 minutes — too long.`);
          return;
        }
        stems.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          buffer,
          role: guessRole(file.name) === 'bass' ? 'bass' : 'beat',
        });
      }
      const monitorBuffer = await mixBackingForMonitor(stems);
      setBeatState({
        name: stems.length === 1 ? stems[0].name : `${stems.length} backing stems`,
        size: stems.reduce((total, stem) => total + stem.size, 0),
        buffer: monitorBuffer,
        stems,
      });
      setSongBlob(null);
      toast.success(`${stems.length === 1 ? 'Beat' : `${stems.length} stems`} loaded. Record over ${stems.length === 1 ? 'it' : 'them'}.`);
    } catch {
      toast.error('Could not decode one of those audio files.');
    }
  }, [setBeatState]);

  // A Grocery beat arrives once through same-origin IndexedDB. Clean audio is
  // already limited to verified leases; unleased sessions retain their tags.
  useEffect(() => {
    if (groceryHandoffStartedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('beat');
    if (params.get('from') !== 'grocery' || !id) return;
    groceryHandoffStartedRef.current = true;

    void (async () => {
      try {
        const handoff = await consumeGroceryBeat(id);
        if (!handoff) throw new Error('This Grocery beat expired or was already opened.');
        await addBeat([new File([handoff.blob], handoff.filename, { type: handoff.blob.type || 'audio/wav' })]);
        if (!beatRef.current) throw new Error('The Grocery audio could not be decoded.');
        setBpm(handoff.bpm);
        setGroceryBeatNotice(handoff.licensed
          ? `Verified lease · clean “${handoff.title}” · credit Beat by ${handoff.producer}.`
          : `Unleased “${handoff.title}” · Capi Capi tags are rendered into this session and its Pastry exports. Lease it in Grocery for the clean beat.`);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The Grocery beat could not be opened.');
      }
    })();
  }, [addBeat]);

  /** Render the vocal stack alone (for layer play buttons + headphone backing). */
  const renderStack = useCallback(async (ls: Layer[], tpl: typeof template, lv: Levels): Promise<Blob | null> => {
    const active = ls.filter((l) => !l.muted);
    if (active.length === 0) return null;
    try {
      const decoded = await Promise.all(
        active.map(async (l) => ({
          buffer: await decodeBlob(l.blob),
          role: l.role,
          pan: l.pan,
          gain: l.gain,
            fx: l.fx,
        })),
      );
      const rendered = await mixLayers(decoded, tpl, lv);
      return audioBufferToWav(rendered);
    } catch (err) {
      console.error('[levels] stack render failed', err);
      return null;
    }
  }, []);

  /** Re-render every layer's cached stack mix + the full song if a beat exists. */
  const rerenderAll = useCallback(async (ls: Layer[], tpl: typeof template, lv: Levels) => {
    setMixingStack(true);
    const mixBlob = await renderStack(ls, tpl, lv);
    const next = ls.map((l) => ({ ...l, mixBlob }));
    syncLayers(next);
    if (beatRef.current) {
      const song = await renderSong(beatRef.current, next, tpl, lv);
      setSongBlob(song);
    } else {
      setSongBlob(null);
    }
    setMixingStack(false);
    return mixBlob;
  }, [renderStack, syncLayers]);

  const startRecording = useCallback(async () => {
    stopPlayback();
    setMicError(null);
    try {
      if (!engine.analyser) {
        await engine.startMic(template, monitor, levels);
      }
      engine.setMonitor(monitor);
      if (!engine.startRecording()) return;

      // Backing = beat + current vocal stack, so the singer layers in time.
      // Headphones → private blend. Speaker mode → quiet from the speaker,
      // bleed cancelled from the take afterwards.
      const current = layersRef.current.filter((l) => !l.muted);
      let backingBuf: AudioBuffer | null = null;
      if (beatRef.current && current.some((l) => l.mixBlob)) {
        // beat + stack: quick render of both together for monitoring
        const stackDecoded = await decodeBlob(current[0].mixBlob!);
        backingBuf = await renderSongMonitor(beatRef.current.buffer, stackDecoded);
      } else if (beatRef.current) {
        backingBuf = beatRef.current.buffer;
      } else if (current.length > 0 && current[0].mixBlob) {
        backingBuf = await decodeBlob(current[0].mixBlob);
      }

      if (backingBuf) {
        try {
          if (monitor) {
            engine.startBacking(backingBuf, 0.9);
          } else {
            engine.startBackingSpeaker(backingBuf, 0.25);
          }
        } catch {
          /* backing is a nicety — never block recording on it */
        }
      }

      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
      setPhase('recording');
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Mic access denied. Allow the microphone in your browser settings, then try again.'
        : 'Could not start the microphone on this device.';
      setMicError(msg);
      toast.error(msg);
    }
  }, [template, monitor, levels, stopPlayback]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    const speakerBacking = engine.backingRef;
    engine.stopBacking();
    try {
      let { blob, duration } = await engine.stopRecording();
      if (duration < 0.4 || blob.size < 1000) {
        engine.clearBackingRef();
        setPhase('idle');
        toast.error('Too short — hold the moment a little longer.');
        return;
      }

      // Speaker mode: subtract the quiet backing bleed from the take
      if (speakerBacking && speakerBacking.length > 0) {
        try {
          const decoded = await decodeBlob(blob);
          const cleaned = cancelBleed(decoded, speakerBacking);
          blob = audioBufferToWav(cleaned);
        } catch (err) {
          console.error('[levels] bleed cancel failed — keeping raw take', err);
        }
      }
      engine.clearBackingRef();

      const role = nextRole(layersRef.current, nextRecordRole);
      const layer: Layer = {
        id: crypto.randomUUID(),
        role,
        blob,
        duration,
        pan: null,
        gain: null,
        muted: false,
        mixBlob: null,
      };

      let next = [...layersRef.current, layer];

      // Auto doubles from the lead
      if (role === 'lead') {
        setPhase('mixing');
        try {
          const decoded = await decodeBlob(blob);
          const doubleDefs = [
            { cents: -7, delayMs: 14, pan: -0.75 },
            { cents: 7, delayMs: 23, pan: 0.75 },
          ];
          for (const def of doubleDefs) {
            const clone = makeDouble(decoded, def);
            next = [...next, {
              id: crypto.randomUUID(),
              role: 'double' as LayerRole,
              blob: audioBufferToWav(clone),
              duration: clone.duration,
              pan: def.pan,
              gain: 0.7,
              muted: false,
              mixBlob: null,
            }];
          }
          toast.success('Doubles made — wide L/R, straight from your lead.');
        } catch (err) {
          console.error('[levels] double synthesis failed', err);
          toast.error('Doubles failed to build — your lead is safe.');
        }
      }

      syncLayers(next);
      setPhase('mixing');
      const mixBlob = await rerenderAll(next, template, levels);
      setPhase('done');
      if (mixBlob) {
        toast.success(
          role === 'lead'
            ? 'Lead stacked with doubles — that\'s the sound.'
            : role === 'backup'
              ? 'Backup in — sitting behind the lead.'
              : 'Ad-lib layered in — tucked behind the lead.',
        );
      } else {
        toast.error('Mix render failed — your layer is kept, try re-rendering.');
      }
    } catch {
      setPhase('idle');
      toast.error('Recording stopped unexpectedly.');
    }
  }, [template, levels, rerenderAll, syncLayers, nextRecordRole]);

  // Re-render when template or levels change with layers present
  const remixTimer = useRef<number | null>(null);
  useEffect(() => {
    if (layers.length > 0 && phase === 'done') {
      stopPlayback();
      if (remixTimer.current) window.clearTimeout(remixTimer.current);
      remixTimer.current = window.setTimeout(() => {
        void rerenderAll(layersRef.current, getTemplate(templateId), levels);
      }, 450);
    }
    return () => {
      if (remixTimer.current) window.clearTimeout(remixTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, levels, phase, rerenderAll, stopPlayback]);

  const playLayer = useCallback(async (layer: Layer) => {
    const key = `layer-${layer.id}`;
    if (playingKey === key) {
      stopPlayback();
      return;
    }
    try {
      if (layer.muted) {
        toast.error('Unmute the layer to hear it.');
        return;
      }
      const solo = await renderStack([{ ...layer, pan: 0, gain: 1 }], template, levels);
      if (solo) {
        await playBlob(key, solo);
      } else {
        toast.error('Could not render that layer.');
      }
    } catch {
      toast.error('This device can\'t decode that layer.');
    }
  }, [playingKey, playBlob, stopPlayback, renderStack, template, levels]);

  const playSong = useCallback(async () => {
    const key = 'song';
    if (playingKey === key) {
      stopPlayback();
      return;
    }
    const blob = beatRef.current ? songBlob : layers.find((l) => !l.muted)?.mixBlob;
    if (!blob) {
      toast.error('Nothing mixed yet — record a layer first.');
      return;
    }
    try {
      await playBlob(key, blob);
    } catch {
      toast.error('This device can\'t decode the mix.');
    }
  }, [playingKey, playBlob, stopPlayback, layers, songBlob]);

  useEffect(() => { playSongRef.current = playSong; }, [playSong]);
  useEffect(() => {
    recordToggleRef.current = () => {
      if (phase === 'recording') void stopRecording();
      else if (phase === 'idle' || phase === 'done') void startRecording();
    };
  });

  const playBeat = useCallback(async () => {
    const key = 'beat';
    if (playingKey === key) {
      stopPlayback();
      return;
    }
    if (!beatRef.current) return;
    try {
      await playBlob(key, audioBufferToWav(beatRef.current.buffer));
    } catch {
      toast.error('This device can\'t decode the beat.');
    }
  }, [playingKey, playBlob, stopPlayback]);

  const toggleMute = useCallback(async (id: string) => {
    const next = layersRef.current.map((l) => (l.id === id ? { ...l, muted: !l.muted } : l));
    syncLayers(next);
    stopPlayback();
    await rerenderAll(next, template, levels);
  }, [syncLayers, rerenderAll, template, levels, stopPlayback]);

  useEffect(() => { toggleMuteRef.current = toggleMute; }, [toggleMute]);

  const removeLayer = useCallback(async (id: string) => {
    const next = layersRef.current.filter((l) => l.id !== id);
    syncLayers(next);
    stopPlayback();
    if (next.length > 0) await rerenderAll(next, template, levels);
    else setSongBlob(null);
  }, [syncLayers, rerenderAll, template, levels, stopPlayback]);

  const setPan = useCallback(async (id: string, pan: number) => {
    const next = layersRef.current.map((l) => (l.id === id ? { ...l, pan } : l));
    syncLayers(next);
    if (remixTimer.current) window.clearTimeout(remixTimer.current);
    remixTimer.current = window.setTimeout(() => void rerenderAll(layersRef.current, template, levels), 450);
  }, [syncLayers, rerenderAll, template, levels]);

  useEffect(() => { setPanRef.current = setPan; }, [setPan]);

  /** Ride every layer of one role at once — knob Bank B 1–4. */
  const setGroupGain = useCallback(async (role: LayerRole, gain: number) => {
    const next = layersRef.current.map((l) => (l.role === role ? { ...l, gain } : l));
    syncLayers(next);
    if (remixTimer.current) window.clearTimeout(remixTimer.current);
    remixTimer.current = window.setTimeout(() => void rerenderAll(layersRef.current, template, levels), 450);
  }, [syncLayers, rerenderAll, template, levels]);

  useEffect(() => { setGainRef.current = setGroupGain; }, [setGroupGain]);

  const setLayerFx = useCallback(async (id: string, fx: string) => {
    const next = layersRef.current.map((l) => (l.id === id ? { ...l, fx } : l));
    syncLayers(next);
    stopPlayback();
    if (remixTimer.current) window.clearTimeout(remixTimer.current);
    remixTimer.current = window.setTimeout(() => void rerenderAll(layersRef.current, template, levels), 450);
  }, [syncLayers, rerenderAll, template, levels, stopPlayback]);

  const buildPastryBundle = useCallback(async () => {
    if (layersRef.current.length === 0 || !beatRef.current) return null;
    const name = `${template.name} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const filename = `sprouts-${template.id}-session.zip`;
    const { blob } = await exportGroceryBundle({
      sessionName: name,
      bpm,
      template,
      levels,
      layers: layersRef.current.map(({ role, blob, duration, pan, gain, fx }) => ({ role, blob, duration, pan, gain, fx })),
      backingStems: beatRef.current.stems.map((stem) => ({
        buffer: stem.buffer,
        name: stem.name,
        role: stem.role,
      })),
    });
    return { blob, filename };
  }, [template, levels, bpm]);

  const handleSessionDownload = useCallback(async () => {
    setExportingGrocery(true);
    try {
      const bundle = await buildPastryBundle();
      if (!bundle) return;
      downloadBlob(bundle.blob, bundle.filename);
      toast.success('Session ZIP downloaded — open it in Pastry.');
    } catch (err) {
      console.error('[sprouts] session export failed', err);
      toast.error('Session export failed — try fewer or shorter layers.');
    } finally {
      setExportingGrocery(false);
    }
  }, [buildPastryBundle]);

  const handlePastryHandoff = useCallback(async () => {
    setExportingGrocery(true);
    try {
      const bundle = await buildPastryBundle();
      if (!bundle) return;
      const handoffId = await stagePastryHandoff(bundle.blob, bundle.filename);
      window.location.assign(`/pastry/?from=sprouts&session=${encodeURIComponent(handoffId)}`);
    } catch (err) {
      console.error('[sprouts] direct Pastry handoff failed', err);
      toast.error('Direct handoff is unavailable here. Use Session ZIP instead.');
      setExportingGrocery(false);
    }
  }, [buildPastryBundle]);

  const handleKeep = useCallback(async () => {
    if (layersRef.current.length === 0) return;
    setSaving(true);
    try {
      const stack: StoredStack = {
        id: crypto.randomUUID(),
        name: `${beatRef.current ? 'Song' : 'Stack'} · ${template.name} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        createdAt: Date.now(),
        templateId,
        layers: layersRef.current.map(({ id, role, blob, duration, pan, gain, muted, fx }) => ({ id, role, blob, duration, pan, gain, muted, fx })),
        beatBlob: beatRef.current ? audioBufferToWav(beatRef.current.buffer) : undefined,
        beatName: beatRef.current?.name,
      };
      await persistStack(stack);
      toast.success('Kept. Find it in the Vault.');
      syncLayers([]);
      setBeatState(null);
      setSongBlob(null);
      setPhase('idle');
    } catch {
      toast.error('Could not save on this device — download instead.');
    } finally {
      setSaving(false);
    }
  }, [template, templateId, persistStack, syncLayers, setBeatState]);

  const hasBeat = beat !== null;
  const outBlob = hasBeat ? songBlob : (layers.find((l) => !l.muted)?.mixBlob ?? null);
  const stackDuration = layers.length > 0 ? Math.max(...layers.map((l) => l.duration)) : 0;

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

      {/* Beat or individual backing stems */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Beat or backing stems</p>
        {!hasBeat ? (
          <button
            onClick={() => beatInputRef.current?.click()}
            className="mt-3 flex w-full min-h-20 items-center justify-center gap-3 border border-dashed border-border px-6 py-5 text-center transition-colors duration-200 hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Music2 className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Choose a beat or up to 8 stems — then record over them</span>
          </button>
        ) : (
          <>
          <div className="mt-3 flex items-center gap-3 border border-border px-4 py-3">
            <button
              onClick={playBeat}
              aria-label={playingKey === 'beat' ? 'Stop beat' : 'Play beat'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-foreground/25 text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {playingKey === 'beat' ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{beat.name}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {formatBytes(beat.size)} · {formatDuration(beat.buffer.duration)} · sidechained under vocals
              </p>
            </div>
            <AudioWaveform className="h-4 w-4 shrink-0 text-primary/70" />
            <button
              onClick={() => { setBeatState(null); setGroceryBeatNotice(null); setSongBlob(null); stopPlayback(); }}
              aria-label="Remove backing audio"
              className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {beat.stems.length > 1 && (
            <ul className="divide-y divide-border border border-t-0 border-border">
              {beat.stems.map((stem) => (
                <li key={stem.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{stem.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {stem.role} · {formatDuration(stem.buffer.duration)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {groceryBeatNotice && (
            <p role="status" className="border border-t-0 border-primary/40 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-primary">
              {groceryBeatNotice}
            </p>
          )}
          </>
        )}
        <input
          ref={beatInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.opus,.flac,.webm"
          aria-label="Upload beat or backing stems"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addBeat(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <LevelsPanel />

      {/* SMK controller */}
      <ControllerPanel onPad={handlePad} />

      {/* Record control */}
      <div className="flex flex-col items-center gap-5">
        <div className="font-mono text-3xl tabular-nums tracking-wider text-foreground">
          {phase === 'recording' ? formatDuration(elapsed) : stackDuration > 0 ? formatDuration(stackDuration) : '0:00'}
        </div>

        <button
          onClick={phase === 'recording' ? stopRecording : startRecording}
          disabled={phase === 'mixing' || mixingStack}
          aria-label={phase === 'recording' ? 'Stop recording' : layers.length > 0 ? `Record ${ROLE_LABELS[nextRole(layers, nextRecordRole)].toLowerCase()} layer` : 'Start recording'}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary active:scale-95 ${
            phase === 'recording'
              ? 'bg-primary text-primary-foreground'
              : 'border border-foreground/25 bg-transparent text-foreground hover:border-primary hover:text-primary'
          }`}
        >
          {phase === 'recording' && (
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/30 [animation-duration:1.6s]" />
          )}
          {phase === 'mixing' || mixingStack
            ? <Loader2 className="h-7 w-7 animate-spin" />
            : phase === 'recording'
              ? <Square className="h-6 w-6 fill-current" />
              : <Circle className="h-6 w-6 fill-current" />}
        </button>

        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {phase === 'recording'
            ? layers.length > 0 ? `Recording ${ROLE_LABELS[nextRole(layers, nextRecordRole)].toLowerCase()} — tap to stop` : 'Recording — tap to stop'
            : phase === 'mixing' || mixingStack
              ? 'Mixing…'
              : layers.length > 0
                ? `Tap to add a ${ROLE_LABELS[nextRole(layers, nextRecordRole)].toLowerCase()}`
                : hasBeat ? 'Tap to record over the beat' : 'Tap to record'}
        </p>

        {layers.length > 0 && phase !== 'recording' && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">Next up</span>
            <div className="flex border border-border">
              {(['adlib', 'backup'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setNextRecordRole(r)}
                  aria-pressed={nextRecordRole === r}
                  className={`min-h-11 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
                    nextRecordRole === r ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r === 'adlib' ? 'Ad-lib' : 'Backup'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => setMonitor(!monitor)}
            className={`flex min-h-11 items-center gap-2 border px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              monitor ? 'border-primary/60 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Headphones className="h-4 w-4" />
            {monitor ? 'Headphones' : 'Speaker'}
          </button>
        </div>
        <p className="flex max-w-xs items-start gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
          {monitor
            ? 'Use wired earbuds — Bluetooth delays your voice. You hear the beat + your layers in your ears while you sing.'
            : 'No headphones? The beat plays quietly from your speaker so you can stay in time — Levels cancels the bleed out of your take.'}
        </p>
        {micError && (
          <p className="flex max-w-xs items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {micError}
          </p>
        )}
      </div>

      {/* Layer lanes */}
      {layers.length > 0 && (
        <div className="border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              {layers.length} layer{layers.length > 1 ? 's' : ''}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">
              doubles auto-made · panned by role
            </span>
          </div>
          <ul className="divide-y divide-border">
            {layers.map((layer) => {
              const key = `layer-${layer.id}`;
              const isPlaying = playingKey === key;
              return (
                <li key={layer.id} className={`px-4 py-3 ${layer.muted ? 'opacity-45' : ''}`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void playLayer(layer)}
                      disabled={mixingStack}
                      aria-label={isPlaying ? `Stop ${ROLE_LABELS[layer.role]}` : `Play ${ROLE_LABELS[layer.role]}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-foreground/25 text-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40"
                    >
                      {isPlaying ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {ROLE_LABELS[layer.role]} · {formatDuration(layer.duration)}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {ROLE_HINTS[layer.role]}{layer.pan !== null ? ` · pan ${layer.pan > 0 ? 'R' : layer.pan < 0 ? 'L' : 'C'}${layer.pan !== 0 ? Math.abs(Math.round(layer.pan * 100)) : ''}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button
                        onClick={() => void toggleMute(layer.id)}
                        aria-label={layer.muted ? `Unmute ${ROLE_LABELS[layer.role]}` : `Mute ${ROLE_LABELS[layer.role]}`}
                        className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {layer.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => void removeLayer(layer.id)}
                        aria-label={`Delete ${ROLE_LABELS[layer.role]} layer`}
                        className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* FX insert */}
                  <div className="mt-2 flex items-center gap-2 pl-14">
                    <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    <div className="flex flex-1 gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {FX_LIST.map((f) => {
                        const active = (layer.fx ?? 'none') === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => void setLayerFx(layer.id, f.id)}
                            aria-pressed={active}
                            title={f.blurb}
                            className={`shrink-0 border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground/70 hover:text-foreground'
                            }`}
                          >
                            {f.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pan trim */}
                  <div className="mt-2 flex items-center gap-3 pl-14">
                    <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60">L</span>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={layer.pan ?? 0}
                      onChange={(e) => void setPan(layer.id, parseFloat(e.target.value))}
                      aria-label={`Pan ${ROLE_LABELS[layer.role]}`}
                      className="h-1 flex-1 cursor-pointer appearance-none bg-border accent-[hsl(var(--primary))] focus-visible:outline-2 focus-visible:outline-primary"
                    />
                    <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60">R</span>
                    {layer.pan !== null && (
                      <button
                        onClick={() => void setPan(layer.id, 0)}
                        className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        auto
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Master out */}
          <div className="border-t border-border">
            <div className="flex items-center gap-3 px-4 py-4">
              <button
                onClick={playSong}
                disabled={mixingStack || !outBlob}
                aria-label={playingKey === 'song' ? 'Stop mix' : 'Play mix'}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 disabled:opacity-40"
              >
                {mixingStack ? <Loader2 className="h-5 w-5 animate-spin" /> : playingKey === 'song' ? <Square className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {hasBeat ? 'Your song' : `${template.name} stack`} · {layers.filter((l) => !l.muted).length} vocal{layers.filter((l) => !l.muted).length > 1 ? 's' : ''}
                </p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {hasBeat ? 'beat + vocals · sidechained · limited' : 'layered · panned · limited'}
                </p>
              </div>
              <Layers2 className="h-4 w-4 shrink-0 text-primary/70" />
            </div>
            {hasBeat && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">BPM</span>
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={bpm}
                  onChange={(e) => setBpm(Math.max(40, Math.min(240, parseInt(e.target.value) || 90)))}
                  aria-label="Song BPM"
                  className="w-16 border border-border bg-transparent px-2 py-1.5 text-center font-mono text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                />
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  <button
                    onClick={handleSessionDownload}
                    disabled={exportingGrocery || layers.length === 0}
                    aria-label="Download session ZIP"
                    className="flex min-h-11 items-center gap-2 border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    <Package className="h-4 w-4" />
                    Session ZIP
                  </button>
                  <button
                    onClick={handlePastryHandoff}
                    disabled={exportingGrocery || layers.length === 0}
                    className="flex min-h-11 items-center gap-2 border border-primary/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary transition-colors duration-150 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    {exportingGrocery ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                    Open in Pastry
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
              <button
                onClick={handleKeep}
                disabled={saving || layers.length === 0}
                className="flex min-h-11 items-center justify-center gap-2 px-3 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Keep
              </button>
              <button
                onClick={() => outBlob && void shareOrDownload(outBlob, `levels-${template.id}-${hasBeat ? 'song' : 'stack'}.wav`, hasBeat ? 'Levels song' : 'Levels stack')}
                disabled={!outBlob}
                className="flex min-h-11 items-center justify-center gap-2 px-3 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              <button
                onClick={() => outBlob && downloadBlob(outBlob, `levels-${template.id}-${hasBeat ? 'song' : 'stack'}.wav`)}
                disabled={!outBlob}
                className="flex min-h-11 items-center justify-center gap-2 px-3 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                WAV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {layers.length === 0 && phase === 'idle' && stacks.length === 0 && !hasBeat && (
        <div className="flex flex-col items-center gap-3 border border-dashed border-border px-6 py-10 text-center">
          <Plus className="h-5 w-5 text-muted-foreground" />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Choose a beat or your own stems above, hit record, and lay your lead. Sprouts makes the doubles and stacks your ad-libs and backups; Pastry handles the final mix and master.
          </p>
        </div>
      )}
    </div>
  );
}

/** Quick monitor mix of beat + current stack for recording backing. */
async function renderSongMonitor(beat: AudioBuffer, stack: AudioBuffer): Promise<AudioBuffer> {
  const sr = 44100;
  const len = Math.max(beat.length, stack.length);
  const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const o = out.getChannelData(c);
    const b = beat.getChannelData(Math.min(c, beat.numberOfChannels - 1));
    const s = stack.getChannelData(Math.min(c, stack.numberOfChannels - 1));
    for (let i = 0; i < len; i++) {
      o[i] = (i < b.length ? b[i] : 0) * 0.9 + (i < s.length ? s[i] : 0) * 0.9;
    }
  }
  return out;
}

/** The halo lives here so the desktop split panel can reuse it. */
export function RecordHalo({ className }: { className?: string }) {
  const { playingKey } = useSession();
  const [recLive, setRecLive] = useState(false);
  useEffect(() => engine.on('recording-changed', () => setRecLive(engine.recording)), []);
  const analyser = playingKey ? playback.analyser : engine.analyser;
  const mode = playingKey ? 'playback' : recLive ? 'live' : 'idle';
  return <HaloVisualizer analyser={analyser} mode={mode} className={className} />;
}
