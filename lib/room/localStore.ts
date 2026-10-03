// Modo local de teste: guarda a sala no localStorage e avisa as outras abas pelo BroadcastChannel.
// Serve para testar o jogo com várias abas do mesmo navegador, sem Supabase.
import type { GameState } from '@/lib/game/types';
import type { RoomSnapshot, RoomStore } from './store';

const key = (code: string) => `bi-room:${code}`;
const CHANNEL = 'banco-imobiliario-rooms';

export class LocalRoomStore implements RoomStore {
  readonly mode = 'local' as const;
  private channel: BroadcastChannel | null = null;
  private listeners = new Map<string, Set<(snap: RoomSnapshot) => void>>();

  constructor() {
    if (typeof window === 'undefined') return;
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e: MessageEvent<{ code: string }>) => this.emit(e.data.code);
    }
    // Reserva: o evento storage também chega às outras abas
    window.addEventListener('storage', (e) => {
      if (e.key?.startsWith('bi-room:')) this.emit(e.key.slice('bi-room:'.length));
    });
  }

  private read(code: string): RoomSnapshot | null {
    try {
      const raw = localStorage.getItem(key(code));
      return raw ? (JSON.parse(raw) as RoomSnapshot) : null;
    } catch {
      return null;
    }
  }

  private write(code: string, snap: RoomSnapshot) {
    localStorage.setItem(key(code), JSON.stringify(snap));
    this.channel?.postMessage({ code });
    // avisa também esta mesma aba (o BroadcastChannel não entrega ao próprio remetente)
    queueMicrotask(() => this.emit(code));
  }

  private emit(code: string) {
    const snap = this.read(code);
    if (!snap) return;
    this.listeners.get(code)?.forEach((fn) => fn(snap));
  }

  async create(code: string, state: GameState) {
    if (this.read(code)) return false;
    this.write(code, { state, version: 1 });
    return true;
  }

  async load(code: string) {
    return this.read(code);
  }

  async update(code: string, expected: number, state: GameState) {
    const cur = this.read(code);
    if (!cur || cur.version !== expected) return null;
    const version = expected + 1;
    this.write(code, { state, version });
    return version;
  }

  subscribe(code: string, onChange: (snap: RoomSnapshot) => void) {
    let set = this.listeners.get(code);
    if (!set) this.listeners.set(code, (set = new Set()));
    set.add(onChange);
    return () => {
      set!.delete(onChange);
    };
  }
}
