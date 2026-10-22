'use client';
import { useState } from 'react';
import { BANK_RATES, BANKS, CDB_RULES, CREDIT, CREDIT_BANDS, IR, LOAN, SAVINGS } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { bankInfo, bankModTexts, cdbAnnualRate, cdbBalance, cdbCdiShare, cdbFree, cdbLocks, cdbOf, cdbTotal, cdbYieldOf, cdiRate, bankOffers, bankRate, creditBand, creditOf, currentPlayer, equity, findPlayer, finLeft, finsOf, isAnnual, isParcelado, loanBank, loanOf, loanOptions, loanOwed, loanPlan, loanRate, loanRateFor, loanRoundsLeft, nextParcel, parcelRound, pct, pct2, planInfo, savingsAnnualRate, savingsOf, savingsRate, savingsYield, selicUntil, semesterOf, semesterText, street, tradesOf, yearOf } from '@/lib/game/rules';
import type { BankId, Financing, Loan, LoanPlanId } from '@/lib/game/types';
import { CreditGauge } from './Credit';
import { BankPicker, PARCEL_RULE, planSummary, PlanTable, RATE_RULE } from './Finance';
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
      <SavingsCard ui={ui} />
      <CdbCard ui={ui} />
      <CreditCard ui={ui} />
      <LoanCard ui={ui} />
      <FinancingCard ui={ui} />
      <TradeCardList ui={ui} onTrade={onTrade} />
    </>
  );
}

/** Poupança: saldo, rendimento por vez, depósito (na sua vez) e resgate (a qualquer momento). */
function SavingsCard({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const p = findPlayer(state, me)!;
  const myTurn = currentPlayer(state)?.id === me && !state.winner;
  const saved = savingsOf(p);
  const [dep, setDep] = useState(SAVINGS.step * 10);
  const [out, setOut] = useState(SAVINGS.step);
  const step = SAVINGS.step;
  const maxDep = Math.floor(p.balance / step) * step;
  const depQ = Math.max(Math.min(dep, maxDep), Math.min(step, maxDep));
  const outQ = Math.max(Math.min(out, saved), Math.min(step, saved));
  const nextYield = savingsYield(state, p);
  return (
    <div className="card" data-testid="savings-card">
      <div className="row between">
        <span className="row" style={{ gap: 10 }}>
          <span className="bank-mark">
            <Icon name="banco" size={20} />
          </span>
          <h2>Poupança</h2>
        </span>
        <span className="pill ok">{pct2(savingsRate(state))} por vez · {pct2(savingsAnnualRate(state))} ao ano</span>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 13 }}>
          Saldo na poupança
        </div>
        <div className="amt num" style={{ fontSize: 30 }} data-testid="savings-balance">
          {money(saved)}
        </div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Rende 0,5% ao mês (6,17% ao ano) quando a Selic passa de 8,5%; senão, 70% da Selic. A taxa do ano é dividida pelas 6 rodadas e paga no início de cada vez sua{saved > 0 ? `: ${money(nextYield)} com a taxa de agora` : ''}. Isento de IR. Deposite na sua vez; resgate a qualquer momento, até para pagar um aluguel. Se o banco cobrar uma dívida, tira da poupança antes de penhorar.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        {myTurn ? (
          maxDep >= step ? (
            <div className="row">
              <div className="stepper">
                <button aria-label={`Menos ${money(step)} no depósito`} onClick={() => setDep(Math.max(step, depQ - step))}>
                  −
                </button>
                <span className="amt num" data-testid="savings-deposit-amount">
                  {money(depQ)}
                </span>
                <button aria-label={`Mais ${money(step)} no depósito`} onClick={() => setDep(Math.min(maxDep, depQ + step))}>
                  +
                </button>
              </div>
              <button className="btn primary" onClick={() => ui.pix({ type: 'deposit', amount: depQ }, 'Depósito na poupança')}>
                Depositar
              </button>
            </div>
          ) : (
            <div className="banner warn">Saldo insuficiente para depositar.</div>
          )
        ) : (
          <div className="banner info">Depósito só na sua vez. O resgate vale a qualquer momento.</div>
        )}
        {saved > 0 && (
          <div className="row">
            <div className="stepper">
              <button aria-label={`Menos ${money(step)} no resgate`} onClick={() => setOut(Math.max(step, outQ - step))}>
                −
              </button>
              <span className="amt num" data-testid="savings-withdraw-amount">
                {money(outQ)}
              </span>
              <button aria-label={`Mais ${money(step)} no resgate`} onClick={() => setOut(Math.min(saved, outQ + step))}>
                +
              </button>
            </div>
            <button className="btn" onClick={() => ui.runWithReceipt({ type: 'withdraw', amount: outQ }, 'Resgate da poupança')}>
              Resgatar
            </button>
            {outQ !== saved && (
              <button className="btn small" onClick={() => ui.runWithReceipt({ type: 'withdraw', amount: saved }, 'Resgate da poupança')}>
                Resgatar tudo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Investimentos (CDB): os 3 bancos com a taxa de agora, carência opcional, posições, aplicação (na sua vez) e resgate. */
function CdbCard({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const p = findPlayer(state, me)!;
  const myTurn = currentPlayer(state)?.id === me && !state.winner;
  const [bank, setBank] = useState<BankId>('orbita');
  const [lock, setLock] = useState(false);
  const [dep, setDep] = useState(SAVINGS.step * 10);
  const [out, setOut] = useState(SAVINGS.step);
  const step = SAVINGS.step;
  const maxDep = Math.floor(p.balance / step) * step;
  const depQ = Math.max(Math.min(dep, maxDep), Math.min(step, maxDep));
  const free = cdbFree(p, bank, state.round);
  const outQ = Math.max(Math.min(out, free), Math.min(step, free));
  const info = bankInfo(bank);
  const lockPp = Math.round(CDB_RULES.lockBonus * 100);
  const mine = BANKS.filter((b) => cdbOf(p, b.id).free > 0 || (cdbOf(p, b.id).locked ?? []).length > 0);
  return (
    <div className="card" data-testid="cdb-card">
      <div className="row between">
        <span className="row" style={{ gap: 10 }}>
          <span className="bank-mark">
            <Icon name="banco" size={20} />
          </span>
          <h2>Investimentos (CDB)</h2>
        </span>
        <span className="pill ok">CDI {pct2(cdiRate(state))} ao ano</span>
      </div>
      <div className="seg" role="radiogroup" aria-label="Carência">
        <button role="radio" aria-checked={!lock} className={!lock ? 'on' : ''} onClick={() => setLock(false)}>
          Sem carência
        </button>
        <button role="radio" aria-checked={lock} className={lock ? 'on' : ''} onClick={() => setLock(true)} data-testid="cdb-lock">
          Com carência
        </button>
      </div>
      <div className="bank-pick" role="radiogroup" aria-label="Escolha o banco do CDB" data-testid="cdb-banks">
        {BANKS.map((b) => (
          <button key={b.id} className="bank-opt" role="radio" aria-checked={bank === b.id} data-bank={b.id} onClick={() => setBank(b.id)} title={b.description}>
            <b>{b.short}</b>
            <span className="num">{pct(cdbAnnualRate(state, b.id, lock))} ao ano</span>
            <small>{pct(cdbCdiShare(b.id, lock))} do CDI</small>
          </button>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        CDI = Selic − 0,1 pp. A taxa segue o CDI de cada rodada e rende no início de cada vez sua (a anual dividida pelas 6 rodadas). Conta como renda no IR ({Math.round(IR.rate * 100)}% acima de {money(IR.exempt)} no ano). Com carência: +{lockPp}% do CDI, mas só resgata depois de 1 semestre ({CDB_RULES.lockRounds} rodadas). Se o banco cobrar uma dívida, tira do CDB livre depois da poupança, antes de penhorar.
      </p>
      {mine.length > 0 && (
        <div className="list" data-testid="cdb-positions">
          {mine.map((b) => {
            const locks = cdbLocks(p, b.id, state.round);
            const freeNow = cdbFree(p, b.id, state.round);
            return (
              <div className="li" key={b.id} data-bank={b.id}>
                <div className="main">
                  <b>{b.name}</b>
                  {freeNow > 0 && <span>Livre {money(freeNow)}</span>}
                  {locks.map((d, k) => (
                    <span key={k}>
                      Com carência {money(d.amount)} · libera na rodada {d.until}
                    </span>
                  ))}
                </div>
                <span className="amt num">{money(cdbBalance(p, b.id))}</span>
              </div>
            );
          })}
          <div className="li">
            <div className="main">
              <b>Total no CDB</b>
            </div>
            <span className="amt num" data-testid="cdb-total">
              {money(cdbTotal(p))}
            </span>
          </div>
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        {myTurn ? (
          maxDep >= step ? (
            <>
              <div className="row">
                <div className="stepper">
                  <button aria-label={`Menos ${money(step)} na aplicação`} onClick={() => setDep(Math.max(step, depQ - step))}>
                    −
                  </button>
                  <span className="amt num" data-testid="cdb-deposit-amount">
                    {money(depQ)}
                  </span>
                  <button aria-label={`Mais ${money(step)} na aplicação`} onClick={() => setDep(Math.min(maxDep, depQ + step))}>
                    +
                  </button>
                </div>
                <button className="btn primary" data-testid="cdb-deposit" onClick={() => ui.pix({ type: 'cdbDeposit', bank, amount: depQ, ...(lock ? { lock: true } : {}) }, `Aplicação no CDB · ${info.short}`)}>
                  Aplicar
                </button>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>
                No {info.short}{lock ? ` com carência (libera na rodada ${state.round + CDB_RULES.lockRounds})` : ''}: {money(cdbYieldOf(state, depQ, bank, lock))} por vez com a taxa de agora.
              </span>
            </>
          ) : (
            <div className="banner warn">Saldo insuficiente para aplicar.</div>
          )
        ) : (
          <div className="banner info">Aplicação só na sua vez. O resgate do CDB livre vale a qualquer momento.</div>
        )}
        {free > 0 ? (
          <div className="row">
            <div className="stepper">
              <button aria-label={`Menos ${money(step)} no resgate do CDB`} onClick={() => setOut(Math.max(step, outQ - step))}>
                −
              </button>
              <span className="amt num" data-testid="cdb-withdraw-amount">
                {money(outQ)}
              </span>
              <button aria-label={`Mais ${money(step)} no resgate do CDB`} onClick={() => setOut(Math.min(free, outQ + step))}>
                +
              </button>
            </div>
            <button className="btn" data-testid="cdb-withdraw" onClick={() => ui.runWithReceipt({ type: 'cdbWithdraw', bank, amount: outQ }, `Resgate do CDB · ${info.short}`)}>
              Resgatar
            </button>
            {outQ !== free && (
              <button className="btn small" onClick={() => ui.runWithReceipt({ type: 'cdbWithdraw', bank, amount: free }, `Resgate do CDB · ${info.short}`)}>
                Tudo
              </button>
            )}
          </div>
        ) : cdbTotal(p) > 0 && cdbLocks(p, bank, state.round).length > 0 ? (
          <div className="banner info">O CDB do {info.short} ainda está na carência.</div>
        ) : null}
      </div>
    </div>
  );
}

/** Financiamentos de imóveis: um cartão com cada imóvel alienado ao banco, a próxima parcela e a quitação. */
function FinancingCard({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const fins = finsOf(state, me);
  if (!fins.length) return null;
  const myTurn = currentPlayer(state)?.id === me && !state.winner;
  return (
    <div className="card" data-testid="financing-card">
      <span className="row" style={{ gap: 10 }}>
        <span className="bank-mark">
          <Icon name="imoveis" size={20} />
        </span>
        <h2>Financiamentos de imóveis</h2>
      </span>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Separados do empréstimo e fora do seu limite. Cada imóvel financiado fica alienado ao banco até quitar: sem negociar e sem hipotecar. Se uma parcela não for paga (nem com a poupança), o banco retoma o imóvel e cancela o financiamento. Score mínimo para financiar: {BANKS.map((b) => `${b.short} ${b.finMinScore}`).join(', ')}.
      </p>
      {fins.map((f) => (
        <FinancingItem key={f.idx} ui={ui} f={f} myTurn={myTurn} />
      ))}
    </div>
  );
}

function FinancingItem({ ui, f, myTurn }: { ui: GameUi; f: Financing; myTurn: boolean }) {
  const { state, me } = ui;
  const p = findPlayer(state, me)!;
  const owed = loanOwed(f);
  const next = nextParcel(f);
  const left = finLeft(f);
  const short = p.balance < (next ? next.amount : owed);
  const name = street(f.idx).name;
  return (
    <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }} data-testid={`fin-${f.idx}`}>
      <div className="row between">
        <b>
          {name} · {f.what === 'terreno' ? 'terreno' : 'casa'}
          {f.bank ? ` · ${bankInfo(f.bank).name}` : ''}
        </b>
        <span className={`pill ${short ? 'bad' : 'warn'}`}>
          Falta{left === 1 ? '' : 'm'} {left} parcela{left === 1 ? '' : 's'}
        </span>
      </div>
      <div className="kv">
        <div>
          <span>Preço e entrada</span>
          <span className="num">
            {money(f.price)} · {money(f.entrada)}
          </span>
        </div>
        <div>
          <span>
            {planInfo(loanPlan(f)).name} a {pct(loanRate(f))}
            {isAnnual(f) ? ' ao ano' : ''} · juros {money(f.interest)}
          </span>
          <span className="num">{money(f.principal + f.interest)}</span>
        </div>
        <div>
          <span>Saldo devedor</span>
          <span className="num" data-testid={`fin-owed-${f.idx}`}>
            {money(owed)}
          </span>
        </div>
      </div>
      <div className={`banner ${short ? 'bad' : 'info'}`}>
        {next
          ? `Próxima parcela (${next.n}/${next.of}): ${money(next.amount)}, ${whenText(next.round, state.round)}.`
          : `Pagamento único de ${money(owed)}, ${whenText(f.dueRound, state.round)}.`}
      </div>
      {myTurn && (
        <button className="btn" disabled={p.balance < owed} onClick={() => ui.pix({ type: 'payFin', idx: f.idx }, 'Quitar financiamento')}>
          Quitar {money(owed)}
        </button>
      )}
    </div>
  );
}

/** Quando cai uma cobrança, ex.: "na rodada 7 (início do 1º semestre do ano 2)". */
function whenText(round: number, now: number): string {
  return round <= now ? `no início da sua próxima vez (${semesterText(round)})` : `na rodada ${round} (${semesterText(round)})`;
}

const pp = (r: number) => (r === 0 ? '0 pp' : `${r > 0 ? '+' : '−'}${Math.round(Math.abs(r) * 100)} pp`);

/** Taxa Selic do semestre (sorteada no início de cada semestre). */
function RateCard({ ui }: { ui: GameUi }) {
  const { state } = ui;
  const bump = state.selic !== undefined && bankRate(state) !== state.selic;
  return (
    <div className="rate-card" data-testid="bank-rate-card">
      <span className="lbl">Rodada {state.round}</span>
      <div className="rate-line" data-testid="bank-rate">
        Taxa Selic do semestre: <b className="num">{pct(state.selic ?? bankRate(state))}</b> (até a rodada {selicUntil(state.round)})
      </div>
      <span className="lbl">
        Sorteada no início de cada semestre (rodadas 1, 4, 7…) entre {BANK_RATES.options.map((r) => pct(r)).join(', ')} e fixa nas 3 rodadas
        {bump ? `; só nesta rodada, a manchete do Jornal levou os juros a ${pct(bankRate(state))}` : ''}. Cada banco soma a sua margem à Selic. O empréstimo e o financiamento travam a taxa ao ano do dia em que foram pegos.
      </span>
      {BANKS.some((b) => bankModTexts(state, b.id).length) && (
        <span className="lbl" data-testid="bank-mods">
          Jornal:{' '}
          {BANKS.flatMap((b) => bankModTexts(state, b.id).map((t) => `${b.name}, ${t}`)).join(' · ')}
        </span>
      )}
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
          <span className="num">{score < Math.min(...BANKS.map((b) => b.minScore)) ? 'Bloqueado' : `${Math.round(band.limitRate * 100)}% do patrimônio`}</span>
        </div>
        <div>
          <span>Ajuste da taxa</span>
          <span className="num">{pp(band.rateOffset)}</span>
        </div>
        <div>
          <span>Sua taxa no Banco Aurora</span>
          <span className="num" data-testid="my-rate">
            {pct(loanRateFor(state, me))} ao ano
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
          Parcela paga com o saldo +{CREDIT.parcelPaid} · parcelado quitado +{CREDIT.parcelLoanPaid} (se nenhuma parcela precisou de penhora) · parcela com penhora {CREDIT.parcelPenhora} · pagamento único quitado em dia ou
          antes +{CREDIT.loanPaid} · pagamento parcial do único +{CREDIT.partialPay} (uma vez por rodada, a partir de {money(LOAN.step)}) · pagamento único vencido com penhora {CREDIT.penhora} · declarar o IR +
          {CREDIT.irDeclared} · ficar sem saldo para um pagamento {CREDIT.shortfall} · malha fina {CREDIT.malhaFina}. O score é um só para os 3 bancos. Taxa ao ano = Selic + margem do banco ({BANKS.map((b) => `${b.short} ${pp(b.spread)}`).join(', ')}) + ajuste do score; empréstimo pessoal {pp(LOAN.personalSpread)} (o financiamento não); pagamento único {pp(LOAN.unicoAddOn)}. Faixas:{' '}
          {CREDIT_BANDS.map((b) => `${b.name} (${b.from}+: ${Math.round(b.limitRate * 100)}%, ${pp(b.rateOffset)})`).join(' · ')}. Score mínimo: {BANKS.map((b) => `${b.short} ${b.minScore}`).join(', ')}.
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
  const [amount, setAmount] = useState(LOAN.min);
  const [part, setPart] = useState(LOAN.step);
  const [plan, setPlan] = useState<LoanPlanId | null>(null);
  const [bank, setBank] = useState<BankId | null>(null);

  if (loan && isParcelado(loan)) return <ParcelLoanCard ui={ui} loan={loan} myTurn={myTurn} />;

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
          <div className="muted" style={{ fontSize: 13 }} data-testid="loan-bank">
            {bankInfo(loanBank(loan)).name} · pagamento único · você deve
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
            <span>Juros ({pct(loanRate(loan))}{isAnnual(loan) ? ' ao ano' : ''}, travados)</span>
            <span className="num">{money(loan.interest)}</span>
          </div>
          <div>
            <span>Já pagou</span>
            <span className="num">{money(loan.paid)}</span>
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }} data-testid="loan-due">
          Vence {whenText(loan.dueRound, state.round)}, no início da sua vez naquela rodada. Aí o banco cobra do seu saldo; se faltar, faz a penhora: vende suas casas pela metade e toma seus imóveis, do mais barato para o mais caro, pelo valor de hipoteca.
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

  const score = creditOf(p);
  const band = creditBand(score);
  const offers = bankOffers(state, me, 'loan');
  const offer = offers.find((o) => o.id === bank && !o.block) ?? null;
  const limit = offer?.limit ?? Math.max(0, ...offers.map((o) => o.limit));
  const q = Math.max(LOAN.min, Math.min(amount, limit));
  const options = offer ? loanOptions(state, me, q, offer.id) : [];
  const chosen = options.find((o) => o.plan === plan) ?? null;
  const minScore = Math.min(...offers.map((o) => o.minScore));
  return (
    <div className="card" data-testid="loan-card">
      <span className="row" style={{ gap: 10 }}>
        <span className="bank-mark">
          <Icon name="banco" size={20} />
        </span>
        <h2>Pedir empréstimo</h2>
      </span>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Com score {band.name.toLowerCase()}, até {Math.round(band.limitRate * 100)}% do seu patrimônio líquido (o Órbita empresta menos), a partir de {money(LOAN.min)}, em múltiplos de {money(LOAN.step)}. Escolha o banco, o valor e o plano:
        parcelado em 2x a 5x ({PARCEL_RULE}) ou pagamento único no {LOAN.unicoSemesters}º semestre ({pp(LOAN.unicoAddOn)}). Taxa = Selic {pct(bankRate(state))} + margem do banco
        {band.rateOffset ? ` ${pp(band.rateOffset)} pelo score` : ''} {pp(LOAN.personalSpread)} de empréstimo pessoal, e nunca abaixo do melhor CDB (já sem o IR) + {pp(BANK_RATES.overSavings)}: pegar emprestado para aplicar não compensa. {RATE_RULE}. Um empréstimo por vez.
      </p>
      <div className="kv">
        <div>
          <span>Patrimônio líquido</span>
          <span className="num">{money(equity(state, p))}</span>
        </div>
        <div>
          <span>Seu limite{offer ? ` no ${offer.short}` : ''}</span>
          <span className="num" data-testid="loan-limit">
            {money(limit)}
          </span>
        </div>
        <div>
          <span>Taxa Selic</span>
          <span className="num">{pct(bankRate(state))}</span>
        </div>
      </div>
      {score < minScore ? (
        <div className="banner bad">Seu score está abaixo de {minScore}: nenhum banco empresta. Pague o que deve e declare o IR para subir.</div>
      ) : offers.every((o) => o.block) ? (
        <div className="banner warn">Seu patrimônio não permite empréstimo agora.</div>
      ) : myTurn ? (
        <div className="stack" style={{ gap: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            1. Escolha o banco
          </span>
          <BankPicker state={state} offers={offers} bank={offer?.id ?? null} onPick={setBank} kind="loan" testId="loan-banks" />
          {offer && (
          <>
          <div className="row between">
            <span className="muted" style={{ fontSize: 13 }}>
              2. Valor
            </span>
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
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            3. Escolha como pagar
          </span>
          <PlanTable options={options} plan={plan} onPick={setPlan} label="Simulação do empréstimo" testId="loan-sim" />
          {chosen && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }} data-testid="loan-plan-summary">
              {offer.name}: {planSummary(chosen, chosen.plan === 'unico' ? 'Dá para pagar antes, inteiro ou em partes.' : 'Dá para quitar o saldo antes, sem desconto de juros.')}
            </p>
          )}
          </>
          )}
          <button className="btn primary" disabled={!offer || !chosen} onClick={() => offer && chosen && ui.runWithReceipt({ type: 'takeLoan', amount: q, plan: chosen.plan, bank: offer.id }, 'Empréstimo liberado')}>
            {!offer ? 'Escolha um banco' : chosen ? `Pegar ${money(q)} ${chosen.plan === 'unico' ? 'em pagamento único' : `em ${chosen.short}`}` : 'Escolha um plano'}
          </button>
        </div>
      ) : (
        <div className="banner info">Empréstimo só na sua vez.</div>
      )}
    </div>
  );
}

/** Empréstimo parcelado ativo: parcelas pagas, próxima parcela e quitação antecipada. */
function ParcelLoanCard({ ui, loan, myTurn }: { ui: GameUi; loan: Loan; myTurn: boolean }) {
  const { state, me } = ui;
  const p = findPlayer(state, me)!;
  const owed = loanOwed(loan);
  const next = nextParcel(loan);
  const paidN = loan.parcelsPaid ?? 0;
  const total = loan.parcels!.length;
  const short = next ? p.balance < next.amount : false;
  const info = planInfo(loanPlan(loan));
  return (
    <div className="card" data-testid="loan-card">
      <div className="row between">
        <span className="row" style={{ gap: 10 }}>
          <span className="bank-mark">
            <Icon name="banco" size={20} />
          </span>
          <h2>Seu empréstimo</h2>
        </span>
        <span className={`pill ${short ? 'bad' : 'warn'}`} data-testid="loan-progress">
          {paidN} de {total} pagas
        </span>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 13 }} data-testid="loan-bank">
          {bankInfo(loanBank(loan)).name} · {info.name.toLowerCase()} · saldo devedor
        </div>
        <div className="amt num" style={{ fontSize: 30 }} data-testid="loan-owed">
          {money(owed)}
        </div>
      </div>
      {next && (
        <div className={`banner ${short ? 'bad' : 'info'}`} data-testid="loan-next">
          <span>
            Próxima parcela ({next.n}/{next.of}): <b className="num">{money(next.amount)}</b>, {whenText(next.round, state.round)}.
            {short ? ' Seu saldo não cobre: se faltar, o banco faz a penhora no valor da parcela.' : ''}
          </span>
        </div>
      )}
      <div className="kv">
        <div>
          <span>Pegou</span>
          <span className="num">{money(loan.principal)}</span>
        </div>
        <div>
          <span>Juros ({pct(loanRate(loan))}{isAnnual(loan) ? ' ao ano' : ''}, travados)</span>
          <span className="num">{money(loan.interest)}</span>
        </div>
        <div>
          <span>Já pagou</span>
          <span className="num">{money(loan.paid)}</span>
        </div>
      </div>
      <ol className="parcel-list" data-testid="parcel-list">
        {loan.parcels!.map((v, k) => (
          <li key={k} className={k < paidN ? 'paid' : k === paidN ? 'next' : ''}>
            <span>
              Parcela {k + 1}/{total} · rodada {parcelRound(loan, k)} ({semesterOf(parcelRound(loan, k))}º sem. do ano {yearOf(parcelRound(loan, k))})
            </span>
            <b className="num">{k < paidN ? `${money(v)} paga` : money(v)}</b>
          </li>
        ))}
      </ol>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Uma parcela por semestre (a cada 3 rodadas), cobrada sozinha no início da sua vez na rodada que abre o semestre. Se o saldo não cobrir, o banco faz a penhora só no valor da parcela (vende casas pela metade do custo e toma imóveis, do mais barato para o mais caro, pelo valor de hipoteca); se nem
        assim cobrir, falência.
      </p>
      {myTurn ? (
        <button className="btn primary" disabled={p.balance < owed} onClick={() => ui.pix({ type: 'payLoan', amount: owed }, 'Quitar empréstimo')}>
          Quitar {money(owed)}
        </button>
      ) : (
        <div className="banner info">Quitação antecipada só na sua vez.</div>
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
