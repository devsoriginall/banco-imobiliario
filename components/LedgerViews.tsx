'use client';
import { useState } from 'react';
import { COMPANY_IDX, SHARE_PRICE } from '@/lib/game/data';
import { fmtTime, money } from '@/lib/game/format';
import { debtOf, equity, pname, sharesOf } from '@/lib/game/rules';
import type { GameState } from '@/lib/game/types';
import { Avatar } from './ui';

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
            <div className="li" key={p.id}>
              <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                <Avatar name={p.name} color={p.color} />
                <div className="main">
                  <b>
                    {k + 1}º {p.name}
                    {p.out ? ' · faliu' : ''}
                  </b>
                  <span>
                    Dinheiro {money(p.balance)} · {props} imóveis · {cotas} cotas
                    {d > 0 ? ` · dívida ${money(d)}` : ''}
                  </span>
                </div>
              </div>
              <span className="amt num">{money(w)}</span>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Patrimônio: dinheiro + imóveis pelo preço (menos a hipoteca) + casas pelo custo + cotas a {money(SHARE_PRICE)}, menos a dívida com o banco.
      </p>
    </div>
  );
}
