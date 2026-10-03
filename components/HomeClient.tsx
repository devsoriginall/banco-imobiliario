'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { newRoom, RuleError } from '@/lib/game/rules';
import { getStore, isLocalMode } from '@/lib/room';
import { getIdentity, normalizeCode, randomCode, saveName } from '@/lib/room/identity';
import { dispatch } from '@/lib/room/sync';
import { Icon } from './Icon';
import { LocalBanner } from './ui';

export function HomeClient() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // lê o nome salvo no aparelho depois de montar (localStorage não existe no servidor)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getIdentity().name);
  }, []);

  async function create() {
    const n = name.trim();
    if (!n) return setError('Digite seu nome para criar a sala.');
    setBusy('create');
    setError('');
    try {
      const me = saveName(n);
      const store = getStore();
      for (let i = 0; i < 6; i++) {
        const c = randomCode();
        if (await store.create(c, newRoom(c, { id: me.id, name: n }))) return router.push(`/sala/${c}`);
      }
      setError('Não conseguimos gerar um código livre. Tente de novo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a sala.');
    }
    setBusy(null);
  }

  async function join() {
    const n = name.trim();
    const c = normalizeCode(code);
    if (c.length !== 5) return setError('O código da sala tem 5 letras ou números.');
    if (!n) return setError('Digite seu nome para entrar.');
    setBusy('join');
    setError('');
    try {
      const me = saveName(n);
      const store = getStore();
      const snap = await store.load(c);
      if (!snap) throw new RuleError(`Não achamos a sala ${c}. Confira o código.`);
      const already = snap.state.players.some((p) => p.id === me.id);
      if (!already && snap.state.phase === 'lobby') await dispatch(store, c, { type: 'join', name: n }, me.id, snap);
      return router.push(`/sala/${c}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
    }
    setBusy(null);
  }

  return (
    <>
      {isLocalMode && <LocalBanner />}
      <main className="app home">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="bank" size={24} />
          </span>
          <div>
            <h1>Banco Imobiliário</h1>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              O banco da partida no celular de cada um. Dados e tabuleiro continuam na mesa.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label htmlFor="name">Seu nome</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como te chamam na mesa" maxLength={16} autoComplete="nickname" />
          </div>
        </div>

        <div className="card">
          <h2>Criar sala</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Você recebe um código de 5 letras e um link para mandar no grupo.
          </p>
          <button className="btn primary block" onClick={create} disabled={!!busy}>
            {busy === 'create' ? 'Criando…' : 'Criar sala'}
          </button>
        </div>

        <div className="card">
          <h2>Entrar na sala</h2>
          <div className="field">
            <label htmlFor="code">Código da sala</label>
            <input
              id="code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABCDE"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
          </div>
          <button className="btn dark block" onClick={join} disabled={!!busy}>
            {busy === 'join' ? 'Entrando…' : 'Entrar na sala'}
          </button>
        </div>

        {error && (
          <div className="banner bad" role="alert">
            {error}
          </div>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Sem cadastro: seu aparelho guarda um código de jogador e o seu nome. Dinheiro do jogo, sem Pix real.
        </p>
      </main>
    </>
  );
}
