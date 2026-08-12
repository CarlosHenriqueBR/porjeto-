// Popula com dados de exemplo para ver o sistema cheio. Use: npm run demo
import { readDb, updateDb, cid, logActivity, notify } from '../api/_lib/store.js';
import { encryptSecret } from '../api/_lib/crypto.js';

const TZ = 'America/Sao_Paulo';
const day = (o = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + o * 86400000));
const iso = (hoursAgo = 0) => new Date(Date.now() - hoursAgo * 3600000).toISOString();

const base = await readDb({ fresh: true });
const [artur, carlos, elisson] = base.users;

await updateDb((db) => {
  /* ------------------------------- tráfego ------------------------------- */
  db.accounts = [
    { id: cid('c'), name: 'Conta 01 — BM Artur', platform: 'google', adsId: '482-119-3307', email: 'ads01@operacao.com', status: 'online', budget: 900, note: 'Cartão principal', createdAt: iso(300), updatedAt: iso(4), createdBy: artur.id, updatedBy: artur.id },
    { id: cid('c'), name: 'Conta 02 — BM Carlos', platform: 'google', adsId: '771-540-2288', email: 'ads02@operacao.com', status: 'online', budget: 1200, note: '', createdAt: iso(280), updatedAt: iso(9), createdBy: carlos.id, updatedBy: carlos.id },
    { id: cid('c'), name: 'Conta 03 — Agência', platform: 'google', adsId: '905-332-1041', email: 'ads03@operacao.com', status: 'restabelecida', budget: 600, note: 'Voltou depois do recurso', createdAt: iso(200), updatedAt: iso(20), createdBy: elisson.id, updatedBy: elisson.id },
    { id: cid('c'), name: 'Conta 04 — Meta reserva', platform: 'meta', adsId: '338-664-9920', email: 'ads04@operacao.com', status: 'off', budget: 0, note: 'Aquecendo', createdAt: iso(120), updatedAt: iso(48), createdBy: carlos.id, updatedBy: carlos.id },
    { id: cid('c'), name: 'Conta 05 — Antiga', platform: 'google', adsId: '110-887-4432', email: 'ads05@operacao.com', status: 'banida', budget: 0, note: 'Política de saúde — recurso negado', createdAt: iso(700), updatedAt: iso(72), createdBy: artur.id, updatedBy: artur.id },
  ];

  db.structures = [
    { id: cid('e'), name: 'Estrutura 01 — Black', offer: 'Emagrecimento VSL', domainId: null, accountId: db.accounts[0].id, status: 'ativa', note: 'Melhor CPA da operação', createdAt: iso(260), createdBy: artur.id, updatedBy: artur.id },
    { id: cid('e'), name: 'Estrutura 02 — White', offer: 'Curso de tráfego', domainId: null, accountId: db.accounts[1].id, status: 'ativa', note: '', createdAt: iso(160), createdBy: carlos.id, updatedBy: carlos.id },
    { id: cid('e'), name: 'Estrutura 03 — Teste', offer: 'Suplemento capilar', domainId: null, accountId: db.accounts[2].id, status: 'pausada', note: 'CPA subiu, pausada', createdAt: iso(80), createdBy: elisson.id, updatedBy: elisson.id },
  ];

  const dom = (url, folder, status, ai, si, reg, h) => ({
    id: cid('d'), url, folder, status, registrar: reg,
    accountId: ai == null ? null : db.accounts[ai].id,
    structureId: si == null ? null : db.structures[si].id,
    note: '', createdAt: iso(h + 100), updatedAt: iso(h), createdBy: carlos.id, updatedBy: carlos.id,
  });
  db.domains = [
    dom('secarapido.site', '/estrutura-01/lp-a', 'online', 0, 0, 'Namecheap', 3),
    dom('metodoseca.online', '/estrutura-01/lp-b', 'online', 0, 0, 'Namecheap', 6),
    dom('protocolo21d.com', '/estrutura-01/vsl', 'caiu', 0, 0, 'GoDaddy', 1),
    dom('trafegoreal.com.br', '/estrutura-02/lp', 'online', 1, 1, 'Registro.br', 12),
    dom('escalasegura.site', '/estrutura-02/checkout', 'online', 1, 1, 'Namecheap', 26),
    dom('capilarforte.online', '/estrutura-03/lp', 'off', 2, 2, 'Hostinger', 40),
    dom('novafase.site', '/estrutura-03/teste', 'usado', 2, 2, 'Namecheap', 60),
    dom('vidaleve.store', '/antigo/lp-01', 'usado', 4, null, 'GoDaddy', 90),
    dom('resultadoreal.site', '/antigo/lp-02', 'caiu', 4, null, 'Namecheap', 30),
  ];
  db.structures[0].domainId = db.domains[0].id;
  db.structures[1].domainId = db.domains[3].id;
  db.structures[2].domainId = db.domains[5].id;

  /* ------------------------- métricas de 60 dias ------------------------- */
  db.metrics = [];
  for (let i = 59; i >= 0; i--) {
    const date = day(-i);
    const dow = new Date(`${date}T12:00:00`).getDay();
    const weekend = dow === 0 || dow === 6 ? 0.72 : 1;
    const wave = 1 + Math.sin(i / 6) * 0.22;
    const noise = 0.82 + ((i * 37) % 100) / 250;
    const revenue = Math.round(11800 * weekend * wave * noise);
    const adSpend = Math.round(revenue * (0.46 + (((i * 53) % 100) / 100) * 0.2));
    db.metrics.push({
      date, revenue, adSpend, otherCost: Math.round(revenue * 0.055),
      sales: Math.round(revenue / 197), clicks: Math.round(adSpend / 2.4),
      source: i < 3 ? 'utmify' : 'manual',
      createdAt: iso(i * 24), updatedAt: iso(i * 24), updatedBy: i < 3 ? 'utmify' : carlos.id,
    });
  }
  db.metrics.sort((a, b) => (a.date < b.date ? 1 : -1));

  /* ------------------------- financeiro do mês --------------------------- */
  const entry = (date, type, category, amount, description, extra = {}) => ({
    id: cid('f'), date, dueDate: extra.dueDate ?? null, type, category, amount,
    description, status: extra.status ?? 'liquidado', recurrence: extra.recurrence ?? 'nenhuma',
    structureId: null, sectorId: extra.sectorId ?? null, method: extra.method ?? '',
    createdAt: iso(50), updatedAt: iso(50), createdBy: carlos.id, updatedBy: carlos.id,
  });
  // datas dentro do mês corrente, para o DRE do mês já nascer com conteúdo
  const md = (d) => `${day(0).slice(0, 8)}${String(d).padStart(2, '0')}`;
  const hoje = Number(day(0).slice(8));
  const dia = (d) => md(Math.min(d, Math.max(1, hoje)));
  db.entries = [
    entry(dia(1), 'saida', 'ferramentas', 890, 'ElevenLabs + Canva + ClickUp', { recurrence: 'mensal', method: 'Cartão' }),
    entry(dia(2), 'saida', 'equipe', 4200, 'Editor de vídeo — mensalidade', { recurrence: 'mensal', sectorId: 'edicao' }),
    entry(dia(2), 'saida', 'equipe', 3800, 'Dev freela — checkout novo', { sectorId: 'dev' }),
    entry(dia(3), 'saida', 'taxa-gateway', 9640, 'Taxa do gateway sobre vendas'),
    entry(dia(4), 'saida', 'infra', 340, 'Domínios + hospedagem'),
    entry(dia(5), 'saida', 'imposto', 6100, 'Simples Nacional'),
    entry(dia(6), 'saida', 'chargeback', 1870, 'Chargebacks do período'),
    entry(dia(7), 'entrada', 'outras-receitas', 3400, 'Consultoria pontual'),
    entry(dia(8), 'saida', 'pro-labore', 15000, 'Pró-labore dos sócios', { recurrence: 'mensal' }),
    entry(dia(9), 'saida', 'contas', 1200, 'Compra de conta de anúncio'),
    entry(dia(10), 'saida', 'ferramentas', 460, 'UTMify + Cloudflare Pro', { recurrence: 'mensal' }),
    entry(day(3), 'saida', 'equipe', 4200, 'Editor de vídeo — próxima parcela', { status: 'previsto', dueDate: day(3), sectorId: 'edicao' }),
    entry(day(-1), 'saida', 'imposto', 6400, 'DAS do mês', { status: 'previsto', dueDate: day(-1) }),
    entry(day(6), 'entrada', 'outras-receitas', 2500, 'Comissão de afiliado', { status: 'previsto', dueDate: day(6) }),
  ];
  db.entries.sort((a, b) => (a.date < b.date ? 1 : -1));

  /* -------------------------- logística por setor ------------------------ */
  const task = (title, sectorId, column, priority, assignee, dueOffset, desc = '') => ({
    id: cid('t'), title, desc, sectorId, column, priority, assignee,
    due: dueOffset == null ? null : day(dueOffset),
    order: Date.now() - Math.random() * 1e6,
    createdAt: iso(30), createdBy: artur.id, updatedBy: artur.id,
    doneAt: column === 'feito' ? iso(10) : null,
  });
  db.tasks = [
    task('Trocar domínio da estrutura 01 (protocolo21d caiu)', 'trafego', 'fazendo', 'urgente', carlos.id, 0, 'Subir o backup e apontar o Cloudflare.'),
    task('Recurso da conta 05 no suporte Google', 'trafego', 'revisao', 'alta', elisson.id, 2),
    task('Escalar budget da conta 02 para R$ 1.500', 'trafego', 'backlog', 'media', artur.id, 3),
    task('3 criativos novos para a estrutura 02', 'edicao', 'fazendo', 'alta', elisson.id, 1),
    task('Reeditar VSL com o novo gancho', 'edicao', 'backlog', 'media', elisson.id, 5),
    task('Thumbnail para a campanha de remarketing', 'edicao', 'feito', 'baixa', elisson.id, -2),
    task('Corrigir bug do checkout no mobile', 'dev', 'fazendo', 'urgente', carlos.id, 0),
    task('Integrar webhook da UTMify', 'dev', 'backlog', 'alta', carlos.id, 4),
    task('Migrar domínios para Cloudflare', 'dev', 'feito', 'baixa', carlos.id, -3),
    task('Escrever copy da VSL 04', 'copy', 'backlog', 'media', artur.id, 6),
    task('Revisar headlines dos anúncios', 'copy', 'revisao', 'media', artur.id, 1),
    task('Fechar o DRE do mês', 'financeiro', 'backlog', 'alta', carlos.id, 2),
    task('Conciliar taxas do gateway', 'financeiro', 'feito', 'media', carlos.id, -1),
  ];

  /* --------------------------------- cofre ------------------------------- */
  const v = (title, category, login, secret, url, note) => ({
    id: cid('v'), title, category, login, url, note, secretEnc: encryptSecret(secret),
    createdAt: iso(200), updatedAt: iso(50), createdBy: artur.id, updatedBy: artur.id,
  });
  db.vault = [
    v('Google Ads — Conta 01', 'google-ads', 'ads01@operacao.com', 'SenhaForte#01', 'ads.google.com', '2FA no celular do Artur'),
    v('Google Ads — Conta 02', 'google-ads', 'ads02@operacao.com', 'SenhaForte#02', 'ads.google.com', ''),
    v('Meta Business', 'meta-ads', 'social@operacao.com', 'Meta#2026bm', 'business.facebook.com', ''),
    v('Namecheap', 'dominio', 'operacao@gmail.com', 'Nc#2026domains', 'namecheap.com', 'Todos os domínios .site'),
    v('Cloudflare', 'hospedagem', 'operacao@gmail.com', 'Cf#2026dns', 'dash.cloudflare.com', ''),
    v('Gateway de pagamento', 'pagamento', 'financeiro@operacao.com', 'Gw#2026pay', '', 'Chave de API no cofre da equipe'),
    v('UTMify', 'ferramenta', 'operacao@gmail.com', 'Utm#2026', 'app.utmify.com.br', 'Fonte do faturamento diário'),
  ];

  /* ---------------------------- histórico e avisos ----------------------- */
  db.activities = [];
  db.notifications = [];
  const seq = [
    [carlos, 'trafego', 'protocolo21d.com: ONLINE → CAIU', 'critical'],
    [carlos, 'logistica', 'Abriu "Trocar domínio da estrutura 01" em Tráfego', 'info'],
    [artur, 'trafego', `UTMify sincronizou ${day(0)}`, 'good'],
    [elisson, 'trafego', 'Conta 03 — Agência: OFF → RESTABELECIDA', 'good'],
    [carlos, 'financas', 'Lançou saída de R$ 15.000,00 · Pró-labore', 'info'],
    [artur, 'trafego', 'Criou a estrutura "Estrutura 02 — White"', 'good'],
    [elisson, 'cofre', 'Adicionou "Cloudflare" ao cofre', 'info'],
  ];
  seq.forEach(([u, pillar, message, kind], i) => {
    logActivity(db, u, { pillar, entity: pillar, entityId: null, action: 'evento', message });
    db.activities[0].ts = iso(i * 5 + 1);
    if (i < 5) {
      notify(db, u, { pillar, message: `${u.name}: ${message}`, kind });
      db.notifications[0].ts = iso(i * 5 + 1);
      db.notifications[0].readBy = [];
    }
  });
});

console.log('Dados de exemplo carregados.');
