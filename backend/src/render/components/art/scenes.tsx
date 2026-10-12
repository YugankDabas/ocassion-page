import type { ReactNode } from 'react';

/**
 * Occasion scenes: one hand-built illustration per occasion (viewBox 0 0 400 400),
 * drawn on a round backdrop so it reads on any band colour. Colours passed as
 * CSS variables follow the page theme.
 */

const P = 'var(--c-primary)';
const S = 'var(--c-secondary)';
const A = 'var(--c-accent)';
const CREAM = '#FFF6DF';
const F = (c: string) => ({ style: { fill: c } });
const turn = (n: number) => Array.from({ length: n }, (_, i) => (360 / n) * i);

export const HEART = 'M0 30C-44 2-34-34-12-30C-4-28 0-22 0-18C0-22 4-28 12-30C34-34 44 2 0 30Z';
export const STAR4 = 'M0-10L2.6-2.6L10 0L2.6 2.6L0 10L-2.6 2.6L-10 0L-2.6-2.6Z';
export const STAR5 = 'M0-10L2.9-3.1L9.5-3.1L4.2 1.2L6.2 8.1L0 4L-6.2 8.1L-4.2 1.2L-9.5-3.1L-2.9-3.1Z';

/* ---------- Reusable pieces ---------- */
const Heart = ({ x, y, s = 1, c, r = 0 }: { x: number; y: number; s?: number; c: string; r?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <path d={HEART} {...F(c)} />
    <ellipse cx="-19" cy="-16" rx="7" ry="4" fill="#fff" opacity=".4" transform="rotate(-35 -19 -16)" />
  </g>
);
const Star = ({ x, y, s = 1, c = CREAM, five = false }: { x: number; y: number; s?: number; c?: string; five?: boolean }) => (
  <path d={five ? STAR5 : STAR4} transform={`translate(${x} ${y}) scale(${s})`} {...F(c)} />
);
const Balloon = ({ x, y, c, to, s = 1 }: { x: number; y: number; c: string; to: [number, number]; s?: number }) => (
  <>
    <path d={`M${x} ${y + 58 * s}Q${(x + to[0]) / 2 + 14} ${(y + to[1]) / 2 + 20} ${to[0]} ${to[1]}`} fill="none" stroke="#8B8B8B" strokeWidth="1.6" />
    <ellipse cx={x} cy={y} rx={44 * s} ry={54 * s} {...F(c)} />
    <path d={`M${x - 6 * s} ${y + 53 * s}L${x} ${y + 62 * s}L${x + 6 * s} ${y + 53 * s}Z`} {...F(c)} />
    <ellipse cx={x - 16 * s} cy={y - 22 * s} rx={8 * s} ry={15 * s} fill="#fff" opacity=".42" transform={`rotate(-24 ${x - 16 * s} ${y - 22 * s})`} />
  </>
);
const GiftBox = ({ x, y, w, h, body, ribbon }: { x: number; y: number; w: number; h: number; body: string; ribbon: string }) => {
  const cx = x + w / 2;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="7" {...F(body)} />
      <rect x={x} y={y} width={w} height="12" fill="#000" opacity=".16" />
      <rect x={x - 8} y={y - 20} width={w + 16} height="24" rx="6" {...F(body)} />
      <rect x={x - 8} y={y - 20} width={w + 16} height="24" rx="6" fill="#fff" opacity=".12" />
      <rect x={cx - w * 0.08} y={y - 20} width={w * 0.16} height={h + 20} {...F(ribbon)} />
      <path d={`M${cx} ${y - 20}C${cx - w * 0.34} ${y - 20 - w * 0.42} ${cx - w * 0.6} ${y - 24} ${cx} ${y - 20}Z`} {...F(ribbon)} />
      <path d={`M${cx} ${y - 20}C${cx + w * 0.34} ${y - 20 - w * 0.42} ${cx + w * 0.6} ${y - 24} ${cx} ${y - 20}Z`} {...F(ribbon)} />
      <circle cx={cx} cy={y - 21} r={w * 0.07} fill="#fff" opacity=".8" />
    </>
  );
};
const Flower = ({ x, y, r, c, n = 8, centre = '#FACC15' }: { x: number; y: number; r: number; c: string; n?: number; centre?: string }) => (
  <g transform={`translate(${x} ${y})`}>
    {turn(n).map((a) => (
      <ellipse key={a} cy={-r * 0.58} rx={r * 0.34} ry={r * 0.52} transform={`rotate(${a})`} {...F(c)} />
    ))}
    {turn(n).map((a) => (
      <ellipse key={a} cy={-r * 0.44} rx={r * 0.12} ry={r * 0.3} transform={`rotate(${a})`} fill="#fff" opacity=".28" />
    ))}
    <circle r={r * 0.3} {...F(centre)} />
    <circle r={r * 0.16} fill="#B45309" opacity=".55" />
  </g>
);
const Burst = ({ x, y, s, c1, c2 }: { x: number; y: number; s: number; c1: string; c2: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {turn(14).map((a, i) => (
      <path key={a} d="M0-12V-38" transform={`rotate(${a})`} strokeWidth="3.6" strokeLinecap="round" style={{ stroke: i % 2 ? c1 : c2 }} />
    ))}
    {turn(14).map((a) => (
      <circle key={a} cy="-46" r="2.6" transform={`rotate(${a + 12.8})`} {...F(c2)} />
    ))}
    <circle r="4.5" fill="#fff" />
  </g>
);
const Cloud = ({ x, y, s = 1, o = 1 }: { x: number; y: number; s?: number; o?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={o}>
    <ellipse rx="34" ry="16" />
    <circle cx="-14" cy="-10" r="16" />
    <circle cx="10" cy="-14" r="20" />
  </g>
);
const Confetti = ({ dots }: { dots: [number, number, string][] }) => (
  <>
    {dots.map(([x, y, c], i) =>
      i % 2 ? <circle key={i} cx={x} cy={y} r="5" fill={c} /> : <rect key={i} x={x - 8} y={y - 3.5} width="16" height="7" rx="2.5" fill={c} transform={`rotate(${i * 41} ${x} ${y})`} />,
    )}
  </>
);
const Kite = ({ x, y, s, r }: { x: number; y: number; s: number; r: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <path d="M0-44L0-8L-28-8Z" fill="#F97316" />
    <path d="M0-44L0-8L28-8Z" fill="#FACC15" />
    <path d="M0 30L0-8L-28-8Z" fill="#22C55E" />
    <path d="M0 30L0-8L28-8Z" fill="#EC4899" />
    <path d="M0-44V30M-28-8H28" stroke="#fff" strokeWidth="1.4" opacity=".85" />
    <path d="M0 30Q8 40 0 50Q-8 60 2 70" fill="none" stroke="#7C3AED" strokeWidth="2" />
    <path d="M-5 46L5 52L-4 56ZM5 62L-5 66L4 72Z" fill="#3B82F6" />
  </g>
);
const Wheat = ({ x, y, lean }: { x: number; y: number; lean: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${lean})`}>
    <path d="M0 0V-150" stroke="#B7791F" strokeWidth="4" strokeLinecap="round" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <g key={i} fill="#EAB308">
        <ellipse cx="-11" cy={-92 - i * 15} rx="6" ry="13" transform={`rotate(-28 -11 ${-92 - i * 15})`} />
        <ellipse cx="11" cy={-92 - i * 15} rx="6" ry="13" transform={`rotate(28 11 ${-92 - i * 15})`} />
      </g>
    ))}
    <ellipse cy="-178" rx="6" ry="14" fill="#EAB308" />
  </g>
);
const Lantern = ({ x, y, s, c }: { x: number; y: number; s: number; c: string }) => (
  <g transform={`translate(${x} 0)`}>
    <path d={`M0 20V${y}`} stroke="#D4A017" strokeWidth="2" />
    <g transform={`translate(0 ${y}) scale(${s})`}>
      <rect x="-12" y="0" width="24" height="9" rx="3" fill="#D4A017" />
      <path d="M-16 9H16L24 46L16 84H-16L-24 46Z" {...F(c)} />
      <path d="M-8 20H8L13 46L8 72H-8L-13 46Z" fill="#FDE68A" />
      <path d="M0 20V72M-13 46H13" stroke="#D4A017" strokeWidth="1.6" />
      <rect x="-12" y="84" width="24" height="8" rx="3" fill="#D4A017" />
      <path d="M0 92V108" stroke="#D4A017" strokeWidth="2" />
      <circle cy="111" r="4" fill="#D4A017" />
    </g>
  </g>
);

const CONFETTI: [number, number, string][] = [
  [70, 250, '#22D3EE'], [330, 255, '#F472B6'], [95, 80, '#A3E635'], [318, 62, '#FACC15'], [58, 170, '#F472B6'], [350, 165, '#22D3EE'], [200, 40, '#FB923C'],
];

export type SceneName =
  | 'gift' | 'hearts' | 'rose' | 'teddy' | 'chocolate' | 'cake' | 'balloons' | 'colors' | 'tree' | 'moon'
  | 'kite' | 'sun' | 'fireworks' | 'flowers' | 'rings' | 'books';

/** Backdrop disc colour per scene. */
export const SCENE_BG: Record<SceneName, string> = {
  gift: CREAM, hearts: '#FFE9EF', rose: '#FFEFF2', teddy: '#FFF1E0', chocolate: '#FFF0E0', cake: '#FFF4E3', balloons: '#FFF6DF',
  colors: '#FFFDF5', tree: '#E6F3F8', moon: `color-mix(in srgb, ${P} 55%, #0b1026)`, kite: '#DDF2FF', sun: '#FFF1C9',
  fireworks: `color-mix(in srgb, ${P} 45%, #0b1026)`, flowers: '#FFF3F7', rings: '#FFF7E8', books: '#EEF6FF',
};

export const SCENES: Record<SceneName, ReactNode> = {
  gift: (
    <>
      <g transform="rotate(14 300 130)">
        <rect x="236" y="92" width="130" height="82" rx="10" {...F(P)} />
        <rect x="248" y="106" width="26" height="19" rx="4" fill="#F4C542" />
        <rect x="248" y="150" width="66" height="7" rx="3.5" fill="#fff" opacity=".7" />
        <path d={STAR4} transform="translate(338 116) scale(1.5)" {...F(S)} />
      </g>
      <GiftBox x={92} y={214} w={176} h={126} body={A} ribbon={S} />
      <GiftBox x={236} y={262} w={96} h={78} body={P} ribbon={CREAM} />
      <GiftBox x={128} y={130} w={104} h={62} body={`color-mix(in srgb, ${S} 70%, ${A})`} ribbon={P} />
      <Star x={70} y={150} s={2.2} c={S} />
      <Star x={300} y={220} s={1.4} c={A} />
      <Star x={206} y={60} s={1.6} c={A} />
    </>
  ),
  hearts: (
    <>
      <rect x="96" y="226" width="208" height="126" rx="12" fill="#fff" />
      <path d="M96 238L200 314L304 238" fill="none" stroke="#F9A8D4" strokeWidth="4" />
      <path d="M96 352L176 290M304 352L224 290" stroke="#FBCFE8" strokeWidth="3" />
      <Heart x={200} y={178} s={2.5} c="#E11D48" />
      <path d="M78 270L330 84" stroke="#D4A017" strokeWidth="6" strokeLinecap="round" />
      <path d="M330 84L296 90L322 116Z" fill="#D4A017" />
      <path d="M78 270L72 246L98 252ZM92 260L86 236L112 242Z" fill="#F4C542" />
      <Heart x={84} y={128} s={0.8} c="#FB7185" r={-16} />
      <Heart x={318} y={170} s={0.62} c="#F43F5E" r={14} />
      <Heart x={292} y={52} s={0.4} c="#FDA4AF" r={8} />
      <Heart x={128} y={62} s={0.36} c="#FDA4AF" r={-10} />
    </>
  ),
  rose: (
    <>
      <path d="M204 210C196 262 214 300 196 372" fill="none" stroke="#15803D" strokeWidth="9" strokeLinecap="round" />
      <path d="M202 290C150 262 118 280 104 304C146 318 182 312 202 290Z" fill="#16A34A" />
      <path d="M204 262C250 228 286 240 304 262C264 282 228 282 204 262Z" fill="#22C55E" />
      <path d="M140 196L200 236L260 196L236 150H164Z" fill="#166534" />
      <circle cx="200" cy="138" r="84" fill="#9F1239" />
      <circle cx="184" cy="148" r="68" fill="#BE123C" />
      <circle cx="214" cy="132" r="58" fill="#E11D48" />
      <circle cx="194" cy="126" r="44" fill="#F43F5E" />
      <circle cx="208" cy="140" r="31" fill="#E11D48" />
      <circle cx="198" cy="132" r="18" fill="#BE123C" />
      <path d="M190 132C194 120 210 122 208 134C206 144 194 142 196 134" fill="none" stroke="#881337" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="150" cy="100" rx="12" ry="22" fill="#fff" opacity=".18" transform="rotate(-38 150 100)" />
      <Heart x={84} y={210} s={0.5} c="#FB7185" r={-14} />
      <Heart x={318} y={196} s={0.42} c="#FDA4AF" r={12} />
      <Heart x={306} y={78} s={0.34} c="#FB7185" />
    </>
  ),
  teddy: (
    <>
      <circle cx="146" cy="96" r="30" fill="#A9662F" />
      <circle cx="254" cy="96" r="30" fill="#A9662F" />
      <circle cx="146" cy="96" r="15" fill="#EBC19A" />
      <circle cx="254" cy="96" r="15" fill="#EBC19A" />
      <ellipse cx="150" cy="344" rx="36" ry="26" fill="#A9662F" />
      <ellipse cx="250" cy="344" rx="36" ry="26" fill="#A9662F" />
      <ellipse cx="150" cy="346" rx="18" ry="13" fill="#EBC19A" />
      <ellipse cx="250" cy="346" rx="18" ry="13" fill="#EBC19A" />
      <ellipse cx="200" cy="270" rx="80" ry="84" fill="#B5793C" />
      <ellipse cx="200" cy="280" rx="50" ry="56" fill="#EBC19A" />
      <circle cx="200" cy="146" r="70" fill="#B5793C" />
      <ellipse cx="200" cy="170" rx="32" ry="25" fill="#EBC19A" />
      <ellipse cx="200" cy="158" rx="11" ry="8" fill="#3B2414" />
      <path d="M200 166V178M186 180Q200 192 214 180" fill="none" stroke="#3B2414" strokeWidth="3" strokeLinecap="round" />
      <circle cx="174" cy="136" r="7" fill="#3B2414" />
      <circle cx="226" cy="136" r="7" fill="#3B2414" />
      <circle cx="176" cy="134" r="2.2" fill="#fff" />
      <circle cx="228" cy="134" r="2.2" fill="#fff" />
      <Heart x={200} y={268} s={1.45} c="#E11D48" />
      <ellipse cx="132" cy="262" rx="24" ry="44" fill="#A9662F" transform="rotate(-38 132 262)" />
      <ellipse cx="268" cy="262" rx="24" ry="44" fill="#A9662F" transform="rotate(38 268 262)" />
      <path d="M176 214L200 224L224 214L218 236L200 228L182 236Z" fill="#DC2626" />
      <Heart x={70} y={150} s={0.42} c="#FB7185" r={-12} />
      <Heart x={332} y={132} s={0.5} c="#F43F5E" r={12} />
    </>
  ),
  chocolate: (
    <>
      <g transform="rotate(-9 200 200)">
        <rect x="118" y="60" width="164" height="210" rx="12" fill="#5B3418" />
        {[0, 1, 2].map((c) =>
          [0, 1, 2].map((r) => (
            <g key={`${c}${r}`}>
              <rect x={128 + c * 50} y={70 + r * 50} width="44" height="44" rx="6" fill="#74431F" />
              <rect x={132 + c * 50} y={74 + r * 50} width="36" height="12" rx="4" fill="#fff" opacity=".12" />
            </g>
          )),
        )}
        <path d="M110 214L124 226L138 214L152 226L166 214L180 226L194 214L208 226L222 214L236 226L250 214L264 226L278 214L290 224V336H110Z" fill="#E5E7EB" />
        <rect x="110" y="238" width="180" height="98" {...F(A)} />
        <rect x="110" y="262" width="180" height="48" {...F(S)} />
        <path d={HEART} fill="#fff" transform="translate(200 286) scale(.5)" />
      </g>
      <circle cx="96" cy="318" r="28" fill="#5B3418" />
      <path d="M74 310Q86 300 96 312T118 310" fill="none" stroke="#F3E5D0" strokeWidth="4" strokeLinecap="round" />
      <circle cx="322" cy="304" r="24" fill="#74431F" />
      <path d="M304 298Q314 290 322 300T340 298" fill="none" stroke="#F9A8D4" strokeWidth="4" strokeLinecap="round" />
      <Heart x={324} y={110} s={0.6} c="#E11D48" r={14} />
      <Heart x={76} y={126} s={0.44} c="#FB7185" r={-14} />
    </>
  ),
  cake: (
    <>
      <Balloon x={72} y={128} c="#FBBF24" to={[104, 300]} s={0.72} />
      <Balloon x={334} y={116} c="#38BDF8" to={[300, 300]} s={0.72} />
      <ellipse cx="200" cy="340" rx="146" ry="16" fill="#D1D5DB" />
      <ellipse cx="200" cy="336" rx="146" ry="14" fill="#F3F4F6" />
      <rect x="92" y="246" width="216" height="90" rx="14" fill="#F472B6" />
      <rect x="92" y="246" width="216" height="24" rx="12" fill="#FFF1F7" />
      {[106, 132, 158, 184, 210, 236, 262, 288].map((x, i) => (
        <circle key={x} cx={x} cy={270} r={i % 2 ? 11 : 15} fill="#FFF1F7" />
      ))}
      {[[120, 306, '#FACC15'], [156, 316, '#38BDF8'], [196, 304, '#A3E635'], [236, 318, '#FACC15'], [276, 306, '#38BDF8']].map(([x, y, c]) => (
        <circle key={`${x}`} cx={x} cy={y} r="5" fill={c as string} />
      ))}
      <rect x="132" y="174" width="136" height="76" rx="12" fill="#A78BFA" />
      <rect x="132" y="174" width="136" height="20" rx="10" fill="#F5F3FF" />
      {[146, 170, 194, 218, 242].map((x, i) => (
        <circle key={x} cx={x + 4} cy={194} r={i % 2 ? 9 : 12} fill="#F5F3FF" />
      ))}
      {[[160, '#F43F5E'], [196, '#22C55E'], [232, '#F59E0B']].map(([x, c]) => (
        <g key={`${x}`}>
          <rect x={x as number} y="122" width="9" height="54" rx="3" fill={c as string} />
          <path d={`M${(x as number) + 4.5} 92C${(x as number) + 14} 106 ${(x as number) + 12} 116 ${(x as number) + 4.5} 120C${(x as number) - 3} 116 ${(x as number) - 5} 106 ${(x as number) + 4.5} 92Z`} fill="#FB923C" />
          <ellipse cx={(x as number) + 4.5} cy="112" rx="3" ry="6" fill="#FEF08A" />
        </g>
      ))}
      <Confetti dots={CONFETTI.slice(2)} />
    </>
  ),
  balloons: (
    <>
      <Balloon x={118} y={150} c="#F43F5E" to={[200, 350]} />
      <Balloon x={282} y={150} c="#3B82F6" to={[200, 350]} />
      <Balloon x={160} y={226} c="#A855F7" to={[200, 350]} s={0.8} />
      <Balloon x={246} y={230} c="#22C55E" to={[200, 350]} s={0.8} />
      <Balloon x={200} y={106} c="#FBBF24" to={[200, 350]} />
      <path d="M200 350C176 336 170 362 200 352C230 362 224 336 200 350Z" {...F(A)} />
      <path d="M196 352L186 380M204 352L214 380" stroke="#8B8B8B" strokeWidth="1.6" />
      <Confetti dots={CONFETTI} />
    </>
  ),
  colors: (
    <>
      {[
        [136, 138, 68, '#EC4899'], [270, 126, 58, '#FACC15'], [222, 222, 70, '#22D3EE'], [104, 236, 42, '#84CC16'], [306, 226, 38, '#F97316'],
      ].map(([x, y, r, c]) => (
        <g key={`${x}`} fill={c as string} opacity=".92">
          <circle cx={x} cy={y} r={r} />
          {turn(7).map((a, i) => (
            <circle key={a} cx={x} cy={(y as number) - (r as number) - 6 - (i % 3) * 9} r={5 + (i % 3) * 3} transform={`rotate(${a + (x as number)} ${x} ${y})`} />
          ))}
        </g>
      ))}
      <g transform="translate(60 92) rotate(24)">
        <rect x="0" y="0" width="128" height="30" rx="9" fill="#2563EB" />
        <rect x="8" y="5" width="74" height="7" rx="3.5" fill="#fff" opacity=".35" />
        <rect x="128" y="9" width="30" height="12" rx="3" fill="#1E3A8A" />
        <rect x="-44" y="8" width="48" height="14" rx="4" fill="#F59E0B" />
        <circle cx="-46" cy="15" r="13" fill="#F59E0B" />
        <circle cx="172" cy="15" r="5" fill="#22D3EE" />
        <circle cx="188" cy="19" r="3.5" fill="#22D3EE" />
      </g>
      <ellipse cx="200" cy="326" rx="134" ry="24" fill="#B7791F" />
      <ellipse cx="200" cy="320" rx="134" ry="22" fill="#EAB308" />
      <ellipse cx="200" cy="320" rx="116" ry="16" fill="#CA8A04" />
      <path d="M100 322Q134 244 168 322Z" fill="#EC4899" />
      <path d="M166 324Q200 232 234 324Z" fill="#FACC15" />
      <path d="M232 322Q266 250 300 322Z" fill="#22C55E" />
    </>
  ),
  tree: (
    <>
      <clipPath id="occ-sc-tree">
        <circle cx="200" cy="200" r="176" />
      </clipPath>
      <g clipPath="url(#occ-sc-tree)">
        <ellipse cx="200" cy="372" rx="220" ry="56" fill="#fff" />
        {[[70, 110], [330, 96], [96, 196], [320, 200], [150, 54], [262, 46], [52, 260], [350, 280]].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r="5" fill="#fff" />
        ))}
      </g>
      <rect x="186" y="300" width="28" height="40" rx="4" fill="#7C4A21" />
      <path d="M200 176L326 314H74Z" fill="#166534" />
      <path d="M200 110L298 232H102Z" fill="#15803D" />
      <path d="M200 52L270 150H130Z" fill="#16A34A" />
      <path d="M148 132Q200 160 252 132M122 206Q200 244 278 206M96 284Q200 326 304 284" fill="none" stroke="#FACC15" strokeWidth="4" strokeLinecap="round" />
      {[[172, 116, '#EF4444'], [226, 128, '#60A5FA'], [150, 196, '#FACC15'], [208, 210, '#EF4444'], [256, 196, '#60A5FA'], [128, 276, '#EF4444'], [186, 292, '#60A5FA'], [240, 286, '#FACC15'], [282, 272, '#EF4444']].map(([x, y, c]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="9" fill={c as string} />
      ))}
      <path d={STAR5} fill="#FACC15" transform="translate(200 48) scale(2.8)" />
      <GiftBox x={62} y={308} w={62} h={44} body="#DC2626" ribbon="#FACC15" />
      <GiftBox x={276} y={314} w={56} h={38} body="#2563EB" ribbon="#fff" />
    </>
  ),
  moon: (
    <>
      <Lantern x={300} y={64} s={0.9} c={A} />
      <Lantern x={96} y={40} s={0.62} c={S} />
      <g transform="translate(196 208) scale(3.5)">
        <path d="M8-38A38 38 0 1 0 32 22A29 29 0 1 1 8-38Z" fill="#FCD34D" />
        <path d="M2-34A36 36 0 0 0 20 30A38 38 0 0 1 2-34Z" fill="#fff" opacity=".2" />
      </g>
      <Star x={236} y={176} s={3} c="#FFF8E1" five />
      {[[70, 160, 1.3], [128, 300, 1], [330, 250, 1.2], [200, 50, 1.1], [342, 170, 0.8], [58, 240, 0.8]].map(([x, y, s]) => (
        <Star key={`${x}`} x={x!} y={y!} s={s} c="#FDE68A" />
      ))}
      <Cloud x={110} y={336} s={1.3} o={0.9} />
      <Cloud x={290} y={346} s={1.5} o={0.9} />
    </>
  ),
  kite: (
    <>
      <circle cx="312" cy="92" r="46" fill="#FDE68A" />
      <circle cx="312" cy="92" r="32" fill="#FBBF24" />
      <Cloud x={92} y={110} s={1.1} />
      <Cloud x={300} y={300} s={1.3} />
      <path d="M176 232Q120 300 132 384M300 262Q330 320 310 384" fill="none" stroke="#6B7280" strokeWidth="1.8" />
      <Kite x={176} y={176} s={2.9} r={-16} />
      <Kite x={300} y={232} s={1.3} r={18} />
      <g transform="translate(86 230) rotate(-30) scale(1.1)">
        <path d="M0-44L28-8L0 30L-28-8Z" fill="#3B82F6" />
        <path d="M0-44V30M-28-8H28" stroke="#fff" strokeWidth="1.4" opacity=".85" />
        <circle cy="-8" r="9" fill="#FACC15" />
      </g>
    </>
  ),
  sun: (
    <>
      <clipPath id="occ-sc-sun">
        <circle cx="200" cy="200" r="176" />
      </clipPath>
      {turn(16).map((a, i) => (
        <path key={a} d={i % 2 ? 'M-12-92L0-128L12-92Z' : 'M-14-92L0-150L14-92Z'} transform={`translate(200 196) rotate(${a})`} fill={i % 2 ? '#FACC15' : '#F97316'} />
      ))}
      <circle cx="200" cy="196" r="84" fill="#F59E0B" />
      <circle cx="200" cy="196" r="66" fill="#FCD34D" />
      <g clipPath="url(#occ-sc-sun)">
        <path d="M0 300Q200 236 400 300V400H0Z" fill="#65A30D" />
        <path d="M0 330Q200 280 400 330V400H0Z" fill="#4D7C0F" />
      </g>
      <Wheat x={84} y={356} lean={-10} />
      <Wheat x={112} y={364} lean={6} />
      <Wheat x={316} y={356} lean={10} />
      <Wheat x={288} y={364} lean={-6} />
      <path d="M146 286Q136 352 200 356Q264 352 254 286Z" fill="#B45309" />
      <path d="M146 286Q136 352 200 356Q180 340 170 286Z" fill="#fff" opacity=".12" />
      {[166, 183, 200, 217, 234].map((x) => (
        <circle key={x} cx={x} cy="320" r="4.5" fill="#FDE68A" />
      ))}
      <ellipse cx="200" cy="286" rx="58" ry="12" fill="#92400E" />
      <circle cx="170" cy="276" r="15" fill="#fff" />
      <circle cx="198" cy="268" r="19" fill="#fff" />
      <circle cx="228" cy="276" r="15" fill="#fff" />
    </>
  ),
  fireworks: (
    <>
      <clipPath id="occ-sc-fw">
        <circle cx="200" cy="200" r="176" />
      </clipPath>
      {[[60, 120], [340, 130], [150, 40], [258, 250], [96, 252], [320, 250]].map(([x, y]) => (
        <Star key={`${x}`} x={x!} y={y!} s={0.9} c="#FDE68A" />
      ))}
      <Burst x={190} y={148} s={2.3} c1="#F43F5E" c2="#FACC15" />
      <Burst x={92} y={176} s={1.15} c1="#22D3EE" c2="#A78BFA" />
      <Burst x={308} y={186} s={1.3} c1="#84CC16" c2="#FB923C" />
      <Burst x={280} y={74} s={0.8} c1="#F472B6" c2="#FDE68A" />
      <g clipPath="url(#occ-sc-fw)">
        {[[20, 300, 44], [66, 270, 38], [106, 310, 46], [154, 284, 34], [190, 256, 42], [234, 296, 40], [276, 272, 36], [314, 304, 44], [360, 286, 40]].map(([x, y, w], i) => (
          <g key={x}>
            <rect x={x} y={y} width={w} height="140" fill="#0B1026" opacity=".92" />
            {[0, 1, 2].map((r) => (
              <rect key={r} x={x! + 8 + ((i + r) % 2) * 14} y={y! + 12 + r * 22} width="7" height="9" fill="#FDE68A" opacity=".85" />
            ))}
          </g>
        ))}
      </g>
    </>
  ),
  flowers: (
    <>
      <path d="M200 330L136 180M200 330L200 140M200 330L264 180M200 330L164 236M200 330L240 232" stroke="#15803D" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="112" cy="232" rx="13" ry="32" fill="#22C55E" transform="rotate(-48 112 232)" />
      <ellipse cx="290" cy="232" rx="13" ry="32" fill="#22C55E" transform="rotate(48 290 232)" />
      <Flower x={200} y={118} r={56} c="#EC4899" />
      <Flower x={124} y={164} r={46} c="#F472B6" centre="#FDE68A" />
      <Flower x={276} y={164} r={46} c="#FB7185" centre="#FDE68A" />
      <Flower x={160} y={228} r={36} c="#C084FC" />
      <Flower x={242} y={226} r={36} c="#FBBF24" centre="#F97316" />
      <path d="M124 236L200 372L276 236Q200 282 124 236Z" {...F(CREAM)} />
      <path d="M124 236L200 372L276 236Q200 282 124 236Z" fill="none" strokeWidth="3" style={{ stroke: S }} />
      <path d="M200 322C168 300 160 336 200 326C240 336 232 300 200 322Z" {...F(A)} />
      <path d="M194 326L176 366M206 326L224 366" strokeWidth="6" strokeLinecap="round" style={{ stroke: A }} />
    </>
  ),
  rings: (
    <>
      <Flower x={84} y={110} r={32} c="#F9A8D4" centre="#FDE68A" />
      <Flower x={322} y={300} r={36} c="#F9A8D4" centre="#FDE68A" />
      <Flower x={318} y={98} r={22} c="#FBCFE8" centre="#FDE68A" />
      <ellipse cx="60" cy="158" rx="9" ry="24" fill="#86EFAC" transform="rotate(30 60 158)" />
      <ellipse cx="350" cy="252" rx="9" ry="24" fill="#86EFAC" transform="rotate(30 350 252)" />
      <circle cx="158" cy="242" r="76" fill="none" stroke="#B8860B" strokeWidth="20" />
      <circle cx="158" cy="242" r="76" fill="none" stroke="#F4C542" strokeWidth="13" />
      <circle cx="250" cy="242" r="76" fill="none" stroke="#B8860B" strokeWidth="20" />
      <circle cx="250" cy="242" r="76" fill="none" stroke="#FDE68A" strokeWidth="13" />
      <path d="M96 196A76 76 0 0 1 158 166" fill="none" stroke="#F4C542" strokeWidth="13" />
      <path d="M124 130L158 96L192 130L158 176Z" fill="#BAE6FD" stroke="#fff" strokeWidth="3" />
      <path d="M124 130H192M142 130L158 96L174 130L158 176Z" fill="none" stroke="#fff" strokeWidth="2" opacity=".9" />
      <Star x={206} y={92} s={1.6} c="#FACC15" />
      <Star x={104} y={98} s={1} c="#FACC15" />
      <Heart x={204} y={338} s={0.42} c="#F43F5E" />
    </>
  ),
  books: (
    <>
      {[
        [84, 298, 232, '#2563EB'], [104, 252, 200, '#DC2626'], [92, 206, 216, '#16A34A'],
      ].map(([x, y, w, c]) => (
        <g key={`${y}`}>
          <rect x={x} y={y} width={w} height="42" rx="7" fill={c as string} />
          <rect x={(x as number) + 14} y={(y as number) + 7} width={(w as number) - 20} height="28" rx="3" fill="#FFF8E7" />
          <path d={`M${(x as number) + 24} ${(y as number) + 16}H${(x as number) + (w as number) - 16}M${(x as number) + 24} ${(y as number) + 26}H${(x as number) + (w as number) - 16}`} stroke="#E7D8B5" strokeWidth="2" />
          <rect x={x} y={y} width="16" height="42" rx="7" fill="#000" opacity=".18" />
        </g>
      ))}
      <path d="M200 132C176 112 138 126 140 164C142 192 170 210 200 204C230 210 258 192 260 164C262 126 224 112 200 132Z" fill="#DC2626" />
      <ellipse cx="166" cy="152" rx="9" ry="17" fill="#fff" opacity=".3" transform="rotate(-24 166 152)" />
      <path d="M200 134Q200 112 212 98" fill="none" stroke="#7C4A21" strokeWidth="5" strokeLinecap="round" />
      <path d="M208 112C226 92 250 96 258 108C240 124 220 122 208 112Z" fill="#22C55E" />
      <g transform="rotate(-58 316 200)">
        <rect x="304" y="96" width="24" height="150" fill="#FACC15" />
        <rect x="304" y="84" width="24" height="18" rx="4" fill="#F9A8D4" />
        <rect x="304" y="100" width="24" height="8" fill="#9CA3AF" />
        <path d="M304 246H328L316 274Z" fill="#FDE2B8" />
        <path d="M311 262H321L316 274Z" fill="#1F2937" />
      </g>
      <Star x={72} y={150} s={1.8} c="#FACC15" five />
      <Star x={300} y={72} s={1.3} c="#FACC15" five />
    </>
  ),
};

/** Full scene on its round, ringed backdrop. */
export function Scene({ name, className }: { name: SceneName; className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden focusable="false">
      <circle cx="200" cy="200" r="194" {...F(`color-mix(in srgb, ${P} 60%, #000)`)} />
      {turn(48).map((a) => (
        <circle key={a} cx="200" cy="15" r="4.2" transform={`rotate(${a} 200 200)`} fill={CREAM} />
      ))}
      <circle cx="200" cy="200" r="178" {...F(SCENE_BG[name])} />
      <circle cx="200" cy="200" r="178" fill="none" strokeWidth="5" style={{ stroke: S }} />
      <circle cx="200" cy="200" r="168" fill="none" strokeWidth="1.5" strokeDasharray="3 7" style={{ stroke: A }} opacity=".6" />
      {SCENES[name]}
    </svg>
  );
}
