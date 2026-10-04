'use client';
import { useState } from 'react';
import { BANK_RATES, CREDIT, CREDIT_BANDS, LOAN } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { bankRate, creditBand, creditOf, currentPlayer, equity, findPlayer, loanInterest, loanLimit, loanOf, loanOwed, loanRate, loanRateFor, loanRoundsLeft, pct, tradesOf } from '@/lib/game/rules';
import { CreditGauge } from './Credit';
import type { GameUi } from './Game';
import { Icon } from './Icon';
import { Avatar } from './ui';

const rodadas = (n: number) => `${n} rodada${n === 1 ? '' : 's'}`;

export function BankView({ ui, onTrade }: { ui: GameUi; onTrade: (pid: string) => void }) {
  const { state, me } = ui;
  const mine = findPlayer(state, me);
  if (!mine || mine.out)
    return (
      <div className="card">
        <h2>Banco</h2>
        <p className="muted" style={{ margin: 0 }}>
          Empréstimos e negociações são para quem está jogando.
        </p>
      </div>
    );
  return (
    <>
      <RateCard ui={ui} />
      <CreditCard ui={ui} />
      <LoanCard ui={ui} />
      <TradeCardList ui={ui} onTrade={onTrade} />
    </>
  );
}

const pp = (r: number) => (r === 0 ? '0 pp' : `${r > 0 ? '+' : '−'}${Math.round(Math.abs(r) * 100)} pp`);

/** Taxa de juros sorteada nesta rodada. */
function RateCard({ ui }: { ui: GameUi }) {
  const { state } = ui;
  return (
    <div className="rate-card" data-testid="bank-rate-card">
      <span className="lbl">Rodada {state.round}</span>
      <div className="rate-line" data-testid="bank-rate">
        Taxa do banco nesta rodada: <b className="num">{pct(bankRate(state))}</b>
      </div>
      <span className="lbl">Sorteada no começo de cada rodada entre {BANK_RATES.options.map((r) => pct(r)).join(', ')}. O empréstimo trava a taxa do dia em que foi pego.</span>
    </div>
  );
}

/** Score de crédito com medidor, efeito no empréstimo e últimas mudanças. */
function CreditCard({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const p = findPlayer(state, me)!;
  const score = creditOf(p);
  const band = creditBand(score);
  return (
    <div className="card" data-testid="credit-card">
      <div className="row between">
        <h2>Score de crédito</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          0 a {CREDIT.max}
        </span>
      </div>
      <CreditGauge score={score} />
      <div className="kv">
        <div>
          <span>Limite</span>
          <span className="num">{score < CREDIT.noLoanBelow ? 'Bloqueado' : `${Math.round(band.limitRate * 100)}% do patrimônio`}</span>
        </div>
        <div>
          <span>Ajuste da taxa</span>
          <span className="num">{pp(band.rateOffset)}</span>
        </div>
        <div>
          <span>Sua taxa agora</span>
          <span className="num" data-testid="my-rate">
            {pct(loanRateFor(state, me))}
          </span>
        </div>
      </div>
      {p.creditLog?.length ? (
        <ul className="credit-log">
          {p.creditLog.slice(0, 4).map((e, k) => (
            <li key={k}>
              <span>
                {e.reason} · rodada {e.round}
              </span>
              <b className={`num ${e.delta >= 0 ? 'up' : 'down'}`}>
                {e.delta >= 0 ? '+' : '−'}
                {Math.abs(e.delta)}
              </b>
            </li>
          ))}
        </ul>
      ) : null}
      <details className="credit-rules">
        <summary>Como o score muda</summary>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Quitar empréstimo em dia ou antes +{CREDIT.loanPaid} · pagamento parcial +{CREDIT.partialPay} (uma vez por rodada, a partir de {money(LOAN.step)}) · declarar o IR +{CREDIT.irDeclared} · ficar sem
          saldo para um pagamento {CREDIT.shortfall} · malha fina {CREDIT.malhaFina} · empréstimo vencido com penhora {CREDIT.penhora}. Faixas:{' '}
          {CREDIT_BANDS.map((b) => `${b.name} (${b.from}+: ${Math.round(b.limitRate * 100)}%, ${pp(b.rateOffset)})`).join(' · ')}. Abaixo de {CREDIT.noLoanBelow}, o banco não empresta.
        </p>
      </details>
    </div>
  );
}

function LoanCard({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const p = findPlayer(state, me)!;
  const myTurn = currentPlayer(state)?.id === me && !state.winner;
  const loan = loanOf(state, me);
  const limit = loanLimit(state, me);
  const [amount, setAmount] = useState(LOAN.min);
  const [part, setPart] = useState(LOAN.step);

  if (loan) {
    const owed = loanOwed(loan);
    const left = loanRoundsLeft(state, me)!;
    const maxPart = Math.min(owed, p.balance);
    const partQ = Math.max(Math.min(part, maxPart), Math.min(LOAN.step, maxPart));
    return (
      <div className="card" data-testid="loan-card">
        <div className="row between">
          <span className="row" style={{ gap: 10 }}>
            <span className="bank-mark">
              <Icon name="banco" size={20} />
            </span>
            <h2>Seu empréstimo</h2>
          </span>
          <span className={`pill ${left <= 1 ? 'bad' : 'warn'}`}>{left <= 1 ? 'Vence na próxima rodada' : `Vence em ${rodadas(left)}`}</span>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            Você deve
          </div>
          <div className="amt num" style={{ fontSize: 30 }} data-testid="loan-owed">
            {money(owed)}
          </div>
        </div>
        <div className="kv">
          <div>
            <span>Pegou</span>
            <span className="num">{money(loan.principal)}</span>
          </div>
          <div>
            <span>Juros ({pct(loanRate(loan))}, travados)</span>
            <span className="num">{money(loan.interest)}</span>
          </div>
          <div>
            <span>Já pagou</span>
            <span className="num">{money(loan.paid)}</span>
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Vence no início da sua vez na rodada {loan.dueRound}. Aí o banco cobra do seu saldo; se faltar, faz a penhora: vende suas casas pela metade e toma seus imóveis, do mais barato para o mais caro, pelo valor de hipoteca.
        </p>
        {left <= 1 && <div className="banner bad">Falta 1 rodada. Pague até a sua próxima vez para evitar a penhora.</div>}
        {myTurn ? (
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn primary" disabled={p.balance < owed} onClick={() => ui.pix({ type: 'payLoan', amount: owed }, 'Quitar empréstimo')}>
              Quitar {money(owed)}
            </button>
            {owed > LOAN.step && maxPart > 0 && (
              <div className="row">
                <div className="stepper">
                  <button aria-label={`Menos ${money(LOAN.step)} no pagamento`} onClick={() => setPart(Math.max(LOAN.step, partQ - LOAN.step))}>
                    −
                  </button>
                  <span className="amt num">{money(partQ)}</span>
                  <button aria-label={`Mais ${money(LOAN.step)} no pagamento`} onClick={() => setPart(Math.min(maxPart, partQ + LOAN.step))}>
                    +
                  </button>
                </div>
                <button className="btn" disabled={partQ >= owed} onClick={() => ui.pix({ type: 'payLoan', amount: partQ }, 'Pagar parte do empréstimo')}>
                  Pagar parte
                </button>
              </div>
            )}
            {p.balance < owed && <div className="banner warn">Seu saldo não cobre a dívida toda. Pague uma parte ou levante dinheiro na aba Imóveis.</div>}
          </div>
        ) : (
          <div className="banner info">Pagamentos ao banco só na sua vez.</div>
        )}
      </div>
    );
  }

  const q = Math.max(LOAN.min, Math.min(amount, limit));
  const score = creditOf(p);
  const band = creditBand(score);
  const rate = loanRateFor(state, me);
  return (
    <div className="card" data-testid="loan-card">
      <span className="row" style={{ gap: 10 }}>
        <span className="bank-mark">
          <Icon name="banco" size={20} />
        </span>
        <h2>Pedir empréstimo</h2>
      </span>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Com score {band.name.toLowerCase()}, até {Math.round(band.limitRate * 100)}% do seu patrimônio líquido, a partir de {money(LOAN.min)}, em múltiplos de {money(LOAN.step)}. Juros de {pct(rate)} sobre o
        valor (taxa da rodada {pct(bankRate(state))}
        {band.rateOffset ? ` ${pp(band.rateOffset)} pelo score` : ', sem ajuste pelo score'}), travados ao pegar. Vence em {rodadas(LOAN.rounds)}; dá para pagar antes, inteiro ou em partes, na sua vez. Um empréstimo por vez.
      </p>
      <div className="kv">
        <div>
          <span>Patrimônio líquido</span>
          <span className="num">{money(equity(state, p))}</span>
        </div>
        <div>
          <span>Seu limite</span>
          <span className="num" data-testid="loan-limit">
            {money(limit)}
          </span>
        </div>
        <div>
          <span>Vencimento</span>
          <span className="num">Rodada {state.round + LOAN.rounds}</span>
        </div>
      </div>
      {score < CREDIT.noLoanBelow ? (
        <div className="banner bad">Seu score está abaixo de {CREDIT.noLoanBelow}: o banco não empresta. Pague o que deve e declare o IR para subir.</div>
      ) : limit === 0 ? (
        <div className="banner warn">Seu patrimônio não permite empréstimo agora.</div>
      ) : myTurn ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row between">
            <div className="stepper">
              <button aria-label={`Menos ${money(LOAN.step)} no empréstimo`} onClick={() => setAmount(Math.max(LOAN.min, q - LOAN.step))}>
                −
              </button>
              <span className="amt num" aria-live="polite" data-testid="loan-amount">
                {money(q)}
              </span>
              <button aria-label={`Mais ${money(LOAN.step)} no empréstimo`} onClick={() => setAmount(Math.min(limit, q + LOAN.step))}>
                +
              </button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              Devolve {money(q + loanInterest(q, rate))}
            </span>
          </div>
          <button className="btn primary" onClick={() => ui.runWithReceipt({ type: 'takeLoan', amount: q }, 'Empréstimo liberado')}>
            Pegar {money(q)} emprestado
          </button>
        </div>
      ) : (
        <div className="banner info">Empréstimo só na sua vez.</div>
      )}
    </div>
  );
}

function TradeCardList({ ui, onTrade }: { ui: GameUi; onTrade: (pid: string) => void }) {
  const { state, me } = ui;
  const others = state.players.filter((x) => x.id !== me && !x.out);
  const pending = tradesOf(state);
  return (
    <div className="card">
      <span className="row" style={{ gap: 10 }}>
        <span className="bank-mark">
          <Icon name="trade" size={20} />
        </span>
        <h2>Negociar</h2>
      </span>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Troque dinheiro, imóveis e cotas com outro jogador a qualquer momento, mesmo fora da sua vez.
      </p>
      <div className="list">
        {others.map((x) => {
          const busy = pending.some((t) => (t.from === me && t.to === x.id) || (t.from === x.id && t.to === me));
          return (
            <div className="li" key={x.id}>
              <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                <Avatar name={x.name} color={x.color} />
                <div className="main">
                  <b>{x.name}</b>
                  <span className="num">{money(x.balance)}</span>
                </div>
              </div>
              <button className="btn small" disabled={busy || !!state.winner} onClick={() => onTrade(x.id)}>
                {busy ? 'Proposta pendente' : `Negociar com ${x.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
