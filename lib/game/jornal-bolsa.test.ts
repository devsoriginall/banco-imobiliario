// Jornal da Cidade (uma manchete por rodada) e Bolsa (cotações, dividendos, venda à empresa e gerência).
import { describe, expect, it } from 'vitest';
import { COMPANY_IDX, DECISIONS, HEADLINES, HOOD, SHARE_PRICE, STOCK } from './data';
import {
  applyAction,
  dividendYield,
  editionsAbout,
  equity,
  feeTotal,
  hoodBase,
  hoodMult,
  hoodTags,
  hoodText,
  incomeOf,
  manageBlock,
  netWorth,
  newRoom,
  priceChange,
  sharePrice,
  stockEffects,
  transfersFor,
} from './rules';
import type { Action, GameState } from './types';

const BANCO_AURORA = 3;
const HORIZONTE = 8;
const VOX = 29;
const FERIADO = 20;
const NOVE_JULHO = 1; // verde

const now = new Date('2026-01-01T12:00:00Z');
const half = () => 0.5;
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: half });

/** Índice da manchete pelo nome curto (tag). */
const H = (tag: string, nth = 0) => {
  const all = HEADLINES.map((h, i) => (h.tag === tag ? i : -1)).filter((i) => i >= 0);
  if (all[nth] === undefined) throw new Error(`manchete ${tag}`);
  return all[nth];
};
/** Uma manchete sem efeito na Bolsa nem nos juros (para isolar a variação das cotações). */
const QUIET = H('Calçadão novo');

function game(players = ['Ana', 'Beto']): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  for (const n of players.slice(1)) st = act(st, n.toLowerCase(), { type: 'join', name: n });
  return act(st, 'ana', { type: 'start' });
}
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const bal = (st: GameState, id: string) => pl(st, id).balance;
/** Quem está na vez para no Feriado e passa a vez. */
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
/** Passa a vez até começar a próxima rodada; `next` força a manchete da rodada nova. */
function nextRound(st: GameState, next?: number): GameState {
  const r = st.round;
  if (next !== undefined) st = forceHeadline(st, next);
  while (st.round === r) st = pass(st);
  return st;
}
/** A próxima manchete do baralho será `hi`. */
function forceHeadline(st: GameState, hi: number): GameState {
  const s = structuredClone(st);
  s.jornalDeck = [hi, ...HEADLINES.map((_, i) => i).filter((i) => i !== hi)];
  s.jornalPtr = 0;
  return s;
}
function giveShares(st: GameState, i: number, owners: Record<string, number>): GameState {
  const s = structuredClone(st);
  s.shares[i] = { ...owners };
  return s;
}
function setPrice(st: GameState, i: number, price: number): GameState {
  const s = structuredClone(st);
  s.stocks![i] = { ...s.stocks![i], price, hist: [...s.stocks![i].hist, price] };
  return s;
}
/** Ana na vez, no começo da jogada. */
function anaTurn(st: GameState): GameState {
  while (st.turn !== 0) st = pass(st);
  return st;
}

describe('Jornal da Cidade', () => {
  it('a partida começa com a edição 1 e cada rodada nova traz uma edição', () => {
    let st = game();
    expect(st.jornal).toHaveLength(1);
    expect(st.jornal![0].round).toBe(1);
    expect(st.jornal![0].effects.length).toBeGreaterThan(0);
    st = nextRound(st);
    expect(st.jornal).toHaveLength(2);
    expect(st.jornal![0].round).toBe(2);
    expect(st.feed.some((f) => f.text.startsWith('Jornal da Cidade, edição 2:'))).toBe(true);
  });

  it('o sorteio é determinístico: o mesmo estado chega à mesma manchete e às mesmas cotações', () => {
    const st = game();
    const a = nextRound(st);
    const b = nextRound(structuredClone(st));
    expect(a.jornal).toEqual(b.jornal);
    expect(a.stocks).toEqual(b.stocks);
    // desfazer e refazer a jogada que virou a rodada não sorteia de novo
    let x = pass(st); // Ana passa
    const id = x.players[x.turn].id;
    x = act(x, id, { type: 'land', idx: FERIADO });
    const y = act(x, id, { type: 'endTurn', again: false });
    const redo = act(act(y, id, { type: 'undo' }), id, { type: 'endTurn', again: false });
    expect(redo.jornal![0]).toEqual(y.jornal![0]);
    expect(redo.stocks).toEqual(y.stocks);
  });

  it('não repete manchete até acabar o baralho; depois embaralha de novo', () => {
    let st = game();
    while (st.round < HEADLINES.length) st = nextRound(st);
    const seen = st.jornal!.map((e) => e.h);
    expect(seen).toHaveLength(HEADLINES.length);
    expect(new Set(seen).size).toBe(HEADLINES.length);
    const last = st.jornal![0].h;
    st = nextRound(st);
    expect(st.jornal![0].h).not.toBe(last);
    expect(st.jornalPtr).toBe(1);
  });

  it('bairro permanente usa a valorização (applyNeighbourhoodChange) e fica para sempre', () => {
    let st = nextRound(game(), H('Metrô'));
    expect(hoodBase(st, 'vermelho')).toBe(1.2);
    expect(hoodMult(st, 'vermelho')).toBe(1.2);
    expect(st.jornal![0].effects[0]).toContain('Bairro Vermelho +20% para sempre');
    for (let k = 0; k < 4; k++) st = nextRound(st, QUIET);
    expect(hoodMult(st, 'vermelho')).toBe(1.2);
  });

  it('bairro temporário vale por N rodadas e expira; o multiplicador efetivo é permanente × temporário', () => {
    let st = game();
    st.hood = { verde: 1.2 };
    st = nextRound(st, H('Assaltos')); // rodada 2: −15% por 3 rodadas (2, 3 e 4)
    expect(st.round).toBe(2);
    expect(hoodBase(st, 'verde')).toBe(1.2);
    expect(hoodMult(st, 'verde')).toBe(1.02);
    expect(st.jornal![0].effects[0]).toContain('Bairro Verde −15% até a rodada 4');
    expect(hoodTags(st, 'verde').map((t) => t.text)).toEqual(['Bairro valorizado +20%', 'Assaltos −15% até a rodada 4']);
    expect(hoodText(st, 'verde')).toBe('Bairro valorizado +20% · Assaltos −15% até a rodada 4');
    st = nextRound(st, QUIET); // o calçadão também é do verde (+10% permanente)
    st = nextRound(st, H('Metrô'));
    expect(st.round).toBe(4);
    expect(hoodMult(st, 'verde')).toBe(Math.round(1.3 * 0.85 * 10000) / 10000);
    expect(hoodTags(st, 'verde')[1].text).toBe('Assaltos −15% só nesta rodada');
    st = nextRound(st, H('Metrô'));
    expect(hoodMult(st, 'verde')).toBe(1.3);
    expect(st.hoodMods).toEqual([]);
    expect(st.feed.some((f) => f.text.includes('Acabou o efeito no bairro verde: Assaltos'))).toBe(true);
  });

  it('festival de 1 rodada sobe o aluguel só naquela rodada', () => {
    let st = nextRound(game(), H('Festival'));
    expect(hoodMult(st, 'azulescuro')).toBe(1.1);
    expect(st.jornal![0].effects[0]).toContain('só nesta rodada');
    st = nextRound(st, QUIET);
    expect(hoodMult(st, 'azulescuro')).toBe(1);
  });

  it('o multiplicador efetivo respeita os limites do bairro', () => {
    let st = game();
    st.hood = { amarelo: HOOD.max };
    st = nextRound(st, H('Réveillon'));
    expect(hoodMult(st, 'amarelo')).toBe(HOOD.max);
  });

  it('escândalo derruba a cota da empresa (−25% mais a variação do mercado)', () => {
    const st = nextRound(game(), H('Escândalo'));
    const p = sharePrice(st, BANCO_AURORA);
    expect(p).toBeGreaterThanOrEqual(140);
    expect(p).toBeLessThanOrEqual(160);
    expect(priceChange(st, BANCO_AURORA)).toBeLessThan(-0.15);
    expect(editionsAbout(st, BANCO_AURORA)[0].round).toBe(2);
    expect(editionsAbout(st, VOX)).toHaveLength(0);
  });

  it('aquisição sobe a cota +30% e lançamento +20%', () => {
    const a = nextRound(game(), H('Aquisição'));
    expect(sharePrice(a, VOX)).toBeGreaterThanOrEqual(250);
    expect(sharePrice(a, VOX)).toBeLessThanOrEqual(270);
    const b = nextRound(game(), H('Lançamento de sucesso'));
    expect(sharePrice(b, 22)).toBeGreaterThanOrEqual(230);
    expect(sharePrice(b, 22)).toBeLessThanOrEqual(250);
  });

  it('greve zera o dividendo por 2 rodadas', () => {
    let st = giveShares(game(), HORIZONTE, { ana: 3 });
    st = nextRound(st, H('Greve'));
    expect(dividendYield(st, HORIZONTE)).toBe(0);
    expect(st.tx.some((t) => t.kind === 'dividend' && t.space === HORIZONTE)).toBe(false);
    st = nextRound(st, QUIET);
    expect(dividendYield(st, HORIZONTE)).toBe(0);
    st = nextRound(st, QUIET);
    expect(dividendYield(st, HORIZONTE)).toBe(STOCK.yield);
    expect(st.tx.some((t) => t.kind === 'dividend' && t.space === HORIZONTE && t.round === st.round)).toBe(true);
  });

  it('lucro recorde aumenta o dividendo e feriadão aumenta a taxa da casa', () => {
    const a = nextRound(game(), H('Lucro recorde'));
    expect(dividendYield(a, BANCO_AURORA)).toBe(0.05);
    expect(stockEffects(a, BANCO_AURORA)[0]).toContain('dividendo +2 pontos até a rodada 3');
    let b = nextRound(game(), H('Feriadão'));
    const price = sharePrice(b, HORIZONTE);
    expect(feeTotal(b, HORIZONTE, 7)).toBe(Math.round((7 * 500 * (price / 200) * 1.5) / 10) * 10);
    b = nextRound(b, QUIET);
    b = nextRound(b, QUIET);
    expect(feeTotal(b, HORIZONTE, 7)).toBe(Math.round((7 * 500 * (sharePrice(b, HORIZONTE) / 200)) / 10) * 10);
  });

  it('juros sobem ou caem 2 pontos só naquela rodada', () => {
    const base = game();
    const off = structuredClone(base);
    off.settings.mercado = false;
    const drawn = nextRound(off).bankRate!;
    expect(nextRound(base, H('Juros sobem')).bankRate).toBeCloseTo(drawn + 0.02, 6);
    expect(nextRound(base, H('Juros caem')).bankRate).toBeCloseTo(Math.max(0.02, drawn - 0.02), 6);
  });

  it('mercado em alta/baixa move todas as cotas e o boom valoriza todos os bairros para sempre', () => {
    const up = nextRound(game(), H('Mercado em alta'));
    const down = nextRound(game(), H('Mercado em baixa'));
    for (const i of COMPANY_IDX) {
      expect(sharePrice(up, i)).toBeGreaterThanOrEqual(210);
      expect(sharePrice(up, i)).toBeLessThanOrEqual(230);
      expect(sharePrice(down, i)).toBeGreaterThanOrEqual(170);
      expect(sharePrice(down, i)).toBeLessThanOrEqual(190);
    }
    const g0 = game();
    const boom = nextRound(g0, H('Boom imobiliário'));
    for (const g of ['verde', 'vermelho', 'azulclaro', 'roxo', 'azulescuro', 'laranja', 'amarelo'] as const) expect(hoodBase(boom, g)).toBeCloseTo(hoodBase(g0, g) + 0.05, 6);
    const crise = nextRound(game(), H('Crise imobiliária'));
    expect(hoodMult(crise, 'roxo')).toBeCloseTo(hoodBase(crise, 'roxo') * 0.9, 4);
  });
});

describe('Bolsa', () => {
  it('cotações começam em $ 200 e variam até 5% por rodada, em múltiplos de $ 10, com histórico curto', () => {
    let st = game();
    for (const i of COMPANY_IDX) expect(sharePrice(st, i)).toBe(SHARE_PRICE);
    for (let k = 0; k < 20; k++) {
      const before = Object.fromEntries(COMPANY_IDX.map((i) => [i, sharePrice(st, i)]));
      st = nextRound(st, QUIET);
      for (const i of COMPANY_IDX) {
        const p = sharePrice(st, i);
        expect(p % STOCK.round).toBe(0);
        expect(p).toBeGreaterThanOrEqual(STOCK.min);
        expect(p).toBeLessThanOrEqual(STOCK.max);
        expect(Math.abs(p - before[i])).toBeLessThanOrEqual(Math.ceil((before[i] * STOCK.drift) / 10) * 10);
      }
    }
    for (const i of COMPANY_IDX) {
      expect(st.stocks![i].hist).toHaveLength(STOCK.history);
      expect(st.stocks![i].hist.at(-1)).toBe(sharePrice(st, i));
    }
  });

  it('a cotação fica entre $ 50 e $ 1.000', () => {
    let st = game();
    st.stocks![VOX] = { price: 990, hist: [990], pend: [{ round: 2, pct: 50, why: 'teste' }] };
    st.stocks![BANCO_AURORA] = { price: 60, hist: [60], pend: [{ round: 2, pct: -80, why: 'teste' }] };
    st = nextRound(st, QUIET);
    expect(sharePrice(st, VOX)).toBe(STOCK.max);
    expect(sharePrice(st, BANCO_AURORA)).toBe(STOCK.min);
  });

  it('a compra da empresa custa a cotação e a taxa da casa escala com ela', () => {
    let st = setPrice(game(), VOX, 300);
    st = giveShares(st, VOX, { beto: 4 });
    st = act(st, 'ana', { type: 'land', idx: VOX });
    expect(feeTotal(st, VOX, 7)).toBe(5250); // 7 × 500 × 300/200
    st = act(st, 'ana', { type: 'payFee', dice: 7 });
    expect(st.tx.filter((t) => t.kind === 'fee').reduce((a, t) => a + t.amount, 0)).toBe(Math.round((5250 * 4) / 10));
    const list = transfersFor(st, { type: 'buyShares', qty: 1 }, 'ana');
    expect(list[0].amount).toBe(300);
    const before = bal(st, 'ana');
    st = act(st, 'ana', { type: 'buyShares', qty: 1 });
    expect(bal(st, 'ana')).toBe(before - 300);
    expect(st.shares[VOX].ana).toBe(1);
  });

  it('com a cotação em $ 200 a taxa continua dados × $ 500', () => {
    const st = game();
    expect(feeTotal(st, VOX, 7)).toBe(3500);
  });

  it('paga dividendos a cada rodada a quem tem cotas, do banco, e conta como renda do IR', () => {
    let st = giveShares(game(), VOX, { ana: 3, beto: 1 });
    const a0 = bal(st, 'ana');
    const inc0 = incomeOf(pl(st, 'ana'));
    st = nextRound(st, QUIET);
    const each = Math.round(sharePrice(st, VOX) * STOCK.yield);
    const tx = st.tx.find((t) => t.kind === 'dividend' && t.to === 'ana' && t.space === VOX)!;
    expect(tx).toMatchObject({ from: 'bank', amount: 3 * each });
    expect(tx.reason).toContain('Dividendos da Vox Telecom: 3 cotas');
    expect(st.tx.find((t) => t.kind === 'dividend' && t.to === 'beto')!.amount).toBe(each);
    expect(bal(st, 'ana')).toBe(a0 + 3 * each);
    expect(incomeOf(pl(st, 'ana'))).toBe(inc0 + 3 * each);
    expect(st.feed.some((f) => f.text.startsWith('Dividendos da Vox Telecom:'))).toBe(true);
  });

  it('vende cotas de volta à empresa pela cotação, na sua vez, sem contar como renda', () => {
    let st = setPrice(giveShares(game(), VOX, { ana: 3 }), VOX, 250);
    expect(() => act(st, 'beto', { type: 'sellShares', idx: VOX, qty: 1 })).toThrow(/vez de Ana/);
    expect(() => act(st, 'ana', { type: 'sellShares', idx: VOX, qty: 4 })).toThrow(/3 cotas/);
    expect(() => act(st, 'ana', { type: 'sellShares', idx: VOX, qty: 0 })).toThrow();
    const b0 = bal(st, 'ana');
    st = act(st, 'ana', { type: 'sellShares', idx: VOX, qty: 2 });
    expect(bal(st, 'ana')).toBe(b0 + 500);
    expect(st.shares[VOX].ana).toBe(1);
    expect(st.tx[0]).toMatchObject({ from: 'bank', to: 'ana', amount: 500, kind: 'shares' });
    expect(incomeOf(pl(st, 'ana'))).toBe(0);
    st = act(st, 'ana', { type: 'sellShares', idx: VOX, qty: 1 });
    expect(st.shares[VOX].ana).toBeUndefined();
  });

  it('patrimônio vale as cotas pela cotação', () => {
    let st = giveShares(game(), VOX, { ana: 3 });
    st = setPrice(st, VOX, 420);
    expect(netWorth(st, pl(st, 'ana'))).toBe(25000 + 3 * 420);
    expect(equity(st, pl(st, 'ana'))).toBe(25000 + 3 * 420);
  });
});

describe('Gerência (dono da empresa)', () => {
  const owned = () => giveShares(game(), VOX, { ana: 6, beto: 2 });

  it('só o dono decide, na sua vez, uma vez por rodada por empresa', () => {
    let st = owned();
    expect(manageBlock(st, VOX, 'ana')).toBeNull();
    expect(manageBlock(st, VOX, 'beto')).toMatch(/Só o dono/);
    expect(() => act(st, 'beto', { type: 'manage', idx: VOX, decision: 'cortar' })).toThrow(/Só o dono/);
    st = act(st, 'ana', { type: 'manage', idx: VOX, decision: 'cortar' });
    expect(manageBlock(st, VOX, 'ana')).toMatch(/já decidiu/);
    expect(() => act(st, 'ana', { type: 'manage', idx: VOX, decision: 'investir' })).toThrow(/já decidiu/);
    // outra empresa que ela controla pode
    st = giveShares(st, BANCO_AURORA, { ana: 7 });
    expect(manageBlock(st, BANCO_AURORA, 'ana')).toBeNull();
    // fora da vez, não
    st = pass(st);
    expect(manageBlock(st, BANCO_AURORA, 'ana')).toMatch(/sua vez/);
    // na próxima rodada pode decidir de novo
    st = anaTurn(nextRound(st, QUIET));
    expect(manageBlock(st, VOX, 'ana')).toBeNull();
    expect(st.feed.some((f) => f.text.startsWith('Gerência da Vox Telecom: Ana cortou custos') && f.important)).toBe(true);
  });

  it('Investir: paga $ 1.000 e a cota sobe de 10% a 25% (± a variação) na próxima rodada', () => {
    let st = owned();
    const b0 = bal(st, 'ana');
    st = act(st, 'ana', { type: 'manage', idx: VOX, decision: 'investir' });
    expect(bal(st, 'ana')).toBe(b0 - DECISIONS.investir.cost);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 1000, kind: 'gestao' });
    expect(stockEffects(st, VOX)[0]).toContain('cota sobe de 10% a 25% na rodada 2');
    st = nextRound(st, QUIET);
    const p = sharePrice(st, VOX);
    expect(p).toBeGreaterThanOrEqual(210);
    expect(p).toBeLessThanOrEqual(260);
    expect(st.feed.some((f) => /Investimento na Vox Telecom deu resultado: cota \+\d+%/.test(f.text))).toBe(true);
  });

  it('Dividendo extra: o banco paga 5% da cotação por cota agora e a cota cai 10% na próxima rodada', () => {
    let st = owned();
    const a0 = bal(st, 'ana');
    const b0 = bal(st, 'beto');
    st = act(st, 'ana', { type: 'manage', idx: VOX, decision: 'dividendo' });
    expect(bal(st, 'ana')).toBe(a0 + 6 * 10);
    expect(bal(st, 'beto')).toBe(b0 + 2 * 10);
    expect(incomeOf(pl(st, 'beto'))).toBe(20);
    expect(st.tx.filter((t) => t.kind === 'dividend')).toHaveLength(2);
    st = nextRound(st, QUIET);
    expect(sharePrice(st, VOX)).toBeGreaterThanOrEqual(170);
    expect(sharePrice(st, VOX)).toBeLessThanOrEqual(190);
  });

  it('Cortar custos sem greve: dividendo +2 pontos por 2 rodadas', () => {
    let st = owned();
    st = act(st, 'ana', { type: 'manage', idx: VOX, decision: 'cortar' });
    expect(dividendYield(st, VOX)).toBe(STOCK.yield);
    // força o sorteio da greve para "não" (a greve é a última tirada da Vox na rodada)
    let found: GameState | null = null;
    for (let s = 1; s < 500 && !found; s++) {
      const t = structuredClone(st);
      t.seed = s;
      const r = nextRound(t, QUIET);
      if (dividendYield(r, VOX) > 0) found = r;
    }
    st = found!;
    expect(dividendYield(st, VOX)).toBe(0.05);
    expect(st.feed.some((f) => f.text.includes('Corte de custos na Vox Telecom sem greve'))).toBe(true);
    st = nextRound(st, QUIET);
    expect(dividendYield(st, VOX)).toBe(0.05);
    st = nextRound(st, QUIET);
    expect(dividendYield(st, VOX)).toBe(STOCK.yield);
  });

  it('Cortar custos com greve: dividendo zero na próxima rodada, depois +2 pontos', () => {
    let st = owned();
    st = act(st, 'ana', { type: 'manage', idx: VOX, decision: 'cortar' });
    let found: GameState | null = null;
    for (let s = 1; s < 500 && !found; s++) {
      const t = structuredClone(st);
      t.seed = s;
      const r = nextRound(t, QUIET);
      if (dividendYield(r, VOX) === 0) found = r;
    }
    st = found!;
    expect(st.tx.some((t) => t.kind === 'dividend' && t.space === VOX && t.round === st.round)).toBe(false);
    expect(st.feed.some((f) => f.text.includes('Greve na Vox Telecom') && f.important)).toBe(true);
    st = nextRound(st, QUIET);
    expect(dividendYield(st, VOX)).toBe(0.05);
  });

  it('Campanha de marketing: paga $ 500 e a taxa da casa sobe 50% nesta rodada e na próxima', () => {
    let st = owned();
    const b0 = bal(st, 'ana');
    st = act(st, 'ana', { type: 'manage', idx: VOX, decision: 'marketing' });
    expect(bal(st, 'ana')).toBe(b0 - DECISIONS.marketing.cost);
    expect(feeTotal(st, VOX, 4)).toBe(3000);
    st = nextRound(st, QUIET);
    const fee = (s: GameState) => Math.round((4 * 500 * (sharePrice(s, VOX) / 200)) / 10) * 10;
    expect(feeTotal(st, VOX, 4)).toBe(Math.round((4 * 500 * (sharePrice(st, VOX) / 200) * 1.5) / 10) * 10);
    st = nextRound(st, QUIET);
    expect(feeTotal(st, VOX, 4)).toBe(fee(st));
  });

  it('decisão sem saldo não passa', () => {
    const st = owned();
    pl(st, 'ana').balance = 400;
    expect(() => act(st, 'ana', { type: 'manage', idx: VOX, decision: 'marketing' })).toThrow(/Saldo insuficiente/);
  });
});

describe('salas antigas e Jornal/Bolsa desligados', () => {
  it('sala antiga sem os campos novos continua: cotas a $ 200 até a próxima rodada, que já traz o Jornal', () => {
    let st = giveShares(game(), VOX, { ana: 2 });
    delete st.stocks;
    delete st.jornal;
    delete st.jornalDeck;
    delete st.jornalPtr;
    delete st.hoodMods;
    delete st.settings.mercado;
    delete st.seed;
    expect(sharePrice(st, VOX)).toBe(SHARE_PRICE);
    expect(netWorth(st, pl(st, 'ana'))).toBe(25000 + 400);
    expect(dividendYield(st, VOX)).toBe(STOCK.yield);
    expect(hoodMult(st, 'verde')).toBe(1);
    st = nextRound(st);
    expect(st.jornal).toHaveLength(1);
    expect(Object.keys(st.stocks!)).toHaveLength(6);
    expect(st.tx.some((t) => t.kind === 'dividend' && t.to === 'ana')).toBe(true);
  });

  it('com o Jornal e a Bolsa desligados no lobby, nada muda entre as rodadas', () => {
    let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
    st = act(st, 'beto', { type: 'join', name: 'Beto' });
    expect(() => act(st, 'beto', { type: 'setMercado', on: false })).toThrow(/Só quem criou/);
    st = act(st, 'ana', { type: 'setMercado', on: false });
    st = act(st, 'ana', { type: 'start' });
    st = giveShares(st, VOX, { ana: 6 });
    expect(st.jornal).toEqual([]);
    for (let k = 0; k < 3; k++) st = nextRound(st);
    expect(st.jornal).toEqual([]);
    expect(sharePrice(st, VOX)).toBe(SHARE_PRICE);
    expect(st.tx.some((t) => t.kind === 'dividend')).toBe(false);
    st = anaTurn(st);
    expect(manageBlock(st, VOX, 'ana')).toMatch(/desligada/);
    expect(() => act(st, 'ana', { type: 'sellShares', idx: VOX, qty: 1 })).toThrow(/desligada/);
  });

  it('a manchete da casa onde o jogador para usa o preço do bairro já com o efeito temporário', () => {
    let st = nextRound(game(), H('Assaltos'));
    st = anaTurn(st);
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    const list = transfersFor(st, { type: 'buy' }, 'ana');
    expect(list[0].amount).toBe(850);
  });
});
