'use client';
// Avisos em 3 tipos: a faixa "Precisa de você" (no topo da Jogada, fica até resolver) e o resumo da rodada
// ("Seu dinheiro", uma vez por rodada). Os avisos curtos do meio da rodada ficam em Toasts.
import { useEffect, useState } from 'react';
import { SPACES } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { calendarText, currentPlayer, debtOf, findPlayer, isParcelado, loanOf, loanRoundsLeft, othersHoldShares, ownedBy, pname, savingsOf, shortPayers, transfersFor, tradesOf } from '@/lib/game/rules';
import type { Action, GameState, IrPending, Transfer } from '@/lib/game/types';
import { markNow, roundSummary, type SummaryMark } from '@/lib/room/summary';
import { Sheet } from './Modals';

export interface NeedItem {
  key: string;
  title: string;
  text?: string;
  button?: { label: string; onClick: () => void };
}

/** Pagamento obrigatório da casa onde parei que o meu saldo não cobre (aluguel, imposto, taxa, notícia). */
function shortHere(state: GameState, me: string): number {
  const ti = state.turnInfo;
  const p = currentPlayer(state);
  if (!p || p.id !== me || ti.landed === null || ti.resolved) return 0;
  const s = SPACES[ti.landed];
  const acts: Action[] = [];
  if (ti.news !== null) acts.push({ type: 'applyNews' });
  if (s.type === 'street' && ownedBy(state, ti.landed) && ownedBy(state, ti.landed) !== me && !state.props[ti.landed].mortgaged) acts.push({ type: 'payRent' });
  if (s.type === 'tax') acts.push({ type: 'payTax' });
  if (s.type === 'company' && !ti.feePaid && othersHoldShares(state, ti.landed, me)) acts.push({ type: 'payFee', dice: ti.dice ?? 2 });
  for (const a of acts) {
    let list: Transfer[];
    try {
      list = transfersFor(state, a, me);
    } catch {
      continue;
    }
    if (list.length && shortPayers(state, list).includes(me)) return list.filter((t) => t.from === me).reduce((x, t) => x + t.amount, 0);
  }
  return 0;
}

/** O que está esperando por mim agora, na ordem da faixa. */
export function needItems(
  state: GameState,
  me: string,
  opts: { ir: IrPending | null; onDeclare: () => void; goTab: (t: 'banco' | 'imoveis') => void },
): NeedItem[] {
  const mine = findPlayer(state, me);
  if (state.phase !== 'playing' || state.winner || !mine || mine.out) return [];
  const out: NeedItem[] = [];
  const cur = currentPlayer(state);
  const ti = state.turnInfo;
  if (cur?.id === me && ti.landed === null) out.push({ key: 'turn', title: 'Sua vez', text: mine.jailed ? 'Detido: tente a dupla, pague a fiança ou use a carta.' : 'Jogue os dados e toque na soma que tirou.' });
  for (const t of tradesOf(state).filter((x) => x.to === me))
    out.push({
      key: `trade-${t.id}`,
      title: `Proposta de ${pname(state, t.from)}`,
      text: 'Aceite ou recuse no cartão da proposta.',
      button: {
        label: 'Ver proposta',
        onClick: () => {
          const el = document.querySelector<HTMLElement>(`[data-trade="${t.id}"]`);
          if (!el) return;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
        },
      },
    });
  if (opts.ir)
    out.push({
      key: 'ir',
      title: opts.ir.caught ? `Malha fina: pague ${money(opts.ir.due)}` : `Declaração do IR do ano ${opts.ir.year}`,
      text: 'Entregue antes de passar a vez.',
      button: { label: 'Declarar', onClick: opts.onDeclare },
    });
  const loan = loanOf(state, me);
  if (loan && !isParcelado(loan) && loanRoundsLeft(state, me) === 1)
    out.push({
      key: 'loan',
      title: 'Empréstimo vence na próxima rodada',
      text: `Pague ${money(debtOf(state, me))} até a sua próxima vez, ou o banco cobra e faz a penhora.`,
      button: { label: 'Ir ao Banco', onClick: () => opts.goTab('banco') },
    });
  const short = shortHere(state, me);
  if (short)
    out.push({
      key: 'short',
      title: `Falta dinheiro: ${money(short)} a pagar`,
      text: savingsOf(mine) > 0 ? 'Resgate da poupança, hipoteque ou venda casas.' : 'Hipoteque ou venda casas, ou peça um empréstimo.',
      button: { label: 'Levantar dinheiro', onClick: () => opts.goTab(savingsOf(mine) > 0 ? 'banco' : 'imoveis') },
    });
  return out;
}

/** Faixa amarela fixa no topo da Jogada: fica até o assunto ser resolvido. */
export function NeedsYou({ items }: { items: NeedItem[] }) {
  if (!items.length) return null;
  return (
    <section className="needs" aria-label="Precisa de você" data-testid="needs-you">
      <span className="needs-label">Precisa de você</span>
      {items.map((it) => (
        <div key={it.key} className={`need${it.key === 'turn' ? ' compact' : ''}`} data-testid={`need-${it.key.replace(/-.*/, '')}`}>
          <div className="need-txt">
            <b>{it.title}</b>
            {it.text && <span>{it.text}</span>}
          </div>
          {it.button && (
            <button className="btn small need-btn" onClick={it.button.onClick}>
              {it.button.label}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

// ---------- Resumo da rodada ----------

/** Marcas guardadas sem localStorage (navegação privada) valem enquanto a página estiver aberta. */
const memMarks = new Map<string, SummaryMark>();

function readMark(key: string): SummaryMark | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw) {
      const m = JSON.parse(raw) as SummaryMark;
      if (Number.isFinite(m.round) && Number.isFinite(m.tx) && Number.isFinite(m.feed)) return m;
    }
  } catch {}
  return memMarks.get(key) ?? null;
}

function writeMark(key: string, m: SummaryMark) {
  memMarks.set(key, m);
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {}
}

/**
 * Resumo do que mexeu no meu dinheiro desde o último resumo, assim que a rodada muda (não só na minha vez).
 * A marca fica neste celular (sala + jogador); sem nada para mostrar, ela só avança.
 */
export function useRoundSummary(state: GameState, me: string) {
  const key = `resumo:${state.code}:${me}`;
  // só para redesenhar depois do "OK, entendi" (a marca em si fica no localStorage)
  const [, setClosedAt] = useState(0);
  const stored = readMark(key);
  const active = state.phase === 'playing' && !state.winner && !!findPlayer(state, me);
  const due = active && !!stored && state.round > stored.round;
  const summary = due && stored ? roundSummary(state, me, stored) : null;
  const advance = active && (!stored || (due && !summary));
  useEffect(() => {
    if (advance) writeMark(key, markNow(state));
  }, [advance, key, state]);
  const close = () => {
    const m = markNow(state);
    writeMark(key, m);
    setClosedAt(m.tx * 1e6 + m.feed);
  };
  return { summary, close };
}

export function RoundSummarySheet({ summary, onClose }: { summary: NonNullable<ReturnType<typeof roundSummary>>; onClose: () => void }) {
  const s = summary;
  return (
    <Sheet label="Resumo da rodada">
      <div className="sum-head">
        <span className="label">Seu dinheiro</span>
        <h2>Rodada {s.round} começou</h2>
        <span className="muted">{calendarText(s.round)}</span>
      </div>
      {s.entrou.length > 0 && (
        <section className="sum-sec" data-testid="summary-in">
          <span className="sum-title in">Entrou</span>
          {s.entrou.map((l) => (
            <div key={l.text} className="sum-line">
              <span>{l.text}</span>
              <b className="num in">+{money(l.amount)}</b>
            </div>
          ))}
        </section>
      )}
      {s.saiu.length > 0 && (
        <section className="sum-sec" data-testid="summary-out">
          <span className="sum-title out">Saiu</span>
          {s.saiu.map((l) => (
            <div key={l.text} className="sum-line">
              <span>{l.text}</span>
              <b className="num out">−{money(l.amount)}</b>
            </div>
          ))}
        </section>
      )}
      {s.avisos.length > 0 && (
        <section className="sum-sec" data-testid="summary-notes">
          <span className="sum-title">Avisos</span>
          <ul className="sum-notes">
            {s.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="sum-total num" data-testid="summary-balance">
        <span>Saldo</span>
        <b>
          {money(s.before)} → {money(s.after)}
        </b>
      </div>
      <button className="btn primary block" onClick={onClose}>
        OK, entendi
      </button>
      <span className="muted sum-foot">Cada linha fica no Extrato.</span>
    </Sheet>
  );
}
