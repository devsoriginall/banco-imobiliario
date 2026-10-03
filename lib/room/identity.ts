// Sem contas: cada aparelho guarda um id aleatório e o nome do jogador.
// No modo local de teste cada aba é um "celular", então o id fica no sessionStorage (por aba).
import { isLocalMode } from './index';

export interface Identity {
  id: string;
  name: string;
}

const KEY = 'bi-player';

function storage(): Storage | null {
  try {
    return isLocalMode ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function getIdentity(): Identity {
  const s = storage();
  try {
    const raw = s?.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Identity;
      if (v.id) return v;
    }
  } catch {}
  // nome lembrado entre abas, para pré-preencher
  let name = '';
  try {
    name = localStorage.getItem('bi-name') || '';
  } catch {}
  const id = randomId();
  const v = { id, name };
  try {
    s?.setItem(KEY, JSON.stringify(v));
  } catch {}
  return v;
}

export function saveName(name: string): Identity {
  const v = { ...getIdentity(), name };
  try {
    storage()?.setItem(KEY, JSON.stringify(v));
    localStorage.setItem('bi-name', name);
  } catch {}
  return v;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I
export function randomCode(): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c;
}

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
