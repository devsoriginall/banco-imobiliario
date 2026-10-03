// Envia uma ação para a sala com concorrência otimista:
// aplica a regra pura sobre a versão conhecida e grava "onde version = esperada";
// se outro aparelho gravou antes, relê e reaplica a mesma ação sobre o estado novo.
import { applyAction } from '@/lib/game/rules';
import type { Action, GameState } from '@/lib/game/types';
import type { RoomSnapshot, RoomStore } from './store';

export interface DispatchResult {
  base: GameState;
  next: RoomSnapshot;
}

export async function dispatch(store: RoomStore, code: string, action: Action, actor: string, known?: RoomSnapshot | null, maxTries = 8): Promise<DispatchResult> {
  let snap = known ?? (await store.load(code));
  for (let attempt = 0; attempt < maxTries; attempt++) {
    if (!snap) throw new Error('Sala não encontrada.');
    const next = applyAction(snap.state, action, { actor }); // RuleError sobe para quem chamou
    const version = await store.update(code, snap.version, next);
    if (version !== null) return { base: snap.state, next: { state: next, version } };
    snap = await store.load(code);
  }
  throw new Error('Muitos aparelhos gravando ao mesmo tempo. Tente de novo.');
}
