'use client';
// Escolha do banco e tabela dos planos (empréstimo e financiamento) e a escolha do financiamento na compra do terreno ou da casa.
import { useState } from 'react';
import { CALENDAR, FINANCE, LOAN } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { bankModsOf, bankOffers, financeAmount, financeEntrada, financeOptions, pct, semesterText, type BankOffer, type LoanOption } from '@/lib/game/rules';
import type { Action, BankId, GameState, LoanPlanId } from '@/lib/game/types';
import type { GameUi } from './Game';

/** Regra das parcelas em uma frase (empréstimo e financiamento). */
export const PARCEL_RULE = `1 parcela por semestre (a cada ${CALENDAR.roundsPerSemester} rodadas), cobrada sozinha no início da sua vez na rodada que abre o semestre; a primeira só no semestre seguinte`;

/** Regra dos juros em uma frase. */
export const RATE_RULE = 'Taxa ao ano, travada ao pegar: os juros contam pelo prazo (2x = 1 ano, 5x = 2 anos e meio)';

/** Resumo do plano escolhido: quando cada cobrança cai no calendário. */
export function planSummary(o: LoanOption, early: string): string {
  const juros = `Juros: ${money(o.interest)} (${pct(o.rate)} ao ano).`;
  if (o.plan === 'unico') return `Paga ${money(o.total)} de uma vez na rodada ${o.dueRound} (${semesterText(o.dueRound)}). ${juros} ${early}`;
  const list = o.rounds.length > 2 ? `${o.rounds.slice(0, -1).join(', ')} e ${o.rounds[o.rounds.length - 1]}` : o.rounds.join(' e ');
  return `${o.parcels.length} parcelas semestrais, nas rodadas ${list}: a 1ª na rodada ${o.firstRound} (${semesterText(o.firstRound)}). ${juros} ${early}`;
}

/** Os 3 bancos lado a lado: taxa ao ano para o seu score, limite (empréstimo) ou o score mínimo. */
export function BankPicker({
  state,
  offers,
  bank,
  onPick,
  kind,
  testId,
}: {
  state: GameState;
  offers: BankOffer[];
  bank: BankId | null;
  onPick: (b: BankId) => void;
  kind: 'loan' | 'fin';
  testId: string;
}) {
  return (
    <div className="bank-pick" role="radiogroup" aria-label="Escolha o banco" data-testid={testId}>
      {offers.map((o) => {
        const mod = bankModsOf(state, o.id).reduce((a, m) => a + m.pp, 0);
        const off = !!o.block;
        const scoreBlock = off && o.block!.startsWith('Score');
        return (
          <button
            key={o.id}
            className="bank-opt"
            role="radio"
            aria-checked={bank === o.id}
            data-bank={o.id}
            disabled={off}
            title={o.description}
            onClick={() => onPick(o.id)}
            aria-label={`${o.name}: ${pct(o.rate)} ao ano${off ? `, ${o.block!.toLowerCase()}` : kind === 'loan' ? `, limite ${money(o.limit)}` : ''}`}
          >
            <b>{o.short}</b>
            <span className="num">{pct(o.rate)} ao ano</span>
            {mod !== 0 && <small className={mod < 0 ? 'promo' : 'alta'}>{mod < 0 ? 'Promoção' : 'Em alta'} no Jornal</small>}
            <small>{off ? (scoreBlock ? `score mínimo ${o.minScore}` : o.block) : kind === 'loan' ? `até ${money(o.limit)}` : `score ${o.minScore}+`}</small>
          </button>
        );
      })}
    </div>
  );
}

/** Simulação dos 5 planos (taxa ao ano, parcela, total e juros), como botões de escolha. */
export function PlanTable({
  options,
  plan,
  onPick,
  label,
  testId,
}: {
  options: LoanOption[];
  plan: LoanPlanId | null;
  onPick: (p: LoanPlanId) => void;
  label: string;
  testId: string;
}) {
  return (
    <div className="loan-sim" role="radiogroup" aria-label={label} data-testid={testId}>
      <div className="loan-sim-head" aria-hidden="true">
        <span>Plano</span>
        <span>Taxa/ano</span>
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
            aria-label={`${o.name}: taxa ${pct(o.rate)} ao ano, ${unico ? `paga ${money(o.total)} na rodada ${o.dueRound}, no ${LOAN.unicoSemesters}º semestre` : `${o.parcels.length} parcelas semestrais de ${money(o.parcels[0])}`}, juros ${money(o.interest)}, total ${money(o.total)}`}
          >
            <span className="plan">
              <b>{unico ? 'Único' : o.short}</b>
              <small>{unico ? `no ${LOAN.unicoSemesters}º semestre` : `${o.parcels.length} semestres`}</small>
            </span>
            <span className="num">{pct(o.rate)}</span>
            <span className="num">
              {unico ? '—' : money(o.parcels[0])}
              {lastDiff && !unico ? <small>últ. {money(o.parcels[o.parcels.length - 1])}</small> : null}
            </span>
            <span className="num">
              <b>{money(o.total)}</b>
              <small>juros {money(o.interest)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Financiar a compra: entrada de 20% pelo Pix e o resto num dos planos, no banco escolhido.
 * `action(plan, bank)` monta a ação (comprar o terreno ou construir) com o financiamento.
 */
export function FinanceChooser({
  ui,
  price,
  idx,
  what,
  action,
  onCancel,
}: {
  ui: GameUi;
  price: number;
  idx?: number;
  what: string;
  action: (plan: LoanPlanId, bank: BankId) => Action;
  onCancel: () => void;
}) {
  const { state, me } = ui;
  const [plan, setPlan] = useState<LoanPlanId | null>(null);
  const [bank, setBank] = useState<BankId | null>(null);
  const entrada = financeEntrada(price);
  const amount = financeAmount(price);
  const offers = bankOffers(state, me, 'fin', price, idx);
  const offer = offers.find((o) => o.id === bank && !o.block) ?? null;
  const none = offers.every((o) => o.block);
  const options = offer ? financeOptions(state, me, price, offer.id) : [];
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
        Mesmos planos do empréstimo, sem usar o seu limite e sem os +{Math.round(LOAN.personalSpread * 100)} pp do empréstimo pessoal (o dinheiro vai direto para o imóvel): {PARCEL_RULE}. {RATE_RULE}. Enquanto não quitar, o imóvel fica alienado ao banco: não dá
        para negociar nem hipotecar. Se uma parcela não for paga, o banco retoma este imóvel.
      </span>
      {none ? (
        <div className="banner warn">
          {offers.find((o) => !o.block?.startsWith('Score'))?.block ??
            `Seu score não alcança nenhum banco (mínimo ${Math.min(...offers.map((o) => o.minScore))})`}
          .
        </div>
      ) : (
        <>
          <span className="muted" style={{ fontSize: 13 }}>
            1. Escolha o banco
          </span>
          <BankPicker state={state} offers={offers} bank={offer?.id ?? null} onPick={(b) => setBank(b)} kind="fin" testId="finance-banks" />
          {offer && (
            <>
              <span className="muted" style={{ fontSize: 13 }}>
                2. Escolha como pagar
              </span>
              <PlanTable options={options} plan={plan} onPick={setPlan} label="Planos do financiamento" testId="finance-sim" />
            </>
          )}
          {chosen && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }} data-testid="finance-summary">
              {offer!.name}: {planSummary(chosen, 'Dá para quitar antes na aba Banco.')}
            </p>
          )}
        </>
      )}
      <div className="row">
        <button
          className="btn primary"
          disabled={!offer || !chosen}
          onClick={() => offer && chosen && ui.pix(action(chosen.plan, offer.id), 'Entrada do financiamento')}
        >
          {!offer ? 'Escolha um banco' : chosen ? `Pagar entrada de ${money(entrada)}` : 'Escolha um plano'}
        </button>
        <button className="btn" onClick={onCancel}>
          Voltar
        </button>
      </div>
    </div>
  );
}
