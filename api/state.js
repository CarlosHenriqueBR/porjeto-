import { readDb, DRIVER } from './_lib/store.js';
import { json, requireUser } from './_lib/http.js';
import { can, buildDre } from './_lib/model.js';

const TZ = 'America/Sao_Paulo';
const day = (o = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + o * 86400000));

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  const url = new URL(req.url, 'http://x');
  const since = Number(url.searchParams.get('v') || 0);
  const db = await readDb();

  if (since && since === db.version) {
    return json(res, 200, { changed: false, version: db.version, serverTime: Date.now() });
  }

  const money = can(user, 'financas');
  const traffic = can(user, 'trafego');
  const logistics = can(user, 'logistica');
  const vaultOk = can(user, 'cofre');

  const today = day();
  const month = today.slice(0, 7);
  const monthMetrics = traffic || money ? db.metrics.filter((m) => m.date.startsWith(month)) : [];
  const monthEntries = money ? db.entries.filter((e) => e.date.startsWith(month)) : [];

  // Resumo calculado no servidor para que quem não tem acesso a Finanças
  // simplesmente não receba os números — não é só a tela que esconde.
  const summary = {
    today: null, month: null, dre: null,
    domains: traffic ? countBy(db.domains) : null,
    accounts: traffic ? countBy(db.accounts) : null,
    openTasks: logistics ? db.tasks.filter((t) => t.column !== 'feito').length : null,
  };
  if (money || traffic) {
    const t = db.metrics.find((m) => m.date === today) || null;
    const y = db.metrics.find((m) => m.date === day(-1)) || null;
    summary.today = t ? { ...t, profit: profitOf(t) } : null;
    summary.yesterday = y ? { ...y, profit: profitOf(y) } : null;
  }
  if (money) summary.dre = buildDre(monthEntries, monthMetrics);

  return json(res, 200, {
    changed: true,
    version: db.version,
    updatedAt: db.updatedAt,
    serverTime: Date.now(),
    driver: DRIVER,
    me: {
      id: user.id, name: user.name, email: user.email,
      role: user.role, perms: user.perms || {},
      mustChangePassword: !!user.mustChangePassword,
    },
    summary,
    data: {
      users: db.users.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        perms: u.perms || {}, active: u.active,
      })),
      sectors: db.sectors,
      domains: traffic ? db.domains : [],
      accounts: traffic ? db.accounts : [],
      structures: traffic ? db.structures : [],
      metrics: traffic || money ? db.metrics : [],
      entries: money ? db.entries : [],
      tasks: logistics ? db.tasks : [],
      vault: vaultOk ? db.vault.map(({ secretEnc, ...rest }) => ({ ...rest, hasSecret: !!secretEnc })) : [],
      activities: db.activities.slice(0, 150),
      notifications: db.notifications.slice(0, 60),
      settings: db.settings,
    },
  });
}

const profitOf = (m) => (m.revenue || 0) - (m.adSpend || 0) - (m.otherCost || 0);
const countBy = (list) =>
  list.reduce((acc, x) => ((acc[x.status] = (acc[x.status] || 0) + 1), acc), {});
