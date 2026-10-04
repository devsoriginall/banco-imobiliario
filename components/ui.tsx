import { initial } from '@/lib/game/format';
import { hoodTags } from '@/lib/game/rules';
import type { GameState, GroupId } from '@/lib/game/types';
import type { CSSProperties } from 'react';

export function Avatar({ name, color, style }: { name: string; color: string; style?: CSSProperties }) {
  return (
    <span className="avatar" style={{ background: color, ...style }} aria-hidden="true">
      {initial(name)}
    </span>
  );
}

export function LocalBanner() {
  return <div className="local-banner">modo local de teste · as abas deste navegador são os celulares</div>;
}

/** Selos do bairro: a valorização permanente e cada efeito temporário do Jornal (ex.: "Assaltos −15% até a rodada 9"). */
export function HoodPills({ state, group, testId }: { state: GameState; group: GroupId; testId?: string }) {
  const tags = hoodTags(state, group);
  if (!tags.length) return null;
  return (
    <span className="hood-pills" data-testid={testId}>
      {tags.map((t) => (
        <span key={t.text} className={`pill ${t.up ? 'ok' : 'warn'}`}>
          {t.text}
        </span>
      ))}
    </span>
  );
}
