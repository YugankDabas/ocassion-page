import type { ReactNode } from 'react';
import type { Motif, Theme } from '../../../contracts';
import { SCENES, Scene, type SceneName } from './scenes';

/**
 * Built-in occasion artwork. Everything here is inline SVG coloured from the
 * page theme, so pages look finished before any banner image is uploaded and
 * the art never needs an extra network request.
 */

export type ResolvedMotif = Exclude<Motif, 'auto'>;

const BY_PATTERN: Record<Theme['pattern'], ResolvedMotif> = {
  rangoli: 'diya',
  hearts: 'hearts',
  snow: 'tree',
  dots: 'balloons',
  sparkle: 'fireworks',
  none: 'gift',
};

export function resolveMotif(theme: Pick<Theme, 'motif' | 'pattern'>): ResolvedMotif {
  return theme.motif === 'auto' ? BY_PATTERN[theme.pattern] : theme.motif;
}

const P = 'var(--c-primary)';
const S = 'var(--c-secondary)';
const A = 'var(--c-accent)';
const CREAM = '#FFF6DF';
const fill = (c: string) => ({ style: { fill: c } });
const turn = (n: number) => Array.from({ length: n }, (_, i) => (360 / n) * i);

const HEART = 'M0 30C-44 2-34-34-12-30C-4-28 0-22 0-18C0-22 4-28 12-30C34-34 44 2 0 30Z';
const STAR4 = 'M0-10L2.6-2.6L10 0L2.6 2.6L0 10L-2.6 2.6L-10 0L-2.6-2.6Z';
const STAR5 = 'M0-10L2.9-3.1L9.5-3.1L4.2 1.2L6.2 8.1L0 4L-6.2 8.1L-4.2 1.2L-9.5-3.1L-2.9-3.1Z';

/* ---------- Centre-piece illustrations (viewBox -50 -50 100 100) ---------- */
const GLYPHS: Partial<Record<ResolvedMotif, ReactNode>> = {
  diya: (
    <>
      <circle cy="-20" r="26" fill="#FFD86B" opacity=".4" />
      <path d="M0-44C13-27 15-14 0-5C-15-14-13-27 0-44Z" fill="#FF8A00" />
      <path d="M0-31C7-21 7-14 0-9C-7-14-7-21 0-31Z" fill="#FFE66D" />
      <path d="M-40-2Q0 12 40-2Q36 31 0 33Q-36 31-40-2Z" fill="#B93A0C" />
      <ellipse cy="-2" rx="40" ry="8.5" fill="#E76F51" />
      <ellipse cy="-2" rx="31" ry="5" fill="#6E2607" />
      {[-24, -12, 0, 12, 24].map((x) => (
        <circle key={x} cx={x} cy={16 - Math.abs(x) / 6} r="3" fill="#FFD166" />
      ))}
      <ellipse cy="35" rx="17" ry="4.5" fill="#8A2F08" />
    </>
  ),
  rakhi: (
    <>
      <circle r="42" fill="#D62839" />
      {turn(12).map((a) => (
        <circle key={a} r="5" cy="-32" transform={`rotate(${a})`} fill="#FFF8EC" />
      ))}
      <circle r="23" fill="#F4B400" />
      {turn(16).map((a) => (
        <circle key={a} r="1.8" cy="-18.5" transform={`rotate(${a})`} fill="#B45309" />
      ))}
      <circle r="13" fill="#1D4ED8" />
      <circle r="8" fill="#DBEAFE" />
      <circle cx="-2.5" cy="-2.5" r="2.5" fill="#fff" />
    </>
  ),
  gift: (
    <>
      <rect x="-31" y="-8" width="62" height="42" rx="5" {...fill(A)} />
      <rect x="-36" y="-21" width="72" height="15" rx="4" {...fill(P)} />
      <rect x="-6.5" y="-21" width="13" height="55" {...fill(S)} />
      <path d="M0-21C-22-46-38-24 0-21Z" {...fill(S)} />
      <path d="M0-21C22-46 38-24 0-21Z" {...fill(S)} />
      <circle cy="-22" r="5" fill="#fff" opacity=".85" />
      <rect x="-31" y="-6" width="62" height="5" fill="#000" opacity=".12" />
    </>
  ),
  hearts: (
    <>
      <path d={HEART} fill="#E11D48" transform="translate(-4 4)" />
      <ellipse cx="-20" cy="-14" rx="7" ry="4.5" fill="#fff" opacity=".45" transform="rotate(-35 -20 -14)" />
      <path d={HEART} fill="#FB7185" transform="translate(26 -24) scale(.36) rotate(14)" />
      <path d={HEART} fill="#FDA4AF" transform="translate(-30 -32) scale(.2) rotate(-18)" />
    </>
  ),
  balloons: (
    <>
      <path d="M-20 8Q-14 26 0 42M18 4Q12 24 0 42M0-4Q3 20 0 42" fill="none" stroke="#6B7280" strokeWidth="1.3" />
      <ellipse cx="-20" cy="-12" rx="15" ry="19" fill="#F43F5E" />
      <ellipse cx="18" cy="-16" rx="15" ry="19" fill="#3B82F6" />
      <ellipse cx="0" cy="-24" rx="15" ry="19" fill="#FBBF24" />
      <path d="M-3-5L0-9L3-5ZM-23 7L-20 3L-17 7ZM15 3L18-1L21 3Z" fill="#92400E" opacity=".6" />
      <ellipse cx="-5" cy="-31" rx="3.5" ry="6" fill="#fff" opacity=".5" transform="rotate(-20 -5 -31)" />
    </>
  ),
  colors: (
    <>
      <circle cx="-14" cy="-8" r="23" fill="#EC4899" opacity=".92" />
      <circle cx="15" cy="-13" r="20" fill="#FACC15" opacity=".92" />
      <circle cx="6" cy="15" r="23" fill="#22D3EE" opacity=".9" />
      <circle cx="-22" cy="18" r="12" fill="#84CC16" opacity=".92" />
      <circle cx="34" cy="14" r="5" fill="#EC4899" />
      <circle cx="-36" cy="-24" r="4" fill="#22D3EE" />
      <circle cx="30" cy="-34" r="3.5" fill="#84CC16" />
      <circle cx="-2" cy="-38" r="3" fill="#F97316" />
    </>
  ),
  tree: (
    <>
      <rect x="-6" y="28" width="12" height="12" rx="2" fill="#7C4A21" />
      <path d="M0-8L35 30L-35 30Z" fill="#166534" />
      <path d="M0-25L27 8L-27 8Z" fill="#15803D" />
      <path d="M0-38L19-13L-19-13Z" fill="#16A34A" />
      <path d={STAR5} fill="#FACC15" transform="translate(0 -38) scale(.9)" />
      {[
        [-10, -4, '#EF4444'], [9, 2, '#FACC15'], [-17, 22, '#FACC15'], [3, 20, '#EF4444'], [20, 24, '#60A5FA'], [-3, -18, '#60A5FA'],
      ].map(([x, y, c]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="3.2" fill={c as string} />
      ))}
    </>
  ),
  moon: (
    <>
      <path d="M8-38A38 38 0 1 0 32 22A29 29 0 1 1 8-38Z" fill="#FCD34D" />
      <path d={STAR5} fill="#FFF8E1" transform="translate(20 -10) scale(1.1)" />
      <path d={STAR4} fill="#FCD34D" transform="translate(36 -32) scale(.5)" />
      <path d={STAR4} fill="#FCD34D" transform="translate(-34 -34) scale(.4)" />
    </>
  ),
  kite: (
    <>
      <path d="M0 30Q10 36 4 42Q-2 46 8 48" fill="none" stroke="#6B7280" strokeWidth="1.5" />
      <path d="M0-44L0-8L-28-8Z" fill="#F97316" />
      <path d="M0-44L0-8L28-8Z" fill="#FACC15" />
      <path d="M0 30L0-8L-28-8Z" fill="#22C55E" />
      <path d="M0 30L0-8L28-8Z" fill="#EC4899" />
      <path d="M0-44V30M-28-8H28" stroke="#fff" strokeWidth="1.6" opacity=".8" />
      <path d="M2 40L10 37L8 45Z" fill="#3B82F6" />
    </>
  ),
  sun: (
    <>
      {turn(12).map((a, i) => (
        <path key={a} d={i % 2 ? 'M-5-24L0-38L5-24Z' : 'M-6-24L0-46L6-24Z'} transform={`rotate(${a})`} fill={i % 2 ? '#FACC15' : '#F97316'} />
      ))}
      <circle r="22" fill="#F59E0B" />
      <circle r="16" fill="#FCD34D" />
    </>
  ),
  fireworks: (
    <>
      {[
        [0, -6, 1, '#F43F5E', '#FACC15'],
        [-26, 20, 0.5, '#22D3EE', '#A78BFA'],
        [28, 18, 0.55, '#84CC16', '#FB923C'],
      ].map(([x, y, s, c1, c2]) => (
        <g key={`${x}`} transform={`translate(${x} ${y}) scale(${s})`}>
          {turn(12).map((a, i) => (
            <path key={a} d="M0-12V-36" transform={`rotate(${a})`} stroke={(i % 2 ? c1 : c2) as string} strokeWidth="3.4" strokeLinecap="round" />
          ))}
          {turn(12).map((a) => (
            <circle key={a} cy="-42" r="2.2" transform={`rotate(${a + 15})`} fill={c2 as string} />
          ))}
          <circle r="4" fill="#fff" />
        </g>
      ))}
    </>
  ),
  flowers: (
    <>
      <path d="M-40 20Q0 40 40 20Q0 30-40 20Z" fill="#15803D" />
      {[-64, 64, -34, 34].map((a, i) => (
        <path key={a} d="M0-32C13-14 11 8 0 18C-11 8-13-14 0-32Z" transform={`rotate(${a} 0 18)`} fill={i < 2 ? '#BE185D' : '#DB2777'} />
      ))}
      <path d="M0-36C14-16 12 8 0 18C-12 8-14-16 0-36Z" fill="#F472B6" />
      <path d="M0-22C5-12 4 4 0 12C-4 4-5-12 0-22Z" fill="#FBCFE8" opacity=".7" />
    </>
  ),
  rings: (
    <>
      <circle cx="-13" cy="10" r="21" fill="none" stroke="#D4A017" strokeWidth="6.5" />
      <circle cx="13" cy="10" r="21" fill="none" stroke="#F4C542" strokeWidth="6.5" />
      <path d="M-22-18L-13-28L-4-18L-13-6Z" fill="#BAE6FD" stroke="#fff" strokeWidth="1.5" />
      <path d="M-22-18H-4M-13-28V-6" stroke="#fff" strokeWidth="1" opacity=".8" />
      <path d={STAR4} fill="#FACC15" transform="translate(30 -30) scale(.6)" />
    </>
  ),
  tricolor: (
    <>
      <clipPath id="occ-tri-clip">
        <circle r="40" />
      </clipPath>
      <g clipPath="url(#occ-tri-clip)">
        <rect x="-40" y="-40" width="80" height="27" fill="#FF9933" />
        <rect x="-40" y="-13" width="80" height="26" fill="#fff" />
        <rect x="-40" y="13" width="80" height="27" fill="#138808" />
      </g>
      <circle r="10" fill="none" stroke="#0B3D91" strokeWidth="1.6" />
      {turn(12).map((a) => (
        <path key={a} d="M0-10V10" transform={`rotate(${a / 2})`} stroke="#0B3D91" strokeWidth="1" />
      ))}
      <circle r="40" fill="none" stroke="#fff" strokeWidth="2" />
    </>
  ),
};

/** Small illustration in a -50..50 box: a dedicated glyph, or the occasion scene scaled down. */
function glyph(motif: ResolvedMotif): ReactNode {
  return (
    GLYPHS[motif] ?? (
      <svg x="-50" y="-50" width="100" height="100" viewBox="24 24 352 352">
        {SCENES[motif as SceneName]}
      </svg>
    )
  );
}

const HAS_SCENE = (motif: ResolvedMotif): motif is SceneName => motif in SCENES;

/** Main hero illustration: a full scene where the occasion has one, the ornate medallion otherwise (Diwali, Rakhi, …). */
export function HeroArt({ motif, className }: { motif: ResolvedMotif; className?: string }) {
  return HAS_SCENE(motif) ? <Scene name={motif} className={className} /> : <Medallion motif={motif} className={className} />;
}

/** Only thread-like occasions get the ribbon trailing from the artwork. */
export const hasRibbon = (motif: ResolvedMotif) => motif === 'diya' || motif === 'rakhi' || motif === 'tricolor';

/** The occasion's illustration on its own (gift-card face, small accents). */
export function MotifGlyph({ motif, size = 64, className }: { motif: ResolvedMotif; size?: number; className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} className={className} aria-hidden focusable="false">
      {glyph(motif)}
    </svg>
  );
}

type Fringe = 'points' | 'scallop' | 'rays';
type Orbit = 'pearl' | 'heart' | 'star' | 'dot';

const STYLE: Record<ResolvedMotif, [Fringe, Orbit]> = {
  diya: ['points', 'pearl'],
  rakhi: ['points', 'pearl'],
  gift: ['scallop', 'dot'],
  hearts: ['scallop', 'heart'],
  balloons: ['rays', 'dot'],
  colors: ['rays', 'dot'],
  tree: ['points', 'star'],
  moon: ['scallop', 'star'],
  kite: ['rays', 'dot'],
  sun: ['rays', 'pearl'],
  fireworks: ['rays', 'star'],
  flowers: ['scallop', 'pearl'],
  rings: ['scallop', 'pearl'],
  tricolor: ['points', 'dot'],
  rose: ['scallop', 'heart'],
  teddy: ['scallop', 'heart'],
  chocolate: ['scallop', 'heart'],
  cake: ['rays', 'dot'],
  books: ['points', 'star'],
};

/**
 * Ornate medallion (rangoli / rakhi-style) with the occasion illustration at
 * its centre — the hero's main piece of art.
 */
export function Medallion({ motif, className }: { motif: ResolvedMotif; className?: string }) {
  const [fringe, orbit] = STYLE[motif];
  const fringeColors = [S, A, CREAM, `color-mix(in srgb, ${S} 55%, ${A})`];
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id="occ-med-disc" cx="50%" cy="38%" r="70%">
          <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${A} 82%, #fff)` }} />
          <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${A} 72%, #000)` }} />
        </radialGradient>
        <radialGradient id="occ-med-gold" cx="50%" cy="35%" r="75%">
          <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${S} 70%, #fff)` }} />
          <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${S} 88%, #000)` }} />
        </radialGradient>
        <radialGradient id="occ-med-pearl" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#E6D6BC" />
        </radialGradient>
      </defs>
      <g transform="translate(200 200)">
        {fringe === 'points' &&
          turn(24).map((a, i) => <path key={a} d="M-21-166L0-198L21-166Z" transform={`rotate(${a})`} {...fill(fringeColors[i % 4]!)} />)}
        {fringe === 'scallop' &&
          turn(20).map((a, i) => <circle key={a} cy="-170" r="26" transform={`rotate(${a})`} {...fill(i % 2 ? S : CREAM)} />)}
        {fringe === 'rays' &&
          turn(36).map((a, i) => (
            <rect key={a} x="-6" y={i % 2 ? -190 : -199} width="12" height="40" rx="6" transform={`rotate(${a})`} {...fill(fringeColors[i % 4]!)} />
          ))}

        <circle r="172" {...fill(`color-mix(in srgb, ${P} 62%, #000)`)} />
        {turn(44).map((a) => (
          <circle key={a} cy="-164" r="4.6" transform={`rotate(${a})`} fill={CREAM} />
        ))}
        <circle r="155" fill="url(#occ-med-disc)" />
        <circle r="155" fill="none" strokeWidth="3" style={{ stroke: S }} />

        {turn(12).map((a) => (
          <g key={a} transform={`rotate(${a}) translate(0 -118)`}>
            {orbit === 'pearl' && (
              <>
                <circle r="21" fill="url(#occ-med-pearl)" />
                <circle r="5.5" {...fill(`color-mix(in srgb, ${A} 80%, #000)`)} />
              </>
            )}
            {orbit === 'dot' && (
              <>
                <circle r="15" fill={CREAM} />
                <circle r="7" {...fill(S)} />
              </>
            )}
            {orbit === 'heart' && <path d={HEART} fill={CREAM} transform="scale(.42)" />}
            {orbit === 'star' && <path d={STAR4} fill={CREAM} transform="scale(1.9)" />}
          </g>
        ))}
        {turn(12).map((a) => (
          <circle key={a} cy="-142" r="5" transform={`rotate(${a + 15})`} {...fill(S)} />
        ))}

        <circle r="88" fill="url(#occ-med-gold)" />
        {turn(30).map((a) => (
          <circle key={a} cy="-78" r="4" transform={`rotate(${a})`} {...fill(`color-mix(in srgb, ${A} 85%, #000)`)} />
        ))}
        {turn(24).map((a) => (
          <circle key={a} cy="-67" r="2.6" transform={`rotate(${a + 7.5})`} fill={CREAM} />
        ))}
        <circle r="58" fill={CREAM} />
        <circle r="58" fill="none" strokeWidth="2.5" {...{ style: { stroke: `color-mix(in srgb, ${S} 80%, #000)` } }} />
        <g transform="scale(1.14)">{glyph(motif)}</g>
      </g>
    </svg>
  );
}

const BIT_SHAPE: Record<ResolvedMotif, 'star' | 'heart' | 'confetti' | 'snow'> = {
  diya: 'star', rakhi: 'star', gift: 'star', hearts: 'heart', balloons: 'confetti', colors: 'confetti', tree: 'snow',
  moon: 'star', kite: 'confetti', sun: 'star', fireworks: 'confetti', flowers: 'heart', rings: 'star', tricolor: 'star',
  rose: 'heart', teddy: 'heart', chocolate: 'heart', cake: 'confetti', books: 'star',
};

/** Small floating decorations scattered around the hero. */
export function Bits({ motif, count = 7 }: { motif: ResolvedMotif; count?: number }) {
  const shape = BIT_SHAPE[motif];
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="-12 -12 24 24" className={`art-bit bit-${i} bit-${shape}`} aria-hidden focusable="false">
          {shape === 'star' && <path d={STAR4} />}
          {shape === 'heart' && <path d={HEART} transform="scale(.26)" />}
          {shape === 'confetti' && (i % 2 ? <circle r="6" /> : <rect x="-8" y="-3.5" width="16" height="7" rx="2" transform={`rotate(${i * 37})`} />)}
          {shape === 'snow' && <path d="M0-10V10M-8.7-5L8.7 5M-8.7 5L8.7-5" fill="none" strokeWidth="2.4" strokeLinecap="round" />}
        </svg>
      ))}
    </>
  );
}

/** Flowing ribbon / thread that trails from the medallion across the hero. */
export function Ribbon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 150" className={className} preserveAspectRatio="none" aria-hidden focusable="false">
      <path
        d="M0 128C70 60 110 20 150 22C196 24 196 78 160 76C128 74 138 30 200 50C330 92 430 14 560 34C650 48 720 20 770 -30"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        style={{ stroke: S }}
      />
      <path
        d="M0 138C76 74 112 34 150 34C184 36 184 66 162 66C140 66 148 44 200 62C334 106 432 28 560 46C652 60 728 34 790 -24"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        style={{ stroke: A }}
      />
    </svg>
  );
}
