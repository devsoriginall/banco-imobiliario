// Fotos reais das casas, por padrão. Coloque os arquivos em public/casas/<padrão>/ (basica | intermediaria | alto)
// e liste aqui o caminho público. Padrão sem fotos usa a ilustração (HouseArt) no lugar.
import type { TierId } from './types';

export const HOUSE_PHOTOS: Record<TierId, string[]> = {
  basica: ['/casas/basica/basica-1.jpg'],
  intermediaria: ['/casas/intermediaria/intermediaria-1.jpg'],
  alto: ['/casas/alto/alto-1.jpg'],
};

/** Hash inteiro (FNV-1a) para a escolha estável. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Fotos do anúncio da casa `tier` no imóvel `idx`: a lista do padrão, girada para começar numa foto escolhida
 * pelo imóvel (a mesma em todos os celulares). A primeira é a capa. Lista vazia = sem fotos (usa a ilustração).
 */
export function housePhotos(idx: number, tier: TierId, list: string[] = HOUSE_PHOTOS[tier] ?? []): string[] {
  if (!list.length) return [];
  const start = hash(`${idx}:${tier}`) % list.length;
  return [...list.slice(start), ...list.slice(0, start)];
}
