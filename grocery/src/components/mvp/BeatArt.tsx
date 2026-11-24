import type { CatalogBeat } from '../../lib/catalog';

const palettes = {
  teal: ['#00f0ff', '#0066ff', '#8b5cff'],
  yellow: ['#ffd36e', '#ff2bd6', '#7a1cff'],
  sage: ['#7dffc4', '#00b3ff', '#b44bff'],
  sky: ['#9be7ff', '#8b5cff', '#ff2bd6'],
} as const;

/** A holographic vinyl: spins slowly on hover and fast while its preview plays. */
export function BeatArt({ beat, large = false, playing = false }: { beat: CatalogBeat; large?: boolean; playing?: boolean }) {
  const [a, b, c] = palettes[beat.art];
  return (
    <div aria-hidden="true" className={`relative shrink-0 ${large ? 'aspect-square w-full' : 'h-24 w-24'}`}>
      <div className="absolute inset-[-14%] rounded-full opacity-60 blur-2xl transition-opacity duration-500" style={{ background: `radial-gradient(circle, ${b}66, transparent 65%)`, opacity: playing ? 0.95 : 0.45 }} />
      <div data-on={playing} className="vx-disc absolute inset-0 overflow-hidden rounded-full border border-white/10 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]"
        style={{ background: `conic-gradient(from 0deg, ${a}, ${b}, ${c}, ${a}, ${c}, ${b}, ${a})` }}>
        <div className="absolute inset-0" style={{ background: 'repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.55) 0 1px, rgba(0,0,0,0.18) 1px 3px)' }} />
        <div className="absolute inset-0 mix-blend-screen" style={{ background: 'conic-gradient(from 30deg, transparent 0 20%, rgba(255,255,255,0.35) 25%, transparent 32% 70%, rgba(255,255,255,0.25) 75%, transparent 82%)' }} />
        <div className="absolute inset-[34%] grid place-items-center rounded-full border border-white/20 bg-[#05040b]">
          <div className="h-[18%] w-[18%] rounded-full" style={{ background: a, boxShadow: `0 0 12px ${a}` }} />
        </div>
      </div>
      {large && <span className="absolute -bottom-7 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--vx-dim)]">{beat.id.replace(/-/g, '_')}.wav</span>}
    </div>
  );
}
