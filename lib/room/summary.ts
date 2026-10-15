// Resumo da rodada ("Seu dinheiro"): o que mexeu no MEU dinheiro sem eu tocar em nada desde o último resumo
// (dividendos, parcelas, cobranças, indenização, penhora, rendimento, o que os outros me pagaram), agrupado.
import { SPACES } from '@/lib/game/data';
import { findPlayer, pname } from '@/lib/game/rules';
import type { GameState, Tx, TxKind } from '@/lib/game/types';

/** Até onde o resumo já foi mostrado neste celular. */
export interface SummaryMark {
  round: number;
  tx: number;
  feed: number;
}

export interface SummaryLine {
  text: string;
  /** valor positivo (o sinal vem da seção) */
  amount: number;
  /** não mexe na carteira (rendimento que fica na poupança) */
  savings?: boolean;
}

export interface RoundSummary {
  round: number;
  entrou: SummaryLine[];
  saiu: SummaryLine[];
  avisos: string[];
  /** carteira antes e depois do que está no resumo */
  before: number;
  after: number;
}

export const markNow = (st: GameState): SummaryMark => ({ round: st.round, tx: st.txCount, feed: st.feedCount });

const spaceName = (t: Tx) => (t.space !== undefined ? SPACES[t.space]?.name ?? '' : '');
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** "A", "A e B", "A, B e C" */
export function joinNames(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
}

/** Transação que entra no resumo: é minha, não é entre mim e eu, e não fui eu que fiz a ação. */
export function summaryTx(st: GameState, me: string, sinceTx: number): Tx[] {
  return st.tx
    .filter((t) => t.seq > sinceTx && t.from !== t.to && (t.to === me || t.from === me) && (t.auto || t.by !== me))
    .sort((a, b) => a.seq - b.seq);
}

/** Texto de um grupo de transações do mesmo tipo e sentido. */
function groupText(st: GameState, kind: TxKind, incoming: boolean, xs: Tx[]): string {
  const n = xs.length;
  const other = (t: Tx) => pname(st, incoming ? t.from : t.to);
  switch (kind) {
    case 'dividend': {
      const cos = [...new Set(xs.map(spaceName))];
      return cos.length > 1 ? `Dividendos de ${cos.length} empresas` : `Dividendos da ${cos[0]}`;
    }
    case 'financiamento':
      return n > 1 ? `${n} parcelas de financiamento` : xs[0].reason;
    case 'loanpay':
      return n > 1 ? `${n} cobranças do empréstimo` : xs[0].reason;
    case 'indenizacao':
      return n > 1 ? `Seguro: ${n} indenizações` : `Indenização do seguro da ${spaceName(xs[0])}`;
    case 'penhora':
      return n > 1 ? `Penhora: ${n} vendas ao banco` : xs[0].reason;
    case 'rendimento':
      return 'Rendimento da poupança (fica na poupança)';
    case 'poupanca':
      return incoming ? 'Resgate da poupança pelo banco' : xs[0].reason;
    case 'rent':
      return n > 1 ? `${n} aluguéis ${incoming ? 'recebidos' : 'pagos'}` : `Aluguel da ${spaceName(xs[0])} · ${other(xs[0])}`;
    case 'fee':
      return n > 1 ? `${n} taxas de empresa` : `Taxa da ${spaceName(xs[0])} · ${other(xs[0])}`;
    case 'news':
      return n > 1 ? `${n} ${plural(n, 'notícia', 'notícias')} da mesa` : `Notícia da mesa · ${other(xs[0])}`;
    case 'salary':
      return n > 1 ? `${n} pró-labores` : 'Pró-labore';
    case 'trade': {
      const who = [...new Set(xs.map(other))];
      return `Negociação com ${joinNames(who)}`;
    }
    case 'bankrupt':
      return `Falência de ${joinNames([...new Set(xs.map(other))])}`;
    default:
      return n > 1 ? `${xs[0].reason} (${n}×)` : xs[0].reason;
  }
}

/** Linhas de dinheiro agrupadas (repetidos viram uma linha), maiores primeiro. */
export function moneyLines(st: GameState, me: string, txs: Tx[]): { entrou: SummaryLine[]; saiu: SummaryLine[] } {
  const groups = new Map<string, { kind: TxKind; incoming: boolean; xs: Tx[] }>();
  for (const t of txs) {
    const incoming = t.to === me;
    const known: TxKind[] = ['dividend', 'financiamento', 'loanpay', 'indenizacao', 'penhora', 'rendimento', 'poupanca', 'rent', 'fee', 'news', 'salary', 'trade', 'bankrupt'];
    const key = `${incoming ? 'in' : 'out'}:${t.kind}${known.includes(t.kind) ? '' : `:${t.reason}`}`;
    const g = groups.get(key) ?? { kind: t.kind, incoming, xs: [] };
    g.xs.push(t);
    groups.set(key, g);
  }
  const entrou: SummaryLine[] = [];
  const saiu: SummaryLine[] = [];
  for (const g of groups.values()) {
    const amount = g.xs.reduce((a, t) => a + t.amount, 0);
    if (amount <= 0) continue;
    const line: SummaryLine = { text: groupText(st, g.kind, g.incoming, g.xs), amount, ...(g.kind === 'rendimento' ? { savings: true } : {}) };
    (g.incoming ? entrou : saiu).push(line);
  }
  const big = (a: SummaryLine, b: SummaryLine) => b.amount - a.amount;
  return { entrou: entrou.sort(big), saiu: saiu.sort(big) };
}

/** Avisos dos meus eventos importantes (quitação, retomada, penhora, fim do ano), sem valores repetidos. */
export function noticeLines(st: GameState, me: string, sinceFeed: number): string[] {
  const items = st.feed.filter((f) => f.seq > sinceFeed).sort((a, b) => a.seq - b.seq);
  const paidOff: string[] = [];
  const out: string[] = [];
  for (const f of items) {
    const mine = f.for === me;
    let m: RegExpMatchArray | null;
    if (mine && (m = f.text.match(/quitou o financiamento da (.+?):/))) paidOff.push(m[1]);
    else if (mine && (m = f.text.match(/o banco retomou a (.+?) de /))) out.push(`Banco retomou a ${m[1]} (parcela sem saldo)`);
    else if (mine && /quitou o empréstimo|pagou o empréstimo vencido/.test(f.text)) out.push('Empréstimo quitado');
    else if (mine && (m = f.text.match(/^Penhora: o banco tomou a (.+?) de /))) out.push(`Penhora: o banco tomou a ${m[1]}`);
    else if (mine && (m = f.text.match(/^Penhora: o banco vendeu (\d+) construç/))) out.push(`Penhora: o banco vendeu ${m[1]} ${Number(m[1]) > 1 ? 'construções' : 'construção'}`);
    else if (!f.for && (m = f.text.match(/^Fim do ano (\d+)/))) out.push(`O ano ${m[1]} fechou: declare o IR na sua primeira vez no ano ${Number(m[1]) + 1}`);
  }
  if (paidOff.length) out.unshift(paidOff.length > 1 ? `${joinNames(paidOff)} quitadas: não estão mais alienadas ao banco` : `${paidOff[0]} quitada: não está mais alienada ao banco`);
  return out;
}

/** Resumo desde `since` (null quando nada mudou ou o jogador não está na partida). */
export function roundSummary(st: GameState, me: string, since: SummaryMark): RoundSummary | null {
  const p = findPlayer(st, me);
  if (!p || st.phase !== 'playing') return null;
  const { entrou, saiu } = moneyLines(st, me, summaryTx(st, me, since.tx));
  const avisos = noticeLines(st, me, since.feed);
  if (!entrou.length && !saiu.length && !avisos.length) return null;
  const net = entrou.reduce((a, l) => a + (l.savings ? 0 : l.amount), 0) - saiu.reduce((a, l) => a + l.amount, 0);
  return { round: st.round, entrou, saiu, avisos, before: p.balance - net, after: p.balance };
}
