import { updateDb } from './_lib/store.js';
import { decryptSecret } from './_lib/crypto.js';
import { json, requireUser, readBody, clientIp, rateLimit, requirePillar } from './_lib/http.js';
import { logActivity } from './_lib/store.js';

// Revelar um segredo é uma ação auditada: fica registrada no feed de atividades.
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo_invalido' });
  const user = await requireUser(req, res);
  if (!user) return;
  if (!requirePillar(res, user, 'cofre')) return;

  const rl = rateLimit(`reveal:${user.id}:${clientIp(req)}`, { max: 60, windowMs: 10 * 60_000 });
  if (!rl.ok) return json(res, 429, { error: 'muitas_tentativas' });

  const { id } = await readBody(req);
  let secret = '';
  await updateDb((db) => {
    const item = db.vault.find((v) => v.id === id);
    if (!item) return;
    secret = decryptSecret(item.secretEnc);
    logActivity(db, user, {
      pillar: 'cofre', entity: 'cofre', entityId: item.id, action: 'revelou',
      message: `Visualizou a senha de "${item.title}"`,
    });
  });
  if (!secret) return json(res, 404, { error: 'nao_encontrado' });
  return json(res, 200, { ok: true, secret });
}
