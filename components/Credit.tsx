// Score de crédito: medidor (semicírculo 0–1000) e selo com a faixa.
import { CREDIT, CREDIT_BANDS } from '@/lib/game/data';
import { creditBand } from '@/lib/game/rules';

const BAND_COLOR: Record<string, string> = { ruim: 'var(--bad)', regular: 'var(--warn)', bom: 'var(--info)', excelente: 'var(--accent)' };
export const bandColor = (score: number) => BAND_COLOR[creditBand(score).id];

/** Ponto no semicírculo para um score (0 à esquerda, 1000 à direita). */
function at(score: number, r: number) {
  const a = Math.PI * (1 - score / CREDIT.max);
  return [60 + r * Math.cos(a), 60 - r * Math.sin(a)];
}

function arc(from: number, to: number, r: number) {
  const [x1, y1] = at(from, r);
  const [x2, y2] = at(to, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function CreditGauge({ score }: { score: number }) {
  const band = creditBand(score);
  const [nx, ny] = at(score, 40);
  return (
    <div className="gauge" data-testid="credit-gauge">
      <svg viewBox="0 0 120 70" width="200" height="117" role="img" aria-label={`Score de crédito ${score} de ${CREDIT.max}, faixa ${band.name}`}>
        {CREDIT_BANDS.map((b, k) => {
          const to = CREDIT_BANDS[k + 1]?.from ?? CREDIT.max;
          return <path key={b.id} d={arc(b.from + (k ? 6 : 0), to - (k < CREDIT_BANDS.length - 1 ? 6 : 0), 48)} stroke={BAND_COLOR[b.id]} strokeWidth="9" fill="none" opacity={b.id === band.id ? 1 : 0.28} />;
        })}
        <line x1="60" y1="60" x2={nx} y2={ny} stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="60" r="5" fill="var(--fg)" />
      </svg>
      <div className="gauge-read">
        <span className="amt num" data-testid="credit-score">
          {score}
        </span>
        <span className="pill" style={{ background: 'var(--surface-2)', color: BAND_COLOR[band.id] }} data-testid="credit-band">
          {band.name}
        </span>
      </div>
    </div>
  );
}

export function CreditPill({ score }: { score: number }) {
  const band = creditBand(score);
  return (
    <span className="credit-pill num" style={{ color: BAND_COLOR[band.id] }} title={`Score de crédito: ${band.name}`}>
      <i style={{ background: BAND_COLOR[band.id] }} />
      Score {score} · {band.name}
    </span>
  );
}
