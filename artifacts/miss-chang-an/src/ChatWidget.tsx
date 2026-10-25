import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import type { Category } from './types/menu';
import { useStatus } from './lib/hours';
import { customerRequest, type ChatMessage } from './lib/service';

type Msg = { from: 'bot' | 'me'; body: ReactNode; id: number };
type Props = { categories: Category[]; phone: string; instagram: string; mapUrl: string; address: string };

const CHIPS = ['Are you open?', "What's spicy?", 'First time here', 'Order pickup', 'Allergies', 'Talk to a person'];
const MEAT = /pork|lamb|beef|chicken|shrimp|meat|fish|bacon|sausage|duck|rib/i;
const STOP = new Set(['the', 'and', 'you', 'have', 'any', 'do', 'does', 'what', 'with', 'for', 'your', 'got', 'can', 'get', 'want', 'how', 'much', 'are', 'there', 'some', 'please', 'menu', 'dish', 'dishes', 'food', 'about']);

export default function ChatWidget({ categories, phone, instagram, mapUrl, address }: Props) {
  const status = useStatus();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'staff' | 'helper'>('staff');
  const [staffMessages, setStaffMessages] = useState<ChatMessage[]>([]);
  const [staffError, setStaffError] = useState('');
  const [staffStatus, setStaffStatus] = useState('Connecting to private review chat…');
  const pending = useRef<{ requestId: string; body: string } | null>(null);
  const sendingLock = useRef(false);
  const idRef = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'bot', body: <>Hi, I'm the Miss Chang An helper. Ask about hours, what's good, spice, or how to order.</> }]);

  const items = useMemo(() => categories.flatMap(c => c.items.map(i => ({ ...i, cat: c.title }))).filter(i => !i.soldOut), [categories]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => {
    if (!open || mode !== 'staff') return;
    let active = true;
    const refresh = () => customerRequest<ChatMessage[]>('/messages').then(rows => {
      if (!active) return;
      setStaffMessages(rows);
      setStaffStatus('Private review chat · updates automatically');
    }).catch(() => { if (active) setStaffStatus('Disconnected. Reconnecting automatically; unsent text is not saved yet.'); });
    try {
      const draft = JSON.parse(sessionStorage.getItem('mca-pending-message') || 'null');
      if (draft?.body && draft?.requestId) { pending.current = draft; setText(draft.body); }
    } catch { /* Draft recovery is optional; shared history is server-side. */ }
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, mode]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [staffMessages.length]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); launcherRef.current?.focus({ preventScroll: true }); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const list = (rows: typeof items) => <ul className="chat-list">{rows.map(r => <li key={r.id ?? r.name}><span>{r.name}{r.spice ? ` (${r.spice})` : ''}</span><span>{r.price}</span></li>)}</ul>;
  const orderLinks = <p className="chat-links"><a href={`${import.meta.env.BASE_URL}order`} onClick={() => setOpen(false)}>Build a pickup order preview</a></p>;
  const callLinks = <p className="chat-links"><a href={phone}>Call (313) 825-7757</a><a href={instagram} target="_blank" rel="noopener noreferrer">Message on Instagram</a></p>;

  function answer(raw: string): ReactNode {
    const t = raw.toLowerCase();
    const has = (re: RegExp) => re.test(t);
    if (has(/\b(hi|hello|hey|yo)\b/) && t.length < 14) return <>Hi. What would you like to know?</>;
    if (has(/person|human|owner|staff|someone|talk|speak|call|phone|contact|number|text|dm|instagram/)) return <>This chat is a quick helper and does not reach the kitchen. For a real person, call or send an Instagram message.{callLinks}</>;
    if (has(/open|close|hour|when|today|tonight|late|monday|sunday|saturday/)) return <><b>{status.label}</b> {status.detail}. We are open Tuesday to Sunday, 11:30 am to 9:00 pm, and closed Mondays.</>;
    if (has(/where|address|direction|park|locat|find you|located/)) return <>{address}, on Rochester Road in Troy.<p className="chat-links"><a href={mapUrl} target="_blank" rel="noopener noreferrer">Get directions</a></p></>;
    if (has(/allerg|gluten|peanut|nut\b|nuts|shellfish|celiac|sesame|soy\b/)) return <>The kitchen uses wheat, soy, sesame, peanuts, egg and shellfish, so we cannot promise any dish is free of them. Tell us when you order, or call before you come.{callLinks}</>;
    if (has(/deliver|doordash|uber|grubhub/)) return <>This prototype is for pickup. Please call us to ask about delivery.{callLinks}</>;
    if (has(/order|pickup|pick up|takeout|take out|take-out|to go|checkout|pay/)) return <>You can build a pickup order preview on our site. It is not submitted to the restaurant yet.{orderLinks}</>;
    if (has(/dumpling|xiao long|soup bun|how long|wait|ready|time/)) return <>Soup dumplings and noodles are made when you order. Allow 10 to 15 minutes for dumplings, a little less for most noodles.</>;
    if (has(/vegetarian|vegan|no meat|meatless/)) {
      const rows = items.filter(i => !MEAT.test(`${i.name} ${i.description ?? ''}`) && !/drink/i.test(i.cat)).slice(0, 6);
      return rows.length ? <>These read as meat-free on the menu, but broths and sauces can vary, so confirm with us when you order.{list(rows)}{callLinks}</> : <>Please call and we will walk you through what works.{callLinks}</>;
    }
    if (has(/spic|hot|heat|chili|chilli|mala/)) {
      const rows = items.filter(i => i.spice).sort((a, b) => (b.spice ?? '').localeCompare(a.spice ?? '')).slice(0, 6);
      return <>SP means spicy, and SP2 to SP5 is the level out of 5. Here is what carries heat:{list(rows)}</>;
    }
    if (has(/first|new here|recommend|popular|best|good|favou?rite|suggest|try/)) {
      const names = ['Chili oil-splashed noodles', 'Cumin lamb roujiamo', 'Soup dumplings, 6'];
      const rows = names.map(n => items.find(i => i.name === n)).filter((x): x is NonNullable<typeof x> => !!x);
      return <>Start with the noodles, a roujiamo and soup dumplings. Those are what people come back for.{list(rows)}</>;
    }
    if (has(/boba|drink|tea|milk|smoothie|coffee/)) {
      const rows = items.filter(i => /drink/i.test(i.cat)).slice(0, 7);
      return <>Boba stayed when we became Miss Chang An. A few from the drinks list:{list(rows)}</>;
    }
    if (has(/cheap|price|cost|budget|under|\$/)) {
      const rows = items.map(i => ({ i, p: parseFloat(i.price.replace(/[^0-9.]/g, '')) })).filter(x => !isNaN(x.p) && !/drink/i.test(x.i.cat)).sort((a, b) => a.p - b.p).slice(0, 5).map(x => x.i);
      return <>The lowest starting prices on the food menu:{list(rows)}</>;
    }
    const words = t.replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
    const hits = words.length ? items.filter(i => words.some(w => `${i.name} ${i.description ?? ''}`.toLowerCase().includes(w.replace(/s$/, '')))).slice(0, 5) : [];
    if (hits.length) return <>Closest matches on the menu:{list(hits)}{orderLinks}</>;
    return <>I did not catch that. I can help with hours, spice, what to order first, allergies and pickup. For anything else, call or message us.{callLinks}</>;
  }

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || busy || sendingLock.current) return;
    if (mode === 'staff') {
      sendingLock.current = true;
      setBusy(true); setStaffError('');
      const input = pending.current?.body === q ? pending.current : { requestId: crypto.randomUUID(), body: q };
      pending.current = input;
      try {
        sessionStorage.setItem('mca-pending-message', JSON.stringify(input));
        const saved = await customerRequest<ChatMessage>('/messages', input);
        setStaffMessages(current => [...current.filter(message => message.id !== saved.id), saved]);
        setText(''); pending.current = null;
        try { sessionStorage.removeItem('mca-pending-message'); } catch { /* The server already confirmed durability. */ }
        setStaffStatus('Message saved to shared review inbox. Waiting for staff.');
      } catch (error) {
        setStaffError(error instanceof Error ? error.message : 'Not saved. Retry this message.');
        setText(q);
      } finally { sendingLock.current = false; setBusy(false); }
      return;
    }
    const me: Msg = { id: idRef.current++, from: 'me', body: q };
    setMsgs(m => [...m, me]);
    setText('');
    setBusy(true);
    const reply = answer(q);
    window.setTimeout(() => { setMsgs(m => [...m, { id: idRef.current++, from: 'bot', body: reply }]); setBusy(false); }, 550);
  }
  function submit(e: FormEvent) { e.preventDefault(); send(text); }

  return <>
    <button ref={launcherRef} type="button" className={`chat-launch ${open ? 'hide' : ''}`} onClick={() => setOpen(true)} aria-label="Open chat" aria-expanded={open} data-testid="chat-open"><MessageCircle size={22} aria-hidden="true" /><span>Ask us</span></button>
    {open && <section className="chat" role="dialog" aria-label="Chat with Miss Chang An helper" data-testid="chat-panel">
      <header className="chat-head"><div><strong>Miss Chang An <span className="zh" aria-hidden="true">念长安</span></strong><span className={`chat-status ${status.open ? 'on' : ''}`}>{status.open ? 'Open now' : 'Closed right now'}</span></div><button type="button" onClick={() => { setOpen(false); launcherRef.current?.focus({ preventScroll: true }); }} aria-label="Close chat"><X size={20} aria-hidden="true" /></button></header>
      <div className="chat-chips" role="group" aria-label="Chat mode"><button type="button" aria-pressed={mode === 'staff'} disabled={busy} onClick={() => setMode('staff')}>Message staff</button><button type="button" aria-pressed={mode === 'helper'} disabled={busy} onClick={() => setMode('helper')}>Quick helper</button></div>
      <div className="chat-log" ref={logRef} role="log" aria-live="polite">
        {mode === 'helper' ? msgs.map(m => <div key={m.id} className={`chat-msg ${m.from}`}>{m.body}</div>) : <>
          {staffMessages.length === 0 && <div className="chat-msg bot">Leave a private message for staff to review. This is a review system, not a restaurant order channel.</div>}
          {staffMessages.map(m => <div key={m.id} data-testid={`chat-message-${m.role}`} className={`chat-msg ${m.role === 'customer' ? 'me' : 'bot'}`}><small>{m.role === 'staff' ? 'Staff' : 'You'} · Saved</small><p>{m.body}</p></div>)}
        </>}
        {busy && <div className="chat-msg bot" role="status">{mode === 'staff' ? 'Sending…' : 'Thinking…'}</div>}
      </div>
      {mode === 'helper' && <div className="chat-chips">{CHIPS.map(c => <button key={c} type="button" onClick={() => send(c)}>{c}</button>)}</div>}
      {mode === 'staff' && staffError && <p className="chat-fine" role="alert">Not confirmed: {staffError} Your text is retained; send again to retry.</p>}
      <form className="chat-form" onSubmit={submit}><input ref={inputRef} value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'staff' ? 'Message staff privately' : 'Ask about the menu, hours, spice'} aria-label="Your message" maxLength={mode === 'staff' ? 2000 : 200} disabled={busy} data-testid="chat-input" /><button type="submit" aria-label="Send" disabled={!text.trim() || busy}><Send size={18} aria-hidden="true" /></button></form>
      <p className="chat-fine" role="status">{mode === 'staff' ? staffStatus : 'Automated helper. These helper messages are not sent to staff.'}</p>
    </section>}
  </>;
}
