import { describe, expect, it } from 'vitest';
import { JAIL_POS, SPACES } from './data';
import { applyAction, newRoom, RuleError } from './rules';
import type { Action, GameState } from './types';

const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: () => 0.5 });

/** Ana e Beto, regras clássicas (sem Jornal e Bolsa). */
function game(): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  st = act(st, 'ana', { type: 'setMercado', on: false });
  return act(st, 'ana', { type: 'start' });
}
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const START = 25000;
const SALARY = () => game().settings.salary;

describe('andar pelos dados', () => {
  it('anda a soma dos dados a partir da casa atual e guarda a soma', () => {
    const st = act(game(), 'ana', { type: 'roll', sum: 5 });
    expect(pl(st, 'ana').pos).toBe(5);
    expect(st.turnInfo.landed).toBe(5);
    expect(st.turnInfo.dice).toBe(5);
    expect(st.turnInfo.double).toBe(false);
    expect(pl(st, 'ana').balance).toBe(START);
    expect(st.feed[0].text).toBe(`Ana tirou 5 e parou em ${SPACES[5].name}`);
  });

  it('dá a volta passando do fim do tabuleiro e recebe o pró-labore uma vez', () => {
    let st = game();
    st.players[0].pos = 36;
    st = act(st, 'ana', { type: 'roll', sum: 7 });
    expect(pl(st, 'ana').pos).toBe((36 + 7) % SPACES.length);
    expect(pl(st, 'ana').balance).toBe(START + SALARY());
    expect(st.tx.filter((t) => t.kind === 'salary')).toHaveLength(1);
  });

  it('parar exatamente no Início também paga o pró-labore (como escolher a casa)', () => {
    const st = game();
    st.players[0].pos = SPACES.length - 4;
    const rolled = act(st, 'ana', { type: 'roll', sum: 4 });
    const landed = act(st, 'ana', { type: 'land', idx: 0 });
    expect(pl(rolled, 'ana').pos).toBe(0);
    expect(pl(rolled, 'ana').balance).toBe(START + SALARY());
    expect(pl(landed, 'ana').balance).toBe(pl(rolled, 'ana').balance);
    expect(rolled.turnInfo.resolved).toBe(true);
  });

  it('"Vá para a detenção" prende sem pró-labore, mesmo dando a volta', () => {
    const gotojail = SPACES.findIndex((s) => s.type === 'gotojail');
    let st = game();
    st.players[0].pos = gotojail - 6;
    st = act(st, 'ana', { type: 'roll', sum: 6 });
    expect(pl(st, 'ana')).toMatchObject({ pos: JAIL_POS, jailed: true, balance: START });
    expect(st.turnInfo.resolved).toBe(true);
    expect(() => act(st, 'ana', { type: 'endTurn', again: true })).toThrow(/detenção/);
  });

  it('recusa somas inválidas', () => {
    const st = game();
    for (const sum of [0, 1, 13, 7.5, -2, NaN]) expect(() => act(st, 'ana', { type: 'roll', sum })).toThrow(/2 a 12/);
    expect(() => act(st, 'ana', { type: 'roll', sum: 7, double: true })).toThrow(/par/);
    expect(() => act(st, 'beto', { type: 'roll', sum: 6 })).toThrow(/vez de Ana/);
  });

  it('não anda duas vezes na mesma jogada (nem pelos dados depois de escolher a casa)', () => {
    const st = act(game(), 'ana', { type: 'roll', sum: 6 });
    expect(() => act(st, 'ana', { type: 'roll', sum: 6 })).toThrow(RuleError);
    expect(() => act(st, 'ana', { type: 'land', idx: 12 })).toThrow(RuleError);
    const manual = act(game(), 'ana', { type: 'land', idx: 5 });
    expect(() => act(manual, 'ana', { type: 'roll', sum: 4 })).toThrow(/já andou/);
  });

  it('na detenção não anda pelos dados; saindo com dupla anda e não joga de novo', () => {
    let st = game();
    st.players[0].jailed = true;
    st.players[0].pos = JAIL_POS;
    expect(() => act(st, 'ana', { type: 'roll', sum: 8 })).toThrow(/detenção/);
    st = act(st, 'ana', { type: 'jailOut' });
    st = act(st, 'ana', { type: 'roll', sum: 8, double: true });
    expect(pl(st, 'ana').pos).toBe(JAIL_POS + 8);
    expect(st.turnInfo.double).toBe(false);
    if (!st.turnInfo.resolved) st = act(st, 'ana', { type: 'skipBuy' });
    expect(() => act(st, 'ana', { type: 'endTurn', again: true })).toThrow(/não joga de novo/);
  });

  it('dupla: joga de novo, conta as seguidas e a 3ª vai direto para a detenção sem andar', () => {
    const free = SPACES.findIndex((s) => s.type === 'free');
    let st = game();
    st.players[0].pos = free - 4;
    st = act(st, 'ana', { type: 'roll', sum: 4, double: true });
    expect(st.turnInfo).toMatchObject({ dice: 4, double: true, landed: free, resolved: true });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    expect(st.turn).toBe(0);
    expect(st.turnInfo).toMatchObject({ landed: null, doubles: 1 });
    expect(st.turnInfo.dice).toBeUndefined();
    // 2ª dupla seguida
    st.players[0].pos = free - 2;
    st = act(st, 'ana', { type: 'roll', sum: 2, double: true });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    expect(st.turnInfo.doubles).toBe(2);
    const before = pl(st, 'ana').balance;
    st = act(st, 'ana', { type: 'roll', sum: 6, double: true });
    expect(pl(st, 'ana')).toMatchObject({ pos: JAIL_POS, jailed: true, balance: before });
    expect(st.turnInfo).toMatchObject({ landed: JAIL_POS, resolved: true });
    expect(st.feed[0].text).toBe('Ana tirou 3 duplas seguidas e foi para a detenção');
    expect(() => act(st, 'ana', { type: 'endTurn', again: true })).toThrow(/detenção/);
    st = act(st, 'ana', { type: 'endTurn', again: false });
    expect(st.turn).toBe(1);
  });

  it('a soma dos dados fica guardada para a taxa da empresa; desfazer volta para antes de andar', () => {
    const co = SPACES.findIndex((s) => s.type === 'company');
    let st = game();
    st.shares = { [co]: { beto: 1 } };
    st.players[0].pos = co - 3;
    st = act(st, 'ana', { type: 'roll', sum: 3 });
    expect(st.turnInfo).toMatchObject({ landed: co, dice: 3, resolved: false });
    const back = act(st, 'ana', { type: 'undo' });
    expect(back.turnInfo.landed).toBeNull();
    expect(pl(back, 'ana').pos).toBe(co - 3);
  });

  it('salas antigas (sem os campos novos) continuam jogando', () => {
    const st = game();
    st.turnInfo = { landed: null, resolved: false, news: null, feePaid: false };
    const next = act(st, 'ana', { type: 'roll', sum: 9 });
    expect(next.turnInfo.landed).toBe(9);
  });
});
