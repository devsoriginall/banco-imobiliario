'use client';
import { useState, type ReactNode } from 'react';
import { fmtTime, money } from '@/lib/game/format';
import { CREDIT, IR } from '@/lib/game/data';
import { houseListing } from '@/lib/game/listings';
import { currentPlayer, findPlayer, loanLimit, pname, savingsOf, shortPayers, tierName, transfersFor } from '@/lib/game/rules';
import type { Action, GameState, IrPending, Transfer, Tx } from '@/lib/game/types';
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
            ? `${savingsOf(findPlayer(state, me)) > 0 ? 'Resgate da poupança na aba Banco, v' : 'V'}enda casas ou hipoteque na aba Imóveis${isTurn && loanLimit(state, me) > 0 ? ', peça um empréstimo na aba Banco' : ''}, ou declare falência.`
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
            {t.tier && t.space !== undefined && (
              <div>
                <span>Casa</span>
                <span data-testid="receipt-tier">
                  {tierName(t.tier)} · {houseListing(t.space, t.tier).title}
                </span>
              </div>
            )}
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

const pctTxt = (r: number) => `${Math.round(r * 100)}%`;

/** Declaração do IR ao completar a volta: declarar (paga) ou sonegar (arrisca a malha fina). */
export function IrModal({ ir, onDeclare, onEvade }: { ir: IrPending; onDeclare: () => void; onEvade: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const base = Math.max(0, ir.income - IR.exempt);
  if (ir.caught)
    return (
      <Sheet label="Malha fina">
        <h2>Malha fina!</h2>
        <div className="banner bad">A Receita cruzou os dados: você sonegou o IR do ano {ir.year}. Pague o imposto com {pctTxt(IR.fine)} de multa.</div>
        <div style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Imposto + multa
          </div>
          <div className="amt num" style={{ fontSize: 36 }}>
            {money(ir.due)}
          </div>
        </div>
        <button className="btn primary block" onClick={onDeclare}>
          Pagar {money(ir.due)}
        </button>
      </Sheet>
    );
  return (
    <Sheet label="Declaração do IR">
      <div className="ir-head">
        <span className="label">Receita Federal · ano {ir.year}</span>
        <h2>Declaração do IR</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Você completou uma volta no tabuleiro. Hora de acertar o imposto sobre a renda deste ano.
        </p>
      </div>
      <div className="lines" data-testid="ir-lines">
        <div>
          <span>Renda do ano (aluguéis, empresas, notícias, poupança)</span>
          <span className="num">{money(ir.income)}</span>
        </div>
        <div>
          <span>Isenção</span>
          <span className="num">− {money(IR.exempt)}</span>
        </div>
        <div>
          <span>Base de cálculo</span>
          <span className="num">{money(base)}</span>
        </div>
        <div>
          <span>Imposto ({pctTxt(IR.rate)})</span>
          <span className="num" data-testid="ir-tax">
            {money(ir.tax)}
          </span>
        </div>
      </div>
      <button className="btn primary block" disabled={busy} onClick={onDeclare}>
        Declarar e pagar {money(ir.tax)}
      </button>
      <button
        className="btn danger block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onEvade();
          setBusy(false);
        }}
      >
        Sonegar
      </button>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Declarar em dia dá +{CREDIT.irDeclared} no score de crédito. Sonegar não paga nada agora, mas tem {pctTxt(IR.catchChance)} de chance de cair na malha fina: aí paga o imposto com {pctTxt(IR.fine)} de
        multa e perde {-CREDIT.malhaFina} pontos de score.
      </p>
    </Sheet>
  );
}

/** Fim do ano sem imposto a pagar: mostra a declaração mesmo assim, para o jogador saber que o IR foi calculado. */
export function IrExemptModal({ year, income, onClose }: { year: number; income: number; onClose: () => void }) {
  return (
    <Sheet label="Declaração do IR">
      <div className="ir-head">
        <span className="label">Receita Federal · ano {year}</span>
        <h2>Declaração do IR</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Você completou uma volta no tabuleiro e o ano {year} foi fechado.
        </p>
      </div>
      <div className="lines" data-testid="ir-exempt-lines">
        <div>
          <span>Renda do ano (aluguéis, empresas, notícias, poupança)</span>
          <span className="num">{money(income)}</span>
        </div>
        <div>
          <span>Isenção</span>
          <span className="num">− {money(IR.exempt)}</span>
        </div>
        <div>
          <span>Imposto a pagar</span>
          <span className="num">{money(0)}</span>
        </div>
      </div>
      <div className="banner info">
        Isento neste ano: sua renda ficou abaixo de {money(IR.exempt)}. O pró-labore não conta como renda.
      </div>
      <button className="btn dark block" onClick={onClose}>
        Entendi
      </button>
    </Sheet>
  );
}

export function IrPassedModal({ tax, onClose }: { tax: number; onClose: () => void }) {
  return (
    <Sheet label="Malha fina">
      <div className="receipt-top ir-passed">
        <b style={{ fontFamily: 'var(--display)', fontSize: 18 }}>Passou pela malha fina… por enquanto</b>
        <span style={{ fontSize: 14 }}>Você deixou de pagar {money(tax)} de IR. A Receita não percebeu desta vez.</span>
      </div>
      <button className="btn dark block" onClick={onClose}>
        Fechar
      </button>
    </Sheet>
  );
}
