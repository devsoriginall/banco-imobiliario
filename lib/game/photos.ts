// Fotos reais das casas, por padrão. Cada padrão tem uma ou mais casas; cada casa é um anúncio com as fotos em
// ordem (a primeira é a capa) e, se houver, um vídeo de tour. Arquivos em public/casas/<padrão>/.
// Padrão sem casas usa a ilustração (HouseArt) no lugar.
import type { TierId } from './types';

export interface HouseMedia {
  photos: string[];
  /** Vídeo de tour pela casa, mostrado depois das fotos. */
  video?: string;
  /** Primeiro quadro do vídeo, enquanto ele carrega. */
  poster?: string;
}

const SOBRADO_MEDIO = '/casas/intermediaria/sobrado';

export const HOUSE_MEDIA: Record<TierId, HouseMedia[]> = {
  basica: [{ photos: ['/casas/basica/basica-1.jpg'] }],
  intermediaria: [
    {
      photos: ['1-fachada', '2-garagem', '3-sala', '4-cozinha', '5-quarto-casal', '6-quarto', '7-banheiro', '8-churrasqueira'].map((f) => `${SOBRADO_MEDIO}/${f}.jpg`),
      video: `${SOBRADO_MEDIO}/tour.mp4`,
      poster: `${SOBRADO_MEDIO}/tour-capa.jpg`,
    },
  ],
  alto: [{ photos: ['/casas/alto/alto-1.jpg'] }],
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
 * Anúncio da casa `tier` no imóvel `idx`: uma das casas do padrão, escolhida pelo imóvel (a mesma em todos os
 * celulares), com as fotos na ordem do anúncio. Sem casas = undefined (usa a ilustração).
 */
export function houseMedia(idx: number, tier: TierId, list: HouseMedia[] = HOUSE_MEDIA[tier] ?? []): HouseMedia | undefined {
  const usable = list.filter((m) => m.photos.length);
  if (!usable.length) return undefined;
  return usable[hash(`${idx}:${tier}`) % usable.length];
}

/** Fotos do anúncio (a primeira é a capa); lista vazia = sem fotos. */
export function housePhotos(idx: number, tier: TierId, list?: HouseMedia[]): string[] {
  return houseMedia(idx, tier, list)?.photos ?? [];
}
