// Regras do jogo como funções puras: (estado, ação, contexto) → novo estado.
// Nada aqui toca rede, DOM ou relógio global (o relógio e o sorteio vêm do contexto),
// então a mesma ação pode ser reaplicada sobre um estado mais novo quando dá conflito de versão.
import { COMPANY_IDX, COMPANY_RATE, CONTROL, DEFAULTS, GROUPS, JAIL_POS, MAX_PLAYERS, NEWS, PLAYER_COLORS, SHARE_PRICE, SHARES, SPACES } from './data';
import type { Action, ActionContext, CompanySpace, GameState, GroupId, Player, StreetSpace, Transfer, TurnInfo } from './types';
import { money } from './format';

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

const MAX_TX = 150;
const MAX_FEED = 40;
const BANK = 'bank';

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

const emptyTurn = (): TurnInfo => ({ landed: null, resolved: false, news: null, feePaid: false });

export function shuffle(n: number, rng: () => number = Math.random): number[] {
  const a = [...Array(n).keys()];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Criação ----------

export function newRoom(code: string, host: { id: string; name: string }, now = new Date()): GameState {
  return {
    v: 1,
    code,
    phase: 'lobby',
    hostId: host.id,
    createdAt: now.toISOString(),
    round: 1,
    turn: 0,
    players: [makePlayer(host.id, host.name, 0, DEFAULTS.start)],
    props: {},
    shares: Object.fromEntries(COMPANY_IDX.map((i) => [i, {}])),
    deck: [],
    deckPtr: 0,
    tx: [],
    txCount: 0,
    feed: [],
    feedCount: 0,
    settings: { ...DEFAULTS },
    turnInfo: emptyTurn(),
    prev: null,
    prevBy: null,
    winner: null,
  };
}

function makePlayer(id: string, name: string, i: number, balance: number): Player {
  return { id, name, color: PLAYER_COLORS[i % PLAYER_COLORS.length], balance, pos: 0, jailed: false, jailTries: 0, freeCards: 0, out: false };
}

// ---------- Consultas ----------

export const street = (i: number): StreetSpace => {
  const s = SPACES[i];
  if (s?.type !== 'street') throw new RuleError('Esta casa não é um imóvel.');
  return s;
};
export const company = (i: number): CompanySpace => {
  const s = SPACES[i];
  if (s?.type !== 'company') throw new RuleError('Esta casa não é uma empresa.');
  return s;
};

export const findPlayer = (st: GameState, id: string) => st.players.find((p) => p.id === id);
export const currentPlayer = (st: GameState) => st.players[st.turn];
export const pname = (st: GameState, id: string) => (id === BANK ? 'Banco' : findPlayer(st, id)?.name || 'Jogador');
export const ownedBy = (st: GameState, i: number) => st.props[i]?.owner || null;
export const groupIdx = (g: GroupId) => SPACES.map((s, i) => (s.type === 'street' && s.group === g ? i : -1)).filter((i) => i >= 0);
export const ownsGroup = (st: GameState, pid: string, g: GroupId) => groupIdx(g).every((i) => ownedBy(st, i) === pid);
export const houses = (st: GameState, i: number) => st.props[i]?.houses || 0;
export const sharesOf = (st: GameState, i: number) => st.shares[i] || {};
export const bankShares = (st: GameState, i: number) => SHARES - Object.values(sharesOf(st, i)).reduce((a, b) => a + b, 0);
export const controller = (st: GameState, i: number) => {
  const sh = sharesOf(st, i);
  return Object.keys(sh).find((pid) => sh[pid] >= CONTROL) || null;
};
export const unmortgageCost = (st: GameState, i: number) => Math.round(street(i).mortgage * (1 + st.settings.mortgageRate));
export const groupName = (g: GroupId) => GROUPS[g].name;

/** Aluguel atual: tabela pelo número de casas; hipotecado não cobra.
 * O jogo da mesa não dobra o aluguel por grupo completo, então aqui também não. */
export function rentOf(st: GameState, i: number): number {
  const s = street(i);
  const p = st.props[i];
  if (!p || p.mortgaged) return 0;
  return s.rent[p.houses || 0];
}

export function netWorth(st: GameState, p: Player): number {
  let w = p.balance;
  for (const [k, pr] of Object.entries(st.props)) {
    if (pr.owner !== p.id) continue;
    const s = street(Number(k));
    w += pr.mortgaged ? s.price - s.mortgage : s.price;
    w += (pr.houses || 0) * s.build;
  }
  COMPANY_IDX.forEach((i) => (w += (sharesOf(st, i)[p.id] || 0) * SHARE_PRICE));
  return w;
}

const isMyTurn = (st: GameState, actor: string) => st.phase === 'playing' && !st.winner && currentPlayer(st)?.id === actor;

/** Pode construir: na própria vez, com o grupo completo, sem hipoteca no grupo, em rodízio (uma casa por imóvel de cada vez). */
export function canBuild(st: GameState, i: number, actor: string): boolean {
  const s = SPACES[i];
  const pr = st.props[i];
  if (s.type !== 'street' || !pr || pr.owner !== actor || !isMyTurn(st, actor)) return false;
  if (!ownsGroup(st, pr.owner, s.group)) return false;
  const g = groupIdx(s.group);
  if (g.some((j) => st.props[j]?.mortgaged)) return false;
  const h = houses(st, i);
  if (h >= 5) return false;
  if (h === 4) return g.every((j) => houses(st, j) >= 4);
  return h <= Math.min(...g.map((j) => houses(st, j)));
}

/** Vender casa: a qualquer momento, também em rodízio (vende primeiro do imóvel com mais casas). */
export function canSellHouse(st: GameState, i: number, actor: string): boolean {
  const s = SPACES[i];
  const pr = st.props[i];
  if (s.type !== 'street' || !pr || pr.owner !== actor || st.phase !== 'playing') return false;
  const h = houses(st, i);
  if (!h) return false;
  return h >= Math.max(...groupIdx(s.group).map((j) => houses(st, j)));
}

export function canMortgage(st: GameState, i: number, actor: string): boolean {
  const pr = st.props[i];
  return st.phase === 'playing' && !!pr && pr.owner === actor && !pr.mortgaged && !houses(st, i);
}

export function canUnmortgage(st: GameState, i: number, actor: string): boolean {
  const pr = st.props[i];
  return !!pr && pr.owner === actor && pr.mortgaged && isMyTurn(st, actor);
}

/** Taxa total da empresa: soma dos dados × $500, em dobro se o mesmo dono controla as 6 empresas. */
export function feeTotal(st: GameState, i: number, dice: number): number {
  const ctrl = controller(st, i);
  const ctrlAll = !!ctrl && COMPANY_IDX.every((c) => controller(st, c) === ctrl);
  return dice * COMPANY_RATE * (ctrlAll ? 2 : 1);
}

/** Quem recebe a taxa: o dono (≥6 cotas) leva tudo; sem dono, divide pelas cotas. Ninguém paga a si mesmo. */
export function feeTransfers(st: GameState, i: number, dice: number, payer: string): Transfer[] {
  const s = company(i);
  const total = feeTotal(st, i, dice);
  const ctrl = controller(st, i);
  if (ctrl) return ctrl === payer ? [] : [{ from: payer, to: ctrl, amount: total, reason: `Taxa da ${s.name} (dados ${dice})`, kind: 'fee', space: i }];
  return Object.entries(sharesOf(st, i))
    .filter(([pid, q]) => q > 0 && pid !== payer)
    .map(([pid, q]) => ({ from: payer, to: pid, amount: Math.round((total * q) / SHARES), reason: `Taxa da ${s.name}: ${q} de 10 cotas`, kind: 'fee' as const, space: i }))
    .filter((t) => t.amount > 0);
}

export const othersHoldShares = (st: GameState, i: number, pid: string) => Object.entries(sharesOf(st, i)).some(([id, q]) => q > 0 && id !== pid);

/** Quem não tem saldo para a sua parte de uma lista de transferências. */
export function shortPayers(st: GameState, list: Transfer[]): string[] {
  const owed: Record<string, number> = {};
  for (const t of list) if (t.from !== BANK) owed[t.from] = (owed[t.from] || 0) + t.amount;
  return Object.keys(owed).filter((pid) => (findPlayer(st, pid)?.balance ?? 0) < owed[pid]);
}

/**
 * As transferências que uma ação faria agora (para mostrar a prévia do Pix).
 * Retorna [] para ações sem dinheiro. Não valida saldo: quem chama mostra o aviso.
 */
export function transfersFor(st: GameState, action: Action, actor: string): Transfer[] {
  const p = currentPlayer(st);
  const landed = st.turnInfo.landed;
  switch (action.type) {
    case 'buy': {
      const s = street(landed ?? -1);
      return [{ from: p.id, to: BANK, amount: s.price, reason: `Compra da ${s.name}`, kind: 'buy', space: landed! }];
    }
    case 'payRent': {
      const s = street(landed ?? -1);
      const owner = ownedBy(st, landed!);
      if (!owner) return [];
      return [{ from: p.id, to: owner, amount: rentOf(st, landed!), reason: `Aluguel da ${s.name}`, kind: 'rent', space: landed! }];
    }
    case 'payFee':
      return feeTransfers(st, landed ?? -1, action.dice, p.id);
    case 'buyShares': {
      const s = company(landed ?? -1);
      const q = action.qty;
      return [{ from: p.id, to: BANK, amount: q * SHARE_PRICE, reason: `${q} cota${q > 1 ? 's' : ''} da ${s.name}`, kind: 'shares', space: landed! }];
    }
    case 'applyNews': {
      if (st.turnInfo.news === null) return [];
      const n = NEWS[st.turnInfo.news];
      if (n.k === 'pay') return [{ from: p.id, to: BANK, amount: n.v, reason: 'Notícia: ' + n.t, kind: 'news' }];
      if (n.k === 'get') return [{ from: BANK, to: p.id, amount: n.v, reason: 'Notícia: ' + n.t, kind: 'news' }];
      if (n.k === 'each')
        return st.players.filter((x) => x.id !== p.id && !x.out).map((x) => ({ from: x.id, to: p.id, amount: n.v, reason: 'Notícia: aposta na mesa', kind: 'news' as const }));
      return [];
    }
    case 'payTax': {
      const s = SPACES[landed ?? -1];
      if (s?.type !== 'tax') return [];
      return [{ from: p.id, to: BANK, amount: s.amount, reason: 'Imposto da Receita Federal', kind: 'tax', space: landed! }];
    }
    case 'refund': {
      const s = SPACES[landed ?? -1];
      if (s?.type !== 'refund') return [];
      return [{ from: BANK, to: p.id, amount: s.amount, reason: 'Restituição de IR', kind: 'refund', space: landed! }];
    }
    case 'bail':
      return [{ from: p.id, to: BANK, amount: st.settings.bail, reason: 'Fiança da detenção', kind: 'bail' }];
    case 'build': {
      const s = street(action.idx);
      return [{ from: actor, to: BANK, amount: s.build, reason: `${houses(st, action.idx) === 4 ? 'Hotel' : 'Casa'} na ${s.name}`, kind: 'build', space: action.idx }];
    }
    case 'sellHouse': {
      const s = street(action.idx);
      return [{ from: BANK, to: actor, amount: s.build / 2, reason: `Venda de construção na ${s.name}`, kind: 'sellhouse', space: action.idx }];
    }
    case 'mortgage': {
      const s = street(action.idx);
      return [{ from: BANK, to: actor, amount: s.mortgage, reason: `Hipoteca da ${s.name}`, kind: 'mortgage', space: action.idx }];
    }
    case 'unmortgage': {
      const s = street(action.idx);
      return [{ from: actor, to: BANK, amount: unmortgageCost(st, action.idx), reason: `Fim da hipoteca da ${s.name} (+20%)`, kind: 'unmortgage', space: action.idx }];
    }
    default:
      return [];
  }
}

// ---------- Mutações internas (sobre um clone) ----------

function applyTransfers(st: GameState, list: Transfer[], now: Date) {
  for (const t of list) {
    if (t.from !== BANK) findPlayer(st, t.from)!.balance -= t.amount;
    if (t.to !== BANK) findPlayer(st, t.to)!.balance += t.amount;
    st.txCount += 1;
    const id = `${st.code}-R${String(st.round).padStart(2, '0')}-${String(st.txCount).padStart(4, '0')}`;
    st.tx.unshift({ id, seq: st.txCount, at: now.toISOString(), round: st.round, ...t });
  }
  if (st.tx.length > MAX_TX) st.tx = st.tx.slice(0, MAX_TX);
}

function pay(st: GameState, list: Transfer[], now: Date) {
  const short = shortPayers(st, list);
  if (short.length) throw new RuleError(`Saldo insuficiente: ${short.map((id) => pname(st, id)).join(', ')}.`);
  applyTransfers(st, list, now);
}

function log(st: GameState, text: string, now: Date, by?: string, important = false) {
  st.feedCount += 1;
  st.feed.unshift({ seq: st.feedCount, at: now.toISOString(), text, by, important });
  if (st.feed.length > MAX_FEED) st.feed = st.feed.slice(0, MAX_FEED);
}

function nextTurn(st: GameState) {
  const n = st.players.length;
  let i = st.turn;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (i === 0) st.round += 1;
    if (!st.players[i].out) break;
  }
  st.turn = i;
  st.turnInfo = emptyTurn();
}

function sendToJail(p: Player) {
  p.pos = JAIL_POS;
  p.jailed = true;
  p.jailTries = 0;
}

function checkWinner(st: GameState) {
  const alive = st.players.filter((p) => !p.out);
  if (alive.length === 1) st.winner = alive[0].id;
}

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new RuleError(msg);
}

// ---------- Aplicar ação ----------

/** Ações que não guardam ponto de desfazer. */
const NO_UNDO = new Set<Action['type']>(['join', 'setStart', 'start', 'reset', 'undo']);

export function applyAction(state: GameState, action: Action, ctx: ActionContext): GameState {
  const now = ctx.now ?? new Date();
  const rng = ctx.rng ?? Math.random;
  const actor = ctx.actor;
  const st = clone(state);
  st.prev = null;

  // Ações de sala (lobby)
  switch (action.type) {
    case 'join': {
      const name = action.name.trim().slice(0, 16);
      need(name, 'Digite seu nome.');
      const me = findPlayer(st, actor);
      if (me) {
        me.name = name;
        return keep(state, st);
      }
      need(st.phase === 'lobby', 'A partida já começou. Você pode acompanhar, mas não entrar.');
      need(st.players.length < MAX_PLAYERS, `A sala já tem ${MAX_PLAYERS} jogadores.`);
      st.players.push(makePlayer(actor, name, st.players.length, st.settings.start));
      log(st, `${name} entrou na sala`, now, actor);
      return keep(state, st);
    }
    case 'setStart': {
      need(actor === st.hostId && st.phase === 'lobby', 'Só quem criou a sala muda o saldo inicial.');
      st.settings.start = Math.max(1000, Math.round(action.amount) || DEFAULTS.start);
      return keep(state, st);
    }
    case 'start': {
      need(actor === st.hostId, 'Só quem criou a sala pode começar.');
      need(st.phase === 'lobby', 'A partida já começou.');
      need(st.players.length >= 2, 'São precisos pelo menos 2 jogadores.');
      st.phase = 'playing';
      st.players = st.players.map((p, i) => makePlayer(p.id, p.name, i, st.settings.start));
      st.deck = shuffle(NEWS.length, rng);
      st.deckPtr = 0;
      st.round = 1;
      st.turn = 0;
      log(st, `Partida começou com ${st.players.length} jogadores`, now, actor, true);
      return keep(state, st);
    }
    case 'reset': {
      need(actor === st.hostId, 'Só quem criou a sala pode reiniciar.');
      const fresh = newRoom(st.code, { id: st.hostId, name: pname(st, st.hostId) }, now);
      fresh.players = st.players.map((p, i) => makePlayer(p.id, p.name, i, st.settings.start));
      fresh.settings = st.settings;
      fresh.feedCount = st.feedCount;
      fresh.txCount = 0;
      log(fresh, 'A sala voltou para o lobby', now, actor, true);
      return keep(state, fresh);
    }
    case 'undo': {
      need(state.prev && state.prevBy === actor, 'Não há ação sua para desfazer.');
      const back = clone(state.prev!);
      back.prev = null;
      back.prevBy = null;
      // o extrato e o feed continuam contando para frente
      back.feedCount = Math.max(back.feedCount, state.feedCount);
      back.txCount = Math.max(back.txCount, state.txCount);
      log(back, `${pname(state, actor)} desfez a última ação`, now, actor, true);
      return back;
    }
  }

  need(st.phase === 'playing', 'A partida ainda não começou.');
  need(!st.winner, 'A partida acabou.');
  const me = findPlayer(st, actor);
  need(me && !me.out, 'Você não está jogando nesta partida.');
  const p = currentPlayer(st);
  const ti = st.turnInfo;
  const turnOnly = () => need(p.id === actor, `Agora é a vez de ${p.name}.`);
  const landedSpace = () => {
    need(ti.landed !== null, 'Escolha primeiro a casa onde parou.');
    return SPACES[ti.landed!];
  };

  switch (action.type) {
    case 'land': {
      turnOnly();
      need(ti.landed === null, 'Você já escolheu a casa desta jogada.');
      need(!p.jailed, 'Você está na detenção.');
      const idx = action.idx;
      need(Number.isInteger(idx) && idx >= 0 && idx < SPACES.length, 'Casa inválida.');
      const s = SPACES[idx];
      const passed = idx < p.pos;
      p.pos = idx;
      ti.landed = idx;
      log(st, `${p.name} parou em ${s.name}`, now, actor);
      if (passed) applyTransfers(st, [{ from: BANK, to: p.id, amount: st.settings.salary, reason: 'Pró-labore do Início', kind: 'salary' }], now);
      if (s.type === 'gotojail') {
        sendToJail(p);
        ti.resolved = true;
        log(st, `${p.name} foi para a detenção sem receber pró-labore`, now, actor, true);
      }
      if (s.type === 'start' || s.type === 'free' || s.type === 'jail') ti.resolved = true;
      if (s.type === 'street') {
        const pr = st.props[idx];
        if (pr && (pr.owner === p.id || pr.mortgaged)) ti.resolved = true;
      }
      if (s.type === 'company' && !othersHoldShares(st, idx, p.id)) ti.resolved = true;
      break;
    }
    case 'buy': {
      turnOnly();
      const s = landedSpace();
      need(s.type === 'street' && !ownedBy(st, ti.landed!), 'Este imóvel não está à venda.');
      need(!ti.resolved, 'Esta casa já foi resolvida.');
      pay(st, transfersFor(state, action, actor), now);
      st.props[ti.landed!] = { owner: p.id, houses: 0, mortgaged: false };
      ti.resolved = true;
      log(st, `${p.name} comprou ${s.name} por ${money(s.price)}`, now, actor);
      break;
    }
    case 'skipBuy': {
      turnOnly();
      const s = landedSpace();
      need(s.type === 'street' && !ownedBy(st, ti.landed!), 'Não há compra para recusar.');
      ti.resolved = true;
      log(st, `${p.name} não comprou ${s.name}`, now, actor);
      break;
    }
    case 'payRent': {
      turnOnly();
      const s = landedSpace();
      const owner = ownedBy(st, ti.landed!);
      need(s.type === 'street' && owner && owner !== p.id, 'Não há aluguel a pagar aqui.');
      need(!ti.resolved, 'O aluguel já foi pago.');
      const r = rentOf(st, ti.landed!);
      if (r > 0) pay(st, transfersFor(state, action, actor), now);
      ti.resolved = true;
      log(st, `${p.name} pagou ${money(r)} de aluguel da ${s.name} para ${pname(st, owner!)}`, now, actor);
      break;
    }
    case 'payFee': {
      turnOnly();
      const s = landedSpace();
      need(s.type === 'company', 'Não há taxa de empresa aqui.');
      need(!ti.feePaid, 'A taxa já foi paga.');
      need(Number.isInteger(action.dice) && action.dice >= 2 && action.dice <= 12, 'A soma dos dados vai de 2 a 12.');
      const list = transfersFor(state, action, actor);
      pay(st, list, now);
      ti.feePaid = true;
      ti.resolved = true;
      log(st, `${p.name} pagou ${money(list.reduce((a, t) => a + t.amount, 0))} de taxa da ${s.name}`, now, actor);
      break;
    }
    case 'buyShares': {
      turnOnly();
      const s = landedSpace();
      need(s.type === 'company', 'Cotas só se compram ao cair na empresa.');
      const q = action.qty;
      need(Number.isInteger(q) && q >= 1, 'Quantidade inválida.');
      need(q <= bankShares(st, ti.landed!), 'A empresa não tem tantas cotas à venda.');
      pay(st, transfersFor(state, action, actor), now);
      const sh = st.shares[ti.landed!] || (st.shares[ti.landed!] = {});
      sh[p.id] = (sh[p.id] || 0) + q;
      log(st, `${p.name} comprou ${q} cota${q > 1 ? 's' : ''} da ${s.name}`, now, actor);
      break;
    }
    case 'drawNews': {
      turnOnly();
      const s = landedSpace();
      need(s.type === 'news', 'Esta casa não é Notícias.');
      need(ti.news === null, 'A notícia já foi aberta.');
      if (st.deckPtr >= st.deck.length) {
        st.deck = shuffle(NEWS.length, rng);
        st.deckPtr = 0;
      }
      ti.news = st.deck[st.deckPtr];
      st.deckPtr += 1;
      log(st, `${p.name} abriu o jornal: ${NEWS[ti.news].t}`, now, actor);
      break;
    }
    case 'applyNews': {
      turnOnly();
      need(ti.news !== null && !ti.resolved, 'Não há notícia para aplicar.');
      const n = NEWS[ti.news!];
      if (n.k === 'free') {
        p.freeCards += 1;
        log(st, `${p.name} guardou a carta de saída livre da prisão`, now, actor);
      } else if (n.k === 'jail') {
        sendToJail(p);
        log(st, `${p.name} foi para a detenção`, now, actor, true);
      } else pay(st, transfersFor(state, action, actor), now);
      ti.resolved = true;
      break;
    }
    case 'payTax': {
      turnOnly();
      need(landedSpace().type === 'tax' && !ti.resolved, 'Não há imposto a pagar.');
      pay(st, transfersFor(state, action, actor), now);
      ti.resolved = true;
      log(st, `${p.name} pagou o imposto da Receita Federal`, now, actor);
      break;
    }
    case 'refund': {
      turnOnly();
      need(landedSpace().type === 'refund' && !ti.resolved, 'Não há restituição a receber.');
      pay(st, transfersFor(state, action, actor), now);
      ti.resolved = true;
      log(st, `${p.name} recebeu a restituição de IR`, now, actor);
      break;
    }
    case 'jailOut': {
      turnOnly();
      need(p.jailed && ti.landed === null, 'Você não está na detenção.');
      p.jailed = false;
      p.jailTries = 0;
      log(st, `${p.name} tirou dupla e saiu da detenção`, now, actor);
      break;
    }
    case 'jailFail': {
      turnOnly();
      need(p.jailed && ti.landed === null, 'Você não está na detenção.');
      need(p.jailTries < 2, 'Na 3ª tentativa sem dupla, pague a fiança.');
      p.jailTries += 1;
      log(st, `${p.name} não tirou dupla (tentativa ${p.jailTries} de 3)`, now, actor);
      nextTurn(st);
      break;
    }
    case 'bail': {
      turnOnly();
      need(p.jailed && ti.landed === null, 'Você não está na detenção.');
      pay(st, transfersFor(state, action, actor), now);
      p.jailed = false;
      p.jailTries = 0;
      log(st, `${p.name} pagou a fiança e saiu da detenção`, now, actor);
      break;
    }
    case 'useCard': {
      turnOnly();
      need(p.jailed && ti.landed === null, 'Você não está na detenção.');
      need(p.freeCards > 0, 'Você não tem carta de saída livre.');
      p.freeCards -= 1;
      p.jailed = false;
      p.jailTries = 0;
      log(st, `${p.name} usou a carta e saiu da detenção`, now, actor);
      break;
    }
    case 'build': {
      need(canBuild(state, action.idx, actor), 'Não dá para construir aqui agora.');
      const s = street(action.idx);
      pay(st, transfersFor(state, action, actor), now);
      st.props[action.idx].houses += 1;
      log(st, `${me.name} construiu ${st.props[action.idx].houses === 5 ? 'um hotel' : 'uma casa'} na ${s.name}`, now, actor);
      break;
    }
    case 'sellHouse': {
      need(canSellHouse(state, action.idx, actor), 'Não dá para vender construção aqui agora.');
      pay(st, transfersFor(state, action, actor), now);
      st.props[action.idx].houses -= 1;
      log(st, `${me.name} vendeu uma construção na ${street(action.idx).name}`, now, actor);
      break;
    }
    case 'mortgage': {
      need(canMortgage(state, action.idx, actor), 'Não dá para hipotecar este imóvel.');
      pay(st, transfersFor(state, action, actor), now);
      st.props[action.idx].mortgaged = true;
      log(st, `${me.name} hipotecou ${street(action.idx).name}`, now, actor);
      break;
    }
    case 'unmortgage': {
      need(canUnmortgage(state, action.idx, actor), 'Tirar hipoteca só na sua vez, em imóvel seu hipotecado.');
      pay(st, transfersFor(state, action, actor), now);
      st.props[action.idx].mortgaged = false;
      log(st, `${me.name} tirou a hipoteca da ${street(action.idx).name}`, now, actor);
      break;
    }
    case 'endTurn': {
      turnOnly();
      need(ti.landed !== null && ti.resolved, 'Resolva a casa antes de passar a vez.');
      if (action.again) {
        need(!p.jailed, 'Na detenção não se joga de novo.');
        st.turnInfo = emptyTurn();
        log(st, `${p.name} tirou dupla e joga de novo`, now, actor);
      } else {
        nextTurn(st);
        log(st, `Vez de ${currentPlayer(st).name}`, now, actor);
      }
      break;
    }
    case 'bankrupt': {
      const d = findPlayer(st, action.debtor);
      need(d && !d.out, 'Jogador inválido.');
      // O próprio devedor declara; na aposta da mesa (todos pagam a quem está na vez), quem está na vez também pode.
      const eachNews = ti.news !== null && NEWS[ti.news].k === 'each' && !ti.resolved;
      const forcedByTurn = actor === p.id && action.creditor === p.id && eachNews && d.balance < NEWS[ti.news!].v;
      need(actor === d.id || forcedByTurn, 'Só o próprio jogador declara falência.');
      const creditor = action.creditor;
      need(creditor === BANK || (creditor !== d.id && findPlayer(st, creditor) && !findPlayer(st, creditor)!.out), 'Credor inválido.');
      for (const [k, pr] of Object.entries(st.props)) {
        if (pr.owner !== d.id) continue;
        if (creditor === BANK || pr.mortgaged) delete st.props[Number(k)];
        else pr.owner = creditor;
      }
      COMPANY_IDX.forEach((i) => {
        const sh = st.shares[i];
        const q = sh[d.id] || 0;
        delete sh[d.id];
        if (creditor !== BANK && q) sh[creditor] = (sh[creditor] || 0) + q;
      });
      if (d.balance > 0) applyTransfers(st, [{ from: d.id, to: creditor, amount: d.balance, reason: `Falência de ${d.name}`, kind: 'bankrupt' }], now);
      d.balance = 0;
      d.out = true;
      d.jailed = false;
      log(st, `${d.name} faliu e saiu do jogo`, now, actor, true);
      checkWinner(st);
      if (st.winner) log(st, `${pname(st, st.winner)} venceu a partida!`, now, actor, true);
      else if (currentPlayer(st).id === d.id) nextTurn(st);
      break;
    }
    default: {
      const never: never = action;
      throw new RuleError(`Ação desconhecida: ${(never as Action).type}`);
    }
  }

  if (!NO_UNDO.has(action.type)) {
    const prev = clone(state);
    prev.prev = null;
    st.prev = prev;
    st.prevBy = actor;
  }
  return st;
}

/** Mantém o ponto de desfazer existente (ações de sala não mexem nele). */
function keep(state: GameState, st: GameState): GameState {
  st.prev = state.prev;
  st.prevBy = state.prevBy;
  if (st.phase === 'lobby') {
    st.prev = null;
    st.prevBy = null;
  }
  return st;
}
