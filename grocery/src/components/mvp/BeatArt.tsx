import type { CatalogBeat } from '../../lib/catalog';

const palettes = {
  teal: { background: '#44A6E4', foreground: '#080B0B', detail: '#F0EEE6' },
  yellow: { background: '#F7E84C', foreground: '#080B0B', detail: '#2979FF' },
  sage: { background: '#F0EEE6', foreground: '#080B0B', detail: '#D97757' },
  sky: { background: '#2979FF', foreground: '#F4F4F4', detail: '#44A6E4' },
};

const hashTitle = (value: string) => [...value].reduce((total, letter) => ((total * 31) + letter.charCodeAt(0)) >>> 0, 7);

export function BeatArt({ beat, large = false }: { beat: CatalogBeat; large?: boolean }) {
  const palette = palettes[beat.art];
  const seed = hashTitle(beat.id);
  const phase = (seed % 17) / 17;
  const wave = Array.from({ length: 41 }, (_, index) => {
    const x = index * 10;
    const y = 200 + Math.sin(index * 0.47 + phase * Math.PI * 2) * 52 + Math.cos(index * 0.19 + phase) * 23;
    return `${index === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`;
  }).join(' ');

  return (
    <div
      aria-hidden="true"
      className={`beat-package ${large ? 'beat-package--large' : 'beat-package--small'}`}
      style={{ backgroundColor: palette.background, color: palette.foreground }}
    >
      <div className="beat-package__topline">
        <span>Grocery</span>
        <span>ℓₚ / {String((seed % 90) + 10)}</span>
      </div>

      <svg className="beat-package__field" viewBox="0 0 400 400" fill="none">
        <path d={wave} stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        <path d={wave} stroke={palette.detail} strokeWidth="0.8" opacity="0.7" transform="translate(0 18) scale(1 .88)" />
        <g className="beat-package__orbits" style={{ transformOrigin: '200px 190px' }}>
          {[0, 1, 2, 3, 4].map((ring) => (
            <ellipse
              key={ring}
              cx="200"
              cy="190"
              rx={116 - ring * 12}
              ry={38 + ring * 13}
              transform={`rotate(${ring * 29 + phase * 24} 200 190)`}
              stroke={ring === 2 ? palette.detail : 'currentColor'}
              strokeWidth={ring === 2 ? 1.6 : 0.85}
              opacity={0.42 + ring * 0.08}
            />
          ))}
        </g>
        <circle cx="200" cy="190" r="13" fill="currentColor" />
        <circle cx={112 + phase * 90} cy={116 + phase * 48} r="5" fill={palette.detail} />
        <circle cx={290 - phase * 50} cy={258 - phase * 30} r="3" fill="currentColor" />
        <path d="M30 32H74M30 32V76M370 324V368H326" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      </svg>

      <div className="beat-package__footer">
        <div>
          <span className="beat-package__kicker">Audio provision / {beat.genre}</span>
          <strong>{beat.title}</strong>
        </div>
        <span className="beat-package__barcode">
          {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ width: index % 3 === 0 ? 3 : 1 }} />)}
        </span>
      </div>
    </div>
  );
}
