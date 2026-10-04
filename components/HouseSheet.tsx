'use client';
// Anúncio da casa em tela cheia, como num site de imóveis: galeria de fotos (ou a ilustração), ficha da casa,
// bairro, tabela de aluguel do padrão e o botão de ação no rodapé.
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { GROUPS, SPACES } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { houseListing } from '@/lib/game/listings';
import { housePhotos } from '@/lib/game/photos';
import { buildPrice, tierName, tierRents } from '@/lib/game/rules';
import type { GameState, TierId } from '@/lib/game/types';
import { HouseArt } from './HouseArt';
import { HoodPills } from './ui';

const LABELS = ['Terreno', '1 casa', '2 casas', '3 casas', '4 casas', 'Hotel'];
const groupColor = (g: keyof typeof GROUPS) => `var(${GROUPS[g].c})`;

export interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  note?: string;
}

/** Miniatura da casa: a capa das fotos do padrão ou, sem fotos, a ilustração. */
export function HouseThumb({ i, tier, size = 104 }: { i: number; tier: TierId; size?: number }) {
  const s = SPACES[i];
  if (s.type !== 'street') return null;
  const cover = housePhotos(i, tier)[0];
  if (!cover) return <HouseArt kind={houseListing(i, tier).kind} tier={tier} color={groupColor(s.group)} size={size} />;
  return (
    <span className="house-thumb" style={{ width: size, height: (size * 80) / 120 }}>
      <Image src={cover} alt={`Foto da casa ${tierName(tier)}`} fill sizes={`${size}px`} style={{ objectFit: 'cover', objectPosition: '50% 55%' }} />
    </span>
  );
}

export function HouseSheet({ state, i, tier, houses = 0, action, onClose }: { state: GameState; i: number; tier: TierId; houses?: number; action?: SheetAction; onClose: () => void }) {
  const s = SPACES[i];
  const photos = housePhotos(i, tier);
  const [k, setK] = useState(0);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setK((x) => (x + 1) % Math.max(1, photos.length));
      if (e.key === 'ArrowLeft') setK((x) => (x - 1 + photos.length) % Math.max(1, photos.length));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, photos.length]);
  if (s.type !== 'street') return null;
  const l = houseListing(i, tier);
  const rents = tierRents(state, i, tier);
  const go = (d: number) => setK((x) => (x + d + photos.length) % photos.length);
  const facts: [string, string][] = [
    ['Área', `${l.area} m²`],
    ['Quartos', String(l.rooms)],
    ['Suítes', String(l.suites)],
    ['Banheiros', String(l.baths)],
    ['Vagas', String(l.vagas)],
  ];
  return (
    <div className="house-sheet" role="dialog" aria-modal="true" aria-label={`Anúncio: ${l.title}`} data-testid="house-sheet">
      <div
        className="hs-photo"
        style={{ background: groupColor(s.group) }}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null || photos.length < 2) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        {photos.length ? (
          <Image key={photos[k]} src={photos[k]} alt={`Foto ${k + 1} de ${photos.length}: ${l.title}`} fill sizes="(max-width: 600px) 100vw, 600px" preload style={{ objectFit: 'cover', objectPosition: '50% 55%' }} data-testid="hs-img" />
        ) : (
          <HouseArt kind={l.kind} tier={tier} color={groupColor(s.group)} size={300} />
        )}
        <button className="hs-close" aria-label="Fechar anúncio" onClick={onClose}>
          ✕
        </button>
        {photos.length > 1 && (
          <>
            <button className="hs-arrow left" aria-label="Foto anterior" onClick={() => go(-1)}>
              ‹
            </button>
            <button className="hs-arrow right" aria-label="Próxima foto" onClick={() => go(1)}>
              ›
            </button>
            <span className="hs-dots" aria-hidden="true">
              {photos.map((p, j) => (
                <i key={p} className={j === k ? 'on' : ''} />
              ))}
            </span>
          </>
        )}
      </div>
      <div className="hs-body">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className={`pill tier-badge t-${tier}`} data-testid="hs-tier">
            Casa {tierName(tier)}
          </span>
          <HoodPills state={state} group={s.group} />
        </div>
        <h2 className="hs-title">{l.title}</h2>
        <div className="row between">
          <span className="muted">{houses ? `${houses === 5 ? 'Hotel' : `${houses} casa${houses > 1 ? 's' : ''}`} neste padrão · cada construção` : 'Primeira casa'}</span>
          <span className="amt num" style={{ fontSize: 26 }} data-testid="hs-price">
            {money(buildPrice(state, i, tier))}
          </span>
        </div>
        <div className="hs-facts">
          {facts.map(([a, b]) => (
            <div key={a}>
              <b className="num">{b}</b>
              <span>{a}</span>
            </div>
          ))}
        </div>
        {l.extras.length > 0 && (
          <div className="hs-extras" data-testid="hs-extras">
            {l.extras.map((x) => (
              <span key={x} className="pill">
                {x}
              </span>
            ))}
          </div>
        )}
        <div className="hs-hood">
          <span className="swatch" style={{ background: groupColor(s.group) }} />
          <div>
            <b>
              {s.name}, {s.city}
            </b>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Grupo {GROUPS[s.group].name.toLowerCase()} · {s.desc}
            </p>
          </div>
        </div>
        <span className="label">Aluguel da casa {tierName(tier)}</span>
        <div className="rent num" data-testid="hs-rents">
          {rents.map((r, j) => {
            const cur = houses && j === houses ? 'cur' : '';
            return (
              <span key={j} style={{ display: 'contents' }}>
                <span className={cur}>
                  {LABELS[j]}
                  {cur ? ' · atual' : ''}
                </span>
                <span className={cur}>{money(r)}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="hs-foot">
        {action ? (
          <>
            {action.note && <span className="muted" style={{ fontSize: 13 }}>{action.note}</span>}
            <button className="btn primary" disabled={action.disabled} onClick={action.onClick}>
              {action.label}
            </button>
          </>
        ) : (
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}
