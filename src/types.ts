/** Espelho de api/_lib/model.js — ao mexer lá, mexa aqui. */

export type Pillar = 'dashboard' | 'financas' | 'logistica' | 'trafego' | 'cofre' | 'config';
export type Role = 'owner' | 'member';

export type DomainStatus = 'online' | 'caiu' | 'off' | 'usado';
export type AccountStatus = 'online' | 'off' | 'restabelecida' | 'banida';
export type StructureStatus = 'ativa' | 'pausada' | 'morta';
export type TaskColumn = 'backlog' | 'fazendo' | 'revisao' | 'feito';
export type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type EntryType = 'entrada' | 'saida';
export type EntryStatus = 'previsto' | 'liquidado';
export type Recurrence = 'nenhuma' | 'semanal' | 'mensal';
export type CategoryGroup = 'receita' | 'deducao' | 'trafego' | 'operacao';

export interface User {
  id: string; name: string; email: string; role: Role;
  perms: Partial<Record<Pillar, boolean>>; active: boolean;
  mustChangePassword?: boolean;
}

export interface Sector { id: string; name: string; color: string; sla: number }

export interface Domain {
  id: string; url: string; folder: string; status: DomainStatus; registrar: string;
  accountId: string | null; structureId: string | null; note: string;
  createdAt: string; updatedAt?: string; createdBy: string; updatedBy: string;
}

export interface AdAccount {
  id: string; name: string; platform: 'google' | 'meta' | 'tiktok' | 'outro';
  adsId: string; email: string; status: AccountStatus; budget: number; note: string;
  createdAt: string; updatedAt?: string; createdBy: string; updatedBy: string;
}

export interface Structure {
  id: string; name: string; offer: string; domainId: string | null;
  accountId: string | null; status: StructureStatus; note: string;
  createdAt: string; updatedAt?: string; createdBy: string; updatedBy: string;
}

export interface Metric {
  date: string; revenue: number; adSpend: number; otherCost: number;
  sales?: number; clicks?: number; source: string; note?: string;
  updatedAt?: string; updatedBy?: string;
}

export interface Entry {
  id: string; date: string; dueDate: string | null; type: EntryType; category: string;
  amount: number; description: string; status: EntryStatus; recurrence: Recurrence;
  structureId: string | null; sectorId: string | null; method: string;
  createdAt: string; updatedAt?: string; createdBy: string; updatedBy: string;
}

export interface Task {
  id: string; title: string; desc: string; sectorId: string; column: TaskColumn;
  priority: TaskPriority; assignee: string | null; due: string | null; order: number;
  createdAt: string; updatedAt?: string; createdBy: string; updatedBy: string;
  doneAt: string | null;
}

export interface VaultItem {
  id: string; title: string; category: string; url: string; login: string;
  note: string; hasSecret: boolean;
  createdAt: string; updatedAt?: string; createdBy: string; updatedBy: string;
}

export interface Activity {
  id: string; ts: string; userId: string; userName: string;
  entity: string; entityId: string | null; action: string; message: string;
  pillar: Pillar | null;
}

export interface Notification {
  id: string; ts: string; actorId: string; actorName: string;
  kind: 'info' | 'good' | 'warning' | 'critical';
  message: string; link: string | null; pillar: Pillar | null; readBy: string[];
}

export interface Dre {
  receitaBruta: number; receitaMetrics: number; receitaLancada: number;
  deducoesMetrics: number; deducoes: number; receitaLiquida: number; midia: number;
  margemContribuicao: number; operacionais: number; lucroLiquido: number;
  margem: number; roi: number; roas: number;
}

export interface Summary {
  today: (Metric & { profit: number }) | null;
  yesterday?: (Metric & { profit: number }) | null;
  month: unknown;
  dre: Dre | null;
  domains: Record<string, number> | null;
  accounts: Record<string, number> | null;
  openTasks: number | null;
}

export interface AppData {
  users: User[]; sectors: Sector[]; domains: Domain[]; accounts: AdAccount[];
  structures: Structure[]; metrics: Metric[]; entries: Entry[]; tasks: Task[];
  vault: VaultItem[]; activities: Activity[]; notifications: Notification[];
  settings: { utmifyLastSync: string | null; currency: string; companyName: string };
}

export interface StateResponse {
  changed: boolean; version: number; updatedAt?: string; serverTime: number;
  driver?: string; me?: User; summary?: Summary; data?: AppData;
}
