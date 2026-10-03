'use client';
import { useState } from 'react';
import { money } from '@/lib/game/format';
import { currentPlayer, findPlayer, netWorth } from '@/lib/game/rules';
import type { Action, GameState, Tx } from '@/lib/game/types';
import { Icon } from './Icon';
import { ScoreView, TxView } from './LedgerViews';
import { ConfirmModal, PixModal, ReceiptModal, type PixRequest } from './Modals';
import { PlayView } from './PlayView';
import { PropsView } from './PropsView';
import type { Run } from './Room';
import { Avatar } from './ui';

type Tab = 'jogada' | 'imoveis' | 'extrato' | 'placar';
const TABS: [Tab, string][] = [
  ['jogada', 'Jogada'],
  ['imoveis', 'Imóveis'],
  ['extrato', 'Extrato'],
  ['placar', 'Placar'],
];

export interface GameUi {
  state: GameState;
  me: string;
  /** pede confirmação de Pix e, confirmado, mostra o comprovante */
  pix: (action: Action, title?: string) => void;
  /** executa direto e mostra o comprovante (dinheiro que entra) */
  runWithReceipt: (action: Action) => Promise<void>;
  run: Run;
  goTab: (t: Tab) => void;
}

export function Game({ state, me, run }: { state: GameState; me: string; run: Run }) {
  const [tab, setTab] = useState<Tab>('jogada');
  const [pixReq, setPixReq] = useState<PixRequest | null>(null);
  const [receipt, setReceipt] = useState<Tx[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
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
    runWithReceipt: async (action) => {
      const r = await run(action);
      if (r?.created.length) setReceipt(r.created);
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
              <div className="lbl">Patrimônio {money(netWorth(state, mine))}</div>
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

        {tab === 'jogada' && <PlayView ui={ui} />}
        {tab === 'imoveis' && <PropsView ui={ui} />}
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
            if (r?.created.length) setReceipt(r.created);
          }}
        />
      )}
      {!pixReq && receipt && <ReceiptModal state={state} receipt={receipt} onClose={() => setReceipt(null)} />}
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
