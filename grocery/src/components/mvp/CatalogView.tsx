import { ArrowDown, ArrowRight, ArrowUpRight, Loader2, Pause, Play } from 'lucide-react';
import { beatHasAudio, type CatalogBeat } from '../../lib/catalog';
import { BeatArt } from './BeatArt';
import { QuantumShelf } from './QuantumShelf';

interface Props {
  beats: CatalogBeat[];
  previewId: string | null;
  loadingId: string | null;
  onPreview: (beat: CatalogBeat) => void;
  onOpen: (beat: CatalogBeat) => void;
}

const keyName = (key: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][key];
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function CatalogView({ beats, previewId, loadingId, onPreview, onOpen }: Props) {
  return (
    <main>
      <section className="border-b border-[#263331]">
        <div className="mx-auto grid w-full max-w-[1500px] lg:grid-cols-[minmax(0,0.92fr)_minmax(480px,1.08fr)]">
          <div className="hero-enter flex flex-col justify-between px-5 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-16 lg:min-h-[600px] lg:py-16 lg:pr-14">
            <div>
              <p className="section-marker font-mono text-[10px] uppercase tracking-[0.22em] text-[#44a6e4]">Grocery / quantum provisions</p>
              <h1 className="mt-8 max-w-[720px] text-[clamp(3.35rem,7.2vw,7.4rem)] font-light leading-[0.86] tracking-[-0.072em] text-[#f4f4f4] lg:text-[clamp(4.4rem,6.3vw,6.8rem)]">
                A grocery store at the <span className="font-serif-accent font-normal italic tracking-[-0.035em] text-[#f0eee6]">Planck scale.</span>
              </h1>
              <p className="mt-8 max-w-[510px] text-base leading-relaxed text-[#a7b0ad] sm:text-lg">
                Real beat recordings, measured in BPM. Preview the audio, take a clear lease, then record your vocals in Sprouts.
              </p>
            </div>

            <div className="mt-10 lg:mt-14">
              <div className="flex flex-col gap-3 sm:flex-row">
                <a href="#catalog" className="flex min-h-[52px] items-center justify-center gap-3 rounded-full bg-[#f4f4f4] px-6 text-sm font-semibold text-[#080b0b] transition duration-300 hover:bg-[#f7e84c] focus-visible:outline-[#44a6e4]">
                  Browse the shelves <ArrowDown className="h-4 w-4" />
                </a>
                <a href="/sprouts/" className="flex min-h-[52px] items-center justify-center gap-3 rounded-full border border-[#52615e] px-6 text-sm font-medium text-[#f4f4f4] transition duration-300 hover:border-[#44a6e4] hover:text-[#44a6e4]">
                  Open Sprouts <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a7b0ad]">
                <span>Real audio only</span>
                <span>Non-exclusive leases</span>
                <span>Plain-English license</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#263331] lg:border-l lg:border-t-0">
            <QuantumShelf />
          </div>
        </div>
      </section>

      <section id="catalog" aria-labelledby="catalog-title" className="mx-auto w-full max-w-[1500px] scroll-mt-20 px-5 pb-20 pt-16 sm:px-8 sm:pt-20">
        <div className="grid gap-6 border-b border-[#52615e] pb-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="section-marker font-mono text-[10px] uppercase tracking-[0.22em] text-[#44a6e4]">Aisle 01 / current catalog</p>
            <h2 id="catalog-title" className="mt-5 text-5xl font-light tracking-[-0.055em] text-[#f4f4f4] sm:text-6xl">The shelves.</h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-[#a7b0ad] md:text-right">
            {beats.length} titled provisions. A slot becomes available only when its real recording is stocked.
          </p>
        </div>

        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
          {beats.map((beat, index) => {
            const available = beatHasAudio(beat);
            const loading = loadingId === beat.id;
            const playing = previewId === beat.id;
            return (
              <article key={beat.id} className="beat-card group min-w-0 border-t border-[#52615e] pt-3">
                <div className="mb-4 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[#a7b0ad]">
                  <span>Provision {String(index + 1).padStart(2, '0')}</span>
                  <span className={available ? 'text-[#44a6e4]' : ''}>{available ? 'In stock' : 'Audio pending'}</span>
                </div>

                <div className="beat-card__art">
                  <BeatArt beat={beat} large />
                  {available && (
                    <button
                      type="button"
                      aria-label={`${playing ? 'Stop' : 'Preview'} ${beat.title}`}
                      onClick={() => onPreview(beat)}
                      disabled={!!loadingId && !loading}
                      className="absolute bottom-4 right-4 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[#f4f4f4]/40 bg-[#080b0b] text-[#f4f4f4] transition duration-300 hover:scale-105 hover:border-[#44a6e4] hover:text-[#44a6e4] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                    </button>
                  )}
                </div>

                <div className="mt-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#44a6e4]">{beat.genre} / {beat.producer}</p>
                    <h3 className="mt-2 break-words text-2xl font-medium leading-tight tracking-[-0.035em] text-[#f4f4f4]">{beat.title}</h3>
                  </div>
                  <p className="shrink-0 font-mono text-sm text-[#f4f4f4]">{money(beat.priceCents)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#263331] pb-5 text-xs text-[#a7b0ad]">
                  <span>{beat.bpm} BPM · {keyName(beat.key)}</span>
                  <button
                    type="button"
                    onClick={() => onOpen(beat)}
                    disabled={!available}
                    className="flex min-h-11 cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f4f4f4] transition hover:text-[#f7e84c] disabled:cursor-not-allowed disabled:text-[#667370]"
                  >
                    {available ? <>View provision <ArrowRight className="h-3.5 w-3.5" /></> : 'Coming soon'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-[#263331] bg-[#0d1213]">
        <div className="mx-auto grid w-full max-w-[1500px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div>
            <p className="section-marker font-mono text-[10px] uppercase tracking-[0.22em] text-[#44a6e4]">From shelf to session</p>
            <h2 className="mt-5 max-w-md text-4xl font-light leading-[1.02] tracking-[-0.045em] text-[#f4f4f4] sm:text-5xl">A clean route through the store.</h2>
            <a href="/sprouts/" className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-full bg-[#f4f4f4] px-6 text-sm font-semibold text-[#080b0b] transition duration-300 hover:bg-[#f7e84c]">
              Record in Sprouts <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
          <ol className="grid gap-0 sm:grid-cols-3">
            {[
              ['01', 'Audition', 'Preview the actual beat recording before you make a decision.'],
              ['02', 'Lease', 'Sign in only to lease or download. Receive the original audio and license.'],
              ['03', 'Create', 'Record vocals in Sprouts, then mix and master the session in Pastry.'],
            ].map(([number, title, copy]) => (
              <li key={number} className="border-t border-[#52615e] py-5 sm:px-5 sm:py-0 sm:pt-5 first:sm:pl-0 last:sm:pr-0">
                <span className="font-mono text-xs text-[#f7e84c]">{number}</span>
                <h3 className="mt-5 text-xl font-medium tracking-tight text-[#f4f4f4]">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#a7b0ad]">{copy}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 border-t border-[#263331] px-5 py-5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.15em] text-[#778481] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Grocery / audio provisions at ℓₚ</span>
          <span>No synthesized stand-ins. No audio, no sale.</span>
        </div>
      </section>
    </main>
  );
}
