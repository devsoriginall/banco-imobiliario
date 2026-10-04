'use client';
import { useState, type ReactNode } from 'react';
import { fmtTime, money } from '@/lib/game/format';
import { currentPlayer, loanLimit, pname, shortPayers, transfersFor } from '@/lib/game/rules';
import type { Action, GameState, Transfer, Tx } from '@/lib/game/types';
import { Icon } from './Icon';

export function Sheet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={label}>
      <div className="sheet">{children}</div>
    </div>
  );
}

export interface PixRequest {
  action: Action;
  title?: string;
}

/** Confirmação do Pix. Recalcula a cada render, então saldos que mudam em outro celular aparecem na hora. */
export function PixModal({
  state,
  me,
  req,
  onConfirm,
  onCancel,
  onBankrupt,
  onGoProps,
}: {
  state: GameState;
  me: string;
  req: PixRequest;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onBankrupt: (debtor: string, creditor: string) => void;
  onGoProps: () => void;
}) {
  const [busy, setBusy] = useState(false);
  let list: Transfer[];
  try {
    list = transfersFor(state, req.action, me);
  } catch {
    list = [];
  }
  const total = list.reduce((a, t) => a + t.amount, 0);
  const short = shortPayers(state, list);
  const isTurn = currentPlayer(state)?.id === me;
  // quem pode declarar falência daqui: eu mesmo, ou quem está na vez na aposta da mesa
  const canDeclare = short.filter((pid) => pid === me || (isTurn && list.find((t) => t.from === pid)?.to === me));

  return (
    <Sheet label="Confirmar Pix">
      <h2>{req.title || 'Confirmar Pix'}</h2>
      <div style={{ textAlign: 'center' }}>
        <div className="muted" style={{ fontSize: 13 }}>
          Valor
        </div>
        <div className="amt num" style={{ fontSize: 36 }}>
          {money(total)}
        </div>
      </div>
      <div className="lines">
        {list.map((t, i) => (
          <div key={i}>
            <span>
              {pname(state, t.from)} → {pname(state, t.to)}
            </span>
            <span className="num">{money(t.amount)}</span>
          </div>
        ))}
        {list[0] && (
          <div>
            <span>Motivo</span>
            <span>{list[0].reason}</span>
          </div>
        )}
      </div>
      {short.length > 0 && (
        <div className="banner bad">
          Saldo insuficiente: {short.map((pid) => pname(state, pid)).join(', ')}.{' '}
          {short.includes(me)
            ? `Venda casas ou hipoteque na aba Imóveis${isTurn && loanLimit(state, me) > 0 ? ', peça um empréstimo na aba Banco' : ''}, ou declare falência.`
            : 'Quem está sem saldo pode vender casas ou hipotecar no próprio celular.'}
        </div>
      )}
      <button
        className="btn primary block"
        disabled={busy || short.length > 0 || list.length === 0}
        onClick={async () => {
          setBusy(true);
          await onConfirm();
          setBusy(false);
        }}
      >
        {busy ? 'Enviando…' : 'Confirmar Pix'}
      </button>
      {canDeclare.map((pid) => (
        <button key={pid} className="btn danger block" onClick={() => onBankrupt(pid, list.find((t) => t.from === pid)!.to)}>
          {pid === me ? 'Declarar falência' : `${pname(state, pid)} declara falência`}
        </button>
      ))}
      {short.includes(me) && (
        <button className="btn block" onClick={onGoProps}>
          Ir para Imóveis
        </button>
      )}
      <button className="btn block" onClick={onCancel}>
        Cancelar
      </button>
    </Sheet>
  );
}

export function ReceiptModal({ state, receipt, title = 'Transação efetuada', onClose }: { state: GameState; receipt: Tx[]; title?: string; onClose: () => void }) {
  const total = receipt.reduce((a, t) => a + t.amount, 0);
  const r0 = receipt[0];
  return (
    <Sheet label="Comprovante">
      <div className="receipt-top">
        <div className="check">
          <Icon name="check" size={30} />
        </div>
        <b style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{title}</b>
        <span className="amt num">{money(total)}</span>
      </div>
      <h3>Comprovante</h3>
      <div className="lines">
        {receipt.map((t, i) => (
          <div key={t.id} style={{ display: 'contents' }}>
            {i > 0 && <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '4px 0' }} />}
            <div>
              <span>Pagador</span>
              <span>{pname(state, t.from)}</span>
            </div>
            <div>
              <span>Recebedor</span>
              <span>{pname(state, t.to)}</span>
            </div>
            <div>
              <span>Valor</span>
              <span className="num">{money(t.amount)}</span>
            </div>
            <div>
              <span>ID da transação</span>
              <span className="num">{t.id}</span>
            </div>
          </div>
        ))}
        <div>
          <span>Motivo</span>
          <span>{r0.reason}</span>
        </div>
        <div>
          <span>Quando</span>
          <span>
            {fmtTime(r0.at)} · rodada {r0.round}
          </span>
        </div>
      </div>
      <div className="banner info">Fica no extrato da partida para todos. Dinheiro do jogo, sem Pix real.</div>
      <button className="btn dark block" onClick={onClose}>
        Fechar
      </button>
    </Sheet>
  );
}

export function ConfirmModal({ title, text, confirm, onConfirm, onCancel }: { title: string; text: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Sheet label={title}>
      <h2>{title}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {text}
      </p>
      <button className="btn danger block" onClick={onConfirm}>
        {confirm}
      </button>
      <button className="btn block" onClick={onCancel}>
        Continuar jogando
      </button>
    </Sheet>
  );
}
