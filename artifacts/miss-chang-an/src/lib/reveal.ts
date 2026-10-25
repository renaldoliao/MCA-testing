import { useEffect } from 'react';

// Adds .in to every .reveal element as it scrolls into view. Elements stay visible if JS or IntersectionObserver is unavailable.
export function useReveal(key: string) {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (!items.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('in')); return; }
    document.documentElement.classList.add('reveal-on');
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [key]);
}
