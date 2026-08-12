import { updateDb } from './_lib/store.js';
import { decryptSecret } from './_lib/crypto.js';
import { json, requireUser, readBody, clientIp, rateLimit, requirePillar, withErrors } from './_lib/http.js';
import { logActivity } from './_lib/store.js';

// Revelar um segredo é uma ação auditada: fica registrada no feed de atividades.
async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo_invalido' });
  const user = await requireUser(req, res);
  if (!user) return;
  if (!requirePillar(res, user, 'cofre')) return;

  const rl = rateLimit(`reveal:${user.id}:${clientIp(req)}`, { max: 60, windowMs: 10 * 60_000 });
  if (!rl.ok) return json(res, 429, { error: 'muitas_tentativas' });

  const { id } = await readBody(req);
  let secret = '';
  let found = false;
  let hadSecret = false;

  await updateDb((db) => {
    const item = db.vault.find((v) => v.id === id);
    if (!item) return;
    found = true;
    hadSecret = !!item.secretEnc;
    secret = decryptSecret(item.secretEnc);
    logActivity(db, user, {
      pillar: 'cofre', entity: 'cofre', entityId: item.id, action: 'revelou',
      message: `Visualizou a senha de "${item.title}"`,
    });
  });

  if (!found) return json(res, 404, { error: 'nao_encontrado' });

  // O item existe e tem senha guardada, mas não abriu: quase sempre é a
  // VAULT_SECRET tendo mudado depois que o segredo foi salvo.
  if (hadSecret && !secret) {
    return json(res, 422, {
      error: 'segredo_ilegivel',
      hint: 'A VAULT_SECRET deste deploy é diferente da que criptografou esta senha. Restaure a chave anterior ou cadastre a senha de novo.',
    });
  }
  if (!secret) return json(res, 404, { error: 'nao_encontrado' });
  return json(res, 200, { ok: true, secret });
}

export default withErrors(handler);
