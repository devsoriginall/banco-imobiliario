'use client';
import { useState } from 'react';
import { CALENDAR, COMPANY_IDX, DECISION_IDS, DECISIONS, HEADLINES, SHARES, STOCK } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import {
  bankShares,
  company,
  controller,
  currentPlayer,
  decisionText,
  dividendPerShare,
  nextDividendRound,
  semesterYield,
  editionsAbout,
  feeRate,
  findPlayer,
  manageBlock,
  marketOn,
  pct,
  pname,
  priceChange,
  sharePrice,
  sharesOf,
  stockEffects,
  stockOf,
} from '@/lib/game/rules';
import type { DecisionId, Edition, GameState } from '@/lib/game/types';
import type { GameUi } from './Game';

const CAT: Record<string, string> = { bairro: 'Bairros', empresa: 'Empresas', economia: 'Economia' };

/** Variação em texto, ex.: "+12,3%" ou "−5%". */
export function fmtChange(ch: number): string {
  const v = Math.round(Math.abs(ch) * 1000) / 10;
  const t = `${v}`.replace('.', ',');
  return ch > 0 ? `+${t}%` : ch < 0 ? `−${t}%` : '0%';
}

/** Gráfico da cotação (últimas rodadas). */
export function Sparkline({ values, width = 96, height = 32, big = false, label }: { values: number[]; width?: number; height?: number; big?: boolean; label: string }) {
  const vs = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const pad = big ? 10 : 3;
  const x = (k: number) => pad + (k * (width - pad * 2)) / (vs.length - 1);
  const y = (v: number) => (max === min ? height / 2 : pad + ((max - v) * (height - pad * 2)) / (max - min));
  const up = vs[vs.length - 1] >= vs[0];
  const color = vs[vs.length - 1] === vs[0] ? 'var(--muted)' : up ? 'var(--accent)' : 'var(--bad)';
  const d = vs.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={big ? '100%' : width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="spark">
      {big && <path d={`M0 ${height / 3}H${width}M0 ${(2 * height) / 3}H${width}`} stroke="var(--surface-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      <path d={d} stroke={color} strokeWidth={big ? 2.5 : 2} fill="none" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Uma edição do Jornal da Cidade no estilo de jornal (tela cheia e aba Mercado). */
export function EditionPaper({ state, ed, compact = false }: { state: GameState; ed: Edition; compact?: boolean }) {
  const h = HEADLINES[ed.h];
  if (!h) return null;
  return (
    <article className={`paper${compact ? ' compact' : ''}`} data-testid="jornal-edition">
      <header className="paper-mast">
        <span className="paper-name">Jornal da Cidade</span>
        <span className="paper-meta">
          Sala {state.code} · Edição nº {ed.round} · Rodada {ed.round}
        </span>
      </header>
      <span className={`paper-cat c-${h.cat}`}>{CAT[h.cat]}</span>
      <h2 className="paper-head">{h.title}</h2>
      <p className="paper-body">{h.body}</p>
      <div className="paper-effect">
        <span className="paper-effect-label">Efeito no jogo</span>
        {ed.effects.map((t) => (
          <span key={t} className="paper-effect-line">
            {t}
          </span>
        ))}
      </div>
    </article>
  );
}

/** Edição da rodada em tela cheia, uma vez por celular. */
export function JornalModal({ state, ed, onClose, onHistory }: { state: GameState; ed: Edition; onClose: () => void; onHistory: () => void }) {
  return (
    <div className="jornal-full" role="dialog" aria-modal="true" aria-label={`Jornal da Cidade, edição ${ed.round}`}>
      <div className="jornal-inner">
        <EditionPaper state={state} ed={ed} />
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn primary block" onClick={onClose}>
            Fechar o jornal
          </button>
          <button className="btn block" onClick={onHistory}>
            Ver edições anteriores
          </button>
        </div>
      </div>
    </div>
  );
}

export type MercadoSeg = 'jornal' | 'bolsa';

export function MercadoView({ ui, seg, setSeg, stock, setStock }: { ui: GameUi; seg: MercadoSeg; setSeg: (s: MercadoSeg) => void; stock: number | null; setStock: (i: number | null) => void }) {
  const { state } = ui;
  if (!marketOn(state))
    return (
      <div className="card">
        <h2>Jornal e Bolsa desligados</h2>
        <p className="muted" style={{ margin: 0 }}>
          Quem criou a sala jogou com as regras clássicas: sem manchetes por rodada, cotas a {money(sharePrice(state, COMPANY_IDX[0]))} e sem dividendos.
        </p>
      </div>
    );
  return (
    <>
      <div className="seg" role="radiogroup" aria-label="Mercado">
        <button role="radio" aria-checked={seg === 'jornal'} className={seg === 'jornal' ? 'on' : ''} onClick={() => setSeg('jornal')}>
          Jornal
        </button>
        <button
          role="radio"
          aria-checked={seg === 'bolsa'}
          className={seg === 'bolsa' ? 'on' : ''}
          onClick={() => {
            setSeg('bolsa');
            setStock(null);
          }}
        >
          Bolsa
        </button>
      </div>
      {seg === 'jornal' ? <JornalList state={state} /> : stock !== null ? <StockDetail key={stock} ui={ui} i={stock} onBack={() => setStock(null)} /> : <StockList ui={ui} onOpen={setStock} />}
    </>
  );
}

function JornalList({ state }: { state: GameState }) {
  const eds = state.jornal ?? [];
  if (!eds.length)
    return (
      <div className="card">
        <h2>Nenhuma edição ainda</h2>
        <p className="muted" style={{ margin: 0 }}>
          A cada rodada nova sai uma edição do Jornal da Cidade, com uma manchete que mexe nos bairros, nas empresas ou na economia.
        </p>
      </div>
    );
  const [latest, ...older] = eds;
  return (
    <>
      <EditionPaper state={state} ed={latest} compact />
      {older.length > 0 && (
        <div className="card">
          <h3>Edições anteriores</h3>
          <div className="list" data-testid="jornal-history">
            {older.map((e) => {
              const h = HEADLINES[e.h];
              if (!h) return null;
              return (
                <div className="li" key={e.round} style={{ alignItems: 'flex-start' }}>
                  <div className="main">
                    <b className="serif">{h.title}</b>
                    {e.effects.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  <span className="pill info">Nº {e.round}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Change({ ch, suffix = '' }: { ch: number; suffix?: string }) {
  return (
    <span className={`chg ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}`}>
      {fmtChange(ch)}
      {suffix}
    </span>
  );
}

function StockList({ ui, onOpen }: { ui: GameUi; onOpen: (i: number) => void }) {
  const { state, me } = ui;
  const mineTotal = COMPANY_IDX.reduce((a, i) => a + (sharesOf(state, i)[me] || 0) * sharePrice(state, i), 0);
  return (
    <>
      <div className="card">
        <div className="row between">
          <h2>Bolsa</h2>
          <span className="pill info">Rodada {state.round}</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Cotação muda a cada rodada (sorteio de ±{Math.round(STOCK.drift * 100)}%, manchetes e decisões do dono). Dividendos pagos a cada semestre (rodadas 4, 7, 10…): {pct(STOCK.yield * CALENDAR.roundsPerSemester)} da cotação por cota, pela cotação do dia do pagamento; o próximo é na rodada{' '}
          {nextDividendRound(state.round)}. Toque numa empresa para
          ver detalhes e vender cotas.
        </p>
        {mineTotal > 0 && (
          <div className="row between">
            <span className="muted">Suas cotas valem</span>
            <b className="num">{money(mineTotal)}</b>
          </div>
        )}
        <div className="list" data-testid="stock-list">
          {COMPANY_IDX.map((i) => {
            const s = company(i);
            const sk = stockOf(state, i);
            const ctrl = controller(state, i);
            const q = sharesOf(state, i)[me] || 0;
            return (
              <button className={`li stock-row${q ? ' mine' : ''}`} key={i} onClick={() => onOpen(i)} data-stock={i} aria-label={`${s.name}: ${money(sk.price)}`}>
                <span className="avatar co">{s.short}</span>
                <span className="main">
                  <b>{s.name}</b>
                  <span>
                    Dividendo {pct(semesterYield(state, i, nextDividendRound(state.round)))} · {money(dividendPerShare(state, i, nextDividendRound(state.round)))}/cota na rodada {nextDividendRound(state.round)}
                  </span>
                  <span>
                    {ctrl ? `Dono: ${ctrl === me ? 'você' : pname(state, ctrl)}` : 'Sem dono'}
                    {q ? ` · você tem ${q} (${money(q * sk.price)})` : ''}
                  </span>
                </span>
                <span className="stock-right">
                  <Sparkline values={sk.hist} width={64} height={26} label={`Cotação da ${s.name} nas últimas rodadas`} />
                  <b className="num">{money(sk.price)}</b>
                  <Change ch={priceChange(state, i)} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StockDetail({ ui, i, onBack }: { ui: GameUi; i: number; onBack: () => void }) {
  const { state, me } = ui;
  const s = company(i);
  const sk = stockOf(state, i);
  const sh = sharesOf(state, i);
  const ctrl = controller(state, i);
  const mine = sh[me] || 0;
  const meP = findPlayer(state, me);
  const isTurn = currentPlayer(state)?.id === me && !state.winner;
  const [qty, setQty] = useState(1);
  const q = Math.min(Math.max(1, qty), Math.max(1, mine));
  const holders = Object.entries(sh)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const free = bankShares(state, i);
  const firstRound = state.round - sk.hist.length + 1;
  const news = editionsAbout(state, i).slice(0, 4);
  const effects = stockEffects(state, i);
  const block = manageBlock(state, i, me);

  const decide = (d: DecisionId) => {
    const action = { type: 'manage', idx: i, decision: d } as const;
    if (d === 'investir' || d === 'marketing') ui.pix(action, `Gerência: ${DECISIONS[d].name}`);
    else if (d === 'dividendo') ui.runWithReceipt(action, 'Dividendo extra pago');
    else ui.run(action);
  };

  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
        <button className="back-btn" aria-label="Voltar para a Bolsa" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <span className="avatar co big">{s.short}</span>
        <div style={{ minWidth: 0 }}>
          <h2>{s.name}</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {s.sector} · casa {i} do tabuleiro
          </span>
        </div>
      </div>

      <div className="card" data-testid="stock-detail">
        <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
          <span className="stock-price num">{money(sk.price)}</span>
          <Change ch={priceChange(state, i)} suffix=" na rodada" />
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          Preço por cota · {sk.hist.length > 1 ? `rodadas ${Math.max(1, firstRound)} a ${state.round}` : `rodada ${state.round}`}
        </span>
        <Sparkline values={sk.hist} width={320} height={120} big label={`Cotação da ${s.name}: de ${money(sk.hist[0])} para ${money(sk.price)}`} />
        <div className="row between muted" style={{ fontSize: 12, marginTop: -6 }}>
          <span>{money(Math.min(...sk.hist))} mín.</span>
          <span>{money(Math.max(...sk.hist))} máx.</span>
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <h3>Quem tem as {SHARES} cotas</h3>
          {ctrl && <span className="pill info">Dono: {ctrl === me ? 'você' : pname(state, ctrl)}</span>}
        </div>
        <div className="holder-bar" aria-hidden="true">
          {holders.map(([pid, n]) => (
            <span key={pid} style={{ flexGrow: n, background: findPlayer(state, pid)?.color ?? 'var(--muted)' }} />
          ))}
          {free > 0 && <span style={{ flexGrow: free, background: 'var(--line)' }} />}
        </div>
        <div className="row" style={{ gap: 14, fontSize: 13 }}>
          {holders.map(([pid, n]) => (
            <span key={pid} className="legend">
              <i style={{ background: findPlayer(state, pid)?.color }} />
              {pid === me ? 'Você' : pname(state, pid)} {n}
            </span>
          ))}
          <span className="legend">
            <i style={{ background: 'var(--line)' }} />
            Empresa {free}
          </span>
        </div>
        <div className="lines">
          <div>
            <span>Dividendo por cota (por semestre)</span>
            <span data-testid="stock-dividend">
              {money(dividendPerShare(state, i, nextDividendRound(state.round)))} na rodada {nextDividendRound(state.round)} ({pct(semesterYield(state, i, nextDividendRound(state.round)))})
            </span>
          </div>
          <div>
            <span>Taxa da casa {i}</span>
            <span>
              dados × {money(feeRate(state, i))}
              {ctrl ? `, para ${ctrl === me ? 'você' : pname(state, ctrl)}` : ', dividida pelas cotas'}
            </span>
          </div>
          {mine > 0 && (
            <div>
              <span>Suas cotas</span>
              <span>
                {mine} · {money(mine * sk.price)}
              </span>
            </div>
          )}
        </div>
        {effects.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Efeitos</span>
            {effects.map((t) => (
              <span key={t} className="pill warn" style={{ alignSelf: 'flex-start' }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {mine > 0 && meP && !meP.out && (
        <div className="card" data-testid="sell-card">
          <h3>Vender cotas à empresa</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Na sua vez, quantas quiser, pela cotação de agora ({money(sk.price)} cada). Venda não conta como renda.
          </p>
          <div className="row between">
            <div className="stepper">
              <button aria-label="Menos uma cota" onClick={() => setQty(Math.max(1, q - 1))}>
                −
              </button>
              <b className="num" style={{ minWidth: 24, textAlign: 'center' }}>
                {q}
              </b>
              <button aria-label="Mais uma cota" onClick={() => setQty(Math.min(mine, q + 1))}>
                +
              </button>
            </div>
            <span className="muted">de {mine}</span>
          </div>
          <button className="btn primary" disabled={!isTurn} onClick={() => ui.runWithReceipt({ type: 'sellShares', idx: i, qty: q }, 'Cotas vendidas')}>
            Vender {q} cota{q > 1 ? 's' : ''} por {money(q * sk.price)}
          </button>
          {!isTurn && <div className="banner info">Vender cotas à empresa só na sua vez.</div>}
        </div>
      )}

      {ctrl === me && (
        <div className="card" data-testid="gerencia">
          <div className="row between">
            <h3>Gerência</h3>
            <span className="pill ok">Você é o dono</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Uma decisão por rodada nesta empresa, na sua vez. Todos ficam sabendo.
          </p>
          {block && <div className="banner info">{block}</div>}
          <div className="stack" style={{ gap: 8 }}>
            {DECISION_IDS.map((d) => {
              const cost = d === 'investir' ? DECISIONS.investir.cost : d === 'marketing' ? DECISIONS.marketing.cost : 0;
              const short = !!meP && meP.balance < cost;
              return (
                <button key={d} className="decision" disabled={!!block || short} onClick={() => decide(d)}>
                  <b>
                    {DECISIONS[d].name}
                    {cost ? ` · ${money(cost)}` : ''}
                  </b>
                  <span>{decisionText(d)}</span>
                </button>
              );
            })}
          </div>
          {sk.decRound === state.round && sk.decision && <span className="muted" style={{ fontSize: 13 }}>Decisão desta rodada: {DECISIONS[sk.decision].name}.</span>}
        </div>
      )}

      <div className="card">
        <h3>Manchetes sobre a empresa</h3>
        {news.length ? (
          <div className="list">
            {news.map((e) => (
              <div className="li" key={e.round} style={{ alignItems: 'flex-start' }}>
                <div className="main">
                  <b className="serif">{HEADLINES[e.h].title}</b>
                  <span>{e.effects.join(' · ')}</span>
                </div>
                <span className="pill info">Nº {e.round}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Nenhuma manchete sobre a {s.name} ainda.
          </p>
        )}
      </div>
    </>
  );
}
