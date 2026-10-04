// Ilustração simples da casa do anúncio (SVG, sem imagens externas). Muda com o tipo de imóvel e com o nível.
import type { HouseKind } from '@/lib/game/listings';
import type { TierId } from '@/lib/game/types';

const WALL = 'rgba(255,255,255,.94)';
const ROOF = 'rgba(18,22,28,.55)';
const WIN = 'rgba(18,22,28,.28)';
const POOL = '#7DD3FC';
const LEAF = '#2F9E5B';

function Tree({ x, big = false }: { x: number; big?: boolean }) {
  const r = big ? 11 : 8;
  return (
    <g>
      <rect x={x - 1.5} y={70 - r} width="3" height={r} fill="rgba(18,22,28,.45)" />
      <circle cx={x} cy={70 - r - r * 0.6} r={r} fill={LEAF} />
    </g>
  );
}

function Windows({ x, y, cols, rows, w = 7, h = 7, gx = 4, gy = 5 }: { x: number; y: number; cols: number; rows: number; w?: number; h?: number; gx?: number; gy?: number }) {
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx="1" fill={WIN} />);
  return <>{out}</>;
}

function Building({ kind }: { kind: HouseKind }) {
  switch (kind) {
    case 'terrea':
      return (
        <g>
          <path d="M34 44 L60 26 L86 44 Z" fill={ROOF} />
          <rect x="38" y="44" width="44" height="26" fill={WALL} />
          <rect x="55" y="54" width="10" height="16" fill={WIN} />
          <Windows x={42} y={50} cols={1} rows={1} w={9} h={8} />
          <Windows x={69} y={50} cols={1} rows={1} w={9} h={8} />
        </g>
      );
    case 'sobrado':
      return (
        <g>
          <path d="M36 30 L60 14 L84 30 Z" fill={ROOF} />
          <rect x="40" y="30" width="40" height="40" fill={WALL} />
          <Windows x={45} y={35} cols={2} rows={1} w={10} h={9} gx={10} />
          <rect x="44" y="56" width="10" height="14" fill={WIN} />
          <rect x="62" y="54" width="14" height="9" rx="1" fill={WIN} />
        </g>
      );
    case 'apto':
      return (
        <g>
          <rect x="44" y="12" width="32" height="58" fill={WALL} />
          <rect x="44" y="10" width="32" height="4" fill={ROOF} />
          <Windows x={48} y={18} cols={3} rows={4} w={6} h={6} gx={3} gy={6} />
          <rect x="56" y="62" width="8" height="8" fill={WIN} />
        </g>
      );
    case 'cobertura':
      return (
        <g>
          <rect x="40" y="22" width="40" height="48" fill={WALL} />
          <rect x="48" y="10" width="24" height="12" fill={WALL} />
          <rect x="46" y="8" width="28" height="3" fill={ROOF} />
          <rect x="40" y="20" width="40" height="3" fill={ROOF} />
          <rect x="74" y="16" width="5" height="4" fill={POOL} />
          <circle cx="44" cy="17" r="3.5" fill={LEAF} />
          <Windows x={52} y={13} cols={2} rows={1} w={6} h={5} gx={4} />
          <Windows x={44} y={28} cols={4} rows={3} w={6} h={6} gx={3.3} gy={6} />
        </g>
      );
    case 'piscina':
      return (
        <g>
          <rect x="26" y="34" width="68" height="4" fill={ROOF} />
          <rect x="30" y="38" width="60" height="32" fill={WALL} />
          <rect x="58" y="24" width="32" height="14" fill={WALL} />
          <rect x="56" y="21" width="36" height="3" fill={ROOF} />
          <rect x="34" y="44" width="20" height="14" rx="1" fill={WIN} />
          <Windows x={62} y={27} cols={3} rows={1} w={6} h={6} gx={3.5} />
          <rect x="62" y="48" width="9" height="22" fill={WIN} />
          <rect x="76" y="46" width="10" height="10" rx="1" fill={WIN} />
        </g>
      );
  }
}

/** Quadro com a casa: Básica sem enfeites, Intermediária com árvore, Alto padrão com jardim e piscina. */
export function HouseArt({ kind, tier, color, size = 120 }: { kind: HouseKind; tier: TierId; color: string; size?: number }) {
  return (
    <svg className="house-art" width={size} height={(size * 80) / 120} viewBox="0 0 120 80" role="img" aria-label={`Ilustração: casa ${tier}`} style={{ background: color }}>
      <circle cx="102" cy="14" r="7" fill="rgba(255,255,255,.35)" />
      <rect x="0" y="70" width="120" height="10" fill="rgba(18,22,28,.22)" />
      {tier === 'alto' && <rect x="8" y="66" width="104" height="4" rx="2" fill={LEAF} opacity=".8" />}
      <Building kind={kind} />
      {tier !== 'basica' && <Tree x={tier === 'alto' ? 14 : 18} big={tier === 'alto'} />}
      {tier === 'alto' && (
        <>
          <Tree x={106} />
          <rect x="88" y="72" width="26" height="6" rx="2" fill={POOL} />
        </>
      )}
      {tier === 'basica' && <rect x="88" y="62" width="20" height="8" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.2" strokeDasharray="2 2" />}
    </svg>
  );
}
