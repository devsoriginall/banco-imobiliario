// Textos das notificações de "Pix recebido" no celular de quem recebe.
import { SPACES } from '@/lib/game/data';
import { money } from '@/lib/game/format';
import { pname } from '@/lib/game/rules';
import type { GameState, Tx } from '@/lib/game/types';

const spaceName = (t: Tx) => (t.space !== undefined ? SPACES[t.space]?.name : '') || '';

export function describeIncoming(st: GameState, t: Tx): { title: string; text: string } {
  const plus = ` · +${money(t.amount)}`;
  if (t.kind === 'dividend') return { title: 'Dividendos', text: `Você recebeu ${money(t.amount)} da ${spaceName(t)}` };
  if (t.from === 'bank') return { title: 'Pix recebido do Banco', text: t.reason + plus };
  const who = pname(st, t.from);
  let what: string;
  switch (t.kind) {
    case 'rent':
      what = `pagou o aluguel da ${spaceName(t)}`;
      break;
    case 'fee':
      what = `pagou a taxa da ${spaceName(t)}`;
      break;
    case 'news':
      what = 'pagou a aposta da mesa';
      break;
    case 'bankrupt':
      what = 'faliu e passou o saldo para você';
      break;
    default:
      what = `pagou: ${t.reason}`;
  }
  return { title: 'Pix recebido', text: `${who} ${what}${plus}` };
}

/** Transações novas (seq > lastSeen) em que `me` recebe de outra pessoa ou do banco. */
export function incomingSince(st: GameState, me: string, lastSeen: number): Tx[] {
  return st.tx.filter((t) => t.seq > lastSeen && t.to === me && t.from !== me).sort((a, b) => a.seq - b.seq);
}
