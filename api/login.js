import { readDb } from './_lib/store.js';
import { verifyPassword } from './_lib/crypto.js';
import { json, readBody, setSessionCookie, clientIp, rateLimit, clearRateLimit, withErrors } from './_lib/http.js';

const WINDOW = 10 * 60_000;

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo_invalido' });

  const { email, password } = await readBody(req);
  if (!email || !password) return json(res, 400, { error: 'dados_incompletos' });

  const ip = clientIp(req);
  const account = String(email).trim().toLowerCase();

  // Dois limites: um por conta (evita que o erro de uma pessoa trave a equipe
  // inteira do mesmo IP) e um por IP, mais folgado, contra força bruta ampla.
  // Só tentativas erradas consomem — um acerto zera o contador da conta.
  const perAccount = { key: `login:${ip}:${account}`, opts: { max: 8, windowMs: WINDOW } };
  const perIp = { key: `login-ip:${ip}`, opts: { max: 40, windowMs: WINDOW } };

  for (const g of [perAccount, perIp]) {
    const rl = rateLimit(g.key, { ...g.opts, peek: true });
    if (!rl.ok) return json(res, 429, { error: 'muitas_tentativas', retryIn: rl.retryIn });
  }

  const db = await readDb({ fresh: true });
  const user = db.users.find((u) => u.email.toLowerCase() === account);

  // resposta uniforme para não vazar se a conta existe
  if (!user || !user.active || !verifyPassword(password, user.passHash)) {
    rateLimit(perAccount.key, perAccount.opts);
    rateLimit(perIp.key, perIp.opts);
    await new Promise((r) => setTimeout(r, 350));
    return json(res, 401, { error: 'credenciais_invalidas' });
  }

  clearRateLimit(perAccount.key);
  setSessionCookie(res, user.id);
  return json(res, 200, {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: !!user.mustChangePassword,
    },
  });
}

export default withErrors(handler);
