// Empréstimo com planos: parcelado em 2x a 5x (uma parcela por semestre do calendário) ou pagamento único no 2º semestre.
import { describe, expect, it } from 'vitest';
import { BANK_RATES, CALENDAR, CREDIT, LOAN_PLANS } from './data';
import {
  applyAction,
  calendarText,
  creditOf,
  debtOf,
  firstChargeRound,
  isParcelado,
  isSemesterStart,
  loanOptions,
  loanRateFor,
  loanSchedule,
  migrateState,
  newRoom,
  nextParcel,
  parcelSchedule,
  roundInYear,
  semesterOf,
  semesterText,
  yearOf,
} from './rules';
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
  st = act(st, 'ana', { type: 'setMercado', on: false }); // sem Jornal e Bolsa
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

describe('calendário da partida', () => {
  it('1 ano = 6 rodadas, 2 semestres de 3 rodadas, igual para todos', () => {
    expect(CALENDAR).toEqual({ roundsPerYear: 6, roundsPerSemester: 3 });
    expect([1, 6, 7, 12, 13].map(yearOf)).toEqual([1, 1, 2, 2, 3]);
    expect([1, 3, 4, 6, 7, 9].map(roundInYear)).toEqual([1, 3, 4, 6, 1, 3]);
    expect([1, 3, 4, 6, 7, 10].map(semesterOf)).toEqual([1, 1, 2, 2, 1, 2]);
    expect([1, 2, 3, 4, 5, 6, 7, 10, 13].filter(isSemesterStart)).toEqual([1, 4, 7, 10, 13]);
    expect(calendarText(9)).toBe('Ano 2 · rodada 3 de 6');
    expect(semesterText(10)).toBe('início do 2º semestre do ano 2');
  });

  it('1ª cobrança: primeiro início de semestre pelo menos 2 rodadas depois de pegar', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(firstChargeRound)).toEqual([4, 4, 7, 7, 7, 10, 10]);
    expect(loanSchedule(1, 'x5').rounds).toEqual([4, 7, 10, 13, 16]);
    expect(loanSchedule(3, 'x2')).toEqual({ firstRound: 7, rounds: [7, 10], dueRound: 10 });
    // pagamento único: no 2º início de semestre contado pela mesma regra
    expect(loanSchedule(1, 'unico')).toEqual({ firstRound: 4, rounds: [7], dueRound: 7 });
    expect(loanSchedule(5, 'unico').dueRound).toBe(10);
  });
});

describe('taxas dos planos', () => {
  it('Taxa Selic + adicional do plano (2x +0, 3x +2, 4x +4, 5x +6, único +8 pp)', () => {
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
    expect(sim.map((o) => [o.plan, o.rate, o.parcels, o.total, o.rounds])).toEqual([
      ['x2', 0.1, [1100, 1100], 2200, [4, 7]],
      ['x3', 0.12, [750, 750, 740], 2240, [4, 7, 10]],
      ['x4', 0.14, [570, 570, 570, 570], 2280, [4, 7, 10, 13]],
      ['x5', 0.16, [460, 460, 460, 460, 480], 2320, [4, 7, 10, 13, 16]],
      ['unico', 0.18, [2360], 2360, [7]],
    ]);
    expect(sim.map((o) => o.dueRound)).toEqual([7, 10, 13, 16, 7]);
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
    expect(st.loans!.ana).toEqual({ principal: 2000, interest: 280, paid: 0, takenRound: 1, dueRound: 13, firstRound: 4, rate: 0.14, plan: 'x4', parcels: [570, 570, 570, 570], parcelsPaid: 0 });
    expect(bal(st, 'ana')).toBe(27000);
    expect(nextParcel(st.loans!.ana)).toEqual({ n: 1, of: 4, amount: 570, round: 4 });
    expect(n(st.tx[0].reason)).toBe('Empréstimo do banco em 4x a 14%: 4 parcelas semestrais de $ 570, rodadas 4 a 13 (total $ 2.280)');
    expect(() => act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x9' as never })).toThrow(/Plano/);
  });

  it('nada é cobrado na rodada em que pegou nem antes do semestre seguinte', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x3' });
    // dupla na mesma rodada: nenhuma cobrança
    st = act(act(st, 'ana', { type: 'land', idx: FERIADO }), 'ana', { type: 'endTurn', again: true });
    expect(st.loans!.ana.parcelsPaid).toBe(0);
    st = act(st, 'ana', { type: 'land', idx: FERIADO });
    st = act(st, 'ana', { type: 'endTurn', again: false });
    for (const r of [2, 3]) {
      st = toAna(st, r);
      expect(st.loans!.ana.parcelsPaid).toBe(0);
      expect(bal(st, 'ana')).toBe(27000);
    }
    // pego na rodada 3: a rodada 4 abre semestre, mas fica a menos de 2 rodadas; a 1ª é na rodada 7
    let late = toAna(game(), 3);
    late = act(late, 'ana', { type: 'takeLoan', amount: 2000, plan: 'x2' });
    expect(nextParcel(late.loans!.ana)!.round).toBe(7);
    late = toAna(late, 6);
    expect(late.loans!.ana.parcelsPaid).toBe(0);
    late = toAna(late, 7);
    expect(late.loans!.ana.parcelsPaid).toBe(1);
  });

  it('cobra uma parcela por semestre, no início da vez do jogador na rodada que abre o semestre', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x3' });
    st = toEve(st, 4);
    expect(st.loans!.ana.parcelsPaid).toBe(0);
    st = pass(st); // vez da Ana na rodada 4 (início do 2º semestre do ano 1): parcela 1
    expect(st.round).toBe(4);
    expect(bal(st, 'ana')).toBe(27000 - 750);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 750, kind: 'loanpay', reason: 'Parcela 1/3 do empréstimo' });
    expect(st.feed.find((f) => n(f.text) === 'Parcela 1/3 do empréstimo de Ana: $ 750')).toMatchObject({ important: true });
    expect(debtOf(st, 'ana')).toBe(1490);
    // a parcela não é cobrada de novo na mesma rodada (dupla não chama a próxima vez)
    st = act(act(st, 'ana', { type: 'land', idx: FERIADO }), 'ana', { type: 'endTurn', again: true });
    expect(st.loans!.ana.parcelsPaid).toBe(1);
    st = act(act(st, 'ana', { type: 'land', idx: FERIADO }), 'ana', { type: 'endTurn', again: false });
    st = toAna(st, 6);
    expect(st.loans!.ana.parcelsPaid).toBe(1);
    st = toAna(st, 7);
    expect(st.loans!.ana.parcelsPaid).toBe(2);
    st = toAna(st, 10);
    expect(st.loans!.ana).toBeUndefined();
    expect(st.tx[0]).toMatchObject({ amount: 740, reason: 'Parcela 3/3 do empréstimo' });
    expect(bal(st, 'ana')).toBe(27000 - 2240);
    expect(st.tx.filter((t) => t.kind === 'loanpay')).toHaveLength(3);
  });

  it('score: +10 por parcela paga com o saldo e +30 na quitação (5x dá no máximo +50 +30)', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x5' });
    st = toAna(st, 4);
    expect(creditOf(pl(st, 'ana'))).toBe(510);
    expect(pl(st, 'ana').creditLog![0]).toEqual({ delta: 10, reason: 'Parcela 1/5 do empréstimo paga em dia', round: 4 });
    // 5x precisa de 5 semestres: rodadas 4, 7, 10, 13 e 16
    st = toAna(st, 13);
    expect(st.loans!.ana.parcelsPaid).toBe(4);
    st = toAna(st, 16);
    expect(st.loans!.ana).toBeUndefined();
    expect(creditOf(pl(st, 'ana'))).toBe(500 + 5 * CREDIT.parcelPaid + CREDIT.parcelLoanPaid);
    expect(pl(st, 'ana').creditLog![0].reason).toBe('Empréstimo parcelado quitado');
  });

  it('sem saldo para a parcela: penhora só no valor da parcela, −100 e sem o bônus de quitação', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x2' });
    st = toEve(st, 4);
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
    st = toAna(st, 7);
    expect(st.loans!.ana).toBeUndefined();
    expect(creditOf(pl(st, 'ana'))).toBe(410);
  });

  it('se nem a penhora cobre a parcela, falência para o banco', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x2' });
    st = toEve(st, 4);
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
    while (!(st.round === 3 && st.turn === 2)) st = pass(st);
    st.players[0].balance = 0;
    st = pass(st);
    expect(pl(st, 'ana').out).toBe(true);
    expect(st.winner).toBeNull();
    expect(st.players[st.turn].id).toBe('beto');
  });

  it('quitação antecipada: paga todo o saldo restante, sem desconto de juros, +30', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x4' });
    st = toAna(st, 4);
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
    st = toEve(st, 4);
    const charged = pass(st);
    expect(charged.loans!.ana.parcelsPaid).toBe(1);
    const back = act(charged, 'beto', { type: 'undo' });
    expect(back.loans!.ana.parcelsPaid).toBe(0);
    expect(bal(back, 'ana')).toBe(27000);
  });
});

describe('pagamento único', () => {
  it('sem plano na ação é pagamento único: tudo no 2º início de semestre (rodada 7), pagamento parcial continua valendo', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    expect(st.loans!.ana).toMatchObject({ plan: 'unico', rate: 0.18, interest: 360, firstRound: 4, dueRound: 7 });
    expect(isParcelado(st.loans!.ana)).toBe(false);
    expect(nextParcel(st.loans!.ana)).toBeNull();
    st = act(st, 'ana', { type: 'payLoan', amount: 500 });
    expect(debtOf(st, 'ana')).toBe(1860);
    st = toAna(st, 4);
    expect(debtOf(st, 'ana')).toBe(1860); // o 1º início de semestre não cobra nada
    st = toAna(st, 6);
    expect(debtOf(st, 'ana')).toBe(1860);
    st = toAna(st, 7);
    expect(st.loans!.ana).toBeUndefined();
    expect(pl(st, 'ana').creditLog![0]).toMatchObject({ delta: CREDIT.loanPaid, reason: 'Empréstimo pago no vencimento' });
  });

  it('pagamento único vencido com penhora continua −200', () => {
    let st = act(give(game(), 'ana', [PAULISTA]), 'ana', { type: 'takeLoan', amount: 1000, plan: 'unico' });
    st = toEve(st, 7);
    st.players[0].balance = 500;
    st = pass(st);
    expect(creditOf(pl(st, 'ana'))).toBe(300);
  });

  it('empréstimo antigo sem plano se comporta como pagamento único (vence no próximo início de semestre)', () => {
    let st = game();
    st.loans = { ana: { principal: 2000, interest: 200, paid: 0, takenRound: 1, dueRound: 6, rate: 0.1 } };
    expect(isParcelado(st.loans.ana)).toBe(false);
    st = toAna(st, 3);
    expect(debtOf(st, 'ana')).toBe(2200);
    expect(st.loans!.ana).toMatchObject({ firstRound: 1, dueRound: 4 });
    st = act(st, 'ana', { type: 'payLoan', amount: 700 }); // parcial, como antes
    expect(debtOf(st, 'ana')).toBe(1500);
    st = toAna(st, 4);
    expect(st.loans!.ana).toBeUndefined();
    expect(st.tx[0]).toMatchObject({ amount: 1500, reason: 'Cobrança do empréstimo vencido' });
  });
});

describe('salas antigas: cobrança por rodada → semestral', () => {
  /** Sala antiga na rodada 5, vez do Beto: Ana tem um 4x pego na rodada 3 (por rodada: parcelas nas rodadas 4 e 5 já pagas). */
  function oldRoom(): GameState {
    const st = game();
    st.round = 5;
    st.turn = 1;
    delete st.cal;
    for (const p of st.players) delete p.irYear;
    st.loans = { ana: { principal: 2000, interest: 280, paid: 1140, takenRound: 3, dueRound: 7, rate: 0.14, plan: 'x4', parcels: [570, 570, 570, 570], parcelsPaid: 2 } };
    st.fin = {
      [PAULISTA]: { owner: 'beto', idx: PAULISTA, what: 'terreno', price: 1600, entrada: 320, principal: 1280, interest: 0, paid: 0, takenRound: 4, dueRound: 9, plan: 'unico' },
    };
    st.props[PAULISTA] = { owner: 'beto', houses: 0, mortgaged: false, round: 4 };
    return st;
  }

  it('as parcelas que faltam passam para os próximos inícios de semestre, uma por semestre; o único vence no próximo', () => {
    const m = migrateState(oldRoom());
    expect(m.cal).toBe(1);
    expect(m.players.map((p) => p.irYear)).toEqual([0, 0]);
    expect(nextParcel(m.loans!.ana)).toMatchObject({ n: 3, round: 7 });
    expect(m.loans!.ana).toMatchObject({ firstRound: 1, dueRound: 10 });
    expect(m.fin![PAULISTA]).toMatchObject({ dueRound: 7 });
    // idempotente
    expect(migrateState(m)).toBe(m);
  });

  it('jogando a sala antiga: nada na rodada 6, parcela 3 e o financiamento na rodada 7, parcela 4 na rodada 10', () => {
    let st = pass(oldRoom()); // Beto passa: rodada 6, vez da Ana
    expect(st.round).toBe(6);
    expect(st.loans!.ana.parcelsPaid).toBe(2);
    st = toAna(st, 7);
    expect(st.loans!.ana.parcelsPaid).toBe(3);
    expect(st.fin?.[PAULISTA]).toBeDefined(); // Beto paga na vez dele
    st = pass(st);
    expect(st.fin?.[PAULISTA]).toBeUndefined();
    expect(st.tx.find((t) => t.kind === 'financiamento')).toMatchObject({ from: 'beto', amount: 1280 });
    st = toAna(st, 10);
    expect(st.loans!.ana).toBeUndefined();
  });
});
