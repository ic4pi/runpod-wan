import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { CatalogView } from '@/components/mvp/CatalogView';
import { AuthDialog } from '@/components/mvp/AuthDialog';
import { BeatArt } from '@/components/mvp/BeatArt';
import { beatHasAudio, CATALOG_BEATS, getCatalogBeat, type CatalogBeat } from '@/lib/catalog';
import { audioContext, loadCatalogAudio, loadPreviewAudio } from '@/lib/mvp/audio';
import { downloadBeatRelease, type BeatLicense } from '@/lib/mvp/release';
import { audioBufferToWav } from '@/lib/audio/wav';
import { stageSproutsBeat } from '@/lib/mvp/sproutsHandoff';

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
  const audioCache = useRef(new Map<string, AudioBuffer>());

  const stopPreview = useCallback(() => {
    playbackToken.current += 1;
    if (playback.current) {
      playback.current.onended = null;
      try { playback.current.stop(); } catch { /* already stopped */ }
      playback.current.disconnect();
      playback.current = null;
    }
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

  const getAudio = async (beat: CatalogBeat, watermarked: boolean): Promise<AudioBuffer> => {
    const key = `${beat.id}:${watermarked ? 'tagged' : 'clean'}`;
    const cached = audioCache.current.get(key);
    if (cached) return cached;
    const buffer = watermarked ? await loadPreviewAudio(beat) : await loadCatalogAudio(beat);
    audioCache.current.set(key, buffer);
    return buffer;
  };

  const preview = async (beat: CatalogBeat) => {
    if (previewId === beat.id) { stopPreview(); return; }
    if (!beatHasAudio(beat)) return;
    stopPreview();
    setBusy(`preview:${beat.id}`);
    try {
      const buffer = await getAudio(beat, true);
      const ctx = audioContext();
      await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const token = playbackToken.current;
      source.onended = () => { if (playbackToken.current === token) { playback.current = null; setPreviewId(null); } };
      source.start(0, 0, Math.min(30, buffer.duration));
      playback.current = source;
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

  const useInSprouts = async () => {
    if (!selected || !beatHasAudio(selected)) return;
    stopPreview();
    setBusy('sprouts');
    try {
      // Only the database-backed lease unlocks clean audio. Missing or unclear
      // authentication always falls back to the tagged version.
      const owned = license ?? await loadLicense(selected.id);
      const buffer = await getAudio(selected, !owned);
      const slug = selected.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'grocery-beat';
      const handoffId = await stageSproutsBeat({
        blob: audioBufferToWav(buffer),
        filename: `${slug}${owned ? '-clean' : '-capi-tags'}.wav`,
        title: selected.title,
        producer: selected.producer,
        bpm: selected.bpm,
        licensed: !!owned,
      });
      window.location.assign(`/sprouts/?from=grocery&beat=${encodeURIComponent(handoffId)}`);
    } catch {
      toast.error('The beat could not be sent to Sprouts. Try again, or use your licensed download.');
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

  return (
    <div className="min-h-dvh bg-[#080b0b] text-[#f4f4f4]">
      <header className="sticky top-0 z-40 border-b border-[#263331] bg-[#080b0b]/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[1500px] items-center justify-between gap-3 px-5 sm:px-8">
          <button type="button" onClick={() => { stopPreview(); setStage('catalog'); }} className="group flex min-h-11 cursor-pointer items-center gap-3 text-left">
            <span className="text-xl font-semibold tracking-[-0.04em]">GROCERY<span className="text-[#44a6e4]">.</span></span>
            <span className="hidden border-l border-[#334144] pl-3 font-mono text-[8px] uppercase leading-relaxed tracking-[0.18em] text-[#778481] md:block">Provisions<br />at ℓₚ</span>
          </button>
          <nav aria-label="Products" className="flex items-center gap-1 sm:gap-3">
            <a href="/sprouts/" className="hidden min-h-11 items-center px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a7b0ad] transition hover:text-[#44a6e4] sm:flex">Sprouts</a>
            <a href="/pastry/" className="hidden min-h-11 items-center px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a7b0ad] transition hover:text-[#44a6e4] sm:flex">Pastry</a>
            {account.available && !account.loading && (account.email
              ? <button type="button" onClick={signOut} className="min-h-11 cursor-pointer px-3 text-sm text-[#a7b0ad] hover:text-[#f4f4f4]">Sign out</button>
              : <button type="button" onClick={() => { setAuthReason('Sign in to lease or download your beats.'); setAuthOpen(true); }} className="min-h-11 cursor-pointer px-3 text-sm text-[#a7b0ad] hover:text-[#f4f4f4]">Sign in</button>)}
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
        <main className="mx-auto grid w-full max-w-[1300px] gap-10 px-5 pb-20 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_350px] lg:pt-12">
          <div>
            <button type="button" onClick={() => { stopPreview(); setStage('catalog'); }} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#a7b0ad] hover:text-[#f4f4f4]"><ArrowLeft className="h-4 w-4" /> Beat catalog</button>
            <div className="mt-6 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-8">
              <BeatArt beat={selected} large />
              <div className="min-w-0">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#44a6e4]">{selected.genre} / {selected.producer}</p>
                <h1 className="mt-3 break-words text-4xl font-semibold leading-none tracking-[-0.045em] sm:text-6xl">{selected.title}</h1>
                <p className="mt-4 text-sm text-[#a7b0ad]">{selected.bpm} BPM · {keyName(selected.key)} · {money(selected.priceCents)} non-exclusive</p>
              </div>
            </div>

            <section className="mt-10 border-y border-[#334144] py-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-wider text-[#a7b0ad]">Real recording preview</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#44a6e4]">Capi Capi tags until leased</p>
              </div>
              <button type="button" onClick={() => void preview(selected)} disabled={!beatHasAudio(selected) || (!!busy && busy !== `preview:${selected.id}`)} className="mt-4 flex min-h-14 cursor-pointer items-center gap-3 rounded-full bg-[#f4f4f4] px-7 font-semibold text-[#080b0b] transition hover:bg-[#f7e84c] disabled:cursor-not-allowed disabled:opacity-40">
                {busy === `preview:${selected.id}` ? <Loader2 className="h-5 w-5 animate-spin" /> : previewId === selected.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {previewId === selected.id ? 'Stop preview' : 'Play up to 30 seconds'}
              </button>
              {!beatHasAudio(selected) && <p className="mt-4 text-sm text-[#a7b0ad]">The real audio file has not been added to this slot yet.</p>}
            </section>

            <section className="mt-8 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void purchaseAction()} disabled={!beatHasAudio(selected) || !!busy} className="flex min-h-16 cursor-pointer items-center justify-center gap-3 rounded-full bg-[#f7e84c] px-5 font-semibold text-[#080b0b] transition hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:opacity-40">
                {busy === 'checkout' || busy === 'download' ? <Loader2 className="h-5 w-5 animate-spin" /> : license ? <Download className="h-5 w-5" /> : null}{actionLabel()}
              </button>
              <button type="button" onClick={() => void useInSprouts()} disabled={!beatHasAudio(selected) || !!busy} className="flex min-h-16 items-center justify-center gap-3 rounded-full border border-[#334144] px-5 font-semibold text-[#f4f4f4] transition hover:border-[#44a6e4] disabled:cursor-not-allowed disabled:opacity-40">
                {busy === 'sprouts' ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {busy === 'sprouts' ? 'Preparing your beat…' : 'Use in Sprouts'}<ArrowRight className="h-5 w-5" />
              </button>
            </section>
            <p className="mt-3 text-xs leading-relaxed text-[#a7b0ad]">Try the beat with Capi Capi tags, or use the clean version after a verified lease. Sprouts can send your recording and music stems straight to Pastry.</p>
          </div>

          <aside className="h-fit border border-[#334144] bg-[#0d1213] p-6 lg:sticky lg:top-8">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#44a6e4]">What the lease includes</p>
            <ul className="mt-5 space-y-4 text-sm leading-relaxed text-[#a7b0ad]">
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f7e84c]" /> The original beat audio file.</li>
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f7e84c]" /> One new commercial song.</li>
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f7e84c]" /> Streaming, downloads, performances, and song-promotion videos.</li>
              <li className="flex gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f7e84c]" /> A plain-English license with your purchase record.</li>
            </ul>
            <div className="mt-6 border-t border-[#334144] pt-6 text-sm leading-relaxed text-[#a7b0ad]">
              {license ? <p className="text-[#f4f4f4]">License verified.<br /><span className="break-all font-mono text-xs text-[#a7b0ad]">{license.id}</span></p> : <p>The producer keeps the beat. You keep your new lyrics and vocal. Beat credit is required; exclusive rights are not included.</p>}
            </div>
          </aside>
        </main>
      )}

      <AuthDialog open={authOpen} reason={authReason} onClose={() => setAuthOpen(false)} onSuccess={refreshAccount} />
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
