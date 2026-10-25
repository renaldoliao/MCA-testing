export const MAX_ITEM_QUANTITY = 20;

export function priceToCents(price: string): number {
  const m = price.match(/^(?:From\s+)?\$(\d+)(?:\.(\d{1,2}))?$/i);
  if (!m) throw new Error(`Menu item has an invalid price: ${price}`);
  const cents = parseInt(m[1], 10) * 100 + parseInt((m[2] ?? '0').padEnd(2, '0'), 10);
  if (!Number.isSafeInteger(cents)) throw new Error(`Menu item price is out of range: ${price}`);
  return cents;
}

export function formatCents(cents: number): string {
  const d = Math.floor(cents / 100);
  const c = String(cents % 100).padStart(2, '0');
  return `$${d}.${c}`;
}

export function isValidPhone(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (!/^[0-9+()\-.\s]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
}
