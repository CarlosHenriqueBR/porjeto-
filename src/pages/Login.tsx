import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/store/AppContext';

interface Health {
  ok: boolean;
  problems?: string[];
  hint?: string;
}

export function Login() {
  const { pull } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  // Se o deploy estiver mal configurado, dizemos isso na cara em vez de
  // devolver "senha incorreta" — o erro mais chato de depurar que existe.
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: Health) => { if (!j.ok) setHealth(j); })
      .catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await pull(true);
      location.hash = '#/dashboard';
    } catch (ex) {
      const code = ex instanceof ApiError ? String(ex.payload.error ?? ex.message) : '';
      if (code === 'banco_nao_configurado') {
        setErr('O banco de dados ainda não foi configurado neste deploy.');
        setHealth({ ok: false, problems: [String((ex as ApiError).payload.hint ?? '')] });
      } else if (code === 'muitas_tentativas') {
        const mins = Math.ceil(Number((ex as ApiError).payload.retryIn ?? 60) / 60);
        setErr(`Muitas tentativas. Tente de novo em ${mins} min.`);
      } else if (code === 'erro_interno') {
        setErr('O servidor falhou ao responder. Veja /api/health para o diagnóstico.');
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

        {health && !health.ok && (
          <div className="alert-banner crit" style={{ marginTop: 18, marginBottom: 0, alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <b>Este deploy ainda não está pronto</b>
              {(health.problems ?? []).filter(Boolean).map((p) => (
                <span key={p} style={{ fontWeight: 400, lineHeight: 1.45 }}>{p}</span>
              ))}
              {health.hint && (
                <span style={{ fontWeight: 400, lineHeight: 1.45, opacity: 0.85 }}>{health.hint}</span>
              )}
              <a href="/api/health" target="_blank" rel="noopener noreferrer"
                 style={{ textDecoration: 'underline', fontWeight: 400 }}>
                ver diagnóstico completo
              </a>
            </div>
          </div>
        )}

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
