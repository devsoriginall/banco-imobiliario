// Jornal completo: cadernos (Economia, Bolsa, Polícia, Imóveis, Negócios) com o que aconteceu na rodada.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EditionPaper } from '@/components/MercadoView';
import { JAIL_STORIES } from './data';
import { money } from './format';
import { applyAction, emptySide, jailStory, newRoom } from './rules';
import type { Action, GameState, JornalNote } from './types';

const NOVE_JULHO = 1;
const BRASIL = 2;
const BANCO_AURORA = 3;
const GOTOJAIL = 30;
const FERIADO = 20;
const now = new Date('2026-01-01T12:00:00Z');
const act = (st: GameState, actor: string, a: Action) => applyAction(st, a, { actor, now, rng: () => 0.5 });

function game(): GameState {
  let st = newRoom('ABCDE', { id: 'ana', name: 'Ana' }, now);
  st = act(st, 'beto', { type: 'join', name: 'Beto' });
  return act(st, 'ana', { type: 'start' });
}
const pass = (st: GameState) => {
  const id = st.players[st.turn].id;
  return act(act(st, id, { type: 'land', idx: FERIADO }), id, { type: 'endTurn', again: false });
};
const toRound = (st: GameState, r: number) => {
  while (st.round < r) st = pass(st);
  return st;
};
const notes = (st: GameState, round: number, sec?: JornalNote['sec']) => (st.jornal!.find((e) => e.round === round)?.notes ?? []).filter((n) => !sec || n.sec === sec);
const allText = (st: GameState) =>
  (st.jornal ?? [])
    .flatMap((e) => e.notes ?? [])
    .map((n) => `${n.title} ${n.text ?? ''} ${(n.movers ?? []).map((m) => m.name).join(' ')}`.replace(/\s/g, ' '))
    .join('\n');

describe('cadernos do Jornal', () => {
  it('a edição 1 abre com a partida e a Selic no caderno de Economia', () => {
    const st = game();
    const eco = notes(st, 1, 'economia').map((n) => n.title);
    expect(eco[0]).toBe('Começa a partida');
    expect(eco[1]).toMatch(/^Taxa Selic do semestre: /);
  });

  it('cada nota vai para a edição da rodada em que aconteceu e para o caderno certo', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy' });
    const buy1 = notes(st, 1, 'imoveis').filter((n) => n.title.includes(' compra '));
    expect(buy1.map((n) => n.title)).toEqual(['Ana compra a Av. 9 de Julho']);
    expect(buy1[0].text?.replace(/\s/g, ' ')).toBe('Terreno de tabela $ 1.000.');
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = pass(st); // Beto: começa a rodada 2
    expect(st.jornal![0].round).toBe(2);
    st = act(st, 'ana', { type: 'land', idx: BRASIL });
    st = act(st, 'ana', { type: 'buy' });
    const buys = (r: number) => notes(st, r, 'imoveis').filter((n) => n.title.includes(' compra ')).map((n) => n.title);
    expect(buys(2)).toEqual(['Ana compra a Av. Brasil']);
    expect(buys(1)).toEqual(['Ana compra a Av. 9 de Julho']);
  });

  it('na rodada 4 a Bolsa traz os dividendos pagos e o sobe e desce', () => {
    let st = game();
    st = structuredClone(st);
    st.shares[BANCO_AURORA] = { ana: 2 };
    st = toRound(st, 3);
    expect(notes(st, 3, 'bolsa').some((n) => n.title === 'Dividendos anunciados para a rodada 4')).toBe(true);
    st = toRound(st, 4);
    const bolsa = notes(st, 4, 'bolsa');
    expect(bolsa.some((n) => n.title === 'Dividendos do semestre pagos' && n.text?.includes('Banco Aurora'))).toBe(true);
    const movers = bolsa.find((n) => n.movers)?.movers ?? [];
    expect(movers.length).toBeGreaterThan(0);
    expect(movers.length).toBeLessThanOrEqual(3);
    expect(movers.every((m) => m.pct !== 0)).toBe(true);
  });

  it('decisão da gerência vai para a Bolsa: o que foi decidido, sem o saldo de ninguém', () => {
    let st = game();
    st = structuredClone(st);
    st.shares[BANCO_AURORA] = { ana: 6 };
    st = act(st, 'ana', { type: 'manage', idx: BANCO_AURORA, decision: 'investir' });
    const n = notes(st, 1, 'bolsa').find((x) => x.title.startsWith('Gerência da Banco Aurora'))!;
    expect(n.title).toBe('Gerência da Banco Aurora investe na empresa');
    expect(n.text).toContain('Decisão de Ana');
  });
});

describe('caderno de Polícia', () => {
  it('quem cai em "Vá para a detenção" ganha uma história, igual em todos os celulares', () => {
    let st = game();
    const a = act(st, 'ana', { type: 'land', idx: GOTOJAIL });
    const b = act(structuredClone(st), 'ana', { type: 'land', idx: GOTOJAIL });
    const pa = notes(a, 1, 'policia');
    expect(pa).toHaveLength(1);
    expect(pa[0].title).toBe('Ana vai para a detenção');
    expect(pa[0].text).toBe(notes(b, 1, 'policia')[0].text);
    expect(pa[0].text).toMatch(/^Ana /);
    expect(JAIL_STORIES.some((t) => pa[0].text!.startsWith(t.split('{rua}')[0].replace('{nome}', 'Ana')) && pa[0].text!.endsWith(t.split('{rua}')[1]))).toBe(true);
    // a história não gasta o sorteio da sala
    expect(a.seed).toBe(st.seed);
    // para uma semente fixa, a mesma história
    st = structuredClone(st);
    st.seed = 12345;
    expect(jailStory(st, 'Ana')).toBe(jailStory(structuredClone(st), 'Ana'));
    expect(JAIL_STORIES.length).toBeGreaterThanOrEqual(20);
  });

  it('pagar a fiança vira nota de saída', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: GOTOJAIL });
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = pass(st);
    st = act(st, 'ana', { type: 'bail' });
    expect(notes(st, 2, 'policia').map((n) => n.title)).toContain('Ana paga a fiança');
  });
});

describe('o que nunca sai no Jornal', () => {
  it('nem saldos, nem valores de negociação, nem empréstimo', () => {
    let st = game();
    st = act(st, 'ana', { type: 'land', idx: NOVE_JULHO });
    st = act(st, 'ana', { type: 'buy', finance: 'x3' });
    st = act(st, 'ana', { type: 'takeLoan', amount: 1500, plan: 'x2' });
    st = act(st, 'ana', { type: 'proposeTrade', to: 'beto', give: { ...emptySide(), money: 777 }, get: { ...emptySide(), props: [] } });
    st = act(st, 'beto', { type: 'acceptTrade', id: st.trades![0].id });
    expect(notes(st, 1, 'negocios').map((n) => n.title)).toEqual(['Negócio fechado entre Ana e Beto']);
    expect(notes(st, 1, 'negocios')[0].text).toBe('Beto fica com dinheiro.');
    st = act(st, 'ana', { type: 'endTurn', again: false });
    st = toRound(st, 7);
    const text = allText(st);
    expect(text).not.toContain('777');
    expect(text).not.toContain('1.500');
    for (const p of st.players) expect(text).not.toContain(money(p.balance).replace(/\s/g, ' '));
    expect(text).not.toMatch(/parcela|emprestado|financiad|entrada de|pagou \$/i);
  });
});

describe('salas antigas', () => {
  it('edição sem notas aparece como antes, só com a manchete', () => {
    const st = game();
    const old = { ...st.jornal![0] };
    delete old.notes;
    const html = renderToStaticMarkup(createElement(EditionPaper, { state: st, ed: old, full: true }));
    expect(html).toContain('paper-head');
    expect(html).toContain('Edição 1 · Ano 1 · rodada 1 · 1 notícia');
    expect(html).not.toContain('caderno-head');
    const modal = renderToStaticMarkup(createElement(EditionPaper, { state: st, ed: st.jornal![0] }));
    expect(modal).not.toContain('caderno-head');
    const full = renderToStaticMarkup(createElement(EditionPaper, { state: st, ed: st.jornal![0], full: true }));
    expect(full).toContain('Economia');
  });

  it('numa sala antiga a próxima nota começa a lista da edição', () => {
    let st = game();
    st = structuredClone(st);
    delete st.jornal![0].notes;
    st = act(st, 'ana', { type: 'land', idx: GOTOJAIL });
    expect(notes(st, 1).map((n) => n.sec)).toEqual(['policia']);
  });
});
