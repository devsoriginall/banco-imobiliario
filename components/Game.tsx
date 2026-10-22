'use client';
import { useState } from 'react';
import { money } from '@/lib/game/format';
import { calendarText, cdbTotal, currentPlayer, equity, findPlayer, finsOf, incomeOf, loanOf, loanOwed, loanRoundsLeft, nextChargeRound, nextParcel, savingsOf, yearOf } from '@/lib/game/rules';
import type { Action, GameState, IrResult, Tx } from '@/lib/game/types';
import { needItems, NeedsYou, RoundSummarySheet, useRoundSummary } from './Avisos';
import { BankView } from './BankView';
import { Icon } from './Icon';
import { ScoreView, TxView } from './LedgerViews';
import { JornalModal, MercadoView, type MercadoSeg } from './MercadoView';
import { ConfirmModal, IrExemptModal, IrModal, IrPassedModal, PixModal, ReceiptModal, type PixRequest } from './Modals';
import { PlayView } from './PlayView';
import { PropsView } from './PropsView';
import type { PushedReceipt, Run } from './Room';
import { TradeBuilder, TradeInbox } from './TradeViews';
import { Avatar } from './ui';

type Tab = 'jogada' | 'imoveis' | 'mercado' | 'banco' | 'extrato' | 'placar';
const TABS: [Tab, string][] = [
  ['jogada', 'Jogada'],
  ['imoveis', 'Imóveis'],
  ['mercado', 'Mercado'],
  ['banco', 'Banco'],
  ['extrato', 'Extrato'],
  ['placar', 'Placar'],
];

export interface GameUi {
  state: GameState;
  me: string;
  /** pede confirmação de Pix e, confirmado, mostra o comprovante */
  pix: (action: Action, title?: string) => void;
  /** executa direto e mostra o comprovante (dinheiro que entra) */
  runWithReceipt: (action: Action, title?: string) => Promise<void>;
  /** mostra o comprovante de transações já feitas */
  showReceipt: (txs: Tx[], title?: string) => void;
  run: Run;
  goTab: (t: Tab) => void;
  /** abre a empresa na Bolsa (aba Mercado) */
  openStock: (i: number) => void;
}

export function Game({ state, me, run, pushed, onPushedClose }: { state: GameState; me: string; run: Run; pushed?: PushedReceipt | null; onPushedClose?: () => void }) {
  const [tab, setTabRaw] = useState<Tab>('jogada');
  const [seg, setSeg] = useState<MercadoSeg>('jornal');
  const [stock, setStock] = useState<number | null>(null);
  const [pixReq, setPixReq] = useState<PixRequest | null>(null);
  const [receipt, setReceipt] = useState<{ txs: Tx[]; title?: string } | null>(null);
  const [tradeWith, setTradeWith] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  /** resultado de declarar menos (ou sonegar tudo) sem cair na malha fina */
  const [irPassed, setIrPassed] = useState<IrResult | null>(null);
  const irPending = state.irPending?.pid === me && !state.winner ? state.irPending : null;
  const mine = findPlayer(state, me);
  /** declaração deixada de lado para levantar dinheiro (volta sozinha se mudar o ano ou cair na malha fina) */
  const irKey = irPending ? `${state.code}:${me}:${irPending.year}:${irPending.caught ? 'malha' : 'ir'}` : null;
  const [irDeferred, setIrDeferred] = useState<string | null>(null);
  const irHidden = !!irKey && irDeferred === irKey;
  const irMine = irPending && !irHidden ? irPending : null;
  const irShort = !!irPending && (mine?.balance ?? 0) < irPending.due;
  const cur = currentPlayer(state);
  /** ano isento que acabou de fechar: mostra a declaração uma vez neste celular */
  const lastIr = mine?.irLast;
  const exemptKey = lastIr && lastIr.outcome === 'isento' && lastIr.round === state.round ? `ir-isento:${state.code}:${me}:${lastIr.year}` : null;
  const [seenExempt, setSeenExempt] = useState<string[]>([]);
  const irExempt = exemptKey && lastIr && !seenExempt.includes(exemptKey) && !wasSeen(exemptKey) ? lastIr : null;
  const closeExempt = () => {
    if (!exemptKey) return;
    try {
      sessionStorage.setItem(exemptKey, '1');
    } catch {}
    setSeenExempt((xs) => [...xs, exemptKey]);
  };

  /** edição do Jornal desta rodada: tela cheia uma vez por celular */
  const edition = state.jornal?.[0] && state.jornal[0].round === state.round && !state.winner ? state.jornal[0] : null;
  const jornalKey = edition ? `jornal:${state.code}:${edition.round}` : null;
  const [seenJornal, setSeenJornal] = useState<string[]>([]);
  const showJornal = jornalKey && !seenJornal.includes(jornalKey) && !wasSeen(jornalKey) ? edition : null;
  const closeJornal = () => {
    if (!jornalKey) return;
    try {
      sessionStorage.setItem(jornalKey, '1');
    } catch {}
    setSeenJornal((xs) => [...xs, jornalKey]);
  };

  /** Extrato: última transação minha já vista neste celular (seq); as mais novas ganham "novo" */
  const txKey = `extrato-visto:${state.code}:${me}`;
  const [seenTx, setSeenTx] = useState<{ key: string; seq: number } | null>(null);
  const storedTx = seenTx?.key === txKey ? seenTx.seq : readSeq(txKey);
  const myLastSeq = state.tx.reduce((a, t) => ((t.from === me || t.to === me) && t.seq > a ? t.seq : a), 0);
  /** o que já estava visto ao abrir o Extrato: as linhas mais novas mostram "novo" enquanto a aba fica aberta */
  const [txFloor, setTxFloor] = useState(0);
  const markTxSeen = () => {
    if (myLastSeq <= storedTx) return;
    try {
      localStorage.setItem(txKey, String(myLastSeq));
    } catch {}
    setSeenTx({ key: txKey, seq: myLastSeq });
  };
  const setTab = (t: Tab) => {
    if (t === 'extrato' && tab !== 'extrato') {
      setTxFloor(storedTx);
      markTxSeen();
    } else if (t !== 'extrato' && tab === 'extrato') markTxSeen();
    setTabRaw(t);
  };

  /** resumo da rodada ("Seu dinheiro"): aparece assim que a rodada muda, se algo mexeu no meu dinheiro */
  const { summary, close: closeSummary } = useRoundSummary(state, me);
  const summaryOpen = !!summary && !showJornal && !pixReq && !receipt && !pushed && !tradeWith;

  const ui: GameUi = {
    state,
    me,
    run,
    goTab: (t) => {
      setPixReq(null);
      setTab(t);
    },
    openStock: (i) => {
      setPixReq(null);
      setSeg('bolsa');
      setStock(i);
      setTab('mercado');
    },
    pix: (action, title) => setPixReq({ action, title }),
    runWithReceipt: async (action, title) => {
      const r = await run(action);
      if (r?.created.length) setReceipt({ txs: r.created, title });
    },
    showReceipt: (txs, title) => {
      if (txs.length) setReceipt({ txs, title });
    },
  };

  /** faixa "Precisa de você" da Jogada (fica até resolver); em outra aba, a Jogada ganha o ponto */
  const needs = needItems(state, me, { ir: irPending, onDeclare: () => setIrDeferred(null), goTab: (t) => ui.goTab(t) });

  return (
    <>
      <main className="app">
        <div className="top">
          <div className="top-meta">
            <span className="meta">
              Sala <b>{state.code}</b> · Rodada {state.round}
            </span>
            {state.phase === 'playing' && (
              <span className="meta cal" data-testid="calendar">
                {calendarText(state.round)}
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 6 }}>
            {state.prev && state.prevBy === me && (
              <button className="btn small" onClick={() => run({ type: 'undo' })}>
                Desfazer
              </button>
            )}
            {state.hostId === me && (
              <button className="btn small ghost" onClick={() => setConfirmReset(true)}>
                Nova partida
              </button>
            )}
          </div>
        </div>

        {mine ? (
          <div className={`wallet${mine.out ? ' out' : ''}`} data-testid="wallet">
            <Avatar name={mine.name} color={mine.color} style={{ width: 40, height: 40, borderRadius: 20 }} />
            <div className="wallet-main">
              <div className="lbl">{mine.out ? 'Você faliu' : 'Sua carteira'}</div>
              <div className="big num" data-testid="wallet-balance">
                {money(mine.balance)}
              </div>
            </div>
            <div className="wallet-side">
              <span>Patrimônio {money(equity(state, mine))}</span>
              {!mine.out && <span data-testid="wallet-income">Renda no ano {yearOf(state.round)}: {money(incomeOf(mine))}</span>}
            </div>
            <WalletChips state={state} me={me} />
          </div>
        ) : (
          <div className="banner info">Você está assistindo esta partida. Ela começou antes de você entrar.</div>
        )}

        {tab === 'jogada' && <NeedsYou items={needs} />}

        <TradeInbox ui={ui} />

        {tab === 'jogada' && <PlayView ui={ui} />}
        {tab === 'imoveis' && <PropsView ui={ui} />}
        {tab === 'mercado' && <MercadoView ui={ui} seg={seg} setSeg={setSeg} stock={stock} setStock={setStock} />}
        {tab === 'banco' && <BankView ui={ui} onTrade={setTradeWith} />}
        {tab === 'extrato' && <TxView state={state} me={me} newAfter={txFloor} />}
        {tab === 'placar' && <ScoreView state={state} />}
      </main>

      <nav className="tabs">
        <div className="inner" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} className={`tab t-${k}`} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              <span className="tab-ic">
                <Icon name={k} />
                {k === 'jogada' && tab !== 'jogada' && (needs.length > 0 || (cur?.id === me && !state.winner)) && <i className="tab-badge" aria-label="precisa de você" data-testid="jogada-badge" />}
                {k === 'extrato' && tab !== 'extrato' && myLastSeq > storedTx && <i className="tab-badge" aria-label="transações novas" data-testid="extrato-badge" />}
              </span>
              {l}
            </button>
          ))}
        </div>
      </nav>

      {pixReq && (
        <PixModal
          state={state}
          me={me}
          req={pixReq}
          onCancel={() => setPixReq(null)}
          onGoProps={() => ui.goTab('imoveis')}
          onBankrupt={async (debtor, creditor) => {
            setPixReq(null);
            await run({ type: 'bankrupt', debtor, creditor });
          }}
          onConfirm={async () => {
            const r = await run(pixReq.action);
            setPixReq(null);
            const titles: Partial<Record<Action['type'], string>> = { payLoan: 'Pagamento ao banco', declareIR: 'Imposto de renda pago' };
            if (r?.created.length) setReceipt({ txs: r.created, title: titles[pixReq.action.type] });
          }}
        />
      )}
      {tradeWith && !pixReq && <TradeBuilder ui={ui} partner={tradeWith} onClose={() => setTradeWith(null)} />}
      {!pixReq && !tradeWith && receipt && <ReceiptModal state={state} receipt={receipt.txs} title={receipt.title} onClose={() => setReceipt(null)} />}
      {!pixReq && !tradeWith && !receipt && pushed && <ReceiptModal state={state} receipt={pushed.txs} title={pushed.title} onClose={() => onPushedClose?.()} />}
      {summaryOpen && summary && <RoundSummarySheet summary={summary} onClose={closeSummary} />}
      {irMine && !pixReq && !tradeWith && !receipt && !pushed && !summaryOpen && !showJornal && (
        <IrModal
          key={irKey ?? undefined}
          ir={irMine}
          short={irShort}
          balance={mine?.balance ?? 0}
          onRaise={() => setIrDeferred(irKey)}
          onDeclare={() => setPixReq({ action: { type: 'declareIR' }, title: irMine.caught ? (irMine.declared ? 'Malha fina: imposto que faltou + multa' : 'Malha fina: imposto + multa') : 'Imposto de renda' })}
          onEvade={async (declared) => {
            const r = await run({ type: 'evadeIR', declared });
            const last = r && findPlayer(r.state, me)?.irLast;
            if (!r || !last) return;
            if (last.outcome === 'passou') setIrPassed(last);
            else if (r.created.length) setReceipt({ txs: r.created, title: declared > 0 ? `Malha fina: declarou ${money(declared)} de ${money(last.income)}` : 'Malha fina' });
          }}
        />
      )}
      {irPassed !== null && !pixReq && !receipt && <IrPassedModal result={irPassed} onClose={() => setIrPassed(null)} />}
      {irExempt && !irMine && !pixReq && !receipt && !pushed && !summaryOpen && <IrExemptModal year={irExempt.year} income={irExempt.income} onClose={closeExempt} />}
      {showJornal && !pixReq && !receipt && !pushed && (
        <JornalModal
          key={showJornal.round}
          state={state}
          ed={showJornal}
          onClose={closeJornal}
          onHistory={() => {
            closeJornal();
            setSeg('jornal');
            setTab('mercado');
          }}
        />
      )}
      {confirmReset && (
        <ConfirmModal
          title="Começar uma nova partida?"
          text="Todos voltam para a sala de espera. A partida atual e o extrato serão apagados."
          confirm="Apagar e voltar à sala"
          onConfirm={async () => {
            setConfirmReset(false);
            await run({ type: 'reset' });
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </>
  );
}

/** Linha extra da carteira, só quando há o que mostrar: poupança, CDB e dívida com o banco (empréstimo e financiamentos). */
function WalletChips({ state, me }: { state: GameState; me: string }) {
  const p = findPlayer(state, me);
  const savings = p ? savingsOf(p) : 0;
  const cdb = cdbTotal(p);
  const loan = <LoanLine state={state} me={me} />;
  const fin = <FinLine state={state} me={me} />;
  if (!savings && !cdb && !loanOf(state, me) && !finsOf(state, me).length) return null;
  return (
    <div className="wallet-chips">
      {savings > 0 && (
        <span className="chip" data-testid="wallet-savings">
          Poupança {money(savings)}
        </span>
      )}
      {cdb > 0 && (
        <span className="chip" data-testid="wallet-cdb">
          CDB {money(cdb)}
        </span>
      )}
      {loan}
      {fin}
    </div>
  );
}

/** Rodada da próxima vez do jogador: ainda nesta rodada se a vez vem depois da atual, senão na próxima. */
const nextTurnRound = (state: GameState, me: string) => (state.players.findIndex((p) => p.id === me) > state.turn ? state.round : state.round + 1);

/** Parcelas de financiamento cobradas no início da próxima vez (só no início de semestre). */
function FinLine({ state, me }: { state: GameState; me: string }) {
  const fins = finsOf(state, me);
  if (!fins.length) return null;
  const next = nextTurnRound(state, me);
  const due = fins.reduce((a, f) => {
    const np = nextParcel(f);
    if (np) return a + (np.round <= next ? np.amount : 0);
    return a + (f.dueRound <= next ? loanOwed(f) : 0);
  }, 0);
  if (!due) return null;
  const short = (findPlayer(state, me)?.balance ?? 0) < due;
  return (
    <div className={`debt${short ? ' urgent' : ''}`} data-testid="wallet-fin">
      Financiamento {money(due)} na próxima vez
    </div>
  );
}

function LoanLine({ state, me }: { state: GameState; me: string }) {
  const loan = loanOf(state, me);
  if (!loan) return null;
  const next = nextParcel(loan);
  if (next) {
    const soon = next.round <= nextTurnRound(state, me);
    const short = soon && (findPlayer(state, me)?.balance ?? 0) < next.amount;
    return (
      <div className={`debt${short ? ' urgent' : ''}`} data-testid="wallet-debt">
        Parcela {money(next.amount)} {soon ? 'na próxima vez' : `na rodada ${nextChargeRound(loan)}`}
      </div>
    );
  }
  const left = loanRoundsLeft(state, me)!;
  return (
    <div className={`debt${left <= 1 ? ' urgent' : ''}`} data-testid="wallet-debt">
      Dívida {money(loanOwed(loan))} · {left <= 1 ? 'vence na próxima rodada' : `vence em ${left} rodadas`}
    </div>
  );
}

/** Número guardado no localStorage deste celular (0 se não houver ou sem acesso). */
function readSeq(key: string): number {
  try {
    return typeof window !== 'undefined' ? Number(localStorage.getItem(key)) || 0 : 0;
  } catch {
    return 0;
  }
}

function wasSeen(key: string): boolean {
  try {
    return typeof window !== 'undefined' && sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
