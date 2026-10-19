'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findPlayer, migrateState, pname, RuleError, tradesOf } from '@/lib/game/rules';
import type { Action, GameState, Trade, Tx } from '@/lib/game/types';
import { getStore, isLocalMode, type RoomSnapshot } from '@/lib/room';
import { getIdentity, saveName, type Identity } from '@/lib/room/identity';
import { describeIncoming, incomingSince } from '@/lib/room/notify';
import { dispatch } from '@/lib/room/sync';
import { Game } from './Game';
import { Lobby } from './Lobby';
import { useToast } from './Toasts';
import { LocalBanner } from './ui';

export interface RunResult {
  /** transações criadas por esta ação (para o comprovante) */
  created: Tx[];
  state: GameState;
}
export type Run = (action: Action) => Promise<RunResult | null>;
/** Comprovante que chega de fora (negociação aceita no celular do outro jogador). */
export interface PushedReceipt {
  txs: Tx[];
  title: string;
}

export function Room({ code }: { code: string }) {
  const toast = useToast();
  const [me, setMe] = useState<Identity | null>(null);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const snapRef = useRef<RoomSnapshot | null>(null);
  const lastSeen = useRef<number | null>(null);
  const lastFeed = useRef<number | null>(null);
  const mySeqs = useRef(new Set<number>());
  const lastTrades = useRef<Trade[]>([]);
  /** propostas que eu mesmo aceitei, recusei ou cancelei (não precisam de aviso) */
  const myTradeActs = useRef(new Set<string>());
  const [pushed, setPushed] = useState<PushedReceipt | null>(null);

  // Aceita só versões mais novas (o Realtime e a resposta da gravação podem chegar fora de ordem)
  const accept = useCallback((raw: RoomSnapshot) => {
    if (snapRef.current && raw.version <= snapRef.current.version) return;
    // salas antigas aparecem já no calendário (a próxima ação grava a migração; a regra é a mesma)
    const s = { ...raw, state: migrateState(raw.state) };
    snapRef.current = s;
    setSnap(s);
    setStatus('ready');
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMe(getIdentity());
    const store = getStore();
    let alive = true;
    const reload = () =>
      store
        .load(code)
        .then((s) => {
          if (!alive) return;
          if (s) accept(s);
          else if (!snapRef.current) setStatus('missing');
        })
        .catch(() => alive && !snapRef.current && setStatus('error'));
    reload();
    const unsub = store.subscribe(code, accept);
    const onVis = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVis);
    // rede de segurança caso algum evento do Realtime se perca
    const poll = setInterval(reload, isLocalMode ? 15000 : 10000);
    return () => {
      alive = false;
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(poll);
    };
  }, [code, accept]);

  // Notificações curtas (fila em Toasts): Pix recebido no meio da rodada, negociação, falência e vencedor
  useEffect(() => {
    if (!snap || !me) return;
    const st = snap.state;
    if (lastSeen.current === null) {
      lastSeen.current = st.txCount;
      lastFeed.current = st.feedCount;
      lastTrades.current = tradesOf(st);
      return;
    }
    // Avisos curtos só do que acontece no meio da rodada (aluguel, taxa, aposta da mesa, negociação).
    // O automático (dividendos, parcelas, cobranças, indenização, rendimento, penhora) vai para o resumo da rodada;
    // o que precisa de mim (sua vez, proposta, IR, vencimento) fica na faixa "Precisa de você" da Jogada.
    for (const t of incomingSince(st, me.id, lastSeen.current)) {
      if (t.auto || QUIET.has(t.kind)) continue;
      if (mySeqs.current.has(t.seq) && t.kind !== 'salary') continue;
      const d = describeIncoming(st, t);
      toast(d.title, d.text);
    }
    // da mesa, só falência e vencedor viram aviso para todos (o resto vai para o Jornal; o dinheiro dos outros não aparece)
    for (const f of [...st.feed].reverse()) {
      if (f.seq > (lastFeed.current ?? 0) && f.important && f.by !== me.id && (!f.for || f.for === me.id) && TOAST_FEED.test(f.text)) toast(feedTitle(f.text), f.text);
    }
    // Negociação: fechada, recusada ou cancelada (a proposta nova aparece na faixa da Jogada)
    const nowTrades = tradesOf(st);
    for (const t of lastTrades.current) {
      if (nowTrades.some((x) => x.id === t.id) || myTradeActs.current.has(t.id)) continue;
      const deal = st.tx.filter((x) => x.ref === t.id).sort((a, b) => a.seq - b.seq);
      if (t.from === me.id) {
        if (deal.length) {
          toast('Negociação fechada', `Negociação fechada com ${pname(st, t.to)}`);
          setPushed({ txs: deal, title: 'Negociação fechada' });
        } else toast('Proposta recusada', `${pname(st, t.to)} recusou sua proposta.`);
      } else if (t.to === me.id && !deal.length) toast('Proposta cancelada', `${pname(st, t.from)} cancelou a proposta.`);
    }
    lastTrades.current = nowTrades;
    lastSeen.current = Math.max(lastSeen.current, st.txCount);
    lastFeed.current = Math.max(lastFeed.current ?? 0, st.feedCount);
  }, [snap, me, toast]);

  const run: Run = useCallback(
    async (action) => {
      if (!me) return null;
      try {
        if (action.type === 'acceptTrade' || action.type === 'declineTrade' || action.type === 'cancelTrade') myTradeActs.current.add(action.id);
        const { base, next } = await dispatch(getStore(), code, action, me.id, snapRef.current);
        const created = next.state.tx.filter((t) => t.seq > base.txCount);
        created.forEach((t) => mySeqs.current.add(t.seq));
        accept(next);
        return { created, state: next.state };
      } catch (e) {
        if (e instanceof RuleError) toast('Não deu', e.message);
        else toast('Não salvou', e instanceof Error ? e.message : 'Tente de novo.');
        // relê, porque o estado pode ter mudado
        getStore()
          .load(code)
          .then((s) => s && accept(s))
          .catch(() => {});
        return null;
      }
    },
    [me, code, accept, toast],
  );

  const banner = isLocalMode ? <LocalBanner /> : null;

  if (status === 'missing' || status === 'error')
    return (
      <>
        {banner}
        <main className="app home">
          <div className="card">
            <h2>{status === 'missing' ? `Sala ${code} não encontrada` : 'Sem conexão com o banco de dados'}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {status === 'missing'
                ? isLocalMode
                  ? 'No modo local de teste, a sala só existe neste navegador. Crie uma nova.'
                  : 'Confira o código com quem criou a sala.'
                : 'Verifique a internet e recarregue a página.'}
            </p>
            <Link className="btn primary block" href="/">
              Voltar ao início
            </Link>
          </div>
        </main>
      </>
    );

  if (!snap || !me)
    return (
      <>
        {banner}
        <main className="app home">
          <div className="card">
            <h2>Carregando a sala {code}…</h2>
            <p className="muted" style={{ margin: 0 }}>
              Conectando ao banco da partida.
            </p>
          </div>
        </main>
      </>
    );

  const st = snap.state;
  const member = findPlayer(st, me.id);

  if (!member && st.phase === 'lobby')
    return (
      <>
        {banner}
        <JoinForm
          code={code}
          initialName={me.name}
          full={st.players.length >= 6}
          onJoin={async (name) => {
            setMe(saveName(name));
            await run({ type: 'join', name });
          }}
        />
      </>
    );

  return (
    <>
      {banner}
      {st.phase === 'lobby' ? <Lobby state={st} me={me.id} run={run} /> : <Game state={st} me={me.id} run={run} pushed={pushed} onPushedClose={() => setPushed(null)} />}
    </>
  );
}

/** Pix que não vira aviso curto: automáticos (resumo da rodada), negociação e empréstimo (avisos e comprovantes próprios). */
const QUIET = new Set<Tx['kind']>(['dividend', 'indenizacao', 'rendimento', 'cdb', 'cdbmov', 'penhora', 'poupanca', 'loan', 'loanpay', 'financiamento', 'trade']);
/** Eventos da mesa que ainda viram aviso para todos: falência, vencedor, desfazer e volta ao lobby. */
const TOAST_FEED = /faliu e saiu do jogo|venceu a partida|desfez a última ação|voltou para o lobby/;

/** Título do aviso de um evento importante da mesa. */
function feedTitle(text: string): string {
  if (text.includes('venceu a partida')) return 'Fim de jogo';
  if (text.includes('faliu')) return 'Falência';
  return 'Na mesa';
}

function JoinForm({ code, initialName, full, onJoin }: { code: string; initialName: string; full: boolean; onJoin: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  return (
    <main className="app home">
      <div className="card">
        <span className="label">Sala</span>
        <span className="code">{code}</span>
        {full ? (
          <div className="banner warn">A sala já tem 6 jogadores.</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="jn">Seu nome</label>
              <input id="jn" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Como te chamam na mesa" />
            </div>
            <button
              className="btn primary block"
              disabled={busy || !name.trim()}
              onClick={async () => {
                setBusy(true);
                await onJoin(name.trim());
                setBusy(false);
              }}
            >
              Entrar na sala
            </button>
          </>
        )}
        <Link href="/" className="btn block">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
