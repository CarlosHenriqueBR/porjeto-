import type {
  AccountStatus, CategoryGroup, DomainStatus, EntryType, Pillar,
  StructureStatus, TaskColumn, TaskPriority, User,
} from '@/types';

export interface Option<T extends string = string> {
  key: T; label: string; color?: string;
}

export const DOMAIN_STATUS: Option<DomainStatus>[] = [
  { key: 'online', label: 'Online', color: 'var(--good)' },
  { key: 'caiu', label: 'Caiu', color: 'var(--critical)' },
  { key: 'off', label: 'Off', color: 'var(--muted)' },
  { key: 'usado', label: 'Já usado', color: 'var(--warning)' },
];

export const ACCOUNT_STATUS: Option<AccountStatus>[] = [
  { key: 'online', label: 'Online', color: 'var(--good)' },
  { key: 'restabelecida', label: 'Restabelecida', color: 'var(--s1)' },
  { key: 'off', label: 'Off', color: 'var(--muted)' },
  { key: 'banida', label: 'Banida', color: 'var(--critical)' },
];

export const STRUCTURE_STATUS: Option<StructureStatus>[] = [
  { key: 'ativa', label: 'Ativa', color: 'var(--good)' },
  { key: 'pausada', label: 'Pausada', color: 'var(--warning)' },
  { key: 'morta', label: 'Morta', color: 'var(--muted)' },
];

export const PLATFORMS: Option[] = [
  { key: 'google', label: 'Google Ads' }, { key: 'meta', label: 'Meta Ads' },
  { key: 'tiktok', label: 'TikTok Ads' }, { key: 'outro', label: 'Outra' },
];

export const TASK_COLUMNS: Option<TaskColumn>[] = [
  { key: 'backlog', label: 'A fazer' }, { key: 'fazendo', label: 'Fazendo' },
  { key: 'revisao', label: 'Revisão' }, { key: 'feito', label: 'Feito' },
];

export const TASK_PRIORITY: Option<TaskPriority>[] = [
  { key: 'baixa', label: 'Baixa' }, { key: 'media', label: 'Média' },
  { key: 'alta', label: 'Alta' }, { key: 'urgente', label: 'Urgente' },
];

export const ENTRY_STATUS: Option[] = [
  { key: 'liquidado', label: 'Liquidado' }, { key: 'previsto', label: 'Previsto' },
];

export const RECURRENCE: Option[] = [
  { key: 'nenhuma', label: 'Não se repete' },
  { key: 'semanal', label: 'Toda semana' },
  { key: 'mensal', label: 'Todo mês' },
];

export interface Category { key: string; label: string; type: EntryType; group: CategoryGroup }

export const CATEGORIES: Category[] = [
  { key: 'vendas', label: 'Vendas', type: 'entrada', group: 'receita' },
  { key: 'outras-receitas', label: 'Outras receitas', type: 'entrada', group: 'receita' },
  { key: 'aporte', label: 'Aporte de sócio', type: 'entrada', group: 'receita' },
  { key: 'taxa-gateway', label: 'Taxa de gateway', type: 'saida', group: 'deducao' },
  { key: 'chargeback', label: 'Chargeback', type: 'saida', group: 'deducao' },
  { key: 'reembolso', label: 'Reembolso', type: 'saida', group: 'deducao' },
  { key: 'imposto', label: 'Imposto', type: 'saida', group: 'deducao' },
  { key: 'trafego', label: 'Tráfego (mídia)', type: 'saida', group: 'trafego' },
  { key: 'equipe', label: 'Equipe e freelas', type: 'saida', group: 'operacao' },
  { key: 'ferramentas', label: 'Ferramentas e SaaS', type: 'saida', group: 'operacao' },
  { key: 'infra', label: 'Domínios e hospedagem', type: 'saida', group: 'operacao' },
  { key: 'contas', label: 'Contas de anúncio', type: 'saida', group: 'operacao' },
  { key: 'pro-labore', label: 'Pró-labore', type: 'saida', group: 'operacao' },
  { key: 'outros', label: 'Outros', type: 'saida', group: 'operacao' },
];

export const categoryOf = (key: string) => CATEGORIES.find((c) => c.key === key);
export const categoriesFor = (type: EntryType) => CATEGORIES.filter((c) => c.type === type);

export const VAULT_CATEGORIES: Option[] = [
  { key: 'google-ads', label: 'Google Ads' }, { key: 'meta-ads', label: 'Meta Ads' },
  { key: 'dominio', label: 'Domínio' }, { key: 'hospedagem', label: 'Hospedagem' },
  { key: 'pagamento', label: 'Pagamento' }, { key: 'email', label: 'E-mail' },
  { key: 'social', label: 'Social' }, { key: 'ferramenta', label: 'Ferramenta' },
  { key: 'outro', label: 'Outro' },
];

export const PILLAR_LABELS: Record<Pillar, string> = {
  dashboard: 'Dashboard',
  financas: 'Finanças',
  logistica: 'Logística',
  trafego: 'Tráfego',
  cofre: 'Cofre',
  config: 'Configurações',
};

export const labelOf = (list: Option<never>[] | Option[], key: string) =>
  (list as Option[]).find((o) => o.key === key)?.label ?? key;

export const can = (user: User | null, pillar: Pillar) =>
  !!user && (user.role === 'owner' || user.perms?.[pillar] === true);
