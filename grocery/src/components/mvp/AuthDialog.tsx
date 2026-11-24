import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  reason: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function AuthDialog({ open, reason, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, busy, onClose]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage('Enter a valid email address.');
    if (password.length < 8 || password.length > 72) return setMessage('Password must be 8 to 72 characters.');
    setBusy(true);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: mode, email, password }),
      });
      const body = await response.json() as { message?: string; confirm?: boolean };
      if (!response.ok) throw new Error(body.message || 'Sign-in did not work. Try again.');
      if (body.confirm) {
        setMode('login');
        setMessage('Check your email to confirm the account, then sign in.');
      } else {
        await onSuccess();
        setPassword('');
        onClose();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign-in did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#030306]/80 p-0 backdrop-blur-md sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="vx-glass vx-edge vx-rise w-full max-w-md !rounded-b-none p-6 text-white sm:!rounded-[1.25rem] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="vx-label">Your song stays here</p>
            <h2 id="auth-title" className="font-display mt-3 text-2xl font-bold uppercase">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          </div>
          <button type="button" aria-label="Close sign-in" onClick={onClose} disabled={busy} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--vx-dim)] transition hover:bg-white/5 hover:text-white disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--vx-dim)]">{reason}</p>
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/40 p-1" role="tablist" aria-label="Account action">
          {(['login', 'signup'] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => { setMode(item); setMessage(''); }} className={`min-h-10 cursor-pointer rounded-full px-3 text-sm transition ${mode === item ? 'bg-gradient-to-r from-[var(--vx-cyan)] to-[var(--vx-violet)] font-medium text-[#04020a] shadow-[0_0_20px_-6px_var(--vx-cyan)]' : 'text-[var(--vx-dim)] hover:text-white'}`}>
              {item === 'login' ? 'Sign in' : 'New account'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--vx-dim)]">Email
            <input autoFocus type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="vx-input mt-2 text-base" />
          </label>
          <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--vx-dim)]">Password
            <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="vx-input mt-2 text-base" />
          </label>
          {message && <p role="status" className="rounded-xl border border-[var(--vx-magenta)]/40 bg-[var(--vx-magenta)]/[0.06] p-3 text-sm leading-relaxed text-white">{message}</p>}
          <button type="submit" disabled={busy} className="vx-btn vx-btn-primary min-h-12 w-full px-4 text-sm">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </section>
    </div>
  );
}
