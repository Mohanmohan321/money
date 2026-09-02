import { FormEvent, useState } from 'react';
import { LockKeyhole, WalletCards } from 'lucide-react';

import { api, ApiError } from '../api';

interface LoginPageProps {
  onAuthenticated(): void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.login(password);
      setPassword('');
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to unlock this money log');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-mark"><WalletCards aria-hidden="true" /></div>
        <p className="eyebrow">Private money log</p>
        <h1>Your money, kept private.</h1>
        <p className="login-intro">One password. Three clear kinds of movement. Nothing more than you need.</p>
        <form onSubmit={submit}>
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <LockKeyhole aria-hidden="true" />
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </section>
      <div className="login-rails" aria-hidden="true"><span /><span /><span /></div>
    </main>
  );
}
