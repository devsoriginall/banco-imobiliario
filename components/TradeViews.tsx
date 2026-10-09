'use client';
import { useState } from 'react';
import { COMPANY_IDX, GROUPS, SPACES } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { describeSide, emptySide, findPlayer, finOf, lotPrice, pname, sharePrice, sharesOf, street, tradeBlock, tradeProblem, tradesOf } from '@/lib/game/rules';
import type { GameState, Trade, TradeSide } from '@/lib/game/types';
import type { GameUi } from './Game';
import { Icon } from './Icon';
import { Sheet } from './Modals';
import { useToast } from './Toasts';
import { Avatar } from './ui';

/** Itens de um lado da proposta, um por linha. */
function SideItems({ side }: { side: TradeSide }) {
  const rows: React.ReactNode[] = [];
  if (side.money)
    rows.push(
      <li key="m" className="num">
        {money(side.money)}
      </li>,
    );
  for (const i of side.props) {
    const s = street(i);
    rows.push(
      <li key={`p${i}`}>
        <span className="swatch" style={{ background: `var(${GROUPS[s.group].c})` }} />
        {s.name} · terreno
      </li>,
    );
  }
  for (const [k, q] of Object.entries(side.shares))
    if (q > 0)
      rows.push(
        <li key={`c${k}`}>
          {q} cota{q > 1 ? 's' : ''} da {SPACES[Number(k)].name}
        </li>,
      );
  return <ul className="trade-items">{rows.length ? rows : <li className="muted">nada</li>}</ul>;
}

/** Propostas pendentes em que eu sou parte. Aparece no topo de todas as abas. */
export function TradeInbox({ ui }: { ui: GameUi }) {
  const mine = tradesOf(ui.state).filter((t) => t.to === ui.me || t.from === ui.me);
  if (!mine.length || !findPlayer(ui.state, ui.me) || ui.state.winner) return null;
  return (
    <>
      {mine.map((t) => (
        <TradeCard key={t.id} ui={ui} t={t} />
      ))}
    </>
  );
}

function TradeCard({ ui, t }: { ui: GameUi; t: Trade }) {
  const { state, me } = ui;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const incoming = t.to === me;
  const other = pname(state, incoming ? t.from : t.to);
  const problem = tradeProblem(state, t.from, t.to, t.give, t.get, incoming ? undefined : t.to);
  const youGet = incoming ? t.give : t.get;
  const youGive = incoming ? t.get : t.give;
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <div className={`card trade${incoming ? ' incoming' : ''}`} data-testid={incoming ? 'trade-incoming' : 'trade-outgoing'}>
      <div className="row between">
        <span className="row" style={{ gap: 8 }}>
          <Icon name="trade" size={20} />
          <h3>{incoming ? `Proposta de ${other}` : `Sua proposta a ${other}`}</h3>
        </span>
        <span className="pill info num">{t.id}</span>
      </div>
      <div className="trade-sides">
        <div>
          <span className="label">Você recebe</span>
          <SideItems side={youGet} />
        </div>
        <div>
          <span className="label">Você dá</span>
          <SideItems side={youGive} />
        </div>
      </div>
      {problem && <div className="banner warn">Esta proposta não vale mais: {problem}</div>}
      {incoming ? (
        <div className="row">
          <button
            className="btn primary"
            disabled={busy || !!problem}
            onClick={() =>
              act(async () => {
                const r = await ui.run({ type: 'acceptTrade', id: t.id });
                if (r) {
                  toast('Negociação fechada', `Negociação fechada com ${other}`);
                  ui.showReceipt(r.created, 'Negociação fechada');
                }
              })
            }
          >
            Aceitar
          </button>
          <button className="btn" disabled={busy} onClick={() => act(() => ui.run({ type: 'declineTrade', id: t.id }))}>
            Recusar
          </button>
        </div>
      ) : (
        <div className="row between">
          <div className="waiting">
            <span className="dot" />
            Esperando {other} responder.
          </div>
          <button className="btn small" disabled={busy} onClick={() => act(() => ui.run({ type: 'cancelTrade', id: t.id }))}>
            Cancelar proposta
          </button>
        </div>
      )}
    </div>
  );
}

/** Imóveis e cotas de um jogador para escolher numa proposta. */
function AssetPicker({ state, owner, me, side, onChange }: { state: GameState; owner: string; me: string; side: TradeSide; onChange: (s: TradeSide) => void }) {
  const p = findPlayer(state, owner)!;
  const props = Object.keys(state.props)
    .map(Number)
    .filter((i) => state.props[i].owner === owner)
    .sort((a, b) => a - b);
  const comps = COMPANY_IDX.filter((i) => (sharesOf(state, i)[owner] || 0) > 0);
  const toggle = (i: number) => onChange({ ...side, props: side.props.includes(i) ? side.props.filter((x) => x !== i) : [...side.props, i] });
  const setQ = (i: number, q: number) => onChange({ ...side, shares: { ...side.shares, [i]: q } });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field">
        <label htmlFor={`m-${owner}`}>
          Dinheiro{owner === me && <span className="muted"> (seu saldo: {money(p.balance)})</span>}
        </label>
        <input
          id={`m-${owner}`}
          inputMode="numeric"
          className="num"
          value={side.money ? String(side.money) : ''}
          placeholder="0"
          onChange={(e) => onChange({ ...side, money: Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0) })}
        />
      </div>
      {props.length === 0 && comps.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{owner === me ? 'Você' : pname(state, owner)} não tem imóveis nem cotas.</p>}
      {props.map((i) => {
        const s = street(i);
        const block = tradeBlock(state, i, owner);
        const on = side.props.includes(i);
        return (
          <button key={i} className="pick" aria-pressed={on} disabled={!!block} onClick={() => toggle(i)} data-pick={i}>
            <span className="swatch" style={{ background: `var(${GROUPS[s.group].c})` }} />
            <span className="main">
              <b>{s.name}</b>
              <span>
                Terreno · {money(lotPrice(state, i))}
                {state.props[i].mortgaged ? ' · hipotecado' : ''}
                {block ? (finOf(state, i) ? ' · financiado, alienado ao banco' : ' · com casas') : ''}
              </span>
            </span>
            <span className="box" aria-hidden="true">
              {on && <Icon name="check" size={16} />}
            </span>
          </button>
        );
      })}
      {comps.map((i) => {
        const have = sharesOf(state, i)[owner] || 0;
        const q = side.shares[i] || 0;
        return (
          <div key={i} className="pick static">
            <span className="main">
              <b>{SPACES[i].name}</b>
              <span>
                {have} cota{have > 1 ? 's' : ''} · {money(sharePrice(state, i))} cada
              </span>
            </span>
            <div className="stepper">
              <button aria-label={`Menos uma cota da ${SPACES[i].name}`} onClick={() => setQ(i, Math.max(0, q - 1))}>
                −
              </button>
              <span className="amt num">{q}</span>
              <button aria-label={`Mais uma cota da ${SPACES[i].name}`} onClick={() => setQ(i, Math.min(have, q + 1))}>
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TradeBuilder({ ui, partner, onClose }: { ui: GameUi; partner: string; onClose: () => void }) {
  const { state, me } = ui;
  const toast = useToast();
  const [give, setGive] = useState<TradeSide>(emptySide);
  const [get, setGet] = useState<TradeSide>(emptySide);
  const [busy, setBusy] = useState(false);
  const other = findPlayer(state, partner);
  if (!other) return null;
  const problem = tradeProblem(state, me, partner, give, get, partner);
  return (
    <Sheet label={`Negociar com ${other.name}`}>
      <div className="row" style={{ gap: 10 }}>
        <Avatar name={other.name} color={other.color} />
        <div>
          <h2>Negociar com {other.name}</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            A proposta fica pendente até {other.name} aceitar ou recusar.
          </span>
        </div>
      </div>
      <div className="trade-block">
        <span className="label">Você dá</span>
        <AssetPicker state={state} owner={me} me={me} side={give} onChange={setGive} />
      </div>
      <div className="trade-block">
        <span className="label">Você pede a {other.name}</span>
        <AssetPicker state={state} owner={partner} me={me} side={get} onChange={setGet} />
      </div>
      {!problem && (
        <div className="banner info" data-testid="trade-summary">
          Você dá {describeSide(give)} e recebe {describeSide(get)}.
        </div>
      )}
      {problem && (give.money || get.money || give.props.length || get.props.length || Object.values({ ...give.shares, ...get.shares }).some(Boolean)) ? <div className="banner warn">{problem}</div> : null}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Imóveis com casas não entram (venda as casas antes). Hipotecados entram e continuam hipotecados.
      </p>
      <button
        className="btn primary block"
        disabled={busy || !!problem}
        onClick={async () => {
          setBusy(true);
          const r = await ui.run({ type: 'proposeTrade', to: partner, give, get });
          setBusy(false);
          if (r) {
            toast('Proposta enviada', `${other.name} vai ver no celular.`);
            onClose();
          }
        }}
      >
        {busy ? 'Enviando…' : 'Enviar proposta'}
      </button>
      <button className="btn block" onClick={onClose}>
        Cancelar
      </button>
    </Sheet>
  );
}
