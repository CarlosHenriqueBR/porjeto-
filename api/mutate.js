import { updateDb, cid, logActivity, notify } from './_lib/store.js';
import { json, readBody, requireUser, withErrors } from './_lib/http.js';
import { encryptSecret, hashPassword, verifyPassword } from './_lib/crypto.js';
import {
  DOMAIN_STATUS, ACCOUNT_STATUS, STRUCTURE_STATUS, TASK_COLUMNS, TASK_PRIORITY,
  ENTRY_TYPES, ENTRY_STATUS, RECURRENCE, CATEGORIES, VAULT_CATEGORY, PILLARS,
  can, categoryOf,
} from './_lib/model.js';

/* ------------------------------ validadores ------------------------------ */
const str = (v, max = 400) => (v == null ? '' : String(v).slice(0, max).trim());
const num = (v) => {
  const n = Number(String(v ?? 0).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => Math.round(num(v) * 100) / 100;
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const now = () => new Date().toISOString();

const LBL_DOMAIN = { online: 'ONLINE', caiu: 'CAIU', off: 'OFF', usado: 'JÁ USADO' };
const LBL_ACCOUNT = { online: 'ONLINE', off: 'OFF', restabelecida: 'RESTABELECIDA', banida: 'BANIDA' };
const LBL_COLUMN = { backlog: 'A fazer', fazendo: 'Fazendo', revisao: 'Revisão', feito: 'Feito' };

/** Qual pilar cada ação exige. */
const ACTION_PILLAR = {
  domain: 'trafego', account: 'trafego', structure: 'trafego', metric: 'trafego',
  entry: 'financas',
  task: 'logistica', sector: 'logistica',
  vault: 'cofre',
  user: 'config', settings: 'config',
  notif: null, me: null,
};

/* -------------------------------- handler -------------------------------- */

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'metodo_invalido' });
  const user = await requireUser(req, res);
  if (!user) return;

  const { action, payload = {} } = await readBody(req);
  if (!action || typeof action !== 'string') return json(res, 400, { error: 'acao_invalida' });

  const pillar = ACTION_PILLAR[action.split('.')[0]];
  if (pillar && !can(user, pillar)) return json(res, 403, { error: 'sem_permissao', pillar });
  // trocar a própria senha nunca depende de permissão
  if (action === 'user.password' && !can(user, 'config')) { /* liberado */ }

  try {
    const { db, result } = await updateDb((db) => apply(db, user, action, payload));
    return json(res, 200, { ok: true, version: db.version, result: result ?? null });
  } catch (e) {
    const known = e && e.code === 'APP';
    if (!known) console.error('[mutate]', action, e);
    return json(res, known ? 400 : 500, { error: known ? e.message : 'erro_interno' });
  }
}

function fail(message) { const e = new Error(message); e.code = 'APP'; throw e; }

function upsert(list, id, build, { unshift = true } = {}) {
  if (id) {
    const item = list.find((x) => x.id === id);
    if (!item) fail('registro_nao_encontrado');
    Object.assign(item, build(item), { updatedAt: now() });
    return { item, created: false };
  }
  const item = build(null);
  if (unshift) list.unshift(item); else list.push(item);
  return { item, created: true };
}

function remove(list, id) {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) fail('registro_nao_encontrado');
  const [item] = list.splice(i, 1);
  return { item };
}

/* --------------------------------- ações --------------------------------- */

function apply(db, user, action, p) {
  switch (action) {
    /* =============================== TRÁFEGO ============================== */
    case 'domain.save': {
      const prev = p.id ? db.domains.find((d) => d.id === p.id)?.status : null;
      const { item, created } = upsert(db.domains, p.id, (old) => ({
        id: old?.id || cid('d'),
        url: str(p.url, 200).replace(/^https?:\/\//, '').replace(/\/+$/, ''),
        folder: str(p.folder, 200),
        status: pick(p.status, DOMAIN_STATUS, 'online'),
        registrar: str(p.registrar, 80),
        accountId: str(p.accountId, 40) || null,
        structureId: str(p.structureId, 40) || null,
        note: str(p.note, 1000),
        createdAt: old?.createdAt || now(),
        createdBy: old?.createdBy || user.id,
        updatedBy: user.id,
      }));
      if (!item.url) fail('dominio_obrigatorio');
      logActivity(db, user, {
        pillar: 'trafego', entity: 'dominio', entityId: item.id,
        action: created ? 'criou' : 'editou',
        message: created ? `Cadastrou o domínio ${item.url}` : `Editou o domínio ${item.url}`,
      });
      if (created) notify(db, user, { pillar: 'trafego', message: `${user.name} cadastrou o domínio ${item.url}`, link: '#/trafego/dominios' });
      else if (prev && prev !== item.status) notifyDomain(db, user, item, prev);
      return item;
    }

    case 'domain.status': {
      const d = db.domains.find((x) => x.id === p.id);
      if (!d) fail('registro_nao_encontrado');
      const next = pick(p.status, DOMAIN_STATUS, d.status);
      if (next === d.status) return d;
      const prev = d.status;
      Object.assign(d, { status: next, updatedAt: now(), updatedBy: user.id });
      logActivity(db, user, {
        pillar: 'trafego', entity: 'dominio', entityId: d.id, action: 'status',
        message: `${d.url}: ${LBL_DOMAIN[prev]} → ${LBL_DOMAIN[next]}`,
      });
      notifyDomain(db, user, d, prev);
      return d;
    }

    case 'domain.delete': {
      const { item } = remove(db.domains, p.id);
      logActivity(db, user, { pillar: 'trafego', entity: 'dominio', entityId: item.id, action: 'excluiu', message: `Excluiu o domínio ${item.url}` });
      return { id: item.id };
    }

    case 'account.save': {
      const prev = p.id ? db.accounts.find((a) => a.id === p.id)?.status : null;
      const { item, created } = upsert(db.accounts, p.id, (old) => ({
        id: old?.id || cid('c'),
        name: str(p.name, 120),
        platform: pick(p.platform, ['google', 'meta', 'tiktok', 'outro'], 'google'),
        adsId: str(p.adsId, 40),
        email: str(p.email, 160),
        status: pick(p.status, ACCOUNT_STATUS, 'online'),
        budget: money(p.budget),
        note: str(p.note, 1000),
        createdAt: old?.createdAt || now(),
        createdBy: old?.createdBy || user.id,
        updatedBy: user.id,
      }));
      if (!item.name) fail('nome_obrigatorio');
      logActivity(db, user, {
        pillar: 'trafego', entity: 'conta', entityId: item.id,
        action: created ? 'criou' : 'editou',
        message: created ? `Cadastrou a conta ${item.name}` : `Editou a conta ${item.name}`,
      });
      if (created) notify(db, user, { pillar: 'trafego', message: `${user.name} cadastrou a conta ${item.name}`, link: '#/trafego/contas' });
      else if (prev && prev !== item.status) notifyAccount(db, user, item, prev);
      return item;
    }

    case 'account.status': {
      const a = db.accounts.find((x) => x.id === p.id);
      if (!a) fail('registro_nao_encontrado');
      const next = pick(p.status, ACCOUNT_STATUS, a.status);
      if (next === a.status) return a;
      const prev = a.status;
      Object.assign(a, { status: next, updatedAt: now(), updatedBy: user.id });
      logActivity(db, user, {
        pillar: 'trafego', entity: 'conta', entityId: a.id, action: 'status',
        message: `Conta ${a.name}: ${LBL_ACCOUNT[prev]} → ${LBL_ACCOUNT[next]}`,
      });
      notifyAccount(db, user, a, prev);
      return a;
    }

    case 'account.delete': {
      const { item } = remove(db.accounts, p.id);
      logActivity(db, user, { pillar: 'trafego', entity: 'conta', entityId: item.id, action: 'excluiu', message: `Excluiu a conta ${item.name}` });
      return { id: item.id };
    }

    case 'structure.save': {
      const { item, created } = upsert(db.structures, p.id, (old) => ({
        id: old?.id || cid('e'),
        name: str(p.name, 120),
        offer: str(p.offer, 120),
        domainId: str(p.domainId, 40) || null,
        accountId: str(p.accountId, 40) || null,
        status: pick(p.status, STRUCTURE_STATUS, 'ativa'),
        note: str(p.note, 1000),
        createdAt: old?.createdAt || now(),
        createdBy: old?.createdBy || user.id,
        updatedBy: user.id,
      }));
      if (!item.name) fail('nome_obrigatorio');
      logActivity(db, user, {
        pillar: 'trafego', entity: 'estrutura', entityId: item.id,
        action: created ? 'criou' : 'editou',
        message: created ? `Criou a estrutura "${item.name}"` : `Editou a estrutura "${item.name}"`,
      });
      // requisito: estrutura nova avisa todo mundo
      notify(db, user, {
        pillar: 'trafego',
        message: created
          ? `🚀 ${user.name} criou a estrutura "${item.name}"${item.offer ? ` · ${item.offer}` : ''}`
          : `${user.name} atualizou a estrutura "${item.name}"`,
        kind: created ? 'good' : 'info',
        link: '#/trafego/estruturas',
      });
      return item;
    }

    case 'structure.delete': {
      const { item } = remove(db.structures, p.id);
      logActivity(db, user, { pillar: 'trafego', entity: 'estrutura', entityId: item.id, action: 'excluiu', message: `Excluiu a estrutura "${item.name}"` });
      return { id: item.id };
    }

    case 'metric.save': {
      if (!isDate(p.date)) fail('data_invalida');
      let m = db.metrics.find((x) => x.date === p.date);
      if (!m) { m = { date: p.date, createdAt: now() }; db.metrics.push(m); }
      Object.assign(m, {
        revenue: money(p.revenue),
        adSpend: money(p.adSpend),
        otherCost: money(p.otherCost),
        sales: Math.max(0, Math.round(num(p.sales))),
        clicks: Math.max(0, Math.round(num(p.clicks))),
        source: str(p.source, 20) || 'manual',
        note: str(p.note, 400),
        updatedAt: now(), updatedBy: user.id,
      });
      db.metrics.sort((a, b) => (a.date < b.date ? 1 : -1));
      logActivity(db, user, {
        pillar: 'trafego', entity: 'metrica', entityId: m.date, action: 'lancou',
        message: `Lançou ${brl(m.revenue)} de faturamento e ${brl(m.adSpend)} de mídia em ${fmtDate(m.date)}`,
      });
      return m;
    }

    case 'metric.delete': {
      const i = db.metrics.findIndex((m) => m.date === p.date);
      if (i < 0) fail('registro_nao_encontrado');
      db.metrics.splice(i, 1);
      logActivity(db, user, { pillar: 'trafego', entity: 'metrica', entityId: p.date, action: 'excluiu', message: `Removeu as métricas de ${fmtDate(p.date)}` });
      return { date: p.date };
    }

    /* =============================== FINANÇAS ============================= */
    case 'entry.save': {
      const cat = categoryOf(str(p.category, 40));
      if (!cat) fail('categoria_invalida');
      const type = pick(p.type, ENTRY_TYPES, cat.type);
      if (type !== cat.type) fail('categoria_incompativel');
      if (!isDate(p.date)) fail('data_invalida');

      const { item, created } = upsert(db.entries, p.id, (old) => ({
        id: old?.id || cid('f'),
        date: p.date,
        dueDate: isDate(p.dueDate) ? p.dueDate : null,
        type,
        category: cat.key,
        amount: Math.abs(money(p.amount)),
        description: str(p.description, 300),
        status: pick(p.status, ENTRY_STATUS, 'liquidado'),
        recurrence: pick(p.recurrence, RECURRENCE, 'nenhuma'),
        structureId: str(p.structureId, 40) || null,
        sectorId: str(p.sectorId, 40) || null,
        method: str(p.method, 60),
        createdAt: old?.createdAt || now(),
        createdBy: old?.createdBy || user.id,
        updatedBy: user.id,
      }));
      if (item.amount <= 0) fail('valor_invalido');
      db.entries.sort((a, b) => (a.date < b.date ? 1 : -1));
      logActivity(db, user, {
        pillar: 'financas', entity: 'lancamento', entityId: item.id,
        action: created ? 'criou' : 'editou',
        message: `${created ? 'Lançou' : 'Editou'} ${item.type === 'entrada' ? 'entrada' : 'saída'} de ${brl(item.amount)} · ${cat.label}`,
      });
      if (created && item.amount >= 1000) {
        notify(db, user, {
          pillar: 'financas',
          message: `${user.name} lançou ${item.type === 'entrada' ? 'entrada' : 'saída'} de ${brl(item.amount)} (${cat.label})`,
          kind: item.type === 'entrada' ? 'good' : 'info',
          link: '#/financas/lancamentos',
        });
      }
      return item;
    }

    case 'entry.settle': {
      const e = db.entries.find((x) => x.id === p.id);
      if (!e) fail('registro_nao_encontrado');
      e.status = e.status === 'liquidado' ? 'previsto' : 'liquidado';
      e.updatedAt = now(); e.updatedBy = user.id;
      logActivity(db, user, {
        pillar: 'financas', entity: 'lancamento', entityId: e.id, action: 'status',
        message: `${e.status === 'liquidado' ? 'Liquidou' : 'Reabriu'} ${brl(e.amount)} · ${categoryOf(e.category)?.label || e.category}`,
      });
      return e;
    }

    case 'entry.delete': {
      const { item } = remove(db.entries, p.id);
      logActivity(db, user, { pillar: 'financas', entity: 'lancamento', entityId: item.id, action: 'excluiu', message: `Excluiu lançamento de ${brl(item.amount)}` });
      return { id: item.id };
    }

    /* =============================== LOGÍSTICA ============================ */
    case 'task.save': {
      const sector = db.sectors.find((s) => s.id === str(p.sectorId, 40));
      const { item, created } = upsert(db.tasks, p.id, (old) => ({
        id: old?.id || cid('t'),
        title: str(p.title, 200),
        desc: str(p.desc, 3000),
        sectorId: sector?.id || old?.sectorId || db.sectors[0]?.id || 'edicao',
        column: pick(p.column, TASK_COLUMNS, old?.column || 'backlog'),
        priority: pick(p.priority, TASK_PRIORITY, 'media'),
        assignee: str(p.assignee, 40) || null,
        due: isDate(p.due) ? p.due : null,
        order: old?.order ?? Date.now(),
        createdAt: old?.createdAt || now(),
        createdBy: old?.createdBy || user.id,
        updatedBy: user.id,
        doneAt: old?.doneAt || null,
      }));
      if (!item.title) fail('titulo_obrigatorio');
      const sectorName = db.sectors.find((s) => s.id === item.sectorId)?.name || '';
      logActivity(db, user, {
        pillar: 'logistica', entity: 'tarefa', entityId: item.id,
        action: created ? 'criou' : 'editou',
        message: `${created ? 'Criou' : 'Editou'} a demanda "${item.title}" em ${sectorName}`,
      });
      if (created) {
        const who = item.assignee ? db.users.find((u) => u.id === item.assignee)?.name : null;
        notify(db, user, {
          pillar: 'logistica',
          message: `${user.name} abriu "${item.title}" em ${sectorName}${who ? ` para ${who}` : ''}`,
          kind: item.priority === 'urgente' ? 'critical' : 'info',
          link: '#/logistica',
        });
      }
      return item;
    }

    case 'task.move': {
      const t = db.tasks.find((x) => x.id === p.id);
      if (!t) fail('registro_nao_encontrado');
      const col = pick(p.column, TASK_COLUMNS, t.column);
      const sectorId = p.sectorId ? (db.sectors.find((s) => s.id === p.sectorId)?.id || t.sectorId) : t.sectorId;
      const prev = t.column;
      Object.assign(t, { column: col, sectorId, updatedAt: now(), updatedBy: user.id });
      if (p.order != null) t.order = num(p.order);
      if (col === 'feito' && prev !== 'feito') t.doneAt = now();
      if (col !== 'feito') t.doneAt = null;
      if (prev !== col) {
        logActivity(db, user, {
          pillar: 'logistica', entity: 'tarefa', entityId: t.id, action: 'moveu',
          message: `Moveu "${t.title}" de ${LBL_COLUMN[prev]} para ${LBL_COLUMN[col]}`,
        });
        if (col === 'feito') notify(db, user, { pillar: 'logistica', message: `✅ ${user.name} concluiu "${t.title}"`, kind: 'good', link: '#/logistica' });
      }
      return t;
    }

    case 'task.delete': {
      const { item } = remove(db.tasks, p.id);
      logActivity(db, user, { pillar: 'logistica', entity: 'tarefa', entityId: item.id, action: 'excluiu', message: `Excluiu a demanda "${item.title}"` });
      return { id: item.id };
    }

    case 'sector.save': {
      const { item, created } = upsert(db.sectors, p.id, (old) => ({
        id: old?.id || str(p.name, 30).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '') || cid('s'),
        name: str(p.name, 60),
        color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#3987e5',
        sla: Math.max(0, Math.round(num(p.sla))),
      }), { unshift: false });
      if (!item.name) fail('nome_obrigatorio');
      logActivity(db, user, {
        pillar: 'logistica', entity: 'setor', entityId: item.id,
        action: created ? 'criou' : 'editou', message: `${created ? 'Criou' : 'Editou'} o setor ${item.name}`,
      });
      return item;
    }

    case 'sector.delete': {
      if (db.tasks.some((t) => t.sectorId === p.id)) fail('setor_com_tarefas');
      const { item } = remove(db.sectors, p.id);
      logActivity(db, user, { pillar: 'logistica', entity: 'setor', entityId: item.id, action: 'excluiu', message: `Excluiu o setor ${item.name}` });
      return { id: item.id };
    }

    /* ================================ COFRE =============================== */
    case 'vault.save': {
      const { item, created } = upsert(db.vault, p.id, (old) => {
        const base = {
          id: old?.id || cid('v'),
          title: str(p.title, 120),
          category: pick(p.category, VAULT_CATEGORY, 'outro'),
          url: str(p.url, 300),
          login: str(p.login, 200),
          note: str(p.note, 1000),
          createdAt: old?.createdAt || now(),
          createdBy: old?.createdBy || user.id,
          updatedBy: user.id,
        };
        if (p.secret != null && p.secret !== '') base.secretEnc = encryptSecret(String(p.secret).slice(0, 2000));
        else base.secretEnc = old?.secretEnc || '';
        return base;
      });
      if (!item.title) fail('titulo_obrigatorio');
      logActivity(db, user, {
        pillar: 'cofre', entity: 'cofre', entityId: item.id,
        action: created ? 'criou' : 'editou',
        message: `${created ? 'Adicionou' : 'Editou'} "${item.title}" no cofre`,
      });
      if (created) notify(db, user, { pillar: 'cofre', message: `🔐 ${user.name} adicionou "${item.title}" ao cofre`, link: '#/cofre' });
      const { secretEnc, ...safe } = item;
      return { ...safe, hasSecret: !!secretEnc };
    }

    case 'vault.delete': {
      const { item } = remove(db.vault, p.id);
      logActivity(db, user, { pillar: 'cofre', entity: 'cofre', entityId: item.id, action: 'excluiu', message: `Removeu "${item.title}" do cofre` });
      return { id: item.id };
    }

    /* ============================ NOTIFICAÇÕES ============================ */
    case 'notif.readAll': {
      for (const n of db.notifications) if (!n.readBy.includes(user.id)) n.readBy.push(user.id);
      return { ok: true };
    }

    /* =============================== USUÁRIOS ============================= */
    case 'user.password': {
      const me = db.users.find((u) => u.id === user.id);
      if (!verifyPassword(p.current, me.passHash)) fail('senha_atual_incorreta');
      const next = String(p.next || '');
      if (next.length < 8) fail('senha_curta');
      me.passHash = hashPassword(next);
      me.mustChangePassword = false;
      me.updatedAt = now();
      logActivity(db, user, { entity: 'usuario', entityId: me.id, action: 'senha', message: `${me.name} alterou a própria senha` });
      return { ok: true };
    }

    case 'user.save': {
      if (user.role !== 'owner') fail('sem_permissao');
      const perms = {};
      for (const k of PILLARS) perms[k] = p.perms?.[k] === true || p.perms?.[k] === 'true';
      const role = pick(p.role, ['owner', 'member'], 'member');

      if (p.id) {
        const target = db.users.find((u) => u.id === p.id);
        if (!target) fail('registro_nao_encontrado');
        const owners = db.users.filter((u) => u.role === 'owner' && u.active);
        if (owners.length === 1 && owners[0].id === target.id && (role !== 'owner' || p.active === false)) {
          fail('ultimo_owner');
        }
        Object.assign(target, {
          name: str(p.name, 80) || target.name,
          role, perms: role === 'owner' ? allPerms() : perms,
          active: p.active !== false, updatedAt: now(),
        });
        if (p.password) {
          if (String(p.password).length < 8) fail('senha_curta');
          target.passHash = hashPassword(p.password);
          target.mustChangePassword = true;
        }
        logActivity(db, user, { entity: 'usuario', entityId: target.id, action: 'editou', message: `Atualizou o acesso de ${target.name}` });
        return { id: target.id };
      }

      const email = str(p.email, 160).toLowerCase();
      if (!email || !p.password) fail('dados_incompletos');
      if (String(p.password).length < 8) fail('senha_curta');
      if (db.users.some((u) => u.email.toLowerCase() === email)) fail('email_ja_existe');
      const nu = {
        id: cid('u'), name: str(p.name, 80) || email, email, role,
        perms: role === 'owner' ? allPerms() : perms, active: true,
        passHash: hashPassword(p.password), mustChangePassword: true, createdAt: now(),
      };
      db.users.push(nu);
      logActivity(db, user, { entity: 'usuario', entityId: nu.id, action: 'criou', message: `Criou o acesso de ${nu.name}` });
      notify(db, user, { message: `${user.name} adicionou ${nu.name} à equipe`, link: '#/config' });
      return { id: nu.id };
    }

    case 'settings.save': {
      if (user.role !== 'owner') fail('sem_permissao');
      db.settings.companyName = str(p.companyName, 80) || db.settings.companyName;
      logActivity(db, user, { entity: 'sistema', entityId: null, action: 'editou', message: 'Atualizou as configurações' });
      return db.settings;
    }

    default:
      return fail('acao_desconhecida');
  }
}

/* ------------------------------- auxiliares ------------------------------ */

function allPerms() {
  return PILLARS.reduce((a, p) => ((a[p] = true), a), {});
}

function notifyDomain(db, user, d, prev) {
  notify(db, user, {
    pillar: 'trafego',
    message: `${user.name} mudou ${d.url}: ${LBL_DOMAIN[prev]} → ${LBL_DOMAIN[d.status]}`,
    kind: d.status === 'caiu' ? 'critical' : d.status === 'online' ? 'good' : 'warning',
    link: '#/trafego/dominios',
  });
}

function notifyAccount(db, user, a, prev) {
  notify(db, user, {
    pillar: 'trafego',
    message: `${user.name} mudou a conta ${a.name}: ${LBL_ACCOUNT[prev]} → ${LBL_ACCOUNT[a.status]}`,
    kind: a.status === 'banida' ? 'critical' : a.status === 'off' ? 'warning' : 'good',
    link: '#/trafego/contas',
  });
}

const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => { const [y, m, dd] = String(d).split('-'); return `${dd}/${m}/${y}`; };

export { CATEGORIES };

export default withErrors(handler);
