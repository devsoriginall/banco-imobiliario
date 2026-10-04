'use client';
import { useState } from 'react';
import { COMPANY_RATE, GROUPS, NEWS, SHARE_PRICE, SPACES, TIER_IDS } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { houseListing, listingFacts } from '@/lib/game/listings';
import {
  bankShares,
  boughtShareThisRound,
  buildBlock,
  controller,
  currentPlayer,
  feeTotal,
  hoodLabel,
  hoodMult,
  lotTier,
  othersHoldShares,
  ownedBy,
  pname,
  rentOf,
  sharesOf,
  tierMortgage,
  tierName,
  tierOf,
  tierPrice,
  tierRents,
  transfersFor,
} from '@/lib/game/rules';
import type { GameState, Space, TierId } from '@/lib/game/types';
import type { GameUi } from './Game';
import { HouseArt } from './HouseArt';

const groupColor = (g: keyof typeof GROUPS) => `var(${GROUPS[g].c})`;
const spaceColor = (s: Space) => (s.type === 'street' ? groupColor(s.group) : s.type === 'company' ? 'var(--g-empresa)' : 'var(--g-especial)');

export function PlayView({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  if (state.winner)
    return (
      <div className="turn">
        <span className="sub">Fim de jogo</span>
        <span className="who">{pname(state, state.winner)} venceu!</span>
        <span className="sub">Foi o último jogador que não faliu.</span>
      </div>
    );

  const p = currentPlayer(state);
  const mine = p.id === me;
  const ti = state.turnInfo;

  let body: React.ReactNode;
  if (p.jailed && ti.landed === null) body = <JailCard ui={ui} />;
  else if (ti.landed === null)
    body = mine ? (
      <div className="card">
        <h2>Em que casa você parou?</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Jogue os dados na mesa, ande com o peão e toque na casa. Se passar pelo Início, o pró-labore entra sozinho.
        </p>
        <Board state={state} onPick={(i) => ui.run({ type: 'land', idx: i })} />
      </div>
    ) : (
      <div className="card">
        <div className="waiting">
          <span className="dot" />
          {p.name} está jogando os dados e escolhendo a casa…
        </div>
        <Board state={state} />
      </div>
    );
  else body = <LandedView key={`${state.round}-${state.turn}-${ti.landed}`} ui={ui} />;

  return (
    <>
      <div className={`turn${mine ? ' mine' : ''}`} data-testid="turn">
        <span className="sub">{mine ? 'É a sua vez' : 'Vez de'}</span>
        <span className="who">{p.name}</span>
        <span className="sub">Saldo</span>
        <span className="big num">{money(p.balance)}</span>
        <span className="sub">
          Está em: {SPACES[p.pos].name}
          {p.freeCards ? ` · ${p.freeCards} carta de saída livre` : ''}
        </span>
      </div>
      {body}
      <Feed state={state} />
    </>
  );
}

function Feed({ state }: { state: GameState }) {
  const items = state.feed.slice(0, 6);
  if (!items.length) return null;
  return (
    <div className="card">
      <span className="label">Acontecendo na mesa</span>
      <ul className="feed" aria-live="polite">
        {items.map((f) => (
          <li key={f.seq} className={f.important ? 'imp' : ''}>
            {f.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JailCard({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const p = currentPlayer(state);
  const mine = p.id === me;
  return (
    <div className="card">
      <div className="row between">
        <h2>{mine ? 'Você está na detenção' : `${p.name} está na detenção`}</h2>
        <span className="pill warn">Tentativa {p.jailTries + 1} de 3</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Jogue os dados. Com dupla, sai e anda. Depois da 3ª tentativa sem dupla, paga {money(state.settings.bail)} de fiança.
      </p>
      {mine ? (
        <div className="row">
          <button className="btn primary" onClick={() => ui.run({ type: 'jailOut' })}>
            Tirei dupla
          </button>
          {p.jailTries < 2 && (
            <button className="btn" onClick={() => ui.run({ type: 'jailFail' })}>
              Não tirei dupla
            </button>
          )}
          <button className="btn" onClick={() => ui.pix({ type: 'bail' }, 'Fiança da detenção')}>
            Pagar fiança {money(state.settings.bail)}
          </button>
          {p.freeCards > 0 && (
            <button className="btn" onClick={() => ui.run({ type: 'useCard' })}>
              Usar carta de saída livre
            </button>
          )}
        </div>
      ) : (
        <div className="waiting">
          <span className="dot" />
          Esperando {p.name} tentar sair.
        </div>
      )}
    </div>
  );
}

export function Board({ state, onPick }: { state: GameState; onPick?: (i: number) => void }) {
  const p = currentPlayer(state);
  return (
    <div className={`board${onPick ? '' : ' readonly'}`} role="group" aria-label="Casas do tabuleiro">
      {SPACES.map((s, i) => {
        const owner = s.type === 'street' ? ownedBy(state, i) : null;
        return (
          <button
            key={i}
            className={`space${p.pos === i ? ' here' : ''}`}
            onClick={onPick ? () => onPick(i) : undefined}
            disabled={!onPick}
            aria-label={`Casa ${i}: ${s.name}${owner ? ` · ${pname(state, owner)}` : ''}`}
            data-space={i}
          >
            <span className="bar" style={{ background: spaceColor(s) }} />
            <span className="n">{i}</span>
            <span className="t">{s.name}</span>
            <span className="tok">
              {state.players
                .filter((x) => !x.out && x.pos === i)
                .map((x) => (
                  <i key={x.id} style={{ background: x.color }} />
                ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const LABELS = ['Sem casa', '1 casa', '2 casas', '3 casas', '4 casas', 'Hotel'];

/** Anúncio do imóvel. Sem dono, mostra a casa em destaque (`tier`); com dono, a casa dele. */
export function Listing({ state, i, tier: shown, children }: { state: GameState; i: number; tier?: TierId; children?: React.ReactNode }) {
  const s = SPACES[i];
  if (s.type !== 'street') return null;
  const pr = state.props[i];
  const h = pr?.houses || 0;
  const tier = pr ? tierOf(state, i) : (shown ?? tierOf(state, i));
  const rents = tierRents(state, i, tier);
  const hood = hoodLabel(hoodMult(state, s.group));
  const house = houseListing(i, tier);
  return (
    <div className="listing">
      <div className="hero" style={{ background: groupColor(s.group) }}>
        <svg width="72" height="72" viewBox="0 0 96 96" fill="none" stroke="#fff" strokeWidth="2.5" aria-hidden="true">
          <path d="M8 88h80" />
          <rect x="14" y="40" width="20" height="48" />
          <rect x="38" y="14" width="22" height="74" />
          <rect x="64" y="30" width="18" height="58" />
        </svg>
        <span className="h-title">{s.name}</span>
      </div>
      <div className="row between">
        <span className="row" style={{ gap: 6 }}>
          <span className="swatch" style={{ background: groupColor(s.group) }} />
          <span className="muted">
            {s.city} · grupo {GROUPS[s.group].name.toLowerCase()}
          </span>
        </span>
        {pr && (
          <span className="amt num" style={{ fontSize: 20 }}>
            {money(tierPrice(state, i))}
          </span>
        )}
      </div>
      {hood && (
        <span className={`pill ${hoodMult(state, s.group) > 1 ? 'ok' : 'warn'}`} style={{ alignSelf: 'flex-start' }} data-testid="hood">
          {hood}
        </span>
      )}
      <p style={{ margin: 0 }}>{s.desc}</p>
      {children}
      {pr && (
        <div className="house-owned" data-testid="house-owned">
          <HouseArt kind={house.kind} tier={tier} color={groupColor(s.group)} size={96} />
          <div className="main">
            <span className="label">Casa {tierName(tier)}</span>
            <b>{house.title}</b>
            <span className="muted">
              {listingFacts(house)}
              {house.perk ? ` · ${house.perk}` : ''}
            </span>
          </div>
        </div>
      )}
      <div className="kv">
        <div>
          <span>Casa ou hotel</span>
          <span className="num">{money(s.build)}</span>
        </div>
        <div>
          <span>Hipoteca</span>
          <span className="num">{money(pr?.mortgageValue ?? tierMortgage(state, i, tier))}</span>
        </div>
        <div>
          <span>Dono</span>
          <span>{pr ? pname(state, pr.owner) : 'À venda'}</span>
        </div>
      </div>
      <div className="rent num" data-testid="rent-table">
        {rents.map((r, k) => {
          const cur = pr && k === h ? 'cur' : '';
          return (
            <span key={k} style={{ display: 'contents' }}>
              <span className={cur}>
                {LABELS[k]}
                {cur ? ' · atual' : ''}
              </span>
              <span className={cur}>{money(r)}</span>
            </span>
          );
        })}
      </div>
      {!pr && (
        <span className="muted" style={{ fontSize: 12 }}>
          Tabela de aluguel da casa {tierName(tier)}.
        </span>
      )}
      {pr?.mortgaged && (
        <span className="pill warn" style={{ alignSelf: 'flex-start' }}>
          Hipotecado: não cobra aluguel
        </span>
      )}
    </div>
  );
}

/** As 3 casas à venda no terreno, como num site de imóveis. Terreno que voltou ao banco tem uma casa só. */
function TierPicker({ state, i, value, onChange, disabled }: { state: GameState; i: number; value: TierId; onChange: (t: TierId) => void; disabled?: boolean }) {
  const s = SPACES[i];
  if (s.type !== 'street') return null;
  const forced = lotTier(state, i);
  const options = forced ? [forced] : TIER_IDS;
  return (
    <div className="tiers" role="radiogroup" aria-label="Escolha a casa">
      {forced && <div className="banner info">Este terreno voltou ao banco com a casa {tierName(forced)} já construída. Quem comprar leva esta casa.</div>}
      {options.map((t) => {
        const l = houseListing(i, t);
        return (
          <button key={t} className="tier" role="radio" aria-checked={value === t} disabled={disabled} onClick={() => onChange(t)} data-tier={t}>
            <HouseArt kind={l.kind} tier={t} color={groupColor(s.group)} size={104} />
            <span className="main">
              <span className="label">{tierName(t)}</span>
              <b>{l.title}</b>
              <span className="muted">
                {listingFacts(l)}
                {l.perk ? ` · ${l.perk}` : ''}
              </span>
              <span className="tier-nums">
                <span className="amt num" data-testid={`tier-price-${t}`}>
                  {money(tierPrice(state, i, t))}
                </span>
                <span className="muted num">aluguel {money(tierRents(state, i, t)[0])}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LandedView({ ui }: { ui: GameUi }) {
  const { state, me } = ui;
  const p = currentPlayer(state);
  const mine = p.id === me;
  const ti = state.turnInfo;
  const i = ti.landed!;
  const s = SPACES[i];
  const [dice, setDice] = useState<number | null>(null);
  const [tier, setTier] = useState<TierId>(() => (s.type === 'street' ? (lotTier(state, i) ?? 'intermediaria') : 'intermediaria'));
  const who = mine ? 'Você' : p.name;

  let inner: React.ReactNode = null;
  if (s.type === 'street') {
    const owner = ownedBy(state, i);
    let action: React.ReactNode = null;
    let picker: React.ReactNode = null;
    const chosen = lotTier(state, i) ?? tier;
    const price = tierPrice(state, i, chosen);
    if (!owner) {
      if (!ti.resolved)
        picker = (
          <>
            <span className="label">{lotTier(state, i) ? 'Casa à venda' : 'Escolha uma das 3 casas'}</span>
            <TierPicker state={state} i={i} value={chosen} onChange={setTier} disabled={!mine} />
          </>
        );
      if (!ti.resolved)
        action = (
          <>
            {mine ? (
              <>
                <div className="row">
                  <button className="btn primary" disabled={p.balance < price} onClick={() => ui.pix({ type: 'buy', tier: chosen }, `Comprar casa ${tierName(chosen)}`)}>
                    Comprar {tierName(chosen)} por {money(price)}
                  </button>
                  <button className="btn" onClick={() => ui.run({ type: 'skipBuy' })}>
                    Não comprar
                  </button>
                </div>
                {p.balance < price && <div className="banner warn">Saldo insuficiente para esta casa.</div>}
              </>
            ) : (
              <Waiting text={`${p.name} está escolhendo a casa.`} />
            )}
          </>
        );
      else action = <div className="banner info">{who} não comprou. Continua à venda.</div>;
    } else if (owner === p.id) action = mine ? <BuildOffer ui={ui} i={i} /> : <div className="banner info">Este imóvel já é de {p.name}.</div>;
    else {
      const r = rentOf(state, i);
      if (r === 0) action = <div className="banner info">Imóvel hipotecado: não há aluguel a pagar.</div>;
      else if (ti.resolved)
        action = (
          <div className="banner info">
            Aluguel de {money(r)} (casa {tierName(tierOf(state, i))}) pago a {owner === me ? 'você' : pname(state, owner)}.
          </div>
        );
      else
        action = (
          <div className="row between">
            <div>
              <div className="muted" style={{ fontSize: 13 }}>
                Aluguel da casa {tierName(tierOf(state, i))} para {owner === me ? 'você' : pname(state, owner)}
              </div>
              <div className="amt num" style={{ fontSize: 24 }} data-testid="rent-due">
                {money(r)}
              </div>
            </div>
            {mine ? (
              <button className="btn primary" onClick={() => ui.pix({ type: 'payRent' }, 'Pagar aluguel')}>
                Pagar com Pix
              </button>
            ) : (
              <Waiting text={`Esperando ${p.name} pagar.`} />
            )}
          </div>
        );
    }
    inner = (
      <>
        <Listing state={state} i={i} tier={chosen}>
          {picker}
          {picker && mine && action}
        </Listing>
        {!(picker && mine) && action}
      </>
    );
  } else if (s.type === 'company') {
    const sh = sharesOf(state, i);
    const ctrl = controller(state, i);
    const bankQ = bankShares(state, i);
    const holders = Object.entries(sh).filter(([, q]) => q > 0);
    const needsFee = othersHoldShares(state, i, p.id) && !ti.feePaid;
    const boughtShare = boughtShareThisRound(state, p.id);
    const canShare = !boughtShare && p.balance >= SHARE_PRICE;
    inner = (
      <>
        <div className="row" style={{ gap: 12 }}>
          <span className="avatar" style={{ background: 'var(--g-empresa)', color: 'var(--bg)', borderRadius: 12 }}>
            {s.short}
          </span>
          <div>
            <h2>{s.name}</h2>
            <span className="muted">
              {s.sector} · cota a {money(SHARE_PRICE)}
            </span>
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Quem tem as 10 cotas</span>
          {holders.map(([pid, n]) => (
            <div className="row between" key={pid}>
              <span>
                {pname(state, pid)}
                {pid === ctrl ? ' · dono' : ''}
              </span>
              <span className="num">{n}</span>
            </div>
          ))}
          <div className="row between">
            <span className="muted">Empresa (à venda)</span>
            <span className="num">{bankQ}</span>
          </div>
        </div>
        {needsFee &&
          (mine ? (
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">Taxa: soma dos dados × {money(COMPANY_RATE)}</span>
              <div className="dice">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((v) => (
                  <button key={v} aria-pressed={dice === v} onClick={() => setDice(v)}>
                    {v}
                  </button>
                ))}
              </div>
              <button
                className="btn primary"
                disabled={!dice}
                onClick={() => {
                  if (!dice) return;
                  const action = { type: 'payFee', dice } as const;
                  // dono que cai na própria empresa: nada a pagar, só resolve
                  if (transfersFor(state, action, me).length) ui.pix(action, 'Taxa da empresa');
                  else ui.run(action);
                }}
              >
                Pagar taxa{dice ? ` de ${money(feeTotal(state, i, dice))}` : ''}
              </button>
            </div>
          ) : (
            <Waiting text={`Esperando ${p.name} pagar a taxa.`} />
          ))}
        {ti.feePaid && <div className="banner info">Taxa paga.</div>}
        {bankQ > 0 && mine && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Comprar cota da empresa (só ao cair aqui, uma por rodada)</span>
            <button className="btn primary" disabled={!canShare} onClick={() => ui.pix({ type: 'buyShares', qty: 1 }, 'Comprar cota')}>
              Comprar 1 cota por {money(SHARE_PRICE)}
            </button>
            {boughtShare && <div className="banner info">Você já comprou uma cota da empresa nesta rodada. Na próxima rodada, pode comprar outra.</div>}
            {!boughtShare && p.balance < SHARE_PRICE && <div className="banner warn">Saldo insuficiente para comprar a cota.</div>}
          </div>
        )}
      </>
    );
  } else if (s.type === 'news') {
    if (ti.news === null)
      inner = (
        <>
          <h2>Notícias</h2>
          {mine ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Abra o jornal para ver a sua notícia.
              </p>
              <button className="btn primary" onClick={() => ui.run({ type: 'drawNews' })}>
                Abrir o jornal
              </button>
            </>
          ) : (
            <Waiting text={`${p.name} vai abrir o jornal.`} />
          )}
        </>
      );
    else {
      const n = NEWS[ti.news];
      const verb = n.k === 'pay' ? 'Pagar com Pix' : n.k === 'jail' ? 'Ir para a detenção' : n.k === 'free' ? 'Guardar a carta' : 'Receber';
      inner = (
        <>
          <div className="news">
            <div className="mast">Diário do Tabuleiro</div>
            <span className="label">{n.k === 'pay' ? 'Pague' : n.k === 'free' || n.k === 'jail' ? 'Aviso' : 'Receba'}</span>
            <div className="headline">{n.t}</div>
            {n.v > 0 && (
              <div className="amt num" style={{ fontSize: 22 }}>
                {n.k === 'each' ? `${money(n.v)} de cada jogador` : money(n.v)}
              </div>
            )}
          </div>
          {!ti.resolved &&
            (mine ? (
              <button
                className="btn primary"
                onClick={() => {
                  if (n.k === 'pay') ui.pix({ type: 'applyNews' }, 'Notícia');
                  else if (n.k === 'each') ui.pix({ type: 'applyNews' }, `Cada jogador paga ${money(n.v)}`);
                  else if (n.k === 'get') ui.runWithReceipt({ type: 'applyNews' });
                  else ui.run({ type: 'applyNews' });
                }}
              >
                {verb}
              </button>
            ) : (
              <Waiting text={`Esperando ${p.name}.`} />
            ))}
        </>
      );
    }
  } else if (s.type === 'tax') {
    inner = (
      <>
        <h2>Receita Federal</h2>
        <p className="muted" style={{ margin: 0 }}>
          {mine ? 'Pague' : `${p.name} paga`} {money(s.amount)} de imposto ao banco.
        </p>
        {ti.resolved ? (
          <div className="banner info">Imposto pago.</div>
        ) : mine ? (
          <button className="btn primary" onClick={() => ui.pix({ type: 'payTax' }, 'Imposto')}>
            Pagar com Pix
          </button>
        ) : (
          <Waiting text={`Esperando ${p.name} pagar.`} />
        )}
      </>
    );
  } else if (s.type === 'refund') {
    inner = (
      <>
        <h2>Restituição de IR</h2>
        <p className="muted" style={{ margin: 0 }}>
          {mine ? 'Receba' : `${p.name} recebe`} {money(s.amount)} do banco.
        </p>
        {ti.resolved ? (
          <div className="banner info">Restituição recebida.</div>
        ) : mine ? (
          <button className="btn primary" onClick={() => ui.runWithReceipt({ type: 'refund' })}>
            Receber {money(s.amount)}
          </button>
        ) : (
          <Waiting text={`Esperando ${p.name} receber.`} />
        )}
      </>
    );
  } else if (s.type === 'gotojail')
    inner = (
      <>
        <h2>Vá para a detenção</h2>
        <p className="muted" style={{ margin: 0 }}>
          {who} foi direto para a detenção, sem receber pró-labore.
        </p>
      </>
    );
  else if (s.type === 'free')
    inner = (
      <>
        <h2>Feriado</h2>
        <p className="muted" style={{ margin: 0 }}>
          Nada acontece. Aproveite o descanso.
        </p>
      </>
    );
  else if (s.type === 'jail')
    inner = (
      <>
        <h2>Prisão: só visitando</h2>
        <p className="muted" style={{ margin: 0 }}>
          Nada acontece.
        </p>
      </>
    );
  else
    inner = (
      <>
        <h2>Início</h2>
        <p className="muted" style={{ margin: 0 }}>
          O pró-labore já entrou.
        </p>
      </>
    );

  return (
    <div className="card" data-testid="landed">
      {!mine && <span className="label">{p.name} parou em</span>}
      {inner}
      {mine && (
        <div className="row">
          <button className="btn primary" disabled={!ti.resolved} onClick={() => ui.run({ type: 'endTurn', again: false })}>
            Passar a vez
          </button>
          <button className="btn" disabled={!ti.resolved || p.jailed} onClick={() => ui.run({ type: 'endTurn', again: true })}>
            Tirei dupla: jogar de novo
          </button>
          {state.prev && state.prevBy === me && state.prev.turnInfo.landed === null && (
            <button className="btn small" onClick={() => ui.run({ type: 'undo' })}>
              Escolhi a casa errada
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "Site da imobiliária": no imóvel seu onde você parou, ampliar com mais uma casa (ou o hotel). */
function BuildOffer({ ui, i }: { ui: GameUi; i: number }) {
  const { state, me } = ui;
  const s = SPACES[i];
  if (s.type !== 'street') return null;
  const h = state.props[i]?.houses || 0;
  const tier = tierOf(state, i);
  if (h >= 5) return <div className="banner info">Seu imóvel já tem hotel: está no máximo. Aluguel de {money(rentOf(state, i))}.</div>;
  const block = buildBlock(state, i, me);
  const rents = tierRents(state, i, tier);
  const what = h === 4 ? 'hotel' : 'casa';
  return (
    <div className="build-offer" data-testid="build-offer">
      <span className="label">Ampliar seu imóvel · casa {tierName(tier)}</span>
      <div className="build-rents">
        <div>
          <span>Aluguel agora</span>
          <b className="num">{money(rents[h])}</b>
        </div>
        <span className="arrow" aria-hidden="true">
          →
        </span>
        <div>
          <span>Com {h === 4 ? 'hotel' : h === 0 ? '1 casa' : `${h + 1} casas`}</span>
          <b className="num" data-testid="build-next-rent">
            {money(rents[h + 1])}
          </b>
        </div>
      </div>
      <button className="btn primary" disabled={!!block} onClick={() => ui.pix({ type: 'build', idx: i }, h === 4 ? 'Construir hotel' : 'Construir casa')}>
        Construir {what} · {money(s.build)}
      </button>
      {block && (
        <span className="build-why" data-testid="build-why">
          Sem construir agora: {block === 'Já construiu nesta rodada' ? 'você já construiu nesta rodada' : block.toLowerCase()}.
        </span>
      )}
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="waiting">
      <span className="dot" />
      {text}
    </div>
  );
}
