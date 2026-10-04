// Anúncios fictícios das 3 casas de cada imóvel. Determinísticos: a mesma casa e o mesmo nível geram
// sempre o mesmo anúncio em todos os celulares. O padrão das casas acompanha o preço do bairro.
import { SPACES } from './data';
import type { TierId } from './types';

export type HouseKind = 'terrea' | 'sobrado' | 'apto' | 'cobertura' | 'piscina';
export type PriceLevel = 'popular' | 'medio' | 'nobre';

export interface HouseListing {
  kind: HouseKind;
  title: string;
  area: number;
  rooms: number;
  suites: number;
  vagas: number;
  /** detalhe extra, ex.: "vista para o mar" */
  perk?: string;
}

interface Tpl {
  kind: HouseKind;
  title: string;
  rooms: number;
  suites: number;
  vagas: number;
  area: [number, number];
}

const t = (kind: HouseKind, title: string, rooms: number, suites: number, vagas: number, area: [number, number]): Tpl => ({ kind, title, rooms, suites, vagas, area });

const POOL: Record<PriceLevel, Record<TierId, Tpl[]>> = {
  popular: {
    basica: [
      t('terrea', 'Casa térrea, 2 quartos, 1 vaga', 2, 0, 1, [48, 62]),
      t('apto', 'Apartamento 2 quartos, sem elevador', 2, 0, 0, [44, 55]),
      t('terrea', 'Casa de vila, 2 quartos e área de serviço', 2, 0, 0, [50, 60]),
    ],
    intermediaria: [
      t('sobrado', 'Sobrado 3 quartos, quintal', 3, 1, 1, [85, 105]),
      t('terrea', 'Casa térrea 3 quartos, garagem para 2 carros', 3, 1, 2, [90, 110]),
      t('apto', 'Apartamento 3 quartos com sacada', 3, 1, 1, [72, 88]),
    ],
    alto: [
      t('piscina', 'Casa 3 suítes com piscina', 3, 3, 2, [150, 185]),
      t('sobrado', 'Sobrado 4 quartos com churrasqueira e edícula', 4, 2, 2, [160, 190]),
    ],
  },
  medio: {
    basica: [
      t('apto', 'Apartamento 2 quartos, 1 vaga', 2, 0, 1, [58, 70]),
      t('terrea', 'Casa térrea 2 quartos com quintal', 2, 0, 1, [65, 80]),
      t('apto', 'Studio reformado perto do metrô', 1, 0, 0, [35, 45]),
    ],
    intermediaria: [
      t('sobrado', 'Sobrado 3 quartos, quintal e churrasqueira', 3, 1, 2, [120, 150]),
      t('apto', 'Apartamento 3 quartos, varanda gourmet', 3, 1, 2, [95, 115]),
      t('sobrado', 'Casa geminada 3 quartos, terraço', 3, 1, 1, [110, 130]),
    ],
    alto: [
      t('piscina', 'Casa 4 quartos, 2 suítes e piscina', 4, 2, 3, [220, 270]),
      t('cobertura', 'Cobertura duplex 3 suítes com terraço', 3, 3, 3, [190, 240]),
    ],
  },
  nobre: {
    basica: [
      t('apto', 'Apartamento 3 quartos com sacada', 3, 1, 1, [90, 110]),
      t('apto', 'Apartamento 2 suítes em prédio com lazer', 2, 2, 1, [80, 95]),
    ],
    intermediaria: [
      t('terrea', 'Casa 3 suítes com jardim', 3, 3, 2, [180, 220]),
      t('apto', 'Apartamento 4 quartos, andar alto', 4, 2, 3, [160, 190]),
      t('sobrado', 'Sobrado 4 quartos em rua fechada', 4, 2, 3, [200, 240]),
    ],
    alto: [
      t('piscina', 'Casa 4 suítes com piscina', 4, 4, 4, [350, 450]),
      t('cobertura', 'Cobertura 4 suítes com piscina privativa', 4, 4, 4, [320, 420]),
      t('piscina', 'Mansão 5 suítes, piscina e jardim', 5, 5, 6, [480, 620]),
    ],
  },
};

/** Endereços à beira-mar ganham "vista para o mar" nas casas melhores. */
const COAST = ['Av. Beira Mar', 'Av. Vieira Souto', 'Av. Niemeyer'];

export function priceLevel(basePrice: number): PriceLevel {
  return basePrice < 1300 ? 'popular' : basePrice < 2500 ? 'medio' : 'nobre';
}

/** Hash inteiro simples (FNV-1a) para escolher o anúncio de forma estável. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function houseListing(idx: number, tier: TierId): HouseListing {
  const s = SPACES[idx];
  const price = s && s.type === 'street' ? s.price : 1000;
  const name = s?.name ?? '';
  const pool = POOL[priceLevel(price)][tier];
  const h = hash(`${idx}:${tier}:${name}`);
  const tpl = pool[h % pool.length];
  const [lo, hi] = tpl.area;
  const area = Math.round((lo + ((h >>> 8) % (hi - lo + 1))) / 5) * 5;
  const perk = COAST.includes(name) && tier !== 'basica' ? 'vista para o mar' : undefined;
  return { kind: tpl.kind, title: tpl.title, area, rooms: tpl.rooms, suites: tpl.suites, vagas: tpl.vagas, perk };
}

/** Resumo curto, ex.: "120 m² · 3 quartos (1 suíte) · 2 vagas". */
export function listingFacts(l: HouseListing): string {
  const q = `${l.rooms} quarto${l.rooms > 1 ? 's' : ''}`;
  const su = l.suites ? (l.suites === l.rooms ? ` (todos suítes)` : ` (${l.suites} suíte${l.suites > 1 ? 's' : ''})`) : '';
  const v = l.vagas ? `${l.vagas} vaga${l.vagas > 1 ? 's' : ''}` : 'sem vaga';
  return `${l.area} m² · ${q}${su} · ${v}`;
}
