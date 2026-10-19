// Poupança pela regra real: 0,5% ao mês (6,17% ao ano) com a Selic acima de 8,5%, senão 70% da Selic;
// a taxa do ano é dividida pelas rodadas do ano e o rendimento é isento de IR.
import { describe, expect, it } from 'vitest';
import { CALENDAR, SAVINGS } from './data';
import { applyAction, incomeOf, isIncome, newRoom, savingsAnnualRate, savingsOf, savingsRate, savingsYield } from './rules';
import type { Action, GameState } from './types';

const FERIADO = 20;
const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: () => 0.5 });
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;

function game(rate: number): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  st = act(st, 'ana', { type: 'setMercado', on: false });
  st = act(st, 'ana', { type: 'start' });
  st.bankRate = rate;
  st.hood = {};
  st.hoodMods = [];
  return st;
}
/** Passa a vez de quem joga e fixa a taxa do banco (a Selic do semestre e as manchetes mudariam). */
function pass(st: GameState, rate: number): GameState {
  const id = st.players[st.turn].id;
  const s = act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
  s.bankRate = rate;
  return s;
}

describe('poupança pela regra real', () => {
  it('constantes no SAVINGS', () => {
    expect(SAVINGS).toMatchObject({ selicThreshold: 0.085, fixedAnnual: 0.0617, shareBelow: 0.7 });
    expect('rateShare' in SAVINGS).toBe(false);
  });

  it('Selic de 12%: 6,17% ao ano, ÷ 6 rodadas por vez; $ 10.000 rendem $ 100', () => {
    const st = game(0.12);
    expect(savingsAnnualRate(st)).toBe(0.0617);
    expect(savingsRate(st)).toBeCloseTo(0.0617 / CALENDAR.roundsPerYear, 4);
    pl(st, 'ana').savings = 10000;
    expect(savingsYield(st, pl(st, 'ana'))).toBe(100);
  });

  it('Selic de 8%: 70% da Selic ao ano, ÷ 6 rodadas por vez', () => {
    const st = game(0.08);
    expect(savingsAnnualRate(st)).toBeCloseTo(0.7 * 0.08, 10);
    expect(savingsRate(st)).toBeCloseTo((0.7 * 0.08) / 6, 4);
    pl(st, 'ana').savings = 30000; // 30.000 × 5,6% ÷ 6 = 280
    expect(savingsYield(st, pl(st, 'ana'))).toBe(280);
  });

  it('exatamente 8,5% ainda usa 70% da taxa', () => {
    expect(savingsAnnualRate(game(0.085))).toBeCloseTo(0.7 * 0.085, 10);
  });

  it('o rendimento entra na poupança, aparece no extrato e não conta como renda no IR', () => {
    let st = game(0.12);
    st = act(st, 'ana', { type: 'deposit', amount: 10000 });
    st = pass(st, 0.12);
    st = pass(st, 0.12); // rodada 2, vez da Ana
    expect(savingsOf(pl(st, 'ana'))).toBe(10100);
    expect(incomeOf(pl(st, 'ana'))).toBe(0);
    expect(isIncome('rendimento')).toBe(false);
    const tx = st.tx.find((t) => t.kind === 'rendimento')!;
    expect(tx).toMatchObject({ from: 'bank', to: 'ana', amount: 100 });
    expect(tx.reason.replace(/\s/g, ' ')).toBe('Rendimento da poupança: 1,03% na vez (6,17% ao ano)');
  });

  it('60 vezes com Selic de 15%: o saldo não chega a dobrar', () => {
    let st = game(0.15);
    st = act(st, 'ana', { type: 'deposit', amount: 10000 });
    let turns = 0;
    while (turns < 60) {
      st = pass(st, 0.15);
      if (st.turn === 0) turns++;
    }
    const s = savingsOf(pl(st, 'ana'));
    expect(s).toBeGreaterThan(10000);
    expect(s).toBeLessThan(20000);
  });
});
