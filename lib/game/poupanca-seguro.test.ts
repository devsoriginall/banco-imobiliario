// Poupança, seguro do imóvel, 3 duplas seguidas = detenção e financiamento na compra.
import { describe, expect, it } from 'vitest';
import { CREDIT, HEADLINES, INSURANCE } from './data';
import {
  applyAction,
  canMortgage,
  creditOf,
  equity,
  finBadge,
  financeBlock,
  financeOptions,
  finDebtOf,
  finOf,
  finsOf,
  incomeOf,
  insurancePremium,
  insureBlock,
  insuredUntil,
  loanLimit,
  netWorth,
  newRoom,
  propValue,
  savingsOf,
  savingsYield,
  tradeBlock,
  transfersFor,
} from './rules';
import type { Action, GameState } from './types';

const NOVE_JULHO = 1; // verde, $1.000, construção $500, hipoteca $500
const BRASIL = 2; // verde, $750
const PAULISTA = 26; // azul escuro, $1.600
const FERIADO = 20;
const JAIL = 10;

const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: () => 0.5 });
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const bal = (st: GameState, id: string) => pl(st, id).balance;
const n = (x: string) => x.replace(/\s/g, ' ');
const H = (tag: string) => HEADLINES.findIndex((h) => h.tag === tag);

function game(mercado = false): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  if (!mercado) st = act(st, 'ana', { type: 'setMercado', on: false });
  st = act(st, 'ana', { type: 'start' });
  st.bankRate = 0.1;
  st.hood = {};
  st.hoodMods = [];
  return st;
}
function give(st: GameState, owner: string, idxs: number[], houses = 0): GameState {
  const s = structuredClone(st);
  for (const i of idxs) s.props[i] = { owner, houses, mortgaged: false, ...(houses ? { tier: 'intermediaria' as const } : {}) };
  return s;
}
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
/** Passa até começar a vez da Ana na rodada `round`. */
function toAna(st: GameState, round: number): GameState {
  while (!(st.round === round && st.turn === 0)) st = pass(st);
  return st;
}
function forceHeadline(st: GameState, hi: number): GameState {
  const s = structuredClone(st);
  s.jornalDeck = [hi, ...HEADLINES.map((_, i) => i).filter((i) => i !== hi)];
  s.jornalPtr = 0;
  return s;
}

describe('salas antigas', () => {
  it('sem poupança, seguro, financiamentos ou contador de duplas: tudo começa vazio e funciona', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    for (const p of st.players) delete p.savings;
    delete st.fin;
    delete st.turnInfo.doubles;
    delete st.props[NOVE_JULHO].insuredUntil;
    expect(savingsOf(pl(st, 'ana'))).toBe(0);
    expect(finsOf(st, 'ana')).toEqual([]);
    expect(finDebtOf(st, 'ana')).toBe(0);
    expect(finOf(st, NOVE_JULHO)).toBeNull();
    expect(insuredUntil(st, NOVE_JULHO)).toBeNull();
    expect(netWorth(st, pl(st, 'ana'))).toBe(25000 + 1000);
    expect(equity(st, pl(st, 'ana'))).toBe(26000);
    expect(tradeBlock(st, NOVE_JULHO, 'ana')).toBeNull();
    expect(canMortgage(st, NOVE_JULHO, 'ana')).toBe(true);
    // jogar de novo e passar a vez seguem iguais
    st = act(st, 'ana', { type: 'land', idx: FERIADO });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    expect(st.turnInfo.doubles).toBe(1);
    st = act(st, 'ana', { type: 'deposit', amount: 500 });
    expect(savingsOf(pl(st, 'ana'))).toBe(500);
  });
});

describe('poupança', () => {
  it('depósito só na vez, em múltiplos de $ 100; resgate a qualquer momento', () => {
    let st = game();
    expect(() => act(st, 'beto', { type: 'deposit', amount: 100 })).toThrow(/vez de Ana/);
    expect(() => act(st, 'ana', { type: 'deposit', amount: 150 })).toThrow(/múltiplos/);
    expect(() => act(st, 'ana', { type: 'deposit', amount: 30000 })).toThrow(/Saldo insuficiente/);
    st = act(st, 'ana', { type: 'deposit', amount: 2000 });
    expect(bal(st, 'ana')).toBe(23000);
    expect(savingsOf(pl(st, 'ana'))).toBe(2000);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 2000, kind: 'poupanca', reason: 'Depósito na poupança' });
    // conta no patrimônio
    expect(netWorth(st, pl(st, 'ana'))).toBe(25000);
    st = pass(st); // vez do Beto
    // fora da vez, a Ana resgata (por exemplo, para pagar aluguel)
    st = act(st, 'ana', { type: 'withdraw', amount: 500 });
    expect(bal(st, 'ana')).toBe(23500);
    expect(savingsOf(pl(st, 'ana'))).toBe(1500);
    expect(st.tx[0]).toMatchObject({ from: 'bank', to: 'ana', amount: 500, kind: 'poupanca' });
    expect(() => act(st, 'ana', { type: 'withdraw', amount: 2000 })).toThrow(/1\.500 na poupança/);
    expect(() => act(st, 'ana', { type: 'withdraw', amount: 250 })).toThrow(/múltiplos/);
  });

  it('rende metade da taxa da rodada no início de cada vez sua, a $ 10, e conta como renda', () => {
    let st = game();
    st = act(st, 'ana', { type: 'deposit', amount: 1000 });
    st = pass(st); // vez do Beto: a Ana não rende
    expect(savingsOf(pl(st, 'ana'))).toBe(1000);
    st = pass(st); // rodada 2, vez da Ana
    const rate = st.bankRate!;
    const y = Math.round((1000 * rate * 0.5) / 10) * 10;
    expect(y).toBeGreaterThan(0);
    expect(savingsOf(pl(st, 'ana'))).toBe(1000 + y);
    expect(bal(st, 'ana')).toBe(24000); // o rendimento fica na poupança
    expect(incomeOf(pl(st, 'ana'))).toBe(y);
    const tx = st.tx.find((t) => t.kind === 'rendimento')!;
    expect(tx).toMatchObject({ from: 'bank', to: 'ana', amount: y });
    expect(st.feed.some((f) => n(f.text) === `Poupança de Ana rendeu $ ${y}`)).toBe(true);
  });

  it('rendimento arredondado a $ 10 (taxa de 15%: 7,5% de $ 1.300 = $ 97,50 → $ 100)', () => {
    const st = game();
    st.bankRate = 0.15;
    pl(st, 'ana').savings = 1300;
    expect(savingsYield(st, pl(st, 'ana'))).toBe(100);
    pl(st, 'ana').savings = 0;
    expect(savingsYield(st, pl(st, 'ana'))).toBe(0);
  });

  it('cobrança do banco tira da poupança antes de penhorar imóveis', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    st = act(st, 'ana', { type: 'takeLoan', amount: 2000, plan: 'unico' });
    const owed = st.loans!.ana.principal + st.loans!.ana.interest;
    pl(st, 'ana').balance = 300;
    pl(st, 'ana').savings = 5000;
    st = toAna(st, 6);
    expect(st.loans?.ana).toBeUndefined();
    expect(st.props[NOVE_JULHO]?.owner).toBe('ana'); // nada penhorado
    const y = st.tx.filter((t) => t.kind === 'rendimento' && t.to === 'ana').reduce((a, t) => a + t.amount, 0);
    expect(savingsOf(pl(st, 'ana')) + bal(st, 'ana')).toBe(5300 + y - owed);
    expect(st.tx.some((t) => t.kind === 'poupanca' && t.reason.startsWith('Cobrança do banco: resgate da poupança'))).toBe(true);
    expect(st.tx.some((t) => t.kind === 'penhora')).toBe(false);
  });

  it('na falência, a poupança vai ao credor junto com o saldo', () => {
    let st = game();
    pl(st, 'ana').balance = 100;
    pl(st, 'ana').savings = 500;
    st = act(st, 'ana', { type: 'bankrupt', debtor: 'ana', creditor: 'beto' });
    expect(bal(st, 'beto')).toBe(25600);
    expect(savingsOf(pl(st, 'ana'))).toBe(0);
  });
});

describe('seguro do imóvel', () => {
  it('prêmio de 5% do valor atual (terreno + casas), só na sua vez, cobre 10 rodadas', () => {
    let st = give(game(true), 'ana', [NOVE_JULHO], 2);
    st.hood = {};
    st.hoodMods = [];
    expect(propValue(st, NOVE_JULHO)).toBe(1000 + 2 * 500);
    expect(insurancePremium(st, NOVE_JULHO)).toBe(100);
    expect(insureBlock(st, NOVE_JULHO, 'beto')).toBe('Não é seu');
    st = act(st, 'ana', { type: 'insure', idx: NOVE_JULHO });
    expect(bal(st, 'ana')).toBe(24900);
    expect(st.props[NOVE_JULHO].insuredUntil).toBe(st.round + INSURANCE.rounds - 1);
    expect(st.tx[0]).toMatchObject({ kind: 'seguro', amount: 100, from: 'ana', to: 'bank' });
    expect(insureBlock(st, NOVE_JULHO, 'ana')).toBe(`Já segurado até a rodada ${st.round + 9}`);
    expect(() => act(st, 'ana', { type: 'insure', idx: NOVE_JULHO })).toThrow(/já segurado/);
    // fora da vez, não
    const s2 = give(pass(st), 'ana', [BRASIL]);
    expect(insureBlock(s2, BRASIL, 'ana')).toBe('Só na sua vez');
  });

  it('manchete que desvaloriza o bairro paga ao dono segurado o valor perdido', () => {
    let st = give(game(true), 'ana', [NOVE_JULHO]);
    st = give(st, 'beto', [BRASIL]);
    st.hood = {};
    st.hoodMods = [];
    st = act(st, 'ana', { type: 'insure', idx: NOVE_JULHO });
    const anaBefore = bal(st, 'ana');
    const betoBefore = bal(st, 'beto');
    st = forceHeadline(pass(st), H('Assaltos')); // verde −15% por 3 rodadas
    st = pass(st); // rodada 2
    expect(st.jornal![0].h).toBe(H('Assaltos'));
    const ind = st.tx.filter((t) => t.kind === 'indenizacao');
    expect(ind).toHaveLength(1);
    expect(ind[0]).toMatchObject({ to: 'ana', amount: 150, space: NOVE_JULHO });
    expect(n(ind[0].reason)).toContain('de $ 1.000 para $ 850');
    // Beto não tinha seguro; o dinheiro dos dois só muda pela indenização
    expect(bal(st, 'beto')).toBe(betoBefore);
    expect(bal(st, 'ana')).toBe(anaBefore + 150);
    // indenização não é renda
    expect(incomeOf(pl(st, 'ana'))).toBe(0);
    const f = st.feed.find((x) => n(x.text).startsWith('Seguro: Ana recebeu $ 150'))!;
    expect(f.important).toBe(true);
  });

  it('manchete boa não paga nada; o seguro vence e pode ser renovado', () => {
    let st = give(game(true), 'ana', [NOVE_JULHO]);
    st = act(st, 'ana', { type: 'insure', idx: NOVE_JULHO });
    st = forceHeadline(pass(st), H('Calçadão novo')); // verde +10%
    st = pass(st);
    expect(st.tx.some((t) => t.kind === 'indenizacao')).toBe(false);
    // último dia do seguro: pode renovar e emenda 10 rodadas
    const until = st.props[NOVE_JULHO].insuredUntil!;
    const s = structuredClone(st);
    s.round = until;
    expect(insureBlock(s, NOVE_JULHO, 'ana')).toBeNull();
    const renewed = act(s, 'ana', { type: 'insure', idx: NOVE_JULHO });
    expect(renewed.props[NOVE_JULHO].insuredUntil).toBe(until + INSURANCE.rounds);
    // passou do prazo: vencido
    s.round = until + 1;
    expect(insuredUntil(s, NOVE_JULHO)).toBeNull();
  });

  it('seguro vencido não indeniza', () => {
    let st = give(game(true), 'ana', [NOVE_JULHO]);
    st.props[NOVE_JULHO].insuredUntil = st.round; // vence nesta rodada
    st = forceHeadline(pass(st), H('Assaltos'));
    st = pass(st);
    expect(st.jornal![0].h).toBe(H('Assaltos'));
    expect(st.tx.some((t) => t.kind === 'indenizacao')).toBe(false);
  });

  it('sem Jornal na sala, não há o que segurar', () => {
    const st = give(game(false), 'ana', [NOVE_JULHO]);
    expect(insureBlock(st, NOVE_JULHO, 'ana')).toMatch(/Sem o Jornal/);
  });
});

describe('3 duplas seguidas', () => {
  it('a 3ª dupla leva à detenção e passa a vez', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: FERIADO });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    expect(st.turnInfo.doubles).toBe(1);
    st = act(st, 'ana', { type: 'land', idx: FERIADO });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    expect(st.turnInfo.doubles).toBe(2);
    expect(st.feed[0].text).toBe('Ana tirou dupla e joga de novo (2ª seguida)');
    st = act(st, 'ana', { type: 'land', idx: JAIL });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    const ana = pl(st, 'ana');
    expect(ana.jailed).toBe(true);
    expect(ana.pos).toBe(JAIL);
    expect(st.players[st.turn].id).toBe('beto');
    expect(st.turnInfo.doubles).toBeUndefined();
    const f = st.feed.find((x) => x.text === 'Ana tirou 3 duplas seguidas e foi para a detenção')!;
    expect(f.important).toBe(true);
  });

  it('o contador zera quando a vez passa normalmente', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: FERIADO });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    st = act(st, 'ana', { type: 'land', idx: FERIADO });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    st = pass(st); // Ana passa a vez
    st = pass(st); // Beto
    expect(st.turnInfo.doubles).toBeUndefined();
    st = act(st, 'ana', { type: 'land', idx: JAIL });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    expect(st.turnInfo.doubles).toBe(1);
    expect(pl(st, 'ana').jailed).toBe(false);
  });
});

describe('financiamento na compra', () => {
  it('terreno: entrada de 20% pelo Pix e o resto nos planos do empréstimo', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    const opts = financeOptions(st, 'ana', 1000);
    expect(opts.map((o) => o.plan)).toEqual(['x2', 'x3', 'x4', 'x5', 'unico']);
    const x4 = opts.find((o) => o.plan === 'x4')!;
    expect(x4.rate).toBe(0.14);
    expect(x4.total).toBe(800 + 112);
    const pix = transfersFor(st, { type: 'buy', finance: 'x4' }, 'ana');
    expect(pix).toHaveLength(1);
    expect(pix[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 200, kind: 'financiamento', space: NOVE_JULHO });
    expect(n(pix[0].reason)).toContain('financia $ 800 a 14%');
    st = act(st, 'ana', { type: 'buy', finance: 'x4' });
    expect(bal(st, 'ana')).toBe(24800);
    expect(st.props[NOVE_JULHO].owner).toBe('ana');
    const f = finOf(st, NOVE_JULHO)!;
    expect(f).toMatchObject({ owner: 'ana', what: 'terreno', price: 1000, entrada: 200, principal: 800, interest: 112, plan: 'x4', parcels: [230, 230, 230, 222], parcelsPaid: 0 });
    expect(finBadge(f)).toBe('Financiado · faltam 4 parcelas');
    // a dívida sai do patrimônio líquido; o empréstimo continua disponível ao mesmo tempo
    expect(finDebtOf(st, 'ana')).toBe(912);
    expect(equity(st, pl(st, 'ana'))).toBe(24800 + 1000 - 912);
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = pass(st); // rodada 2: parcela 1
    expect(bal(st, 'ana')).toBe(24800 - 230);
    expect(finOf(st, NOVE_JULHO)!.parcelsPaid).toBe(1);
    expect(st.tx.some((t) => t.reason === 'Parcela 1/4 do financiamento da Av. 9 de Julho' && t.amount === 230)).toBe(true);
    expect(creditOf(pl(st, 'ana'))).toBe(CREDIT.start + CREDIT.parcelPaid);
    // até a última: quitado e o imóvel deixa de estar alienado
    st = toAna(st, 5);
    expect(finOf(st, NOVE_JULHO)).toBeNull();
    expect(bal(st, 'ana')).toBe(24800 - 912);
    expect(st.props[NOVE_JULHO].owner).toBe('ana');
    expect(creditOf(pl(st, 'ana'))).toBe(CREDIT.start + 4 * CREDIT.parcelPaid + CREDIT.parcelLoanPaid);
  });

  it('pede score a partir da faixa Regular e saldo para a entrada', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    pl(st, 'ana').credit = 299;
    expect(financeBlock(st, 'ana', 1000)).toMatch(/abaixo de 300/);
    expect(() => act(st, 'ana', { type: 'buy', finance: 'x2' })).toThrow(/não financia/);
    pl(st, 'ana').credit = 300;
    pl(st, 'ana').balance = 199;
    expect(() => act(st, 'ana', { type: 'buy', finance: 'x2' })).toThrow(/entrada de \$\s200/);
    pl(st, 'ana').balance = 200;
    st = act(st, 'ana', { type: 'buy', finance: 'x2' });
    expect(bal(st, 'ana')).toBe(0);
    expect(finOf(st, NOVE_JULHO)!.plan).toBe('x2');
  });

  it('não usa o limite do empréstimo: com o limite todo tomado, ainda dá para financiar', () => {
    let st = game();
    const limit = loanLimit(st, 'ana');
    st = act(st, 'ana', { type: 'takeLoan', amount: limit, plan: 'x2' });
    expect(loanLimit(st, 'ana')).toBe(0);
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x5' });
    expect(finOf(st, NOVE_JULHO)!.principal).toBe(800);
    expect(st.loans!.ana.principal).toBe(limit);
  });

  it('casa financiada: entrada de 20% do custo da construção', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    const pix = transfersFor(st, { type: 'build', idx: NOVE_JULHO, tier: 'basica', finance: 'unico' }, 'ana');
    expect(pix[0]).toMatchObject({ amount: 80, kind: 'financiamento', tier: 'basica' });
    st = act(st, 'ana', { type: 'build', idx: NOVE_JULHO, tier: 'basica', finance: 'unico' });
    expect(st.props[NOVE_JULHO]).toMatchObject({ houses: 1, tier: 'basica' });
    const f = finOf(st, NOVE_JULHO)!;
    expect(f).toMatchObject({ what: 'casa', price: 400, entrada: 80, principal: 320, plan: 'unico', dueRound: 6 });
    expect(f.parcels).toBeUndefined();
    expect(finBadge(f)).toBe('Financiado · falta 1 parcela');
    expect(bal(st, 'ana')).toBe(24920);
  });

  it('imóvel financiado não pode ser negociado nem hipotecado até quitar; quitação antecipada libera', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x3' });
    expect(tradeBlock(st, NOVE_JULHO, 'ana')).toMatch(/alienada ao banco/);
    expect(() => act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: { money: 0, props: [NOVE_JULHO], shares: {} }, get: { money: 500, props: [], shares: {} } })).toThrow(/alienada/);
    expect(canMortgage(st, NOVE_JULHO, 'ana')).toBe(false);
    expect(() => act(st, 'ana', { type: 'mortgage', idx: NOVE_JULHO })).toThrow(/hipotecar/);
    const owed = finDebtOf(st, 'ana');
    expect(() => act(st, 'beto', { type: 'payFin', idx: NOVE_JULHO })).toThrow(/vez de Ana/);
    st = act(st, 'ana', { type: 'payFin', idx: NOVE_JULHO });
    expect(bal(st, 'ana')).toBe(24800 - owed);
    expect(finOf(st, NOVE_JULHO)).toBeNull();
    expect(creditOf(pl(st, 'ana'))).toBe(CREDIT.start + CREDIT.parcelLoanPaid);
    expect(tradeBlock(st, NOVE_JULHO, 'ana')).toBeNull();
    expect(canMortgage(st, NOVE_JULHO, 'ana')).toBe(true);
  });

  it('parcela sem saldo: usa a poupança e, se faltar, o banco retoma o próprio imóvel financiado', () => {
    let st = give(game(), 'ana', [BRASIL]);
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x2' });
    st = act(st, 'ana', { type: 'endTurn', again: false });
    pl(st, 'ana').balance = 100;
    pl(st, 'ana').savings = 200;
    st = pass(st); // rodada 2: parcela de $ 440 (800 + 10% = 880 em 2x)
    expect(st.props[NOVE_JULHO]).toBeUndefined(); // voltou ao banco
    expect(finOf(st, NOVE_JULHO)).toBeNull();
    expect(st.props[BRASIL].owner).toBe('ana'); // o outro imóvel fica
    expect(pl(st, 'ana').out).toBe(false);
    expect(savingsOf(pl(st, 'ana'))).toBe(0); // a poupança foi usada primeiro
    expect(bal(st, 'ana')).toBe(300 + 10); // carteira + poupança + rendimento de 5% de $ 200, nada cobrado
    expect(creditOf(pl(st, 'ana'))).toBe(CREDIT.start + CREDIT.parcelPenhora);
    expect(st.feed.some((f) => f.important && f.text === 'Sem saldo para a parcela: o banco retomou a Av. 9 de Julho de Ana e cancelou o financiamento')).toBe(true);
  });

  it('retomada com casas: as construções são vendidas pela metade ao dono', () => {
    let st = game();
    st.props[PAULISTA] = { owner: 'ana', houses: 0, mortgaged: false };
    st = act(st, 'ana', { type: 'land', idx: PAULISTA });
    st = act(st, 'ana', { type: 'build', idx: PAULISTA, tier: 'intermediaria', finance: 'x2' }); // $ 1.000, entrada $ 200
    st = act(st, 'ana', { type: 'endTurn', again: false });
    pl(st, 'ana').balance = 0;
    st = pass(st);
    expect(st.props[PAULISTA]).toBeUndefined();
    expect(bal(st, 'ana')).toBe(500);
    expect(st.tx.some((t) => t.kind === 'penhora' && t.reason.startsWith('Retomada da Av. Paulista'))).toBe(true);
  });

  it('na falência, o imóvel financiado volta ao banco mesmo com credor jogador', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x2' });
    st = give(st, 'ana', [BRASIL]);
    st = act(st, 'ana', { type: 'bankrupt', debtor: 'ana', creditor: 'beto' });
    expect(st.props[NOVE_JULHO]).toBeUndefined();
    expect(finOf(st, NOVE_JULHO)).toBeNull();
    expect(st.props[BRASIL].owner).toBe('beto');
  });

  it('um financiamento por imóvel', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x5' });
    expect(financeBlock(st, 'ana', 400, NOVE_JULHO)).toMatch(/já tem um financiamento/);
  });
});
