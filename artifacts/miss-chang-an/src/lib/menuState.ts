import { useEffect, useMemo, useState } from 'react';
import type { Category } from '../types/menu';

// The owner dashboard (/dashboard) saves menu changes (sold out dishes, new dishes) to the shared
// database. The website reads them from /api/menu-state, so every customer sees the same menu.
// The browser key is kept as a fallback for previews that have no server.
export const MENU_STATE_KEY = 'mca-menu-state';

type Added = { id: string; name: string; chinese?: string; price: number; cat: string; description?: string };
type State = { off: string[]; added: Added[] };

function readLocal(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(MENU_STATE_KEY) || '{}');
    return { off: Array.isArray(raw.off) ? raw.off : [], added: Array.isArray(raw.added) ? raw.added : [] };
  } catch {
    return { off: [], added: [] };
  }
}

// One shared copy for the whole page, refreshed from the server.
let current: State | null = null;
let fromServer = false;
const listeners = new Set<(state: State) => void>();
let loading: Promise<void> | null = null;
function publish(state: State) { current = state; listeners.forEach(listener => listener(state)); }
function fetchServer(): Promise<void> {
  if (loading) return loading;
  loading = fetch(`${import.meta.env.BASE_URL}api/menu-state`, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('no server');
      const raw = await response.json();
      fromServer = true;
      publish({ off: Array.isArray(raw.off) ? raw.off : [], added: Array.isArray(raw.added) ? raw.added : [] });
    })
    .catch(() => { if (!fromServer) publish(readLocal()); })
    .finally(() => { loading = null; });
  return loading;
}

export function useLiveMenu(base: Category[]): Category[] {
  const [state, setState] = useState<State>(() => current ?? readLocal());
  useEffect(() => {
    listeners.add(setState);
    void fetchServer();
    const sync = () => { if (!document.hidden) void fetchServer(); };
    const local = () => { if (!fromServer) publish(readLocal()); };
    const timer = window.setInterval(sync, 30000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('storage', local);
    return () => {
      listeners.delete(setState);
      window.clearInterval(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('storage', local);
    };
  }, []);
  return useMemo(() => base.map(cat => ({
    ...cat,
    items: [
      ...cat.items.map(item => ({ ...item, soldOut: !!item.id && state.off.includes(item.id) })),
      ...state.added.filter(a => a.cat === cat.id).map(a => ({
        id: a.id, name: a.name, chinese: a.chinese || undefined, description: a.description || undefined,
        price: `$${Number(a.price).toFixed(2)}`, soldOut: state.off.includes(a.id), isNew: true,
      })),
    ],
  })), [base, state]);
}
