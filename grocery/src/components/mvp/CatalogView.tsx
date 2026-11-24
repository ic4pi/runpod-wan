import { ArrowRight, Loader2, Pause, Play } from 'lucide-react';
import { beatHasAudio, type CatalogBeat } from '../../lib/catalog';
import { BeatArt } from './BeatArt';
import { Oscilloscope, SpectrumBars, tiltHandlers } from './Visuals';

interface Props {
  beats: CatalogBeat[];
  previewId: string | null;
  loadingId: string | null;
  onPreview: (beat: CatalogBeat) => void;
  onOpen: (beat: CatalogBeat) => void;
}

const keyName = (key: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][key];
const tilt = tiltHandlers(7);

export function CatalogView({ beats, previewId, loadingId, onPreview, onOpen }: Props) {
  const nowPlaying = beats.find((beat) => beat.id === previewId);
  return (
    <main className="mx-auto w-full max-w-[1500px] px-5 pb-24 pt-10 sm:px-8 lg:pt-16">
      {/* Hero */}
      <section className="relative grid items-end gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="vx-rise">
          <p className="vx-label flex items-center gap-3"><span className="vx-dot" /> Grocery / the beat store</p>
          <h1 className="font-display mt-6 text-[clamp(2.6rem,7.5vw,6.4rem)] font-bold uppercase leading-[0.92]">
            <span className="vx-chrome vx-glitch" data-text="Browse">Browse</span><br />
            <span className="vx-chrome vx-glitch" data-text="beats.">beats.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg font-light leading-relaxed text-[var(--vx-dim)]">
            Preview real beat recordings. Lease once. Download the beat and a plain-English license. Your vocals happen in Bakery.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#catalog" className="vx-btn vx-btn-primary min-h-12 px-7 text-sm">Enter the catalog <ArrowRight className="h-4 w-4" /></a>
            <a href="/bakery/" className="vx-btn vx-btn-ghost min-h-12 px-7 text-sm">Open Bakery</a>
          </div>
        </div>

        <div className="vx-glass vx-edge vx-rise overflow-hidden p-5 [animation-delay:.15s] sm:p-6">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--vx-dim)]">
            <span className="flex items-center gap-2"><span className="vx-dot" style={nowPlaying ? { background: 'var(--vx-magenta)', boxShadow: '0 0 10px var(--vx-magenta)' } : undefined} />{nowPlaying ? 'Live signal' : 'Standby'}</span>
            <span>{nowPlaying ? `${nowPlaying.bpm} BPM · ${keyName(nowPlaying.key)}` : '44.1 kHz · 24 bit'}</span>
          </div>
          <SpectrumBars bars={56} className="mt-4 h-44 w-full sm:h-56" />
          <div className="vx-rule my-3" />
          <Oscilloscope className="h-14 w-full" />
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="vx-label !text-[var(--vx-dim)]">Now playing</p>
              <p className="font-display mt-1 truncate text-sm uppercase text-white">{nowPlaying ? nowPlaying.title : 'Nothing queued'}</p>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--vx-dim)]">{beats.filter(beatHasAudio).length.toString().padStart(2, '0')} / {beats.length.toString().padStart(2, '0')} online</p>
          </div>
        </div>
      </section>

      <div className="mt-20 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div id="catalog" className="scroll-mt-24">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="vx-label">Index</p>
              <h2 className="font-display mt-2 text-2xl font-bold uppercase tracking-wide">The catalog</h2>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--vx-dim)]">Real audio only · $19 non-exclusive lease</span>
          </div>
          <div className="vx-rule mb-6" />

          <div className="grid gap-5 sm:grid-cols-2">
            {beats.map((beat, index) => {
              const available = beatHasAudio(beat);
              const loading = loadingId === beat.id;
              const playing = previewId === beat.id;
              return (
                <article key={beat.id} {...tilt} data-playing={playing}
                  className="vx-glass vx-card vx-rise group overflow-hidden p-5" style={{ animationDelay: `${0.05 * index}s` }}>
                  <div className="flex gap-5" style={{ transform: 'translateZ(30px)' }}>
                    <BeatArt beat={beat} playing={playing} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="vx-label">{beat.genre}</p>
                        <span className="font-mono text-[10px] text-[var(--vx-dim)]">#{String(index + 1).padStart(2, '0')}</span>
                      </div>
                      <h3 className="mt-2 truncate text-xl font-medium tracking-tight text-white">{beat.title}</h3>
                      <p className="mt-1 font-mono text-xs text-[var(--vx-dim)]">{beat.bpm} BPM · {keyName(beat.key)}</p>
                      <p className="mt-2 font-mono text-xs text-white/90">$19 · non-exclusive</p>
                    </div>
                  </div>
                  <div className={`mt-4 h-8 transition-opacity duration-500 ${playing ? 'opacity-100' : 'opacity-25 group-hover:opacity-60'}`}>
                    <SpectrumBars bars={32} mirror={false} energy={0.8} live={playing} className="h-full w-full" />
                  </div>
                  <div className="mt-4 grid grid-cols-[48px_1fr] gap-3" style={{ transform: 'translateZ(20px)' }}>
                    <button type="button" aria-label={`${playing ? 'Stop' : 'Preview'} ${beat.title}`} onClick={() => onPreview(beat)} disabled={!available || (!!loadingId && !loading)} data-on={playing} className="vx-play h-12 w-12">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
                    </button>
                    <button type="button" onClick={() => onOpen(beat)} disabled={!available} className={`vx-btn min-h-12 px-4 text-sm ${available ? 'vx-btn-primary' : 'vx-btn-ghost'}`}>
                      {available ? <>View beat <ArrowRight className="h-4 w-4" /></> : <span className="font-mono text-xs uppercase tracking-[0.2em]">Coming soon</span>}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="vx-glass vx-edge h-fit p-7 lg:sticky lg:top-24">
          <p className="vx-label">One clear path</p>
          <h2 className="font-display mt-4 text-xl font-bold uppercase leading-snug">Beat here.<br /><span className="vx-chrome">Vocals in Bakery.</span></h2>
          <ol className="mt-7 space-y-5 text-sm leading-relaxed text-white/85">
            {['Preview the actual beat recording.', 'Sign in only when you lease or download.', 'Get the original audio and your license.', 'Record your vocals in Bakery.'].map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="font-mono text-xs text-[var(--vx-magenta)] [text-shadow:0_0_10px_var(--vx-magenta)]">0{i + 1}</span>{step}
              </li>
            ))}
          </ol>
          <a href="/bakery/" className="vx-btn vx-btn-primary mt-8 min-h-12 w-full px-5 text-sm">Open Bakery <ArrowRight className="h-4 w-4" /></a>
          <p className="mt-5 text-xs leading-relaxed text-[var(--vx-dim)]">Empty slots say “Coming soon.” Nothing is generated or sold before a real beat file is added.</p>
        </aside>
      </div>
    </main>
  );
}
