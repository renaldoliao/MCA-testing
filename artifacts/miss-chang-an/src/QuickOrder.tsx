import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import type { Category } from './types/menu';
import { formatCents, isValidPhone, MAX_ITEM_QUANTITY, priceToCents } from './orderHelpers';
import { customerRequest, type SubmittedOrder } from './lib/service';

const thumbs: Record<string, string> = {
  'Chili oil-splashed noodles': 'chili-oil-noodles.webp',
  'Cumin lamb roujiamo': 'cumin-lamb-roujiamo.webp',
  "Xi'an lamb bread soup": 'lamb-bread-soup.webp',
  'Soup dumplings, 6': 'soup-dumplings.webp',
};
const ADDRESS = '5071 Rochester Rd, Troy, MI 48085';
type Props = { categories: Category[] };
type Step = 'dishes' | 'details' | 'review';
type Line = { key: string; name: string; chinese?: string; cents: number; from: boolean; qty: number };

const stepOrder: Step[] = ['dishes', 'details', 'review'];
const stepCopy: Record<Step, string> = { dishes: 'Choose dishes', details: 'Pickup details', review: 'Review' };

export default function QuickOrder({ categories }: Props) {
  const [active, setActive] = useState(categories[0]?.id ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>('dishes');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<SubmittedOrder[]>([]);
  const [historyError, setHistoryError] = useState('');
  const confirmationLock = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const current = categories.find(category => category.id === active) ?? categories[0];
  const base = import.meta.env.BASE_URL;
  useEffect(() => {
    let active = true;
    const refresh = () => customerRequest<SubmittedOrder[]>('/orders').then(rows => {
      if (active) { setHistory(rows); setHistoryError(''); }
    }).catch(() => { if (active) setHistoryError('Unable to refresh saved submissions. Reconnecting automatically.'); });
    void refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const catalog = useMemo(() => {
    const map = new Map<string, Omit<Line, 'qty'>>();
    categories.forEach(category => category.items.forEach(item => {
      const key = item.id ?? item.name;
      try {
        map.set(key, {
          key,
          name: item.name,
          chinese: item.chinese,
          cents: priceToCents(item.price),
          from: /^from/i.test(item.price),
        });
      } catch {
        // Items with unparseable prices cannot be added to the price preview.
      }
    }));
    return map;
  }, [categories]);

  const lines = useMemo<Line[]>(() => Object.entries(qty).flatMap(([key, quantity]) => {
    const item = catalog.get(key);
    return item && quantity > 0 ? [{ ...item, qty: quantity }] : [];
  }), [catalog, qty]);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = lines.reduce((sum, line) => sum + line.cents * line.qty, 0);
  const anyFrom = lines.some(line => line.from);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const indicator = indicatorRef.current;
    if (!tabs || !indicator) return;
    const alignIndicator = () => {
      const selected = tabs.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (!selected) return;
      indicator.style.width = `${selected.offsetWidth}px`;
      indicator.style.setProperty('--qo-indicator-x', `${selected.offsetLeft}px`);
      indicator.style.setProperty('--qo-indicator-y', `${selected.offsetTop}px`);
      indicator.style.setProperty('--qo-indicator-h', `${selected.offsetHeight}px`);
    };
    alignIndicator();
    window.addEventListener('resize', alignIndicator);
    return () => window.removeEventListener('resize', alignIndicator);
  }, [active, categories]);

  function change(key: string, delta: number) {
    setQty(currentQty => {
      const next = Math.max(0, Math.min(MAX_ITEM_QUANTITY, (currentQty[key] ?? 0) + delta));
      const copy = { ...currentQty };
      if (next === 0) delete copy[key];
      else copy[key] = next;
      return copy;
    });
  }

  function reviewDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { name?: string; phone?: string } = {};
    if (!name.trim()) nextErrors.name = 'Enter a name for the pickup.';
    if (phoneNumber.trim() && !isValidPhone(phoneNumber)) nextErrors.phone = 'Enter a valid 10 digit phone number, or leave it blank.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.name) document.getElementById('qo-name')?.focus();
      else document.getElementById('qo-phone')?.focus();
      return;
    }
    setStep('review');
  }

  function restart() {
    confirmationLock.current = false;
    setQty({});
    setName('');
    setPhoneNumber('');
    setNotes('');
    setErrors({});
    setConfirmation(null);
    setSubmitError('');
    setStep('dishes');
  }

  async function confirmDemoOrder() {
    if (confirmationLock.current || confirmation || !lines.length || !name.trim()) return;
    confirmationLock.current = true;
    setSending(true);
    setSubmitError('');
    try {
      const payload = {
        name: name.trim(),
        phone: phoneNumber.trim(),
        notes: notes.trim(),
        items: lines.map(line => ({ id: line.key, quantity: line.qty })),
      };
      // Keep the same retry ID after a lost response or refresh. A changed
      // payload receives a new ID; the server also enforces this invariant.
      const fingerprint = JSON.stringify(payload);
      const prior = JSON.parse(sessionStorage.getItem('mca-pending-order') || 'null');
      const requestId = prior?.fingerprint === fingerprint ? prior.requestId : crypto.randomUUID();
      sessionStorage.setItem('mca-pending-order', JSON.stringify({ fingerprint, requestId }));
      const saved = await customerRequest<SubmittedOrder>('/orders', { requestId, ...payload });
      setConfirmation(saved.id);
      setHistory(current => [saved, ...current.filter(order => order.id !== saved.id)]);
      try { sessionStorage.removeItem('mca-pending-order'); } catch { /* The server already confirmed durability. */ }
    } catch (error) {
      confirmationLock.current = false;
      setSubmitError(error instanceof Error ? error.message : 'Not confirmed. Please retry safely.');
    } finally { setSending(false); }
  }

  const linesSummary = (className = 'qo-review-lines') => (
    <ul className={className}>
      {lines.map(line => (
        <li key={line.key}>
          <span>{line.qty} × {line.name}{line.chinese && <small lang="zh">{line.chinese}</small>}</span>
          <strong>{formatCents(line.cents * line.qty)}{line.from ? '+' : ''}</strong>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="qo" id="order-here" aria-labelledby="qo-heading">
      <div className="wrap">
        <div className="qo-head">
          <div><span className="eyebrow">Pickup order preview</span><h2 id="qo-heading">A simple way to order.</h2></div>
          <p>Choose your dishes, add pickup details, and review everything—all right here.</p>
        </div>
        {history.length > 0 && <details className="qo-stage-card" id="qo-saved-orders" data-testid="customer-order-history">
          <summary>Your saved review submissions ({history.length})</summary>
          {historyError && <p role="status">{historyError}</p>}
          <ul className="qo-review-lines">{history.map(order => <li key={order.id}><span>MCA-{order.id.slice(0, 8).toUpperCase()}<small>{new Date(order.createdAt).toLocaleString()} · {order.status}</small></span><strong>{formatCents(order.totalCents)}</strong></li>)}</ul>
        </details>}

        <ol className="qo-flow-steps" aria-label="Order steps">
          {stepOrder.map((item, index) => {
            const currentIndex = stepOrder.indexOf(step);
            const complete = index < currentIndex;
            return <li key={item} className={`${step === item ? 'current' : ''} ${complete ? 'complete' : ''}`}>
              <button type="button" disabled={index > currentIndex} aria-current={step === item ? 'step' : undefined}
                onClick={() => { if (index < currentIndex) setStep(item); }}>
                <span className="qo-step-number">{complete ? <Check size={15} aria-hidden="true" /> : index + 1}</span>
                <span>{stepCopy[item]}</span>
              </button>
            </li>;
          })}
        </ol>

        <div className="qo-flow">
          {step === 'dishes' && (
            <div key="dishes" className={`qo-flow-stage qo-layout ${count === 0 ? 'qo-layout-empty' : ''}`}>
              <div>
                <div className="qo-tabs" role="tablist" aria-label="Menu categories" ref={tabsRef}>
                  <span className="qo-tabs-indicator" aria-hidden="true" ref={indicatorRef} />
                  {categories.map(category => <button key={category.id} type="button" role="tab" id={`qo-tab-${category.id}`}
                    aria-selected={active === category.id} aria-controls="qo-panel" tabIndex={active === category.id ? 0 : -1}
                    className={active === category.id ? 'on' : ''} onClick={() => setActive(category.id)}
                    onKeyDown={event => {
                      const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
                      const index = tabs.indexOf(event.currentTarget);
                      const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                      if (!offset || tabs.length < 2) return;
                      event.preventDefault();
                      const next = tabs[(index + offset + tabs.length) % tabs.length];
                      next.focus();
                      next.click();
                    }}
                  >{category.title}</button>)}
                </div>
                <div key={current.id} id="qo-panel" className="qo-panel-content" role="tabpanel" aria-labelledby={`qo-tab-${current.id}`}>
                  <div className="qo-cat"><h3>{current.title}</h3><span className="brush zh" aria-hidden="true">{current.character}</span></div>
                  <ul className="qo-grid">
                    {current.items.map(item => {
                      const key = item.id ?? item.name;
                      const quantity = qty[key] ?? 0;
                      const photo = thumbs[item.name];
                      return <li className={`qo-card ${item.soldOut ? 'sold' : ''} ${quantity ? 'has' : ''}`} key={key}>
                        {photo && <img src={`${base}images/${photo}`} alt="" loading="lazy" decoding="async" />}
                        <div className="qo-body">
                          <h4>{item.name}{item.spice && <span className="spice">{item.spice}</span>}{item.isNew && <span className="new-tag">New</span>}</h4>
                          {item.chinese && <span className="qo-zh zh" lang="zh">{item.chinese}</span>}
                          {item.description && <p>{item.description}</p>}
                        </div>
                        <div className="qo-buy">
                          <span className="qo-price">{item.soldOut ? 'Sold out' : item.price}</span>
                          {item.soldOut ? null : quantity === 0
                            ? <button type="button" className="qo-add" aria-label={`Add ${item.name}`} onClick={() => change(key, 1)} data-testid={`qo-add-${key}`}><Plus size={18} aria-hidden="true" /></button>
                            : <span className="qo-step"><button type="button" aria-label={`Remove one ${item.name}`} onClick={() => change(key, -1)}><Minus size={15} aria-hidden="true" /></button><b className="qo-qty-count" key={quantity} aria-live="polite">{quantity}</b><button type="button" aria-label={`Add another ${item.name}`} onClick={() => change(key, 1)} disabled={quantity >= MAX_ITEM_QUANTITY}><Plus size={15} aria-hidden="true" /></button></span>}
                        </div>
                      </li>;
                    })}
                  </ul>
                </div>
              </div>
              {count > 0 && <aside className="qo-cart" aria-label="Your order">
                <div className="qo-cart-head"><h3>Your order <span key={count} className="qo-count-pop">{count}</span></h3>{count > 0 && <button type="button" className="qo-clear" onClick={() => setQty({})}>Clear</button>}</div>
                {linesSummary('qo-lines')}
                <div className="qo-total"><span>{anyFrom ? 'Starting subtotal' : 'Subtotal'}</span><strong>{formatCents(total)}{anyFrom ? '+' : ''}</strong></div>
                {anyFrom && <p className="qo-note">Some dishes have options that can affect the final price.</p>}
                <button type="button" className="button button-red qo-go" onClick={() => setStep('details')} data-testid="qo-order-flow">Pickup details <ArrowRight size={18} aria-hidden="true" /></button>
              </aside>}
            </div>
          )}

          {step === 'details' && (
            <div key="details" className="qo-flow-stage qo-details-layout">
              <form className="qo-stage-card" onSubmit={reviewDetails} noValidate>
                <span className="eyebrow">Step 2 of 3</span>
                <h3 className="qo-stage-title" tabIndex={-1} ref={headingRef}>Pickup details</h3>
                <p className="qo-stage-copy">Pickup at Miss Chang An · {ADDRESS}</p>
                <div className="qo-fields">
                  <div className="qo-field">
                    <label htmlFor="qo-name">Name <span>(required)</span></label>
                    <input id="qo-name" type="text" required maxLength={80} autoComplete="name" value={name} onChange={event => { setName(event.target.value); setErrors(current => ({ ...current, name: undefined })); }} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'qo-name-error' : undefined} data-testid="qo-input-name" />
                    {errors.name && <p className="qo-error" id="qo-name-error" role="alert">{errors.name}</p>}
                  </div>
                  <div className="qo-field">
                    <label htmlFor="qo-phone">Phone <span>(optional)</span></label>
                    <input id="qo-phone" type="tel" maxLength={25} autoComplete="tel" inputMode="tel" value={phoneNumber} onChange={event => { setPhoneNumber(event.target.value); setErrors(current => ({ ...current, phone: undefined })); }} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'qo-phone-error' : undefined} data-testid="qo-input-phone" />
                    {errors.phone && <p className="qo-error" id="qo-phone-error" role="alert">{errors.phone}</p>}
                  </div>
                  <div className="qo-field qo-field-wide">
                    <label htmlFor="qo-notes">Notes <span>(optional)</span></label>
                    <textarea id="qo-notes" rows={3} maxLength={300} value={notes} onChange={event => setNotes(event.target.value)} data-testid="qo-input-notes" />
                  </div>
                </div>
                <div className="qo-step-actions">
                  <button type="button" className="button button-light" onClick={() => setStep('dishes')}><ArrowLeft size={17} /> Edit dishes</button>
                  <button type="submit" className="button button-red" data-testid="qo-review-order">Review order <ArrowRight size={18} /></button>
                </div>
              </form>
              <aside className="qo-cart qo-details-summary">
                <div className="qo-cart-head"><h3>Your order</h3><button type="button" className="qo-clear" onClick={() => setStep('dishes')}>Edit</button></div>
                {linesSummary('qo-lines')}
                <div className="qo-total"><span>Subtotal{anyFrom ? ', starting at' : ''}</span><strong>{formatCents(total)}{anyFrom ? '+' : ''}</strong></div>
              </aside>
            </div>
          )}

          {step === 'review' && (
            <div key="review" className="qo-flow-stage qo-review-layout">
              <section className="qo-stage-card qo-review-card" aria-labelledby="qo-review-heading">
                <span className="eyebrow">Step 3 of 3</span>
                <h3 className="qo-stage-title" id="qo-review-heading" tabIndex={-1} ref={headingRef}>Review your pickup</h3>
                <p className="qo-stage-copy">For <strong>{name.trim()}</strong> · Pickup at Miss Chang An, {ADDRESS}</p>
                {phoneNumber && <p className="qo-stage-copy">Phone: {phoneNumber}</p>}
                {notes.trim() && <p className="qo-review-notes"><strong>Notes:</strong> {notes.trim()}</p>}
                {linesSummary()}
                <div className="qo-total"><span>{anyFrom ? 'Starting total' : 'Total'}</span><strong>{formatCents(total)}{anyFrom ? '+' : ''}</strong></div>
                <p className="qo-review-disclaimer">Review mode: submit to the shared staff review dashboard. This does not place a restaurant order or take payment.</p>
                {confirmation && <p className="qo-confirmation" role="status"><Check size={18} aria-hidden="true" /> Saved to the shared review dashboard: MCA-{confirmation.slice(0, 8).toUpperCase()}. <a href="#qo-saved-orders" data-testid="qo-open-dashboard">View saved status →</a></p>}
                {submitError && <p className="qo-error" role="alert">{submitError}</p>}
                <div className="qo-step-actions">
                  <button type="button" className="button button-light" disabled={sending || !!confirmation} onClick={() => setStep('details')}><ArrowLeft size={17} /> Edit details</button>
                  <button type="button" className="button button-red" onClick={confirmDemoOrder} disabled={sending || !!confirmation} data-testid="qo-confirm-demo-order">
                    {sending ? 'Sending…' : confirmation ? 'Review submission saved' : 'Confirm review submission'} {!confirmation && !sending && <Check size={18} aria-hidden="true" />}
                  </button>
                </div>
                <button type="button" className="qo-reset" disabled={sending} onClick={restart}>Start a new order</button>
              </section>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
