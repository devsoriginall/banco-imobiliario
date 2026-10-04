// Tipos do estado da partida. O estado inteiro é um JSON guardado numa linha da tabela `rooms`.

export type GroupId = 'verde' | 'vermelho' | 'azulclaro' | 'roxo' | 'azulescuro' | 'laranja' | 'amarelo';

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
}

export interface Property {
  owner: string;
  houses: number; // 0..4 casas, 5 = hotel
  mortgaged: boolean;
  /** rodada em que o dono atual adquiriu o imóvel (compra, negociação ou falência) */
  round?: number;
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
  | 'penhora';

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

/** Empréstimo do banco: deve principal + juros − pago, até o início da vez do jogador na rodada `dueRound`. */
export interface Loan {
  principal: number;
  interest: number;
  paid: number;
  takenRound: number;
  dueRound: number;
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
}

export interface Settings {
  start: number;
  salary: number;
  bail: number;
  mortgageRate: number;
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
}

export type Action =
  | { type: 'join'; name: string }
  | { type: 'setStart'; amount: number }
  | { type: 'start' }
  | { type: 'reset' }
  | { type: 'land'; idx: number }
  | { type: 'buy' }
  | { type: 'skipBuy' }
  | { type: 'payRent' }
  | { type: 'payFee'; dice: number }
  | { type: 'buyShares'; qty: number }
  | { type: 'drawNews' }
  | { type: 'applyNews' }
  | { type: 'payTax' }
  | { type: 'refund' }
  | { type: 'jailOut' }
  | { type: 'jailFail' }
  | { type: 'bail' }
  | { type: 'useCard' }
  | { type: 'build'; idx: number }
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
  | { type: 'takeLoan'; amount: number }
  | { type: 'payLoan'; amount: number };

/** Transferência ainda não aplicada (prévia do Pix) */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
  reason: string;
  kind: TxKind;
  space?: number;
  ref?: string;
}

export interface ActionContext {
  actor: string;
  now?: Date;
  rng?: () => number;
}
