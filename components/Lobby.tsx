'use client';
import { useState } from 'react';
import { money } from '@/lib/game/format';
import { pname } from '@/lib/game/rules';
import type { GameState } from '@/lib/game/types';
import { Icon } from './Icon';
import type { Run } from './Room';
import { useToast } from './Toasts';
import { Avatar } from './ui';

export function Lobby({ state, me, run }: { state: GameState; me: string; run: Run }) {
  const toast = useToast();
  const isHost = state.hostId === me;
  const [start, setStart] = useState(String(state.settings.start));
  const [busy, setBusy] = useState(false);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/sala/${state.code}` : `/sala/${state.code}`;

  async function share() {
    const data = { title: 'Banco Imobiliário', text: `Entre na sala ${state.code} do Banco Imobiliário`, url: link };
    try {
      if (navigator.share) return await navigator.share(data);
    } catch {
      return;
    }
    copy();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado', 'Mande no grupo para a turma entrar.');
    } catch {
      toast('Não copiou', link);
    }
  }

  return (
    <main className="app home">
      <div className="top">
        <div>
          <h1>Sala de espera</h1>
          <div className="meta">Banco Imobiliário · até 6 jogadores</div>
        </div>
      </div>

      <div className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="label">Código da sala</span>
        <span className="code" data-testid="room-code">
          {state.code}
        </span>
        <span className="muted" style={{ fontSize: 13, wordBreak: 'break-all' }}>
          {link}
        </span>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn small" onClick={share}>
            <Icon name="share" size={18} />
            Compartilhar link
          </button>
          <button className="btn small" onClick={copy}>
            <Icon name="copy" size={18} />
            Copiar
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h2>Jogadores</h2>
          <span className="pill info">{state.players.length} de 6</span>
        </div>
        <div className="lobby-list" aria-live="polite">
          {state.players.map((p) => (
            <div className="lobby-p" key={p.id}>
              <Avatar name={p.name} color={p.color} />
              <span className="name">{p.name}</span>
              {p.id === state.hostId && <span className="pill ok">criou a sala</span>}
              {p.id === me && <span className="pill info">você</span>}
            </div>
          ))}
        </div>
        {state.players.length < 2 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Esperando pelo menos mais 1 jogador entrar.</p>}
      </div>

      {isHost ? (
        <div className="card">
          <div className="field">
            <label htmlFor="startbal">Saldo inicial de cada jogador</label>
            <input
              id="startbal"
              type="number"
              inputMode="numeric"
              min={1000}
              step={1000}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              onBlur={() => {
                const v = parseInt(start, 10);
                if (v && v !== state.settings.start) run({ type: 'setStart', amount: v });
              }}
            />
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={state.settings.mercado !== false} onChange={(e) => run({ type: 'setMercado', on: e.target.checked })} />
            <span>
              <b>Jornal e Bolsa</b>
              <span className="muted">Uma manchete por rodada mexe nos bairros, nas empresas e nos juros; as cotas têm cotação e pagam dividendos.</span>
            </span>
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Regras do Super Banco Imobiliário: pró-labore de {money(state.settings.salary)} no Início, fiança de {money(state.settings.bail)} e 20% de juros para tirar a hipoteca.
          </p>
          <button
            className="btn primary block"
            disabled={busy || state.players.length < 2}
            onClick={async () => {
              setBusy(true);
              const v = parseInt(start, 10);
              if (v && v !== state.settings.start) await run({ type: 'setStart', amount: v });
              await run({ type: 'start' });
              setBusy(false);
            }}
          >
            Começar partida
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="waiting">
            <span className="dot" />
            Esperando {pname(state, state.hostId)} começar a partida…
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Saldo inicial: {money(state.settings.start)} para cada jogador. Jornal e Bolsa: {state.settings.mercado === false ? 'desligados' : 'ligados'}.
          </p>
        </div>
      )}
    </main>
  );
}
