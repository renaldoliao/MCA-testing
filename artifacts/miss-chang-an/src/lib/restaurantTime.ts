// Times at the restaurant (Troy, Michigan), whatever time zone the customer is in.
// Open Tuesday to Sunday, 11:30 am to 9 pm. Closed Mondays.
import { CLOSED_DAY, CLOSE_MIN, OPEN_MIN } from './hours';

const TZ = 'America/Detroit';
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type DayInfo = { y: number; m: number; d: number; day: number; minutes: number };

export function restaurantNow(date = new Date()): DayInfo {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '0';
  return { y: +get('year'), m: +get('month'), d: +get('day'), day: SHORT.indexOf(get('weekday')), minutes: +get('hour') * 60 + +get('minute') };
}

// A wall-clock time at the restaurant, as a real moment in time.
export function restaurantTime(y: number, m: number, d: number, minutes: number): Date {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const seen = restaurantNow(new Date(guess));
  const offset = Date.UTC(seen.y, seen.m - 1, seen.d, 0, seen.minutes) - guess;
  return new Date(guess - offset);
}

export const clockLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60), mm = String(minutes % 60).padStart(2, '0');
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
};

function addDays(info: DayInfo, n: number) {
  const date = new Date(Date.UTC(info.y, info.m - 1, info.d + n));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), day: date.getUTCDay() };
}

export type OpenDay = { y: number; m: number; d: number; day: number; value: string; label: string; offset: number };
// The next open days, starting today.
export function openDays(count: number, now = new Date()): OpenDay[] {
  const today = restaurantNow(now), out: OpenDay[] = [];
  for (let i = 0; out.length < count && i < count + 10; i++) {
    const x = addDays(today, i);
    if (x.day === CLOSED_DAY) continue;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${SHORT[x.day]}, ${MONTHS[x.m - 1]} ${x.d}`;
    out.push({ ...x, value: `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`, label, offset: i });
  }
  return out;
}

export type Slot = { value: string; label: string };
// Times on one open day, every `step` minutes, from `first` to `last`, skipping times that have passed.
export function slotsFor(day: OpenDay, first: number, last: number, step: number, leadMinutes: number, now = new Date()): Slot[] {
  const today = restaurantNow(now), out: Slot[] = [];
  const earliest = day.offset === 0 ? today.minutes + leadMinutes : 0;
  for (let t = first; t <= last; t += step) {
    if (t < earliest) continue;
    out.push({ value: restaurantTime(day.y, day.m, day.d, t).toISOString(), label: clockLabel(t) });
  }
  return out;
}

export type PickupOption = { value: string; label: string };
// "As soon as possible" while open, then 15 minute slots for the rest of today, or the next open day.
export function pickupOptions(now = new Date()): PickupOption[] {
  const today = restaurantNow(now);
  const open = today.day !== CLOSED_DAY && today.minutes >= OPEN_MIN && today.minutes < CLOSE_MIN - 20;
  const out: PickupOption[] = open ? [{ value: 'asap', label: 'As soon as possible (about 20 min)' }] : [];
  for (const day of openDays(2, now)) {
    const slots = slotsFor(day, OPEN_MIN + 15, CLOSE_MIN - 15, 15, 30, now);
    if (!slots.length) continue;
    slots.forEach(slot => out.push({ value: slot.value, label: day.offset === 0 ? `Today, ${slot.label}` : `${day.label}, ${slot.label}` }));
    if (out.length > 4) break;
  }
  return out;
}

// "Today, 7:15 pm" style label for a saved time.
export function describeTime(iso: string, now = new Date()): string {
  const at = restaurantNow(new Date(iso)), today = restaurantNow(now);
  const days = Math.round((Date.UTC(at.y, at.m - 1, at.d) - Date.UTC(today.y, today.m - 1, today.d)) / 86400000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${SHORT[at.day]}, ${MONTHS[at.m - 1]} ${at.d}`;
  return `${day}, ${clockLabel(at.minutes)}`;
}
