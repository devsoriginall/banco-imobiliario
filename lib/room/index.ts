import { LocalRoomStore } from './localStore';
import type { RoomStore } from './store';
import { SupabaseRoomStore } from './supabaseStore';

export type { RoomStore, RoomSnapshot } from './store';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sem as variáveis do Supabase, o app roda no modo local de teste (abas do mesmo navegador). */
export const isLocalMode = !URL || !KEY;

let store: RoomStore | null = null;
export function getStore(): RoomStore {
  if (!store) store = isLocalMode ? new LocalRoomStore() : new SupabaseRoomStore(URL!, KEY!);
  return store;
}
