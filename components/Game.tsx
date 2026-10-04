'use client';
import { useState } from 'react';
import { money } from '@/lib/game/format';
import { currentPlayer, equity, findPlayer, incomeOf, loanOf, loanOwed, loanRoundsLeft } from '@/lib/game/rules';
import type { Action, GameState, Tx } from '@/lib/game/types';
import { BankView } from './BankView';
import { Icon } from './Icon';
import { ScoreView, TxView } from './LedgerViews';
import { ConfirmModal, IrModal, IrPassedModal, PixModal, ReceiptModal, type PixRequest } from './Modals';
import { PlayView } from './PlayView';
import { PropsView } from './PropsView';
import type { PushedReceipt, Run } from './Room';
import { TradeBuilder, TradeInbox } from './TradeViews';
import { Avatar } from './ui';

type Tab = 'jogada' | 'imoveis' | 'banco' | 'extrato' | 'placar';
const TABS: [Tab, string][] = [
  ['jogada', 'Jogada'],
  ['imoveis', 'Imóveis'],
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
}

export function Game({ state, me, run, pushed, onPushedClose }: { state: GameState; me: string; run: Run; pushed?: PushedReceipt | null; onPushedClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('jogada');
  const [pixReq, setPixReq] = useState<PixRequest | null>(null);
  const [receipt, setReceipt] = useState<{ txs: Tx[]; title?: string } | null>(null);
  const [tradeWith, setTradeWith] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  /** resultado de sonegar sem cair na malha fina (imposto que deixou de pagar) */
  const [irPassed, setIrPassed] = useState<number | null>(null);
  const irMine = state.irPending?.pid === me && !state.winner ? state.irPending : null;
  const mine = findPlayer(state, me);
  const cur = currentPlayer(state);

  const ui: GameUi = {
    state,
    me,
    run,
    goTab: (t) => {
      setPixReq(null);
      setTab(t);
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

  return (
    <>
      <main className="app">
        <div className="top">
          <div>
            <h1>Banco Imobiliário</h1>
            <div className="meta">
              Sala {state.code} · Rodada {state.round}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {state.prev && state.prevBy === me && (
              <button className="btn small" onClick={() => run({ type: 'undo' })}>
                Desfazer
              </button>
            )}
            {state.hostId === me && (
              <button className="btn small" onClick={() => setConfirmReset(true)}>
                Nova partida
              </button>
            )}
          </div>
        </div>

        {mine ? (
          <div className={`wallet${mine.out ? ' out' : ''}`} data-testid="wallet">
            <div>
              <div className="lbl">{mine.out ? 'Você faliu' : `Sua carteira · ${mine.name}`}</div>
              <div className="big num" data-testid="wallet-balance">
                {money(mine.balance)}
              </div>
              <div className="lbl">Patrimônio {money(equity(state, mine))}</div>
              {!mine.out && (
                <div className="lbl" data-testid="wallet-income">
                  Renda no ano {(mine.year || 0) + 1}: {money(incomeOf(mine))}
                </div>
              )}
              <DebtLine state={state} me={me} />
            </div>
            <Avatar name={mine.name} color={mine.color} style={{ width: 44, height: 44, borderRadius: 22 }} />
          </div>
        ) : (
          <div className="banner info">Você está assistindo esta partida. Ela começou antes de você entrar.</div>
        )}

        <div className="players" data-testid="players">
          {state.players.map((x, i) => (
            <div key={x.id} className={`player${i === state.turn && !state.winner ? ' current' : ''}${x.out ? ' out' : ''}`} data-player={x.name}>
              <Avatar name={x.name} color={x.color} />
              <div style={{ minWidth: 0 }}>
                <div className="name">
                  {x.name}
                  {x.jailed ? ' · detido' : ''}
                  {x.out ? ' · faliu' : ''}
                </div>
                <div className="bal num">{money(x.balance)}</div>
                {x.id === me && <div className="you">você</div>}
              </div>
            </div>
          ))}
        </div>

        <TradeInbox ui={ui} />

        {tab === 'jogada' && <PlayView ui={ui} />}
        {tab === 'imoveis' && <PropsView ui={ui} />}
        {tab === 'banco' && <BankView ui={ui} onTrade={setTradeWith} />}
        {tab === 'extrato' && <TxView state={state} me={me} />}
        {tab === 'placar' && <ScoreView state={state} />}
      </main>

      <nav className="tabs">
        <div className="inner" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              <Icon name={k} />
              {l}
              {k === 'jogada' && cur?.id === me && !state.winner && tab !== 'jogada' ? ' •' : ''}
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
      {irMine && !pixReq && !tradeWith && !receipt && !pushed && (
        <IrModal
          ir={irMine}
          onDeclare={() => setPixReq({ action: { type: 'declareIR' }, title: irMine.caught ? 'Malha fina: imposto + multa' : 'Imposto de renda' })}
          onEvade={async () => {
            const r = await run({ type: 'evadeIR' });
            const last = r && findPlayer(r.state, me)?.irLast;
            if (!r || !last) return;
            if (last.outcome === 'passou') setIrPassed(last.tax);
            else if (r.created.length) setReceipt({ txs: r.created, title: 'Malha fina' });
          }}
        />
      )}
      {irPassed !== null && !pixReq && !receipt && <IrPassedModal tax={irPassed} onClose={() => setIrPassed(null)} />}
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

/** Dívida com o banco no cabeçalho da carteira. */
function DebtLine({ state, me }: { state: GameState; me: string }) {
  const loan = loanOf(state, me);
  if (!loan) return null;
  const left = loanRoundsLeft(state, me)!;
  return (
    <div className={`debt${left <= 1 ? ' urgent' : ''}`} data-testid="wallet-debt">
      Dívida {money(loanOwed(loan))} · {left <= 1 ? 'vence na próxima rodada' : `vence em ${left} rodadas`}
    </div>
  );
}
