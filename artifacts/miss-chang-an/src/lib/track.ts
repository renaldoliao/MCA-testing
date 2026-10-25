// Counts website visits for the owner dashboard's Website tab. No personal data is sent.
type Kind = 'view' | 'order' | 'call';

export function track(kind: Kind, once?: string) {
  try {
    if (once) {
      const key = `mca-tracked:${kind}:${once}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    }
  } catch { /* private mode: count anyway */ }
  void fetch(`${import.meta.env.BASE_URL}api/visit`, {
    method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-MCA-Client': '1' }, body: JSON.stringify({ kind }),
  }).catch(() => undefined);
}

// Count taps on any phone number link.
export function trackCallTaps() {
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.('a[href^="tel:"]');
    if (link) track('call');
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
