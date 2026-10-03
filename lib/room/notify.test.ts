import { describe, expect, it } from 'vitest';
import { applyAction, newRoom } from '@/lib/game/rules';
import type { Action, GameState } from '@/lib/game/types';
import { describeIncoming, incomingSince } from './notify';

const act = (st: GameState, actor: string, a: Action) => applyAction(st, a, { actor, rng: () => 0.5 });

describe('notificação de Pix recebido', () => {
  it('Ana vê o aluguel pago pelo Beto', () => {
    let st = act(newRoom('ABCDE', { id: 'ana', name: 'Ana' }), 'beto', { type: 'join', name: 'Beto' });
    st = act(st, 'ana', { type: 'start' });
    st = act(act(st, 'ana', { type: 'land', idx: 1 }), 'ana', { type: 'buy' });
    st = act(st, 'ana', { type: 'endTurn', again: false });
    const seen = st.txCount;
    st = act(act(st, 'beto', { type: 'land', idx: 1 }), 'beto', { type: 'payRent' });
    const news = incomingSince(st, 'ana', seen);
    expect(news).toHaveLength(1);
    expect(describeIncoming(st, news[0]).text.replace(/\s/g, ' ')).toBe('Beto pagou o aluguel da Av. 9 de Julho · +$ 60');
    expect(incomingSince(st, 'beto', seen)).toHaveLength(0);
  });
});
