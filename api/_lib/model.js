// ---------------------------------------------------------------------------
// Modelo compartilhado da Central Operation.
// Espelhado em src/types.ts — ao mexer aqui, mexa lá também.
// ---------------------------------------------------------------------------

export const PILLARS = ['dashboard', 'financas', 'logistica', 'trafego', 'cofre', 'config'];

export const DOMAIN_STATUS = ['online', 'caiu', 'off', 'usado'];
export const ACCOUNT_STATUS = ['online', 'off', 'restabelecida', 'banida'];
export const STRUCTURE_STATUS = ['ativa', 'pausada', 'morta'];

export const TASK_COLUMNS = ['backlog', 'fazendo', 'revisao', 'feito'];
export const TASK_PRIORITY = ['baixa', 'media', 'alta', 'urgente'];

export const ENTRY_TYPES = ['entrada', 'saida'];
export const ENTRY_STATUS = ['previsto', 'liquidado'];
export const RECURRENCE = ['nenhuma', 'semanal', 'mensal'];

/**
 * Grupos do DRE. Cada categoria de lançamento pertence a um grupo, e é o grupo
 * que decide em que linha do DRE o valor entra.
 *   receita   → receita bruta
 *   deducao   → taxas, impostos, chargeback, reembolso
 *   trafego   → custo de mídia
 *   operacao  → despesas operacionais (equipe, ferramentas, estrutura)
 */
export const CATEGORIES = [
  { key: 'vendas',        label: 'Vendas',                 type: 'entrada', group: 'receita' },
  { key: 'outras-receitas', label: 'Outras receitas',      type: 'entrada', group: 'receita' },
  { key: 'aporte',        label: 'Aporte de sócio',        type: 'entrada', group: 'receita' },

  { key: 'taxa-gateway',  label: 'Taxa de gateway',        type: 'saida',   group: 'deducao' },
  { key: 'chargeback',    label: 'Chargeback',             type: 'saida',   group: 'deducao' },
  { key: 'reembolso',     label: 'Reembolso',              type: 'saida',   group: 'deducao' },
  { key: 'imposto',       label: 'Imposto',                type: 'saida',   group: 'deducao' },

  { key: 'trafego',       label: 'Tráfego (mídia)',        type: 'saida',   group: 'trafego' },

  { key: 'equipe',        label: 'Equipe e freelas',       type: 'saida',   group: 'operacao' },
  { key: 'ferramentas',   label: 'Ferramentas e SaaS',     type: 'saida',   group: 'operacao' },
  { key: 'infra',         label: 'Domínios e hospedagem',  type: 'saida',   group: 'operacao' },
  { key: 'contas',        label: 'Contas de anúncio',      type: 'saida',   group: 'operacao' },
  { key: 'pro-labore',    label: 'Pró-labore',             type: 'saida',   group: 'operacao' },
  { key: 'outros',        label: 'Outros',                 type: 'saida',   group: 'operacao' },
];

export const categoryOf = (key) => CATEGORIES.find((c) => c.key === key) || null;
export const groupOf = (key) => categoryOf(key)?.group || 'operacao';

export const SECTORS = [
  { id: 'edicao',    name: 'Edição / Design',  color: '#9085e9', sla: 2 },
  { id: 'dev',       name: 'Desenvolvimento',  color: '#3987e5', sla: 3 },
  { id: 'trafego',   name: 'Tráfego',          color: '#199e70', sla: 1 },
  { id: 'copy',      name: 'Copy',             color: '#d95926', sla: 2 },
  { id: 'financeiro',name: 'Financeiro',       color: '#c98500', sla: 3 },
];

export const VAULT_CATEGORY = [
  'google-ads', 'meta-ads', 'dominio', 'hospedagem', 'pagamento', 'email', 'social', 'ferramenta', 'outro',
];

export const ALL_PERMS = () =>
  PILLARS.reduce((acc, p) => ((acc[p] = true), acc), {});

export const can = (user, pillar) =>
  !!user && (user.role === 'owner' || user.perms?.[pillar] === true);

/* --------------------------------- DRE ----------------------------------- */

/**
 * Monta o DRE de um período.
 * Faturamento e mídia vêm de duas fontes que se somam sem duplicar:
 *   - metrics[]  : o que a UTMify (ou o lançamento manual do tráfego) informa
 *   - entries[]  : tudo o que é lançado no financeiro
 * Um lançamento de categoria "vendas" ou "tráfego" só deve existir para o que
 * NÃO está coberto pelas métricas diárias (venda fora do funil, mídia paga fora
 * das contas monitoradas). A tela avisa sobre isso no formulário.
 */
export function buildDre(entries, metrics) {
  const sum = (list, fn) => list.reduce((t, x) => t + (fn(x) || 0), 0);

  const receitaMetrics = sum(metrics, (m) => m.revenue);
  const midiaMetrics = sum(metrics, (m) => m.adSpend);
  const outrosMetrics = sum(metrics, (m) => m.otherCost);

  const byGroup = (group, type) =>
    entries.filter((e) => e.type === type && groupOf(e.category) === group);

  const receitaLancada = sum(byGroup('receita', 'entrada'), (e) => e.amount);
  const deducoes = sum(byGroup('deducao', 'saida'), (e) => e.amount);
  const midiaLancada = sum(byGroup('trafego', 'saida'), (e) => e.amount);
  const operacionais = sum(byGroup('operacao', 'saida'), (e) => e.amount);

  const receitaBruta = receitaMetrics + receitaLancada;
  const deducoesTotal = deducoes + outrosMetrics;
  const receitaLiquida = receitaBruta - deducoesTotal;
  const midia = midiaMetrics + midiaLancada;
  const margemContribuicao = receitaLiquida - midia;
  const lucroLiquido = margemContribuicao - operacionais;

  return {
    receitaBruta,
    receitaMetrics,
    receitaLancada,
    deducoesMetrics: outrosMetrics,
    deducoes: deducoesTotal,
    receitaLiquida,
    midia,
    margemContribuicao,
    operacionais,
    lucroLiquido,
    margem: receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0,
    roi: midia > 0 ? (lucroLiquido / midia) * 100 : 0,
    roas: midia > 0 ? receitaBruta / midia : 0,
  };
}

/** Detalhamento por categoria, para a tabela do DRE. */
export function categoryBreakdown(entries) {
  const map = new Map();
  for (const e of entries) {
    const cat = categoryOf(e.category);
    const key = e.category;
    const cur = map.get(key) || { key, label: cat?.label || key, group: cat?.group || 'operacao', type: e.type, total: 0, count: 0 };
    cur.total += e.amount || 0;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
