// Resumo da rodada: agrupa o que mexeu no meu dinheiro sem eu fazer nada e só mostra o que é meu.
import { describe, expect, it } from 'vitest';
import { COMPANY_IDX } from '@/lib/game/data';
import { applyAction, newRoom } from '@/lib/game/rules';
import type { Action, GameState } from '@/lib/game/types';
import { joinNames, markNow, roundSummary, summaryTx } from './summary';

const NOVE_JULHO = 1;
const BRASIL = 2;
const FERIADO = 20;
const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, a: Action) => applyAction(st, a, { actor, now, rng: () => 0.5 });
const n = (x: string) => x.replace(/\s/g, ' ');

function game(): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  st = act(st, 'ana', { type: 'start' });
  return st;
}
const pass = (st: GameState) => {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
};
const toAna = (st: GameState, round: number) => {
  while (!(st.round === round && st.turn === 0)) st = pass(st);
  return st;
};

/** Ana financia dois terrenos em 3x (parcelas nas rodadas 4, 7 e 10) e tem cotas de 3 empresas. */
function withDebts(): GameState {
  let st = game();
  st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
  st = act(st, 'ana', { type: 'buy', finance: 'x3' });
  st = act(st, 'ana', { type: 'endTurn', again: false });
  st = pass(st); // Beto
  st = act(st, 'ana', { type: 'land', idx: BRASIL });
  st = act(st, 'ana', { type: 'buy', finance: 'x3' });
  st = act(st, 'ana', { type: 'endTurn', again: false });
  st = structuredClone(st);
  for (const i of COMPANY_IDX.slice(0, 3)) st.shares[i] = { ana: 2 };
  return st;
}

describe('resumo da rodada', () => {
  it('na virada do ano: 2 parcelas de financiamento numa linha, dividendos de 3 empresas numa linha e o aviso do IR', () => {
    let st = withDebts();
    st = toAna(st, 6);
    const mark = markNow(st);
    st = toAna(st, 7);
    const s = roundSummary(st, 'ana', mark)!;
    expect(s.round).toBe(7);
    const saiu = s.saiu.map((l) => n(l.text));
    const entrou = s.entrou.map((l) => n(l.text));
    expect(saiu).toContain('2 parcelas de financiamento');
    expect(entrou).toContain('Dividendos de 3 empresas');
    const parc = st.tx.filter((t) => t.kind === 'financiamento' && t.round === 7);
    expect(parc).toHaveLength(2);
    expect(s.saiu.find((l) => l.text === '2 parcelas de financiamento')!.amount).toBe(parc[0].amount + parc[1].amount);
    const divs = st.tx.filter((t) => t.kind === 'dividend' && t.round === 7 && t.to === 'ana');
    expect(s.entrou.find((l) => l.text === 'Dividendos de 3 empresas')!.amount).toBe(divs.reduce((a, t) => a + t.amount, 0));
    expect(s.avisos.some((a) => a.startsWith('O ano 1 fechou'))).toBe(true);
    // saldo: depois = carteira de agora; antes = depois − o que entrou + o que saiu
    expect(s.after).toBe(st.players[0].balance);
    const net = s.entrou.reduce((a, l) => a + (l.savings ? 0 : l.amount), 0) - s.saiu.reduce((a, l) => a + l.amount, 0);
    expect(s.before).toBe(s.after - net);
  });

  it('a última parcela vira aviso de quitação com os dois imóveis juntos', () => {
    let st = withDebts();
    st = toAna(st, 9);
    const mark = markNow(st);
    st = toAna(st, 10);
    const s = roundSummary(st, 'ana', mark)!;
    expect(s.avisos[0]).toBe('Av. 9 de Julho e Av. Brasil quitadas: não estão mais alienadas ao banco');
  });

  it('não entra o que eu mesmo fiz nem o dinheiro dos outros; nada mudou, sem resumo', () => {
    let st = withDebts();
    st = toAna(st, 5);
    const mark = markNow(st);
    // a própria compra da Ana e as parcelas do Beto (ele não tem) não aparecem
    st = act(st, 'ana', { type: 'land', idx: 5 });
    st = act(st, 'ana', { type: 'buy' });
    expect(summaryTx(st, 'ana', mark.tx)).toHaveLength(0);
    expect(roundSummary(st, 'beto', mark)).toBeNull();
    expect(roundSummary(st, 'ana', mark)).toBeNull();
  });

  it('aluguel que o Beto me pagou entra; o que eu paguei não', () => {
    let st = withDebts();
    st = toAna(st, 5);
    const mark = markNow(st);
    st = act(st, 'ana', { type: 'land', idx: FERIADO });
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = act(st, 'beto', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'beto', { type: 'payRent' });
    const s = roundSummary(st, 'ana', mark)!;
    expect(s.entrou.map((l) => n(l.text))).toEqual(['Aluguel da Av. 9 de Julho · Beto']);
    expect(roundSummary(st, 'beto', mark)).toBeNull();
  });

  it('marca as automáticas e quem fez cada transação', () => {
    let st = withDebts();
    st = toAna(st, 4);
    const r4 = st.tx.filter((t) => t.round === 4);
    expect(r4.filter((t) => t.kind === 'financiamento').every((t) => t.auto && !t.by)).toBe(true);
    expect(st.tx.filter((t) => t.kind === 'buy').every((t) => t.by === 'ana' && !t.auto)).toBe(true);
  });

  it('junta nomes', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A e B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B e C');
  });
});

describe('eventos do dinheiro de um jogador só', () => {
  it('parcela e quitação levam o dono (for) e não são para os outros', () => {
    let st = withDebts();
    st = toAna(st, 4);
    const parcel = st.feed.filter((f) => f.text.startsWith('Parcela 1/3 do financiamento'));
    expect(parcel.length).toBe(2);
    expect(parcel.every((f) => f.for === 'ana' && f.important)).toBe(true);
    st = toAna(st, 10);
    expect(st.feed.filter((f) => f.text.includes('quitou o financiamento')).every((f) => f.for === 'ana')).toBe(true);
    // eventos públicos ficam sem dono
    expect(st.feed.filter((f) => f.text.startsWith('Fim do ano')).every((f) => !f.for)).toBe(true);
  });
});
