import { describe, expect, it } from 'vitest';
import { COMPANY_IDX, JAIL_POS, NEWS } from './data';
import { applyAction, bankShares, canBuild, canSellHouse, controller, feeTotal, netWorth, newRoom, rentOf, RuleError } from './rules';
import type { Action, GameState } from './types';

// Índices do tabuleiro usados nos testes
const NOVE_JULHO = 1; // verde, $1.000, aluguel 60
const BRASIL = 2; // verde, $750
const BANCO_AURORA = 3; // empresa
const BEIRA_MAR = 4; // verde, $600
const NEWS_IDX = 6;
const TAX = 23;
const GOTOJAIL = 30;

const now = new Date('2026-01-01T12:00:00Z');
const seq = () => 0.5;

function act(st: GameState, actor: string, action: Action) {
  return applyAction(st, action, { actor, now, rng: seq });
}

/** Sala com Ana (anfitriã) e Beto, partida começada. */
function game(): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  st = act(st, 'ana', { type: 'start' });
  return st;
}

const bal = (st: GameState, id: string) => st.players.find((p) => p.id === id)!.balance;
const pl = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;

/** Ana compra uma lista de imóveis direto (atalho para montar cenários). */
function give(st: GameState, owner: string, idxs: number[], houses = 0): GameState {
  const s = structuredClone(st);
  for (const i of idxs) s.props[i] = { owner, houses, mortgaged: false };
  return s;
}

describe('lobby', () => {
  it('entra, começa e distribui o saldo inicial', () => {
    const st = game();
    expect(st.phase).toBe('playing');
    expect(st.players.map((p) => p.name)).toEqual(['Ana', 'Beto']);
    expect(bal(st, 'ana')).toBe(25000);
    expect(st.deck).toHaveLength(NEWS.length);
  });

  it('só a anfitriã começa e com pelo menos 2 jogadores', () => {
    const solo = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
    expect(() => act(solo, 'ana', { type: 'start' })).toThrow(RuleError);
    const two = act(solo, 'beto', { type: 'join', name: 'Beto' });
    expect(() => act(two, 'beto', { type: 'start' })).toThrow(/criou a sala/);
  });

  it('não entra depois de começar', () => {
    expect(() => act(game(), 'caio', { type: 'join', name: 'Caio' })).toThrow(/já começou/);
  });
});

describe('cair na casa e comprar', () => {
  it('compra o imóvel livre', () => {
    let st = act(game(), 'ana', { type: 'land', idx: NOVE_JULHO });
    expect(st.turnInfo.resolved).toBe(false);
    st = act(st, 'ana', { type: 'buy' });
    expect(st.props[NOVE_JULHO]).toEqual({ owner: 'ana', houses: 0, mortgaged: false });
    expect(bal(st, 'ana')).toBe(24000);
    expect(st.turnInfo.resolved).toBe(true);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 1000, kind: 'buy' });
  });

  it('só quem está na vez joga', () => {
    expect(() => act(game(), 'beto', { type: 'land', idx: 1 })).toThrow(/vez de Ana/);
  });

  it('não compra sem saldo', () => {
    const st = act(game(), 'ana', { type: 'land', idx: NOVE_JULHO });
    st.players[0].balance = 999;
    expect(() => act(st, 'ana', { type: 'buy' })).toThrow(/Saldo insuficiente/);
  });

  it('não passa a vez sem resolver a casa', () => {
    const st = act(game(), 'ana', { type: 'land', idx: NOVE_JULHO });
    expect(() => act(st, 'ana', { type: 'endTurn', again: false })).toThrow(/Resolva/);
    const skipped = act(st, 'ana', { type: 'skipBuy' });
    const next = act(skipped, 'ana', { type: 'endTurn', again: false });
    expect(next.turn).toBe(1);
    expect(next.turnInfo.landed).toBeNull();
  });

  it('nova rodada quando a vez volta ao primeiro jogador', () => {
    let st = game();
    st = act(act(st, 'ana', { type: 'land', idx: 20 }), 'ana', { type: 'endTurn', again: false });
    st = act(act(st, 'beto', { type: 'land', idx: 20 }), 'beto', { type: 'endTurn', again: false });
    expect(st.round).toBe(2);
    expect(st.turn).toBe(0);
  });
});

describe('aluguel', () => {
  function betoNaVez(st: GameState) {
    st.turn = 1;
    return st;
  }

  it('paga o aluguel sem casa ao dono', () => {
    let st = betoNaVez(give(game(), 'ana', [NOVE_JULHO]));
    st = act(st, 'beto', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'beto', { type: 'payRent' });
    expect(bal(st, 'beto')).toBe(25000 - 60);
    expect(bal(st, 'ana')).toBe(25000 + 60);
    expect(st.tx[0]).toMatchObject({ from: 'beto', to: 'ana', amount: 60, kind: 'rent', space: NOVE_JULHO });
  });

  it('aluguel segue a tabela de casas e hotel', () => {
    const st = give(game(), 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR]);
    expect(rentOf(st, NOVE_JULHO)).toBe(60);
    st.props[NOVE_JULHO].houses = 3;
    expect(rentOf(st, NOVE_JULHO)).toBe(2700);
    st.props[NOVE_JULHO].houses = 5;
    expect(rentOf(st, NOVE_JULHO)).toBe(5000);
  });

  it('grupo completo sem casas não dobra o aluguel (regra da mesa)', () => {
    const st = give(game(), 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR]);
    expect(rentOf(st, NOVE_JULHO)).toBe(60);
  });

  it('imóvel hipotecado não cobra e a casa já fica resolvida', () => {
    let st = betoNaVez(give(game(), 'ana', [NOVE_JULHO]));
    st.props[NOVE_JULHO].mortgaged = true;
    expect(rentOf(st, NOVE_JULHO)).toBe(0);
    st = act(st, 'beto', { type: 'land', idx: NOVE_JULHO });
    expect(st.turnInfo.resolved).toBe(true);
  });

  it('cair no próprio imóvel não cobra nada', () => {
    const st = act(give(game(), 'ana', [NOVE_JULHO]), 'ana', { type: 'land', idx: NOVE_JULHO });
    expect(st.turnInfo.resolved).toBe(true);
    expect(bal(st, 'ana')).toBe(25000);
  });
});

describe('pró-labore no Início', () => {
  it('recebe $2.000 ao passar pelo Início', () => {
    let st = game();
    st.players[0].pos = 35;
    st = act(st, 'ana', { type: 'land', idx: 2 });
    expect(bal(st, 'ana')).toBe(27000);
    expect(st.tx[0]).toMatchObject({ from: 'bank', to: 'ana', amount: 2000, kind: 'salary' });
  });

  it('recebe ao parar exatamente no Início', () => {
    let st = game();
    st.players[0].pos = 38;
    st = act(st, 'ana', { type: 'land', idx: 0 });
    expect(bal(st, 'ana')).toBe(27000);
    expect(st.turnInfo.resolved).toBe(true);
  });

  it('não recebe andando para frente sem passar', () => {
    const st = act(game(), 'ana', { type: 'land', idx: 5 });
    expect(bal(st, 'ana')).toBe(25000);
  });
});

describe('detenção', () => {
  it('"Vá para a detenção" prende sem pró-labore', () => {
    const st = act(game(), 'ana', { type: 'land', idx: GOTOJAIL });
    expect(pl(st, 'ana')).toMatchObject({ pos: JAIL_POS, jailed: true, jailTries: 0 });
    expect(bal(st, 'ana')).toBe(25000);
    expect(() => act(st, 'ana', { type: 'endTurn', again: true })).toThrow(/detenção/);
  });

  it('três tentativas: duas falhas passam a vez, na terceira só dupla ou fiança', () => {
    let st = game();
    st.players[0].jailed = true;
    st.players[0].pos = JAIL_POS;
    expect(() => act(st, 'ana', { type: 'land', idx: 12 })).toThrow(/detenção/);
    st = act(st, 'ana', { type: 'jailFail' });
    expect(st.turn).toBe(1);
    st.turn = 0;
    st = act(st, 'ana', { type: 'jailFail' });
    st.turn = 0;
    expect(pl(st, 'ana').jailTries).toBe(2);
    expect(() => act(st, 'ana', { type: 'jailFail' })).toThrow(/fiança/);
    st = act(st, 'ana', { type: 'bail' });
    expect(bal(st, 'ana')).toBe(24500);
    expect(pl(st, 'ana').jailed).toBe(false);
    st = act(st, 'ana', { type: 'land', idx: 15 });
    expect(pl(st, 'ana').pos).toBe(15);
  });

  it('sai com dupla ou com a carta de saída livre', () => {
    const base = game();
    base.players[0].jailed = true;
    base.players[0].pos = JAIL_POS;
    expect(pl(act(base, 'ana', { type: 'jailOut' }), 'ana').jailed).toBe(false);
    expect(() => act(base, 'ana', { type: 'useCard' })).toThrow(/carta/);
    base.players[0].freeCards = 1;
    const out = act(base, 'ana', { type: 'useCard' });
    expect(pl(out, 'ana')).toMatchObject({ jailed: false, freeCards: 0 });
  });

  it('saindo da detenção e passando pelo Início recebe pró-labore', () => {
    let st = game();
    st.players[0].jailed = true;
    st.players[0].pos = JAIL_POS;
    st = act(st, 'ana', { type: 'jailOut' });
    st = act(st, 'ana', { type: 'land', idx: 2 });
    expect(bal(st, 'ana')).toBe(27000);
  });
});

describe('hipoteca', () => {
  it('hipoteca recebe o valor e tirar custa +20% na própria vez', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    st = act(st, 'ana', { type: 'mortgage', idx: NOVE_JULHO });
    expect(st.props[NOVE_JULHO].mortgaged).toBe(true);
    expect(bal(st, 'ana')).toBe(25500);
    st = act(st, 'ana', { type: 'unmortgage', idx: NOVE_JULHO });
    expect(st.props[NOVE_JULHO].mortgaged).toBe(false);
    expect(bal(st, 'ana')).toBe(25500 - 600);
  });

  it('hipotecar vale fora da vez; tirar hipoteca não', () => {
    let st = give(game(), 'beto', [NOVE_JULHO]);
    st = act(st, 'beto', { type: 'mortgage', idx: NOVE_JULHO });
    expect(bal(st, 'beto')).toBe(25500);
    expect(() => act(st, 'beto', { type: 'unmortgage', idx: NOVE_JULHO })).toThrow(/sua vez/);
  });

  it('não hipoteca imóvel de outro nem com casa', () => {
    const st = give(game(), 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR]);
    expect(() => act(st, 'beto', { type: 'mortgage', idx: NOVE_JULHO })).toThrow(RuleError);
    st.props[NOVE_JULHO].houses = 1;
    expect(() => act(st, 'ana', { type: 'mortgage', idx: NOVE_JULHO })).toThrow(RuleError);
  });
});

describe('construção em rodízio', () => {
  it('precisa do grupo completo', () => {
    const st = give(game(), 'ana', [NOVE_JULHO, BRASIL]);
    expect(canBuild(st, NOVE_JULHO, 'ana')).toBe(false);
  });

  it('uma casa por imóvel de cada vez, hotel só com 4 em todos', () => {
    let st = give(game(), 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR]);
    st = act(st, 'ana', { type: 'build', idx: NOVE_JULHO });
    expect(bal(st, 'ana')).toBe(24500);
    expect(canBuild(st, NOVE_JULHO, 'ana')).toBe(false);
    expect(canBuild(st, BRASIL, 'ana')).toBe(true);
    st = act(st, 'ana', { type: 'build', idx: BRASIL });
    st = act(st, 'ana', { type: 'build', idx: BEIRA_MAR });
    expect(canBuild(st, NOVE_JULHO, 'ana')).toBe(true);
    for (const i of [NOVE_JULHO, BRASIL, BEIRA_MAR]) st.props[i].houses = 4;
    st.props[BRASIL].houses = 3;
    expect(canBuild(st, NOVE_JULHO, 'ana')).toBe(false);
    st.props[BRASIL].houses = 4;
    st = act(st, 'ana', { type: 'build', idx: NOVE_JULHO });
    expect(st.props[NOVE_JULHO].houses).toBe(5);
    expect(st.tx[0].reason).toMatch(/^Hotel/);
    expect(canBuild(st, NOVE_JULHO, 'ana')).toBe(false);
  });

  it('não constrói com hipoteca no grupo nem fora da vez', () => {
    const st = give(game(), 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR]);
    st.props[BRASIL].mortgaged = true;
    expect(canBuild(st, NOVE_JULHO, 'ana')).toBe(false);
    st.props[BRASIL].mortgaged = false;
    st.turn = 1;
    expect(canBuild(st, NOVE_JULHO, 'ana')).toBe(false);
  });

  it('vende em rodízio pela metade do custo', () => {
    let st = give(game(), 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR], 1);
    st.props[NOVE_JULHO].houses = 2;
    expect(canSellHouse(st, BRASIL, 'ana')).toBe(false);
    expect(canSellHouse(st, NOVE_JULHO, 'ana')).toBe(true);
    st.turn = 1; // vender vale fora da vez
    st = act(st, 'ana', { type: 'sellHouse', idx: NOVE_JULHO });
    expect(st.props[NOVE_JULHO].houses).toBe(1);
    expect(bal(st, 'ana')).toBe(25250);
  });
});

describe('empresas e cotas', () => {
  const others = COMPANY_IDX.filter((i) => i !== BANCO_AURORA);

  it('compra cotas da empresa só ao cair nela', () => {
    expect(() => act(game(), 'ana', { type: 'buyShares', qty: 2 })).toThrow(RuleError);
    let st = act(game(), 'ana', { type: 'land', idx: BANCO_AURORA });
    expect(st.turnInfo.resolved).toBe(true); // ninguém mais tem cotas
    st = act(st, 'ana', { type: 'buyShares', qty: 6 });
    expect(bal(st, 'ana')).toBe(25000 - 1200);
    expect(controller(st, BANCO_AURORA)).toBe('ana');
    expect(bankShares(st, BANCO_AURORA)).toBe(4);
    expect(() => act(st, 'ana', { type: 'buyShares', qty: 5 })).toThrow(/tantas cotas/);
  });

  it('dono (≥6 cotas) recebe dados × 500', () => {
    let st = game();
    st.shares[BANCO_AURORA] = { ana: 6, beto: 1 };
    st.turn = 1;
    st = act(st, 'beto', { type: 'land', idx: BANCO_AURORA });
    expect(st.turnInfo.resolved).toBe(false);
    st = act(st, 'beto', { type: 'payFee', dice: 7 });
    expect(bal(st, 'beto')).toBe(25000 - 3500);
    expect(bal(st, 'ana')).toBe(25000 + 3500);
    expect(st.turnInfo.resolved).toBe(true);
  });

  it('taxa em dobro quando o mesmo dono controla as 6 empresas', () => {
    const st = game();
    for (const i of COMPANY_IDX) st.shares[i] = { ana: 6 };
    expect(feeTotal(st, BANCO_AURORA, 7)).toBe(7000);
    st.shares[others[0]] = { ana: 5, beto: 5 };
    expect(feeTotal(st, BANCO_AURORA, 7)).toBe(3500);
  });

  it('sem dono, a taxa é dividida pelas cotas', () => {
    let st = game();
    st.players.push({ ...st.players[1], id: 'caio', name: 'Caio', color: '#000' });
    st.shares[BANCO_AURORA] = { ana: 3, caio: 2, beto: 1 };
    st.turn = 1;
    st = act(st, 'beto', { type: 'land', idx: BANCO_AURORA });
    st = act(st, 'beto', { type: 'payFee', dice: 10 }); // total 5.000
    expect(bal(st, 'ana')).toBe(25000 + 1500);
    expect(bal(st, 'caio')).toBe(25000 + 1000);
    expect(bal(st, 'beto')).toBe(25000 - 2500); // a parte dele mesmo não é paga
  });

  it('dono que cai na própria empresa não paga', () => {
    let st = game();
    st.shares[BANCO_AURORA] = { ana: 7, beto: 1 };
    st = act(st, 'ana', { type: 'land', idx: BANCO_AURORA });
    st = act(st, 'ana', { type: 'payFee', dice: 12 });
    expect(bal(st, 'ana')).toBe(25000);
    expect(st.turnInfo.resolved).toBe(true);
  });
});

describe('notícias, imposto, falência e desfazer', () => {
  it('abre o jornal e aplica a carta', () => {
    let st = act(game(), 'ana', { type: 'land', idx: NEWS_IDX });
    st = act(st, 'ana', { type: 'drawNews' });
    const card = NEWS[st.turnInfo.news!];
    st = act(st, 'ana', { type: 'applyNews' });
    expect(st.turnInfo.resolved).toBe(true);
    const delta = card.k === 'pay' ? -card.v : card.k === 'get' || card.k === 'each' ? card.v : 0;
    expect(bal(st, 'ana')).toBe(25000 + delta);
  });

  it('paga o imposto', () => {
    let st = game();
    st.players[0].pos = 22;
    st = act(act(st, 'ana', { type: 'land', idx: TAX }), 'ana', { type: 'payTax' });
    expect(bal(st, 'ana')).toBe(23000);
  });

  it('falência passa imóveis e dinheiro ao credor e define o vencedor', () => {
    let st = give(game(), 'beto', [NOVE_JULHO]);
    st = give(st, 'ana', [BRASIL]);
    st.shares[BANCO_AURORA] = { beto: 2 };
    st.turn = 1;
    st.players[1].balance = 10;
    st = act(st, 'beto', { type: 'bankrupt', debtor: 'beto', creditor: 'ana' });
    expect(st.props[NOVE_JULHO].owner).toBe('ana');
    expect(st.shares[BANCO_AURORA]).toEqual({ ana: 2 });
    expect(bal(st, 'ana')).toBe(25010);
    expect(pl(st, 'beto').out).toBe(true);
    expect(st.winner).toBe('ana');
    expect(netWorth(st, pl(st, 'ana'))).toBe(25010 + 1000 + 750 + 400);
  });

  it('outro jogador não declara falência por você', () => {
    expect(() => act(game(), 'ana', { type: 'bankrupt', debtor: 'beto', creditor: 'ana' })).toThrow(RuleError);
  });

  it('desfaz a última ação de quem a fez', () => {
    const before = act(game(), 'ana', { type: 'land', idx: NOVE_JULHO });
    const bought = act(before, 'ana', { type: 'buy' });
    expect(() => act(bought, 'beto', { type: 'undo' })).toThrow(RuleError);
    const undone = act(bought, 'ana', { type: 'undo' });
    expect(undone.props[NOVE_JULHO]).toBeUndefined();
    expect(bal(undone, 'ana')).toBe(25000);
    expect(undone.turnInfo.landed).toBe(NOVE_JULHO);
    expect(undone.txCount).toBe(bought.txCount); // numeração continua para frente
  });
});
