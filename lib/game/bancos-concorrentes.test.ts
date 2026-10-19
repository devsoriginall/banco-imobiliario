// Bancos concorrentes: Aurora, Órbita e Horizonte no empréstimo e no financiamento, juros ao ano pelo prazo,
// manchetes que mexem na taxa de um banco e o lucro do Banco Aurora no dividendo.
import { describe, expect, it } from 'vitest';
import { AURORA, BANKS, HEADLINES, SHARES } from './data';
import {
  applyAction,
  auroraExtraPerShare,
  bankOffers,
  bankRate,
  bankSpread,
  debtOf,
  dividendPerShare,
  equity,
  finBadge,
  financeBlock,
  finOf,
  isAnnual,
  loanLimit,
  loanOptions,
  loanRate,
  loanRateFor,
  newRoom,
} from './rules';
import type { Action, GameState } from './types';

const NOVE_JULHO = 1; // verde, $1.000
const FERIADO = 20;
const BA = AURORA.idx;

const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: () => 0.5 });
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;

const H = (tag: string) => {
  const i = HEADLINES.findIndex((h) => h.tag === tag);
  if (i < 0) throw new Error(`manchete ${tag}`);
  return i;
};
const QUIET = H('Calçadão novo');

/** Sala com Ana e Beto; `mercado` liga o Jornal e a Bolsa. Taxa da rodada fixa em 12%. */
function game(mercado = false): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  if (!mercado) st = act(st, 'ana', { type: 'setMercado', on: false });
  st = act(st, 'ana', { type: 'start' });
  st.bankRate = 0.12;
  return st;
}
/** A próxima manchete do baralho será `hi`. */
function force(st: GameState, hi: number): GameState {
  const s = structuredClone(st);
  s.jornalDeck = [hi, ...HEADLINES.map((_, i) => i).filter((i) => i !== hi)];
  s.jornalPtr = 0;
  return s;
}
/** Quem está na vez para no Feriado e passa a vez (com o Jornal, a manchete da próxima rodada é `hi`). */
function pass(st: GameState, hi = QUIET): GameState {
  const id = st.players[st.turn].id;
  const s = st.settings.mercado === false ? st : force(st, hi);
  return act(act(s, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
function toAna(st: GameState, round: number): GameState {
  while (!(st.round === round && st.turn === 0)) st = pass(st);
  return st;
}

describe('taxa por banco e score mínimo', () => {
  it('score 500 (Regular): Aurora na Selic, Horizonte +4 pp, Órbita só a partir de 600', () => {
    const st = game();
    expect(loanRateFor(st, 'ana', 'x2', 'aurora')).toBe(0.12);
    expect(loanRateFor(st, 'ana', 'x2', 'horizonte')).toBe(0.16);
    expect(loanRateFor(st, 'ana', 'unico', 'aurora')).toBe(0.15);
    expect(loanLimit(st, 'ana', 'aurora')).toBe(12500);
    expect(loanLimit(st, 'ana', 'horizonte')).toBe(12500);
    expect(loanLimit(st, 'ana', 'orbita')).toBe(0);
    const offers = bankOffers(st, 'ana');
    expect(offers.map((o) => [o.id, o.rate, o.limit, o.block])).toEqual([
      ['aurora', 0.12, 12500, null],
      ['orbita', 0.11, 0, 'Score mínimo 600'],
      ['horizonte', 0.16, 12500, null],
    ]);
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: 2000, plan: 'x2', bank: 'orbita' })).toThrow(/abaixo de 600: o Banco Órbita não empresta/);
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: 2000, plan: 'x2', bank: 'nada' as never })).toThrow(/Banco inválido/);
  });

  it('score 700 (Bom): Órbita é o mais barato, com limite menor (fator 0,8)', () => {
    const st = game();
    pl(st, 'ana').credit = 700;
    expect(['aurora', 'orbita', 'horizonte'].map((b) => loanRateFor(st, 'ana', 'x2', b as never))).toEqual([0.1, 0.09, 0.14]);
    const eq = equity(st, pl(st, 'ana'));
    expect(loanLimit(st, 'ana', 'aurora')).toBe(Math.floor((eq * 0.7) / 500) * 500);
    expect(loanLimit(st, 'ana', 'orbita')).toBe(Math.floor((eq * 0.7 * 0.8) / 500) * 500);
    const lim = loanLimit(st, 'ana', 'orbita');
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: lim + 500, plan: 'x2', bank: 'orbita' })).toThrow(/limite é .* no Banco Órbita/);
    const taken = act(st, 'ana', { type: 'takeLoan', amount: 4000, plan: 'x2', bank: 'orbita' });
    expect(taken.loans!.ana).toMatchObject({ bank: 'orbita', rate: 0.09, interest: 360, parcels: [2180, 2180] });
    expect(taken.tx[0].reason).toContain('Empréstimo do Banco Órbita em 2x a 9% ao ano');
    // um empréstimo por vez, em qualquer banco
    expect(() => act(taken, 'ana', { type: 'takeLoan', amount: 1000, bank: 'horizonte' })).toThrow(/já tem/);
  });

  it('score 150: só o Horizonte empresta (Ruim +5 pp, limite 25%)', () => {
    const st = game();
    pl(st, 'ana').credit = 150;
    expect(bankOffers(st, 'ana').map((o) => o.block)).toEqual(['Score mínimo 200', 'Score mínimo 600', null]);
    expect(loanRateFor(st, 'ana', 'x2', 'horizonte')).toBe(0.21);
    expect(loanLimit(st, 'ana', 'horizonte')).toBe(6000);
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: 1000 })).toThrow(/Banco Aurora não empresta/);
    const ok = act(st, 'ana', { type: 'takeLoan', amount: 1000, plan: 'x2', bank: 'horizonte' });
    expect(ok.loans!.ana).toMatchObject({ bank: 'horizonte', rate: 0.21, interest: 210 });
  });

  it('constantes dos bancos', () => {
    expect(BANKS.map((b) => [b.id, b.spread, b.minScore, b.finMinScore, b.limit])).toEqual([
      ['aurora', 0, 200, 300, 1],
      ['orbita', -0.01, 600, 600, 0.8],
      ['horizonte', 0.04, 100, 200, 1],
    ]);
  });
});

describe('juros ao ano pelo prazo', () => {
  it('na mesma taxa, os juros do 5x são 2,5 vezes os do 2x (1 ano contra 2,5 anos)', () => {
    const st = game();
    const sim = loanOptions(st, 'ana', 10000, 'aurora');
    const by = Object.fromEntries(sim.map((o) => [o.plan, o]));
    expect(by.x2.rate).toBe(by.x5.rate);
    expect(by.x2.interest).toBe(1200);
    expect(by.x3.interest).toBe(1800);
    expect(by.x4.interest).toBe(2400);
    expect(by.x5.interest).toBe(3000);
    expect(by.x5.interest / by.x2.interest).toBe(2.5);
    // único: 2 semestres (1 ano) com +3 pp de risco
    expect(by.unico).toMatchObject({ rate: 0.15, interest: 1500, total: 11500 });
  });

  it('a taxa ao ano fica travada no empréstimo (o campo rate guarda a taxa ao ano)', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000, plan: 'x5', bank: 'horizonte' });
    expect(st.loans!.ana).toMatchObject({ rate: 0.16, interest: 800 });
    expect(isAnnual(st.loans!.ana)).toBe(true);
    st.bankRate = 0.2;
    st = toAna(st, 4);
    expect(st.loans!.ana).toMatchObject({ rate: 0.16, interest: 800, parcelsPaid: 1 });
  });
});

describe('salas antigas', () => {
  it('empréstimo sem banco nem taxa: juros guardados intocados, cobrado como antes', () => {
    let st = game();
    st.loans = { ana: { principal: 2000, interest: 200, paid: 0, takenRound: 1, dueRound: 7, firstRound: 4 } };
    expect(isAnnual(st.loans.ana)).toBe(false);
    expect(loanRate(st.loans.ana)).toBe(0.1);
    expect(debtOf(st, 'ana')).toBe(2200);
    st = toAna(st, 6);
    expect(st.loans!.ana).toMatchObject({ principal: 2000, interest: 200, paid: 0 });
    st = toAna(st, 7);
    expect(st.loans!.ana).toBeUndefined();
    expect(st.tx[0]).toMatchObject({ amount: 2200, reason: 'Cobrança do empréstimo vencido' });
  });

  it('financiamento antigo sem banco continua igual e sem o nome do banco no selo', () => {
    let st = game();
    st.props[NOVE_JULHO] = { owner: 'ana', houses: 0, mortgaged: false };
    st.fin = {
      [NOVE_JULHO]: {
        owner: 'ana',
        idx: NOVE_JULHO,
        what: 'terreno',
        price: 1000,
        entrada: 200,
        principal: 800,
        interest: 112,
        paid: 0,
        takenRound: 1,
        dueRound: 7,
        firstRound: 4,
        rate: 0.14,
        plan: 'x2',
        parcels: [460, 452],
        parcelsPaid: 0,
      },
    };
    expect(finBadge(st.fin[NOVE_JULHO])).toBe('Financiado · faltam 2 parcelas');
    st = toAna(st, 4);
    expect(finOf(st, NOVE_JULHO)).toMatchObject({ interest: 112, paid: 460, parcelsPaid: 1 });
    expect(st.tx.some((t) => t.reason === 'Parcela 1/2 do financiamento da Av. 9 de Julho')).toBe(true);
  });

  it('estado sem bankMods nem auroraProfit: taxas e dividendos normais', () => {
    const st = game(true);
    delete st.bankMods;
    delete st.auroraProfit;
    expect(bankSpread(st, 'orbita')).toBe(-0.01);
    expect(auroraExtraPerShare(st)).toBe(0);
  });
});

describe('Jornal mexe na taxa de um banco', () => {
  it('Promoção Órbita: −2 pp por 2 rodadas só no Órbita, depois acaba', () => {
    let st = game(true);
    pl(st, 'ana').credit = 700;
    st = pass(pass(st), H('Promoção Órbita')); // rodada 2
    expect(st.round).toBe(2);
    expect(st.bankMods).toEqual([{ bank: 'orbita', pp: -2, from: 2, until: 3, why: 'Promoção Órbita' }]);
    expect(bankSpread(st, 'orbita')).toBe(-0.03);
    expect(bankSpread(st, 'aurora')).toBe(0);
    expect(loanRateFor(st, 'ana', 'x2', 'orbita')).toBe(Math.round((bankRate(st) - 0.03 - 0.02) * 10000) / 10000);
    expect(st.jornal![0].effects).toEqual(['Taxa do Banco Órbita −2 pontos ao ano até a rodada 3']);
    expect(st.jornal![0].notes!.some((n) => n.sec === 'economia' && n.title === 'Banco Órbita baixa os juros')).toBe(true);
    st = pass(pass(st)); // rodada 3: ainda vale
    expect(bankSpread(st, 'orbita')).toBe(-0.03);
    st = pass(pass(st)); // rodada 4: acabou
    expect(st.round).toBe(4);
    expect(bankSpread(st, 'orbita')).toBe(-0.01);
    expect(st.bankMods).toBeUndefined();
    expect(st.feed.some((f) => f.text === 'Acabou o efeito na taxa do Banco Órbita: Promoção Órbita')).toBe(true);
  });

  it('Horizonte aperta +3 pp e o crédito imobiliário do Aurora −1 pp', () => {
    let st = pass(pass(game(true)), H('Horizonte aperta'));
    expect(bankSpread(st, 'horizonte')).toBe(0.07);
    st = pass(pass(st), H('Crédito imobiliário'));
    expect(bankSpread(st, 'horizonte')).toBe(0.07);
    expect(bankSpread(st, 'aurora')).toBe(-0.01);
  });
});

describe('lucro do Banco Aurora no dividendo', () => {
  it('os juros das parcelas pagas ao Aurora entram no dividendo anunciado e o acumulado zera', () => {
    let st = game(true);
    st.bankRate = 0.1;
    st = act(st, 'ana', { type: 'takeLoan', amount: 10000, plan: 'x2', bank: 'aurora' });
    const l = st.loans!.ana;
    expect(l).toMatchObject({ interest: 1000, parcels: [5500, 5500] });
    st = toAna(st, 4); // parcela 1: 5.500, dos quais 500 são juros (o principal não conta)
    expect(st.auroraProfit).toBe(500);
    // anúncio na rodada 6 (pagamento na 7): 30% de 500 ÷ 10 cotas = 15 → a $ 10 = 20 por cota
    expect(auroraExtraPerShare(st)).toBe(20);
    st = toAna(st, 6);
    const ann = st.stocks![BA].divAnnounced!;
    expect(ann.round).toBe(7);
    expect(ann.fromLoans).toBe(20);
    expect(ann.perShare).toBe(dividendPerShare(st, BA, 7) + 20);
    expect(st.auroraProfit).toBeUndefined();
    const other = st.stocks![8].divAnnounced!;
    expect(other.fromLoans).toBeUndefined();
    const note = st.jornal![0].notes!.find((n) => n.title === 'Banco Aurora lucra com os juros')!;
    expect(note.sec).toBe('bolsa');
    expect(note.text!.replace(/\s/g, ' ')).toBe('O dividendo inclui $ 20 por cota dos juros recebidos de empréstimos e financiamentos.');
    // quem tem cota do Aurora recebe o dividendo com o extra na rodada 7
    st.shares[BA] = { beto: 2 };
    st = pass(pass(st));
    expect(st.round).toBe(7);
    const div = st.tx.find((t) => t.kind === 'dividend' && t.to === 'beto' && t.space === BA)!;
    expect(div.amount).toBe(2 * ann.perShare);
  });

  it('juros pagos a outro banco não contam; quitação antecipada conta só a parte de juros', () => {
    let st = game(true);
    st.bankRate = 0.1;
    st = act(st, 'ana', { type: 'takeLoan', amount: 10000, plan: 'x2', bank: 'horizonte' });
    st = toAna(st, 4);
    expect(st.auroraProfit ?? 0).toBe(0);

    let q = game(true);
    q.bankRate = 0.1;
    q = act(q, 'ana', { type: 'takeLoan', amount: 4000, plan: 'x4', bank: 'aurora' }); // 10% × 2 anos = 800 de juros
    q = act(q, 'ana', { type: 'payLoan', amount: 4800 });
    expect(q.auroraProfit).toBe(800);
    expect(auroraExtraPerShare(q)).toBe(Math.round((800 * 0.3) / SHARES / 10) * 10);
  });

  it('sem a Bolsa, nada se acumula', () => {
    let st = game(false);
    st = act(st, 'ana', { type: 'takeLoan', amount: 4000, plan: 'x2' });
    st = act(st, 'ana', { type: 'payLoan', amount: debtOf(st, 'ana') });
    expect(st.auroraProfit).toBeUndefined();
  });
});

describe('financiamento com o banco escolhido', () => {
  it('Horizonte financia com score 250 (o Aurora pede 300); taxa e nome do banco no financiamento', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    pl(st, 'ana').credit = 250;
    expect(financeBlock(st, 'ana', 1000, undefined, 'aurora')).toMatch(/abaixo de 300/);
    expect(financeBlock(st, 'ana', 1000, undefined, 'orbita')).toBe('Score mínimo 600');
    expect(financeBlock(st, 'ana', 1000, undefined, 'horizonte')).toBeNull();
    expect(bankOffers(st, 'ana', 'fin', 1000).map((o) => [o.id, o.rate, o.block === null])).toEqual([
      ['aurora', 0.17, false],
      ['orbita', 0.16, false],
      ['horizonte', 0.21, true],
    ]);
    expect(() => act(st, 'ana', { type: 'buy', finance: 'x2' })).toThrow(/não financia/);
    st = act(st, 'ana', { type: 'buy', finance: 'x2', bank: 'horizonte' });
    const f = finOf(st, NOVE_JULHO)!;
    // 800 financiados a 21% ao ano por 1 ano
    expect(f).toMatchObject({ bank: 'horizonte', rate: 0.21, interest: 168, principal: 800, parcels: [480, 488] });
    expect(finBadge(f)).toBe('Financiado · Horizonte · faltam 2 parcelas');
    expect(st.tx[0].reason).toContain('Banco Horizonte financia $');
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = toAna(st, 4);
    expect(st.tx.some((t) => t.reason === 'Parcela 1/2 do financiamento da Av. 9 de Julho · Banco Horizonte')).toBe(true);
  });

  it('financiamento no Aurora soma os juros da parcela ao lucro do banco', () => {
    let st = game(true);
    st.bankRate = 0.1;
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x2', bank: 'aurora' });
    const f = finOf(st, NOVE_JULHO)!;
    expect(f).toMatchObject({ bank: 'aurora', interest: 80, parcels: [440, 440] });
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = toAna(st, 4);
    expect(st.auroraProfit).toBe(40);
  });
});
