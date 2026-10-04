// Fase 2: três casas por imóvel, valorização do bairro, IR a cada volta, score de crédito e juros por rodada.
import { describe, expect, it } from 'vitest';
import { BANK_RATES, CREDIT, IR, SPACES, TIERS } from './data';
import { houseListing, listingFacts, priceLevel } from './listings';
import { HOUSE_PHOTOS, housePhotos } from './photos';
import {
  applyAction,
  applyNeighbourhoodChange,
  bankRate,
  creditBand,
  creditOf,
  hoodLabel,
  hoodMult,
  incomeOf,
  irTax,
  loanLimit,
  loanRateFor,
  netWorth,
  newRoom,
  nextRandom,
  rentOf,
  lotMortgage,
  lotPrice,
  buildPrice,
  tierOf,
  tierRents,
  unmortgageCost,
} from './rules';
import type { Action, GameState, TierId } from './types';

const NOVE_JULHO = 1; // verde, $1.000, aluguel 60, hipoteca 500
const BRASIL = 2; // verde, $750
const BANCO_AURORA = 3;
const NEWS_IDX = 6;
const PAULISTA = 26; // azul escuro, $1.600
const FERIADO = 20;

const now = new Date('2026-01-01T12:00:00Z');
const half = () => 0.5;
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: half });

function game(players = ['Ana', 'Beto']): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  for (const n of players.slice(1)) st = act(st, n.toLowerCase(), { type: 'join', name: n });
  return act(st, 'ana', { type: 'start' });
}
/** money() usa espaço fino; normaliza para comparar textos. */
const n = (x: string) => x.replace(/\s/g, ' ');
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const bal = (st: GameState, id: string) => pl(st, id).balance;
function give(st: GameState, owner: string, idxs: number[], tier?: TierId, houses = 0): GameState {
  const s = structuredClone(st);
  for (const i of idxs) s.props[i] = { owner, houses, mortgaged: false, ...(tier ? { tier } : {}) };
  return s;
}
/** Quem está na vez para no Feriado e passa a vez. */
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
/** Uma semente cuja primeira tirada satisfaz `pred` (para testar os dois lados do sorteio). */
function seedWhere(pred: (r: number) => boolean): number {
  for (let s = 1; ; s++) if (pred(nextRandom({ seed: s } as GameState))) return s;
}
/** Ana completa a volta com `income` de renda no ano e para na Av. 9 de Julho. */
function lap(income: number, st = game()): GameState {
  st = structuredClone(st);
  pl(st, 'ana').pos = 35;
  pl(st, 'ana').income = income;
  return act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
}

/** Ana parou no próprio imóvel numa rodada depois da compra (pode construir). */
function onOwn(st: GameState, i: number): GameState {
  st = structuredClone(st);
  st.round += 1;
  st.props[i].round = st.round - 1;
  st.turn = 0;
  st.turnInfo = { landed: null, resolved: false, news: null, feePaid: false };
  return act(st, 'ana', { type: 'land', idx: i });
}

describe('terreno na compra e três padrões de casa na construção', () => {
  it('compra só o terreno, pelo preço do tabuleiro, sem padrão', () => {
    let st = act(game(), 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy' });
    expect(bal(st, 'ana')).toBe(25000 - 1000);
    expect(st.props[NOVE_JULHO]).toEqual({ owner: 'ana', houses: 0, mortgaged: false, round: 1 });
    expect(tierOf(st, NOVE_JULHO)).toBeNull();
    expect(st.tx[0]).toMatchObject({ amount: 1000, kind: 'buy', reason: 'Compra do terreno da Av. 9 de Julho' });
    expect(st.tx[0].tier).toBeUndefined();
    expect(n(st.feed[0].text)).toBe('Ana comprou o terreno da Av. 9 de Julho por $ 1.000');
  });

  it('aluguel do terreno = "sem casa" do tabuleiro × bairro, igual para todos os padrões', () => {
    const st = give(game(), 'ana', [NOVE_JULHO]);
    expect(rentOf(st, NOVE_JULHO)).toBe(60);
    expect(tierRents(st, NOVE_JULHO, 'basica')[0]).toBe(60);
    expect(tierRents(st, NOVE_JULHO, 'alto')[0]).toBe(60);
  });

  it('custo da casa 80% / 100% / 130% do custo de construção, arredondado a $ 10', () => {
    const st = game();
    expect([buildPrice(st, NOVE_JULHO, 'basica'), buildPrice(st, NOVE_JULHO, 'intermediaria'), buildPrice(st, NOVE_JULHO, 'alto')]).toEqual([400, 500, 650]);
    expect([buildPrice(st, PAULISTA, 'basica'), buildPrice(st, PAULISTA, 'intermediaria'), buildPrice(st, PAULISTA, 'alto')]).toEqual([800, 1000, 1300]);
    expect(lotPrice(st, BRASIL)).toBe(750);
  });

  it('aluguéis com casas e hotel escalam 80% / 100% / 140%', () => {
    const st = game();
    expect(tierRents(st, NOVE_JULHO, 'basica')).toEqual([60, 240, 720, 2160, 3200, 4000]);
    expect(tierRents(st, NOVE_JULHO, 'intermediaria')).toEqual([60, 300, 900, 2700, 4000, 5000]);
    expect(tierRents(st, NOVE_JULHO, 'alto')).toEqual([60, 420, 1260, 3780, 5600, 7000]);
    const built = give(st, 'ana', [NOVE_JULHO], 'alto', 3);
    expect(rentOf(built, NOVE_JULHO)).toBe(3780);
    built.props[NOVE_JULHO].houses = 5;
    expect(rentOf(built, NOVE_JULHO)).toBe(7000);
  });

  it('a primeira casa escolhe o padrão; as próximas seguem o mesmo, cada uma pelo custo do padrão', () => {
    let st = onOwn(give(game(), 'ana', [NOVE_JULHO]), NOVE_JULHO);
    st = act(st, 'ana', { type: 'build', idx: NOVE_JULHO, tier: 'alto' });
    expect(st.props[NOVE_JULHO]).toMatchObject({ houses: 1, tier: 'alto' });
    expect(bal(st, 'ana')).toBe(25000 - 650);
    expect(st.tx[0]).toMatchObject({ amount: 650, kind: 'build', tier: 'alto', reason: 'Primeira casa Alto padrão na Av. 9 de Julho' });
    expect(rentOf(st, NOVE_JULHO)).toBe(420);
    // próxima rodada: mais uma casa do mesmo padrão; outro padrão é recusado
    let next = onOwn(st, NOVE_JULHO);
    expect(() => act(next, 'ana', { type: 'build', idx: NOVE_JULHO, tier: 'basica' })).toThrow(/mesmo padrão/);
    next = act(next, 'ana', { type: 'build', idx: NOVE_JULHO });
    expect(next.props[NOVE_JULHO]).toMatchObject({ houses: 2, tier: 'alto' });
    expect(next.tx[0].amount).toBe(650);
  });

  it('não constrói no terreno comprado nesta rodada', () => {
    let st = act(act(game(), 'ana', { type: 'land', idx: NOVE_JULHO }), 'ana', { type: 'buy' });
    expect(() => act(st, 'ana', { type: 'build', idx: NOVE_JULHO, tier: 'basica' })).toThrow(/comprado nesta rodada/);
    st = onOwn(st, NOVE_JULHO);
    expect(act(st, 'ana', { type: 'build', idx: NOVE_JULHO, tier: 'basica' }).tx[0].amount).toBe(400);
  });

  it('vender todas as casas volta a ser terreno, sem padrão; vende pela metade do custo do padrão', () => {
    let st = give(game(), 'ana', [NOVE_JULHO], 'alto', 2);
    st = act(st, 'ana', { type: 'sellHouse', idx: NOVE_JULHO });
    expect(st.tx[0].amount).toBe(325);
    expect(st.props[NOVE_JULHO]).toMatchObject({ houses: 1, tier: 'alto' });
    st = act(st, 'ana', { type: 'sellHouse', idx: NOVE_JULHO });
    expect(st.props[NOVE_JULHO].houses).toBe(0);
    expect(st.props[NOVE_JULHO].tier).toBeUndefined();
    expect(tierOf(st, NOVE_JULHO)).toBeNull();
  });

  it('o outro jogador paga o aluguel da casa do padrão', () => {
    let st = give(game(), 'ana', [NOVE_JULHO], 'alto', 1);
    st.turn = 1;
    st = act(act(st, 'beto', { type: 'land', idx: NOVE_JULHO }), 'beto', { type: 'payRent' });
    expect(bal(st, 'beto')).toBe(25000 - 420);
    expect(st.tx[0]).toMatchObject({ amount: 420, kind: 'rent', tier: 'alto', reason: 'Aluguel da Av. 9 de Julho (casa Alto padrão)' });
    let lot = give(game(), 'ana', [NOVE_JULHO]);
    lot.turn = 1;
    lot = act(act(lot, 'beto', { type: 'land', idx: NOVE_JULHO }), 'beto', { type: 'payRent' });
    expect(lot.tx[0]).toMatchObject({ amount: 60, reason: 'Aluguel da Av. 9 de Julho (terreno)' });
  });

  it('hipoteca do terreno = tabuleiro × bairro, travada ao hipotecar', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    expect(lotMortgage(st, NOVE_JULHO)).toBe(500);
    st = act(st, 'ana', { type: 'mortgage', idx: NOVE_JULHO });
    expect(bal(st, 'ana')).toBe(25500);
    expect(st.props[NOVE_JULHO].mortgageValue).toBe(500);
    st = applyNeighbourhoodChange(st, 'verde', 50, now);
    expect(lotMortgage(st, NOVE_JULHO)).toBe(750);
    expect(unmortgageCost(st, NOVE_JULHO)).toBe(600); // 500 + 20%, mesmo depois da valorização
  });

  it('patrimônio = terreno + casas pelo custo do padrão', () => {
    const lot = give(game(), 'ana', [NOVE_JULHO]);
    expect(netWorth(lot, pl(lot, 'ana'))).toBe(26000);
    const st = give(game(), 'ana', [NOVE_JULHO], 'basica', 2);
    expect(netWorth(st, pl(st, 'ana'))).toBe(25000 + 1000 + 2 * 400);
  });

  it('negociação leva o terreno (com casas não entra)', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: { money: 0, props: [NOVE_JULHO], shares: {} }, get: { money: 100, props: [], shares: {} } });
    st = act(st, 'beto', { type: 'acceptTrade', id: st.trades![0].id });
    expect(st.props[NOVE_JULHO]).toMatchObject({ owner: 'beto', houses: 0 });
    const built = give(game(), 'ana', [NOVE_JULHO], 'alto', 1);
    expect(() => act(built, 'ana', { type: 'proposeTrade', to: 'beto', give: { money: 0, props: [NOVE_JULHO], shares: {} }, get: { money: 100, props: [], shares: {} } })).toThrow();
  });

  it('penhora vende casas pela metade do custo do padrão e o terreno volta ao banco sem casa', () => {
    let st = give(game(), 'ana', [NOVE_JULHO], 'alto', 1);
    st.bankRate = 0.02; // pagamento único: +8 pp = 10%
    st = act(st, 'ana', { type: 'takeLoan', amount: 1000 });
    while (!(st.round === 5 && st.turn === 1)) st = pass(st);
    st.players[0].balance = 500; // 500 + 325 da casa + 500 do terreno cobre os 1.100
    st = pass(st);
    expect(st.tx.filter((t) => t.kind === 'penhora').map((t) => t.amount).reverse()).toEqual([325, 500]);
    expect(st.props[NOVE_JULHO]).toBeUndefined();
    expect(st.lots?.[NOVE_JULHO]).toBeUndefined();
    expect(tierOf(st, NOVE_JULHO)).toBeNull();
    st.turn = 1; // Beto cai no terreno: compra só o terreno, pelo preço do tabuleiro
    st.turnInfo = { landed: null, resolved: false, news: null, feePaid: false };
    st = act(act(st, 'beto', { type: 'land', idx: NOVE_JULHO }), 'beto', { type: 'buy' });
    expect(st.tx[0].amount).toBe(1000);
    expect(st.props[NOVE_JULHO].tier).toBeUndefined();
  });

  it('falência para outro jogador passa o imóvel com as casas e o padrão', () => {
    let st = give(game(), 'ana', [NOVE_JULHO], 'basica', 2);
    st = act(st, 'ana', { type: 'bankrupt', debtor: 'ana', creditor: 'beto' });
    expect(st.props[NOVE_JULHO]).toMatchObject({ owner: 'beto', tier: 'basica', houses: 2 });
  });

  it('anúncios determinísticos, diferentes por nível e de acordo com o preço do bairro', () => {
    expect(houseListing(NOVE_JULHO, 'alto')).toEqual(houseListing(NOVE_JULHO, 'alto'));
    expect(priceLevel(600)).toBe('popular');
    expect(priceLevel(1600)).toBe('medio');
    expect(priceLevel(4000)).toBe('nobre');
    const streets = SPACES.map((s, i) => (s.type === 'street' ? i : -1)).filter((i) => i >= 0);
    for (const i of streets) {
      const [b, m, a] = (['basica', 'intermediaria', 'alto'] as TierId[]).map((t) => houseListing(i, t));
      expect(b.area).toBeLessThan(m.area);
      expect(m.area).toBeLessThan(a.area);
      expect(new Set([b.title, m.title, a.title]).size).toBe(3);
    }
    // varia entre bairros
    expect(new Set(streets.map((i) => houseListing(i, 'intermediaria').title)).size).toBeGreaterThan(4);
    expect(listingFacts({ kind: 'sobrado', title: '', area: 120, rooms: 3, suites: 1, vagas: 2, baths: 2, extras: [] })).toBe('120 m² · 3 quartos (1 suíte) · 2 vagas');
    expect(houseListing(35, 'alto').perk).toBe('vista para o mar'); // Av. Vieira Souto
    expect(houseListing(35, 'alto').extras).toContain('vista para o mar');
    for (const i of streets) for (const t of ['basica', 'intermediaria', 'alto'] as TierId[]) expect(houseListing(i, t).baths).toBeGreaterThanOrEqual(1);
  });

  it('fotos do anúncio: escolha determinística por imóvel e padrão; sem fotos, lista vazia (usa a ilustração)', () => {
    const list = ['/a.jpg', '/b.jpg', '/c.jpg'];
    const a = housePhotos(NOVE_JULHO, 'alto', list);
    expect(housePhotos(NOVE_JULHO, 'alto', list)).toEqual(a);
    expect([...a].sort()).toEqual(list);
    const covers = new Set(SPACES.map((s, i) => (s.type === 'street' ? housePhotos(i, 'alto', list)[0] : null)).filter(Boolean));
    expect(covers.size).toBeGreaterThan(1); // imóveis diferentes começam em fotos diferentes
    expect(housePhotos(NOVE_JULHO, 'basica', [])).toEqual([]);
    expect(housePhotos(NOVE_JULHO, 'intermediaria')).toEqual(HOUSE_PHOTOS.intermediaria);
  });
});

describe('valorização do bairro', () => {
  it('multiplicador começa em 1,0 e escala preço e aluguéis da casa', () => {
    const st = give(game(), 'ana', [NOVE_JULHO], 'alto', 1);
    expect(hoodMult(st, 'verde')).toBe(1);
    const up = applyNeighbourhoodChange(st, 'verde', 10, now);
    expect(hoodMult(up, 'verde')).toBe(1.1);
    expect(lotPrice(up, NOVE_JULHO)).toBe(1100);
    expect(buildPrice(up, NOVE_JULHO)).toBe(720); // 500 × 1,3 × 1,1 = 715
    expect(rentOf(up, NOVE_JULHO)).toBe(462); // 300 × 1,4 × 1,1
    expect(tierRents(up, NOVE_JULHO, 'intermediaria')[5]).toBe(5500);
    expect(hoodMult(up, 'roxo')).toBe(1);
    expect(up.feed[0]).toMatchObject({ text: 'Bairro verde valorizou 10%: preços e aluguéis sobem', important: true });
    // função pura: o estado original não muda
    expect(hoodMult(st, 'verde')).toBe(1);
  });

  it('soma em pontos percentuais, com limites, e mostra o rótulo', () => {
    let st = applyNeighbourhoodChange(game(), 'roxo', 10, now);
    st = applyNeighbourhoodChange(st, 'roxo', 15, now);
    expect(hoodMult(st, 'roxo')).toBe(1.25);
    expect(hoodLabel(1.25)).toBe('Bairro valorizado +25%');
    expect(hoodLabel(0.8)).toBe('Bairro desvalorizado −20%');
    expect(hoodLabel(1)).toBeNull();
    expect(hoodMult(applyNeighbourhoodChange(st, 'roxo', 500, now), 'roxo')).toBe(2);
    expect(hoodMult(applyNeighbourhoodChange(st, 'roxo', -500, now), 'roxo')).toBe(0.5);
    expect(() => applyNeighbourhoodChange(st, 'rosa' as never, 10, now)).toThrow(/Bairro inválido/);
  });

  it('compra num bairro valorizado custa mais', () => {
    let st = applyNeighbourhoodChange(game(), 'verde', 20, now);
    st = act(act(st, 'ana', { type: 'land', idx: NOVE_JULHO }), 'ana', { type: 'buy' });
    expect(st.tx[0].amount).toBe(1200);
  });
});

describe('imposto de renda a cada volta', () => {
  it('conta aluguel, taxa de empresa e notícias como renda; pró-labore e negociação não', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    st.turn = 1;
    st = act(act(st, 'beto', { type: 'land', idx: NOVE_JULHO }), 'beto', { type: 'payRent' });
    expect(incomeOf(pl(st, 'ana'))).toBe(60);
    // taxa da empresa: Ana dona da Banco Aurora
    st = act(st, 'beto', { type: 'endTurn', again: true });
    st.shares[BANCO_AURORA] = { ana: 6 };
    st = act(act(st, 'beto', { type: 'land', idx: BANCO_AURORA }), 'beto', { type: 'payFee', dice: 4 });
    expect(incomeOf(pl(st, 'ana'))).toBe(2060);
    // negociação em dinheiro não conta
    st = act(st, 'beto', { type: 'proposeTrade', to: 'ana', give: { money: 500, props: [], shares: {} }, get: { money: 0, props: [], shares: {} } });
    st = act(st, 'ana', { type: 'acceptTrade', id: st.trades![0].id });
    expect(incomeOf(pl(st, 'ana'))).toBe(2060);
    // notícia de ganho conta; pró-labore não
    st = act(st, 'beto', { type: 'endTurn', again: false });
    const getCard = 15; // "ganhou um bônus" $ 1.500
    st.deck = [getCard];
    st.deckPtr = 0;
    pl(st, 'ana').pos = 30;
    st = act(st, 'ana', { type: 'land', idx: NEWS_IDX }); // passa pelo Início: fecha o ano antes da notícia
    expect(pl(st, 'ana').year).toBe(1);
    st = act(act(st, 'ana', { type: 'drawNews' }), 'ana', { type: 'applyNews' });
    expect(incomeOf(pl(st, 'ana'))).toBe(1500);
  });

  it('isenção: imposto de 15% só sobre o que passa de $ 2.000', () => {
    expect(irTax(0)).toBe(0);
    expect(irTax(2000)).toBe(0);
    expect(irTax(3000)).toBe(150);
    expect(irTax(6000)).toBe(600);
    expect(IR.salaryIsIncome).toBe(false);
  });

  it('volta com renda até a isenção: isento, sem declaração, ano fechado', () => {
    const st = lap(1800);
    expect(st.irPending).toBeNull();
    expect(pl(st, 'ana')).toMatchObject({ year: 1, income: 0, irLast: { outcome: 'isento', income: 1800, tax: 0 } });
    expect(bal(st, 'ana')).toBe(27000); // pró-labore
    expect(st.feed.some((f) => n(f.text) === 'Ana fechou o ano 1: isento de IR (renda de $ 1.800)')).toBe(true);
  });

  it('declarar: paga o IR ao banco, +20 no score; não passa a vez sem declarar', () => {
    let st = act(lap(6000), 'ana', { type: 'skipBuy' });
    expect(st.irPending).toEqual({ pid: 'ana', year: 1, income: 6000, tax: 600, due: 600 });
    expect(pl(st, 'ana').income).toBe(0);
    expect(() => act(st, 'ana', { type: 'endTurn', again: false })).toThrow(/declaração do IR/);
    expect(() => act(st, 'beto', { type: 'declareIR' })).toThrow(/vez de Ana/);
    st = act(st, 'ana', { type: 'declareIR' });
    expect(st.irPending).toBeNull();
    expect(bal(st, 'ana')).toBe(27000 - 600);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 600, kind: 'ir' });
    expect(n(st.tx[0].reason)).toBe('Imposto de renda do ano 1: 15% de $ 4.000');
    expect(creditOf(pl(st, 'ana'))).toBe(520);
    expect(pl(st, 'ana').irLast).toMatchObject({ outcome: 'declarou', paid: 600 });
    expect(act(st, 'ana', { type: 'endTurn', again: false }).turn).toBe(1);
  });

  it('sonegar sem cair na malha fina: não paga nada agora', () => {
    const st = lap(6000);
    st.seed = seedWhere((r) => r >= IR.catchChance);
    const next = act(st, 'ana', { type: 'evadeIR' });
    expect(next.irPending).toBeNull();
    expect(bal(next, 'ana')).toBe(27000);
    expect(creditOf(pl(next, 'ana'))).toBe(500);
    expect(pl(next, 'ana').irLast).toMatchObject({ outcome: 'passou', paid: 0, tax: 600 });
    expect(next.feed[0].text).toBe('Ana entregou a declaração do ano 1');
  });

  it('sonegar e cair na malha fina: paga imposto + 100% de multa na hora, −150 no score', () => {
    const st = lap(6000);
    st.seed = seedWhere((r) => r < IR.catchChance);
    const next = act(st, 'ana', { type: 'evadeIR' });
    expect(next.irPending).toBeNull();
    expect(bal(next, 'ana')).toBe(27000 - 1200);
    expect(next.tx[0]).toMatchObject({ amount: 1200, kind: 'ir', reason: 'Malha fina: IR do ano 1 + multa de 100%' });
    expect(creditOf(pl(next, 'ana'))).toBe(350);
    expect(pl(next, 'ana').irLast).toMatchObject({ outcome: 'pego', paid: 1200 });
    expect(next.feed[0]).toMatchObject({ important: true });
  });

  it('malha fina sem saldo: fica devendo imposto + multa e paga pelo Pix; −30 pela falta de saldo', () => {
    const st = lap(6000);
    st.seed = seedWhere((r) => r < IR.catchChance);
    st.players[0].balance = 500;
    let next = act(st, 'ana', { type: 'evadeIR' });
    expect(next.irPending).toMatchObject({ caught: true, due: 1200 });
    expect(creditOf(pl(next, 'ana'))).toBe(500 - 150 - 30);
    expect(() => act(next, 'ana', { type: 'evadeIR' })).toThrow(/já caiu na malha fina/);
    expect(() => act(next, 'ana', { type: 'declareIR' })).toThrow(/Saldo insuficiente/);
    next.players[0].balance = 2000;
    next = act(next, 'ana', { type: 'declareIR' });
    expect(next.irPending).toBeNull();
    expect(bal(next, 'ana')).toBe(800);
    expect(creditOf(pl(next, 'ana'))).toBe(320); // sem o +20 de declarar em dia
  });

  it('o sorteio da malha fina é o mesmo em todos os celulares (e no desfazer)', () => {
    const st = lap(6000);
    const a = act(st, 'ana', { type: 'evadeIR' });
    const b = applyAction(st, { type: 'evadeIR' }, { actor: 'ana', now, rng: Math.random });
    expect(a.players[0].irLast!.outcome).toBe(b.players[0].irLast!.outcome);
    expect(a.seed).toBe(b.seed);
    const undone = act(a, 'ana', { type: 'undo' });
    expect(act(undone, 'ana', { type: 'evadeIR' }).players[0].irLast!.outcome).toBe(a.players[0].irLast!.outcome);
  });

  it('falência apaga a declaração pendente', () => {
    const st = act(lap(6000), 'ana', { type: 'bankrupt', debtor: 'ana', creditor: 'bank' });
    expect(st.irPending).toBeNull();
  });
});

describe('score de crédito', () => {
  it('começa em 500 e tem faixas Ruim, Regular, Bom e Excelente', () => {
    expect(creditOf(pl(game(), 'ana'))).toBe(CREDIT.start);
    expect([0, 299, 300, 599, 600, 799, 800, 1000].map((s) => creditBand(s).name)).toEqual(['Ruim', 'Ruim', 'Regular', 'Regular', 'Bom', 'Bom', 'Excelente', 'Excelente']);
  });

  it('limite do empréstimo pelo score: 25% / 50% / 70% / 90% do patrimônio líquido; abaixo de 200 não empresta', () => {
    const st = game();
    const at = (score: number) => {
      const s = structuredClone(st);
      s.players[0].credit = score;
      return loanLimit(s, 'ana');
    };
    expect([at(250), at(500), at(650), at(900)]).toEqual([6000, 12500, 17500, 22500]);
    expect(at(199)).toBe(0);
    const ruim = structuredClone(st);
    ruim.players[0].credit = 150;
    expect(() => act(ruim, 'ana', { type: 'takeLoan', amount: 1000 })).toThrow(/score de crédito \(150\)/);
  });

  it('taxa do empréstimo = taxa da rodada + ajuste do score (Ruim +5, Bom −2, Excelente −4), mínimo 2%', () => {
    const st = game();
    st.bankRate = 0.12;
    const rate = (score: number) => {
      st.players[0].credit = score;
      return loanRateFor(st, 'ana');
    };
    expect([rate(250), rate(500), rate(700), rate(900)]).toEqual([0.17, 0.12, 0.1, 0.08]);
    st.bankRate = 0.05;
    expect(rate(900)).toBe(BANK_RATES.minLoanRate);
  });

  it('quitar o empréstimo +80; pagamento parcial +10 (uma vez por rodada, a partir de $ 500)', () => {
    let st = game();
    st.bankRate = 0.02; // pagamento único: +8 pp = 10%
    st = act(st, 'ana', { type: 'takeLoan', amount: 2000 });
    st = act(st, 'ana', { type: 'payLoan', amount: 100 });
    expect(creditOf(pl(st, 'ana'))).toBe(500);
    st = act(st, 'ana', { type: 'payLoan', amount: 500 });
    expect(creditOf(pl(st, 'ana'))).toBe(510);
    st = act(st, 'ana', { type: 'payLoan', amount: 500 });
    expect(creditOf(pl(st, 'ana'))).toBe(510);
    st = act(st, 'ana', { type: 'payLoan', amount: 1100 });
    expect(st.loans!.ana).toBeUndefined();
    expect(creditOf(pl(st, 'ana'))).toBe(590);
    expect(pl(st, 'ana').creditLog![0]).toEqual({ delta: 80, reason: 'Empréstimo quitado antes do vencimento', round: 1 });
  });

  it('pago no vencimento com o saldo +80; vencido com penhora −200', () => {
    let ok = act(game(), 'ana', { type: 'takeLoan', amount: 1000 });
    while (ok.round < 6) ok = pass(ok);
    expect(ok.loans!.ana).toBeUndefined();
    expect(creditOf(pl(ok, 'ana'))).toBe(580);

    let bad = give(game(), 'ana', [PAULISTA]);
    bad.bankRate = 0.02;
    bad = act(bad, 'ana', { type: 'takeLoan', amount: 1000 });
    while (!(bad.round === 5 && bad.turn === 1)) bad = pass(bad);
    bad.players[0].balance = 500;
    bad = pass(bad);
    expect(bad.props[PAULISTA]).toBeUndefined();
    expect(pl(bad, 'ana').out).toBe(false);
    expect(creditOf(pl(bad, 'ana'))).toBe(300);
  });

  it('sem saldo para o aluguel ao cair: −30, uma vez por jogada', () => {
    let st = give(game(), 'ana', [NOVE_JULHO], 'alto', 5);
    st.turn = 1;
    st.players[1].balance = 1000;
    st = act(st, 'beto', { type: 'land', idx: NOVE_JULHO });
    expect(creditOf(pl(st, 'beto'))).toBe(470);
    expect(pl(st, 'beto').creditLog![0].reason).toBe('Sem saldo para o aluguel');
    expect(st.turnInfo.short).toEqual(['beto']);
  });

  it('o score fica entre 0 e 1000', () => {
    let st = game();
    st.players[0].credit = 990;
    st = act(st, 'ana', { type: 'takeLoan', amount: 1000 });
    st = act(st, 'ana', { type: 'payLoan', amount: st.loans!.ana.principal + st.loans!.ana.interest });
    expect(creditOf(pl(st, 'ana'))).toBe(1000);
    const low = lap(6000);
    low.players[0].credit = 100;
    low.seed = seedWhere((r) => r < IR.catchChance);
    expect(creditOf(pl(act(low, 'ana', { type: 'evadeIR' }), 'ana'))).toBe(0);
  });
});

describe('juros sorteados por rodada', () => {
  it('sorteia a taxa no começo da partida e em cada rodada nova, igual em todos os celulares', () => {
    const a = game();
    expect(BANK_RATES.options).toContain(a.bankRate);
    expect(a.bankRateRound).toBe(1);
    expect(a.feed.some((f) => f.text.startsWith('Taxa do banco nesta rodada:'))).toBe(true);
    let x = a;
    let y = structuredClone(a);
    const seenX: number[] = [];
    const seenY: number[] = [];
    for (let k = 0; k < 12; k++) {
      x = pass(x);
      y = applyAction(applyAction(y, { type: 'land', idx: FERIADO }, { actor: y.players[y.turn].id, now, rng: Math.random }), { type: 'endTurn', again: false }, { actor: y.players[y.turn].id, now, rng: Math.random });
      seenX.push(x.bankRate!);
      seenY.push(y.bankRate!);
    }
    expect(seenX).toEqual(seenY);
    // só muda quando a rodada muda (2 jogadores: a cada 2 passadas)
    expect(x.bankRateRound).toBe(x.round);
    expect(new Set(seenX).size).toBeGreaterThan(1);
  });

  it('a taxa trava ao pegar; empréstimos existentes não mudam com a rodada', () => {
    let st = game();
    st.bankRate = 0.04; // pagamento único: +8 pp = 12%
    st = act(st, 'ana', { type: 'takeLoan', amount: 2000 });
    expect(st.loans!.ana).toMatchObject({ rate: 0.12, interest: 240 });
    for (let k = 0; k < 4; k++) st = pass(st);
    expect(st.loans!.ana).toMatchObject({ rate: 0.12, interest: 240 });
  });

  it('a mudança de taxa vira aviso para todos', () => {
    let st = game();
    let changed = false;
    for (let k = 0; k < 20 && !changed; k++) {
      const before = st.bankRate;
      st = pass(st);
      if (st.bankRate !== before) {
        changed = true;
        expect(st.feed.find((f) => f.text.includes('taxa do banco'))).toMatchObject({ important: true });
      }
    }
    expect(changed).toBe(true);
  });

  it('nextRandom é determinístico e fica em [0, 1)', () => {
    const a = { seed: 42 } as GameState;
    const b = { seed: 42 } as GameState;
    const ra = [nextRandom(a), nextRandom(a), nextRandom(a)];
    expect([nextRandom(b), nextRandom(b), nextRandom(b)]).toEqual(ra);
    for (const r of ra) expect(r >= 0 && r < 1).toBe(true);
  });
});

describe('salas antigas', () => {
  it('padrão guardado com 0 casas é terreno; com casas mantém o padrão; casas sem padrão são Intermediária', () => {
    const st = give(game(), 'ana', [NOVE_JULHO, BRASIL, PAULISTA], 'alto');
    st.props[BRASIL].houses = 2;
    st.props[PAULISTA] = { owner: 'ana', houses: 1, mortgaged: false };
    st.lots = { 4: 'alto' }; // terreno que "voltou com casa" na regra antiga: hoje é só terreno
    expect(tierOf(st, NOVE_JULHO)).toBeNull();
    expect(rentOf(st, NOVE_JULHO)).toBe(60);
    expect(tierOf(st, BRASIL)).toBe('alto');
    expect(tierOf(st, PAULISTA)).toBe('intermediaria');
    expect(netWorth(st, pl(st, 'ana'))).toBe(25000 + 1000 + 750 + 2 * 650 + 1600 + 1000);
    // ao construir a primeira casa no terreno antigo, escolhe o padrão de novo
    const own = onOwn(st, NOVE_JULHO);
    expect(act(own, 'ana', { type: 'build', idx: NOVE_JULHO, tier: 'basica' }).props[NOVE_JULHO].tier).toBe('basica');
    const lot = structuredClone(st);
    lot.turn = 1;
    const bought = act(act(lot, 'beto', { type: 'land', idx: 4 }), 'beto', { type: 'buy' });
    expect(bought.tx[0].amount).toBe(600);
    expect(tierOf(bought, 4)).toBeNull();
  });

  it('sem os campos novos: Intermediária, multiplicador 1, score 500, taxa de 10%, IR funciona', () => {
    const st = give(game(), 'ana', [NOVE_JULHO]);
    delete st.hood;
    delete st.lots;
    delete st.seed;
    delete st.bankRate;
    delete st.bankRateRound;
    delete st.irPending;
    for (const p of st.players) {
      delete p.credit;
      delete p.income;
      delete p.year;
      delete p.creditLog;
    }
    expect(tierOf(st, NOVE_JULHO)).toBeNull();
    expect(rentOf(st, NOVE_JULHO)).toBe(60);
    expect(lotPrice(st, BRASIL)).toBe(750);
    expect(bankRate(st)).toBe(0.1);
    expect(loanRateFor(st, 'ana')).toBe(0.1);
    expect(loanLimit(st, 'ana')).toBe(13000);
    // a primeira rodada nova sorteia a taxa a partir do próprio estado
    const next = pass(pass(st));
    expect(BANK_RATES.options).toContain(next.bankRate);
    expect(next.seed).toBeTypeOf('number');
    // volta sem renda registrada: isento
    const l = lap(0, st);
    expect(l.irPending ?? null).toBeNull();
    expect(pl(l, 'ana').year).toBe(1);
    // empréstimo antigo sem taxa travada
    st.loans = { ana: { principal: 2000, interest: 200, paid: 0, takenRound: 1, dueRound: 6 } };
    const paid = act(st, 'ana', { type: 'payLoan', amount: 2200 });
    expect(creditOf(pl(paid, 'ana'))).toBe(580);
    expect(Object.keys(TIERS)).toEqual(['basica', 'intermediaria', 'alto']);
  });
});
