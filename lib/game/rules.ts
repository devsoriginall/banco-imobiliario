// Regras do jogo como funções puras: (estado, ação, contexto) → novo estado.
// Nada aqui toca rede, DOM ou relógio global (o relógio e o sorteio vêm do contexto),
// então a mesma ação pode ser reaplicada sobre um estado mais novo quando dá conflito de versão.
import { BANK_RATES, COMPANY_IDX, COMPANY_RATE, CONTROL, CREDIT, CREDIT_BANDS, DEFAULT_TIER, DEFAULTS, GROUPS, HOOD, IR, JAIL_POS, LOAN, MAX_PLAYERS, NEWS, PLAYER_COLORS, SHARE_PRICE, SHARES, SPACES, TIERS } from './data';
import type { Action, ActionContext, CompanySpace, GameState, GroupId, Loan, Player, StreetSpace, TierId, Trade, TradeSide, Transfer, TurnInfo, TxKind } from './types';
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
  };
}

function makePlayer(id: string, name: string, i: number, balance: number): Player {
  return { id, name, color: PLAYER_COLORS[i % PLAYER_COLORS.length], balance, pos: 0, jailed: false, jailTries: 0, freeCards: 0, out: false, income: 0, year: 0, credit: CREDIT.start };
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

/** Multiplicador de preço e aluguel do bairro (grupo de cor); 1 = sem mudança. */
export const hoodMult = (st: GameState, g: GroupId) => st.hood?.[g] ?? HOOD.start;
/** Texto da valorização, ex.: "Bairro valorizado +10%" (null quando o bairro está no preço normal). */
export function hoodLabel(mult: number): string | null {
  const pct = Math.round((mult - 1) * 100);
  if (!pct) return null;
  return pct > 0 ? `Bairro valorizado +${pct}%` : `Bairro desvalorizado −${-pct}%`;
}
/** Casa que o terreno já tem por ter voltado ao banco (quem comprar leva esta); null = escolhe na compra. */
export const lotTier = (st: GameState, i: number): TierId | null => st.lots?.[i] ?? null;
/** Casa do imóvel: a escolhida pelo dono, a que ficou no terreno, ou a Intermediária (salas antigas). */
export const tierOf = (st: GameState, i: number): TierId => st.props[i]?.tier ?? lotTier(st, i) ?? DEFAULT_TIER;
export const tierName = (t: TierId) => TIERS[t].name;
/** Preço da casa: preço do tabuleiro × nível da casa × bairro, arredondado a $ 10. */
export function tierPrice(st: GameState, i: number, tier: TierId = tierOf(st, i)): number {
  const s = street(i);
  return round10(s.price * TIERS[tier].price * hoodMult(st, s.group));
}
/** Tabela de aluguel [sem casa, 1..4 casas, hotel] da casa: tabela do tabuleiro × nível × bairro. */
export function tierRents(st: GameState, i: number, tier: TierId = tierOf(st, i)): number[] {
  const s = street(i);
  const m = TIERS[tier].rent * hoodMult(st, s.group);
  return s.rent.map((r) => Math.round(r * m));
}
/** Valor de hipoteca: acompanha o preço da casa. */
export function tierMortgage(st: GameState, i: number, tier: TierId = tierOf(st, i)): number {
  const s = street(i);
  return round10(s.mortgage * TIERS[tier].price * hoodMult(st, s.group));
}
/** Quanto a hipoteca rendeu (ou renderia agora). */
export const mortgageValueOf = (st: GameState, i: number) => st.props[i]?.mortgageValue ?? tierMortgage(st, i);
export const unmortgageCost = (st: GameState, i: number) => Math.round(mortgageValueOf(st, i) * (1 + st.settings.mortgageRate));

/**
 * Valorização do bairro (gancho para as Notícias/Jornal): soma `pct` pontos percentuais ao multiplicador
 * do grupo (ex.: +10 → 1,1), dentro de HOOD.min..HOOD.max. Afeta preço, aluguéis e hipoteca das casas do bairro.
 */
export function applyNeighbourhoodChange(state: GameState, group: GroupId, pct: number, now = new Date()): GameState {
  if (!GROUPS[group]) throw new RuleError('Bairro inválido.');
  if (!Number.isFinite(pct)) throw new RuleError('Variação inválida.');
  const st = clone(state);
  const before = hoodMult(st, group);
  const after = Math.min(HOOD.max, Math.max(HOOD.min, round4(before + pct / 100)));
  st.hood = { ...(st.hood || {}), [group]: after };
  const delta = Math.round((after - before) * 100);
  if (delta) log(st, `Bairro ${GROUPS[group].name.toLowerCase()} ${delta > 0 ? 'valorizou' : 'desvalorizou'} ${Math.abs(delta)}%: preços e aluguéis ${delta > 0 ? 'sobem' : 'caem'}`, now, undefined, true);
  return st;
}

/** Aluguel atual: tabela da casa pelo número de construções; hipotecado não cobra.
 * O jogo da mesa não dobra o aluguel por grupo completo, então aqui também não. */
export function rentOf(st: GameState, i: number): number {
  const p = st.props[i];
  if (!p || p.mortgaged) return 0;
  return tierRents(st, i)[p.houses || 0];
}

export function netWorth(st: GameState, p: Player): number {
  let w = p.balance;
  for (const [k, pr] of Object.entries(st.props)) {
    if (pr.owner !== p.id) continue;
    const i = Number(k);
    const s = street(i);
    const price = tierPrice(st, i);
    w += pr.mortgaged ? price - mortgageValueOf(st, i) : price;
    w += (pr.houses || 0) * s.build;
  }
  COMPANY_IDX.forEach((i) => (w += (sharesOf(st, i)[p.id] || 0) * SHARE_PRICE));
  return w;
}

// ---------- Empréstimo ----------

export const loanOf = (st: GameState, pid: string): Loan | null => st.loans?.[pid] ?? null;
export const loanOwed = (l: Loan) => l.principal + l.interest - l.paid;
export const debtOf = (st: GameState, pid: string) => {
  const l = loanOf(st, pid);
  return l ? loanOwed(l) : 0;
};
/** Patrimônio líquido: patrimônio menos a dívida com o banco. */
export const equity = (st: GameState, p: Player) => netWorth(st, p) - debtOf(st, p.id);
// ---------- Score de crédito e juros ----------

export const creditOf = (p: Player | undefined) => p?.credit ?? CREDIT.start;
/** Faixa do score: Ruim (<300), Regular (300–599), Bom (600–799), Excelente (800+). */
export const creditBand = (score: number) => [...CREDIT_BANDS].reverse().find((b) => score >= b.from) ?? CREDIT_BANDS[0];
/** Taxa do banco nesta rodada (salas antigas, antes do primeiro sorteio: LOAN.interest). */
export const bankRate = (st: GameState) => st.bankRate ?? LOAN.interest;
/** Taxa de um empréstimo novo agora: taxa da rodada + ajuste do score, nunca abaixo do mínimo. */
export function loanRateFor(st: GameState, pid: string): number {
  const band = creditBand(creditOf(findPlayer(st, pid)));
  return Math.max(BANK_RATES.minLoanRate, round4(bankRate(st) + band.rateOffset));
}
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

/** Resumo de um lado, ex.: "$ 1.000 + Av. Paulista (Alto padrão) + 2 cotas da Banco Aurora". Com o estado, mostra a casa. */
export function describeSide(side: TradeSide, st?: GameState): string {
  const parts: string[] = [];
  if (side.money) parts.push(money(side.money));
  for (const i of side.props) parts.push(st ? `${street(i).name} (${tierName(tierOf(st, i))})` : street(i).name);
  for (const [k, q] of Object.entries(side.shares)) if (q > 0) parts.push(`${q} cota${q > 1 ? 's' : ''} da ${company(Number(k)).name}`);
  return parts.join(' + ') || 'nada';
}

// ---------- Imposto de renda ----------

/** IR do ano: alíquota sobre a renda acima da isenção. */
export const irTax = (income: number) => Math.max(0, Math.round((income - IR.exempt) * IR.rate));
/** Renda tributável desde a última volta. */
export const incomeOf = (p: Player | undefined) => p?.income ?? 0;
/** Tipos de transação que contam como renda para o IR. */
const INCOME_KINDS = new Set<TxKind>(['rent', 'fee', 'news']);
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

/** Casa da compra: a que já está no terreno (voltou ao banco) ou a escolhida (padrão: Intermediária). */
export function buyTier(st: GameState, i: number, chosen?: TierId): TierId {
  const forced = lotTier(st, i);
  if (forced) return forced;
  return chosen && TIERS[chosen] ? chosen : DEFAULT_TIER;
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
      const tier = buyTier(st, landed!, action.tier);
      return [{ from: p.id, to: BANK, amount: tierPrice(st, landed!, tier), reason: `Compra da ${s.name} · casa ${tierName(tier)}`, kind: 'buy', space: landed!, tier }];
    }
    case 'payRent': {
      const s = street(landed ?? -1);
      const owner = ownedBy(st, landed!);
      if (!owner) return [];
      const tier = tierOf(st, landed!);
      return [{ from: p.id, to: owner, amount: rentOf(st, landed!), reason: `Aluguel da ${s.name} (${tierName(tier)})`, kind: 'rent', space: landed!, tier }];
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
      return [{ from: BANK, to: actor, amount: tierMortgage(st, action.idx), reason: `Hipoteca da ${s.name}`, kind: 'mortgage', space: action.idx }];
    }
    case 'unmortgage': {
      const s = street(action.idx);
      return [{ from: actor, to: BANK, amount: unmortgageCost(st, action.idx), reason: `Fim da hipoteca da ${s.name} (+20%)`, kind: 'unmortgage', space: action.idx }];
    }
    case 'declareIR': {
      const ir = st.irPending;
      if (!ir || ir.pid !== actor) return [];
      const reason = ir.caught
        ? `Malha fina: IR do ano ${ir.year} + multa de ${Math.round(IR.fine * 100)}%`
        : `Imposto de renda do ano ${ir.year}: ${Math.round(IR.rate * 100)}% de ${money(Math.max(0, ir.income - IR.exempt))}`;
      return [{ from: actor, to: BANK, amount: ir.due, reason, kind: 'ir' }];
    }
    case 'payLoan': {
      const owed = debtOf(st, actor);
      return [{ from: actor, to: BANK, amount: action.amount, reason: action.amount >= owed ? 'Quitação do empréstimo' : `Pagamento parcial do empréstimo (resta ${money(owed - action.amount)})`, kind: 'loanpay' }];
    }
    default:
      return [];
  }
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

/** Sorteia a taxa de juros do banco para a rodada atual (sorteio da sala, igual em todos os celulares). */
function drawBankRate(st: GameState, now: Date) {
  const prev = st.bankRate;
  const opts = BANK_RATES.options;
  const r = opts[Math.min(opts.length - 1, Math.floor(nextRandom(st) * opts.length))];
  st.bankRate = r;
  st.bankRateRound = st.round;
  if (prev === undefined) log(st, `Taxa do banco nesta rodada: ${pct(r)}`, now);
  else if (prev === r) log(st, `Rodada ${st.round}: taxa do banco mantida em ${pct(r)}`, now);
  else log(st, `Rodada ${st.round}: taxa do banco ${r > prev ? 'subiu' : 'caiu'} para ${pct(r)} (era ${pct(prev)})`, now, undefined, true);
}

/** Volta completa no Início: fecha o ano do IR. Abaixo da isenção, nada a declarar. */
function completeYear(st: GameState, p: Player, now: Date) {
  const income = incomeOf(p);
  const year = (p.year || 0) + 1;
  p.year = year;
  p.income = 0;
  const tax = irTax(income);
  if (!tax) {
    p.irLast = { year, income, tax: 0, outcome: 'isento', paid: 0, round: st.round };
    log(st, `${p.name} fechou o ano ${year}: isento de IR (renda de ${money(income)})`, now, p.id);
    return;
  }
  st.irPending = { pid: p.id, year, income, tax, due: tax };
  log(st, `${p.name} completou a volta: hora da declaração do IR do ano ${year}`, now, p.id);
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
  if (st.round !== roundBefore) drawBankRate(st, now);
  // Início da vez: empréstimo vencido é cobrado antes de qualquer jogada
  const p = st.players[i];
  const l = loanOf(st, p.id);
  if (l && st.round >= l.dueRound) {
    collectLoan(st, p, now);
    if (p.out && !st.winner) nextTurn(st, now);
  }
}

/**
 * Cobrança do empréstimo vencido: primeiro o dinheiro; se faltar, PENHORA:
 * vende as construções ao banco pela metade do custo (sempre do imóvel com mais construções; empate, o mais barato),
 * depois toma os imóveis do mais barato para o mais caro, cada um pelo valor de hipoteca (já hipotecado vale 0).
 * O que sobrar do valor dos imóveis fica com o jogador. Se nem assim cobrir, o jogador vai à falência para o banco.
 */
function collectLoan(st: GameState, p: Player, now: Date) {
  const l = loanOf(st, p.id)!;
  const owed = loanOwed(l);
  log(st, `Vencimento: o banco cobra ${money(owed)} do empréstimo de ${p.name}`, now, undefined, true);
  const mine = () =>
    Object.keys(st.props)
      .map(Number)
      .filter((i) => st.props[i].owner === p.id);
  let sold = 0;
  while (p.balance < owed) {
    const built = mine().filter((i) => houses(st, i) > 0);
    if (!built.length) break;
    built.sort((a, b) => houses(st, b) - houses(st, a) || tierPrice(st, a) - tierPrice(st, b) || a - b);
    const i = built[0];
    const s = street(i);
    const hotel = houses(st, i) === 5;
    st.props[i].houses -= 1;
    sold += 1;
    applyTransfers(st, [{ from: BANK, to: p.id, amount: s.build / 2, reason: `Penhora: venda de ${hotel ? 'hotel' : 'casa'} na ${s.name} (metade do custo)`, kind: 'penhora', space: i }], now);
  }
  if (sold) log(st, `Penhora: o banco vendeu ${sold} construç${sold > 1 ? 'ões' : 'ão'} de ${p.name}`, now, undefined, true);
  let taken = 0;
  while (p.balance < owed) {
    const props = mine().sort((a, b) => tierPrice(st, a) - tierPrice(st, b) || a - b);
    if (!props.length) break;
    const i = props[0];
    const s = street(i);
    const value = st.props[i].mortgaged ? 0 : tierMortgage(st, i);
    toBank(st, i);
    taken += 1;
    applyTransfers(
      st,
      [{ from: BANK, to: p.id, amount: value, reason: `Penhora: ${s.name} tomada pelo banco (${value ? 'valor de hipoteca' : 'já hipotecada, sem valor'})`, kind: 'penhora', space: i }],
      now,
    );
    log(st, `Penhora: o banco tomou a ${s.name} de ${p.name}`, now, undefined, true);
  }
  const amount = Math.min(p.balance, owed);
  if (amount > 0) applyTransfers(st, [{ from: p.id, to: BANK, amount, reason: 'Cobrança do empréstimo vencido', kind: 'loanpay' }], now);
  if (sold || taken || amount < owed) changeCredit(st, p, CREDIT.penhora, 'Empréstimo vencido com penhora');
  else changeCredit(st, p, CREDIT.loanPaid, 'Empréstimo pago no vencimento');
  if (amount >= owed) {
    delete st.loans![p.id];
    log(st, `${p.name} pagou o empréstimo vencido`, now, undefined, true);
    return;
  }
  l.paid += amount;
  log(st, `${p.name} não conseguiu pagar o empréstimo e faliu`, now, undefined, true);
  goBankrupt(st, p, BANK, now, undefined);
}

/** Falência: imóveis e cotas vão ao credor (ao banco, ou imóveis hipotecados), o saldo também; dívida e propostas somem. */
function goBankrupt(st: GameState, d: Player, creditor: string, now: Date, by: string | undefined) {
  for (const [k, pr] of Object.entries(st.props)) {
    if (pr.owner !== d.id) continue;
    if (creditor === BANK || pr.mortgaged) toBank(st, Number(k));
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

/** Imóvel volta ao banco: o terreno fica com a casa (quem comprar depois leva a mesma casa). */
function toBank(st: GameState, i: number) {
  const tier = tierOf(st, i);
  delete st.props[i];
  st.lots = { ...(st.lots || {}), [i]: tier };
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
      st.seed = Math.floor(rng() * 4294967296) >>> 0;
      st.irPending = null;
      log(st, `Partida começou com ${st.players.length} jogadores`, now, actor, true);
      drawBankRate(st, now);
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
      if (passed) {
        applyTransfers(st, [{ from: BANK, to: p.id, amount: st.settings.salary, reason: 'Pró-labore do Início', kind: 'salary' }], now);
        completeYear(st, p, now);
      }
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
              ? feeTransfers(st, idx, 2, p.id).reduce((a, t) => a + t.amount, 0)
              : 0;
      if (dueHere > p.balance) shortfall(st, p, s.type === 'street' ? 'o aluguel' : s.type === 'tax' ? 'o imposto' : 'a taxa da empresa');
      break;
    }
    case 'buy': {
      turnOnly();
      const s = landedSpace();
      need(s.type === 'street' && !ownedBy(st, ti.landed!), 'Este imóvel não está à venda.');
      need(!ti.resolved, 'Esta casa já foi resolvida.');
      need(!action.tier || TIERS[action.tier], 'Escolha uma das 3 casas.');
      const forced = lotTier(st, ti.landed!);
      need(!forced || !action.tier || action.tier === forced, `Este terreno já tem uma casa ${forced && tierName(forced)}.`);
      const tier = buyTier(st, ti.landed!, action.tier);
      const list = transfersFor(state, action, actor);
      pay(st, list, now);
      st.props[ti.landed!] = { owner: p.id, houses: 0, mortgaged: false, round: st.round, tier };
      if (st.lots) delete st.lots[ti.landed!];
      ti.resolved = true;
      log(st, `${p.name} comprou ${s.name} (casa ${tierName(tier)}) por ${money(list[0].amount)}`, now, actor);
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
      log(st, `${p.name} tirou dupla e saiu da detenção`, now, actor);
      break;
    }
    case 'jailFail': {
      turnOnly();
      need(p.jailed && ti.landed === null, 'Você não está na detenção.');
      need(p.jailTries < 2, 'Na 3ª tentativa sem dupla, pague a fiança.');
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
      pay(st, transfersFor(state, action, actor), now);
      me.builtRound = st.round;
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
        st.turnInfo = emptyTurn();
        log(st, `${p.name} tirou dupla e joga de novo`, now, actor);
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
      const reason = `Negociação ${t.id}: ${a.name} deu ${describeSide(t.give, st)} e recebeu ${describeSide(t.get, st)}`;
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
      log(st, `Negociação fechada entre ${a.name} e ${me.name}: ${describeSide(t.give, st)} por ${describeSide(t.get, st)}`, now, actor);
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
      need(amt <= limit, `Seu limite é ${money(limit)}.`);
      const rate = loanRateFor(st, actor);
      const interest = loanInterest(amt, rate);
      const due = st.round + LOAN.rounds;
      st.loans = { ...(st.loans || {}), [actor]: { principal: amt, interest, paid: 0, takenRound: st.round, dueRound: due, rate } };
      applyTransfers(st, [{ from: BANK, to: actor, amount: amt, reason: `Empréstimo do banco a ${pct(rate)}: devolver ${money(amt + interest)} até a rodada ${due}`, kind: 'loan' }], now);
      log(st, `${me.name} pegou ${money(amt)} emprestado no banco a ${pct(rate)}`, now, actor);
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
      const full = amt === owed;
      pay(st, transfersFor(state, action, actor), now);
      if (full) {
        delete st.loans![actor];
        changeCredit(st, me, CREDIT.loanPaid, st.round < l.dueRound ? 'Empréstimo quitado antes do vencimento' : 'Empréstimo quitado em dia');
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
      if (ir.caught) {
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'pego', paid: ir.due, round: st.round };
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
      const caught = nextRandom(st) < IR.catchChance;
      if (!caught) {
        st.irPending = null;
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'passou', paid: 0, round: st.round };
        // ninguém mais fica sabendo da sonegação
        log(st, `${p.name} entregou a declaração do ano ${ir.year}`, now, actor);
        break;
      }
      const due = Math.round(ir.tax * (1 + IR.fine));
      changeCredit(st, p, CREDIT.malhaFina, 'Caiu na malha fina');
      log(st, `${p.name} sonegou o IR e caiu na malha fina: imposto + multa de ${money(due)}`, now, actor, true);
      if (p.balance >= due) {
        applyTransfers(st, [{ from: p.id, to: BANK, amount: due, reason: `Malha fina: IR do ano ${ir.year} + multa de ${Math.round(IR.fine * 100)}%`, kind: 'ir' }], now);
        st.irPending = null;
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'pego', paid: due, round: st.round };
      } else {
        // sem saldo: fica devendo e paga pelo Pix (vendendo, hipotecando ou declarando falência)
        shortfall(st, p, 'a multa da malha fina');
        st.irPending = { ...ir, caught: true, due };
        p.irLast = { year: ir.year, income: ir.income, tax: ir.tax, outcome: 'pego', paid: 0, round: st.round };
      }
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
