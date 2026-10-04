'use client';
import { useState } from 'react';
import { LOAN } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { currentPlayer, equity, findPlayer, loanInterest, loanLimit, loanOf, loanOwed, loanRoundsLeft, tradesOf } from '@/lib/game/rules';
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
      <LoanCard ui={ui} />
      <TradeCardList ui={ui} onTrade={onTrade} />
    </>
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
            <span>Juros ({Math.round(LOAN.interest * 100)}%)</span>
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
  return (
    <div className="card" data-testid="loan-card">
      <span className="row" style={{ gap: 10 }}>
        <span className="bank-mark">
          <Icon name="banco" size={20} />
        </span>
        <h2>Pedir empréstimo</h2>
      </span>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Até {Math.round(LOAN.limitRate * 100)}% do seu patrimônio líquido, a partir de {money(LOAN.min)}, em múltiplos de {money(LOAN.step)}. Juros de {Math.round(LOAN.interest * 100)}% sobre o valor. Vence em {rodadas(LOAN.rounds)}; dá para pagar antes, inteiro ou em partes, na sua vez. Um empréstimo por vez.
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
      {limit === 0 ? (
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
              Devolve {money(q + loanInterest(q))}
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
