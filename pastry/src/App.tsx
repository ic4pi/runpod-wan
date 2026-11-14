import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, Play, RotateCcw, Share2, Square, Upload, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { mixStems } from '@/lib/audio/render';
import { audioBufferToWav, formatBytes } from '@/lib/audio/wav';
import { shareOrDownload } from '@/lib/audio/export';
import { importFiles, type Role, type Stem } from '@/lib/importer';
import { consumePastryHandoff } from '@/lib/handoff';
import { DEFAULT_TEMPLATE_ID, LEVEL_DEFS, NEUTRAL_LEVELS, TEMPLATES, getTemplate, type Levels } from '@/lib/templates';
import { useSmk } from '@/lib/smk';
import { Toaster } from '@/components/ui/sonner';

const MAX_STEMS = 24;
const ROLES: { id: Role; label: string }[] = [
  { id: 'voice', label: 'Vocal' },
  { id: 'beat', label: 'Beat' },
  { id: 'bass', label: 'Bass' },
];

const btn = 'flex min-h-12 items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.15em] focus-visible:outline-2 focus-visible:outline-primary';

export default function App() {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [levels, setLevels] = useState<Levels>(NEUTRAL_LEVELS);
  const [stems, setStems] = useState<Stem[]>([]);
  const [master, setMaster] = useState<AudioBuffer | null>(null);
  const [mixing, setMixing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const handoffStartedRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const template = getTemplate(templateId);
  const neutral = LEVEL_DEFS.every((d) => levels[d.key] === 1);

  const stop = () => {
    const s = srcRef.current;
    if (s) { s.onended = null; try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    srcRef.current = null; setPlaying(false);
  };
  const stale = () => { stop(); setMaster(null); };

  useEffect(() => {
    if (handoffStartedRef.current) return;
    const id = new URLSearchParams(window.location.search).get('session');
    if (!id) return;
    handoffStartedRef.current = true;
    setHandoffLoading(true);

    void (async () => {
      try {
        const handoff = await consumePastryHandoff(id);
        if (!handoff) throw new Error('The Sprouts session expired or was already opened.');
        const file = new File([handoff.blob], handoff.filename, { type: 'application/zip' });
        const { stems: imported, skipped, session } = await importFiles([file]);
        if (imported.length === 0) throw new Error(skipped.join(', ') || 'No audio stems were found.');
        if (imported.length > MAX_STEMS) throw new Error(`This session has ${imported.length} stems; Pastry accepts ${MAX_STEMS}.`);
        setStems(imported);
        setMaster(null);
        setSessionName(session?.name ?? 'Sprouts session');
        if (session?.templateId && TEMPLATES.some((item) => item.id === session.templateId)) {
          setTemplateId(session.templateId);
        }
        if (session?.levels) setLevels(session.levels);
        window.history.replaceState({}, '', window.location.pathname);
        toast.success(`${imported.length} stems received from Sprouts. Ready to mix.`);
      } catch (error) {
        toast.error(`${error instanceof Error ? error.message : 'Could not open the Sprouts session.'} Use Session ZIP in Sprouts if this happens again.`);
      } finally {
        setHandoffLoading(false);
      }
    })();
  }, []);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const { stems: added, skipped, session } = await importFiles([...list]);
    const room = MAX_STEMS - stems.length;
    if (added.length > room) toast.error(`Up to ${MAX_STEMS} stems. Extra files were not added.`);
    if (skipped.length) toast.error(`Skipped: ${skipped.join(', ')}`);
    if (added.length) { stale(); setStems((s) => [...s, ...added.slice(0, Math.max(0, room))]); }
    if (session) {
      setSessionName(session.name ?? 'Sprouts session');
      if (session.templateId && TEMPLATES.some((item) => item.id === session.templateId)) setTemplateId(session.templateId);
      if (session.levels) setLevels(session.levels);
    }
  };

  const nudge = (id: string, delta: number) => {
    setStems((p) => p.map((x) => (x.id === id ? { ...x, offset: Math.max(-5, Math.min(5, Math.round((x.offset + delta) * 1000) / 1000)) } : x)));
    stale();
  };
  // Vocal takes are naturally shorter than the backing; only warn about music-stem mismatch.
  const lengths = stems.filter((s) => s.role !== 'voice').map((s) => s.buffer.duration);
  const lengthMismatch = lengths.length >= 2 && Math.max(...lengths) - Math.min(...lengths) > 0.05;

  const mixAndMaster = async () => {
    stale(); setMixing(true);
    try {
      setMaster(await mixStems(stems.map((s) => ({ name: s.name, buffer: s.buffer, role: s.role, offset: s.offset })), template, levels));
    } catch { toast.error('Mix failed. Try fewer or shorter stems.'); }
    finally { setMixing(false); }
  };

  const togglePlay = async () => {
    if (!master) return;
    if (playing) return stop();
    const ctx = (ctxRef.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = master; src.connect(ctx.destination);
    src.onended = () => { srcRef.current = null; setPlaying(false); };
    srcRef.current = src; setPlaying(true); src.start();
  };

  const filename = `pastry-${template.id}-master.wav`;

  // SMK-25 knobs + transport (see lib/smk.ts). Bank A knobs 1–4 are the
  // Fine-tune Levels — same language as Sprouts. REC re-runs Mix & Master.
  const smk = useSmk((a) => {
    if (a.type === 'play') { if (!playing) void togglePlay(); }
    else if (a.type === 'stop') stop();
    else if (a.type === 'record-toggle') { if (stems.length && !mixing) void mixAndMaster(); }
    else if (a.type === 'knob') {
      const def = LEVEL_DEFS[a.index];
      if (def) { setLevels((l) => ({ ...l, [def.key]: Math.round(a.value * 2 * 100) / 100 })); stale(); }
    }
  });
  const save = (share: boolean) => {
    if (!master) return;
    const blob = audioBufferToWav(master);
    if (share) return void shareOrDownload(blob, filename, 'Pastry master');
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: filename }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pb-16 pt-6">
        <header>
          <h1 className="text-xl font-medium tracking-tight">
            PASTRY<span className="text-primary">.</span>
            <span className="ml-2 align-middle font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60">Mix &amp; Master</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">Pick a sound, drop your stems, get a finished master.</p>
          {smk === 'connected' && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">SMK on — knobs 1–4 are the Fine-tune levels, transport plays/stops, REC mixes</p>
          )}
        </header>

        {/* 1. Template */}
        <section>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">1 · Sound</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => { setTemplateId(t.id); stale(); }} aria-pressed={t.id === templateId}
                className={`${btn} min-h-14 flex-col border ${t.id === templateId ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                <span className="text-sm normal-case tracking-normal">{t.name}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{template.blurb}</p>

          <div className="mt-4 border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Fine-tune</span>
              <button onClick={() => { setLevels(NEUTRAL_LEVELS); stale(); }} disabled={neutral}
                className="flex min-h-11 items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground disabled:opacity-30">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 sm:grid-cols-4">
              {LEVEL_DEFS.map((d) => {
                const off = Math.round((levels[d.key] - 1) * 100);
                return (
                  <div key={d.key}>
                    <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.15em]">
                      <span>{d.name}</span>
                      <span className={off === 0 ? 'text-muted-foreground/40' : 'text-primary'}>{off === 0 ? '—' : off < 0 ? d.less : d.more}</span>
                    </div>
                    <Slider min={0} max={2} step={0.05} value={[levels[d.key]]} aria-label={d.name}
                      onValueChange={([v]) => { setLevels({ ...levels, [d.key]: v }); stale(); }} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 2. Stems */}
        <section>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">2 · Stems</p>
          {handoffLoading && (
            <p role="status" className="mb-3 flex items-center gap-2 border border-border p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Receiving your Sprouts session…
            </p>
          )}
          {sessionName && (
            <div role="status" className="mb-3 border border-primary/50 bg-primary/5 p-3">
              <p className="text-sm font-medium">Sprouts session loaded</p>
              <p className="mt-1 text-xs text-muted-foreground">{sessionName} · {stems.length} independent stems and vocal layers</p>
            </div>
          )}
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border px-6 py-8 text-center hover:border-foreground/40">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Tap to choose files, or a Sprouts session .zip</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">WAV · MP3 · M4A · OGG · FLAC · up to {MAX_STEMS} stems</span>
            <input type="file" multiple accept="audio/*,.zip,application/zip" className="sr-only"
              onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          </label>

          {lengthMismatch && (
            <p role="status" className="mt-3 border border-primary/40 bg-primary/5 p-3 text-sm">
              Your stems are different lengths ({Math.min(...lengths).toFixed(1)}s to {Math.max(...lengths).toFixed(1)}s). Stems exported from one project
              are normally exactly the same length. If one was trimmed at the start it will play too early. Use <strong>Nudge</strong> to line it up.
            </p>
          )}

          {stems.length > 0 && (
            <ul className="mt-3 divide-y divide-border border border-border">
              {stems.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 w-full flex-1 sm:w-auto">
                    <p className="truncate text-sm">{s.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {formatBytes(s.size)} · {s.buffer.duration.toFixed(1)}s · {s.lead > 0.05 ? `first sound ${s.lead.toFixed(2)}s` : 'starts right away'}
                    </p>
                    <div className="mt-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      <span className="mr-1">Nudge</span>
                      {[-100, -10].map((ms) => (
                        <button key={ms} type="button" aria-label={`Move ${s.name} ${Math.abs(ms)} milliseconds earlier`} onClick={() => nudge(s.id, ms / 1000)}
                          className="min-h-9 border border-border px-2 hover:text-foreground">{'−'}{Math.abs(ms)}</button>
                      ))}
                      <span aria-label={`${s.name} nudge`} className="min-w-16 text-center text-foreground">{s.offset < 0 ? '−' : '+'}{Math.round(Math.abs(s.offset) * 1000)} ms</span>
                      {[10, 100].map((ms) => (
                        <button key={ms} type="button" aria-label={`Move ${s.name} ${ms} milliseconds later`} onClick={() => nudge(s.id, ms / 1000)}
                          className="min-h-9 border border-border px-2 hover:text-foreground">+{ms}</button>
                      ))}
                      <button type="button" disabled={s.offset === 0} onClick={() => nudge(s.id, -s.offset)} className="min-h-9 px-2 hover:text-foreground disabled:opacity-30">Reset</button>
                    </div>
                  </div>
                  <div className="flex border border-border">
                    {ROLES.map((r) => (
                      <button key={r.id} aria-pressed={s.role === r.id}
                        onClick={() => { setStems((p) => p.map((x) => (x.id === s.id ? { ...x, role: r.id } : x))); stale(); }}
                        className={`min-h-11 px-3 font-mono text-[11px] uppercase tracking-[0.1em] ${s.role === r.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <button aria-label={`Remove ${s.name}`} onClick={() => { setStems((p) => p.filter((x) => x.id !== s.id)); stale(); }}
                    className="ml-auto flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground sm:ml-0"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. Mix & master */}
        <section>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">3 · Master</p>
          <button onClick={mixAndMaster} disabled={!stems.length || mixing}
            className={`${btn} min-h-14 w-full bg-foreground text-sm text-background hover:opacity-90 disabled:opacity-40`}>
            {mixing && <Loader2 className="h-5 w-5 animate-spin" />}
            {mixing ? 'Mixing and mastering…' : master ? 'Mix again' : 'Mix & Master'}
          </button>

          {master && (
            <div className="mt-4 border border-primary/50 bg-primary/5">
              <div className="flex items-center gap-3 px-4 py-4">
                <button onClick={togglePlay} aria-label={playing ? 'Stop master' : 'Play master'}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  {playing ? <Square className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{template.name} master</p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Leveled · glued · limited to {template.master.ceilingDb} dB</p>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-primary/30 border-t border-primary/30">
                <button onClick={() => save(true)} className={`${btn} hover:bg-foreground/5`}><Share2 className="h-4 w-4" /> Share</button>
                <button onClick={() => save(false)} className={`${btn} hover:bg-foreground/5`}><Download className="h-4 w-4" /> WAV</button>
              </div>
            </div>
          )}
        </section>
      </div>
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
