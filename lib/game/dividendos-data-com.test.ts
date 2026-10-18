// Dividendos com anúncio ("data com") na rodada antes do pagamento e queda da cota no pagamento (data ex).
import { describe, expect, it } from 'vitest';
import { HEADLINES, STOCK } from './data';
import { money } from './format';
import { announcedDividend, applyAction, dividendPerShare, newRoom, sharePrice } from './rules';
import type { Action, GameState } from './types';

const VOX = 29;
const FERIADO = 20;
const now = new Date('2026-01-01T12:00:00Z');
const half = () => 0.5;
const act = (st: GameState, actor: string, action: Action) => applyAction(st, action, { actor, now, rng: half });
/** Manchete sem efeito na Bolsa. */
const QUIET = HEADLINES.findIndex((h) => h.tag === 'Calçadão novo');

function game(): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  return act(st, 'ana', { type: 'start' });
}
const bal = (st: GameState, id: string) => st.players.find((p) => p.id === id)!.balance;
function pass(st: GameState): GameState {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
}
/** Passa a vez até começar a próxima rodada, com uma manchete sem efeito na Bolsa. */
function nextRound(st: GameState): GameState {
  let s = structuredClone(st);
  s.jornalDeck = [QUIET, ...HEADLINES.map((_, i) => i).filter((i) => i !== QUIET)];
  s.jornalPtr = 0;
  const r = s.round;
  while (s.round === r) s = pass(s);
  return s;
}
function giveShares(st: GameState, i: number, owners: Record<string, number>): GameState {
  const s = structuredClone(st);
  s.shares[i] = { ...owners };
  return s;
}
function setPrice(st: GameState, i: number, price: number): GameState {
  const s = structuredClone(st);
  s.stocks![i] = { ...s.stocks![i], price, hist: [...s.stocks![i].hist.slice(0, -1), price] };
  return s;
}
/** Cotação da rodada seguinte antes da data ex: a mesma rodada sem dividendo a pagar (mesmo sorteio da sala). */
function priceBeforeEx(st: GameState): number {
  const c = structuredClone(st);
  c.stocks![VOX].divAnnounced = { round: c.round + 1, perShare: 0 };
  return sharePrice(nextRound(c), VOX);
}
const clamp = (x: number) => Math.min(STOCK.max, Math.max(STOCK.min, Math.round(x / STOCK.round) * STOCK.round));
const divTo = (st: GameState, pid: string) => st.tx.filter((t) => t.kind === 'dividend' && t.to === pid && t.space === VOX && t.round === st.round);

describe('Dividendos: anúncio e data com', () => {
  it('anuncia e guarda o valor na rodada antes do pagamento, pela cotação de então × rendimento do semestre', () => {
    let st = nextRound(game()); // rodada 2: sem anúncio
    expect(st.stocks![VOX].divAnnounced).toBeUndefined();
    expect(announcedDividend(st, VOX)).toBeNull();
    st = nextRound(st); // rodada 3: anúncio para a rodada 4, pela cotação depois da variação da rodada
    const each = Math.round(sharePrice(st, VOX) * STOCK.yield * 3);
    expect(each).toBeGreaterThan(0);
    expect(st.stocks![VOX].divAnnounced).toEqual({ round: 4, perShare: each });
    expect(announcedDividend(st, VOX)).toEqual({ round: 4, perShare: each });
  });

  it('paga o valor anunciado mesmo que a cotação tenha mudado depois', () => {
    let st = giveShares(nextRound(game()), VOX, { ana: 2 });
    st = nextRound(st); // rodada 3: anuncia
    const each = announcedDividend(st, VOX)!.perShare;
    st = setPrice(st, VOX, 900);
    expect(dividendPerShare(st, VOX, 4)).not.toBe(each);
    const a0 = bal(st, 'ana');
    st = nextRound(st); // rodada 4
    expect(divTo(st, 'ana')[0].amount).toBe(2 * each);
    expect(bal(st, 'ana')).toBe(a0 + 2 * each);
    expect(st.stocks![VOX].divAnnounced).toBeUndefined();
  });

  it('cotas compradas depois do anúncio, antes do começo da rodada do pagamento, recebem', () => {
    let st = nextRound(nextRound(game())); // rodada 3, vez da Ana
    expect(st.turn).toBe(0);
    st = act(st, 'ana', { type: 'land', idx: VOX });
    st = act(st, 'ana', { type: 'buyShares', qty: 1 });
    expect(st.shares[VOX].ana).toBe(1);
    const each = announcedDividend(st, VOX)!.perShare;
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = nextRound(st);
    expect(st.round).toBe(4);
    expect(divTo(st, 'ana')[0].amount).toBe(each);
  });

  it('greve ativa no pagamento: paga zero e avisa que foi suspenso', () => {
    const st0 = giveShares(nextRound(nextRound(game())), VOX, { ana: 3 });
    expect(announcedDividend(st0, VOX)!.perShare).toBeGreaterThan(0);
    st0.stocks![VOX].yieldMods = [{ zero: true, from: 4, until: 4, why: 'Greve' }];
    const price = priceBeforeEx(st0);
    const st = nextRound(st0);
    expect(divTo(st, 'ana')).toHaveLength(0);
    expect(st.feed.some((f) => f.text === 'Dividendos da Vox Telecom: suspenso por greve')).toBe(true);
    expect(sharePrice(st, VOX)).toBe(price); // sem dividendo, sem queda
  });
});

describe('Dividendos: data ex', () => {
  it('no pagamento a cota cai o dividendo por cota, depois da variação da rodada, e o histórico fica com o preço final', () => {
    let st = giveShares(setPrice(nextRound(game()), VOX, 1000), VOX, { ana: 1 });
    st = nextRound(st); // rodada 3: anuncia
    const each = announcedDividend(st, VOX)!.perShare;
    expect(each).toBeGreaterThan(50);
    const len = st.stocks![VOX].hist.length;
    const before = priceBeforeEx(st);
    st = nextRound(st); // rodada 4
    expect(divTo(st, 'ana')[0].amount).toBe(each);
    const after = clamp(before - each);
    expect(Math.abs(before - each - after)).toBeLessThanOrEqual(STOCK.round / 2);
    expect(sharePrice(st, VOX)).toBe(after);
    expect(st.stocks![VOX].hist.at(-1)).toBe(after);
    expect(st.stocks![VOX].hist).toHaveLength(len + 1);
    expect(st.feed.some((f) => f.text === `Vox Telecom: cota ajustada −${money(before - after)} após os dividendos (data ex)`)).toBe(true);
  });

  it('a queda respeita a cotação mínima', () => {
    let st = giveShares(nextRound(nextRound(game())), VOX, { ana: 1 });
    st = setPrice(st, VOX, 100);
    st.stocks![VOX].divAnnounced = { round: 4, perShare: 100 };
    st = nextRound(st);
    expect(divTo(st, 'ana')[0].amount).toBe(100);
    expect(sharePrice(st, VOX)).toBe(STOCK.min);
    expect(st.stocks![VOX].hist.at(-1)).toBe(STOCK.min);
  });

  it('sala antiga, sem anúncio guardado: paga pela cotação do dia × rendimento, como antes', () => {
    let st = giveShares(nextRound(nextRound(game())), VOX, { ana: 2 });
    delete st.stocks![VOX].divAnnounced;
    const before = priceBeforeEx(st);
    const each = Math.round(before * STOCK.yield * 3); // cotação da rodada do pagamento × 9%
    st = nextRound(st);
    expect(divTo(st, 'ana')[0].amount).toBe(2 * each);
    expect(sharePrice(st, VOX)).toBe(clamp(before - each));
  });
});
