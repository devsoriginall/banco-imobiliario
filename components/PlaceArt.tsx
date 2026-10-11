// Ilustração do endereço (o terreno, não a casa construída): uma vinheta plana, estilo cartaz de viagem,
// diferente para cada rua e empresa do tabuleiro. Tudo desenhado em SVG, sem imagens externas.
// A cor de destaque é a do grupo da rua; o tema de cada casa vem de lib/game/placeMotifs.ts.
import { useId } from 'react';
import type { ReactNode } from 'react';
import { SPACES } from '@/lib/game/data';
import { placeAccent, placeMotif, type MotifId } from '@/lib/game/placeMotifs';

const BLUE = '#3D5AFE';
const HOT = '#E8175D';
const VIOLET = '#7B2FF7';
const SUN = '#FFC93C';
const INK = '#17142E';
const WHITE = '#FFFFFF';
const SEA = '#2E9BEA';
const SAND = '#F7DDA0';
const LEAF = '#2F9E5B';
const LEAF_DARK = '#1F7A45';
const ROAD = '#3A3852';
const CONCRETE = '#CFCBE0';
const GLASS = '#BFE3FF';
const CREAM = '#F6F0DF';

const SKIES = {
  day: ['#8FC2FF', '#E6F1FF'],
  warm: ['#FFB36B', '#FFEBC2'],
  sunset: ['#7B2FF7', '#FF9A6B'],
  dusk: ['#232070', '#8A4DF7'],
  night: ['#141133', '#3D2A8A'],
  pastel: ['#FFC9DC', '#FFF3F7'],
} as const;
type SkyId = keyof typeof SKIES;

// ---- peças reutilizáveis ----

/** Grade de janelas num único path (poucos elementos, mesmo com muitas janelas). */
function grid(x: number, y: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number): string {
  let d = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) d += `M${x + c * (w + gx)} ${y + r * (h + gy)}h${w}v${h}h${-w}z`;
  return d;
}
const Sun = ({ cx, cy, r, fill = SUN }: { cx: number; cy: number; r: number; fill?: string }) => (
  <>
    <circle cx={cx} cy={cy} r={r * 1.5} fill={fill} opacity=".25" />
    <circle cx={cx} cy={cy} r={r} fill={fill} />
  </>
);
const Cloud = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 0h28a6 6 0 0 0-6-7 8 8 0 0 0-14-3 6 6 0 0 0-8 10z" fill={WHITE} opacity=".9" />
);
const Tree = ({ x, y, r, fill = LEAF }: { x: number; y: number; r: number; fill?: string }) => (
  <>
    <rect x={x - 1} y={y - r} width="2" height={r} fill="#5A4636" />
    <circle cx={x} cy={y - r * 1.4} r={r} fill={fill} />
  </>
);
const Palm = ({ x, y, h }: { x: number; y: number; h: number }) => (
  <>
    <path d={`M${x} ${y}q3 ${-h / 2} -2 ${-h}`} stroke="#7A5638" strokeWidth="2.2" fill="none" />
    <path d={`M${x - 2} ${y - h}q-10 -2 -14 6q8 -6 14 -6q2 -8 12 -8q-8 2 -12 8q10 -2 14 6q-6 -6 -14 -6`} fill={LEAF} />
  </>
);
const Waves = ({ y, stroke = WHITE, opacity = 0.6 }: { y: number; stroke?: string; opacity?: number }) => {
  let d = `M0 ${y}`;
  for (let x = 0; x < 160; x += 16) d += 'q4 -3 8 0t8 0';
  return <path d={d} stroke={stroke} strokeWidth="1.2" fill="none" opacity={opacity} />;
};

// ---- cenas (viewBox 160×100; o essencial fica abaixo de y≈28 porque o banner corta o topo do céu) ----

type Scene = { sky: SkyId; draw: (a: string) => ReactNode };

const SCENES: Record<MotifId, Scene> = {
  tunel: {
    sky: 'day',
    draw: (a) => (
      <>
        <Sun cx={132} cy={34} r={8} />
        <Cloud x={18} y={38} />
        <rect x="30" y="36" width="16" height="28" fill="#C9D4FF" />
        <rect x="48" y="28" width="14" height="36" fill="#AFC0FF" />
        <rect x="100" y="34" width="18" height="30" fill="#C9D4FF" />
        <path d={grid(33, 40, 3, 4, 3, 3, 2, 3) + grid(51, 32, 2, 5, 3, 3, 3, 3) + grid(103, 38, 3, 4, 3, 3, 3, 3)} fill={WHITE} opacity=".8" />
        <path d="M0 64Q80 50 160 64V100H0Z" fill={a} />
        <Tree x={20} y={64} r={6} fill={LEAF_DARK} />
        <Tree x={132} y={62} r={7} fill={LEAF_DARK} />
        <Tree x={148} y={66} r={5} fill={LEAF_DARK} />
        <path d="M42 100V82A38 26 0 0 1 118 82V100Z" fill={CONCRETE} />
        <path d="M50 100V84A30 20 0 0 1 110 84V100Z" fill={INK} />
        <path d="M60 100L74 86H86L100 100Z" fill={ROAD} />
        <path d="M80 88v3M80 94v4" stroke={SUN} strokeWidth="1.6" />
        <circle cx="75" cy="88" r="1.6" fill="#FFF3B0" />
        <circle cx="85" cy="88" r="1.6" fill="#FFF3B0" />
      </>
    ),
  },
  'via-expressa': {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={112} y={34} />
        <Cloud x={14} y={42} s={0.8} />
        <path d="M0 62V50h10v-6h12v10h8v-14h14v16h10v-8h12v12h10v-18h12v20h10v-10h14v8h10v-12h12v18h16V62Z" fill="#B9C6F0" />
        <rect y="62" width="160" height="38" fill="#9ED9A8" />
        <path d="M18 100L72 62H88L142 100Z" fill={ROAD} />
        <path d="M80 64V100" stroke={SUN} strokeWidth="1.4" strokeDasharray="4 3" />
        <path d="M58 100L76 62M102 100L84 62" stroke={WHITE} strokeWidth="1" strokeDasharray="3 3" opacity=".8" />
        <rect x="62" y="80" width="10" height="7" rx="1" fill={HOT} />
        <rect x="87" y="70" width="7" height="5" rx="1" fill={SUN} />
        <rect x="28" y="57" width="4" height="22" fill={CONCRETE} />
        <rect x="128" y="57" width="4" height="22" fill={CONCRETE} />
        <rect x="8" y="52" width="144" height="5" rx="1" fill={a} />
        <path d="M8 48.5H152" stroke={a} strokeWidth="1.4" />
        <path d="M8 57L0 72M152 57L160 72" stroke={a} strokeWidth="3" />
      </>
    ),
  },
  banco: {
    sky: 'sunset',
    draw: (a) => (
      <>
        <circle cx="80" cy="62" r="40" fill={a} opacity=".3" />
        <circle cx="80" cy="62" r="30" fill={a} />
        <Cloud x={14} y={40} />
        <Cloud x={120} y={34} s={0.8} />
        <rect y="84" width="160" height="16" fill="#2D2470" />
        <rect x="44" y="48" width="72" height="28" fill="#D8D0F5" />
        <path d={grid(47, 48, 5, 1, 7, 28, 7.5, 0)} fill={WHITE} />
        <rect x="76" y="62" width="8" height="14" fill={INK} />
        <rect x="40" y="42" width="80" height="6" fill={WHITE} />
        <path d="M38 42L80 24L122 42Z" fill={WHITE} />
        <circle cx="80" cy="35" r="4.5" fill={a} stroke={INK} strokeWidth=".8" />
        <rect x="79" y="32.5" width="2" height="5" fill={INK} />
        <rect x="40" y="76" width="80" height="4" fill={WHITE} />
        <rect x="36" y="80" width="88" height="4" fill="#E9E6F7" />
        <path d="M24 60l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z M138 54l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill={WHITE} />
      </>
    ),
  },
  jangada: {
    sky: 'warm',
    draw: (a) => (
      <>
        <Sun cx={122} cy={44} r={11} />
        <path d="M24 38q3-3 6 0q3-3 6 0M44 32q2-2 4 0q2-2 4 0" stroke={INK} strokeWidth="1" fill="none" />
        <rect y="58" width="160" height="28" fill={SEA} />
        <Waves y={64} />
        <Waves y={72} opacity={0.4} />
        <path d="M26 62L32 50V62Z" fill={WHITE} />
        <path d="M22 62H36" stroke="#8A5A2B" strokeWidth="1.4" />
        <path d="M72 76V34" stroke="#5A3A1A" strokeWidth="1.6" />
        <path d="M73 36Q98 52 92 74H73Z" fill={WHITE} />
        <path d="M73 60Q92 63 92 68L91.5 74H73Z" fill={a} />
        <path d="M50 76H98L92 81H56Z" fill="#8A5A2B" />
        <rect y="84" width="160" height="3" fill={a} />
        <rect y="87" width="160" height="13" fill={SAND} />
        <Palm x={140} y={88} h={26} />
        <Palm x={12} y={90} h={18} />
      </>
    ),
  },
  'teatro-municipal': {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={120} y={30} />
        <rect y="84" width="160" height="16" fill="#DAD5E8" />
        <path d="M56 50A24 20 0 0 1 104 50Z" fill="#3FB8A0" />
        <rect x="79" y="24" width="2" height="8" fill={SUN} />
        <circle cx="80" cy="23" r="2" fill={SUN} />
        <rect x="26" y="44" width="16" height="40" fill={CREAM} />
        <rect x="118" y="44" width="16" height="40" fill={CREAM} />
        <path d="M26 44A8 8 0 0 1 42 44ZM118 44A8 8 0 0 1 134 44Z" fill="#3FB8A0" />
        <path d="M33.5 36h1v-3h-1zM125.5 36h1v-3h-1z" stroke={SUN} strokeWidth="1.2" />
        <rect x="42" y="50" width="76" height="34" fill={CREAM} />
        <rect x="26" y="56" width="108" height="3" fill={a} />
        <path d={grid(29, 48, 2, 1, 4, 5, 2, 0) + grid(121, 48, 2, 1, 4, 5, 2, 0) + grid(48, 62, 7, 1, 3, 5, 6, 0)} fill="#B79E62" />
        <path d="M46 84V74a5 5 0 0 1 10 0V84ZM61 84V74a5 5 0 0 1 10 0V84ZM76 84V74a5 5 0 0 1 10 0V84ZM91 84V74a5 5 0 0 1 10 0V84ZM106 84V74a5 5 0 0 1 10 0V84Z" fill={a} />
        <rect x="40" y="83" width="80" height="2" fill={WHITE} />
        <path d="M12 84V62M152 84V62" stroke={INK} strokeWidth="1.4" />
        <circle cx="12" cy="61" r="2.4" fill={SUN} />
        <circle cx="152" cy="61" r="2.4" fill={SUN} />
      </>
    ),
  },
  'rio-viaduto': {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={20} y={34} />
        <path d="M0 70V44h14v-8h12v14h16v-20h14v24h16v-12h14v18h12v-26h14v20h14v-8h20V70Z" fill={a} opacity=".28" />
        <rect y="68" width="160" height="32" fill={CONCRETE} />
        <rect y="80" width="160" height="4" fill="#9F9BB5" />
        <rect y="84" width="160" height="16" fill="#4A8FCF" />
        <Waves y={91} opacity={0.45} />
        <path d="M24 64h6v20h-6zM77 64h6v20h-6zM130 64h6v20h-6z" fill="#B3AECB" />
        <rect y="56" width="160" height="6" fill="#ECEAF6" />
        <rect y="62" width="160" height="2" fill={a} />
        <rect x="30" y="51" width="11" height="5" rx="2" fill={a} />
        <rect x="96" y="51" width="11" height="5" rx="2" fill={BLUE} />
        <rect x="66" y="52" width="8" height="4" rx="1.5" fill={SUN} />
        <Tree x={8} y={78} r={4} />
        <Tree x={150} y={78} r={4} />
      </>
    ),
  },
  aviao: {
    sky: 'sunset',
    draw: (a) => (
      <>
        <Sun cx={118} cy={66} r={13} fill="#FFD58A" />
        <path d="M0 82q10-8 20 0q10-9 22 0q10-7 20 0q12-9 24 0q10-8 22 0q12-9 24 0q10-7 28 0V100H0Z" fill={WHITE} opacity=".9" />
        <path d="M0 90q14-6 28 0q12-6 26 0q14-6 28 0q12-6 26 0q14-6 28 0q12-6 24 0V100H0Z" fill="#FFE4EE" />
        <path d="M6 76Q46 66 76 52" stroke={WHITE} strokeWidth="2" strokeDasharray="5 4" fill="none" opacity=".75" />
        <g transform="rotate(-16 100 44)">
          <path d="M96 41L106 41L98 30L94 30Z" fill="#CFD6FF" />
          <path d="M70 44Q72 39 80 39H118Q128 39 133 44Q128 48 118 48H80Q72 48 70 44Z" fill={WHITE} />
          <rect x="80" y="44" width="42" height="2" fill={a} />
          <path d="M71 44L66 31H74L82 40Z" fill={a} />
          <path d="M125 41.5h4.5l1.6 2h-6z" fill={INK} />
          <path d={grid(86, 41, 7, 1, 2, 1.8, 3, 0)} fill={a} opacity=".7" />
          <path d="M92 46H108L97 61H90Z" fill="#E6E9FF" />
        </g>
      </>
    ),
  },
  'anel-serra': {
    sky: 'warm',
    draw: (a) => (
      <>
        <Sun cx={30} cy={36} r={8} />
        <path d="M0 62L22 42L40 54L62 34L86 56L104 40L128 58L146 44L160 52V72H0Z" fill="#7A6FC4" />
        <path d="M0 68L30 52L56 64L90 48L120 64L160 54V74H0Z" fill="#9C92E0" />
        <rect y="72" width="160" height="28" fill="#EEE8FB" />
        <ellipse cx="80" cy="85" rx="60" ry="11" fill="none" stroke={a} strokeWidth="4.5" />
        <ellipse cx="80" cy="85" rx="60" ry="11" fill="none" stroke={WHITE} strokeWidth="1" strokeDasharray="3 3" />
        <rect x="60" y="66" width="10" height="20" fill={WHITE} />
        <rect x="72" y="58" width="12" height="28" fill="#D6D0F5" />
        <rect x="86" y="64" width="10" height="22" fill={WHITE} />
        <rect x="98" y="70" width="8" height="16" fill="#D6D0F5" />
        <path d={grid(62, 69, 2, 4, 2, 2, 2, 2.5) + grid(74, 61, 3, 6, 2, 2, 2, 2) + grid(88, 67, 2, 4, 2, 2, 2, 2.5)} fill={a} opacity=".55" />
        <Tree x={10} y={96} r={4} />
        <Tree x={150} y={96} r={4} />
        <Tree x={20} y={92} r={3} fill={LEAF_DARK} />
      </>
    ),
  },
  clinica: {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={118} y={36} />
        <path d="M0 84V54h18v-12h16v42h92V46h14v-8h20V84Z" fill="#CFE3FF" />
        <rect y="84" width="160" height="16" fill="#E2E0EE" />
        <rect x="50" y="42" width="60" height="42" fill={WHITE} />
        <rect x="50" y="42" width="60" height="5" fill={a} />
        <path d={grid(56, 51, 5, 3, 6, 5, 4, 4)} fill={GLASS} />
        <rect x="73" y="72" width="14" height="12" fill={a} />
        <rect x="75" y="74" width="10" height="10" fill={GLASS} />
        <circle cx="80" cy="32" r="9" fill={WHITE} stroke={a} strokeWidth="1.6" />
        <path d="M77.5 26h5v3.5h3.5v5h-3.5V38h-5v-3.5H74v-5h3.5Z" fill={HOT} />
        <Tree x={34} y={84} r={8} />
        <Tree x={126} y={84} r={8} />
        <Tree x={144} y={86} r={5} fill={LEAF_DARK} />
      </>
    ),
  },
  onibus: {
    sky: 'day',
    draw: (a) => (
      <>
        <Sun cx={136} cy={34} r={7} />
        <rect x="6" y="40" width="26" height="40" fill="#D4DCFF" />
        <rect x="36" y="32" width="22" height="48" fill="#BCC8FF" />
        <rect x="120" y="44" width="34" height="36" fill="#D4DCFF" />
        <path d={grid(10, 44, 3, 5, 4, 3, 4, 4) + grid(40, 36, 3, 6, 3, 3, 4, 4)} fill={WHITE} opacity=".8" />
        <rect y="80" width="160" height="20" fill={ROAD} />
        <rect y="80" width="160" height="9" fill="#B23A48" />
        <path d="M0 94H160" stroke={WHITE} strokeWidth="1" strokeDasharray="8 6" />
        <rect x="110" y="56" width="36" height="3" fill={INK} />
        <rect x="112" y="59" width="26" height="16" fill={GLASS} opacity=".75" />
        <rect x="142" y="59" width="2" height="22" fill={INK} />
        <circle cx="143" cy="54" r="3" fill={SUN} />
        <rect x="16" y="56" width="84" height="25" rx="4" fill={a} />
        <path d={grid(28, 60, 6, 1, 8, 8, 3, 0)} fill="#E5F4FF" />
        <rect x="18" y="60" width="8" height="15" fill="#E5F4FF" />
        <rect x="92" y="60" width="7" height="10" rx="1" fill="#E5F4FF" />
        <rect x="16" y="73" width="84" height="2" fill={WHITE} />
        <circle cx="32" cy="82" r="5" fill={INK} />
        <circle cx="84" cy="82" r="5" fill={INK} />
        <circle cx="32" cy="82" r="2" fill={CONCRETE} />
        <circle cx="84" cy="82" r="2" fill={CONCRETE} />
      </>
    ),
  },
  posto: {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={14} y={30} />
        <rect y="80" width="160" height="20" fill="#DCD8EA" />
        <path d="M0 92H160" stroke={WHITE} strokeWidth="1.2" strokeDasharray="8 5" />
        <rect x="20" y="36" width="100" height="8" fill={WHITE} />
        <rect x="20" y="44" width="100" height="4" fill={a} />
        <rect x="34" y="48" width="4" height="32" fill={WHITE} />
        <rect x="102" y="48" width="4" height="32" fill={WHITE} />
        <rect x="52" y="58" width="12" height="22" rx="2" fill={a} />
        <rect x="54" y="61" width="8" height="6" fill={WHITE} />
        <rect x="76" y="58" width="12" height="22" rx="2" fill={BLUE} />
        <rect x="78" y="61" width="8" height="6" fill={WHITE} />
        <path d="M64 66q6 2 5 10M88 66q6 2 5 10" stroke={INK} strokeWidth="1.3" fill="none" />
        <rect x="140" y="38" width="3" height="42" fill={INK} />
        <rect x="128" y="22" width="27" height="22" rx="2" fill={INK} />
        <path d="M132 27h19v3h-19zM132 33h15v3h-15zM132 39h17v2h-17z" fill={SUN} />
        <circle cx="141.5" cy="22" r="2" fill={a} />
      </>
    ),
  },
  letreiro: {
    sky: 'night',
    draw: (a) => (
      <>
        <path d="M128 26a8 8 0 1 0 6 12 6.5 6.5 0 1 1-6-12z" fill={SUN} />
        <path d="M18 30h1v1h-1zM46 22h1v1h-1zM100 30h1v1h-1zM70 26h1v1h-1zM150 50h1v1h-1z" stroke={WHITE} strokeWidth="1" />
        <rect x="16" y="40" width="128" height="44" fill="#3A2A7A" />
        <path d={grid(22, 70, 2, 1, 8, 14, 4, 0) + grid(116, 70, 2, 1, 8, 14, 4, 0)} fill={SUN} opacity=".5" />
        <rect x="44" y="70" width="72" height="14" fill="#5B3FB0" />
        <path d="M60 84V76a6 6 0 0 1 12 0V84ZM88 84V76a6 6 0 0 1 12 0V84Z" fill={SUN} opacity=".8" />
        <rect x="34" y="44" width="92" height="22" rx="3" fill={a} />
        <rect x="40" y="49" width="80" height="12" rx="2" fill={INK} />
        <path d={grid(38, 45.2, 12, 1, 1.6, 1.6, 5.8, 0) + grid(38, 63.2, 12, 1, 1.6, 1.6, 5.8, 0)} fill={SUN} />
        <circle cx="70" cy="55" r="4.5" fill={WHITE} />
        <circle cx="90" cy="55" r="4.5" fill={HOT} />
        <path d="M68 54h.1M72 54h.1M67.5 56.5q2.5 2 5 0M88 54h.1M92 54h.1M87.5 58q2.5-2 5 0" stroke={INK} strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <path d="M134 50h10l-5 6zM139 56v6M136 62h6" stroke={HOT} strokeWidth="1.3" fill="none" />
        <rect y="84" width="160" height="16" fill="#2B2350" />
        <rect y="84" width="160" height="2" fill={a} opacity=".6" />
      </>
    ),
  },
  estadio: {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={70} y={30} />
        <path d="M0 64Q40 54 80 60T160 58V100H0Z" fill="#8FD19E" />
        <Tree x={8} y={64} r={5} fill={LEAF_DARK} />
        <Tree x={152} y={62} r={5} fill={LEAF_DARK} />
        <rect x="16" y="32" width="2" height="38" fill={INK} />
        <rect x="142" y="32" width="2" height="38" fill={INK} />
        <rect x="11" y="27" width="12" height="6" rx="1" fill={WHITE} stroke={INK} strokeWidth=".8" />
        <rect x="137" y="27" width="12" height="6" rx="1" fill={WHITE} stroke={INK} strokeWidth=".8" />
        <ellipse cx="80" cy="76" rx="64" ry="20" fill={a} />
        <ellipse cx="80" cy="74" rx="56" ry="15" fill="#C9B3FF" />
        <ellipse cx="80" cy="74" rx="51" ry="13" fill="none" stroke={SUN} strokeWidth="2.2" strokeDasharray="1 2" />
        <ellipse cx="80" cy="75" rx="40" ry="9" fill="#3FAE5E" />
        <ellipse cx="80" cy="75" rx="36" ry="7.5" fill="none" stroke={WHITE} strokeWidth=".8" />
        <path d="M80 67.5V82.5" stroke={WHITE} strokeWidth=".8" />
        <ellipse cx="80" cy="75" rx="5" ry="2.5" fill="none" stroke={WHITE} strokeWidth=".8" />
      </>
    ),
  },
  'predios-classicos': {
    sky: 'warm',
    draw: (a) => (
      <>
        <Cloud x={124} y={30} s={0.8} />
        <rect x="16" y="36" width="38" height="50" fill="#EADFFF" />
        <rect x="58" y="28" width="44" height="58" fill={WHITE} />
        <rect x="106" y="40" width="40" height="46" fill="#EADFFF" />
        <path d="M70 28V22H90V28ZM14 36h42v3H14ZM104 40h44v3h-44Z" fill={a} />
        <path d="M58 28A22 6 0 0 1 102 28Z" fill={a} opacity=".6" />
        <path d={grid(21, 43, 4, 4, 5, 5, 4, 4) + grid(63, 34, 5, 5, 5, 5, 3.6, 4) + grid(111, 47, 4, 4, 5, 4, 4, 4)} fill={a} opacity=".35" />
        <path d="M60 45H100M60 54H100M60 63H100" stroke={a} strokeWidth="1.2" />
        <rect y="86" width="160" height="14" fill="#DAD3EC" />
        <circle cx="10" cy="82" r="9" fill={LEAF} />
        <circle cx="34" cy="84" r="10" fill={LEAF_DARK} />
        <circle cx="58" cy="82" r="9" fill={LEAF} />
        <circle cx="104" cy="84" r="10" fill={LEAF_DARK} />
        <circle cx="128" cy="82" r="9" fill={LEAF} />
        <circle cx="152" cy="84" r="10" fill={LEAF_DARK} />
      </>
    ),
  },
  martinelli: {
    sky: 'dusk',
    draw: (a) => (
      <>
        <Sun cx={30} cy={40} r={6} fill="#FFD58A" />
        <rect x="114" y="52" width="40" height="32" fill="#3D2A8A" />
        <rect x="6" y="58" width="34" height="26" fill="#3D2A8A" />
        <path d="M50 84V42H60V32H68V24H92V32H100V42H110V84Z" fill="#F2B8C6" />
        <rect x="76" y="17" width="8" height="7" fill={a} />
        <path d="M80 17V11" stroke={a} strokeWidth="1.2" />
        <path d={grid(54, 46, 6, 6, 4, 3, 4, 3.6) + grid(71, 28, 3, 2, 4, 3, 2.6, 4)} fill={SUN} opacity=".85" />
        <path d={grid(118, 56, 4, 3, 4, 3, 5, 5)} fill={SUN} opacity=".5" />
        <path d="M122 40V27l12-3V37M126 26.5l8-2" stroke={WHITE} strokeWidth="1.4" fill="none" />
        <circle cx="120" cy="40" r="2.6" fill={WHITE} />
        <circle cx="132" cy="37" r="2.6" fill={WHITE} />
        <path d="M140 34V24l5 3" stroke={SUN} strokeWidth="1.4" fill="none" />
        <circle cx="138" cy="34" r="2.2" fill={SUN} />
        <rect y="84" width="160" height="16" fill="#2B2350" />
        <rect x="30" y="56" width="2" height="28" fill={INK} />
        <circle cx="31" cy="54" r="6" fill={SUN} opacity=".3" />
        <circle cx="31" cy="54" r="3" fill={SUN} />
      </>
    ),
  },
  cruzamento: {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={20} y={30} />
        <rect x="112" y="22" width="14" height="62" fill="#C9D4FF" />
        <path d={grid(114, 25, 3, 10, 2, 2, 2, 3.8)} fill={WHITE} />
        <rect x="6" y="48" width="30" height="36" fill="#E2DBFA" />
        <rect x="130" y="50" width="26" height="34" fill="#E2DBFA" />
        <rect y="78" width="160" height="22" fill={ROAD} />
        <path d="M66 78L60 100H100L94 78Z" fill="#4A4866" />
        <path d={grid(8, 82, 6, 1, 3, 12, 3, 0) + grid(118, 82, 6, 1, 3, 12, 3, 0)} fill={WHITE} opacity=".85" />
        <rect y="76" width="160" height="2" fill="#E2E0EE" />
        <rect x="74" y="30" width="2.4" height="50" fill={INK} />
        <rect x="46" y="31" width="42" height="10" rx="1.5" fill={a} stroke={WHITE} strokeWidth="1" />
        <rect x="64" y="45" width="42" height="10" rx="1.5" fill={BLUE} stroke={WHITE} strokeWidth="1" />
        <path d="M51 36h24M69 50h28" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  cosmeticos: {
    sky: 'pastel',
    draw: (a) => (
      <>
        <circle cx="130" cy="38" r="14" fill={WHITE} opacity=".6" />
        <rect y="80" width="160" height="20" fill="#FFC2D6" />
        <rect y="80" width="160" height="2" fill={WHITE} />
        <rect x="38" y="52" width="16" height="28" rx="2" fill={INK} />
        <rect x="40" y="44" width="12" height="8" fill={SUN} />
        <path d="M41 44V34L51 27V44Z" fill={HOT} />
        <rect x="72" y="30" width="16" height="10" rx="3" fill={VIOLET} />
        <rect x="76" y="40" width="8" height="6" fill={SUN} />
        <rect x="64" y="46" width="32" height="34" rx="7" fill={WHITE} opacity=".75" stroke={a} strokeWidth="1.4" />
        <rect x="67" y="58" width="26" height="19" rx="5" fill={a} opacity=".55" />
        <path d="M70 50v6" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
        <circle cx="124" cy="70" r="13" fill={SUN} />
        <circle cx="124" cy="70" r="9" fill="#FFE8F0" />
        <path d="M30 34l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5zM108 46l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM140 54l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill={a} />
      </>
    ),
  },
  'torres-vidro': {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={120} y={28} s={0.8} />
        <rect x="18" y="26" width="30" height="60" fill="#9FB4FF" />
        <rect x="54" y="14" width="28" height="72" fill={a} />
        <rect x="88" y="32" width="26" height="54" fill="#7C93FF" />
        <rect x="120" y="42" width="26" height="44" fill="#B9C8FF" />
        <path d="M18 50L48 32V44L18 62ZM54 44L82 24V36L54 56ZM88 58L114 40V50L88 68ZM120 66L146 50V58L120 74Z" fill={WHITE} opacity=".28" />
        <path d="M18 38H48M18 50H48M18 62H48M18 74H48M54 26H82M54 38H82M54 50H82M54 62H82M54 74H82M88 44H114M88 56H114M88 68H114M120 54H146M120 66H146" stroke={WHITE} strokeWidth=".6" opacity=".45" />
        <rect y="86" width="160" height="14" fill="#E2E0EE" />
        <rect y="91" width="160" height="6" fill="#E5383B" />
        <circle cx="70" cy="91" r="4" fill="none" stroke={INK} strokeWidth="1.2" />
        <circle cx="84" cy="91" r="4" fill="none" stroke={INK} strokeWidth="1.2" />
        <path d="M70 91L75 84H82L84 91M75 84L77 91H84M74 82h3" stroke={INK} strokeWidth="1.2" fill="none" />
        <Tree x={150} y={88} r={6} />
        <Tree x={8} y={88} r={5} fill={LEAF_DARK} />
      </>
    ),
  },
  masp: {
    sky: 'dusk',
    draw: (a) => (
      <>
        <rect x="6" y="30" width="20" height="44" fill="#4D5BD8" />
        <rect x="30" y="20" width="18" height="54" fill={a} />
        <rect x="104" y="26" width="22" height="48" fill={a} />
        <rect x="130" y="36" width="24" height="38" fill="#4D5BD8" />
        <path d="M115 26V10" stroke={WHITE} strokeWidth="1.4" />
        <circle cx="115" cy="9" r="1.8" fill={HOT} />
        <path d="M39 20V12" stroke={WHITE} strokeWidth="1.2" />
        <path d={grid(9, 34, 3, 5, 3, 3, 3.5, 4) + grid(33, 24, 3, 6, 3, 3, 3, 4) + grid(107, 30, 4, 5, 3, 3, 2.4, 4) + grid(133, 40, 4, 4, 3, 3, 2.6, 4)} fill={SUN} opacity=".75" />
        <rect y="74" width="160" height="26" fill="#D8DAEE" />
        <rect x="38" y="47" width="84" height="19" fill="#1E2240" />
        <path d={grid(42, 52, 8, 1, 7, 9, 3, 0)} fill={GLASS} opacity=".55" />
        <rect x="30" y="42" width="100" height="5" fill="#E5383B" />
        <rect x="30" y="66" width="100" height="4" fill="#E5383B" />
        <rect x="30" y="42" width="8" height="42" fill="#E5383B" />
        <rect x="122" y="42" width="8" height="42" fill="#E5383B" />
        <path d="M60 84v-6M66 84v-5M96 84v-6" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
        <rect y="84" width="160" height="16" fill={ROAD} />
        <path d="M0 92H160" stroke={SUN} strokeWidth="1" strokeDasharray="8 6" />
      </>
    ),
  },
  frevo: {
    sky: 'warm',
    draw: (a) => (
      <>
        <rect y="70" width="160" height="30" fill="#3E8ED0" />
        <Waves y={88} />
        <Waves y={95} opacity={0.35} />
        <rect y="62" width="160" height="6" fill={a} />
        <path d="M6 68a14 10 0 0 1 28 0ZM46 68a14 10 0 0 1 28 0ZM86 68a14 10 0 0 1 28 0ZM126 68a14 10 0 0 1 28 0Z" fill={a} opacity=".55" />
        <path d="M0 60H160" stroke={WHITE} strokeWidth="1" />
        <path d="M80 44L54 44A26 26 0 0 1 61.6 25.6Z" fill={SUN} />
        <path d="M80 44L61.6 25.6A26 26 0 0 1 80 18Z" fill={HOT} />
        <path d="M80 44L80 18A26 26 0 0 1 98.4 25.6Z" fill={a} />
        <path d="M80 44L98.4 25.6A26 26 0 0 1 106 44Z" fill="#1E9E5A" />
        <path d="M54 44q6.5 3 13 0t13 0t13 0t13 0" stroke={WHITE} strokeWidth="1.2" fill="none" />
        <path d="M80 44V58q0 3-3 3" stroke={INK} strokeWidth="1.6" fill="none" />
        <circle cx="80" cy="17" r="1.6" fill={INK} />
        <Palm x={142} y={62} h={22} />
      </>
    ),
  },
  'torre-telecom': {
    sky: 'dusk',
    draw: (a) => (
      <>
        <path d="M18 30h1v1h-1zM140 36h1v1h-1zM40 44h1v1h-1zM130 22h1v1h-1z" stroke={WHITE} strokeWidth="1" />
        <path d="M0 80Q50 64 80 72T160 70V100H0Z" fill="#3D2A8A" />
        <path d="M70 84L80 24L90 84" stroke={WHITE} strokeWidth="2" fill="none" />
        <path d="M72 72H88M74 60H86M76 48H84M77 38H83M72 72L86 60M88 72L74 60M74 60L84 48M86 60L76 48" stroke={WHITE} strokeWidth=".9" />
        <rect x="78" y="22" width="4" height="7" fill={a} />
        <circle cx="80" cy="19" r="2" fill={HOT} />
        <ellipse cx="88" cy="46" rx="2.5" ry="4" fill={WHITE} />
        <path d="M90 14A10 10 0 0 1 90 28M70 14A10 10 0 0 0 70 28" stroke={a} strokeWidth="2" fill="none" />
        <path d="M96 9A17 17 0 0 1 96 33M64 9A17 17 0 0 0 64 33" stroke={a} strokeWidth="2" fill="none" opacity=".7" />
        <path d="M102 4A24 24 0 0 1 102 38M58 4A24 24 0 0 0 58 38" stroke={SUN} strokeWidth="2" fill="none" opacity=".6" />
        <rect x="18" y="74" width="16" height="12" fill="#2B2350" />
        <rect x="124" y="72" width="18" height="14" fill="#2B2350" />
        <path d={grid(21, 77, 2, 1, 4, 3, 3, 0) + grid(127, 75, 2, 1, 5, 4, 3, 0)} fill={SUN} />
        <rect y="86" width="160" height="14" fill="#2B2350" />
      </>
    ),
  },
  'ponte-estaiada': {
    sky: 'sunset',
    draw: (a) => {
      let cables = '';
      for (let k = 0; k < 6; k++) cables += `M80 ${28 + k * 4}L${16 + k * 9} ${69 - k * 0.8}M80 ${28 + k * 4}L${144 - k * 9} ${69 - k * 0.8}`;
      return (
        <>
          <Sun cx={124} cy={58} r={12} fill="#FFD58A" />
          <rect x="6" y="38" width="16" height="38" fill={a} opacity=".55" />
          <rect x="26" y="46" width="14" height="30" fill={a} opacity=".4" />
          <rect x="132" y="42" width="20" height="34" fill={a} opacity=".55" />
          <path d={grid(9, 42, 2, 6, 3, 2, 4, 3) + grid(135, 46, 3, 5, 3, 2, 3, 3)} fill={SUN} opacity=".8" />
          <rect y="76" width="160" height="24" fill="#3E5FC8" />
          <Waves y={86} opacity={0.4} />
          <path d="M70 84L86 18M90 84L74 18" stroke={WHITE} strokeWidth="4" strokeLinecap="round" />
          <path d={cables} stroke={WHITE} strokeWidth=".7" opacity=".9" />
          <path d="M0 70Q80 62 160 70V74Q80 66 0 74Z" fill={WHITE} />
          <path d="M0 74Q80 66 160 74" stroke={a} strokeWidth="1.4" fill="none" />
          <path d="M60 92h40" stroke={WHITE} strokeWidth="1.4" opacity=".35" />
        </>
      );
    },
  },
  vitrine: {
    sky: 'day',
    draw: (a) => {
      let stripes = '';
      for (let k = 0; k < 8; k += 2) stripes += `M${16 + k * 16} 38h16v10h-16z`;
      let scallop = 'M16 48';
      for (let k = 0; k < 8; k++) scallop += 'a8 5 0 0 0 16 0';
      return (
        <>
          <rect x="16" y="24" width="128" height="62" fill="#FFF4E5" />
          <rect x="50" y="27" width="60" height="7" rx="1" fill={INK} />
          <rect x="16" y="38" width="128" height="10" fill={WHITE} />
          <path d={stripes} fill={a} />
          <path d={scallop + 'Z'} fill={a} />
          <rect x="26" y="56" width="70" height="28" fill={GLASS} />
          <circle cx="48" cy="61" r="3" fill="#F2C9A0" />
          <path d="M44 65h8l4 16H40Z" fill={HOT} />
          <path d="M70 70h14v12H70ZM73 70q4-6 8 0" fill={VIOLET} stroke={VIOLET} strokeWidth="1" />
          <rect x="106" y="54" width="26" height="32" fill={INK} />
          <rect x="109" y="57" width="20" height="26" fill={GLASS} opacity=".35" />
          <rect y="86" width="160" height="14" fill="#E9E3D6" />
          <path d="M34 80h12v12H34ZM37 80q3-6 6 0" fill={a} stroke={a} strokeWidth="1" />
          <path d="M50 84h10v8H50ZM52 84q3-5 6 0" fill={SUN} stroke={SUN} strokeWidth="1" />
          <rect x="138" y="80" width="10" height="10" fill="#B4673A" />
          <circle cx="143" cy="76" r="6" fill={LEAF} />
        </>
      );
    },
  },
  'parque-oca': {
    sky: 'day',
    draw: (a) => (
      <>
        <Sun cx={22} cy={34} r={7} />
        <circle cx="10" cy="64" r="10" fill={LEAF_DARK} />
        <circle cx="52" cy="62" r="11" fill={LEAF} />
        <circle cx="74" cy="64" r="9" fill={LEAF_DARK} />
        <circle cx="150" cy="62" r="10" fill={LEAF} />
        <rect y="64" width="160" height="36" fill="#8FD19E" />
        <path d="M30 76L33.5 30L37 76Z" fill="#EDE9F7" />
        <path d="M32.5 34L33.5 26L34.5 34Z" fill={a} />
        <path d="M94 78A26 20 0 0 1 146 78Z" fill={WHITE} />
        <path d="M104 72a2 1.6 0 0 1 4 0zM116 66a2 1.6 0 0 1 4 0zM128 70a2 1.6 0 0 1 4 0z" fill={INK} opacity=".5" />
        <ellipse cx="56" cy="88" rx="52" ry="9" fill="#6EC1F2" />
        <path d="M30 88h16M62 91h20" stroke={WHITE} strokeWidth="1" opacity=".7" />
        <path d="M104 22l8 6-8 8-8-8z" fill={a} />
        <path d="M104 22v14M96 28h16" stroke={WHITE} strokeWidth=".8" />
        <path d="M104 36q-4 6 2 10t0 12" stroke={a} strokeWidth="1" fill="none" />
        <path d="M104 58L116 78" stroke={INK} strokeWidth=".5" opacity=".5" />
      </>
    ),
  },
  praia: {
    sky: 'warm',
    draw: (a) => (
      <>
        <Sun cx={40} cy={36} r={9} />
        <path d="M92 60Q102 30 114 34Q120 24 128 36Q144 44 160 58V60Z" fill="#3D8F6A" />
        <path d="M112 60Q118 40 128 40Q142 46 160 60Z" fill="#2E7253" />
        <rect y="58" width="160" height="20" fill={SEA} />
        <Waves y={64} />
        <Waves y={71} opacity={0.4} />
        <rect y="76" width="160" height="14" fill={SAND} />
        <path d="M30 54q3-3 6 0q3-3 6 0" stroke={INK} strokeWidth="1" fill="none" />
        <path d="M60 86L66 64" stroke="#5A3A1A" strokeWidth="1.5" />
        <path d="M48 66A20 10 0 0 1 86 62Z" fill={a} />
        <path d="M60 64.5A20 10 0 0 1 66 57L72 63Z" fill={WHITE} />
        <rect x="74" y="82" width="16" height="4" rx="2" fill={HOT} />
        <rect y="90" width="160" height="10" fill={WHITE} />
        <path d="M0 95q5-4 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0" stroke={INK} strokeWidth="2.2" fill="none" />
      </>
    ),
  },
  carro: {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={20} y={30} s={0.8} />
        <circle cx="128" cy="30" r="5" fill={WHITE} opacity=".8" />
        <circle cx="134" cy="24" r="4" fill={WHITE} opacity=".6" />
        <rect x="122" y="34" width="6" height="22" fill="#A49CC9" />
        <path d="M20 56L36 44V56L52 44V56L68 44V56L84 44V56L100 44V56L116 44V56L140 56V82H20Z" fill="#C9C2EE" />
        <path d={grid(28, 62, 7, 1, 10, 6, 6, 0)} fill={GLASS} />
        <rect y="82" width="160" height="18" fill={ROAD} />
        <path d="M0 94H160" stroke={WHITE} strokeWidth="1.2" strokeDasharray="10 6" />
        <path d="M38 86V78Q40 74 48 73L60 64Q64 62 70 62H96Q102 62 106 66L114 73Q124 74 124 80V86Z" fill={a} />
        <path d="M63 72L70 66H83V72ZM87 72V66H98Q101 66 103 68L107 72Z" fill="#E5F4FF" />
        <circle cx="55" cy="86" r="7" fill={INK} />
        <circle cx="108" cy="86" r="7" fill={INK} />
        <circle cx="55" cy="86" r="3" fill={CONCRETE} />
        <circle cx="108" cy="86" r="3" fill={CONCRETE} />
        <circle cx="120.5" cy="78" r="2" fill={SUN} />
        <rect x="38" y="77" width="3" height="3" fill={HOT} />
      </>
    ),
  },
  candelaria: {
    sky: 'day',
    draw: (a) => (
      <>
        <Cloud x={16} y={34} />
        <Cloud x={128} y={40} s={0.7} />
        <path d="M60 44A20 16 0 0 1 100 44Z" fill={a} />
        <path d="M80 28V20M77 23H83" stroke={INK} strokeWidth="1.2" />
        <rect x="56" y="44" width="48" height="36" fill={CREAM} />
        <rect x="46" y="32" width="14" height="48" fill={CREAM} />
        <rect x="100" y="32" width="14" height="48" fill={CREAM} />
        <path d="M46 32A7 8 0 0 1 60 32ZM100 32A7 8 0 0 1 114 32Z" fill={a} />
        <path d="M53 24v-3M107 24v-3" stroke={INK} strokeWidth="1.2" />
        <path d={grid(50, 40, 2, 3, 2, 5, 2, 6) + grid(104, 40, 2, 3, 2, 5, 2, 6) + grid(62, 50, 4, 1, 5, 7, 6, 0)} fill="#B79E62" />
        <path d="M74 80V70a6 6 0 0 1 12 0V80Z" fill={INK} />
        <rect y="80" width="160" height="20" fill={ROAD} />
        <path d="M80 82V100" stroke={SUN} strokeWidth="1.4" strokeDasharray="4 3" />
        <Palm x={22} y={84} h={24} />
        <Palm x={138} y={84} h={24} />
      </>
    ),
  },
  penhasco: {
    sky: 'day',
    draw: (a) => (
      <>
        <Sun cx={140} cy={34} r={7} />
        <rect y="62" width="160" height="38" fill={SEA} />
        <Waves y={72} />
        <Waves y={84} opacity={0.4} />
        <path d="M0 40Q30 36 60 46L74 100H0Z" fill="#7A5C4A" />
        <path d="M0 40Q30 36 60 46L58 51Q30 42 0 46Z" fill={LEAF} />
        <path d="M0 62Q34 58 66 68" stroke={ROAD} strokeWidth="5" fill="none" />
        <path d="M0 59Q34 55 66 65" stroke={WHITE} strokeWidth=".9" strokeDasharray="2 2" fill="none" />
        <path d="M84 92q4-6 8 0ZM100 96q5-7 10 0Z" fill="#5E4638" />
        <path d="M98 34L132 26L118 38Z" fill={a} />
        <path d="M117 36L116 44" stroke={INK} strokeWidth=".8" />
        <circle cx="116" cy="45" r="1.4" fill={INK} />
        <path d="M128 50L144 46L137 52Z" fill={HOT} />
        <path d="M88 44q3-3 6 0q3-3 6 0" stroke={INK} strokeWidth=".9" fill="none" />
      </>
    ),
  },
};

/** Lista de cenas desenhadas (para teste): todo tema de placeMotifs precisa existir aqui. */
export const SCENE_IDS = Object.keys(SCENES) as MotifId[];

/**
 * Ilustração do endereço. `size` é a largura em px (a altura segue a proporção 16:10);
 * com `fill`, ocupa todo o contêiner e corta o céu para caber (uso como banner).
 */
export function PlaceArt({ idx, size = 120, fill = false, className = '' }: { idx: number; size?: number; fill?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const m = placeMotif(idx);
  if (!m) return null;
  const scene = SCENES[m.motif];
  const [top, bottom] = SKIES[scene.sky];
  const a = placeAccent(idx);
  const gid = `sky${uid}`;
  return (
    <svg
      className={`place-art${className ? ` ${className}` : ''}`}
      viewBox="0 0 160 100"
      width={fill ? '100%' : size}
      height={fill ? '100%' : (size * 100) / 160}
      preserveAspectRatio={fill ? 'xMidYMax slice' : 'xMidYMid meet'}
      role="img"
      aria-label={`Ilustração de ${SPACES[idx].name}: ${m.label}`}
      data-motif={m.motif}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#${gid})`} />
      {scene.draw(a)}
    </svg>
  );
}
