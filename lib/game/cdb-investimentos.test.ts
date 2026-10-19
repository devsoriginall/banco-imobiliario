// Investimentos (CDB) por banco, carência opcional, IR do rendimento e o piso do empréstimo pessoal.
import { describe, expect, it } from 'vitest';
import { BANK_IDS, BANK_RATES, CALENDAR, CDB, CDB_RULES, CREDIT, HEADLINES, IR, LOAN, LOAN_PLANS } from './data';
import {
  applyAction,
  bestCdbAnnual,
  cdbAnnualRate,
  cdbBalance,
  cdbCdiShare,
  cdbFree,
  cdbFreeTotal,
  cdbLocks,
  cdbOf,
  cdbTotal,
  cdbTurnRate,
  cdiRate,
  equity,
  financeOptions,
  incomeOf,
  isIncome,
  loanOptions,
  loanRateFor,
  netWorth,
  newRoom,
  savingsAnnualRate,
  transfersFor,
} from './rules';
import type { Action, BankId, GameState } from './types';
import { moneyLines } from '../room/summary';

const NOVE_JULHO = 1; // verde, $1.000, hipoteca $500
const FERIADO = 20;

const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: () => 0.5 });
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const bal = (st: GameState, id: string) => pl(st, id).balance;
const n = (x: string) => x.replace(/\s/g, ' ');
const r10 = (x: number) => Math.round(x / 10) * 10;

function game(rate = 0.12): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  st = act(st, 'ana', { type: 'setMercado', on: false });
  st = act(st, 'ana', { type: 'start' });
  st.bankRate = rate;
  st.selic = rate;
  return st;
}
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
function toAna(st: GameState, round: number): GameState {
  while (!(st.round === round && st.turn === 0)) st = pass(st);
  return st;
}
function toEve(st: GameState, round: number): GameState {
  while (!(st.round === round - 1 && st.turn === 1)) st = pass(st);
  return st;
}

describe('taxas do CDB', () => {
  it('CDI = taxa do banco − 0,1 pp; Aurora 90%, Órbita 100%, Horizonte 115% do CDI; com carência +10% do CDI', () => {
    const st = game(0.12);
    expect(cdiRate(st)).toBe(0.119);
    expect(BANK_IDS.map((b) => CDB[b].cdi)).toEqual([0.9, 1, 1.15]);
    expect(BANK_IDS.map((b) => cdbCdiShare(b))).toEqual([0.9, 1, 1.15]);
    expect(BANK_IDS.map((b) => cdbCdiShare(b, true))).toEqual([1, 1.1, 1.25]);
    expect(BANK_IDS.map((b) => cdbAnnualRate(st, b))).toEqual([0.1071, 0.119, 0.1368]);
    expect(BANK_IDS.map((b) => cdbAnnualRate(st, b, true))).toEqual([0.119, 0.1309, 0.1488]);
    expect(cdbTurnRate(st, 'horizonte')).toBe(0.0228);
    expect(bestCdbAnnual(st)).toBe(0.1488);
    // segue o CDI de cada rodada
    st.bankRate = 0.2;
    expect(cdbAnnualRate(st, 'orbita')).toBe(0.199);
  });
});

describe('aplicação, rendimento e resgate', () => {
  it('aplica só na sua vez, em múltiplos de $ 100; o CDB entra no patrimônio', () => {
    let st = game();
    expect(() => act(st, 'beto', { type: 'cdbDeposit', bank: 'orbita', amount: 1000 })).toThrow(/vez de Ana/);
    expect(() => act(st, 'ana', { type: 'cdbDeposit', bank: 'orbita', amount: 150 })).toThrow(/múltiplos/);
    expect(() => act(st, 'ana', { type: 'cdbDeposit', bank: 'nada' as BankId, amount: 100 })).toThrow(/Banco inválido/);
    expect(() => act(st, 'ana', { type: 'cdbDeposit', bank: 'orbita', amount: 99900 })).toThrow(/Saldo insuficiente/);
    const w0 = netWorth(st, pl(st, 'ana'));
    st = act(st, 'ana', { type: 'cdbDeposit', bank: 'orbita', amount: 5000 });
    expect(bal(st, 'ana')).toBe(20000);
    expect(cdbOf(pl(st, 'ana'), 'orbita')).toEqual({ free: 5000 });
    expect(netWorth(st, pl(st, 'ana'))).toBe(w0);
    expect(equity(st, pl(st, 'ana'))).toBe(w0);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 5000, kind: 'cdbmov', reason: 'Aplicação no CDB · Banco Órbita' });
    expect(transfersFor(st, { type: 'cdbWithdraw', bank: 'orbita', amount: 100 }, 'ana')[0]).toMatchObject({ kind: 'cdbmov', reason: 'Resgate do CDB · Banco Órbita' });
  });

  it('rende no início de cada vez sua: saldo × taxa anual ÷ 6, a $ 10, fica no CDB e conta como renda no IR', () => {
    let st = game();
    st = act(st, 'ana', { type: 'cdbDeposit', bank: 'horizonte', amount: 5000 });
    st = pass(st); // vez do Beto: a Ana não rende
    expect(cdbBalance(pl(st, 'ana'), 'horizonte')).toBe(5000);
    st = pass(st); // rodada 2, vez da Ana
    const y = r10((5000 * 0.1368) / CALENDAR.roundsPerYear); // 114 → 110
    expect(y).toBe(110);
    expect(cdbBalance(pl(st, 'ana'), 'horizonte')).toBe(5110);
    expect(bal(st, 'ana')).toBe(20000);
    expect(incomeOf(pl(st, 'ana'))).toBe(110);
    const tx = st.tx.find((t) => t.kind === 'cdb')!;
    expect(tx).toMatchObject({ from: 'bank', to: 'ana', amount: 110, auto: true });
    expect(n(tx.reason)).toBe('Rendimento do CDB · Banco Horizonte: 2,28% de $ 5.000 (115% do CDI)');
    expect(st.feed.some((f) => n(f.text) === 'CDB de Ana rendeu $ 110')).toBe(true);
    // o rendimento da poupança continua isento; o do CDB conta
    expect(isIncome('cdb')).toBe(true);
    expect(isIncome('rendimento')).toBe(false);
    expect(isIncome('cdbmov')).toBe(false);
  });

  it('resgata o CDB livre a qualquer momento (múltiplos de $ 100 ou tudo)', () => {
    let st = game();
    st = act(st, 'ana', { type: 'cdbDeposit', bank: 'aurora', amount: 3000 });
    st = toAna(st, 2); // rendeu
    const have = cdbFree(pl(st, 'ana'), 'aurora', st.round);
    expect(have).toBeGreaterThan(3000);
    st = pass(st); // vez do Beto: a Ana resgata mesmo fora da vez
    expect(() => act(st, 'ana', { type: 'cdbWithdraw', bank: 'aurora', amount: 250 })).toThrow(/múltiplos/);
    expect(() => act(st, 'ana', { type: 'cdbWithdraw', bank: 'aurora', amount: have + 100 })).toThrow(/até/);
    expect(() => act(st, 'ana', { type: 'cdbWithdraw', bank: 'orbita', amount: 100 })).toThrow(/não tem CDB no Banco Órbita/);
    const b0 = bal(st, 'ana');
    st = act(st, 'ana', { type: 'cdbWithdraw', bank: 'aurora', amount: 1000 });
    expect(bal(st, 'ana')).toBe(b0 + 1000);
    st = act(st, 'ana', { type: 'cdbWithdraw', bank: 'aurora', amount: have - 1000 });
    expect(bal(st, 'ana')).toBe(b0 + have);
    expect(pl(st, 'ana').cdb).toBeUndefined();
  });
});

describe('carência', () => {
  it('com carência rende +10% do CDI e só libera 1 semestre depois (rodada do depósito + 3)', () => {
    let st = game();
    st = act(st, 'ana', { type: 'cdbDeposit', bank: 'horizonte', amount: 5000, lock: true });
    expect(cdbOf(pl(st, 'ana'), 'horizonte')).toEqual({ free: 0, locked: [{ amount: 5000, until: 1 + CDB_RULES.lockRounds }] });
    expect(st.tx[0].reason).toBe('Aplicação no CDB com carência · Banco Horizonte');
    expect(cdbFree(pl(st, 'ana'), 'horizonte', st.round)).toBe(0);
    expect(cdbTotal(pl(st, 'ana'))).toBe(5000);
    expect(() => act(st, 'ana', { type: 'cdbWithdraw', bank: 'horizonte', amount: 100 })).toThrow(/carência/);
    st = toAna(st, 2);
    const y = r10((5000 * 0.1488) / CALENDAR.roundsPerYear); // 124 → 120
    expect(cdbOf(pl(st, 'ana'), 'horizonte').locked).toEqual([{ amount: 5000 + y, until: 4 }]);
    expect(n(st.tx.find((t) => t.kind === 'cdb')!.reason)).toBe('Rendimento do CDB com carência · Banco Horizonte: 2,48% de $ 5.000 (125% do CDI)');
    // na rodada 3 ainda está presa, mesmo fora da vez
    st = toAna(st, 3);
    expect(cdbLocks(pl(st, 'ana'), 'horizonte', st.round)).toHaveLength(1);
    st = pass(st);
    expect(() => act(st, 'ana', { type: 'cdbWithdraw', bank: 'horizonte', amount: 100 })).toThrow(/carência/);
    // rodada 4: rende a última vez com carência e vira saldo livre
    st = pass(st);
    expect(st.round).toBe(4);
    const c = cdbOf(pl(st, 'ana'), 'horizonte');
    expect(c.locked).toBeUndefined();
    expect(c.free).toBe(cdbBalance(pl(st, 'ana'), 'horizonte'));
    expect(st.tx.filter((t) => t.kind === 'cdb' && t.reason.includes('com carência'))).toHaveLength(3);
    st = act(st, 'ana', { type: 'cdbWithdraw', bank: 'horizonte', amount: c.free });
    expect(pl(st, 'ana').cdb).toBeUndefined();
  });

  it('carência vencida pode ser resgatada antes da vez do dono (na rodada da liberação)', () => {
    let st = game();
    st = pass(st); // vez do Beto na rodada 1
    st = act(st, 'beto', { type: 'cdbDeposit', bank: 'orbita', amount: 1000, lock: true });
    st = toAna(st, 4); // a vez da Ana na rodada 4 vem antes da do Beto
    expect(cdbFree(pl(st, 'beto'), 'orbita', st.round)).toBe(cdbBalance(pl(st, 'beto'), 'orbita'));
    const all = cdbBalance(pl(st, 'beto'), 'orbita');
    st = act(st, 'beto', { type: 'cdbWithdraw', bank: 'orbita', amount: all });
    expect(pl(st, 'beto').cdb).toBeUndefined();
  });
});

describe('cobrança do banco e falência', () => {
  it('cobrança: carteira, poupança, CDB livre e só depois penhora; a carência fica', () => {
    let st = game();
    st = act(st, 'ana', { type: 'takeLoan', amount: 2000, plan: 'unico' });
    st.props[NOVE_JULHO] = { owner: 'ana', houses: 0, mortgaged: false };
    const owed = st.loans!.ana.principal + st.loans!.ana.interest;
    const a = pl(st, 'ana');
    a.balance = 300;
    a.savings = 500;
    a.cdb = { aurora: { free: 1000 }, horizonte: { free: 5000, locked: [{ amount: 9000, until: 99 }] } };
    st = toAna(st, 7);
    expect(st.loans?.ana).toBeUndefined();
    expect(st.props[NOVE_JULHO]?.owner).toBe('ana'); // nada penhorado
    expect(st.tx.some((t) => t.kind === 'penhora')).toBe(false);
    const p = pl(st, 'ana');
    expect(p.savings ?? 0).toBe(0);
    expect(cdbBalance(p, 'aurora')).toBe(0);
    expect(cdbLocks(p, 'horizonte', st.round)[0].amount).toBeGreaterThan(9000); // carência intocada (rendendo)
    expect(st.tx.some((t) => t.kind === 'cdbmov' && t.reason.startsWith('Cobrança do banco: resgate do CDB · Banco Aurora'))).toBe(true);
    expect(st.tx.some((t) => t.kind === 'cdbmov' && t.reason.startsWith('Cobrança do banco: resgate do CDB · Banco Horizonte'))).toBe(true);
    expect(owed).toBeGreaterThan(1800);
  });

  it('com o CDB preso na carência, a penhora vem antes (mas o CDB conta no patrimônio)', () => {
    let st = game();
    st = act(st, 'ana', { type: 'takeLoan', amount: 2000, plan: 'unico' });
    st.props[NOVE_JULHO] = { owner: 'ana', houses: 0, mortgaged: false };
    const a = pl(st, 'ana');
    a.balance = 2000;
    a.cdb = { orbita: { free: 0, locked: [{ amount: 9000, until: 99 }] } };
    expect(netWorth(st, a)).toBe(2000 + 9000 + 1000);
    st = toAna(st, 7);
    expect(st.props[NOVE_JULHO]).toBeUndefined(); // penhorada
    expect(cdbLocks(pl(st, 'ana'), 'orbita', st.round)).toHaveLength(1);
  });

  it('parcela do financiamento também tira do CDB livre antes de retomar o imóvel', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x2', bank: 'aurora' });
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = toEve(st, 4);
    pl(st, 'ana').balance = 0;
    pl(st, 'ana').cdb = { orbita: { free: 3000 } };
    st = pass(st);
    expect(st.props[NOVE_JULHO]?.owner).toBe('ana');
    expect(st.tx.some((t) => t.kind === 'cdbmov' && t.reason.startsWith('Cobrança do banco: resgate do CDB · Banco Órbita'))).toBe(true);
  });

  it('na falência, todos os CDBs (com carência também) vão ao credor junto com o saldo', () => {
    let st = game();
    const a = pl(st, 'ana');
    a.balance = 100;
    a.cdb = { aurora: { free: 400 }, horizonte: { free: 0, locked: [{ amount: 1000, until: 99 }] } };
    st = act(st, 'ana', { type: 'bankrupt', debtor: 'ana', creditor: 'beto' });
    expect(bal(st, 'beto')).toBe(25000 + 1500);
    expect(pl(st, 'ana').cdb).toBeUndefined();
    expect(cdbTotal(pl(st, 'ana'))).toBe(0);
  });
});

describe('resumo da rodada', () => {
  it('o rendimento do CDB fica no CDB (não mexe na carteira) e é agrupado', () => {
    let st = game();
    st = act(st, 'ana', { type: 'cdbDeposit', bank: 'horizonte', amount: 5000 });
    st = act(st, 'ana', { type: 'cdbDeposit', bank: 'aurora', amount: 5000, lock: true });
    const since = st.txCount;
    st = toAna(st, 2);
    const txs = st.tx.filter((t) => t.seq > since && t.to === 'ana' && t.kind === 'cdb');
    expect(txs).toHaveLength(2);
    const { entrou } = moneyLines(st, 'ana', txs);
    expect(entrou).toEqual([{ text: 'Rendimento do CDB (fica no CDB)', amount: txs.reduce((x, t) => x + t.amount, 0), savings: true }]);
  });
});

describe('salas antigas', () => {
  it('jogador sem o campo cdb: tudo zero, o turno passa e dá para aplicar', () => {
    let st = game();
    for (const p of st.players) delete p.cdb;
    expect(cdbTotal(pl(st, 'ana'))).toBe(0);
    expect(cdbFreeTotal(pl(st, 'ana'), st.round)).toBe(0);
    expect(cdbOf(pl(st, 'ana'), 'aurora')).toEqual({ free: 0 });
    expect(netWorth(st, pl(st, 'ana'))).toBe(25000);
    st = pass(pass(st));
    expect(st.tx.some((t) => t.kind === 'cdb')).toBe(false);
    st = act(st, 'ana', { type: 'cdbDeposit', bank: 'orbita', amount: 100 });
    expect(cdbTotal(pl(st, 'ana'))).toBe(100);
  });
});

describe('empréstimo pessoal x financiamento', () => {
  it('o empréstimo pessoal soma 5 pp; o financiamento fica na taxa de antes', () => {
    const st = game(0.12);
    expect(LOAN.personalSpread).toBe(0.05);
    expect(loanRateFor(st, 'ana', 'x2', 'aurora')).toBe(0.17);
    expect(loanRateFor(st, 'ana', 'x2', 'aurora', 'fin')).toBe(0.12);
    expect(loanRateFor(st, 'ana', 'unico', 'aurora', 'fin')).toBe(0.15);
    expect(loanRateFor(st, 'ana', 'unico', 'aurora')).toBe(0.2);
    // a simulação do financiamento usa a taxa sem o spread pessoal
    const fin = financeOptions(st, 'ana', 1250, 'aurora'); // financia 1.000
    const loan = loanOptions(st, 'ana', 1000, 'aurora');
    expect(fin.find((o) => o.plan === 'x2')).toMatchObject({ rate: 0.12, interest: 120 });
    expect(loan.find((o) => o.plan === 'x2')).toMatchObject({ rate: 0.17, interest: 170 });
    // e o financiamento pego guarda essa taxa
    let s = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    s = act(s, 'ana', { type: 'buy', finance: 'x2', bank: 'aurora' });
    expect(s.fin![NOVE_JULHO]).toMatchObject({ rate: 0.12, interest: 96 }); // 800 × 12%
  });
});

describe('pegar emprestado para aplicar nunca compensa', () => {
  const rates = [...new Set(BANK_RATES.options.flatMap((r) => [r, r - 0.02, r + 0.02]).filter((r) => r >= BANK_RATES.minLoanRate).map((r) => Math.round(r * 10000) / 10000))];
  const bankHeadlines = HEADLINES.flatMap((h) => h.effects.filter((e) => e.k === 'bank')) as { bank: BankId; pp: number }[];
  const modSets = [[], ...bankHeadlines.map((e) => [e]), bankHeadlines];
  const scores = [0, 100, 150, 200, 250, 300, 450, 600, 700, 800, 900, 1000];

  it('taxa do empréstimo pessoal > melhor CDB líquido + 1 ponto e > poupança + 1 ponto (todas as Selic × scores × bancos × manchetes)', () => {
    let checked = 0;
    for (const rate of rates)
      for (const mods of modSets) {
        const st = game(rate);
        st.bankMods = mods.map((m) => ({ bank: m.bank, pp: m.pp, from: 1, until: 9, why: 'teste' }));
        const bestNet = bestCdbAnnual(st) * (1 - IR.rate);
        for (const score of scores) {
          pl(st, 'ana').credit = score;
          for (const bank of BANK_IDS)
            for (const plan of [undefined, ...LOAN_PLANS.map((p) => p.id)]) {
              const r = loanRateFor(st, 'ana', plan, bank);
              expect(r).toBeGreaterThan(bestNet + BANK_RATES.overSavings);
              expect(r).toBeGreaterThan(savingsAnnualRate(st) + BANK_RATES.overSavings);
              checked++;
            }
        }
      }
    expect(checked).toBeGreaterThan(5000);
    expect(CREDIT.max).toBe(1000);
  });

  it('simulação: pegar $ 10.000 e deixar no melhor CDB com carência até pagar dá prejuízo, mesmo sem a isenção do IR', () => {
    // pior caso para o banco: o CDB rende a cada vez (juros sobre juros) e o IR é 15% de todo o rendimento
    for (const rate of rates)
      for (const plan of LOAN_PLANS.map((p) => p.id))
        for (const taken of [1, 2, 3]) {
          const st = game(rate);
          st.round = taken; // pego na rodada 1, 2 ou 3 do semestre (o único vence 5 a 7 rodadas depois)
          pl(st, 'ana').credit = 1000;
          const bank = BANK_IDS.reduce((a, b) => (loanRateFor(st, 'ana', plan, b) < loanRateFor(st, 'ana', plan, a) ? b : a));
          const o = loanOptions(st, 'ana', 10000, bank).find((x) => x.plan === plan)!;
          const g = 1 + (bestCdbAnnual(st) / CALENDAR.roundsPerYear) * (1 - IR.rate);
          // dinheiro no CDB: rende a cada vez; paga cada cobrança na rodada dela
          let cdb = 10000;
          let round = taken;
          const due = o.rounds;
          o.parcels.forEach((amount, k) => {
            cdb *= Math.pow(g, due[k] - round);
            round = due[k];
            cdb -= amount;
          });
          expect(cdb).toBeLessThan(0);
        }
  });
});
