import type { CatalogBeat } from '../../lib/catalog';

const palettes = {
  teal: { background: '#00948c', foreground: '#f4f4f4', detail: '#080b0b' },
  yellow: { background: '#ffe600', foreground: '#080b0b', detail: '#00948c' },
  sage: { background: '#dddec9', foreground: '#080b0b', detail: '#00948c' },
  sky: { background: '#aae2ff', foreground: '#080b0b', detail: '#00948c' },
};

export function BeatArt({ beat, large = false }: { beat: CatalogBeat; large?: boolean }) {
  const palette = palettes[beat.art];
  return (
    <div
      aria-hidden="true"
      className={`relative shrink-0 overflow-hidden ${large ? 'aspect-square w-full' : 'h-24 w-24'}`}
      style={{ backgroundColor: palette.background, color: palette.foreground }}
    >
      <div className="absolute inset-0 opacity-25" style={{ background: `repeating-linear-gradient(135deg, transparent 0 16px, ${palette.detail} 16px 17px)` }} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 200" fill="none">
        <path d="M100 100C45 25 10 55 25 100C40 145 100 100 100 100C100 100 155 25 175 65C195 105 155 175 100 100Z" stroke={palette.detail} strokeWidth="2" />
        <circle cx="100" cy="100" r={large ? 18 : 14} fill={palette.detail} />
        <circle cx="42" cy="72" r="5" fill={palette.detail} />
        <circle cx="160" cy="132" r="5" fill={palette.detail} />
      </svg>
      <span className={`absolute bottom-2 left-2 max-w-[90%] font-mono uppercase leading-tight tracking-tight ${large ? 'text-xs' : 'text-[8px]'}`}>
        {beat.title}
      </span>
    </div>
  );
}
