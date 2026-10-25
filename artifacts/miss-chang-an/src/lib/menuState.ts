import { useEffect, useMemo, useState } from 'react';
import type { Category } from '../types/menu';

// The owner dashboard (/dashboard) writes this key. Both pages live on the same origin, so a change
// made there shows up here straight away. In production this would be a database, not the browser.
export const MENU_STATE_KEY = 'mca-menu-state';

type Added = { id: string; name: string; chinese?: string; price: number; cat: string; description?: string };
type State = { off: string[]; added: Added[] };

function read(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(MENU_STATE_KEY) || '{}');
    return { off: Array.isArray(raw.off) ? raw.off : [], added: Array.isArray(raw.added) ? raw.added : [] };
  } catch {
    return { off: [], added: [] };
  }
}

export function useLiveMenu(base: Category[]): Category[] {
  const [state, setState] = useState<State>(read);
  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
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
