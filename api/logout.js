import { json, clearSessionCookie } from './_lib/http.js';

export default async function handler(req, res) {
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
}
