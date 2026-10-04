import { describe, expect, it } from 'vitest';
import { COMPANY_IDX, JAIL_POS, NEWS } from './data';
import { applyAction, bankShares, buildBlock, canBuild, canSellHouse, controller, debtOf, equity, feeTotal, loanLimit, loanRoundsLeft, netWorth, newRoom, rentOf, RuleError, tradeBlock } from './rules';
import type { Action, GameState } from './types';

// Índices do tabuleiro usados nos testes
const NOVE_JULHO = 1; // verde, $1.000, aluguel 60
const BRASIL = 2; // verde, $750
const BANCO_AURORA = 3; // empresa
const BEIRA_MAR = 4; // verde, $600
const NEWS_IDX = 6;
const TAX = 23;
const GOTOJAIL = 30;
const PAULISTA_IDX = 26;

const now = new Date('2026-01-01T12:00:00Z');
const seq = () => 0.5;

function act(st: GameState, actor: string, action: Action) {
  return applyAction(st, action, { actor, now, rng: seq });
}

/** Sala com Ana (anfitriã) e Beto, partida começada. */
function game(): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  // regras clássicas: sem Jornal e Bolsa (cotas a $ 200, sem manchetes nem dividendos)
  st = act(st, 'ana', { type: 'setMercado', on: false });
  st = act(st, 'ana', { type: 'start' });
  // os testes antigos do empréstimo (pagamento único, taxa da rodada + 8 pp) contam com juros de 10%:
  // fixa a taxa sorteada da rodada em 2%
  st.bankRate = 0.02;
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
    expect(st.props[NOVE_JULHO]).toEqual({ owner: 'ana', houses: 0, mortgaged: false, round: 1 });
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

describe('construção (regra da casa)', () => {
  /** Ana para no imóvel `i` (atalho: só marca a casa onde parou). */
  const on = (st: GameState, i: number) => {
    const s = structuredClone(st);
    s.turnInfo = { ...s.turnInfo, landed: i, resolved: true };
    s.players[s.turn].pos = i;
    return s;
  };

  it('constrói no imóvel seu onde parou, sem precisar do grupo completo', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    expect(st.turnInfo.resolved).toBe(true);
    st = act(st, 'ana', { type: 'build', idx: NOVE_JULHO });
    expect(st.props[NOVE_JULHO].houses).toBe(1);
    expect(bal(st, 'ana')).toBe(24500);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 500, kind: 'build' });
  });

  it('não constrói em outro imóvel seu, nem antes de escolher a casa', () => {
    const st = give(game(), 'ana', [NOVE_JULHO, PAULISTA_IDX]);
    expect(buildBlock(st, NOVE_JULHO, 'ana')).toBe('Só no imóvel onde você parou');
    const landed = on(st, NOVE_JULHO);
    expect(canBuild(landed, NOVE_JULHO, 'ana')).toBe(true);
    expect(buildBlock(landed, PAULISTA_IDX, 'ana')).toBe('Só no imóvel onde você parou');
    expect(() => act(landed, 'ana', { type: 'build', idx: PAULISTA_IDX })).toThrow(/só no imóvel onde você parou/);
  });

  it('uma construção por vez (por rodada, mesmo com dupla)', () => {
    let st = on(give(game(), 'ana', [NOVE_JULHO, PAULISTA_IDX]), NOVE_JULHO);
    st = act(st, 'ana', { type: 'build', idx: NOVE_JULHO });
    expect(buildBlock(st, NOVE_JULHO, 'ana')).toBe('Já construiu nesta rodada');
    expect(() => act(st, 'ana', { type: 'build', idx: NOVE_JULHO })).toThrow(/já construiu nesta rodada/);
    // tirar dupla e cair em outro imóvel seu não libera outra construção
    st = act(st, 'ana', { type: 'endTurn', again: true });
    st = act(st, 'ana', { type: 'land', idx: PAULISTA_IDX });
    expect(buildBlock(st, PAULISTA_IDX, 'ana')).toBe('Já construiu nesta rodada');
    // na rodada seguinte, caindo nele, pode de novo
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = act(act(st, 'beto', { type: 'land', idx: 20 }), 'beto', { type: 'endTurn', again: false });
    expect(st.round).toBe(2);
    st = act(act(st, 'ana', { type: 'land', idx: 20 }), 'ana', { type: 'endTurn', again: true });
    expect(st.players[0].pos).toBe(20);
    st = act(st, 'ana', { type: 'land', idx: 10 });
    st = act(st, 'ana', { type: 'endTurn', again: true });
    st = act(st, 'ana', { type: 'land', idx: PAULISTA_IDX });
    st = act(st, 'ana', { type: 'build', idx: PAULISTA_IDX });
    expect(st.props[PAULISTA_IDX].houses).toBe(1);
  });

  it('não constrói no imóvel comprado nesta rodada', () => {
    const st = act(act(game(), 'ana', { type: 'land', idx: NOVE_JULHO }), 'ana', { type: 'buy' });
    expect(buildBlock(st, NOVE_JULHO, 'ana')).toBe('Comprado nesta rodada');
    expect(() => act(st, 'ana', { type: 'build', idx: NOVE_JULHO })).toThrow(/comprado nesta rodada/);
    const later = structuredClone(st);
    later.round = 2;
    expect(canBuild(later, NOVE_JULHO, 'ana')).toBe(true);
  });

  it('imóvel recebido por negociação também conta como adquirido na rodada', () => {
    let st = give(game(), 'beto', [NOVE_JULHO]);
    st.round = 3;
    st = act(st, 'beto', { type: 'proposeTrade', to: 'ana', give: { money: 0, props: [NOVE_JULHO], shares: {} }, get: { money: 100, props: [], shares: {} } });
    st = act(st, 'ana', { type: 'acceptTrade', id: st.trades![0].id });
    expect(st.props[NOVE_JULHO].round).toBe(3);
    expect(buildBlock(on(st, NOVE_JULHO), NOVE_JULHO, 'ana')).toBe('Comprado nesta rodada');
  });

  it('hotel depois de 4 casas no mesmo imóvel; hipotecado e fora da vez não', () => {
    let st = on(give(game(), 'ana', [NOVE_JULHO], 4), NOVE_JULHO);
    st = act(st, 'ana', { type: 'build', idx: NOVE_JULHO });
    expect(st.props[NOVE_JULHO].houses).toBe(5);
    expect(st.tx[0].reason).toMatch(/^Hotel/);
    st.players[0].builtRound = 0;
    expect(buildBlock(st, NOVE_JULHO, 'ana')).toBe('Já tem hotel');
    const m = on(give(game(), 'ana', [NOVE_JULHO]), NOVE_JULHO);
    m.props[NOVE_JULHO].mortgaged = true;
    expect(buildBlock(m, NOVE_JULHO, 'ana')).toBe('Hipotecado');
    m.props[NOVE_JULHO].mortgaged = false;
    m.turn = 1;
    expect(buildBlock(m, NOVE_JULHO, 'ana')).toBe('Só na sua vez');
  });

  it('vende construção de qualquer imóvel, a qualquer momento, pela metade do custo', () => {
    let st = give(game(), 'ana', [NOVE_JULHO, BRASIL], 1);
    st.props[NOVE_JULHO].houses = 3;
    expect(canSellHouse(st, BRASIL, 'ana')).toBe(true);
    st.turn = 1; // vender vale fora da vez
    st = act(st, 'ana', { type: 'sellHouse', idx: BRASIL });
    expect(st.props[BRASIL].houses).toBe(0);
    expect(bal(st, 'ana')).toBe(25250);
    expect(canSellHouse(st, BRASIL, 'ana')).toBe(false);
  });
});

describe('empresas e cotas', () => {
  const others = COMPANY_IDX.filter((i) => i !== BANCO_AURORA);

  it('compra cotas da empresa só ao cair nela, uma por rodada', () => {
    expect(() => act(game(), 'ana', { type: 'buyShares', qty: 1 })).toThrow(RuleError);
    let st = act(game(), 'ana', { type: 'land', idx: BANCO_AURORA });
    expect(st.turnInfo.resolved).toBe(true); // ninguém mais tem cotas
    expect(() => act(st, 'ana', { type: 'buyShares', qty: 2 })).toThrow(/uma cota por rodada/);
    st = act(st, 'ana', { type: 'buyShares', qty: 1 });
    expect(bal(st, 'ana')).toBe(25000 - 200);
    expect(st.shares[BANCO_AURORA]).toEqual({ ana: 1 });
    expect(bankShares(st, BANCO_AURORA)).toBe(9);
    expect(() => act(st, 'ana', { type: 'buyShares', qty: 1 })).toThrow(/já comprou uma cota/);
    // com dupla, cai em outra empresa na mesma rodada: continua valendo o limite
    st = act(st, 'ana', { type: 'endTurn', again: true });
    st = act(st, 'ana', { type: 'land', idx: others[0] });
    expect(() => act(st, 'ana', { type: 'buyShares', qty: 1 })).toThrow(/já comprou uma cota/);
    // na rodada seguinte, pode de novo
    st = act(act(st, 'ana', { type: 'endTurn', again: false }), 'beto', { type: 'land', idx: 20 });
    st = act(st, 'beto', { type: 'endTurn', again: false });
    st = act(st, 'ana', { type: 'land', idx: BANCO_AURORA });
    st = act(st, 'ana', { type: 'buyShares', qty: 1 });
    expect(st.shares[BANCO_AURORA]).toEqual({ ana: 2 });
    expect(controller(st, BANCO_AURORA)).toBeNull();
  });

  it('a empresa sem cotas à venda recusa a compra', () => {
    let st = game();
    st.shares[BANCO_AURORA] = { beto: 10 };
    st = act(st, 'ana', { type: 'land', idx: BANCO_AURORA });
    st = act(st, 'ana', { type: 'payFee', dice: 2 });
    expect(() => act(st, 'ana', { type: 'buyShares', qty: 1 })).toThrow(/tantas cotas/);
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

// ---------- Negociação ----------

const PAULISTA = 26; // azul escuro, $1.600, hipoteca $800
const FARIA_LIMA = 25; // azul escuro, $1.400
const side = (x: Partial<{ money: number; props: number[]; shares: Record<number, number> }> = {}) => ({ money: 0, props: [], shares: {}, ...x });
const trades = (st: GameState) => st.trades ?? [];

describe('negociação entre jogadores', () => {
  it('troca dinheiro + imóvel por imóvel, fora da vez de quem aceita', () => {
    let st = give(give(game(), 'ana', [NOVE_JULHO]), 'beto', [PAULISTA]);
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ money: 500, props: [NOVE_JULHO] }), get: side({ props: [PAULISTA] }) });
    expect(trades(st)).toHaveLength(1);
    const id = trades(st)[0].id;
    expect(id).toBe('ABCDE-N001');
    expect(bal(st, 'ana')).toBe(25000); // propor não mexe em nada
    const before = st.txCount;
    st = act(st, 'beto', { type: 'acceptTrade', id }); // é a vez da Ana; Beto aceita mesmo assim
    expect(st.props[NOVE_JULHO].owner).toBe('beto');
    expect(st.props[PAULISTA].owner).toBe('ana');
    expect(bal(st, 'ana')).toBe(24500);
    expect(bal(st, 'beto')).toBe(25500);
    expect(trades(st)).toHaveLength(0);
    expect(st.txCount).toBe(before + 1);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'beto', amount: 500, kind: 'trade', ref: id, id: 'ABCDE-R01-0001' });
    expect(st.tx[0].reason).toMatch(/Av\. 9 de Julho.*Av\. Paulista/);
  });

  it('troca cotas por dinheiro a qualquer momento (sem cair na empresa)', () => {
    let st = game();
    st.shares[BANCO_AURORA] = { ana: 6 };
    st = act(st, 'beto', { type: 'proposeTrade', to: 'ana', give: side({ money: 600 }), get: side({ shares: { [BANCO_AURORA]: 2 } }) });
    st = act(st, 'ana', { type: 'acceptTrade', id: trades(st)[0].id });
    expect(st.shares[BANCO_AURORA]).toEqual({ ana: 4, beto: 2 });
    expect(controller(st, BANCO_AURORA)).toBeNull();
    expect(bal(st, 'ana')).toBe(25600);
    expect(bal(st, 'beto')).toBe(24400);
    // comprar da empresa continua só ao cair nela
    expect(() => act(st, 'ana', { type: 'buyShares', qty: 1 })).toThrow(RuleError);
  });

  it('troca só de bens registra uma linha de valor zero com ID', () => {
    let st = give(give(game(), 'ana', [NOVE_JULHO]), 'beto', [PAULISTA]);
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ props: [NOVE_JULHO] }), get: side({ props: [PAULISTA] }) });
    st = act(st, 'beto', { type: 'acceptTrade', id: trades(st)[0].id });
    expect(st.tx[0]).toMatchObject({ amount: 0, kind: 'trade', from: 'ana', to: 'beto' });
    expect(bal(st, 'ana')).toBe(25000);
  });

  it('imóvel hipotecado pode ser negociado e continua hipotecado', () => {
    let st = give(game(), 'ana', [NOVE_JULHO]);
    st.props[NOVE_JULHO].mortgaged = true;
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ props: [NOVE_JULHO] }), get: side({ money: 300 }) });
    st = act(st, 'beto', { type: 'acceptTrade', id: trades(st)[0].id });
    expect(st.props[NOVE_JULHO]).toEqual({ owner: 'beto', houses: 0, mortgaged: true, round: 1 });
  });

  it('imóvel com casas não entra na negociação; o vizinho de grupo sem casas entra', () => {
    let st = give(give(game(), 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR]), 'beto', [PAULISTA]);
    st.props[BRASIL].houses = 1;
    expect(() => act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ props: [BRASIL] }), get: side() })).toThrow(/venda as casas/);
    expect(tradeBlock(st, BRASIL, 'ana')).toMatch(/Av\. Brasil: venda as casas/);
    expect(tradeBlock(st, NOVE_JULHO, 'ana')).toBeNull();
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ props: [NOVE_JULHO] }), get: side({ props: [PAULISTA] }) });
    expect(trades(st)).toHaveLength(1);
  });

  it('valida posse, saldo, cotas e proposta vazia', () => {
    const st = give(game(), 'beto', [PAULISTA]);
    st.shares[BANCO_AURORA] = { ana: 1 };
    const prop = (g: ReturnType<typeof side>, w: ReturnType<typeof side>) => act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: g, get: w });
    expect(() => prop(side({ props: [PAULISTA] }), side())).toThrow(/não é mais de Ana/);
    expect(() => prop(side(), side({ props: [FARIA_LIMA] }))).toThrow(/não é mais de Beto/);
    expect(() => prop(side({ money: 30000 }), side({ props: [PAULISTA] }))).toThrow(/Ana não tem/);
    expect(() => prop(side(), side({ money: 30000 }))).toThrow(/Beto não tem/);
    expect(() => prop(side({ shares: { [BANCO_AURORA]: 2 } }), side())).toThrow(/2 cotas/);
    expect(() => prop(side(), side())).toThrow(/Monte a proposta/);
    expect(() => prop(side({ money: -5 }), side())).toThrow(/inválido/);
    expect(() => act(st, 'ana', { type: 'proposeTrade', to: 'ana', give: side({ money: 1 }), get: side() })).toThrow(/outro jogador/);
  });

  it('uma proposta por dupla; só o destinatário aceita ou recusa; só quem propôs cancela', () => {
    let st = give(game(), 'beto', [PAULISTA]);
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ money: 1000 }), get: side({ props: [PAULISTA] }) });
    const id = trades(st)[0].id;
    expect(() => act(st, 'beto', { type: 'proposeTrade', to: 'ana', give: side({ money: 1 }), get: side() })).toThrow(/Já existe/);
    expect(() => act(st, 'ana', { type: 'acceptTrade', id })).toThrow(/quem recebeu/);
    expect(() => act(st, 'ana', { type: 'declineTrade', id })).toThrow(/quem recebeu/);
    expect(() => act(st, 'beto', { type: 'cancelTrade', id })).toThrow(/quem fez/);
    const declined = act(st, 'beto', { type: 'declineTrade', id });
    expect(trades(declined)).toHaveLength(0);
    expect(declined.props[PAULISTA].owner).toBe('beto');
    const cancelled = act(st, 'ana', { type: 'cancelTrade', id });
    expect(trades(cancelled)).toHaveLength(0);
    expect(() => act(cancelled, 'beto', { type: 'acceptTrade', id })).toThrow(/não existe mais/);
  });

  it('ao aceitar valida de novo: quem ficou sem o dinheiro ou o imóvel trava a troca', () => {
    let st = give(give(game(), 'ana', [NOVE_JULHO]), 'beto', [PAULISTA]);
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ money: 2000 }), get: side({ props: [PAULISTA] }) });
    const id = trades(st)[0].id;
    const poor = structuredClone(st);
    poor.players[0].balance = 1500;
    expect(() => act(poor, 'beto', { type: 'acceptTrade', id })).toThrow(/não vale mais: Ana não tem/);
    const gone = structuredClone(st);
    gone.props[PAULISTA].owner = 'ana';
    expect(() => act(gone, 'beto', { type: 'acceptTrade', id })).toThrow(/não vale mais/);
    // nada mudou
    expect(bal(poor, 'beto')).toBe(25000);
  });

  it('propor não apaga o desfazer de quem está jogando; desfazer mantém as propostas', () => {
    let st = act(act(game(), 'ana', { type: 'land', idx: NOVE_JULHO }), 'ana', { type: 'buy' });
    st = give(st, 'beto', [PAULISTA]);
    st = act(st, 'beto', { type: 'proposeTrade', to: 'ana', give: side({ money: 100 }), get: side() });
    expect(st.prevBy).toBe('ana');
    const undone = act(st, 'ana', { type: 'undo' });
    expect(undone.props[NOVE_JULHO]).toBeUndefined();
    expect(trades(undone)).toHaveLength(1);
  });

  it('falência apaga as propostas de quem faliu', () => {
    let st = game();
    st = act(st, 'beto', { type: 'proposeTrade', to: 'ana', give: side({ money: 100 }), get: side() });
    st.players.push({ ...st.players[1], id: 'caio', name: 'Caio', color: '#000' });
    st = act(st, 'beto', { type: 'bankrupt', debtor: 'beto', creditor: 'bank' });
    expect(trades(st)).toHaveLength(0);
  });
});

// ---------- Empréstimo ----------

/** Quem está na vez para no Feriado e passa a vez. */
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: 20 }), id, { type: 'endTurn', again: false });
}
/** Avança até a vez do Beto na rodada anterior ao vencimento (rodada 5), com o empréstimo da Ana pego na rodada 1. */
function toEve(st: GameState): GameState {
  while (!(st.round === 5 && st.turn === 1)) st = pass(st);
  return st;
}

describe('empréstimo do banco', () => {
  it('limite: 50% do patrimônio líquido, múltiplos de $500, mínimo $1.000', () => {
    expect(loanLimit(game(), 'ana')).toBe(12500);
    expect(loanLimit(give(game(), 'ana', [NOVE_JULHO]), 'ana')).toBe(13000);
    const odd = game();
    odd.players[0].balance = 25300;
    expect(loanLimit(odd, 'ana')).toBe(12500);
    const poor = game();
    poor.players[0].balance = 1900;
    expect(loanLimit(poor, 'ana')).toBe(0);
  });

  it('pega o empréstimo na própria vez, com 10% de juros e vencimento em 5 rodadas', () => {
    const st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    expect(bal(st, 'ana')).toBe(27000);
    expect(st.loans!.ana).toEqual({ principal: 2000, interest: 200, paid: 0, takenRound: 1, dueRound: 6, rate: 0.1, plan: 'unico' });
    expect(debtOf(st, 'ana')).toBe(2200);
    expect(equity(st, pl(st, 'ana'))).toBe(24800);
    expect(loanRoundsLeft(st, 'ana')).toBe(5);
    expect(st.tx[0]).toMatchObject({ from: 'bank', to: 'ana', amount: 2000, kind: 'loan' });
    expect(loanLimit(st, 'ana')).toBe(0);
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: 1000 })).toThrow(/já tem/);
  });

  it('valida vez, mínimo, múltiplos e limite', () => {
    const st = game();
    expect(() => act(st, 'beto', { type: 'takeLoan', amount: 2000 })).toThrow(/vez de Ana/);
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: 500 })).toThrow(/a partir de/);
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: 1200 })).toThrow(/múltiplos/);
    expect(() => act(st, 'ana', { type: 'takeLoan', amount: 13000 })).toThrow(/limite é \$\s12\.500/);
    expect(bal(act(st, 'ana', { type: 'takeLoan', amount: 12500 }), 'ana')).toBe(37500);
  });

  it('pagamento parcial e quitação antecipada (principal + juros cheios)', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    st = act(st, 'ana', { type: 'payLoan', amount: 1000 });
    expect(debtOf(st, 'ana')).toBe(1200);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 1000, kind: 'loanpay' });
    expect(() => act(st, 'ana', { type: 'payLoan', amount: 1500 })).toThrow(/só/);
    st = pass(st);
    expect(() => act(st, 'ana', { type: 'payLoan', amount: 100 })).toThrow(/vez de Beto/);
    st = pass(st);
    st = act(st, 'ana', { type: 'payLoan', amount: 1200 });
    expect(st.loans!.ana).toBeUndefined();
    expect(bal(st, 'ana')).toBe(27000 - 2200);
    expect(st.tx[0].reason).toBe('Quitação do empréstimo');
  });

  it('no vencimento, o banco cobra do dinheiro no início da vez', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    st = toEve(st);
    expect(loanRoundsLeft(st, 'ana')).toBe(1);
    expect(st.loans!.ana).toBeDefined();
    st = pass(st); // começa a vez da Ana na rodada 6
    expect(st.round).toBe(6);
    expect(st.loans!.ana).toBeUndefined();
    expect(bal(st, 'ana')).toBe(27000 - 2200);
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 2200, kind: 'loanpay' });
    expect(st.feed.some((f) => f.text === 'Vencimento: o banco cobra $ 2.200 do empréstimo de Ana')).toBe(true);
  });

  it('penhora: vende construções pela metade, depois toma imóveis do mais barato, pelo valor de hipoteca', () => {
    let st = act(give(game(), 'ana', [PAULISTA]), 'ana', { type: 'takeLoan', amount: 2000 });
    st = toEve(st);
    st = give(st, 'ana', [NOVE_JULHO, BRASIL, BEIRA_MAR], 1); // verde com 1 casa cada (construção $500)
    st.players[0].balance = 0;
    st = pass(st);
    // 3 casas × 250 = 750; Beira Mar ($600) +500, Brasil ($750) +500, 9 de Julho ($1.000) +500 = 2.250 ≥ 2.200
    expect(st.props[BEIRA_MAR]).toBeUndefined();
    expect(st.props[BRASIL]).toBeUndefined();
    expect(st.props[NOVE_JULHO]).toBeUndefined();
    expect(st.props[PAULISTA].owner).toBe('ana');
    expect(bal(st, 'ana')).toBe(50);
    expect(st.loans!.ana).toBeUndefined();
    const pen = st.tx.filter((t) => t.kind === 'penhora').reverse();
    expect(pen.map((t) => t.amount)).toEqual([250, 250, 250, 500, 500, 500]);
    expect(pen.slice(3).map((t) => t.space)).toEqual([BEIRA_MAR, BRASIL, NOVE_JULHO]);
    expect(st.feed.map((f) => f.text)).toContain('Penhora: o banco tomou a Av. Beira Mar de Ana');
    expect(pl(st, 'ana').out).toBe(false);
  });

  it('penhora para assim que cobre e imóvel já hipotecado vale 0', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    st = toEve(st);
    st = give(st, 'ana', [BEIRA_MAR, PAULISTA, FARIA_LIMA]);
    st.props[BEIRA_MAR].mortgaged = true;
    st.players[0].balance = 1000;
    st = pass(st);
    // Beira Mar (hipotecada) +0, Faria Lima ($1.400) +700 → 1.700, Paulista ($1.600) +800 → 2.500
    expect(st.props[BEIRA_MAR]).toBeUndefined();
    expect(st.props[FARIA_LIMA]).toBeUndefined();
    expect(st.props[PAULISTA]).toBeUndefined();
    expect(bal(st, 'ana')).toBe(300);
    const pen = st.tx.filter((t) => t.kind === 'penhora').reverse();
    expect(pen.map((t) => [t.space, t.amount])).toEqual([
      [BEIRA_MAR, 0],
      [FARIA_LIMA, 700],
      [PAULISTA, 800],
    ]);
  });

  it('penhora que não cobre leva à falência para o banco', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    st = toEve(st);
    st = give(st, 'ana', [BEIRA_MAR]);
    st.shares[BANCO_AURORA] = { ana: 2 };
    st.players[0].balance = 100;
    st = pass(st);
    expect(pl(st, 'ana').out).toBe(true);
    expect(st.props[BEIRA_MAR]).toBeUndefined();
    expect(st.shares[BANCO_AURORA]).toEqual({});
    expect(st.loans!.ana).toBeUndefined();
    expect(st.winner).toBe('beto');
    expect(st.tx[0]).toMatchObject({ from: 'ana', to: 'bank', amount: 600, kind: 'loanpay' });
  });

  it('com 3 jogadores, quem faliu na penhora perde a vez e o jogo segue', () => {
    let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
    st = act(st, 'beto', { type: 'join', name: 'Beto' });
    st = act(st, 'caio', { type: 'join', name: 'Caio' });
    st = act(st, 'ana', { type: 'setMercado', on: false });
    st = act(st, 'ana', { type: 'start' });
    st = act(st, 'ana', { type: 'takeLoan', amount: 2000 });
    while (!(st.round === 5 && st.turn === 2)) st = pass(st);
    st.players[0].balance = 0;
    st = pass(st);
    expect(pl(st, 'ana').out).toBe(true);
    expect(st.winner).toBeNull();
    expect(st.round).toBe(6);
    expect(st.players[st.turn].id).toBe('beto');
  });

  it('desfazer funciona com empréstimo e com a cobrança', () => {
    const taken = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    const undone = act(taken, 'ana', { type: 'undo' });
    expect(undone.loans).toEqual({});
    expect(bal(undone, 'ana')).toBe(25000);
    const eve = toEve(taken);
    const collected = pass(eve);
    const back = act(collected, 'beto', { type: 'undo' });
    expect(back.loans!.ana).toBeDefined();
    expect(back.turn).toBe(1);
  });

  it('falência declarada com empréstimo apaga a dívida', () => {
    let st = act(game(), 'ana', { type: 'takeLoan', amount: 2000 });
    st = act(st, 'ana', { type: 'bankrupt', debtor: 'ana', creditor: 'beto' });
    expect(st.loans!.ana).toBeUndefined();
    expect(bal(st, 'beto')).toBe(25000 + 27000);
  });

  it('salas antigas sem os campos novos continuam funcionando', () => {
    const st = game();
    delete st.trades;
    delete st.loans;
    delete st.tradeCount;
    expect(loanLimit(st, 'ana')).toBe(12500);
    const next = act(st, 'ana', { type: 'takeLoan', amount: 1000 });
    expect(next.loans!.ana.principal).toBe(1000);
    const t = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: side({ money: 10 }), get: side() });
    expect(t.trades![0].id).toBe('ABCDE-N001');
  });
});
