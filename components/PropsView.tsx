'use client';
import { useState } from 'react';
import { COMPANY_IDX, GROUPS, SHARE_PRICE, SPACES } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import {
  bankShares,
  buildBlock,
  canMortgage,
  canSellHouse,
  canUnmortgage,
  controller,
  groupIdx,
  hoodLabel,
  hoodMult,
  houses,
  lotTier,
  pname,
  rentOf,
  sharesOf,
  street,
  tierMortgage,
  tierName,
  tierOf,
  tierPrice,
  tierRents,
  unmortgageCost,
} from '@/lib/game/rules';
import type { GroupId } from '@/lib/game/types';
import type { GameUi } from './Game';

export function PropsView({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const ownsAny = Object.values(state.props).some((p) => p.owner === me);
  const [filter, setFilter] = useState<'meus' | 'todos'>(ownsAny ? 'meus' : 'todos');

  const groups = (Object.keys(GROUPS) as GroupId[])
    .map((g) => {
      const idxs = groupIdx(g).filter((i) => filter === 'todos' || state.props[i]?.owner === me);
      if (!idxs.length) return null;
      const hood = hoodLabel(hoodMult(state, g));
      return (
        <div className="card" key={g}>
          <div className="group-head">
            <span className="swatch" style={{ background: `var(${GROUPS[g].c})` }} />
            <h3>{GROUPS[g].name}</h3>
            {hood && (
              <span className={`pill ${hoodMult(state, g) > 1 ? 'ok' : 'warn'}`} style={{ marginLeft: 'auto' }}>
                {hood}
              </span>
            )}
          </div>
          <div className="list">
            {idxs.map((i) => {
              const s = street(i);
              const pr = state.props[i];
              const h = houses(state, i);
              const acts: React.ReactNode[] = [];
              const block = pr?.owner === me ? buildBlock(state, i, me) : null;
              if (pr?.owner === me) {
                if (h < 5)
                  acts.push(
                    <button key="b" className="btn small" disabled={!!block} onClick={() => ui.pix({ type: 'build', idx: i }, h === 4 ? 'Construir hotel' : 'Construir casa')}>
                      {h === 4 ? 'Hotel' : 'Casa'} {money(s.build)}
                    </button>,
                  );
                if (canSellHouse(state, i, me))
                  acts.push(
                    <button key="s" className="btn small" onClick={() => ui.runWithReceipt({ type: 'sellHouse', idx: i })}>
                      Vender {h === 5 ? 'hotel' : 'casa'} +{money(s.build / 2)}
                    </button>,
                  );
                if (canMortgage(state, i, me))
                  acts.push(
                    <button key="m" className="btn small" onClick={() => ui.runWithReceipt({ type: 'mortgage', idx: i })}>
                      Hipotecar +{money(tierMortgage(state, i))}
                    </button>,
                  );
                if (canUnmortgage(state, i, me))
                  acts.push(
                    <button key="u" className="btn small" onClick={() => ui.pix({ type: 'unmortgage', idx: i }, 'Tirar hipoteca')}>
                      Tirar hipoteca {money(unmortgageCost(state, i))}
                    </button>,
                  );
              }
              return (
                <div className={`li${pr?.owner === me ? ' mine' : ''}`} key={i} style={{ flexWrap: 'wrap' }}>
                  <div className="main">
                    <b>{s.name}</b>
                    <span>
                      {pr || lotTier(state, i)
                        ? `Casa ${i} · ${pr ? '' : `terreno com casa ${tierName(tierOf(state, i))} · `}${money(tierPrice(state, i))} · aluguel atual ${money(pr ? rentOf(state, i) : tierRents(state, i)[0])}`
                        : `Casa ${i} · 3 casas de ${money(tierPrice(state, i, 'basica'))} a ${money(tierPrice(state, i, 'alto'))}`}
                    </span>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      {!pr ? <span className="pill ok">À venda</span> : <span className="pill info">{pr.owner === me ? 'Seu' : pname(state, pr.owner)}</span>}
                      {pr && (
                        <span className="pill tier-pill" data-testid={`tier-${i}`}>
                          {tierName(tierOf(state, i))}
                        </span>
                      )}
                      {pr?.mortgaged && <span className="pill warn">Hipotecado</span>}
                      {h > 0 && <span className="pill ok">{h === 5 ? 'Hotel' : `${h} casa${h > 1 ? 's' : ''}`}</span>}
                    </div>
                    {block && block !== 'Já tem hotel' && (
                      <span className="build-why" data-testid={`build-why-${i}`}>
                        Sem construir agora: {block}
                      </span>
                    )}
                  </div>
                  {acts.length > 0 && (
                    <div className="row" style={{ gap: 6 }}>
                      {acts}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    })
    .filter(Boolean);

  const comps = COMPANY_IDX.filter((i) => filter === 'todos' || (sharesOf(state, i)[me] || 0) > 0);

  return (
    <>
      <div className="row" role="radiogroup" aria-label="Filtro" style={{ gap: 8 }}>
        <button className={`btn small${filter === 'meus' ? ' dark' : ''}`} aria-pressed={filter === 'meus'} onClick={() => setFilter('meus')}>
          Meus imóveis
        </button>
        <button className={`btn small${filter === 'todos' ? ' dark' : ''}`} aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')}>
          Tabuleiro todo
        </button>
      </div>
      <div className="banner info">
        Construir: em qualquer imóvel seu sem hipoteca, na sua vez, uma construção por rodada e não no imóvel comprado nesta rodada; hotel depois de 4 casas. Tirar hipoteca também só na sua vez. Vender casa e
        hipotecar valem a qualquer momento.
      </div>
      {groups.length === 0 && comps.length === 0 && (
        <div className="card">
          <h2>Nenhum imóvel ainda</h2>
          <p className="muted" style={{ margin: 0 }}>
            Quando você comprar um imóvel ou cotas de empresa, eles aparecem aqui.
          </p>
        </div>
      )}
      {groups}
      {comps.length > 0 && (
        <div className="card">
          <h3>Empresas</h3>
          <div className="list">
            {comps.map((i) => {
              const s = SPACES[i];
              const sh = sharesOf(state, i);
              const ctrl = controller(state, i);
              const parts = Object.entries(sh)
                .filter(([, q]) => q > 0)
                .map(([pid, q]) => `${pid === me ? 'você' : pname(state, pid)} ${q}`)
                .join(' · ');
              return (
                <div className={`li${(sh[me] || 0) > 0 ? ' mine' : ''}`} key={i}>
                  <div className="main">
                    <b>{s.name}</b>
                    <span>
                      Casa {i} · {parts || 'nenhuma cota vendida'} · empresa {bankShares(state, i)}
                    </span>
                    {(sh[me] || 0) > 0 && <span>Suas cotas valem {money((sh[me] || 0) * SHARE_PRICE)}</span>}
                  </div>
                  {ctrl && <span className="pill info">Dono: {ctrl === me ? 'você' : pname(state, ctrl)}</span>}
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Cotas se compram da empresa só ao cair nela, ou de outro jogador negociando na aba Banco. Com 6 ou mais cotas você é o dono e recebe toda a taxa.
          </p>
        </div>
      )}
    </>
  );
}
