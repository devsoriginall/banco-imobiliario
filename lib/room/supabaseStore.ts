// Sala no Supabase: uma linha por sala na tabela `rooms`, sincronizada pelo Realtime.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '@/lib/game/types';
import type { RoomSnapshot, RoomStore } from './store';

interface RoomRow {
  code: string;
  state: GameState;
  version: number;
}

export class SupabaseRoomStore implements RoomStore {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: false } });
  }

  async create(code: string, state: GameState) {
    const { error } = await this.sb.from('rooms').insert({ code, state, version: 1 });
    if (!error) return true;
    if (error.code === '23505') return false; // código já existe
    throw new Error(error.message);
  }

  async load(code: string) {
    const { data, error } = await this.sb.from('rooms').select('code,state,version').eq('code', code).maybeSingle<RoomRow>();
    if (error) throw new Error(error.message);
    return data ? { state: data.state, version: data.version } : null;
  }

  async update(code: string, expected: number, state: GameState) {
    const version = expected + 1;
    const { data, error } = await this.sb
      .from('rooms')
      .update({ state, version, updated_at: new Date().toISOString() })
      .eq('code', code)
      .eq('version', expected)
      .select('version');
    if (error) throw new Error(error.message);
    return data && data.length ? version : null;
  }

  subscribe(code: string, onChange: (snap: RoomSnapshot) => void) {
    const channel = this.sb
      .channel(`room:${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (payload) => {
        const row = payload.new as Partial<RoomRow>;
        if (row && row.state && typeof row.version === 'number') onChange({ state: row.state, version: row.version });
      })
      .subscribe((status) => {
        // ao (re)conectar, relê a linha para não perder nada que mudou enquanto estava desconectado
        if (status === 'SUBSCRIBED') this.load(code).then((s) => s && onChange(s)).catch(() => {});
      });
    return () => {
      this.sb.removeChannel(channel);
    };
  }
}
