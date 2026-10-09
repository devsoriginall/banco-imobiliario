// Regras do jogo como funções puras: (estado, ação, contexto) → novo estado.
// Nada aqui toca rede, DOM ou relógio global (o relógio e o sorteio vêm do contexto),
// então a mesma ação pode ser reaplicada sobre um estado mais novo quando dá conflito de versão.
import { BANK_RATES, CALENDAR, COMPANY_IDX, COMPANY_RATE, CONTROL, CREDIT, CREDIT_BANDS, DECISIONS, DEFAULT_TIER, DEFAULTS, FINANCE, GROUPS, HEADLINES, HOOD, INSURANCE, IR, JAIL_POS, JORNAL, LOAN, LOAN_PLANS, MAX_DOUBLES, MAX_PLAYERS, NEWS, PLAYER_COLORS, SAVINGS, SHARE_PRICE, SHARES, SPACES, STOCK, TIERS } from './data';
import type { Action, ActionContext, CompanySpace, DecisionId, Edition, Financing, GameState, GroupId, Headline, HeadlineEffect, HoodMod, Loan, LoanPlanId, Player, Stock, StreetSpace, TierId, TimedMod, Trade, TradeSide, Transfer, TurnInfo, TxKind } from './types';
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
    trades: [],
    tradeCount: 0,
    loans: {},
    hood: {},
    lots: {},
    irPending: null,
    cal: 1,
  };
}

function makePlayer(id: string, name: string, i: number, balance: number): Player {
  return { id, name, color: PLAYER_COLORS[i % PLAYER_COLORS.length], balance, pos: 0, jailed: false, jailTries: 0, freeCards: 0, out: false, income: 0, irYear: 0, credit: CREDIT.start };
}

// ---------- Sorteio determinístico ----------

/** Hash inteiro (FNV-1a) de um texto. */
function hashStr(x: string): number {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) {
    h ^= x.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Próximo número do sorteio da sala, em [0, 1). Usa mulberry32 com o estado guardado em `st.seed`,
 * então todos os celulares (e a reaplicação depois de conflito, e o desfazer) chegam ao mesmo resultado.
 * Salas antigas sem semente derivam uma do próprio estado.
 */
export function nextRandom(st: GameState): number {
  const seed = st.seed ?? hashStr(`${st.code}|${st.createdAt}|${st.txCount}|${st.feedCount}|${st.round}`);
  const a = (seed + 0x6d2b79f5) >>> 0;
  st.seed = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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
export const groupName = (g: GroupId) => GROUPS[g].name;

// ---------- Casas (Básica, Intermediária, Alto padrão) e valorização do bairro ----------

const round10 = (x: number) => Math.round(x / 10) * 10;
const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Valorização permanente do bairro (grupo de cor); 1 = sem mudança. */
export const hoodBase = (st: GameState, g: GroupId) => st.hood?.[g] ?? HOOD.start;
/** Modificadores temporários do bairro (manchetes do Jornal) ainda valendo nesta rodada. */
export const hoodModsOf = (st: GameState, g: GroupId): HoodMod[] => (st.hoodMods ?? []).filter((m) => m.group === g && m.until >= st.round);
/**
 * Multiplicador de preço e aluguel do bairro: o permanente × cada modificador temporário ativo (1 + pct/100),
 * dentro de HOOD.min..HOOD.max; 1 = sem mudança.
 */
export function hoodMult(st: GameState, g: GroupId): number {
  const base = hoodBase(st, g);
  const mods = hoodModsOf(st, g);
  if (!mods.length) return base;
  const m = mods.reduce((a, x) => a * (1 + x.pct / 100), base);
  return Math.min(HOOD.max, Math.max(HOOD.min, round4(m)));
}
/** Texto da valorização, ex.: "Bairro valorizado +10%" (null quando o bairro está no preço normal). */
export function hoodLabel(mult: number): string | null {
  const pct = Math.round((mult - 1) * 100);
  if (!pct) return null;
  return pct > 0 ? `Bairro valorizado +${pct}%` : `Bairro desvalorizado −${-pct}%`;
}
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
/** Até quando vale um efeito: "só nesta rodada" ou "até a rodada 9". */
const untilText = (st: GameState, until: number) => (until <= st.round ? 'só nesta rodada' : `até a rodada ${until}`);
/**
 * Selos do bairro: a valorização permanente e cada efeito temporário,
 * ex.: ["Bairro valorizado +20%", "Assaltos −15% até a rodada 9"].
 */
export function hoodTags(st: GameState, g: GroupId): { text: string; up: boolean }[] {
  const out: { text: string; up: boolean }[] = [];
  const base = hoodBase(st, g);
  const label = hoodLabel(base);
  if (label) out.push({ text: label, up: base > 1 });
  for (const m of hoodModsOf(st, g)) out.push({ text: `${m.why} ${signed(m.pct)}% ${untilText(st, m.until)}`, up: m.pct > 0 });
  return out;
}
/** Os selos do bairro numa linha só (null quando o bairro está no preço normal). */
export function hoodText(st: GameState, g: GroupId): string | null {
  const t = hoodTags(st, g);
  return t.length ? t.map((x) => x.text).join(' · ') : null;
}
/**
 * Padrão das casas do imóvel, ou null se é só terreno (sem casas). Salas antigas: com casas e sem padrão, Intermediária;
 * padrão guardado com 0 casas é ignorado.
 */
export const tierOf = (st: GameState, i: number): TierId | null => {
  const pr = st.props[i];
  if (!pr || !(pr.houses > 0)) return null;
  return pr.tier && TIERS[pr.tier] ? pr.tier : DEFAULT_TIER;
};
export const tierName = (t: TierId) => TIERS[t].name;
/** Preço do terreno: preço do tabuleiro × bairro, arredondado a $ 10. */
export function lotPrice(st: GameState, i: number): number {
  const s = street(i);
  return round10(s.price * hoodMult(st, s.group));
}
/** Custo de cada casa (e do hotel) no padrão: custo de construção do tabuleiro × padrão × bairro, arredondado a $ 10. */
export function buildPrice(st: GameState, i: number, tier: TierId = tierOf(st, i) ?? DEFAULT_TIER): number {
  const s = street(i);
  return round10(s.build * TIERS[tier].build * hoodMult(st, s.group));
}
/**
 * Tabela de aluguel [sem casa, 1..4 casas, hotel]: o terreno paga o "sem casa" do tabuleiro × bairro;
 * com casas, a tabela do tabuleiro × padrão × bairro.
 */
export function tierRents(st: GameState, i: number, tier: TierId = tierOf(st, i) ?? DEFAULT_TIER): number[] {
  const s = street(i);
  const hm = hoodMult(st, s.group);
  return s.rent.map((r, k) => Math.round(r * hm * (k ? TIERS[tier].rent : 1)));
}
/** Valor de hipoteca do terreno: hipoteca do tabuleiro × bairro (só terreno sem casas pode ser hipotecado). */
export function lotMortgage(st: GameState, i: number): number {
  const s = street(i);
  return round10(s.mortgage * hoodMult(st, s.group));
}
/** Quanto a hipoteca rendeu (ou renderia agora). */
export const mortgageValueOf = (st: GameState, i: number) => st.props[i]?.mortgageValue ?? lotMortgage(st, i);
export const unmortgageCost = (st: GameState, i: number) => Math.round(mortgageValueOf(st, i) * (1 + st.settings.mortgageRate));

/**
 * Valorização do bairro (gancho para as Notícias/Jornal): soma `pct` pontos percentuais ao multiplicador
 * do grupo (ex.: +10 → 1,1), dentro de HOOD.min..HOOD.max. Afeta preço, aluguéis e hipoteca das casas do bairro.
 */
export function applyNeighbourhoodChange(state: GameState, group: GroupId, pct: number, now = new Date()): GameState {
  if (!GROUPS[group]) throw new RuleError('Bairro inválido.');
  if (!Number.isFinite(pct)) throw new RuleError('Variação inválida.');
  const st = clone(state);
  const delta = shiftHood(st, group, pct);
  if (delta) log(st, `Bairro ${GROUPS[group].name.toLowerCase()} ${delta > 0 ? 'valorizou' : 'desvalorizou'} ${Math.abs(delta)}%: preços e aluguéis ${delta > 0 ? 'sobem' : 'caem'}`, now, undefined, true);
  return st;
}

/** Soma `pct` pontos ao multiplicador permanente do bairro (sobre o próprio estado); devolve a mudança em pontos. */
function shiftHood(st: GameState, group: GroupId, pct: number): number {
  const before = hoodBase(st, group);
  const after = Math.min(HOOD.max, Math.max(HOOD.min, round4(before + pct / 100)));
  st.hood = { ...(st.hood || {}), [group]: after };
  return Math.round((after - before) * 100);
}

/** Aluguel atual: tabela da casa pelo número de construções; hipotecado não cobra.
 * O jogo da mesa não dobra o aluguel por grupo completo, então aqui também não. */
export function rentOf(st: GameState, i: number): number {
  const p = st.props[i];
  if (!p || p.mortgaged) return 0;
  return tierRents(st, i)[p.houses || 0];
}

export function netWorth(st: GameState, p: Player): number {
  let w = p.balance + savingsOf(p);
  for (const [k, pr] of Object.entries(st.props)) {
    if (pr.owner !== p.id) continue;
    const i = Number(k);
    const price = lotPrice(st, i);
    w += pr.mortgaged ? price - mortgageValueOf(st, i) : price;
    w += (pr.houses || 0) * buildPrice(st, i);
  }
  COMPANY_IDX.forEach((i) => (w += (sharesOf(st, i)[p.id] || 0) * sharePrice(st, i)));
  return w;
}

// ---------- Bolsa (cotações, dividendos, gerência) ----------

/** Jornal e Bolsa ligados nesta sala (salas antigas e novas: ligado; o anfitrião pode desligar no lobby). */
export const marketOn = (st: GameState) => st.settings?.mercado !== false;
const clampPrice = (x: number) => Math.min(STOCK.max, Math.max(STOCK.min, Math.round(x / STOCK.round) * STOCK.round));
const activeIn = (m: TimedMod, round: number) => m.from <= round && round <= m.until;

/** Cotação e efeitos da empresa (salas antigas, sem Bolsa: SHARE_PRICE, sem efeitos). */
export const stockOf = (st: GameState, i: number): Stock => st.stocks?.[i] ?? { price: SHARE_PRICE, hist: [SHARE_PRICE] };
/** Preço atual da cota: o que se paga ao comprar da empresa e o que ela paga de volta. */
export const sharePrice = (st: GameState, i: number) => stockOf(st, i).price;
/** Preço no começo da rodada anterior (para a variação). */
export function prevPrice(st: GameState, i: number): number {
  const s = stockOf(st, i);
  return s.hist.length >= 2 ? s.hist[s.hist.length - 2] : s.price;
}
/** Variação desde a rodada anterior, em fração (0,1 = +10%). */
export function priceChange(st: GameState, i: number): number {
  const before = prevPrice(st, i);
  return before ? round4((sharePrice(st, i) - before) / before) : 0;
}
function ensureStock(st: GameState, i: number): Stock {
  st.stocks = st.stocks || {};
  if (!st.stocks[i]) st.stocks[i] = { price: SHARE_PRICE, hist: [SHARE_PRICE] };
  return st.stocks[i];
}
/** Rendimento do dividendo na rodada (fração): base + ajustes ativos; greve ativa = 0. */
export function dividendYield(st: GameState, i: number, round = st.round): number {
  const mods = (stockOf(st, i).yieldMods ?? []).filter((m) => activeIn(m, round));
  if (mods.some((m) => m.zero)) return 0;
  return Math.max(0, round4(STOCK.yield + mods.reduce((a, m) => a + (m.pp || 0), 0) / 100));
}
/**
 * Rendimento do dividendo do semestre (fração): o rendimento por rodada da rodada do pagamento × rodadas do semestre
 * (base 3% × 3 = 9%). Efeitos com janela de rodadas valem se a rodada do pagamento cai dentro dela.
 */
export const semesterYield = (st: GameState, i: number, round = st.round) => round4(dividendYield(st, i, round) * CALENDAR.roundsPerSemester);
/** Dividendo por cota de um pagamento semestral na rodada `round` (cotação atual × rendimento do semestre, a $ 1). */
export const dividendPerShare = (st: GameState, i: number, round = st.round) => Math.round(sharePrice(st, i) * semesterYield(st, i, round));
/** Rodada do próximo pagamento de dividendos: próximo início de semestre depois desta rodada (o primeiro é na rodada 4). */
export const nextDividendRound = (round: number) => semesterStartFrom(round + 1);
/** Esta rodada paga dividendos (início de semestre, a partir da rodada 4)? */
export const paysDividends = (round: number) => round > 1 && isSemesterStart(round);
/** Greve ativa (dividendo zero) nesta rodada. */
export const onStrike = (st: GameState, i: number) => (stockOf(st, i).yieldMods ?? []).some((m) => m.zero && activeIn(m, st.round));
/** Soma dos aumentos da taxa da casa ativos nesta rodada (em %). */
export const feeBoost = (st: GameState, i: number) => (stockOf(st, i).feeMods ?? []).filter((m) => activeIn(m, st.round)).reduce((a, m) => a + m.pct, 0);
/** Efeitos ativos ou programados da empresa, para mostrar na Bolsa. */
export function stockEffects(st: GameState, i: number): string[] {
  const s = stockOf(st, i);
  const r = st.round;
  const out: string[] = [];
  for (const m of s.yieldMods ?? []) {
    if (m.until < r) continue;
    const when = m.from > r ? (m.from === m.until ? `na rodada ${m.from}` : `das rodadas ${m.from} a ${m.until}`) : untilText(st, m.until);
    out.push(m.zero ? `${m.why}: dividendo zero ${when}` : `${m.why}: dividendo ${signed(m.pp || 0)} ponto${Math.abs(m.pp || 0) === 1 ? '' : 's'} ${when}`);
  }
  for (const m of s.feeMods ?? []) if (m.until >= r) out.push(`${m.why}: taxa da casa ${signed(m.pct)}% ${untilText(st, m.until)}`);
  for (const p of s.pend ?? []) {
    if (p.round <= r) continue;
    if (p.invest) out.push(`${p.why}: cota sobe de ${DECISIONS.investir.min}% a ${DECISIONS.investir.max}% na rodada ${p.round}`);
    if (p.pct) out.push(`${p.why}: cota ${signed(p.pct)}% na rodada ${p.round}`);
    if (p.strike) out.push(`${p.why}: ${Math.round(p.strike * 100)}% de chance de greve na rodada ${p.round}`);
  }
  return out;
}

/** Dividendo extra por cota (decisão da gerência): cotação × DECISIONS.dividendo.rate, a $ 1. */
export const extraDividendPerShare = (st: GameState, i: number) => Math.round(sharePrice(st, i) * DECISIONS.dividendo.rate);
function extraDividendTransfers(st: GameState, i: number): Transfer[] {
  const each = extraDividendPerShare(st, i);
  const name = company(i).name;
  return Object.entries(sharesOf(st, i))
    .filter(([pid, q]) => q > 0 && !findPlayer(st, pid)?.out)
    .map(([pid, q]) => ({ from: BANK, to: pid, amount: q * each, reason: `Dividendo extra da ${name}: ${q} cota${q > 1 ? 's' : ''} × ${money(each)}`, kind: 'dividend' as const, space: i }))
    .filter((t) => t.amount > 0);
}

/** Por que `actor` não pode tomar uma decisão da gerência nesta empresa agora (null = pode). */
export function manageBlock(st: GameState, i: number, actor: string): string | null {
  if (!marketOn(st)) return 'A Bolsa está desligada nesta sala.';
  if (controller(st, i) !== actor) return `Só o dono da ${company(i).name} (${CONTROL} ou mais cotas) decide.`;
  if (!isMyTurn(st, actor)) return 'Decisões da gerência só na sua vez.';
  if (stockOf(st, i).decRound === st.round) return 'A gerência já decidiu nesta rodada. Na próxima, pode decidir de novo.';
  return null;
}

/** Edições do Jornal que falam desta empresa (ou de todas as empresas), mais novas primeiro. */
export function editionsAbout(st: GameState, i: number): Edition[] {
  return (st.jornal ?? []).filter((e) => {
    const h = HEADLINES[e.h];
    return !!h && h.effects.some((x) => ('co' in x && x.co === i) || x.k === 'stockAll' || (x.k === 'yield' && x.co === undefined));
  });
}

// ---------- Jornal da Cidade ----------

const groupStreets = (g: GroupId) => {
  const names = groupIdx(g).map((i) => street(i).name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names.join('');
};

/** Próxima manchete do baralho (sorteio da sala, sem repetir até acabar; aí embaralha de novo). */
function drawHeadline(st: GameState): number {
  const n = HEADLINES.length;
  let deck = (st.jornalDeck ?? []).filter((x) => x >= 0 && x < n);
  let ptr = st.jornalPtr ?? 0;
  if (deck.length !== n || ptr >= n) {
    const last = st.jornal?.[0]?.h;
    deck = shuffle(n, () => nextRandom(st));
    // a última manchete do baralho anterior não abre o novo
    if (deck[0] === last && n > 1) [deck[0], deck[1]] = [deck[1], deck[0]];
    ptr = 0;
  }
  st.jornalDeck = deck;
  st.jornalPtr = ptr + 1;
  return deck[ptr];
}

/** Aplica um efeito da manchete; devolve o texto do "Efeito no jogo". `stockPct` acumula a variação das cotações. */
function applyHeadlineEffect(st: GameState, h: Headline, e: HeadlineEffect, stockPct: Record<number, number>): string {
  const r = st.round;
  const untilOf = (rounds: number) => r + Math.max(1, rounds) - 1;
  switch (e.k) {
    case 'hood': {
      const name = GROUPS[e.group].name;
      if (e.rounds === undefined) {
        shiftHood(st, e.group, e.pct);
        return `Bairro ${name} ${signed(e.pct)}% para sempre (${groupStreets(e.group)})`;
      }
      const until = untilOf(e.rounds);
      st.hoodMods = [...(st.hoodMods ?? []), { group: e.group, pct: e.pct, until, why: h.tag }];
      return `Bairro ${name} ${signed(e.pct)}% ${untilText(st, until)} (${groupStreets(e.group)})`;
    }
    case 'hoodAll': {
      const groups = Object.keys(GROUPS) as GroupId[];
      if (e.rounds === undefined) {
        groups.forEach((g) => shiftHood(st, g, e.pct));
        return `Todos os bairros ${signed(e.pct)}% para sempre`;
      }
      const until = untilOf(e.rounds);
      st.hoodMods = [...(st.hoodMods ?? []), ...groups.map((g) => ({ group: g, pct: e.pct, until, why: h.tag }))];
      return `Todos os bairros ${signed(e.pct)}% ${untilText(st, until)}`;
    }
    case 'stock':
      stockPct[e.co] = (stockPct[e.co] || 0) + e.pct;
      return `Cotação da ${company(e.co).name} ${signed(e.pct)}% nesta rodada`;
    case 'stockAll':
      COMPANY_IDX.forEach((i) => (stockPct[i] = (stockPct[i] || 0) + e.pct));
      return `Todas as cotações ${signed(e.pct)}% nesta rodada`;
    case 'yield': {
      const until = untilOf(e.rounds);
      const cos = e.co === undefined ? COMPANY_IDX : [e.co];
      cos.forEach((i) => {
        const sk = ensureStock(st, i);
        sk.yieldMods = [...(sk.yieldMods ?? []), { pp: e.pp, from: r, until, why: h.tag }];
      });
      const who = e.co === undefined ? 'de todas as empresas' : `da ${company(e.co).name}`;
      return `Dividendo ${who} ${signed(e.pp)} ponto${Math.abs(e.pp) === 1 ? '' : 's'} ${untilText(st, until)}`;
    }
    case 'strike': {
      const until = untilOf(e.rounds);
      const sk = ensureStock(st, e.co);
      sk.yieldMods = [...(sk.yieldMods ?? []), { zero: true, from: r, until, why: h.tag }];
      return `Dividendo da ${company(e.co).name} zero ${untilText(st, until)}`;
    }
    case 'fee': {
      const until = untilOf(e.rounds);
      const sk = ensureStock(st, e.co);
      sk.feeMods = [...(sk.feeMods ?? []), { pct: e.pct, from: r, until, why: h.tag }];
      return `Taxa da casa da ${company(e.co).name} ${signed(e.pct)}% ${untilText(st, until)}`;
    }
    case 'rate': {
      const before = bankRate(st);
      const after = Math.max(BANK_RATES.minLoanRate, round4(before + e.pp / 100));
      st.bankRate = after;
      return `Taxa Selic nesta rodada: ${pct(after)} (era ${pct(before)})`;
    }
  }
}

/**
 * Começo de rodada do Jornal e da Bolsa (logo depois do sorteio dos juros):
 * 1. tira os efeitos vencidos; 2. sorteia a manchete e aplica os efeitos; 3. atualiza as cotações
 * (variação sorteada de ±5% + manchete + decisões da gerência, entre $ 50 e $ 1.000, a $ 10);
 * 4. no início do semestre (rodadas 4, 7, 10…), paga os dividendos. Tudo pelo sorteio da sala. Na primeira rodada (começo da partida) não há variação sorteada.
 */
function marketRound(st: GameState, now: Date, first = false) {
  if (!marketOn(st)) return;
  const r = st.round;
  // 1. efeitos vencidos
  for (const m of (st.hoodMods ?? []).filter((x) => x.until < r)) log(st, `Acabou o efeito no bairro ${GROUPS[m.group].name.toLowerCase()}: ${m.why}`, now);
  st.hoodMods = (st.hoodMods ?? []).filter((x) => x.until >= r);
  for (const i of COMPANY_IDX) {
    const sk = ensureStock(st, i);
    if (sk.yieldMods) sk.yieldMods = sk.yieldMods.filter((m) => m.until >= r);
    if (sk.feeMods) sk.feeMods = sk.feeMods.filter((m) => m.until >= r);
  }
  // 2. manchete (o seguro cobre o valor que os imóveis segurados perderem com ela)
  const insured = Object.keys(st.props)
    .map(Number)
    .filter((i) => insuredUntil(st, i) !== null && !findPlayer(st, st.props[i].owner)?.out)
    .map((i) => ({ i, before: propValue(st, i) }));
  const hi = drawHeadline(st);
  const h = HEADLINES[hi];
  const stockPct: Record<number, number> = {};
  const effects = h.effects.map((e) => applyHeadlineEffect(st, h, e, stockPct));
  st.jornal = [{ round: r, h: hi, effects }, ...(st.jornal ?? [])].slice(0, JORNAL.keep);
  log(st, `Jornal da Cidade, edição ${r}: ${h.title}`, now);
  for (const { i, before } of insured) {
    const lost = before - propValue(st, i);
    if (lost <= 0) continue;
    const owner = st.props[i].owner;
    const name = street(i).name;
    applyTransfers(st, [{ from: BANK, to: owner, amount: lost, reason: `Indenização do seguro da ${name}: ${h.tag} (valor caiu de ${money(before)} para ${money(before - lost)})`, kind: 'indenizacao', space: i }], now);
    log(st, `Seguro: ${pname(st, owner)} recebeu ${money(lost)} de indenização pela ${name} (${h.tag})`, now, undefined, true);
  }
  // 3. cotações
  for (const i of COMPANY_IDX) {
    const sk = ensureStock(st, i);
    const name = company(i).name;
    let change = first ? 0 : (nextRandom(st) * 2 - 1) * STOCK.drift;
    change += (stockPct[i] || 0) / 100;
    for (const p of (sk.pend ?? []).filter((x) => x.round <= r)) {
      if (p.pct) change += p.pct / 100;
      if (p.invest) {
        const D = DECISIONS.investir;
        const up = D.min + Math.min(D.max - D.min, Math.floor(nextRandom(st) * (D.max - D.min + 1)));
        change += up / 100;
        log(st, `Investimento na ${name} deu resultado: cota +${up}%`, now, undefined, true);
      }
      if (p.strike !== undefined) {
        if (nextRandom(st) < p.strike) {
          sk.yieldMods = [...(sk.yieldMods ?? []), { zero: true, from: r, until: r, why: 'Greve' }];
          log(st, `Greve na ${name} depois do corte de custos: dividendo zero nesta rodada`, now, undefined, true);
        } else log(st, `Corte de custos na ${name} sem greve: dividendo maior`, now);
      }
    }
    sk.pend = (sk.pend ?? []).filter((x) => x.round > r);
    if (!sk.pend.length) delete sk.pend;
    sk.price = clampPrice(sk.price * (1 + change));
    sk.hist = [...sk.hist, sk.price].slice(-STOCK.history);
  }
  // 4. dividendos: só no início do semestre (rodadas 4, 7, 10…)
  for (const i of paysDividends(r) ? COMPANY_IDX : []) {
    const each = dividendPerShare(st, i);
    if (!each) continue;
    const name = company(i).name;
    const list: Transfer[] = Object.entries(sharesOf(st, i))
      .filter(([pid, q]) => q > 0 && findPlayer(st, pid) && !findPlayer(st, pid)!.out)
      .map(([pid, q]) => ({ from: BANK, to: pid, amount: q * each, reason: `Dividendos do semestre da ${name}: ${q} cota${q > 1 ? 's' : ''} × ${money(each)}`, kind: 'dividend' as const, space: i }));
    if (!list.length) continue;
    applyTransfers(st, list, now);
    log(st, `Dividendos do semestre da ${name}: ${money(each)} por cota`, now);
  }
}

/** Texto de cada decisão da gerência para a tela da empresa. */
export function decisionText(d: DecisionId): string {
  switch (d) {
    case 'investir':
      return `Paga ${money(DECISIONS.investir.cost)} à empresa: na próxima rodada a cota sobe de ${DECISIONS.investir.min}% a ${DECISIONS.investir.max}%.`;
    case 'dividendo':
      return `O banco paga agora ${Math.round(DECISIONS.dividendo.rate * 100)}% da cotação por cota a quem tem cotas; na próxima rodada a cota cai ${-DECISIONS.dividendo.nextPct}%.`;
    case 'cortar':
      return `Dividendo +${DECISIONS.cortar.pp} pontos nas próximas ${DECISIONS.cortar.rounds} rodadas, com ${Math.round(DECISIONS.cortar.strikeChance * 100)}% de chance de greve (dividendo zero) na próxima.`;
    case 'marketing':
      return `Paga ${money(DECISIONS.marketing.cost)}: a taxa da casa sobe ${DECISIONS.marketing.pct}% nesta rodada e na próxima.`;
  }
}

// ---------- Calendário da partida ----------

/** Ano do calendário da rodada (ano 1 = rodadas 1 a 6). */
export const yearOf = (round: number) => Math.floor((Math.max(1, round) - 1) / CALENDAR.roundsPerYear) + 1;
/** Rodada dentro do ano (1 a 6). */
export const roundInYear = (round: number) => ((Math.max(1, round) - 1) % CALENDAR.roundsPerYear) + 1;
/** Semestre do ano (1 ou 2). */
export const semesterOf = (round: number) => Math.floor((roundInYear(round) - 1) / CALENDAR.roundsPerSemester) + 1;
/** A rodada abre um semestre (rodadas 1 e 4 de cada ano)? */
export const isSemesterStart = (round: number) => (round - 1) % CALENDAR.roundsPerSemester === 0;
/** A rodada abre um ano (rodada 1 de cada ano)? */
export const isYearStart = (round: number) => (round - 1) % CALENDAR.roundsPerYear === 0;
/** Primeira rodada que abre um semestre a partir de `round` (inclusive). */
export const semesterStartFrom = (round: number) => {
  const n = CALENDAR.roundsPerSemester;
  return Math.ceil((Math.max(1, round) - 1) / n) * n + 1;
};
/** Rodada da 1ª cobrança de algo pego em `takenRound`: primeiro início de semestre pelo menos LOAN.graceRounds rodadas depois. */
export const firstChargeRound = (takenRound: number) => semesterStartFrom(takenRound + LOAN.graceRounds);
/** Primeira e última rodada de um ano do calendário. */
export const yearRounds = (year: number) => ({ from: (year - 1) * CALENDAR.roundsPerYear + 1, to: year * CALENDAR.roundsPerYear });
/** Última rodada do semestre de `round` (até quando vale a Taxa Selic sorteada). */
export const selicUntil = (round: number) => semesterStartFrom(round + 1) - 1;
/** Texto do calendário no cabeçalho, ex.: "Ano 2 · rodada 3 de 6". */
export const calendarText = (round: number) => `Ano ${yearOf(round)} · rodada ${roundInYear(round)} de ${CALENDAR.roundsPerYear}`;
/** Quando cai uma rodada de cobrança, ex.: "início do 2º semestre do ano 1". */
export const semesterText = (round: number) => `início do ${semesterOf(round)}º semestre do ano ${yearOf(round)}`;

// ---------- Empréstimo ----------

export const loanOf = (st: GameState, pid: string): Loan | null => st.loans?.[pid] ?? null;
export const loanOwed = (l: Loan) => l.principal + l.interest - l.paid;
export const debtOf = (st: GameState, pid: string) => {
  const l = loanOf(st, pid);
  return l ? loanOwed(l) : 0;
};
/** Patrimônio líquido: patrimônio menos a dívida com o banco (empréstimo e financiamentos). */
export const equity = (st: GameState, p: Player) => netWorth(st, p) - debtOf(st, p.id) - finDebtOf(st, p.id);

// ---------- Poupança ----------

export const savingsOf = (p: Player | undefined) => p?.savings ?? 0;
/** Rendimento da poupança no início da vez: saldo × metade da Taxa Selic atual, arredondado a $ 10. */
export const savingsYield = (st: GameState, p: Player) => round10(savingsOf(p) * bankRate(st) * SAVINGS.rateShare);
/** Taxa da poupança por vez (fração). */
export const savingsRate = (st: GameState) => round4(bankRate(st) * SAVINGS.rateShare);

// ---------- Seguro do imóvel ----------

/** Valor atual do imóvel: terreno + construções, no preço do bairro agora. */
export const propValue = (st: GameState, i: number) => lotPrice(st, i) + houses(st, i) * buildPrice(st, i);
/** Prêmio do seguro: INSURANCE.premium × valor atual, arredondado a $ 10. */
export const insurancePremium = (st: GameState, i: number) => round10(propValue(st, i) * INSURANCE.premium);
/** Rodada até a qual o imóvel está segurado (null = sem seguro ou vencido). */
export function insuredUntil(st: GameState, i: number): number | null {
  const u = st.props[i]?.insuredUntil;
  return u !== undefined && u >= st.round ? u : null;
}
/** Por que `actor` não pode contratar (ou renovar) o seguro deste imóvel agora (null = pode). */
export function insureBlock(st: GameState, i: number, actor: string): string | null {
  const pr = st.props[i];
  if (SPACES[i]?.type !== 'street' || !pr || pr.owner !== actor) return 'Não é seu';
  if (!marketOn(st)) return 'Sem o Jornal nesta sala, não há manchete para segurar';
  if (!isMyTurn(st, actor)) return 'Só na sua vez';
  const u = insuredUntil(st, i);
  if (u !== null && u > st.round) return `Já segurado até a rodada ${u}`;
  return null;
}

// ---------- Financiamento ----------

export const finsOf = (st: GameState, pid: string): Financing[] =>
  Object.values(st.fin ?? {})
    .filter((f) => f.owner === pid)
    .sort((a, b) => a.idx - b.idx);
export const finOf = (st: GameState, i: number): Financing | null => st.fin?.[i] ?? null;
/** Soma do que o jogador deve em financiamentos. */
export const finDebtOf = (st: GameState, pid: string) => finsOf(st, pid).reduce((a, f) => a + loanOwed(f), 0);
/** Parcelas que faltam (pagamento único: 1). */
export const finLeft = (f: Financing) => (isParcelado(f) ? f.parcels!.length - (f.parcelsPaid ?? 0) : 1);
/** Entrada do financiamento: FINANCE.entrada × preço, arredondada a $ 10. */
export const financeEntrada = (price: number) => round10(price * FINANCE.entrada);
/** O que for financiado de um preço: preço − entrada. */
export const financeAmount = (price: number) => price - financeEntrada(price);
/** Simulação dos planos para financiar `price` agora (mesma taxa e parcelas do empréstimo, sobre preço − entrada). */
export const financeOptions = (st: GameState, pid: string, price: number) => loanOptions(st, pid, financeAmount(price));
/** Por que `pid` não pode financiar `price` agora (null = pode). `idx`: imóvel que já tem financiamento não aceita outro. */
export function financeBlock(st: GameState, pid: string, price: number, idx?: number): string | null {
  const p = findPlayer(st, pid);
  if (!p || p.out) return 'Você não está jogando';
  if (creditOf(p) < FINANCE.minScore) return `Score ${creditOf(p)} abaixo de ${FINANCE.minScore} (faixa Regular): o banco não financia`;
  if (idx !== undefined && finOf(st, idx)) return 'Este imóvel já tem um financiamento: quite antes de financiar outra construção';
  if (p.balance < financeEntrada(price)) return `Saldo insuficiente para a entrada de ${money(financeEntrada(price))}`;
  return null;
}
/** Selo do imóvel financiado, ex.: "Financiado · faltam 3 parcelas". */
export function finBadge(f: Financing): string {
  const n = finLeft(f);
  return `Financiado · falta${n === 1 ? '' : 'm'} ${n} parcela${n === 1 ? '' : 's'}`;
}
// ---------- Score de crédito e juros ----------

export const creditOf = (p: Player | undefined) => p?.credit ?? CREDIT.start;
/** Faixa do score: Ruim (<300), Regular (300–599), Bom (600–799), Excelente (800+). */
export const creditBand = (score: number) => [...CREDIT_BANDS].reverse().find((b) => score >= b.from) ?? CREDIT_BANDS[0];
/** Taxa do banco nesta rodada: a Selic do semestre, ± a manchete de juros da rodada (salas antigas, antes do primeiro sorteio: LOAN.interest). */
export const bankRate = (st: GameState) => st.bankRate ?? LOAN.interest;
/**
 * Taxa de um empréstimo novo agora: taxa da rodada + adicional do plano + ajuste do score, nunca abaixo do mínimo.
 * Sem plano: só taxa da rodada + score (a "sua taxa" da aba Banco, igual ao parcelado em 2x).
 */
export function loanRateFor(st: GameState, pid: string, plan?: LoanPlanId): number {
  const band = creditBand(creditOf(findPlayer(st, pid)));
  const add = plan ? planInfo(plan).addOn : 0;
  return Math.max(BANK_RATES.minLoanRate, round4(bankRate(st) + add + band.rateOffset));
}

// ---------- Planos do empréstimo (parcelado 2x a 5x ou pagamento único) ----------

export const planInfo = (id: LoanPlanId) => {
  const p = LOAN_PLANS.find((x) => x.id === id);
  if (!p) throw new RuleError('Plano de pagamento inválido.');
  return p;
};
/** Plano do empréstimo (salas antigas, sem plano: pagamento único). */
export const loanPlan = (l: Loan): LoanPlanId => l.plan ?? 'unico';
export const isParcelado = (l: Loan) => loanPlan(l) !== 'unico' && !!l.parcels?.length;
/** Parcelas de um total: total ÷ n arredondado para LOAN.parcelRound; a última absorve a diferença. */
export function parcelSchedule(total: number, n: number): number[] {
  if (n <= 1) return [total];
  const base = Math.round(total / n / LOAN.parcelRound) * LOAN.parcelRound;
  return [...Array(n - 1).fill(base), total - base * (n - 1)];
}
export interface LoanOption {
  plan: LoanPlanId;
  name: string;
  short: string;
  rate: number;
  interest: number;
  total: number;
  parcels: number[];
  /** rodada de cada cobrança (uma por semestre; no pagamento único, só o vencimento) */
  rounds: number[];
  /** rodada da 1ª cobrança semestral (o pagamento único vence um semestre depois) */
  firstRound: number;
  /** rodada do último pagamento (última parcela ou vencimento do pagamento único) */
  dueRound: number;
}
/** Simulação das 5 opções para pedir `amount` agora (taxa, parcela e total de cada plano). */
export function loanOptions(st: GameState, pid: string, amount: number): LoanOption[] {
  return LOAN_PLANS.map((p) => {
    const rate = loanRateFor(st, pid, p.id);
    const interest = loanInterest(amount, rate);
    const total = amount + interest;
    const unico = p.id === 'unico';
    const s = loanSchedule(st.round, p.id);
    return { plan: p.id, name: p.name, short: p.short, rate, interest, total, parcels: parcelSchedule(total, unico ? 1 : p.parcels), rounds: s.rounds, firstRound: s.firstRound, dueRound: s.dueRound };
  });
}
/** Rodadas de cobrança de um plano pego na rodada `takenRound`: uma por semestre a partir da 1ª (ver firstChargeRound). */
export function loanSchedule(takenRound: number, plan: LoanPlanId): { firstRound: number; rounds: number[]; dueRound: number } {
  const firstRound = firstChargeRound(takenRound);
  const rounds = plan === 'unico' ? [firstRound + (LOAN.unicoSemesters - 1) * CALENDAR.roundsPerSemester] : [...Array(planInfo(plan).parcels).keys()].map((k) => firstRound + k * CALENDAR.roundsPerSemester);
  return { firstRound, rounds, dueRound: rounds[rounds.length - 1] };
}
/** Rodada da cobrança da parcela `k` (0 = a 1ª): uma por semestre a partir de `firstRound`. */
export const parcelRound = (l: Loan, k: number) => (l.firstRound !== undefined ? l.firstRound + k * CALENDAR.roundsPerSemester : l.takenRound + k + 1);
/** Próxima parcela do parcelado: número (1..n), total de parcelas, valor e rodada da cobrança; null no pagamento único. */
export function nextParcel(l: Loan): { n: number; of: number; amount: number; round: number } | null {
  if (!isParcelado(l)) return null;
  const k = l.parcelsPaid ?? 0;
  const of = l.parcels!.length;
  if (k >= of) return null;
  const amount = k === of - 1 ? loanOwed(l) : Math.min(l.parcels![k], loanOwed(l));
  return { n: k + 1, of, amount, round: parcelRound(l, k) };
}
/** Rodada da próxima cobrança (parcela ou pagamento único). */
export const nextChargeRound = (l: Loan) => nextParcel(l)?.round ?? l.dueRound;
/** Taxa travada no empréstimo (salas antigas: juros ÷ principal). */
export const loanRate = (l: Loan) => l.rate ?? (l.principal ? round4(l.interest / l.principal) : LOAN.interest);
export const loanInterest = (principal: number, rate: number = LOAN.interest) => Math.round(principal * rate);
export const pct = (r: number) => `${Math.round(r * 1000) / 10}%`.replace('.', ',');
/** Rodadas até o vencimento (0 = vence no início da vez nesta rodada). */
export const loanRoundsLeft = (st: GameState, pid: string) => {
  const l = loanOf(st, pid);
  return l ? l.dueRound - st.round : null;
};
/** Maior empréstimo possível agora: fração do patrimônio líquido, em múltiplos do passo; 0 se não pode pedir. */
export function loanLimit(st: GameState, pid: string): number {
  const p = findPlayer(st, pid);
  if (!p || p.out || loanOf(st, pid)) return 0;
  const score = creditOf(p);
  if (score < CREDIT.noLoanBelow) return 0;
  const raw = Math.floor((equity(st, p) * creditBand(score).limitRate) / LOAN.step) * LOAN.step;
  return raw >= LOAN.min ? raw : 0;
}

// ---------- Negociação ----------

export const tradesOf = (st: GameState): Trade[] => st.trades ?? [];
export const emptySide = (): TradeSide => ({ money: 0, props: [], shares: {} });
const sideEmpty = (x: TradeSide) => !x.money && !x.props.length && !Object.values(x.shares).some((q) => q > 0);

/** Por que este imóvel não pode ser negociado por `owner` agora (null = pode). Hipotecado pode; com casas, não. */
export function tradeBlock(st: GameState, i: number, owner: string): string | null {
  const s = SPACES[i];
  if (s?.type !== 'street') return 'Só imóveis entram na negociação.';
  const pr = st.props[i];
  if (!pr || pr.owner !== owner) return `${s.name} não é mais de ${pname(st, owner)}.`;
  if (houses(st, i) > 0) return `${s.name}: venda as casas antes de negociar.`;
  if (finOf(st, i)) return `${s.name} está financiada (alienada ao banco): quite o financiamento antes de negociar.`;
  return null;
}

function sideProblem(st: GameState, side: TradeSide, owner: string): string | null {
  const who = pname(st, owner);
  if (!Number.isInteger(side.money) || side.money < 0) return 'Valor em dinheiro inválido.';
  if ((findPlayer(st, owner)?.balance ?? 0) < side.money) return `${who} não tem ${money(side.money)} em dinheiro.`;
  if (new Set(side.props).size !== side.props.length) return 'Imóvel repetido na proposta.';
  for (const i of side.props) {
    const b = tradeBlock(st, i, owner);
    if (b) return b;
  }
  for (const [k, q] of Object.entries(side.shares)) {
    const i = Number(k);
    if (!COMPANY_IDX.includes(i)) return 'Empresa inválida.';
    if (!Number.isInteger(q) || q < 0) return 'Quantidade de cotas inválida.';
    if (q > (sharesOf(st, i)[owner] || 0)) return `${who} não tem ${q} cota${q > 1 ? 's' : ''} da ${company(i).name}.`;
  }
  return null;
}

/** Valida uma proposta contra o estado atual (null = válida). Usada ao propor, ao mostrar e ao aceitar. */
export function tradeProblem(st: GameState, from: string, to: string, give: TradeSide, get: TradeSide): string | null {
  const a = findPlayer(st, from);
  const b = findPlayer(st, to);
  if (!a || a.out || !b || b.out || from === to) return 'Escolha outro jogador que ainda está no jogo.';
  if (sideEmpty(give) && sideEmpty(get)) return 'Monte a proposta: o que você dá e o que pede.';
  return sideProblem(st, give, from) || sideProblem(st, get, to);
}

/** Resumo de um lado, ex.: "$ 1.000 + Av. Paulista + 2 cotas da Banco Aurora" (imóvel negociado é sempre terreno, sem casas). */
export function describeSide(side: TradeSide): string {
  const parts: string[] = [];
  if (side.money) parts.push(money(side.money));
  for (const i of side.props) parts.push(street(i).name);
  for (const [k, q] of Object.entries(side.shares)) if (q > 0) parts.push(`${q} cota${q > 1 ? 's' : ''} da ${company(Number(k)).name}`);
  return parts.join(' + ') || 'nada';
}

// ---------- Imposto de renda ----------

/** IR do ano: alíquota sobre a renda acima da isenção. */
export const irTax = (income: number) => Math.max(0, Math.round((income - IR.exempt) * IR.rate));

/**
 * Chance de cair na malha fina ao declarar `declared` de uma renda real `income`: cresce com a fração escondida,
 * de IR.catchMin (escondendo quase nada) até IR.catchChance (declarando zero).
 */
export const irCatchChance = (income: number, declared: number) => {
  if (income <= 0) return 0;
  const omitted = Math.min(1, Math.max(0, (income - declared) / income));
  return IR.catchChance - (IR.catchChance - IR.catchMin) * (1 - omitted);
};

/** Imposto que faltou mais a multa da malha fina, depois de declarar `declared` de `income`. */
export const irFineDue = (income: number, declared: number) => Math.round((irTax(income) - irTax(declared)) * (1 + IR.fine));

const irReason = (year: number, income: number) => `Imposto de renda do ano ${year}: ${Math.round(IR.rate * 100)}% de ${money(Math.max(0, income - IR.exempt))}`;
const malhaReason = (year: number, partial: boolean) => `Malha fina: IR ${partial ? 'que faltou ' : ''}do ano ${year} + multa de ${Math.round(IR.fine * 100)}%`;
/** Renda tributável do ano do calendário em curso. */
export const incomeOf = (p: Player | undefined) => p?.income ?? 0;
/** Tipos de transação que contam como renda para o IR. */
const INCOME_KINDS = new Set<TxKind>(['rent', 'fee', 'news', 'dividend', 'rendimento']);
export const isIncome = (kind: TxKind) => INCOME_KINDS.has(kind) || (IR.salaryIsIncome && kind === 'salary');

const isMyTurn = (st: GameState, actor: string) => st.phase === 'playing' && !st.winner && currentPlayer(st)?.id === actor;

/**
 * Por que não dá para construir neste imóvel agora (null = pode).
 * Regra da casa: só no imóvel seu onde você parou nesta jogada, sem hipoteca, na sua vez; uma construção por
 * vez (por rodada, mesmo tirando dupla); não no imóvel adquirido nesta rodada; hotel depois de 4 casas no mesmo
 * imóvel. Não precisa do grupo completo.
 */
export function buildBlock(st: GameState, i: number, actor: string): string | null {
  const s = SPACES[i];
  const pr = st.props[i];
  if (s?.type !== 'street' || !pr || pr.owner !== actor) return 'Não é seu';
  if (houses(st, i) >= 5) return 'Já tem hotel';
  if (pr.mortgaged) return 'Hipotecado';
  if (!isMyTurn(st, actor)) return 'Só na sua vez';
  if (st.turnInfo.landed !== i) return 'Só no imóvel onde você parou';
  if (findPlayer(st, actor)?.builtRound === st.round) return 'Já construiu nesta rodada';
  if (pr.round === st.round) return 'Comprado nesta rodada';
  return null;
}

export const canBuild = (st: GameState, i: number, actor: string) => buildBlock(st, i, actor) === null;

/** Vender construção: a qualquer momento, de qualquer imóvel seu com casa ou hotel. */
export function canSellHouse(st: GameState, i: number, actor: string): boolean {
  const s = SPACES[i];
  const pr = st.props[i];
  if (s?.type !== 'street' || !pr || pr.owner !== actor || st.phase !== 'playing') return false;
  return houses(st, i) > 0;
}

/** Cota da empresa: só ao cair nela, no máximo uma por rodada. */
export const boughtShareThisRound = (st: GameState, pid: string) => findPlayer(st, pid)?.shareRound === st.round;

export function canMortgage(st: GameState, i: number, actor: string): boolean {
  const pr = st.props[i];
  return st.phase === 'playing' && !!pr && pr.owner === actor && !pr.mortgaged && !houses(st, i) && !finOf(st, i);
}

export function canUnmortgage(st: GameState, i: number, actor: string): boolean {
  const pr = st.props[i];
  return !!pr && pr.owner === actor && pr.mortgaged && isMyTurn(st, actor);
}

/**
 * Taxa total da empresa: soma dos dados × $500 × cotação ÷ $200 × (1 + aumentos da taxa ativos), arredondada a $ 10,
 * em dobro se o mesmo dono controla as 6 empresas.
 */
export function feeTotal(st: GameState, i: number, dice: number): number {
  const ctrl = controller(st, i);
  const ctrlAll = !!ctrl && COMPANY_IDX.every((c) => controller(st, c) === ctrl);
  return round10(dice * feeRate(st, i)) * (ctrlAll ? 2 : 1);
}
/** Taxa por ponto dos dados: $500 × cotação ÷ $200 × (1 + aumentos ativos). */
export const feeRate = (st: GameState, i: number) => (COMPANY_RATE * sharePrice(st, i) * (1 + feeBoost(st, i) / 100)) / SHARE_PRICE;

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

/** Padrão da próxima construção: o das casas que já existem, ou o escolhido para a primeira (padrão: Intermediária). */
export function buildTier(st: GameState, i: number, chosen?: TierId): TierId {
  return tierOf(st, i) ?? (chosen && TIERS[chosen] ? chosen : DEFAULT_TIER);
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
      const price = lotPrice(st, landed!);
      if (action.finance) return [finEntradaTransfer(st, p.id, price, action.finance, `do terreno da ${s.name}`, landed!)];
      return [{ from: p.id, to: BANK, amount: price, reason: `Compra do terreno da ${s.name}`, kind: 'buy', space: landed! }];
    }
    case 'payRent': {
      const s = street(landed ?? -1);
      const owner = ownedBy(st, landed!);
      if (!owner) return [];
      const tier = tierOf(st, landed!);
      return [{ from: p.id, to: owner, amount: rentOf(st, landed!), reason: `Aluguel da ${s.name} (${tier ? `casa ${tierName(tier)}` : 'terreno'})`, kind: 'rent', space: landed!, ...(tier ? { tier } : {}) }];
    }
    case 'payFee':
      return feeTransfers(st, landed ?? -1, action.dice, p.id);
    case 'buyShares': {
      const s = company(landed ?? -1);
      const q = action.qty;
      const price = sharePrice(st, landed!);
      return [{ from: p.id, to: BANK, amount: q * price, reason: `${q} cota${q > 1 ? 's' : ''} da ${s.name} a ${money(price)}`, kind: 'shares', space: landed! }];
    }
    case 'sellShares': {
      const s = company(action.idx);
      const q = action.qty;
      const price = sharePrice(st, action.idx);
      return [{ from: BANK, to: actor, amount: q * price, reason: `Venda de ${q} cota${q > 1 ? 's' : ''} da ${s.name} à empresa a ${money(price)}`, kind: 'shares', space: action.idx }];
    }
    case 'manage': {
      const s = company(action.idx);
      const d = action.decision;
      if (d === 'investir') return [{ from: actor, to: BANK, amount: DECISIONS.investir.cost, reason: `Gerência da ${s.name}: investimento na empresa`, kind: 'gestao', space: action.idx }];
      if (d === 'marketing') return [{ from: actor, to: BANK, amount: DECISIONS.marketing.cost, reason: `Gerência da ${s.name}: campanha de marketing`, kind: 'gestao', space: action.idx }];
      if (d === 'dividendo') return extraDividendTransfers(st, action.idx);
      return [];
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
      const tier = buildTier(st, action.idx, action.tier);
      const h = houses(st, action.idx);
      const what = `${h === 4 ? 'Hotel' : h === 0 ? 'Primeira casa' : 'Casa'} ${tierName(tier)} na ${s.name}`;
      const price = buildPrice(st, action.idx, tier);
      if (action.finance) return [{ ...finEntradaTransfer(st, actor, price, action.finance, `${h === 4 ? 'do hotel' : h === 0 ? 'da primeira casa' : 'da casa'} ${tierName(tier)} na ${s.name}`, action.idx), tier }];
      return [{ from: actor, to: BANK, amount: price, reason: what, kind: 'build', space: action.idx, tier }];
    }
    case 'sellHouse': {
      const s = street(action.idx);
      return [{ from: BANK, to: actor, amount: buildPrice(st, action.idx) / 2, reason: `Venda de construção na ${s.name}`, kind: 'sellhouse', space: action.idx }];
    }
    case 'mortgage': {
      const s = street(action.idx);
      return [{ from: BANK, to: actor, amount: lotMortgage(st, action.idx), reason: `Hipoteca da ${s.name}`, kind: 'mortgage', space: action.idx }];
    }
    case 'unmortgage': {
      const s = street(action.idx);
      return [{ from: actor, to: BANK, amount: unmortgageCost(st, action.idx), reason: `Fim da hipoteca da ${s.name} (+20%)`, kind: 'unmortgage', space: action.idx }];
    }
    case 'declareIR': {
      const ir = st.irPending;
      if (!ir || ir.pid !== actor) return [];
      const reason = ir.caught ? malhaReason(ir.year, !!ir.declared) : irReason(ir.year, ir.income);
      return [{ from: actor, to: BANK, amount: ir.due, reason, kind: 'ir' }];
    }
    case 'payLoan': {
      const owed = debtOf(st, actor);
      const l = loanOf(st, actor);
      if (l && isParcelado(l)) {
        const left = l.parcels!.length - (l.parcelsPaid ?? 0);
        return [{ from: actor, to: BANK, amount: action.amount, reason: `Quitação antecipada do empréstimo em ${l.parcels!.length}x (${left} parcela${left === 1 ? '' : 's'} restante${left === 1 ? '' : 's'})`, kind: 'loanpay' }];
      }
      return [{ from: actor, to: BANK, amount: action.amount, reason: action.amount >= owed ? 'Quitação do empréstimo' : `Pagamento parcial do empréstimo (resta ${money(owed - action.amount)})`, kind: 'loanpay' }];
    }
    case 'deposit':
      return [{ from: actor, to: BANK, amount: action.amount, reason: 'Depósito na poupança', kind: 'poupanca' }];
    case 'withdraw':
      return [{ from: BANK, to: actor, amount: action.amount, reason: 'Resgate da poupança', kind: 'poupanca' }];
    case 'insure': {
      const s = street(action.idx);
      const until = insureUntilNew(st, action.idx);
      return [{ from: actor, to: BANK, amount: insurancePremium(st, action.idx), reason: `Seguro da ${s.name} (${Math.round(INSURANCE.premium * 100)}% do valor) até a rodada ${until}`, kind: 'seguro', space: action.idx }];
    }
    case 'payFin': {
      const f = finOf(st, action.idx);
      if (!f) return [];
      const left = finLeft(f);
      return [{ from: actor, to: BANK, amount: loanOwed(f), reason: `Quitação do financiamento da ${street(f.idx).name} (${left} parcela${left === 1 ? '' : 's'} restante${left === 1 ? '' : 's'})`, kind: 'financiamento', space: f.idx }];
    }
    default:
      return [];
  }
}

/** Rodada final do seguro contratado agora: INSURANCE.rounds rodadas a partir desta (renovação no último dia emenda). */
const insureUntilNew = (st: GameState, i: number) => Math.max(st.round - 1, insuredUntil(st, i) ?? 0) + INSURANCE.rounds;

/** Texto curto das parcelas de um plano, ex.: "4 parcelas semestrais de $ 220 (rodadas 4 a 13)" ou "pagamento único de $ 900 na rodada 7". */
export function parcelText(o: Pick<LoanOption, 'plan' | 'total' | 'parcels' | 'firstRound' | 'dueRound'>): string {
  if (o.plan === 'unico') return `pagamento único de ${money(o.total)} na rodada ${o.dueRound}`;
  const ps = o.parcels;
  const each = ps.every((x) => x === ps[0]) ? `${ps.length} parcelas semestrais de ${money(ps[0])}` : `${ps.length} parcelas semestrais (${ps.length - 1} de ${money(ps[0])} e 1 de ${money(ps[ps.length - 1])})`;
  return `${each}, rodadas ${o.firstRound} a ${o.dueRound}`;
}

function finEntradaTransfer(st: GameState, pid: string, price: number, plan: LoanPlanId, what: string, space: number): Transfer {
  const o = financeOptions(st, pid, price).find((x) => x.plan === plan) ?? financeOptions(st, pid, price)[0];
  const amt = financeAmount(price);
  return {
    from: pid,
    to: BANK,
    amount: financeEntrada(price),
    reason: `Entrada (${Math.round(FINANCE.entrada * 100)}%) ${what}: financia ${money(amt)} a ${pct(o.rate)}: ${parcelText(o)}`,
    kind: 'financiamento',
    space,
  };
}

// ---------- Mutações internas (sobre um clone) ----------

function applyTransfers(st: GameState, list: Transfer[], now: Date) {
  for (const t of list) {
    if (t.from !== BANK) findPlayer(st, t.from)!.balance -= t.amount;
    if (t.to !== BANK) {
      const to = findPlayer(st, t.to)!;
      to.balance += t.amount;
      if (isIncome(t.kind)) to.income = (to.income || 0) + t.amount;
    }
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

/** Muda o score de crédito (0 a 1000) e guarda o motivo nas últimas mudanças. */
function changeCredit(st: GameState, p: Player, delta: number, reason: string) {
  const before = creditOf(p);
  p.credit = Math.min(CREDIT.max, Math.max(CREDIT.min, before + delta));
  p.creditLog = [{ delta: p.credit - before, reason, round: st.round }, ...(p.creditLog || [])].slice(0, 6);
}

/** Faltou saldo para um pagamento obrigatório: −30 no score, uma vez por jogada para cada jogador. */
function shortfall(st: GameState, p: Player, what: string) {
  const list = st.turnInfo.short || [];
  if (list.includes(p.id)) return;
  st.turnInfo.short = [...list, p.id];
  changeCredit(st, p, CREDIT.shortfall, `Sem saldo para ${what}`);
}

/**
 * Taxa Selic no começo da rodada (sorteio da sala, igual em todos os celulares): sorteada só no início do semestre
 * (rodadas 1, 4, 7…) e fixa nas 3 rodadas. No meio do semestre, a taxa da rodada volta à Selic (desfaz o ajuste de
 * uma manchete de juros da rodada anterior). Salas antigas: a taxa atual vira a Selic até o próximo semestre.
 */
function drawBankRate(st: GameState, now: Date) {
  const r0 = st.round;
  const until = selicUntil(r0);
  if (!isSemesterStart(r0) && (st.selic !== undefined || st.bankRate !== undefined)) {
    st.selic = st.selic ?? st.bankRate;
    st.bankRate = st.selic;
    st.bankRateRound = r0;
    return;
  }
  const prev = st.selic ?? st.bankRate;
  const opts = BANK_RATES.options;
  const r = opts[Math.min(opts.length - 1, Math.floor(nextRandom(st) * opts.length))];
  st.selic = r;
  st.selicRound = r0;
  st.bankRate = r;
  st.bankRateRound = r0;
  if (prev === undefined) log(st, `Taxa Selic do semestre: ${pct(r)} (até a rodada ${until})`, now);
  else if (prev === r) log(st, `Rodada ${r0}: Taxa Selic mantida em ${pct(r)} até a rodada ${until}`, now);
  else log(st, `Rodada ${r0}: Taxa Selic ${r > prev ? 'subiu' : 'caiu'} para ${pct(r)} até a rodada ${until} (era ${pct(prev)})`, now, undefined, true);
}

/** Fim do ano do calendário: fecha a renda do ano de todos os jogadores (cada um declara na primeira vez no ano novo). */
function closeYear(st: GameState, year: number, now: Date) {
  for (const p of st.players) {
    if (p.out || (p.irYear ?? 0) >= year) continue;
    p.irOpen = { year, income: incomeOf(p) };
    p.income = 0;
  }
  const { from, to } = yearRounds(year);
  log(st, `Fim do ano ${year} (rodadas ${from} a ${to}): cada jogador declara o IR na primeira vez dele no ano ${year + 1}`, now, undefined, true);
}

/** Primeira vez do jogador no ano novo: abre a declaração do ano fechado. Abaixo da isenção, nada a declarar. */
function openIR(st: GameState, p: Player, now: Date) {
  const open = p.irOpen;
  if (!open) return;
  delete p.irOpen;
  if ((p.irYear ?? 0) >= open.year) return;
  const { year, income } = open;
  const tax = irTax(income);
  if (!tax) {
    p.irYear = year;
    p.irLast = { year, income, tax: 0, outcome: 'isento', paid: 0, round: st.round };
    log(st, `${p.name} fechou o ano ${year}: isento de IR (renda de ${money(income)})`, now, p.id);
    return;
  }
  st.irPending = { pid: p.id, year, income, tax, due: tax, cal: true };
  log(st, `${p.name}: hora da declaração do IR do ano ${year}`, now, p.id);
}

/** IR resolvido (declarado, sonegado ou pago com multa): marca o ano para não declarar de novo. */
function settleIR(p: Player, ir: { year: number; cal?: boolean }) {
  if (ir.cal) p.irYear = Math.max(p.irYear ?? 0, ir.year);
}

function nextTurn(st: GameState, now: Date) {
  const n = st.players.length;
  let i = st.turn;
  const roundBefore = st.round;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (i === 0) st.round += 1;
    if (!st.players[i].out) break;
  }
  st.turn = i;
  st.turnInfo = emptyTurn();
  if (st.round !== roundBefore) {
    if (isYearStart(st.round) && st.round > 1) closeYear(st, yearOf(st.round) - 1, now);
    drawBankRate(st, now);
    marketRound(st, now);
  }
  // Início da vez: a poupança rende, o IR do ano fechado espera a declaração e, no início do semestre,
  // as parcelas do empréstimo e dos financiamentos são cobradas antes de qualquer jogada
  const p = st.players[i];
  savingsTurn(st, p, now);
  openIR(st, p, now);
  collectFins(st, p, now);
  if (p.out) {
    if (!st.winner) nextTurn(st, now);
    return;
  }
  const l = loanOf(st, p.id);
  if (!l) return;
  if (isParcelado(l)) {
    // parcela do semestre (se ficou para trás, cobra as atrasadas)
    for (let k = 0; k < 5 && !p.out; k++) {
      const cur = loanOf(st, p.id);
      const np = cur && nextParcel(cur);
      if (!cur || !np || st.round < np.round) break;
      collectParcel(st, p, cur, np, now);
    }
  } else if (st.round >= l.dueRound) collectLoan(st, p, now);
  if (p.out && !st.winner) nextTurn(st, now);
}

/** Rendimento da poupança no início da vez do jogador (conta como renda para o IR e fica na poupança). */
function savingsTurn(st: GameState, p: Player, now: Date) {
  const y = savingsYield(st, p);
  if (y <= 0) return;
  applyTransfers(st, [{ from: BANK, to: p.id, amount: y, reason: `Rendimento da poupança: ${pct(savingsRate(st))} de ${money(savingsOf(p))} (metade da Taxa Selic)`, kind: 'rendimento' }], now);
  // o rendimento entra na poupança, não na carteira
  p.balance -= y;
  p.savings = savingsOf(p) + y;
  log(st, `Poupança de ${p.name} rendeu ${money(y)}`, now, p.id);
}

/** Tira `amount` da poupança para a carteira (resgate), com a linha no extrato. */
function fromSavings(st: GameState, p: Player, amount: number, reason: string, now: Date) {
  if (amount <= 0) return;
  applyTransfers(st, [{ from: BANK, to: p.id, amount, reason, kind: 'poupanca' }], now);
  p.savings = savingsOf(p) - amount;
}

/** Cobra no início da vez as parcelas vencidas de cada financiamento do jogador (e o pagamento único no vencimento). */
function collectFins(st: GameState, p: Player, now: Date) {
  for (const f0 of finsOf(st, p.id)) {
    for (let k = 0; k < 5 && !p.out; k++) {
      const f = finOf(st, f0.idx);
      if (!f || f.owner !== p.id) break;
      const np = nextParcel(f);
      if (np) {
        if (st.round < np.round) break;
        collectFin(st, p, f, np.amount, `Parcela ${np.n}/${np.of} do financiamento da ${street(f.idx).name}`, np.n, now);
      } else {
        if (st.round < f.dueRound) break;
        collectFin(st, p, f, loanOwed(f), `Vencimento do financiamento da ${street(f.idx).name}`, 1, now);
      }
    }
    if (p.out) return;
  }
}

/**
 * Cobra uma parcela (ou o pagamento único) do financiamento: carteira, depois poupança. Se ainda faltar, o banco
 * toma o próprio imóvel financiado (as construções nele são vendidas pela metade do custo para o jogador), o
 * financiamento é cancelado e nada mais é cobrado dele.
 */
function collectFin(st: GameState, p: Player, f: Financing, amount: number, tag: string, n: number, now: Date) {
  const name = street(f.idx).name;
  log(st, `${tag} de ${p.name}: ${money(amount)}`, now, undefined, true);
  if (p.balance < amount) fromSavings(st, p, Math.min(savingsOf(p), amount - p.balance), `Cobrança do banco: resgate da poupança para ${tag.toLowerCase()}`, now);
  if (p.balance < amount) {
    repossess(st, p, f.idx, now);
    changeCredit(st, p, CREDIT.parcelPenhora, `${tag} sem saldo: imóvel retomado`);
    log(st, `Sem saldo para a parcela: o banco retomou a ${name} de ${p.name} e cancelou o financiamento`, now, undefined, true);
    return;
  }
  applyTransfers(st, [{ from: p.id, to: BANK, amount, reason: tag, kind: 'financiamento', space: f.idx }], now);
  f.paid += amount;
  if (isParcelado(f)) {
    f.parcelsPaid = n;
    if (n <= 5) changeCredit(st, p, CREDIT.parcelPaid, `${tag} paga em dia`);
  }
  if (loanOwed(f) <= 0) {
    delete st.fin![f.idx];
    changeCredit(st, p, isParcelado(f) ? CREDIT.parcelLoanPaid : CREDIT.loanPaid, `Financiamento da ${name} quitado`);
    log(st, `${p.name} quitou o financiamento da ${name}: o imóvel não está mais alienado ao banco`, now, undefined, true);
  }
}

/** O banco retoma o imóvel financiado: construções vendidas pela metade do custo ao dono, terreno volta ao banco, financiamento cancelado. */
function repossess(st: GameState, p: Player, i: number, now: Date) {
  const s = street(i);
  const h = houses(st, i);
  if (h > 0) {
    const value = (h * buildPrice(st, i)) / 2;
    applyTransfers(st, [{ from: BANK, to: p.id, amount: value, reason: `Retomada da ${s.name}: ${h === 5 ? 'hotel vendido' : `${h} casa${h > 1 ? 's' : ''} vendida${h > 1 ? 's' : ''}`} ao banco pela metade do custo`, kind: 'penhora', space: i }], now);
  }
  toBank(st, i);
}

/**
 * Cobra `owed` do jogador para o banco: primeiro o dinheiro e a poupança; se faltar, PENHORA:
 * vende as construções ao banco pela metade do custo (sempre do imóvel com mais construções; empate, o mais barato),
 * depois toma os imóveis do mais barato para o mais caro, cada um pelo valor de hipoteca (já hipotecado vale 0).
 * A penhora para assim que o saldo cobre `owed`; o que sobrar do valor dos imóveis fica com o jogador.
 * Devolve quanto foi pago e se houve penhora; se `paid < owed`, quem chama leva à falência.
 */
function collectDebt(st: GameState, p: Player, owed: number, reason: string, now: Date): { paid: number; penhora: boolean } {
  const mine = () =>
    Object.keys(st.props)
      .map(Number)
      .filter((i) => st.props[i].owner === p.id);
  // a poupança é dinheiro: resgata antes de penhorar
  if (p.balance < owed) fromSavings(st, p, Math.min(savingsOf(p), owed - p.balance), `Cobrança do banco: resgate da poupança (${reason.toLowerCase()})`, now);
  let sold = 0;
  while (p.balance < owed) {
    const built = mine().filter((i) => houses(st, i) > 0);
    if (!built.length) break;
    built.sort((a, b) => houses(st, b) - houses(st, a) || lotPrice(st, a) - lotPrice(st, b) || a - b);
    const i = built[0];
    const s = street(i);
    const hotel = houses(st, i) === 5;
    const value = buildPrice(st, i) / 2;
    removeHouse(st, i);
    sold += 1;
    applyTransfers(st, [{ from: BANK, to: p.id, amount: value, reason: `Penhora: venda de ${hotel ? 'hotel' : 'casa'} na ${s.name} (metade do custo)`, kind: 'penhora', space: i }], now);
  }
  if (sold) log(st, `Penhora: o banco vendeu ${sold} construç${sold > 1 ? 'ões' : 'ão'} de ${p.name}`, now, undefined, true);
  let taken = 0;
  while (p.balance < owed) {
    // imóveis financiados (já alienados ao banco) por último; ao tomar um, o financiamento é cancelado e só sobra a diferença
    const props = mine().sort((a, b) => Number(!!finOf(st, a)) - Number(!!finOf(st, b)) || lotPrice(st, a) - lotPrice(st, b) || a - b);
    if (!props.length) break;
    const i = props[0];
    const s = street(i);
    const f = finOf(st, i);
    const value = st.props[i].mortgaged ? 0 : Math.max(0, lotMortgage(st, i) - (f ? loanOwed(f) : 0));
    toBank(st, i);
    taken += 1;
    applyTransfers(
      st,
      [{ from: BANK, to: p.id, amount: value, reason: `Penhora: ${s.name} tomada pelo banco (${value ? 'valor de hipoteca' : 'já hipotecada, sem valor'})`, kind: 'penhora', space: i }],
      now,
    );
    log(st, `Penhora: o banco tomou a ${s.name} de ${p.name}`, now, undefined, true);
  }
  const paid = Math.min(p.balance, owed);
  if (paid > 0) applyTransfers(st, [{ from: p.id, to: BANK, amount: paid, reason, kind: 'loanpay' }], now);
  return { paid, penhora: sold > 0 || taken > 0 || paid < owed };
}

/** Pagamento único vencido (e empréstimos de salas antigas): cobra tudo no início da vez. */
function collectLoan(st: GameState, p: Player, now: Date) {
  const l = loanOf(st, p.id)!;
  const owed = loanOwed(l);
  log(st, `Vencimento: o banco cobra ${money(owed)} do empréstimo de ${p.name}`, now, undefined, true);
  const { paid, penhora } = collectDebt(st, p, owed, 'Cobrança do empréstimo vencido', now);
  if (penhora) changeCredit(st, p, CREDIT.penhora, 'Empréstimo vencido com penhora');
  else changeCredit(st, p, CREDIT.loanPaid, 'Empréstimo pago no vencimento');
  if (paid >= owed) {
    delete st.loans![p.id];
    log(st, `${p.name} pagou o empréstimo vencido`, now, undefined, true);
    return;
  }
  l.paid += paid;
  log(st, `${p.name} não conseguiu pagar o empréstimo e faliu`, now, undefined, true);
  goBankrupt(st, p, BANK, now, undefined);
}

/** Parcela do empréstimo parcelado: cobra só o valor da parcela (com penhora limitada a ela, se faltar saldo). */
function collectParcel(st: GameState, p: Player, l: Loan, np: NonNullable<ReturnType<typeof nextParcel>>, now: Date) {
  const tag = `Parcela ${np.n}/${np.of} do empréstimo`;
  log(st, `${tag} de ${p.name}: ${money(np.amount)}`, now, undefined, true);
  const { paid, penhora } = collectDebt(st, p, np.amount, tag, now);
  l.paid += paid;
  if (paid < np.amount) {
    changeCredit(st, p, CREDIT.parcelPenhora, `${tag} com penhora`);
    log(st, `${p.name} não conseguiu pagar a parcela e faliu`, now, undefined, true);
    goBankrupt(st, p, BANK, now, undefined);
    return;
  }
  l.parcelsPaid = np.n;
  if (penhora) {
    l.penhora = true;
    changeCredit(st, p, CREDIT.parcelPenhora, `${tag} com penhora`);
  } else if (np.n <= 5) changeCredit(st, p, CREDIT.parcelPaid, `${tag} paga em dia`);
  if (np.n >= np.of || loanOwed(l) <= 0) {
    delete st.loans![p.id];
    if (!l.penhora) changeCredit(st, p, CREDIT.parcelLoanPaid, 'Empréstimo parcelado quitado');
    log(st, `${p.name} pagou a última parcela e quitou o empréstimo`, now, undefined, true);
  }
}

/** Falência: imóveis e cotas vão ao credor (ao banco, ou imóveis hipotecados), o saldo também; dívida e propostas somem. */
function goBankrupt(st: GameState, d: Player, creditor: string, now: Date, by: string | undefined) {
  // a poupança vai junto com o saldo
  fromSavings(st, d, savingsOf(d), `Falência de ${d.name}: resgate da poupança`, now);
  for (const [k, pr] of Object.entries(st.props)) {
    if (pr.owner !== d.id) continue;
    // financiado (alienado ao banco) volta ao banco e o financiamento é cancelado
    if (creditor === BANK || pr.mortgaged || finOf(st, Number(k))) toBank(st, Number(k));
    else Object.assign(pr, { owner: creditor, round: st.round }); // a casa (tier) vai junto
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
  if (st.loans) delete st.loans[d.id];
  if (st.irPending?.pid === d.id) st.irPending = null;
  st.trades = tradesOf(st).filter((t) => t.from !== d.id && t.to !== d.id);
  log(st, `${d.name} faliu e saiu do jogo`, now, by, true);
  checkWinner(st);
  if (st.winner) log(st, `${pname(st, st.winner)} venceu a partida!`, now, by, true);
}

/** Imóvel volta ao banco como terreno, sem casa (e sem padrão, seguro ou financiamento). */
function toBank(st: GameState, i: number) {
  delete st.props[i];
  if (st.fin?.[i]) delete st.fin[i];
  if (st.lots?.[i]) delete st.lots[i];
}

/** Tira uma construção; sem casas, o imóvel volta a ser só terreno (a próxima primeira casa escolhe o padrão de novo). */
function removeHouse(st: GameState, i: number) {
  const pr = st.props[i];
  pr.houses -= 1;
  if (pr.houses <= 0) {
    pr.houses = 0;
    delete pr.tier;
  }
}

function sendToJail(p: Player) {
  p.pos = JAIL_POS;
  p.jailed = true;
  p.jailTries = 0;
}

/**
 * O jogador da vez para na casa `idx` (pelos dados ou escolhendo a casa): pró-labore se passou pelo Início
 * (inclusive parando nele), "Vá para a detenção" prende sem pró-labore, e marca o que já está resolvido.
 */
function landOn(st: GameState, p: Player, idx: number, passed: boolean, text: string, now: Date, actor: string) {
  const ti = st.turnInfo;
  const s = SPACES[idx];
  p.pos = idx;
  ti.landed = idx;
  log(st, text, now, actor);
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
  // falta de saldo para o que é obrigatório pagar aqui (aluguel, imposto, a menor taxa da empresa)
  const dueHere =
    s.type === 'street' && !ti.resolved && ownedBy(st, idx)
      ? rentOf(st, idx)
      : s.type === 'tax'
        ? s.amount
        : s.type === 'company' && !ti.resolved
          ? feeTransfers(st, idx, ti.dice ?? 2, p.id).reduce((a, t) => a + t.amount, 0)
          : 0;
  if (dueHere > p.balance) shortfall(st, p, s.type === 'street' ? 'o aluguel' : s.type === 'tax' ? 'o imposto' : 'a taxa da empresa');
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

export function applyAction(state0: GameState, action: Action, ctx: ActionContext): GameState {
  const now = ctx.now ?? new Date();
  const rng = ctx.rng ?? Math.random;
  const actor = ctx.actor;
  // salas antigas passam para o calendário antes de qualquer regra (o "antes" do desfazer já fica migrado)
  const state = migrateState(state0);
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
    case 'setMercado': {
      need(actor === st.hostId && st.phase === 'lobby', 'Só quem criou a sala liga ou desliga o Jornal e a Bolsa.');
      st.settings.mercado = !!action.on;
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
      st.seed = Math.floor(rng() * 4294967296) >>> 0;
      st.irPending = null;
      st.hood = {};
      st.hoodMods = [];
      st.jornal = [];
      delete st.jornalDeck;
      delete st.jornalPtr;
      delete st.stocks;
      log(st, `Partida começou com ${st.players.length} jogadores`, now, actor, true);
      drawBankRate(st, now);
      marketRound(st, now, true);
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
      // propostas de negociação não fazem parte da jogada desfeita: ficam como estão agora
      back.trades = tradesOf(state);
      back.tradeCount = Math.max(back.tradeCount || 0, state.tradeCount || 0);
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
    case 'roll': {
      turnOnly();
      need(!p.jailed, 'Você está na detenção: tente a dupla, use a carta ou pague a fiança.');
      need(ti.landed === null, 'Você já andou nesta jogada.');
      const sum = action.sum;
      need(Number.isInteger(sum) && sum >= 2 && sum <= 12, 'A soma dos dados vai de 2 a 12.');
      // quem saiu da detenção com dupla anda com essa soma, mas não joga de novo
      const double = !!action.double && !ti.jailExit;
      need(!double || sum % 2 === 0, 'Dupla sempre dá soma par.');
      ti.dice = sum;
      ti.double = double;
      if (double && (ti.doubles ?? 0) + 1 >= MAX_DOUBLES) {
        // 3ª dupla seguida: direto para a detenção, sem andar e sem pró-labore
        sendToJail(p);
        ti.landed = JAIL_POS;
        ti.resolved = true;
        log(st, `${p.name} tirou ${MAX_DOUBLES} duplas seguidas e foi para a detenção`, now, actor, true);
        break;
      }
      const idx = (p.pos + sum) % SPACES.length;
      landOn(st, p, idx, p.pos + sum >= SPACES.length, `${p.name} tirou ${sum}${double ? ' (dupla)' : ''} e parou em ${SPACES[idx].name}`, now, actor);
      break;
    }
    case 'land': {
      turnOnly();
      need(ti.landed === null, 'Você já escolheu a casa desta jogada.');
      need(!p.jailed, 'Você está na detenção.');
      const idx = action.idx;
      need(Number.isInteger(idx) && idx >= 0 && idx < SPACES.length, 'Casa inválida.');
      landOn(st, p, idx, idx < p.pos, `${p.name} parou em ${SPACES[idx].name}`, now, actor);
      break;
    }
    case 'buy': {
      turnOnly();
      const s = landedSpace();
      need(s.type === 'street' && !ownedBy(st, ti.landed!), 'Este imóvel não está à venda.');
      need(!ti.resolved, 'Esta casa já foi resolvida.');
      const price = lotPrice(state, ti.landed!);
      if (action.finance) checkFinance(state, actor, price, action.finance);
      const list = transfersFor(state, action, actor);
      pay(st, list, now);
      st.props[ti.landed!] = { owner: p.id, houses: 0, mortgaged: false, round: st.round };
      if (st.lots) delete st.lots[ti.landed!];
      ti.resolved = true;
      if (action.finance) {
        const f = startFinance(state, st, actor, ti.landed!, 'terreno', price, action.finance);
        log(st, `${p.name} comprou o terreno da ${s.name} financiado: entrada de ${money(f.entrada)} e ${money(f.principal)} em ${planInfo(action.finance).short.toLowerCase()} a ${pct(f.rate!)}`, now, actor);
      } else log(st, `${p.name} comprou o terreno da ${s.name} por ${money(list[0].amount)}`, now, actor);
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
      need(q === 1, 'Da empresa, só uma cota por rodada.');
      need(!boughtShareThisRound(st, p.id), 'Você já comprou uma cota da empresa nesta rodada.');
      need(q <= bankShares(st, ti.landed!), 'A empresa não tem tantas cotas à venda.');
      pay(st, transfersFor(state, action, actor), now);
      p.shareRound = st.round;
      const sh = st.shares[ti.landed!] || (st.shares[ti.landed!] = {});
      sh[p.id] = (sh[p.id] || 0) + q;
      log(st, `${p.name} comprou ${q} cota${q > 1 ? 's' : ''} da ${s.name} por ${money(q * sharePrice(state, ti.landed!))}`, now, actor);
      break;
    }
    case 'sellShares': {
      turnOnly();
      need(marketOn(st), 'A Bolsa está desligada nesta sala.');
      const i = action.idx;
      need(COMPANY_IDX.includes(i), 'Empresa inválida.');
      const q = action.qty;
      const have = sharesOf(st, i)[actor] || 0;
      need(Number.isInteger(q) && q >= 1, 'Quantidade de cotas inválida.');
      need(q <= have, `Você tem ${have} cota${have === 1 ? '' : 's'} da ${company(i).name}.`);
      pay(st, transfersFor(state, action, actor), now);
      const sh = st.shares[i];
      sh[actor] -= q;
      if (!sh[actor]) delete sh[actor];
      log(st, `${me.name} vendeu ${q} cota${q > 1 ? 's' : ''} da ${company(i).name} à empresa por ${money(q * sharePrice(state, i))}`, now, actor);
      break;
    }
    case 'manage': {
      const i = action.idx;
      need(COMPANY_IDX.includes(i), 'Empresa inválida.');
      need(DECISIONS[action.decision], 'Decisão inválida.');
      const block = manageBlock(state, i, actor);
      need(!block, block!);
      const list = transfersFor(state, action, actor);
      pay(st, list, now);
      const sk = ensureStock(st, i);
      const r = st.round;
      const name = company(i).name;
      let what: string;
      switch (action.decision) {
        case 'investir': {
          const D = DECISIONS.investir;
          sk.pend = [...(sk.pend || []), { round: r + 1, invest: true, why: 'Investimento' }];
          what = `investiu ${money(D.cost)} na empresa: a cota sobe de ${D.min}% a ${D.max}% na próxima rodada`;
          break;
        }
        case 'dividendo': {
          const D = DECISIONS.dividendo;
          sk.pend = [...(sk.pend || []), { round: r + 1, pct: D.nextPct, why: 'Dividendo extra' }];
          what = `pagou dividendo extra de ${money(extraDividendPerShare(state, i))} por cota: a cota cai ${-D.nextPct}% na próxima rodada`;
          break;
        }
        case 'cortar': {
          const D = DECISIONS.cortar;
          sk.yieldMods = [...(sk.yieldMods || []), { pp: D.pp, from: r + 1, until: r + D.rounds, why: 'Corte de custos' }];
          sk.pend = [...(sk.pend || []), { round: r + 1, strike: D.strikeChance, why: 'Corte de custos' }];
          what = `cortou custos: dividendo +${D.pp} pontos até a rodada ${r + D.rounds}, com risco de greve`;
          break;
        }
        case 'marketing': {
          const D = DECISIONS.marketing;
          sk.feeMods = [...(sk.feeMods || []), { pct: D.pct, from: r, until: r + D.rounds - 1, why: 'Marketing' }];
          what = `fez campanha de marketing (${money(D.cost)}): taxa da casa +${D.pct}% ${untilText(st, r + D.rounds - 1)}`;
          break;
        }
      }
      sk.decRound = r;
      sk.decision = action.decision;
      log(st, `Gerência da ${name}: ${me.name} ${what}`, now, actor, true);
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
      const card = NEWS[ti.news];
      if (card.k === 'pay' && card.v > p.balance) shortfall(st, p, 'pagar a notícia');
      if (card.k === 'each') for (const x of st.players) if (x.id !== p.id && !x.out && x.balance < card.v) shortfall(st, x, 'a aposta da mesa');
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
      ti.jailExit = true;
      log(st, `${p.name} tirou dupla e saiu da detenção`, now, actor);
      break;
    }
    case 'jailFail': {
      turnOnly();
      need(p.jailed && ti.landed === null, 'Você não está na detenção.');
      need(p.jailTries < 2, 'Na 3ª tentativa sem dupla, pague a fiança.');
      need(st.irPending?.pid !== p.id, 'Entregue a declaração do IR antes de passar a vez.');
      p.jailTries += 1;
      log(st, `${p.name} não tirou dupla (tentativa ${p.jailTries} de 3)`, now, actor);
      nextTurn(st, now);
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
      const block = buildBlock(state, action.idx, actor);
      need(!block, `Não dá para construir aqui agora: ${block?.toLowerCase()}.`);
      const s = street(action.idx);
      const current = tierOf(state, action.idx);
      need(!action.tier || TIERS[action.tier], 'Escolha uma das 3 casas.');
      need(!current || !action.tier || action.tier === current, `As casas deste imóvel são ${tierName(current ?? DEFAULT_TIER)}: as próximas seguem o mesmo padrão.`);
      const tier = buildTier(state, action.idx, action.tier);
      const price = buildPrice(state, action.idx, tier);
      if (action.finance) checkFinance(state, actor, price, action.finance, action.idx);
      pay(st, transfersFor(state, action, actor), now);
      me.builtRound = st.round;
      const pr = st.props[action.idx];
      pr.houses += 1;
      pr.tier = tier;
      const what = pr.houses === 5 ? 'um hotel' : pr.houses === 1 ? `a primeira casa (${tierName(tier)})` : 'uma casa';
      if (action.finance) {
        const f = startFinance(state, st, actor, action.idx, 'casa', price, action.finance);
        log(st, `${me.name} construiu ${what} na ${s.name} financiada: entrada de ${money(f.entrada)} e ${money(f.principal)} em ${planInfo(action.finance).short.toLowerCase()} a ${pct(f.rate!)}`, now, actor);
      } else log(st, `${me.name} construiu ${what} na ${s.name}`, now, actor);
      break;
    }
    case 'sellHouse': {
      need(canSellHouse(state, action.idx, actor), 'Não dá para vender construção aqui agora.');
      pay(st, transfersFor(state, action, actor), now);
      removeHouse(st, action.idx);
      log(st, `${me.name} vendeu uma construção na ${street(action.idx).name}`, now, actor);
      break;
    }
    case 'mortgage': {
      need(canMortgage(state, action.idx, actor), 'Não dá para hipotecar este imóvel.');
      const list = transfersFor(state, action, actor);
      pay(st, list, now);
      st.props[action.idx].mortgaged = true;
      st.props[action.idx].mortgageValue = list[0].amount;
      log(st, `${me.name} hipotecou ${street(action.idx).name}`, now, actor);
      break;
    }
    case 'unmortgage': {
      need(canUnmortgage(state, action.idx, actor), 'Tirar hipoteca só na sua vez, em imóvel seu hipotecado.');
      pay(st, transfersFor(state, action, actor), now);
      st.props[action.idx].mortgaged = false;
      delete st.props[action.idx].mortgageValue;
      log(st, `${me.name} tirou a hipoteca da ${street(action.idx).name}`, now, actor);
      break;
    }
    case 'endTurn': {
      turnOnly();
      need(ti.landed !== null && ti.resolved, 'Resolva a casa antes de passar a vez.');
      need(st.irPending?.pid !== p.id, 'Entregue a declaração do IR antes de passar a vez.');
      if (action.again) {
        need(!p.jailed, 'Na detenção não se joga de novo.');
        need(!ti.jailExit, 'Quem sai da detenção com dupla anda, mas não joga de novo.');
        const doubles = (ti.doubles ?? 0) + 1;
        if (doubles >= MAX_DOUBLES) {
          sendToJail(p);
          log(st, `${p.name} tirou ${MAX_DOUBLES} duplas seguidas e foi para a detenção`, now, actor, true);
          nextTurn(st, now);
          if (!st.winner) log(st, `Vez de ${currentPlayer(st).name}`, now, actor);
          break;
        }
        st.turnInfo = { ...emptyTurn(), doubles };
        log(st, `${p.name} tirou dupla e joga de novo${doubles > 1 ? ` (${doubles}ª seguida)` : ''}`, now, actor);
      } else {
        nextTurn(st, now);
        if (!st.winner) log(st, `Vez de ${currentPlayer(st).name}`, now, actor);
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
      goBankrupt(st, d, creditor, now, actor);
      if (!st.winner && currentPlayer(st).id === d.id) nextTurn(st, now);
      break;
    }
    case 'proposeTrade': {
      const to = action.to;
      const problem = tradeProblem(st, actor, to, action.give, action.get);
      need(!problem, problem!);
      need(!tradesOf(st).some((t) => (t.from === actor && t.to === to) || (t.from === to && t.to === actor)), `Já existe uma proposta entre você e ${pname(st, to)}. Responda ou cancele antes.`);
      st.tradeCount = (st.tradeCount || 0) + 1;
      const clean = (x: TradeSide): TradeSide => ({
        money: x.money,
        props: [...x.props],
        shares: Object.fromEntries(Object.entries(x.shares).filter(([, q]) => q > 0)),
      });
      const t: Trade = { id: `${st.code}-N${String(st.tradeCount).padStart(3, '0')}`, from: actor, to, give: clean(action.give), get: clean(action.get), at: now.toISOString(), round: st.round };
      st.trades = [...tradesOf(st), t];
      log(st, `${me.name} propôs uma negociação a ${pname(st, to)}`, now, actor);
      return keep(state, st);
    }
    case 'cancelTrade':
    case 'declineTrade': {
      const t = tradesOf(st).find((x) => x.id === action.id);
      need(t, 'Esta proposta não existe mais.');
      if (action.type === 'cancelTrade') need(t.from === actor, 'Só quem fez a proposta pode cancelar.');
      else need(t.to === actor, 'Só quem recebeu a proposta pode recusar.');
      st.trades = tradesOf(st).filter((x) => x.id !== t.id);
      log(st, action.type === 'cancelTrade' ? `${me.name} cancelou a proposta a ${pname(st, t.to)}` : `${me.name} recusou a proposta de ${pname(st, t.from)}`, now, actor);
      return keep(state, st);
    }
    case 'acceptTrade': {
      const t = tradesOf(st).find((x) => x.id === action.id);
      need(t, 'Esta proposta não existe mais.');
      need(t.to === actor, 'Só quem recebeu a proposta pode aceitar.');
      const problem = tradeProblem(st, t.from, t.to, t.give, t.get);
      need(!problem, `A proposta não vale mais: ${problem}`);
      const a = findPlayer(st, t.from)!;
      const reason = `Negociação ${t.id}: ${a.name} deu ${describeSide(t.give)} e recebeu ${describeSide(t.get)}`;
      const list: Transfer[] = [];
      if (t.give.money) list.push({ from: t.from, to: t.to, amount: t.give.money, reason, kind: 'trade', ref: t.id });
      if (t.get.money) list.push({ from: t.to, to: t.from, amount: t.get.money, reason, kind: 'trade', ref: t.id });
      // troca só de bens: registra uma linha de valor zero para ter o ID no extrato e no comprovante
      if (!list.length) list.push({ from: t.from, to: t.to, amount: 0, reason, kind: 'trade', ref: t.id });
      pay(st, list, now);
      const move = (side: TradeSide, from: string, to: string) => {
        for (const i of side.props) Object.assign(st.props[i], { owner: to, round: st.round }); // hipotecado continua hipotecado
        for (const [k, q] of Object.entries(side.shares)) {
          if (!q) continue;
          const sh = st.shares[Number(k)];
          sh[from] -= q;
          if (!sh[from]) delete sh[from];
          sh[to] = (sh[to] || 0) + q;
        }
      };
      move(t.give, t.from, t.to);
      move(t.get, t.to, t.from);
      st.trades = tradesOf(st).filter((x) => x.id !== t.id);
      log(st, `Negociação fechada entre ${a.name} e ${me.name}: ${describeSide(t.give)} por ${describeSide(t.get)}`, now, actor);
      break;
    }
    case 'takeLoan': {
      turnOnly();
      need(!loanOf(st, actor), 'Você já tem um empréstimo ativo. Quite antes de pedir outro.');
      const amt = action.amount;
      const limit = loanLimit(st, actor);
      need(creditOf(me) >= CREDIT.noLoanBelow, `Seu score de crédito (${creditOf(me)}) está abaixo de ${CREDIT.noLoanBelow}: o banco não empresta.`);
      need(limit > 0, `Seu patrimônio não permite empréstimo agora (mínimo ${money(LOAN.min)}).`);
      need(Number.isInteger(amt) && amt >= LOAN.min && amt % LOAN.step === 0, `Peça a partir de ${money(LOAN.min)}, em múltiplos de ${money(LOAN.step)}.`);
      need(action.plan === undefined || LOAN_PLANS.some((x) => x.id === action.plan), 'Plano de pagamento inválido.');
      need(amt <= limit, `Seu limite é ${money(limit)}.`);
      const plan = action.plan ?? 'unico';
      const info = planInfo(plan);
      const rate = loanRateFor(st, actor, plan);
      const interest = loanInterest(amt, rate);
      const total = amt + interest;
      const sched = loanSchedule(st.round, plan);
      if (plan === 'unico') {
        const due = sched.dueRound;
        st.loans = { ...(st.loans || {}), [actor]: { principal: amt, interest, paid: 0, takenRound: st.round, dueRound: due, firstRound: sched.firstRound, rate, plan } };
        applyTransfers(st, [{ from: BANK, to: actor, amount: amt, reason: `Empréstimo do banco a ${pct(rate)}: devolver ${money(total)} na rodada ${due} (${semesterText(due)})`, kind: 'loan' }], now);
        log(st, `${me.name} pegou ${money(amt)} emprestado no banco a ${pct(rate)} (pagamento único)`, now, actor);
      } else {
        const parcels = parcelSchedule(total, info.parcels);
        st.loans = { ...(st.loans || {}), [actor]: { principal: amt, interest, paid: 0, takenRound: st.round, dueRound: sched.dueRound, firstRound: sched.firstRound, rate, plan, parcels, parcelsPaid: 0 } };
        const each = parcelText({ plan, total, parcels, firstRound: sched.firstRound, dueRound: sched.dueRound });
        applyTransfers(st, [{ from: BANK, to: actor, amount: amt, reason: `Empréstimo do banco em ${info.short} a ${pct(rate)}: ${each} (total ${money(total)})`, kind: 'loan' }], now);
        log(st, `${me.name} pegou ${money(amt)} emprestado no banco em ${info.short} a ${pct(rate)}`, now, actor);
      }
      break;
    }
    case 'payLoan': {
      turnOnly();
      const l = loanOf(st, actor);
      need(l, 'Você não tem empréstimo.');
      const owed = loanOwed(l);
      const amt = action.amount;
      need(Number.isInteger(amt) && amt > 0, 'Valor inválido.');
      need(amt <= owed, `Você deve só ${money(owed)}.`);
      const parcelado = isParcelado(l);
      need(!parcelado || amt === owed, `No parcelado não há pagamento parcial: as parcelas são cobradas sozinhas, ou quite o saldo todo (${money(owed)}).`);
      const full = amt === owed;
      pay(st, transfersFor(state, action, actor), now);
      if (full) {
        delete st.loans![actor];
        if (parcelado) {
          if (!l.penhora) changeCredit(st, me, CREDIT.parcelLoanPaid, 'Empréstimo parcelado quitado antes do fim');
        } else changeCredit(st, me, CREDIT.loanPaid, 'Empréstimo quitado antes do vencimento');
      } else {
        l.paid += amt;
        // pagamento parcial conta para o score uma vez por rodada, a partir de LOAN.step
        if (amt >= LOAN.step && l.partRound !== st.round) {
          l.partRound = st.round;
          changeCredit(st, me, CREDIT.partialPay, 'Pagamento parcial do empréstimo');
        }
      }
      log(st, full ? `${me.name} quitou o empréstimo` : `${me.name} pagou ${money(amt)} do empréstimo`, now, actor);
      break;
    }
    case 'declareIR': {
      turnOnly();
      const ir = st.irPending;
      need(ir && ir.pid === actor, 'Não há declaração de IR pendente.');
      pay(st, transfersFor(state, action, actor), now);
      st.irPending = null;
      settleIR(p, ir);
      if (ir.caught) {
        const before = irTax(ir.declared ?? 0);
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'pego', paid: before + ir.due, round: st.round, declared: ir.declared ?? 0 };
        log(st, `${p.name} pagou o IR do ano ${ir.year} com a multa da malha fina`, now, actor);
      } else {
        changeCredit(st, p, CREDIT.irDeclared, 'IR declarado em dia');
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'declarou', paid: ir.tax, round: st.round };
        log(st, `${p.name} declarou o IR do ano ${ir.year} e pagou ${money(ir.tax)}`, now, actor);
      }
      break;
    }
    case 'evadeIR': {
      turnOnly();
      const ir = st.irPending;
      need(ir && ir.pid === actor, 'Não há declaração de IR pendente.');
      need(!ir.caught, 'Você já caiu na malha fina: pague o imposto e a multa.');
      const declared = action.declared ?? 0;
      need(Number.isInteger(declared) && declared >= 0 && declared < ir.income, `Declare uma renda de ${money(0)} a ${money(ir.income - 1)}.`);
      // declarar menos: paga já o imposto sobre o que declarou
      const taxNow = irTax(declared);
      if (taxNow > 0) pay(st, [{ from: p.id, to: BANK, amount: taxNow, reason: irReason(ir.year, declared), kind: 'ir' }], now);
      const caught = nextRandom(st) < irCatchChance(ir.income, declared);
      if (!caught) {
        st.irPending = null;
        settleIR(p, ir);
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'passou', paid: taxNow, round: st.round, declared };
        // ninguém mais fica sabendo da sonegação (nem do quanto escondeu)
        log(st, `${p.name} entregou a declaração do ano ${ir.year}`, now, actor);
        break;
      }
      // imposto que faltou + multa só sobre a parte que faltou
      const due = irFineDue(ir.income, declared);
      changeCredit(st, p, CREDIT.malhaFina, 'Caiu na malha fina');
      log(
        st,
        declared > 0
          ? `${p.name} declarou ${money(declared)} de ${money(ir.income)} e caiu na malha fina: imposto que faltou + multa de ${money(due)}`
          : `${p.name} sonegou o IR e caiu na malha fina: imposto + multa de ${money(due)}`,
        now,
        actor,
        true,
      );
      if (p.balance >= due) {
        applyTransfers(st, [{ from: p.id, to: BANK, amount: due, reason: malhaReason(ir.year, declared > 0), kind: 'ir' }], now);
        st.irPending = null;
        settleIR(p, ir);
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'pego', paid: taxNow + due, round: st.round, declared };
      } else {
        // sem saldo: fica devendo e paga pelo Pix (vendendo, hipotecando ou declarando falência)
        shortfall(st, p, 'a multa da malha fina');
        st.irPending = { ...ir, caught: true, due, ...(declared > 0 ? { declared } : {}) };
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'pego', paid: taxNow, round: st.round, declared };
      }
      break;
    }
    case 'deposit': {
      turnOnly();
      const amt = action.amount;
      need(Number.isInteger(amt) && amt >= SAVINGS.step && amt % SAVINGS.step === 0, `Deposite em múltiplos de ${money(SAVINGS.step)}.`);
      pay(st, transfersFor(state, action, actor), now);
      me.savings = savingsOf(me) + amt;
      log(st, `${me.name} depositou ${money(amt)} na poupança`, now, actor);
      break;
    }
    case 'withdraw': {
      const amt = action.amount;
      const have = savingsOf(me);
      need(have > 0, 'Sua poupança está vazia.');
      need(Number.isInteger(amt) && amt > 0 && amt <= have, `Você tem ${money(have)} na poupança.`);
      need(amt === have || amt % SAVINGS.step === 0, `Resgate em múltiplos de ${money(SAVINGS.step)}, ou tudo.`);
      fromSavings(st, me, amt, 'Resgate da poupança', now);
      log(st, `${me.name} resgatou ${money(amt)} da poupança`, now, actor);
      break;
    }
    case 'insure': {
      const block = insureBlock(state, action.idx, actor);
      need(!block, `Não dá para contratar o seguro agora: ${block?.toLowerCase()}.`);
      const until = insureUntilNew(state, action.idx);
      pay(st, transfersFor(state, action, actor), now);
      st.props[action.idx].insuredUntil = until;
      log(st, `${me.name} contratou o seguro da ${street(action.idx).name} até a rodada ${until}`, now, actor);
      break;
    }
    case 'payFin': {
      turnOnly();
      const f = finOf(st, action.idx);
      need(f && f.owner === actor, 'Este imóvel não tem financiamento seu.');
      pay(st, transfersFor(state, action, actor), now);
      delete st.fin![action.idx];
      changeCredit(st, me, isParcelado(f) ? CREDIT.parcelLoanPaid : CREDIT.loanPaid, `Financiamento da ${street(f.idx).name} quitado antes do fim`);
      log(st, `${me.name} quitou o financiamento da ${street(f.idx).name}`, now, actor);
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

/** Valida um pedido de financiamento (plano, score, entrada) contra o estado antes da ação. */
function checkFinance(st: GameState, pid: string, price: number, plan: LoanPlanId, idx?: number) {
  need(LOAN_PLANS.some((x) => x.id === plan), 'Plano de pagamento inválido.');
  const block = financeBlock(st, pid, price, idx);
  need(!block, `Não dá para financiar: ${block?.charAt(0).toLowerCase()}${block?.slice(1)}.`);
}

/** Cria o financiamento de `price` − entrada no plano (mesmas taxa e parcelas do empréstimo, travadas agora). */
function startFinance(before: GameState, st: GameState, pid: string, idx: number, what: Financing['what'], price: number, plan: LoanPlanId): Financing {
  const o = financeOptions(before, pid, price).find((x) => x.plan === plan)!;
  const principal = financeAmount(price);
  const f: Financing = {
    owner: pid,
    idx,
    what,
    price,
    entrada: financeEntrada(price),
    principal,
    interest: o.interest,
    paid: 0,
    takenRound: st.round,
    dueRound: o.dueRound,
    firstRound: o.firstRound,
    rate: o.rate,
    plan,
    ...(plan === 'unico' ? {} : { parcels: o.parcels, parcelsPaid: 0 }),
  };
  st.fin = { ...(st.fin || {}), [idx]: f };
  return f;
}

/**
 * Salas antigas → calendário da partida. Idempotente: devolve o próprio estado se não há nada a migrar.
 * - IR: os anos do calendário já passados contam como resolvidos; a renda acumulada entra no ano em curso.
 *   Uma declaração pendente da volta (sem `cal`) continua valendo e é entregue como antes.
 * - Empréstimo e financiamentos cobrados por rodada (sem `firstRound`): o que falta passa a ser cobrado nos próximos
 *   inícios de semestre depois da rodada atual, uma parcela por semestre; o pagamento único vence no próximo.
 */
export function migrateState(state: GameState): GameState {
  const oldLoan = (l: Loan) => l.firstRound === undefined;
  const needs = state.cal !== 1 || Object.values(state.loans ?? {}).some(oldLoan) || Object.values(state.fin ?? {}).some(oldLoan);
  if (!needs) return state;
  const st = clone(state);
  if (st.cal !== 1) {
    const done = st.phase === 'playing' ? yearOf(st.round) - 1 : 0;
    for (const p of st.players) if (p.irYear === undefined) p.irYear = done;
    st.cal = 1;
  }
  const next = semesterStartFrom(st.round + 1);
  const fix = (l: Loan) => {
    if (!oldLoan(l)) return;
    if (isParcelado(l)) {
      const k = l.parcelsPaid ?? 0;
      l.firstRound = next - k * CALENDAR.roundsPerSemester;
      l.dueRound = parcelRound(l, l.parcels!.length - 1);
    } else {
      l.firstRound = next - (LOAN.unicoSemesters - 1) * CALENDAR.roundsPerSemester;
      l.dueRound = next;
    }
  };
  Object.values(st.loans ?? {}).forEach(fix);
  Object.values(st.fin ?? {}).forEach(fix);
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
