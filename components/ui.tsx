import { initial } from '@/lib/game/format';
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
