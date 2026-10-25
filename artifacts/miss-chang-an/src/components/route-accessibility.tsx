import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'wouter';

export function RouteAccessibility() {
  const [location] = useLocation();
  const previousLocation = useRef(location);

  useLayoutEffect(() => {
    const hash = window.location.hash.slice(1);
    let anchor: HTMLElement | null = null;
    if (hash) {
      try {
        anchor = document.getElementById(decodeURIComponent(hash));
      } catch {
        // A malformed fragment must not break navigation.
      }
    }
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (previousLocation.current !== location) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
    previousLocation.current = location;
  }, [location]);

  return null;
}