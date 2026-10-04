// Empréstimo com planos: parcelado em 2x a 5x ou pagamento único em 5 rodadas.
import { describe, expect, it } from 'vitest';
import { BANK_RATES, CREDIT, LOAN_PLANS } from './data';
import { applyAction, creditOf, debtOf, isParcelado, loanOptions, loanRateFor, newRoom, nextParcel, parcelSchedule } from './rules';
import type { Action, GameState } from './types';

const NOVE_JULHO = 1; // verde, $1.000, construção $500, hipoteca $500
const BRASIL = 2; // verde, $750
const BEIRA_MAR = 4; // verde, $600
const PAULISTA = 26; // azul escuro, $1.600, hipoteca $800
const FERIADO = 20;

const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: () => 0.5 });
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const bal = (st: GameState, id: string) => pl(st, id).balance;
const n = (x: string) => x.replace(/\s/g, ' ');

function game(players = ['Ana', 'Beto']): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  for (const p of players.slice(1)) st = act(st, p.toLowerCase(), { type: 'join', name: p });
  st = act(st, 'ana', { type: 'start' });
  st.bankRate = 0.1;
  return st;
}
function give(st: GameState, owner: string, idxs: number[], houses = 0): GameState {
  const s = structuredClone(st);
  for (const i of idxs) s.props[i] = { owner, houses, mortgaged: false };
  return s;
}
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
/** Passa até começar a vez da Ana na rodada `round` (a parcela daquela rodada já foi cobrada). */
function toAna(st: GameState, round: number): GameState {
  while (!(st.round === round && st.turn === 0)) st = pass(st);
  return st;
}
/** Passa até a vez do Beto na rodada anterior (a próxima passada começa a vez da Ana). */
function toEve(st: GameState, round: number): GameState {
  while (!(st.round === round - 1 && st.turn === 1)) st = pass(st);
  return st;
}

describe('taxas dos planos', () => {
  it('taxa da rodada + adicional do plano (2x +0, 3x +2, 4x +4, 5x +6, único +8 pp)', () => {
    const st = game();
    expect(LOAN_PLANS.map((p) => loanRateFor(st, 'ana', p.id))).toEqual([0.1, 0.12, 0.14, 0.16, 0.18]);
    // sem plano: a "sua taxa" da aba Banco, igual ao 2x
    expect(loanRateFor(st, 'ana')).toBe(0.1);
  });

  it('o ajuste do score vale em cima do plano, com mínimo de 2%', () => {
    const st = game();
    st.players[0].credit = 250; // Ruim: +5 pp
    expect(loanRateFor(st, 'ana', 'x4')).toBe(0.19);
    st.players[0].credit = 900; // Excelente: −4 pp
    st.bankRate = 0.05;
    expect(loanRateFor(st, 'ana', 'x2')).toBe(BANK_RATES.minLoanRate); // 5 + 0 − 4 = 1% → 2%
    expect(loanRateFor(st, 'ana', 'x3')).toBe(0.03);
    expect(loanRateFor(st, 'ana', 'unico')).toBe(0.09);
  });

  it('simulação das 5 opções para $ 2.000', () => {
    const sim = loanOptions(game(), 'ana', 2000);
    expect(sim.map((o) => [o.plan, o.rate, o.parcels, o.total, o.dueRound])).toEqual([
      ['x2', 0.1, [1100, 1100], 2200, 3],
      ['x3', 0.12, [750, 750, 740], 2240, 4],
      ['x4', 0.14, [570, 570, 570, 570], 2280, 5],
      ['x5', 0.16, [460, 460, 460, 460, 480], 2320, 6],
      ['unico', 0.18, [2360], 2360, 6],
    ]);
  });
});

describe('parcelas', () => {
  it('arredonda para $ 10 e a última absorve a diferença', () => {
    expect(parcelSchedule(2240, 3)).toEqual([750, 750, 740]);
    expect(parcelSchedule(1155, 2)).toEqual([580, 575]);
    expect(parcelSchedule(3390, 4)).toEqual([850, 850, 850, 840]);
    for (const [t, k] of [
      [2320, 5],
      [1234, 3],
      [5555, 4],
    ])
      expect(parcelSchedule(t, k).reduce((a, b) => a + b, 0)).toBe(t);
  });

  it('pega em 4x: guarda o plano, as parcelas e a taxa travada', () => {
    const st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x4' });
    expect(st.loans!.ana).toEqual({ principal: 2000, interest: 280, paid: 0, takenRound: 1, dueRound: 5, rate: 0.14, plan: 'x4', parcels: [570, 570, 570, 570], parcelsPaid: 0 });
    expect(bal(st, 'ana')).toBe(27000);
    expect(nextParcel(st.loans!.ana)).toEqual({ n: 1, of: 4, amount: 570, round: 2 });
    expect(n(st.tx[0].reason)).toBe('Empréstimo do banco em 4x a 14%: 4 parcelas de $ 570 (total $ 2.280)');
    expect(() => act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x9' as never })).toThrow(/Plano/);
  });

  it('cobra uma parcela no início de cada vez do jogador, a partir da rodada seguinte', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x3' });
    st = pass(st); // vez do Beto na rodada 1: nada
    expect(st.loans!.ana.parcelsPaid).toBe(0);
    st = pass(st); // vez da Ana na rodada 2: parcela 1
    expect(st.round).toBe(2);
    expect(bal(st, 'ana')).toBe(27000 - 750);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 750, kind: 'loanpay', reason: 'Parcela 1/3 do empréstimo' });
    expect(st.feed.find((f) => n(f.text) === 'Parcela 1/3 do empréstimo de Ana: $ 750')).toMatchObject({ important: true });
    expect(debtOf(st, 'ana')).toBe(1490);
    // a parcela não é cobrada de novo na mesma rodada (dupla não chama a próxima vez)
    st = act(act(st, 'ana', { type: 'land', idx: FERIADO }), 'ana', { type: 'endTurn', again: true });
    expect(st.loans!.ana.parcelsPaid).toBe(1);
    st = toAna(st, 3);
    expect(st.loans!.ana.parcelsPaid).toBe(2);
    st = toAna(st, 4);
    expect(st.loans!.ana).toBeUndefined();
    expect(st.tx[0]).toMatchObject({ amount: 740, reason: 'Parcela 3/3 do empréstimo' });
    expect(bal(st, 'ana')).toBe(27000 - 2240);
    expect(st.tx.filter((t) => t.kind === 'loanpay')).toHaveLength(3);
  });

  it('score: +10 por parcela paga com o saldo e +30 na quitação (5x dá no máximo +50 +30)', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x5' });
    st = toAna(st, 2);
    expect(creditOf(pl(st, 'ana'))).toBe(510);
    expect(pl(st, 'ana').creditLog![0]).toEqual({ delta: 10, reason: 'Parcela 1/5 do empréstimo paga em dia', round: 2 });
    st = toAna(st, 6);
    expect(st.loans!.ana).toBeUndefined();
    expect(creditOf(pl(st, 'ana'))).toBe(500 + 5 * CREDIT.parcelPaid + CREDIT.parcelLoanPaid);
    expect(pl(st, 'ana').creditLog![0].reason).toBe('Empréstimo parcelado quitado');
  });

  it('sem saldo para a parcela: penhora só no valor da parcela, −100 e sem o bônus de quitação', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x2' });
    st = toEve(st, 2);
    st = give(st, 'ana', [NOVE_JULHO, BRASIL, PAULISTA], 1); // 1 casa em cada (construção $500 e $1.000)
    st.players[0].balance = 0;
    st = pass(st);
    // parcela 1.100: casa da Brasil (mais barata entre as de 1 casa) 250 + casa da 9 de Julho 250 + casa da Paulista 500 = 1.000;
    // ainda falta: toma a Brasil ($750, hipoteca 500) → 1.500. Para aí.
    expect(st.props[BRASIL]).toBeUndefined();
    expect(st.props[NOVE_JULHO]).toMatchObject({ owner: 'ana', houses: 0 });
    expect(st.props[PAULISTA]).toMatchObject({ owner: 'ana', houses: 0 });
    expect(bal(st, 'ana')).toBe(400);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 1100, reason: 'Parcela 1/2 do empréstimo' });
    expect(st.loans!.ana).toMatchObject({ parcelsPaid: 1, paid: 1100, penhora: true });
    expect(creditOf(pl(st, 'ana'))).toBe(400);
    expect(pl(st, 'ana').creditLog![0].reason).toBe('Parcela 1/2 do empréstimo com penhora');
    // segunda parcela paga com saldo: +10, mas sem os +30
    st.players[0].balance = 5000;
    st = toAna(st, 3);
    expect(st.loans!.ana).toBeUndefined();
    expect(creditOf(pl(st, 'ana'))).toBe(410);
  });

  it('se nem a penhora cobre a parcela, falência para o banco', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x2' });
    st = toEve(st, 2);
    st = give(st, 'ana', [BEIRA_MAR]);
    st.players[0].balance = 100;
    st = pass(st);
    expect(pl(st, 'ana').out).toBe(true);
    expect(st.loans!.ana).toBeUndefined();
    expect(st.props[BEIRA_MAR]).toBeUndefined();
    expect(st.winner).toBe('beto');
    expect(st.tx.find((t) => t.kind === 'loanpay')).toMatchObject({ amount: 600, reason: 'Parcela 1/2 do empréstimo' });
  });

  it('com 3 jogadores, quem faliu na parcela perde a vez e o jogo segue', () => {
    let st = act(game(['Ana', 'Beto', 'Caio']), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x4' });
    while (!(st.round === 1 && st.turn === 2)) st = pass(st);
    st.players[0].balance = 0;
    st = pass(st);
    expect(pl(st, 'ana').out).toBe(true);
    expect(st.winner).toBeNull();
    expect(st.players[st.turn].id).toBe('beto');
  });

  it('quitação antecipada: paga todo o saldo restante, sem desconto de juros, +30', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x4' });
    st = toAna(st, 2);
    expect(debtOf(st, 'ana')).toBe(1710);
    expect(() => act(st, 'ana', { type: 'payLoan', amount: 570 })).toThrow(/não há pagamento parcial/);
    st = act(st, 'ana', { type: 'payLoan', amount: 1710 });
    expect(st.loans!.ana).toBeUndefined();
    expect(bal(st, 'ana')).toBe(27000 - 2280);
    expect(st.tx[0]).toMatchObject({ amount: 1710, kind: 'loanpay', reason: 'Quitação antecipada do empréstimo em 4x (3 parcelas restantes)' });
    expect(creditOf(pl(st, 'ana'))).toBe(500 + 10 + 30);
  });

  it('desfazer a passada de vez devolve a parcela cobrada', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x4' });
    st = pass(st);
    const charged = pass(st);
    expect(charged.loans!.ana.parcelsPaid).toBe(1);
    const back = act(charged, 'beto', { type: 'undo' });
    expect(back.loans!.ana.parcelsPaid).toBe(0);
    expect(bal(back, 'ana')).toBe(27000);
  });
});

describe('pagamento único', () => {
  it('sem plano na ação é pagamento único: tudo em 5 rodadas, pagamento parcial continua valendo', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    expect(st.loans!.ana).toMatchObject({ plan: 'unico', rate: 0.18, interest: 360, dueRound: 6 });
    expect(isParcelado(st.loans!.ana)).toBe(false);
    expect(nextParcel(st.loans!.ana)).toBeNull();
    st = act(st, 'ana', { type: 'payLoan', amount: 500 });
    expect(debtOf(st, 'ana')).toBe(1860);
    st = toAna(st, 5);
    expect(debtOf(st, 'ana')).toBe(1860); // nada cobrado antes do vencimento
    st = toAna(st, 6);
    expect(st.loans!.ana).toBeUndefined();
    expect(pl(st, 'ana').creditLog![0]).toMatchObject({ delta: CREDIT.loanPaid, reason: 'Empréstimo pago no vencimento' });
  });

  it('pagamento único vencido com penhora continua −200', () => {
    let st = act(give(game(), 'ana', [PAULISTA]), 'ana', { type: 'takeLoan', amount: 1000, plan: 'unico' });
    st = toEve(st, 6);
    st.players[0].balance = 500;
    st = pass(st);
    expect(creditOf(pl(st, 'ana'))).toBe(300);
  });

  it('empréstimo antigo sem plano se comporta como pagamento único', () => {
    let st = game();
    st.loans = { ana: { principal: 2000, interest: 200, paid: 0, takenRound: 1, dueRound: 6, rate: 0.1 } };
    expect(isParcelado(st.loans.ana)).toBe(false);
    st = toAna(st, 5);
    expect(debtOf(st, 'ana')).toBe(2200);
    st = act(st, 'ana', { type: 'payLoan', amount: 700 }); // parcial, como antes
    expect(debtOf(st, 'ana')).toBe(1500);
    st = toAna(st, 6);
    expect(st.loans!.ana).toBeUndefined();
    expect(st.tx[0]).toMatchObject({ amount: 1500, reason: 'Cobrança do empréstimo vencido' });
  });
});
