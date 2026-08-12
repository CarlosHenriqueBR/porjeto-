import type { Dre, Entry, Metric, Task } from '@/types';
import { categoryOf } from './model';
import { todayISO } from './format';

export const profitOf = (m?: Metric | null) =>
  m ? (m.revenue || 0) - (m.adSpend || 0) - (m.otherCost || 0) : 0;

export interface DayRow {
  date: string; revenue: number; adSpend: number; otherCost: number;
  profit: number; has: boolean; sales: number;
}

/** Série contínua dos últimos N dias, preenchendo os dias sem lançamento. */
export function daySeries(metrics: Metric[], days: number): DayRow[] {
  const map = new Map(metrics.map((m) => [m.date, m]));
  const out: DayRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = todayISO(-i);
    const m = map.get(date);
    out.push({
      date,
      revenue: m?.revenue || 0,
      adSpend: m?.adSpend || 0,
      otherCost: m?.otherCost || 0,
      sales: m?.sales || 0,
      profit: profitOf(m),
      has: !!m,
    });
  }
  return out;
}

export const inMonth = <T extends { date: string }>(list: T[], month: string) =>
  list.filter((x) => x.date.startsWith(month));

/** Mesmo cálculo do servidor (api/_lib/model.js) — mantidos em paralelo. */
export function buildDre(entries: Entry[], metrics: Metric[]): Dre {
  const sum = <T,>(list: T[], fn: (x: T) => number) => list.reduce((t, x) => t + (fn(x) || 0), 0);
  const group = (g: string, type: string) =>
    entries.filter((e) => e.type === type && (categoryOf(e.category)?.group ?? 'operacao') === g);

  const receitaMetrics = sum(metrics, (m) => m.revenue);
  const midiaMetrics = sum(metrics, (m) => m.adSpend);
  const outrosMetrics = sum(metrics, (m) => m.otherCost);

  const receitaLancada = sum(group('receita', 'entrada'), (e) => e.amount);
  const deducoes = sum(group('deducao', 'saida'), (e) => e.amount) + outrosMetrics;
  const midia = midiaMetrics + sum(group('trafego', 'saida'), (e) => e.amount);
  const operacionais = sum(group('operacao', 'saida'), (e) => e.amount);

  const receitaBruta = receitaMetrics + receitaLancada;
  const receitaLiquida = receitaBruta - deducoes;
  const margemContribuicao = receitaLiquida - midia;
  const lucroLiquido = margemContribuicao - operacionais;

  return {
    receitaBruta, receitaMetrics, receitaLancada, deducoesMetrics: outrosMetrics, deducoes, receitaLiquida,
    midia, margemContribuicao, operacionais, lucroLiquido,
    margem: receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0,
    roi: midia > 0 ? (lucroLiquido / midia) * 100 : 0,
    roas: midia > 0 ? receitaBruta / midia : 0,
  };
}

export interface CategoryRow { key: string; label: string; group: string; type: string; total: number; count: number }

export function categoryBreakdown(entries: Entry[]): CategoryRow[] {
  const map = new Map<string, CategoryRow>();
  for (const e of entries) {
    const cat = categoryOf(e.category);
    const cur = map.get(e.category) || {
      key: e.category, label: cat?.label ?? e.category,
      group: cat?.group ?? 'operacao', type: e.type, total: 0, count: 0,
    };
    cur.total += e.amount || 0;
    cur.count += 1;
    map.set(e.category, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Contas a pagar e a receber ainda em aberto, com destaque para o que venceu. */
export function openPayables(entries: Entry[]) {
  const today = todayISO();
  const open = entries.filter((e) => e.status === 'previsto');
  const late = open.filter((e) => (e.dueDate || e.date) < today);
  const sum = (list: Entry[], type: string) =>
    list.filter((e) => e.type === type).reduce((t, e) => t + e.amount, 0);
  return {
    open,
    late,
    aPagar: sum(open, 'saida'),
    aReceber: sum(open, 'entrada'),
    atrasado: sum(late, 'saida'),
  };
}

export interface SectorLoad {
  sectorId: string; total: number; open: number; doing: number; done: number; late: number;
}

export function sectorLoad(tasks: Task[], sectorId: string): SectorLoad {
  const today = todayISO();
  const list = tasks.filter((t) => t.sectorId === sectorId);
  return {
    sectorId,
    total: list.length,
    open: list.filter((t) => t.column !== 'feito').length,
    doing: list.filter((t) => t.column === 'fazendo').length,
    done: list.filter((t) => t.column === 'feito').length,
    late: list.filter((t) => t.column !== 'feito' && t.due && t.due < today).length,
  };
}

export const countByStatus = <T extends { status: string }>(list: T[]) =>
  list.reduce<Record<string, number>>((acc, x) => ((acc[x.status] = (acc[x.status] || 0) + 1), acc), {});
