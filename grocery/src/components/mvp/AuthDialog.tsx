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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#080b0b]/85 p-0 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="w-full max-w-md border border-[#52615e] bg-[#101515] p-6 text-[#f4f4f4] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[#00948c]">Your song stays here</p>
            <h2 id="auth-title" className="mt-2 text-3xl font-semibold tracking-tight">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          </div>
          <button type="button" aria-label="Close sign-in" onClick={onClose} disabled={busy} className="flex h-11 w-11 cursor-pointer items-center justify-center text-[#a7b0ad] transition hover:text-[#f4f4f4] disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#a7b0ad]">{reason}</p>
        <div className="mt-6 grid grid-cols-2 border border-[#52615e]" role="tablist" aria-label="Account action">
          {(['login', 'signup'] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => { setMode(item); setMessage(''); }} className={`min-h-11 cursor-pointer px-3 text-sm transition ${mode === item ? 'bg-[#f4f4f4] text-[#080b0b]' : 'text-[#a7b0ad] hover:text-[#f4f4f4]'}`}>
              {item === 'login' ? 'Sign in' : 'New account'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">Email
            <input autoFocus type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full border border-[#52615e] bg-[#080b0b] px-3 text-base text-[#f4f4f4] outline-none focus:border-[#ffe600]" />
          </label>
          <label className="block text-sm">Password
            <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-12 w-full border border-[#52615e] bg-[#080b0b] px-3 text-base text-[#f4f4f4] outline-none focus:border-[#ffe600]" />
          </label>
          {message && <p role="status" className="border border-[#52615e] p-3 text-sm leading-relaxed text-[#f4f4f4]">{message}</p>}
          <button type="submit" disabled={busy} className="min-h-12 w-full cursor-pointer rounded-2xl bg-[#ffe600] px-4 font-semibold text-[#080b0b] transition hover:bg-[#f4f4f4] disabled:cursor-wait disabled:opacity-50">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </section>
    </div>
  );
}
