'use client';
import { useState, type ReactNode } from 'react';
import { fmtTime, money } from '@/lib/game/format';
import { CREDIT, IR } from '@/lib/game/data';
import { houseListing } from '@/lib/game/listings';
import { currentPlayer, findPlayer, irCatchChance, irFineDue, irTax, loanLimit, pname, savingsOf, shortPayers, tierName, transfersFor, yearRounds } from '@/lib/game/rules';
import type { Action, GameState, IrPending, IrResult, Transfer, Tx } from '@/lib/game/types';
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

/** Renda declarada ao escolher `step` décimos da renda real (0 = sonega tudo; o máximo, 90%, fica abaixo da renda). */
const irDeclaredAt = (income: number, step: number) => Math.min(income - 1, Math.floor((income * step) / 10));

/**
 * Declaração do IR do ano do calendário que fechou: declarar tudo (paga o imposto) ou declarar menos
 * (paga o imposto sobre o declarado e arrisca a malha fina na proporção do que escondeu).
 */
export function IrModal({
  ir,
  short,
  balance,
  onDeclare,
  onEvade,
  onRaise,
}: {
  ir: IrPending;
  short: boolean;
  balance: number;
  onDeclare: () => void;
  onEvade: (declared: number) => Promise<void>;
  onRaise: () => void;
}) {
  const [busy, setBusy] = useState(false);
  /** quanto declarar, em décimos da renda real (0 a 9) */
  const [step, setStep] = useState(0);
  const base = Math.max(0, ir.income - IR.exempt);
  const raise = short ? (
    <>
      <div className="banner warn">Seu saldo não cobre {money(ir.due)}. Resgate da poupança, hipoteque ou venda e volte para entregar.</div>
      <button className="btn block" onClick={onRaise}>
        Levantar dinheiro
      </button>
    </>
  ) : null;
  if (ir.caught)
    return (
      <Sheet label="Malha fina">
        <h2>Malha fina!</h2>
        <div className="banner bad">
          {ir.declared
            ? `A Receita cruzou os dados: você declarou ${money(ir.declared)} de ${money(ir.income)} no ano ${ir.year}. Pague o imposto que faltou com ${pctTxt(IR.fine)} de multa.`
            : `A Receita cruzou os dados: você sonegou o IR do ano ${ir.year}. Pague o imposto com ${pctTxt(IR.fine)} de multa.`}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {ir.declared ? 'Imposto que faltou + multa' : 'Imposto + multa'}
          </div>
          <div className="amt num" style={{ fontSize: 36 }}>
            {money(ir.due)}
          </div>
        </div>
        <button className="btn primary block" disabled={short} onClick={onDeclare}>
          Pagar {money(ir.due)}
        </button>
        {raise}
      </Sheet>
    );
  const declared = irDeclaredAt(ir.income, step);
  const taxNow = irTax(declared);
  const hidden = ir.income - declared;
  const chance = irCatchChance(ir.income, declared);
  const fineDue = irFineDue(ir.income, declared);
  const lessShort = balance < taxNow;
  return (
    <Sheet label="Declaração do IR">
      <div className="ir-head">
        <span className="label">Receita Federal · ano {ir.year}</span>
        <h2>Declaração do ano {ir.year}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {ir.cal ? `O ano ${ir.year} da partida terminou (rodadas ${yearRounds(ir.year).from} a ${yearRounds(ir.year).to}) para todos. ` : ''}Hora de acertar o imposto sobre a renda do ano.
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
      <button className="btn primary block" disabled={busy || short} onClick={onDeclare}>
        Declarar e pagar {money(ir.tax)}
      </button>
      {raise}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Declarar tudo em dia dá +{CREDIT.irDeclared} no score de crédito.
      </p>
      <section className="ir-less" data-testid="ir-less" aria-label="Declarar menos">
        <div className="ir-less-head">
          <b>Declarar menos</b>
          <span className="muted" data-testid="ir-less-pct">
            {step * 10}% da renda
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={9}
          step={1}
          value={step}
          disabled={busy}
          aria-label="Parte da renda a declarar"
          aria-valuetext={`${step * 10}% da renda: ${money(declared)}`}
          onChange={(e) => setStep(Number(e.target.value))}
        />
        <div className="ir-less-scale muted" aria-hidden="true">
          <span>0% (sonegar tudo)</span>
          <span>90%</span>
        </div>
        <div className="lines" data-testid="ir-less-lines">
          <div>
            <span>Renda declarada</span>
            <span className="num" data-testid="ir-less-declared">
              {money(declared)}
            </span>
          </div>
          <div>
            <span>Imposto pago agora</span>
            <span className="num" data-testid="ir-less-tax">
              {money(taxNow)}
            </span>
          </div>
          <div>
            <span>Renda escondida</span>
            <span className="num" data-testid="ir-less-hidden">
              {money(hidden)}
            </span>
          </div>
        </div>
        <div className="banner bad ir-less-risk" data-testid="ir-less-risk">
          <span>
            <b>Chance de malha fina: {pctTxt(chance)}</b>
            <br />
            Se cair: paga {money(fineDue)} (imposto que faltou + multa de {pctTxt(IR.fine)}) e perde {-CREDIT.malhaFina} pontos de score.
          </span>
        </div>
        {lessShort && <div className="banner warn">Seu saldo não cobre {money(taxNow)} de imposto agora. Declare menos ou levante dinheiro.</div>}
        <button
          className="btn danger block"
          disabled={busy || lessShort}
          onClick={async () => {
            setBusy(true);
            await onEvade(declared);
            setBusy(false);
          }}
        >
          Entregar declaração com {money(declared)}
        </button>
      </section>
    </Sheet>
  );
}

/** Fim do ano sem imposto a pagar: mostra a declaração mesmo assim, para o jogador saber que o IR foi calculado. */
export function IrExemptModal({ year, income, onClose }: { year: number; income: number; onClose: () => void }) {
  return (
    <Sheet label="Declaração do IR">
      <div className="ir-head">
        <span className="label">Receita Federal · ano {year}</span>
        <h2>Declaração do ano {year}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          O ano {year} da partida terminou (rodadas {yearRounds(year).from} a {yearRounds(year).to}) para todos e foi fechado.
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

/** Declarou menos (ou sonegou tudo) e a Receita não percebeu. */
export function IrPassedModal({ result, onClose }: { result: IrResult; onClose: () => void }) {
  const declared = result.declared ?? 0;
  const saved = result.tax - result.paid;
  return (
    <Sheet label="Malha fina">
      <div className="receipt-top ir-passed">
        <b style={{ fontFamily: 'var(--display)', fontSize: 18 }}>Passou pela malha fina… por enquanto</b>
        <span style={{ fontSize: 14 }} data-testid="ir-passed-text">
          {declared > 0
            ? `Você declarou ${money(declared)} de ${money(result.income)} e pagou ${money(result.paid)}: deixou de pagar ${money(saved)} de IR. A Receita não percebeu desta vez.`
            : `Você deixou de pagar ${money(saved)} de IR. A Receita não percebeu desta vez.`}
        </span>
      </div>
      <button className="btn dark block" onClick={onClose}>
        Fechar
      </button>
    </Sheet>
  );
}
