import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/store/AppContext';

export function Login() {
  const { pull } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await pull(true);
      location.hash = '#/dashboard';
    } catch (ex) {
      if (ex instanceof ApiError && ex.payload.error === 'muitas_tentativas') {
        const mins = Math.ceil(Number(ex.payload.retryIn || 60) / 60);
        setErr(`Muitas tentativas. Tente de novo em ${mins} min.`);
      } else {
        setErr('E-mail ou senha incorretos.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark">CO</div>
        <h1 className="auth-title">Central Operation</h1>
        <p className="auth-sub">Acesso restrito à equipe.</p>

        <label className="field">
          <span>E-mail</span>
          <input
            className="input" type="email" required autoFocus autoComplete="username"
            placeholder="voce@operacao.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Senha</span>
          <input
            className="input" type="password" required autoComplete="current-password"
            placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <p className="err" role="alert" aria-live="polite">{err}</p>

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="auth-sub" style={{ marginTop: 18, textAlign: 'center', fontSize: 11.5 }}>
          Sessão protegida · cookie HttpOnly · 7 dias
        </p>
      </form>
    </main>
  );
}
