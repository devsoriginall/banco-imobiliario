'use client';
import { useState } from 'react';
import { COMPANY_IDX, IR } from '@/lib/game/data';
import { fmtTime, money } from '@/lib/game/format';
import { creditOf, debtOf, equity, findPlayer, incomeOf, irTax, pname, sharesOf } from '@/lib/game/rules';
import type { GameState } from '@/lib/game/types';
import { CreditPill } from './Credit';
import { Avatar } from './ui';

const IR_TXT: Record<string, string> = { isento: 'isento', declarou: 'declarado', pego: 'malha fina', passou: 'entregue' };

/** Renda do ano (desde a última volta) e o IR que ela daria agora. */
function IncomeBox({ state, me }: { state: GameState; me: string }) {
  const p = findPlayer(state, me);
  if (!p || p.out) return null;
  const inc = incomeOf(p);
  const last = p.irLast;
  return (
    <div className="kv" data-testid="income-box">
      <div>
        <span>Renda no ano {(p.year || 0) + 1}</span>
        <span className="num">{money(inc)}</span>
      </div>
      <div>
        <span>IR estimado ({Math.round(IR.rate * 100)}% acima de {money(IR.exempt)})</span>
        <span className="num">{money(irTax(inc))}</span>
      </div>
      <div>
        <span>Último IR</span>
        <span>{last ? `Ano ${last.year}: ${IR_TXT[last.outcome]}` : 'Nenhum ainda'}</span>
      </div>
    </div>
  );
}

export function TxView({ state, me }: { state: GameState; me: string }) {
  const [onlyMine, setOnlyMine] = useState(false);
  const list = onlyMine ? state.tx.filter((t) => t.from === me || t.to === me) : state.tx;
  return (
    <div className="card">
      <div className="row between">
        <h2>Extrato da partida</h2>
        <button className={`btn small${onlyMine ? ' dark' : ''}`} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>
          Só os meus
        </button>
      </div>
      <IncomeBox state={state} me={me} />
      {list.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Nenhuma transação ainda. Cada Pix da partida aparece aqui, para todos verem.
        </p>
      ) : (
        <div className="list" data-testid="tx-list">
          {list.map((t) => {
            const dir = t.to === me ? 'in' : t.from === me ? 'out' : '';
            return (
              <div className={`li${dir ? ' mine' : ''}`} key={t.id}>
                <div className="main">
                  <b>
                    {pname(state, t.from)} → {pname(state, t.to)}
                  </b>
                  <span>{t.reason}</span>
                  <span>
                    {t.id} · rodada {t.round} · {fmtTime(t.at)}
                  </span>
                </div>
                <span className={`amt num ${dir}`}>
                  {dir === 'in' ? '+' : dir === 'out' ? '−' : ''}
                  {money(t.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ScoreView({ state }: { state: GameState }) {
  const rows = state.players.map((p) => ({ p, w: equity(state, p), d: debtOf(state, p.id) })).sort((a, b) => b.w - a.w);
  return (
    <div className="card">
      <h2>Placar de patrimônio</h2>
      <div className="list">
        {rows.map(({ p, w, d }, k) => {
          const props = Object.values(state.props).filter((x) => x.owner === p.id).length;
          const cotas = COMPANY_IDX.reduce((a, i) => a + (sharesOf(state, i)[p.id] || 0), 0);
          return (
            <div className="li" key={p.id} data-player={p.name}>
              <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                <Avatar name={p.name} color={p.color} />
                <div className="main">
                  <b>
                    {k + 1}º {p.name}
                    {p.out ? ' · faliu' : ''}
                  </b>
                  <span>
                    Dinheiro <span className="cash">{money(p.balance)}</span> · {props} imóveis · {cotas} cotas
                    {d > 0 ? ` · dívida ${money(d)}` : ''}
                  </span>
                  <CreditPill score={creditOf(p)} />
                </div>
              </div>
              <span className="amt num">{money(w)}</span>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Patrimônio: dinheiro + imóveis pelo preço da casa (menos a hipoteca) + casas pelo custo + cotas pela cotação da Bolsa, menos a dívida com o banco.
      </p>
    </div>
  );
}
