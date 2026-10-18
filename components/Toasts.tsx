'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  title: string;
  text: string;
  /** quando apareceu na tela (0 = ainda na fila) */
  shown: number;
}

/** Cada aviso fica pelo menos TTL na tela; no máximo MAX ao mesmo tempo, os outros esperam na fila (nenhum se perde). */
const TTL = 4500;
const MAX = 2;

/** Tira da tela os que já ficaram TTL (com o app visível) e sobe os próximos da fila. */
function settle(xs: ToastItem[], now: number): ToastItem[] {
  const kept = xs.filter((x) => !x.shown || now - x.shown < TTL);
  let free = MAX - kept.filter((x) => x.shown).length;
  return kept.map((x) => (!x.shown && free-- > 0 ? { ...x, shown: now } : x));
}

const Ctx = createContext<(title: string, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function Toasts({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const n = useRef(0);
  const toast = useCallback((title: string, text: string) => {
    const id = ++n.current;
    setItems((xs) => settle([...xs, { id, title, text, shown: 0 }], Date.now()));
  }, []);
  // o próximo a sair marca a hora de arrumar a fila; com o app em segundo plano o relógio do aviso para
  useEffect(() => {
    const shown = items.filter((x) => x.shown);
    if (!shown.length) return;
    const wait = Math.max(50, Math.min(...shown.map((x) => x.shown + TTL)) - Date.now());
    const t = setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      setItems((xs) => settle(xs, Date.now()));
    }, wait);
    return () => clearTimeout(t);
  }, [items]);
  useEffect(() => {
    // de volta ao app: quem estava na tela recomeça a contar, para ninguém sumir sem ser visto
    const onVis = () => document.visibilityState === 'visible' && setItems((xs) => xs.map((x) => (x.shown ? { ...x, shown: Date.now() } : x)));
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const visible = items.filter((x) => x.shown);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {visible.map((t) => (
          <div className="toast" key={t.id} role="status">
            <div className="ic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l9 9-9 9-9-9z" />
                <path d="M12 8l4 4-4 4-4-4z" />
              </svg>
            </div>
            <div>
              <b>{t.title}</b>
              <span>{t.text}</span>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
