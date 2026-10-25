import { useEffect, useState } from 'react';

// Sunday is 0, Monday is 1. The restaurant is closed Mondays.
export const CLOSED_DAY = 1;
export const OPEN_MIN = 11 * 60 + 30;
export const CLOSE_MIN = 21 * 60;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Status = { open: boolean; soon: boolean; label: string; detail: string; today: number };

function detroitParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { day: Math.max(0, SHORT.indexOf(get('weekday'))), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function getStatus(date = new Date()): Status {
  const { day, minutes } = detroitParts(date);
  if (day !== CLOSED_DAY && minutes >= OPEN_MIN && minutes < CLOSE_MIN) {
    const soon = CLOSE_MIN - minutes <= 30;
    return { open: true, soon, label: soon ? 'Closing soon' : 'Open now', detail: 'until 9:00 pm', today: day };
  }
  if (day !== CLOSED_DAY && minutes < OPEN_MIN) return { open: false, soon: false, label: 'Closed', detail: 'opens today at 11:30 am', today: day };
  let next = (day + 1) % 7;
  if (next === CLOSED_DAY) next = (next + 1) % 7;
  const tomorrow = next === (day + 1) % 7;
  return { open: false, soon: false, label: 'Closed', detail: `opens ${tomorrow ? 'tomorrow' : DAY_NAMES[next]} at 11:30 am`, today: day };
}

export function useStatus() {
  const [status, setStatus] = useState<Status>(() => getStatus());
  useEffect(() => {
    const id = window.setInterval(() => setStatus(getStatus()), 30000);
    return () => window.clearInterval(id);
  }, []);
  return status;
}
