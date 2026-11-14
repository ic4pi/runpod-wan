import { ArrowRight, Loader2, Pause, Play } from 'lucide-react';
import { beatHasAudio, type CatalogBeat } from '../../lib/catalog';
import { BeatArt } from './BeatArt';

interface Props {
  beats: CatalogBeat[];
  previewId: string | null;
  loadingId: string | null;
  onPreview: (beat: CatalogBeat) => void;
  onOpen: (beat: CatalogBeat) => void;
}

const keyName = (key: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][key];

export function CatalogView({ beats, previewId, loadingId, onPreview, onOpen }: Props) {
  return (
    <main className="mx-auto grid w-full max-w-[1500px] gap-10 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-12 lg:pt-14">
      <div>
        <div className="max-w-4xl border-b border-[#52615e] pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#00948c]">Grocery / the beat store</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-[-0.055em] text-[#f4f4f4] sm:text-7xl">
            Browse beats.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#a7b0ad]">Preview real beat recordings. Lease once. Download the beat and a plain-English license. Your vocals happen in Sprouts.</p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-[#52615e] pb-4">
          <h2 className="text-xl font-medium">The catalog</h2>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#a7b0ad]">Real audio only · $19 non-exclusive lease</span>
        </div>

        <div className="grid gap-px bg-[#52615e] sm:grid-cols-2">
          {beats.map((beat) => {
            const available = beatHasAudio(beat);
            const loading = loadingId === beat.id;
            const playing = previewId === beat.id;
            return (
              <article key={beat.id} className="bg-[#080b0b] p-5">
                <div className="flex gap-4">
                  <BeatArt beat={beat} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#00948c]">{beat.genre}</p>
                    <h3 className="mt-1 truncate text-xl font-medium tracking-tight">{beat.title}</h3>
                    <p className="mt-2 text-sm text-[#a7b0ad]">{beat.bpm} BPM · {keyName(beat.key)}</p>
                    <p className="mt-2 font-mono text-xs text-[#f4f4f4]">$19 · non-exclusive</p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-[44px_1fr] gap-2">
                  <button type="button" aria-label={`${playing ? 'Stop' : 'Preview'} ${beat.title}`} onClick={() => onPreview(beat)} disabled={!available || (!!loadingId && !loading)} className="flex h-11 cursor-pointer items-center justify-center border border-[#52615e] text-[#f4f4f4] transition hover:border-[#00948c] disabled:cursor-not-allowed disabled:opacity-30">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => onOpen(beat)} disabled={!available} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#ffe600] px-4 text-sm font-semibold text-[#080b0b] transition hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:bg-[#263331] disabled:text-[#a7b0ad]">
                    {available ? <>View beat <ArrowRight className="h-4 w-4" /></> : 'Coming soon'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="h-fit border border-[#52615e] bg-[#101515] p-6 lg:sticky lg:top-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#00948c]">One clear path</p>
        <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">Beat here. Vocals in Sprouts.</h2>
        <ol className="mt-6 space-y-5 text-sm leading-relaxed">
          <li><strong className="mr-2 text-[#ffe600]">01</strong> Preview the actual beat recording.</li>
          <li><strong className="mr-2 text-[#ffe600]">02</strong> Sign in only when you lease or download.</li>
          <li><strong className="mr-2 text-[#ffe600]">03</strong> Get the original audio and your license.</li>
          <li><strong className="mr-2 text-[#ffe600]">04</strong> Record your vocals in Sprouts.</li>
        </ol>
        <a href="/sprouts/" className="mt-8 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f4f4f4] px-5 font-semibold text-[#080b0b] transition hover:bg-[#ffe600]">Open Sprouts <ArrowRight className="h-4 w-4" /></a>
        <p className="mt-4 text-xs leading-relaxed text-[#a7b0ad]">Empty slots say “Coming soon.” Nothing is generated or sold before a real beat file is added.</p>
      </aside>
    </main>
  );
}
