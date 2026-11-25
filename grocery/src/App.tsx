import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { CatalogView } from '@/components/mvp/CatalogView';
import { AuthDialog } from '@/components/mvp/AuthDialog';
import { BeatArt } from '@/components/mvp/BeatArt';
import { beatHasAudio, CATALOG_BEATS, getCatalogBeat, type CatalogBeat } from '@/lib/catalog';
import { audioContext, loadCatalogAudio, loadPreviewTag, PREVIEW_TAG_EVERY_SECONDS } from '@/lib/mvp/audio';
import { downloadBeatRelease, type BeatLicense } from '@/lib/mvp/release';
import { playbackAnalyser, setAnalyserActive } from '@/lib/mvp/analyser';
import { RadialScope, SpectrumBars, VaporBackdrop } from '@/components/mvp/Visuals';

type Stage = 'catalog' | 'beat';
interface AccountState { loading: boolean; available: boolean; payments: boolean; email: string | null }

const initialAccount: AccountState = { loading: true, available: false, payments: false, email: null };
const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const keyName = (key: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][key];

export default function App() {
  const [stage, setStage] = useState<Stage>('catalog');
  const [selected, setSelected] = useState<CatalogBeat | null>(null);
  const [account, setAccount] = useState<AccountState>(initialAccount);
  const [license, setLicense] = useState<BeatLicense | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState('Sign in to lease and download this beat.');
  const playback = useRef<AudioBufferSourceNode | null>(null);
  const playbackToken = useRef(0);
  const tagSources = useRef<AudioBufferSourceNode[]>([]);
  const audioCache = useRef(new Map<string, AudioBuffer>());

  const stopPreview = useCallback(() => {
    playbackToken.current += 1;
    setAnalyserActive(false);
    if (playback.current) {
      playback.current.onended = null;
      try { playback.current.stop(); } catch { /* already stopped */ }
      playback.current.disconnect();
      playback.current = null;
    }
    for (const voice of tagSources.current) {
      try { voice.stop(); } catch { /* already stopped */ }
      voice.disconnect();
    }
    tagSources.current = [];
    setPreviewId(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const refreshAccount = useCallback(async () => {
    try {
      const response = await fetch('/api/me', { credentials: 'same-origin' });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) throw new Error('static');
      const body = await response.json() as { email?: string; payments?: boolean; error?: string };
      if (response.ok) setAccount({ loading: false, available: true, payments: !!body.payments, email: body.email ?? null });
      else if (body.error === 'not_configured') setAccount({ loading: false, available: false, payments: false, email: null });
      else setAccount({ loading: false, available: true, payments: !!body.payments, email: null });
    } catch {
      setAccount({ loading: false, available: false, payments: false, email: null });
    }
  }, []);

  const loadLicense = useCallback(async (beatId: string): Promise<BeatLicense | null> => {
    if (!account.email) return null;
    try {
      const response = await fetch(`/api/beat-license?beat=${encodeURIComponent(beatId)}`, { credentials: 'same-origin' });
      const body = await response.json() as { license?: BeatLicense; message?: string };
      if (response.ok && body.license) { setLicense(body.license); return body.license; }
      if (!response.ok && body.message) toast.error(body.message);
    } catch { /* The next download or polling attempt retries. */ }
    return null;
  }, [account.email]);

  const openBeat = useCallback((beat: CatalogBeat) => {
    stopPreview();
    setSelected(beat);
    setLicense(null);
    setStage('beat');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stopPreview]);

  useEffect(() => {
    void refreshAccount();
    const params = new URLSearchParams(location.search);
    const requested = getCatalogBeat(params.get('beat') ?? params.get('paid') ?? params.get('cancelled'));
    if (requested) openBeat(requested);
    if (params.has('cancelled')) toast.error('Checkout cancelled. You were not charged.');
    // URL selection is intentionally a mount-only action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected && account.email) void loadLicense(selected.id);
    else setLicense(null);
  }, [selected, account.email, loadLicense]);

  useEffect(() => {
    const paid = new URLSearchParams(location.search).get('paid');
    if (!paid || paid !== selected?.id || !account.email || license) return;
    let attempts = 0;
    let timer = 0;
    let active = true;
    const poll = async () => {
      const owned = await loadLicense(paid);
      attempts += 1;
      if (active && !owned && attempts < 12) timer = window.setTimeout(poll, 2000);
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [selected, account.email, license, loadLicense]);

  const getAudio = async (beat: CatalogBeat): Promise<AudioBuffer> => {
    const cached = audioCache.current.get(beat.id);
    if (cached) return cached;
    const buffer = await loadCatalogAudio(beat);
    audioCache.current.set(beat.id, buffer);
    return buffer;
  };

  const preview = async (beat: CatalogBeat) => {
    if (previewId === beat.id) { stopPreview(); return; }
    if (!beatHasAudio(beat)) return;
    stopPreview();
    setBusy(`preview:${beat.id}`);
    try {
      const [buffer, tag] = await Promise.all([getAudio(beat), loadPreviewTag()]);
      const ctx = audioContext();
      await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(playbackAnalyser());
      const token = playbackToken.current;
      source.onended = () => { if (playbackToken.current === token) { playback.current = null; setAnalyserActive(false); setPreviewId(null); } };
      const startAt = ctx.currentTime + 0.05;
      source.start(startAt);
      if (tag) {
        for (let t = 0; t < buffer.duration; t += PREVIEW_TAG_EVERY_SECONDS) {
          const voice = ctx.createBufferSource();
          voice.buffer = tag;
          voice.connect(playbackAnalyser());
          voice.start(startAt + t);
          tagSources.current.push(voice);
        }
      }
      playback.current = source;
      setAnalyserActive(true);
      setPreviewId(beat.id);
    } catch {
      toast.error('That beat file could not be played. Check the uploaded audio and try again.');
    } finally {
      setBusy('');
    }
  };

  const download = async (beat: CatalogBeat, verified: BeatLicense) => {
    setBusy('download');
    try {
      await downloadBeatRelease(beat, verified);
      toast.success('Beat and license downloaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The beat download failed. Try again.');
    } finally {
      setBusy('');
    }
  };

  const checkout = async (beat: CatalogBeat) => {
    setBusy('checkout');
    try {
      const response = await fetch('/api/beat-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ beat: beat.id }),
      });
      const body = await response.json() as { url?: string; message?: string };
      if (response.ok && body.url) { location.assign(body.url); return; }
      throw new Error(body.message || 'Checkout could not be opened.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout could not be opened.');
    } finally {
      setBusy('');
    }
  };

  const purchaseAction = async () => {
    if (!selected) return;
    if (!beatHasAudio(selected)) return toast.error('This beat is not available yet.');
    if (account.loading) return toast.error('Still checking your account. Try again in a moment.');
    const owned = license ?? await loadLicense(selected.id);
    if (owned) return download(selected, owned);
    if (!account.available) return toast.error('Checkout is unavailable in this preview. Your beat files can still be prepared.');
    if (!account.email) {
      setAuthReason(`Sign in to lease “${selected.title}” and download the beat with its license.`);
      setAuthOpen(true);
      return;
    }
    if (!account.payments) return toast.error('Beat checkout is not switched on yet.');
    await checkout(selected);
  };

  const signOut = async () => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }), credentials: 'same-origin' }).catch(() => null);
    setAccount((current) => ({ ...current, email: null }));
    setLicense(null);
    toast.success('Signed out.');
  };

  const actionLabel = () => {
    if (!selected) return '';
    if (busy === 'checkout') return 'Opening secure checkout…';
    if (busy === 'download') return 'Building your download…';
    if (license) return 'Download beat + license';
    if (!beatHasAudio(selected)) return 'Coming soon';
    if (!account.email) return `Sign in to lease · ${money(selected.priceCents)}`;
    return `Lease beat · ${money(selected.priceCents)}`;
  };

  const live = !!selected && previewId === selected.id;

  return (
    <div className="relative min-h-dvh text-[#eef0ff]">
      <VaporBackdrop />
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#030306]/55 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-[1500px] items-center justify-between gap-3 px-5 sm:px-8">
          <button type="button" onClick={() => { stopPreview(); setStage('catalog'); }} className="group flex cursor-pointer items-center gap-3 text-left">
            <span className="relative grid h-8 w-8 place-items-center rounded-full border border-[var(--vx-cyan)]/50 shadow-[0_0_18px_-4px_var(--vx-cyan)]">
              <span className="h-2 w-2 rounded-full bg-[var(--vx-magenta)] shadow-[0_0_10px_var(--vx-magenta)] transition-transform group-hover:scale-150" />
            </span>
            <span className="font-display text-base font-bold tracking-[0.28em]">GROCERY</span>
          </button>
          <SpectrumBars bars={20} mirror={false} energy={0.85} className="hidden h-7 w-36 opacity-80 md:block" />
          <nav aria-label="Products" className="flex items-center gap-1 sm:gap-2">
            <a href="/bakery/" className="hidden min-h-11 items-center rounded-full px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--vx-dim)] transition hover:bg-white/5 hover:text-white sm:flex">Bakery</a>
            <a href="/pastry/" className="hidden min-h-11 items-center rounded-full px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--vx-dim)] transition hover:bg-white/5 hover:text-white sm:flex">Pastry</a>
            {account.available && !account.loading && (account.email
              ? <button type="button" onClick={signOut} className="vx-btn vx-btn-ghost min-h-10 px-5 text-xs">Sign out</button>
              : <button type="button" onClick={() => { setAuthReason('Sign in to lease or download your beats.'); setAuthOpen(true); }} className="vx-btn vx-btn-ghost min-h-10 px-5 text-xs">Sign in</button>)}
          </nav>
        </div>
      </header>

      {stage === 'catalog' && (
        <CatalogView
          beats={CATALOG_BEATS}
          previewId={previewId}
          loadingId={busy.startsWith('preview:') ? busy.split(':')[1] : null}
          onPreview={(beat) => void preview(beat)}
          onOpen={openBeat}
        />
      )}

      {stage === 'beat' && selected && (
        <main key={selected.id} className="mx-auto grid w-full max-w-[1300px] gap-10 px-5 pb-24 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_350px] lg:pt-10">
          <div className="vx-rise">
            <button type="button" onClick={() => { stopPreview(); setStage('catalog'); }} className="relative z-10 flex min-h-11 cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--vx-dim)] transition hover:text-[var(--vx-cyan)]"><ArrowLeft className="h-4 w-4" /> Beat catalog</button>

            <div className="mt-10 grid items-center gap-12 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:gap-16">
              <div className="relative mx-auto aspect-square w-full max-w-[280px]">
                <RadialScope active={live} className="pointer-events-none absolute inset-[-20%] h-[140%] w-[140%]" />
                <div className="absolute inset-[14%]"><BeatArt beat={selected} large playing={live} /></div>
              </div>
              <div className="min-w-0">
                <p className="vx-label">{selected.genre} / {selected.producer}</p>
                <h1 className="font-display mt-4 break-words text-4xl font-bold uppercase leading-[0.95] sm:text-6xl"><span className="vx-chrome vx-glitch" data-text={selected.title}>{selected.title}</span></h1>
                <div className="mt-6 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.18em]">
                  {[`${selected.bpm} BPM`, keyName(selected.key), `${money(selected.priceCents)} non-exclusive`].map((chip) => (
                    <span key={chip} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-white/80 backdrop-blur">{chip}</span>
                  ))}
                </div>
              </div>
            </div>

            <section className="vx-glass vx-edge mt-14 p-6 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="vx-label">Real recording preview</p>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--vx-dim)]">{live ? '● Live · full song' : 'Idle'}</span>
              </div>
              <SpectrumBars bars={72} className="mt-5 h-32 w-full" />
              <button type="button" onClick={() => void preview(selected)} disabled={!beatHasAudio(selected) || (!!busy && busy !== `preview:${selected.id}`)} className={`vx-btn mt-5 min-h-14 px-8 text-sm ${live ? 'vx-btn-ghost' : 'vx-btn-primary'}`}>
                {busy === `preview:${selected.id}` ? <Loader2 className="h-5 w-5 animate-spin" /> : live ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {live ? 'Stop preview' : 'Play the full song'}
              </button>
              {!beatHasAudio(selected) && <p className="mt-4 text-sm text-[var(--vx-dim)]">The real audio file has not been added to this slot yet.</p>}
            </section>

            <section className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void purchaseAction()} disabled={!beatHasAudio(selected) || !!busy} className="vx-btn vx-btn-primary min-h-16 px-5 text-sm">
                {busy === 'checkout' || busy === 'download' ? <Loader2 className="h-5 w-5 animate-spin" /> : license ? <Download className="h-5 w-5" /> : null}{actionLabel()}
              </button>
              <a href="/bakery/" className="vx-btn vx-btn-ghost min-h-16 px-5 text-sm">Record vocals in Bakery <ArrowRight className="h-5 w-5" /></a>
            </section>
          </div>

          <aside className="vx-glass vx-edge vx-rise h-fit p-7 [animation-delay:.12s] lg:sticky lg:top-24">
            <p className="vx-label">What the lease includes</p>
            <ul className="mt-6 space-y-4 text-sm leading-relaxed text-white/80">
              {['The original beat audio file.', 'One new commercial song.', 'Streaming, downloads, performances, and song-promotion videos.', 'A plain-English license with your purchase record.'].map((item) => (
                <li key={item} className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vx-cyan)] drop-shadow-[0_0_6px_var(--vx-cyan)]" /> {item}</li>
              ))}
            </ul>
            <div className="vx-rule my-6" />
            <div className="text-sm leading-relaxed text-[var(--vx-dim)]">
              {license ? <p className="text-white">License verified.<br /><span className="break-all font-mono text-xs text-[var(--vx-dim)]">{license.id}</span></p> : <p>The producer keeps the beat. You keep your new lyrics and vocal. Beat credit is required; exclusive rights are not included.</p>}
            </div>
          </aside>
        </main>
      )}

      <AuthDialog open={authOpen} reason={authReason} onClose={() => setAuthOpen(false)} onSuccess={refreshAccount} />
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
