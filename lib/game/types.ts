// Tipos do estado da partida. O estado inteiro é um JSON guardado numa linha da tabela `rooms`.

export type GroupId = 'verde' | 'vermelho' | 'azulclaro' | 'roxo' | 'azulescuro' | 'laranja' | 'amarelo';

/** As 3 casas que se escolhe ao comprar um imóvel. */
export type TierId = 'basica' | 'intermediaria' | 'alto';

export interface StreetSpace {
  type: 'street';
  name: string;
  group: GroupId;
  price: number;
  /** [sem casa, 1, 2, 3, 4, hotel] */
  rent: [number, number, number, number, number, number];
  build: number;
  mortgage: number;
  city: string;
  desc: string;
}

export interface CompanySpace {
  type: 'company';
  name: string;
  sector: string;
  short: string;
  price: number;
}

export type Space =
  | StreetSpace
  | CompanySpace
  | { type: 'start' | 'news' | 'jail' | 'free' | 'gotojail'; name: string }
  | { type: 'tax' | 'refund'; name: string; amount: number };

export type NewsKind = 'pay' | 'get' | 'each' | 'free' | 'jail';
export interface NewsCard {
  k: NewsKind;
  v: number;
  t: string;
}

export interface Player {
  /** id aleatório do aparelho (localStorage) */
  id: string;
  name: string;
  color: string;
  balance: number;
  pos: number;
  jailed: boolean;
  jailTries: number;
  freeCards: number;
  out: boolean;
  /** rodada em que construiu pela última vez (uma construção por rodada) */
  builtRound?: number;
  /** rodada em que comprou cota da empresa pela última vez (uma cota por rodada) */
  shareRound?: number;
  /** renda tributável desde a última volta (aluguéis, taxas de empresa, notícias) */
  income?: number;
  /** voltas completas (anos de IR já fechados) */
  year?: number;
  /** score de crédito, 0 a 1000 (salas antigas: 500) */
  credit?: number;
  /** últimas mudanças do score (mais nova primeiro) */
  creditLog?: CreditEvent[];
  /** resultado da última declaração do IR */
  irLast?: IrResult;
}

export interface CreditEvent {
  delta: number;
  reason: string;
  round: number;
}

export interface IrResult {
  year: number;
  income: number;
  tax: number;
  /** 'isento' | 'declarou' | 'pego' (malha fina) | 'passou' (sonegou e não foi pego) */
  outcome: 'isento' | 'declarou' | 'pego' | 'passou';
  /** quanto pagou (imposto, ou imposto + multa) */
  paid: number;
  round: number;
}

/** Declaração do IR pendente do jogador da vez (aparece ao completar a volta). */
export interface IrPending {
  pid: string;
  year: number;
  income: number;
  tax: number;
  /** caiu na malha fina e ainda não teve saldo para pagar imposto + multa */
  caught?: boolean;
  /** valor a pagar agora (imposto, ou imposto + multa se caught) */
  due: number;
}

export interface Property {
  owner: string;
  houses: number; // 0..4 casas, 5 = hotel
  mortgaged: boolean;
  /** rodada em que o dono atual adquiriu o imóvel (compra, negociação ou falência) */
  round?: number;
  /** padrão das casas, escolhido ao construir a primeira (sem casas: terreno, sem padrão; salas antigas com 0 casas: ignorado) */
  tier?: TierId;
  /** valor recebido ao hipotecar (base do custo para tirar a hipoteca) */
  mortgageValue?: number;
}

export type TxKind =
  | 'salary'
  | 'buy'
  | 'rent'
  | 'fee'
  | 'shares'
  | 'news'
  | 'tax'
  | 'refund'
  | 'bail'
  | 'build'
  | 'sellhouse'
  | 'mortgage'
  | 'unmortgage'
  | 'bankrupt'
  | 'trade'
  | 'loan'
  | 'loanpay'
  | 'penhora'
  | 'ir'
  /** dividendos das cotas (contam como renda) */
  | 'dividend'
  /** decisões da gerência pagas pelo dono da empresa (investimento, marketing) */
  | 'gestao';

export interface Tx {
  id: string;
  seq: number;
  at: string;
  round: number;
  from: string; // id do jogador ou 'bank'
  to: string;
  amount: number;
  reason: string;
  kind: TxKind;
  space?: number;
  /** id da negociação que gerou esta transação */
  ref?: string;
  /** casa do imóvel (compra e aluguel) */
  tier?: TierId;
}

/** Um lado de uma proposta de negociação: dinheiro, imóveis (índices) e cotas (empresa → quantidade). */
export interface TradeSide {
  money: number;
  props: number[];
  shares: Record<number, number>;
}

/** Proposta de negociação pendente: `from` dá `give` e pede `get` a `to`. */
export interface Trade {
  id: string;
  from: string;
  to: string;
  give: TradeSide;
  get: TradeSide;
  at: string;
  round: number;
}

/** Planos de pagamento do empréstimo: parcelado em 2x a 5x ou pagamento único em 5 rodadas. */
export type LoanPlanId = 'x2' | 'x3' | 'x4' | 'x5' | 'unico';

/**
 * Empréstimo do banco: deve principal + juros − pago.
 * Pagamento único (e salas antigas, sem `plan`): tudo até o início da vez do jogador na rodada `dueRound`.
 * Parcelado: a parcela `parcels[parcelsPaid]` é cobrada no início da vez do jogador na rodada `takenRound + parcelsPaid + 1`.
 */
export interface Loan {
  principal: number;
  interest: number;
  paid: number;
  takenRound: number;
  dueRound: number;
  /** taxa travada ao pegar (taxa da rodada + ajuste do score); salas antigas: LOAN.interest */
  rate?: number;
  /** rodada do último pagamento parcial que contou para o score */
  partRound?: number;
  /** plano escolhido (salas antigas: pagamento único) */
  plan?: LoanPlanId;
  /** valor de cada parcela (só no parcelado; a última absorve o arredondamento) */
  parcels?: number[];
  /** parcelas já cobradas */
  parcelsPaid?: number;
  /** alguma parcela precisou de penhora (perde o bônus de quitação) */
  penhora?: boolean;
}

export interface FeedItem {
  seq: number;
  at: string;
  text: string;
  /** quem provocou o evento */
  by?: string;
  important?: boolean;
}

export interface TurnInfo {
  /** casa onde o jogador da vez parou nesta jogada (null = ainda escolhendo) */
  landed: number | null;
  /** a casa já foi resolvida e a vez pode passar */
  resolved: boolean;
  /** índice da carta Notícia aberta */
  news: number | null;
  /** taxa da empresa paga */
  feePaid: boolean;
  /** jogadores que já perderam score por falta de saldo nesta jogada */
  short?: string[];
}

export interface Settings {
  start: number;
  salary: number;
  bail: number;
  mortgageRate: number;
  /** Jornal da Cidade e Bolsa (manchete, cotações e dividendos a cada rodada); ausente = ligado */
  mercado?: boolean;
}

// ---------- Jornal da Cidade e Bolsa ----------

/** Efeito de uma manchete do Jornal. `rounds` ausente no bairro = permanente. */
export type HeadlineEffect =
  /** valorização do bairro: permanente (applyNeighbourhoodChange) ou temporária por `rounds` rodadas */
  | { k: 'hood'; group: GroupId; pct: number; rounds?: number }
  /** todos os bairros */
  | { k: 'hoodAll'; pct: number; rounds?: number }
  /** cotação da empresa (índice da casa) muda `pct`% nesta rodada */
  | { k: 'stock'; co: number; pct: number }
  /** todas as cotações */
  | { k: 'stockAll'; pct: number }
  /** dividendo: soma `pp` pontos percentuais ao rendimento por `rounds` rodadas (sem `co`: todas as empresas) */
  | { k: 'yield'; co?: number; pp: number; rounds: number }
  /** greve: dividendo zero por `rounds` rodadas */
  | { k: 'strike'; co: number; rounds: number }
  /** taxa da casa da empresa +`pct`% por `rounds` rodadas */
  | { k: 'fee'; co: number; pct: number; rounds: number }
  /** taxa do banco nesta rodada ± `pp` pontos percentuais */
  | { k: 'rate'; pp: number };

export interface Headline {
  cat: 'bairro' | 'empresa' | 'economia';
  /** nome curto do efeito, ex.: "Assaltos" (aparece no selo do bairro e na Bolsa) */
  tag: string;
  title: string;
  body: string;
  effects: HeadlineEffect[];
}

/** Uma edição do Jornal da Cidade: uma por rodada. */
export interface Edition {
  /** rodada (= número da edição) */
  round: number;
  /** índice da manchete em HEADLINES */
  h: number;
  /** efeitos no jogo, já com as rodadas, ex.: "Bairro Verde −15% até a rodada 9" */
  effects: string[];
}

/** Modificador temporário do bairro (manchete): vale até a rodada `until`, inclusive. */
export interface HoodMod {
  group: GroupId;
  pct: number;
  until: number;
  why: string;
}

/** Modificador com validade (rodadas `from` a `until`, inclusive). */
export interface TimedMod {
  from: number;
  until: number;
  why: string;
}

/** Decisões da gerência (dono da empresa, uma por rodada por empresa). */
export type DecisionId = 'investir' | 'dividendo' | 'cortar' | 'marketing';

/** Cotação e efeitos de uma empresa na Bolsa. */
export interface Stock {
  /** preço atual da cota */
  price: number;
  /** preços no começo das últimas rodadas (mais antigo primeiro; o último é o atual) */
  hist: number[];
  /** efeitos que entram no começo da rodada `round` (variação %, resultado do investimento, risco de greve) */
  pend?: { round: number; why: string; pct?: number; invest?: boolean; strike?: number }[];
  /** ajustes do rendimento do dividendo (pp em pontos percentuais; zero = greve) */
  yieldMods?: (TimedMod & { pp?: number; zero?: boolean })[];
  /** aumentos da taxa da casa (pct em %) */
  feeMods?: (TimedMod & { pct: number })[];
  /** rodada da última decisão da gerência */
  decRound?: number;
  /** última decisão (para mostrar) */
  decision?: DecisionId;
}

export interface GameState {
  v: 1;
  code: string;
  phase: 'lobby' | 'playing';
  hostId: string;
  createdAt: string;
  round: number;
  turn: number;
  players: Player[];
  props: Record<number, Property>;
  /** shares[índice da empresa][id do jogador] = cotas */
  shares: Record<number, Record<string, number>>;
  deck: number[];
  deckPtr: number;
  tx: Tx[];
  txCount: number;
  feed: FeedItem[];
  feedCount: number;
  settings: Settings;
  turnInfo: TurnInfo;
  /** uma ação desfazível: o estado anterior e quem fez a ação */
  prev: GameState | null;
  prevBy: string | null;
  winner: string | null;
  /** propostas de negociação pendentes (salas antigas podem não ter o campo) */
  trades?: Trade[];
  tradeCount?: number;
  /** empréstimos ativos por jogador */
  loans?: Record<string, Loan>;
  /** multiplicador de preço e aluguel por bairro (grupo de cor); ausente = 1,0 */
  hood?: Partial<Record<GroupId, number>>;
  /** obsoleto (salas antigas): casas que voltavam ao banco com o terreno; hoje o terreno volta sem casa */
  lots?: Record<number, TierId>;
  /** estado do sorteio determinístico (mulberry32), igual em todos os celulares */
  seed?: number;
  /** taxa de juros do banco nesta rodada (salas antigas: LOAN.interest) */
  bankRate?: number;
  /** rodada em que a taxa foi sorteada */
  bankRateRound?: number;
  /** declaração do IR esperando o jogador da vez */
  irPending?: IrPending | null;
  /** Jornal da Cidade: edições (mais nova primeiro) e o baralho de manchetes */
  jornal?: Edition[];
  jornalDeck?: number[];
  jornalPtr?: number;
  /** modificadores temporários dos bairros (manchetes) */
  hoodMods?: HoodMod[];
  /** Bolsa: cotação de cada empresa (índice da casa); ausente = SHARE_PRICE */
  stocks?: Record<number, Stock>;
}

export type Action =
  | { type: 'join'; name: string }
  | { type: 'setStart'; amount: number }
  | { type: 'setMercado'; on: boolean }
  | { type: 'start' }
  | { type: 'reset' }
  | { type: 'land'; idx: number }
  | { type: 'buy' }
  | { type: 'skipBuy' }
  | { type: 'payRent' }
  | { type: 'payFee'; dice: number }
  | { type: 'buyShares'; qty: number }
  | { type: 'sellShares'; idx: number; qty: number }
  | { type: 'manage'; idx: number; decision: DecisionId }
  | { type: 'drawNews' }
  | { type: 'applyNews' }
  | { type: 'payTax' }
  | { type: 'refund' }
  | { type: 'jailOut' }
  | { type: 'jailFail' }
  | { type: 'bail' }
  | { type: 'useCard' }
  | { type: 'build'; idx: number; tier?: TierId }
  | { type: 'sellHouse'; idx: number }
  | { type: 'mortgage'; idx: number }
  | { type: 'unmortgage'; idx: number }
  | { type: 'endTurn'; again: boolean }
  | { type: 'undo' }
  | { type: 'bankrupt'; debtor: string; creditor: string }
  | { type: 'proposeTrade'; to: string; give: TradeSide; get: TradeSide }
  | { type: 'acceptTrade'; id: string }
  | { type: 'declineTrade'; id: string }
  | { type: 'cancelTrade'; id: string }
  | { type: 'takeLoan'; amount: number; plan?: LoanPlanId }
  | { type: 'payLoan'; amount: number }
  | { type: 'declareIR' }
  | { type: 'evadeIR' };

/** Transferência ainda não aplicada (prévia do Pix) */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
  reason: string;
  kind: TxKind;
  space?: number;
  ref?: string;
  tier?: TierId;
}

export interface ActionContext {
  actor: string;
  now?: Date;
  rng?: () => number;
}
