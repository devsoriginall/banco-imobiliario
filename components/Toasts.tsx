'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  title: string;
  text: string;
  at: number;
}

const TTL = 4500;
// Em aba ou app em segundo plano os timers atrasam; por isso também limpamos pela idade.
const fresh = (xs: ToastItem[]) => xs.filter((x) => Date.now() - x.at < TTL);

const Ctx = createContext<(title: string, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function Toasts({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const n = useRef(0);
  const toast = useCallback((title: string, text: string) => {
    const id = ++n.current;
    setItems((xs) => [...fresh(xs).slice(-3), { id, title, text, at: Date.now() }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), TTL);
  }, []);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && setItems(fresh);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
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
