import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { request } from './lib/service';

// Owner dashboard sign-in. One shared password (set as STAFF_PASSWORD on the host).
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const dashboard = `${basePath}/dashboard/index.html`;

export function StaffProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function SignOut() {
  useEffect(() => {
    request('/staff-logout', {}).catch(() => undefined).finally(() => { location.href = `${basePath}/`; });
  }, []);
  return <p>Signing out…</p>;
}

function SignIn() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true); setError('');
    try {
      await request('/staff-login', { password });
      location.href = dashboard;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
      setBusy(false);
    }
  }
  return <form onSubmit={submit} style={{ display: 'grid', gap: 14, width: 'min(100%, 380px)', padding: 28, background: '#fff7e5', borderRadius: 16, border: '1px solid rgba(50,27,19,.12)' }}>
    <label htmlFor="staff-password" style={{ fontWeight: 700 }}>Dashboard password</label>
    <input id="staff-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={e => setPassword(e.target.value)} disabled={busy}
      style={{ font: 'inherit', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(50,27,19,.25)', background: '#fffaf0', color: '#321b13' }} />
    <button className="button button-red" type="submit" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
    {error && <p role="alert" style={{ color: '#a82020', margin: 0 }}>{error}</p>}
  </form>;
}

export default function StaffAccess() {
  const path = location.pathname;
  return <div className="wrap" style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 20, paddingBlock: 40 }}>
      <img src={`${basePath}/staff-logo.svg`} alt="Miss Chang An" style={{ height: 56 }} />
      <p>Miss Chang An · Approved staff only</p>
      {path.includes('/staff-sign-out') ? <SignOut /> : <SignIn />}
      <a href={`${basePath}/`}>Back to website</a>
    </div>;
}
