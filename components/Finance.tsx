'use client';
// Tabela dos planos (empréstimo e financiamento) e a escolha do financiamento na compra do terreno ou da casa.
import { useState } from 'react';
import { FINANCE, LOAN } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { financeAmount, financeBlock, financeEntrada, financeOptions, pct, type LoanOption } from '@/lib/game/rules';
import type { Action, LoanPlanId } from '@/lib/game/types';
import type { GameUi } from './Game';

const rodadas = (n: number) => `${n} rodada${n === 1 ? '' : 's'}`;

/** Simulação dos 5 planos (taxa, parcela e total), como botões de escolha. */
export function PlanTable({ options, plan, onPick, label, testId }: { options: LoanOption[]; plan: LoanPlanId | null; onPick: (p: LoanPlanId) => void; label: string; testId: string }) {
  return (
    <div className="loan-sim" role="radiogroup" aria-label={label} data-testid={testId}>
      <div className="loan-sim-head" aria-hidden="true">
        <span>Plano</span>
        <span>Taxa</span>
        <span>Parcela</span>
        <span>Total</span>
      </div>
      {options.map((o) => {
        const unico = o.plan === 'unico';
        const lastDiff = o.parcels[o.parcels.length - 1] !== o.parcels[0];
        return (
          <button
            key={o.plan}
            className="loan-sim-row"
            role="radio"
            aria-checked={plan === o.plan}
            data-plan={o.plan}
            onClick={() => onPick(o.plan)}
            aria-label={`${o.name}: taxa ${pct(o.rate)}, ${unico ? `paga ${money(o.total)} em ${rodadas(LOAN.rounds)}` : `${o.parcels.length} parcelas de ${money(o.parcels[0])}`}, total ${money(o.total)}`}
          >
            <span className="plan">
              <b>{unico ? 'Único' : o.short}</b>
              <small>{unico ? `em ${rodadas(LOAN.rounds)}` : 'parcelado'}</small>
            </span>
            <span className="num">{pct(o.rate)}</span>
            <span className="num">
              {unico ? '—' : money(o.parcels[0])}
              {lastDiff && !unico ? <small>últ. {money(o.parcels[o.parcels.length - 1])}</small> : null}
            </span>
            <span className="num">
              <b>{money(o.total)}</b>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Financiar a compra: entrada de 20% pelo Pix e o resto num dos planos do empréstimo.
 * `action(plan)` monta a ação (comprar o terreno ou construir) com o financiamento.
 */
export function FinanceChooser({ ui, price, idx, what, action, onCancel }: { ui: GameUi; price: number; idx?: number; what: string; action: (plan: LoanPlanId) => Action; onCancel: () => void }) {
  const { state, me } = ui;
  const [plan, setPlan] = useState<LoanPlanId | null>(null);
  const entrada = financeEntrada(price);
  const amount = financeAmount(price);
  const block = financeBlock(state, me, price, idx);
  const options = financeOptions(state, me, price);
  const chosen = options.find((o) => o.plan === plan) ?? null;
  return (
    <div className="stack" style={{ gap: 10 }} data-testid="finance-chooser">
      <span className="label">Financiar {what}</span>
      <div className="kv">
        <div>
          <span>Preço</span>
          <span className="num">{money(price)}</span>
        </div>
        <div>
          <span>Entrada ({Math.round(FINANCE.entrada * 100)}%, pelo Pix)</span>
          <span className="num" data-testid="finance-entrada">
            {money(entrada)}
          </span>
        </div>
        <div>
          <span>Financiado pelo banco</span>
          <span className="num">{money(amount)}</span>
        </div>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>
        Mesmos planos e taxas do empréstimo, sem usar o seu limite. Enquanto não quitar, o imóvel fica alienado ao banco: não dá para negociar nem hipotecar. Se uma parcela não for paga, o banco retoma este imóvel.
      </span>
      {block ? (
        <div className="banner warn">{block}.</div>
      ) : (
        <>
          <PlanTable options={options} plan={plan} onPick={setPlan} label="Planos do financiamento" testId="finance-sim" />
          {chosen && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }} data-testid="finance-summary">
              {chosen.plan === 'unico'
                ? `Paga ${money(chosen.total)} de uma vez no início da sua vez na rodada ${chosen.dueRound}.`
                : `${chosen.parcels.length} parcelas cobradas sozinhas no início da sua vez, das rodadas ${state.round + 1} a ${chosen.dueRound}. Dá para quitar antes na aba Banco.`}
            </p>
          )}
        </>
      )}
      <div className="row">
        <button className="btn primary" disabled={!!block || !chosen} onClick={() => chosen && ui.pix(action(chosen.plan), 'Entrada do financiamento')}>
          {chosen ? `Pagar entrada de ${money(entrada)}` : 'Escolha um plano'}
        </button>
        <button className="btn" onClick={onCancel}>
          Voltar
        </button>
      </div>
    </div>
  );
}
