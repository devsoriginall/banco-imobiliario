import type { GameState } from '@/lib/game/types';

export interface RoomSnapshot {
  state: GameState;
  version: number;
}

/** Interface comum ao Supabase e ao modo local de teste. */
export interface RoomStore {
  readonly mode: 'supabase' | 'local';
  /** Cria a sala. Retorna false se o código já existe. */
  create(code: string, state: GameState): Promise<boolean>;
  load(code: string): Promise<RoomSnapshot | null>;
  /** Grava só se a versão ainda for `expected` (concorrência otimista). Retorna a nova versão ou null em conflito. */
  update(code: string, expected: number, state: GameState): Promise<number | null>;
  /** Avisa a cada nova versão da sala. Retorna a função para cancelar. */
  subscribe(code: string, onChange: (snap: RoomSnapshot) => void): () => void;
}
