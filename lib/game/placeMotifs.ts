// Tema da ilustração de cada imóvel e empresa do tabuleiro (usado por components/PlaceArt.tsx).
// Função pura, sem React, para dar para testar que todo endereço comprável tem um tema próprio.
import { SPACES } from './data';
import type { GroupId } from './types';

export type MotifId =
  | 'tunel'
  | 'via-expressa'
  | 'banco'
  | 'jangada'
  | 'teatro-municipal'
  | 'rio-viaduto'
  | 'aviao'
  | 'anel-serra'
  | 'clinica'
  | 'onibus'
  | 'posto'
  | 'letreiro'
  | 'estadio'
  | 'predios-classicos'
  | 'martinelli'
  | 'cruzamento'
  | 'cosmeticos'
  | 'torres-vidro'
  | 'masp'
  | 'frevo'
  | 'torre-telecom'
  | 'ponte-estaiada'
  | 'vitrine'
  | 'parque-oca'
  | 'praia'
  | 'carro'
  | 'candelaria'
  | 'penhasco';

export interface PlaceMotif {
  motif: MotifId;
  /** O que a ilustração mostra, em português (entra no aria-label). */
  label: string;
}

/** Tema por casa do tabuleiro (índice em SPACES). */
export const PLACE_MOTIFS: Record<number, PlaceMotif> = {
  1: { motif: 'tunel', label: 'túnel da avenida sob o morro verde' },
  2: { motif: 'via-expressa', label: 'via expressa com passarela' },
  3: { motif: 'banco', label: 'agência com colunas ao nascer do sol' },
  4: { motif: 'jangada', label: 'jangada no mar e calçadão com coqueiro' },
  5: { motif: 'teatro-municipal', label: 'teatro com cúpulas no centro histórico' },
  7: { motif: 'rio-viaduto', label: 'rio canalizado sob o viaduto' },
  8: { motif: 'aviao', label: 'avião acima das nuvens ao entardecer' },
  9: { motif: 'anel-serra', label: 'anel viário ao pé da serra' },
  12: { motif: 'clinica', label: 'clínica com cruz entre árvores' },
  13: { motif: 'onibus', label: 'ônibus no corredor e ponto de parada' },
  14: { motif: 'posto', label: 'posto de combustível com bombas' },
  15: { motif: 'letreiro', label: 'letreiro iluminado de teatro à noite' },
  17: { motif: 'estadio', label: 'estádio de futebol com refletores' },
  18: { motif: 'predios-classicos', label: 'prédios clássicos em rua arborizada' },
  19: { motif: 'martinelli', label: 'arranha-céu histórico e notas musicais' },
  21: { motif: 'cruzamento', label: 'placas de esquina no cruzamento' },
  22: { motif: 'cosmeticos', label: 'batom, perfume e estojo de maquiagem' },
  25: { motif: 'torres-vidro', label: 'torres de vidro e ciclovia' },
  26: { motif: 'masp', label: 'museu de pilares vermelhos e prédios com antena' },
  28: { motif: 'frevo', label: 'sombrinha de frevo sobre a ponte do rio' },
  29: { motif: 'torre-telecom', label: 'torre de telefonia transmitindo sinal' },
  31: { motif: 'ponte-estaiada', label: 'ponte estaiada sobre o rio' },
  33: { motif: 'vitrine', label: 'vitrine com toldo listrado e sacolas' },
  34: { motif: 'parque-oca', label: 'parque com lago, obelisco e oca' },
  35: { motif: 'praia', label: 'praia com guarda-sol e morro Dois Irmãos' },
  36: { motif: 'carro', label: 'carro saindo da fábrica' },
  37: { motif: 'candelaria', label: 'igreja de torres gêmeas na avenida' },
  39: { motif: 'penhasco', label: 'estrada no penhasco e asa-delta sobre o mar' },
};

/** Cor de cada grupo (mesmos valores de --g-* em app/globals.css; a ilustração tem céu próprio, então não muda no tema escuro). */
export const GROUP_HEX: Record<GroupId, string> = {
  verde: '#1E9E5A',
  vermelho: '#E5383B',
  azulclaro: '#1FA2FF',
  roxo: '#7B2FF7',
  azulescuro: '#2A3FD6',
  laranja: '#FF7A00',
  amarelo: '#F2B705',
};

const COMPANY_HEX: Record<number, string> = {
  3: '#FFC93C',
  8: '#3D5AFE',
  14: '#E8175D',
  22: '#E8175D',
  29: '#7B2FF7',
  36: '#3D5AFE',
};

export function placeMotif(idx: number): PlaceMotif | null {
  return PLACE_MOTIFS[idx] ?? null;
}

/** Cor de destaque da ilustração: a do grupo para ruas, uma da paleta para empresas. */
export function placeAccent(idx: number): string {
  const s = SPACES[idx];
  if (s?.type === 'street') return GROUP_HEX[s.group];
  return COMPANY_HEX[idx] ?? '#3D5AFE';
}
