// Declaração parcial do IR: declarar menos que a renda real, pagar o imposto sobre o declarado e arriscar a malha fina
// na proporção do que escondeu.
import { describe, expect, it } from 'vitest';
import { CREDIT, IR } from './data';
import { applyAction, creditOf, irCatchChance, irFineDue, irTax, newRoom, nextRandom } from './rules';
import type { Action, GameState } from './types';

const FERIADO = 20;
const now = new Date('2026-01-01T12:00:00Z');
const half = () => 0.5;
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: half });
const n = (x: string) => x.replace(/\s/g, ' ');
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const bal = (st: GameState, id: string) => pl(st, id).balance;

function game(): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  st = act(st, 'ana', { type: 'setMercado', on: false });
  return act(st, 'ana', { type: 'start' });
}
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
/** Fim do ano 1 com a renda dada para a Ana: a declaração dela abre no começo da vez. */
function yearEnd(income: number): GameState {
  let st = game();
  while (!(st.round === 6 && st.turn === 1)) st = pass(st);
  st = structuredClone(st);
  pl(st, 'ana').income = income;
  return pass(st);
}
/** Primeira semente cujo próximo sorteio satisfaz `pred` (força o resultado da malha fina). */
function seedWhere(pred: (r: number) => boolean): number {
  for (let s = 1; ; s++) if (pred(nextRandom({ seed: s } as GameState))) return s;
}
const caughtSeed = (chance: number) => seedWhere((r) => r < chance);
const passSeed = (chance: number) => seedWhere((r) => r >= chance);

// renda de $ 10.000: imposto real de $ 1.200
const INCOME = 10000;

describe('IR parcial: validação', () => {
  it('aceita qualquer inteiro de 0 até a renda − 1', () => {
    const st = yearEnd(INCOME);
    expect(st.irPending).toMatchObject({ income: INCOME, tax: 1200 });
    for (const bad of [-1, INCOME, INCOME + 1, 1500.5, NaN]) expect(() => act(st, 'ana', { type: 'evadeIR', declared: bad })).toThrow(/Declare uma renda de/);
    expect(n((() => {
      try {
        act(st, 'ana', { type: 'evadeIR', declared: INCOME });
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    })())).toBe('Declare uma renda de $ 0 a $ 9.999.');
    expect(() => act(st, 'ana', { type: 'evadeIR', declared: 0 })).not.toThrow();
    expect(() => act(st, 'ana', { type: 'evadeIR', declared: 3333 })).not.toThrow();
    expect(() => act(st, 'ana', { type: 'evadeIR', declared: INCOME - 1 })).not.toThrow();
  });

  it('só quem tem a declaração pendente, e não depois de cair na malha fina', () => {
    const st = yearEnd(INCOME);
    expect(() => act(st, 'beto', { type: 'evadeIR', declared: 5000 })).toThrow();
    const caught = structuredClone(st);
    caught.seed = caughtSeed(irCatchChance(INCOME, 5000));
    caught.players[0].balance = 1000;
    const next = act(caught, 'ana', { type: 'evadeIR', declared: 5000 });
    expect(next.irPending?.caught).toBe(true);
    expect(() => act(next, 'ana', { type: 'evadeIR', declared: 5000 })).toThrow(/já caiu na malha fina/);
  });
});

describe('IR parcial: chance de malha fina', () => {
  it('cresce com a fração escondida: 30% sonegando tudo, 12% declarando 90%, 10% no limite', () => {
    expect(IR.catchMin).toBe(0.1);
    expect(irCatchChance(INCOME, 0)).toBe(IR.catchChance);
    expect(irCatchChance(INCOME, 0)).toBe(0.3);
    expect(irCatchChance(INCOME, 9000)).toBeCloseTo(0.12, 10);
    expect(irCatchChance(INCOME, 5000)).toBeCloseTo(0.2, 10);
    expect(irCatchChance(INCOME, INCOME)).toBeCloseTo(IR.catchMin, 10);
    expect(irCatchChance(INCOME, 1000)).toBeGreaterThan(irCatchChance(INCOME, 2000));
  });

  it('o que faltou é o imposto que deixou de pagar, com multa de 100% só sobre ele', () => {
    expect(irFineDue(INCOME, 0)).toBe(2400);
    expect(irFineDue(INCOME, 6000)).toBe((1200 - 600) * 2);
    expect(irFineDue(INCOME, 1500)).toBe(2400); // declarou abaixo da isenção: não pagou nada agora
  });
});

describe('IR parcial: não cai na malha fina', () => {
  it('paga o imposto sobre o declarado, fecha o ano, log discreto e sem bônus de score', () => {
    const st = yearEnd(INCOME);
    st.seed = passSeed(irCatchChance(INCOME, 6000));
    const next = act(st, 'ana', { type: 'evadeIR', declared: 6000 });
    expect(next.irPending).toBeNull();
    expect(bal(next, 'ana')).toBe(25000 - 600);
    expect(next.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 600, kind: 'ir' });
    expect(n(next.tx[0].reason)).toBe('Imposto de renda do ano 1: 15% de $ 4.000');
    expect(pl(next, 'ana').irYear).toBe(1);
    expect(creditOf(pl(next, 'ana'))).toBe(CREDIT.start);
    expect(pl(next, 'ana').irLast).toEqual({ year: 1, income: INCOME, tax: 1200, outcome: 'passou', paid: 600, round: next.round, declared: 6000 });
    expect(next.feed[0].text).toBe('Ana entregou a declaração do ano 1');
    expect(next.feed[0].important).toBe(false);
    expect(pass(next).turn).toBe(1);
  });

  it('declarado abaixo da isenção: nada a pagar agora', () => {
    const st = yearEnd(INCOME);
    st.seed = passSeed(irCatchChance(INCOME, 1000));
    const next = act(st, 'ana', { type: 'evadeIR', declared: 1000 });
    expect(bal(next, 'ana')).toBe(25000);
    expect(next.tx.filter((t) => t.kind === 'ir')).toHaveLength(0);
    expect(pl(next, 'ana').irLast).toMatchObject({ outcome: 'passou', paid: 0, declared: 1000 });
  });
});

describe('IR parcial: cai na malha fina', () => {
  it('paga o imposto declarado, depois o que faltou × 2; −150 no score; log conta quanto escondeu', () => {
    const st = yearEnd(INCOME);
    st.seed = caughtSeed(irCatchChance(INCOME, 6000));
    const next = act(st, 'ana', { type: 'evadeIR', declared: 6000 });
    expect(next.irPending).toBeNull();
    expect(bal(next, 'ana')).toBe(25000 - 600 - 1200);
    expect(next.tx[1]).toMatchObject({ amount: 600, kind: 'ir' });
    expect(next.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 1200, kind: 'ir', reason: 'Malha fina: IR que faltou do ano 1 + multa de 100%' });
    expect(creditOf(pl(next, 'ana'))).toBe(CREDIT.start + CREDIT.malhaFina);
    expect(pl(next, 'ana').irLast).toEqual({ year: 1, income: INCOME, tax: 1200, outcome: 'pego', paid: 1800, round: next.round, declared: 6000 });
    expect(pl(next, 'ana').irYear).toBe(1);
    expect(n(next.feed[0].text)).toBe('Ana declarou $ 6.000 de $ 10.000 e caiu na malha fina: imposto que faltou + multa de $ 1.200');
    expect(next.feed[0].important).toBe(true);
  });

  it('sem saldo para a multa: fica pendente com o que faltou e paga pelo Pix depois', () => {
    const st = yearEnd(INCOME);
    st.seed = caughtSeed(irCatchChance(INCOME, 6000));
    st.players[0].balance = 1000;
    let next = act(st, 'ana', { type: 'evadeIR', declared: 6000 });
    expect(bal(next, 'ana')).toBe(400);
    expect(next.irPending).toMatchObject({ caught: true, due: 1200, declared: 6000, year: 1 });
    expect(creditOf(pl(next, 'ana'))).toBe(CREDIT.start + CREDIT.malhaFina + CREDIT.shortfall);
    expect(pl(next, 'ana').irLast).toMatchObject({ outcome: 'pego', paid: 600, declared: 6000 });
    expect(() => act(next, 'ana', { type: 'declareIR' })).toThrow(/Saldo insuficiente/);
    next.players[0].balance = 2000;
    next = act(next, 'ana', { type: 'declareIR' });
    expect(next.irPending).toBeNull();
    expect(bal(next, 'ana')).toBe(800);
    expect(next.tx[0]).toMatchObject({ amount: 1200, kind: 'ir', reason: 'Malha fina: IR que faltou do ano 1 + multa de 100%' });
    expect(pl(next, 'ana').irLast).toMatchObject({ outcome: 'pego', paid: 1800, declared: 6000 });
    expect(creditOf(pl(next, 'ana'))).toBe(CREDIT.start + CREDIT.malhaFina + CREDIT.shortfall); // sem o bônus de declarar em dia
  });
});

describe('IR parcial: saldo para o imposto declarado', () => {
  it('sem saldo para o imposto sobre o declarado: Saldo insuficiente e nada muda (nem o sorteio)', () => {
    const st = yearEnd(INCOME);
    st.players[0].balance = 500;
    expect(() => act(st, 'ana', { type: 'evadeIR', declared: 6000 })).toThrow(/Saldo insuficiente: Ana/);
    expect(st.irPending).toMatchObject({ pid: 'ana', due: 1200 });
    // declarando o bastante para caber no saldo, entrega
    expect(() => act(st, 'ana', { type: 'evadeIR', declared: 5000 })).not.toThrow();
  });
});

describe('IR parcial: compatível com o sonegar antigo', () => {
  it('evadeIR sem declared = sonegar tudo, como antes', () => {
    for (const declared of [undefined, 0]) {
      const action: Action = declared === undefined ? { type: 'evadeIR' } : { type: 'evadeIR', declared };
      const ok = yearEnd(6000);
      ok.seed = passSeed(IR.catchChance);
      const a = act(ok, 'ana', action);
      expect(bal(a, 'ana')).toBe(25000);
      expect(pl(a, 'ana').irLast).toMatchObject({ outcome: 'passou', paid: 0, tax: 600, declared: 0 });
      const bad = yearEnd(6000);
      bad.seed = caughtSeed(IR.catchChance);
      const b = act(bad, 'ana', action);
      expect(bal(b, 'ana')).toBe(25000 - 1200);
      expect(b.tx[0]).toMatchObject({ amount: 1200, reason: 'Malha fina: IR do ano 1 + multa de 100%' });
      expect(n(b.feed[0].text)).toBe('Ana sonegou o IR e caiu na malha fina: imposto + multa de $ 1.200');
      const broke = yearEnd(6000);
      broke.seed = caughtSeed(IR.catchChance);
      broke.players[0].balance = 500;
      const c = act(broke, 'ana', action);
      expect(c.irPending).toEqual({ pid: 'ana', year: 1, income: 6000, tax: 600, due: 1200, cal: true, caught: true });
    }
  });

  it('declarar tudo continua igual: paga o imposto inteiro e ganha o bônus de score', () => {
    const st = act(yearEnd(INCOME), 'ana', { type: 'declareIR' });
    expect(bal(st, 'ana')).toBe(25000 - irTax(INCOME));
    expect(creditOf(pl(st, 'ana'))).toBe(CREDIT.start + CREDIT.irDeclared);
    expect(pl(st, 'ana').irLast).toEqual({ year: 1, income: INCOME, tax: 1200, outcome: 'declarou', paid: 1200, round: st.round });
  });

  it('o sorteio é o mesmo em todos os celulares', () => {
    const st = yearEnd(INCOME);
    const a = act(st, 'ana', { type: 'evadeIR', declared: 7000 });
    const b = applyAction(st, { type: 'evadeIR', declared: 7000 }, { actor: 'ana', now, rng: Math.random });
    expect(a.players[0].irLast).toEqual(b.players[0].irLast);
    expect(a.seed).toBe(b.seed);
  });
});
