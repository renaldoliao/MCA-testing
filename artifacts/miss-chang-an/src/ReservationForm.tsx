import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import { customerRequest } from './lib/service';
import { isValidPhone } from './orderHelpers';
import { describeTime, openDays, slotsFor } from './lib/restaurantTime';
import { CLOSE_MIN, OPEN_MIN } from './lib/hours';

// Table booking request. It goes to the owner dashboard, the owner confirms or declines,
// and the guest sees the answer here.
type Booking = { id: string; name: string; party: number; at: string; status: string; notes: string };
const STATUS: Record<string, string> = { new: 'Waiting for the restaurant to confirm', confirmed: 'Confirmed. See you then!', declined: 'Not available. Please call us to find another time.', seated: 'Seated. Enjoy your meal!', cancelled: 'Cancelled' };
const HAS_BOOKING = 'mca-has-booking';

export default function ReservationForm() {
  const days = useMemo(() => openDays(21), []);
  const [day, setDay] = useState(days[0]?.value ?? '');
  const [time, setTime] = useState('');
  const [party, setParty] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const selected = days.find(d => d.value === day) ?? days[0];
  const times = useMemo(() => selected ? slotsFor(selected, OPEN_MIN, CLOSE_MIN - 30, 30, 60) : [], [selected]);
  useEffect(() => { if (!times.some(t => t.value === time)) setTime(times[0]?.value ?? ''); }, [times, time]);
  useEffect(() => { if (selected && !times.length && days.length > 1 && selected === days[0]) setDay(days[1].value); }, [selected, times, days]);

  // Only guests who have booked before ask the server for their bookings.
  useEffect(() => {
    let hasBooked = false;
    try { hasBooked = localStorage.getItem(HAS_BOOKING) === '1'; } catch { /* ignore */ }
    if (!hasBooked) return;
    let active = true;
    const refresh = () => customerRequest<Booking[]>('/reservations').then(rows => { if (active) setBookings(rows); }).catch(() => undefined);
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [bookings.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!name.trim()) { setError('Enter your name.'); return; }
    if (!phone.trim() || !isValidPhone(phone)) { setError('Enter a 10 digit phone number so we can confirm.'); return; }
    if (!time) { setError('Choose a time.'); return; }
    setSending(true);
    try {
      const saved = await customerRequest<Booking>('/reservations', { requestId, name: name.trim(), phone: phone.trim(), party, at: time, notes: notes.trim() });
      try { localStorage.setItem(HAS_BOOKING, '1'); } catch { /* ignore */ }
      setBookings(current => [saved, ...current.filter(b => b.id !== saved.id)]);
      setRequestId(crypto.randomUUID()); setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not sent. Please try again or call us.');
    } finally { setSending(false); }
  }

  const upcoming = bookings.filter(b => new Date(b.at).getTime() > Date.now() - 3 * 3600000);
  return <div className="res-wrap">
    {upcoming.length > 0 && <ul className="res-mine" aria-live="polite" data-testid="reservation-status">
      {upcoming.map(b => <li key={b.id} className={`res-${b.status}`}>
        <strong>{describeTime(b.at)} · {b.party} {b.party === 1 ? 'guest' : 'guests'}</strong>
        <span>{b.status === 'confirmed' && <Check size={14} aria-hidden="true" />} {STATUS[b.status] ?? b.status}</span>
      </li>)}
    </ul>}
    <form className="res-form" onSubmit={submit} noValidate data-testid="reservation-form">
      <label className="res-field"><span>Day</span>
        <select value={day} onChange={e => setDay(e.target.value)} data-testid="res-day">{days.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
      <label className="res-field"><span>Time</span>
        <select value={time} onChange={e => setTime(e.target.value)} data-testid="res-time">{times.length ? times.map(t => <option key={t.value} value={t.value}>{t.label}</option>) : <option value="">No more times today</option>}</select></label>
      <label className="res-field"><span>Guests</span>
        <select value={party} onChange={e => setParty(+e.target.value)} data-testid="res-party">{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="res-field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} maxLength={80} autoComplete="name" data-testid="res-name" /></label>
      <label className="res-field"><span>Phone</span><input value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={25} autoComplete="tel" data-testid="res-phone" /></label>
      <label className="res-field res-wide"><span>Notes <em>(optional)</em></span><input value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="High chair, birthday, window seat…" data-testid="res-notes" /></label>
      {error && <p className="res-error" role="alert">{error}</p>}
      <button type="submit" className="button button-light reservation-cta res-wide" disabled={sending} data-testid="res-submit"><CalendarDays size={17} aria-hidden="true" />{sending ? 'Sending…' : 'Request a table'}</button>
    </form>
  </div>;
}
