import { useMemo, useState } from 'react';
import {
  Banner, Btn, Card, CardHead, Chip, ConfirmModal, Empty, Field, Modal,
  Segment, Select, SubNav, TableWrap, Tile, useForm,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ProfitBars } from '@/components/charts';
import { useApp } from '@/store/AppContext';
import { navigate, useRoute } from '@/lib/router';
import { CATEGORIES, ENTRY_STATUS, RECURRENCE, categoriesFor, categoryOf } from '@/lib/model';
import { brl, fmtDate, fmtMonth, monthISO, pct, todayISO } from '@/lib/format';
import { buildDre, categoryBreakdown, daySeries, inMonth, openPayables } from '@/lib/calc';
import type { Entry, EntryType } from '@/types';

type Tab = 'visao' | 'lancamentos' | 'contas' | 'dre';

const TABS: { key: Tab; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'lancamentos', label: 'Lançamentos' },
  { key: 'contas', label: 'A pagar / receber' },
  { key: 'dre', label: 'DRE' },
];

export function Financas() {
  const route = useRoute();
  const { data } = useApp();
  const tab = (TABS.find((t) => t.key === route.sub)?.key ?? 'visao') as Tab;
  const [month, setMonth] = useState(monthISO());
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);

  const monthEntries = useMemo(() => inMonth(data.entries, month), [data.entries, month]);
  const monthMetrics = useMemo(() => inMonth(data.metrics, month), [data.metrics, month]);
  const dre = useMemo(() => buildDre(monthEntries, monthMetrics), [monthEntries, monthMetrics]);
  const payables = useMemo(() => openPayables(data.entries), [data.entries]);

  const months = useMemo(() => {
    const set = new Set<string>([monthISO()]);
    for (const e of data.entries) set.add(e.date.slice(0, 7));
    for (const m of data.metrics) set.add(m.date.slice(0, 7));
    return [...set].sort().reverse().slice(0, 12);
  }, [data.entries, data.metrics]);

  return (
    <>
      <SubNav
        tabs={TABS.map((t) => ({ ...t, count: t.key === 'contas' ? payables.open.length || undefined : undefined }))}
        value={tab}
        onChange={(k) => navigate(`financas/${k}`)}
      />

      <div className="toolbar">
        <Select
          options={months.map((m) => ({ key: m, label: fmtMonth(m) }))}
          value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ width: 'auto', minWidth: 190 }}
        />
        <span style={{ flex: 1 }} />
        <Btn variant="primary" icon="plus" onClick={() => setEditing('new')}>Novo lançamento</Btn>
      </div>

      {tab === 'visao' && <Visao dre={dre} month={month} />}
      {tab === 'lancamentos' && <Lancamentos entries={monthEntries} onEdit={setEditing} />}
      {tab === 'contas' && <Contas />}
      {tab === 'dre' && <Dre dre={dre} entries={monthEntries} month={month} />}

      {editing && (
        <EntryModal
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/* ------------------------------- visão geral ----------------------------- */

function Visao({ dre, month }: { dre: ReturnType<typeof buildDre>; month: string }) {
  const { data } = useApp();
  const [days, setDays] = useState(30);
  const series = useMemo(() => daySeries(data.metrics, days), [data.metrics, days]);
  const payables = useMemo(() => openPayables(data.entries), [data.entries]);
  const isCurrent = month === monthISO();

  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 12 }}>
        <Tile label="Lucro líquido" value={brl(dre.lucroLiquido)} negative={dre.lucroLiquido < 0}
          foot={<span>margem {pct(dre.margem, 1)}</span>} />
        <Tile label="Receita bruta" value={brl(dre.receitaBruta)}
          foot={<span>ROAS {dre.roas.toFixed(2).replace('.', ',')}×</span>} />
        <Tile label="Custo de mídia" value={brl(dre.midia)}
          foot={<span>{dre.receitaBruta ? pct((dre.midia / dre.receitaBruta) * 100, 0) : '0%'} da receita</span>} />
        <Tile label="Despesas operacionais" value={brl(dre.operacionais)}
          foot={<span>+ {brl(dre.deducoes)} de deduções</span>} />
      </div>

      {isCurrent && (payables.aPagar > 0 || payables.aReceber > 0) && (
        <Banner kind="info" icon="clock">
          Em aberto: <b>{brl(payables.aPagar)}</b> a pagar e <b>{brl(payables.aReceber)}</b> a receber
          {payables.late.length > 0 ? ` · ${payables.late.length} já venceu` : ''}.
        </Banner>
      )}

      <Card style={{ marginBottom: 12 }}>
        <CardHead title="Lucro por dia">
          <Segment options={[{ key: 14, label: '14d' }, { key: 30, label: '30d' }, { key: 60, label: '60d' }]}
            value={days} onChange={setDays} />
        </CardHead>
        <ProfitBars rows={series} />
      </Card>

      <div className="grid g-half">
        <Card>
          <CardHead title="Para onde foi o dinheiro" sub={fmtMonth(month)} />
          <SaidasBreakdown month={month} />
        </Card>
        <Card>
          <CardHead title="Composição da receita" sub={fmtMonth(month)} />
          <div className="stacklegend" style={{ gap: 11 }}>
            <Row label="Vendas (tráfego)" value={brl(dre.receitaMetrics)} color="var(--s3)" />
            <Row label="Outras entradas" value={brl(dre.receitaLancada)} color="var(--s1)" />
            <Row label="Deduções" value={`− ${brl(dre.deducoes)}`} color="var(--s4)" />
            <div className="r" style={{ borderTop: '1px solid var(--hair)', paddingTop: 11 }}>
              <i style={{ background: 'transparent' }} />Receita líquida
              <span className="v" style={{ fontWeight: 650 }}>{brl(dre.receitaLiquida)}</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="r">
      <i style={{ background: color }} />{label}
      <span className="v">{value}</span>
    </div>
  );
}

function SaidasBreakdown({ month }: { month: string }) {
  const { data } = useApp();
  const rows = useMemo(() => {
    const saidas = inMonth(data.entries, month).filter((e) => e.type === 'saida');
    const metrics = inMonth(data.metrics, month);
    const midia = metrics.reduce((t, m) => t + m.adSpend, 0);
    const list = categoryBreakdown(saidas);
    if (midia > 0) {
      const existing = list.find((r) => r.key === 'trafego');
      if (existing) existing.total += midia;
      else list.push({ key: 'trafego', label: 'Tráfego (mídia)', group: 'trafego', type: 'saida', total: midia, count: metrics.length });
    }
    return list.sort((a, b) => b.total - a.total);
  }, [data.entries, data.metrics, month]);

  const total = rows.reduce((t, r) => t + r.total, 0);
  const COLORS = ['var(--s2)', 'var(--s4)', 'var(--s7)', 'var(--s5)', 'var(--s1)', 'var(--s3)', 'var(--s8)'];

  if (!rows.length) return <p className="card-sub">Nenhuma saída lançada neste mês.</p>;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.slice(0, 8).map((r, i) => (
        <div key={r.key}>
          <div className="split" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>{r.label}</span>
            <span className="spacer" />
            <span className="card-sub num">{pct(total ? (r.total / total) * 100 : 0, 0)}</span>
            <span className="num" style={{ fontWeight: 550, minWidth: 92, textAlign: 'right' }}>{brl(r.total)}</span>
          </div>
          <div className="meter">
            <i style={{ width: `${total ? (r.total / total) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- lançamentos ----------------------------- */

function Lancamentos({ entries, onEdit }: { entries: Entry[]; onEdit: (e: Entry) => void }) {
  const { mutate, toast } = useApp();
  const [filter, setFilter] = useState<'todos' | EntryType>('todos');
  const [q, setQ] = useState('');
  const [del, setDel] = useState<Entry | null>(null);

  const list = entries.filter((e) => {
    if (filter !== 'todos' && e.type !== filter) return false;
    if (!q) return true;
    const cat = categoryOf(e.category)?.label ?? '';
    return `${e.description} ${cat} ${e.method}`.toLowerCase().includes(q.toLowerCase());
  });

  const totalIn = list.filter((e) => e.type === 'entrada').reduce((t, e) => t + e.amount, 0);
  const totalOut = list.filter((e) => e.type === 'saida').reduce((t, e) => t + e.amount, 0);

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <input className="input" placeholder="Buscar descrição ou categoria…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chip on={filter === 'todos'} onClick={() => setFilter('todos')}>Todos <b>{entries.length}</b></Chip>
        <Chip on={filter === 'entrada'} onClick={() => setFilter('entrada')}>Entradas</Chip>
        <Chip on={filter === 'saida'} onClick={() => setFilter('saida')}>Saídas</Chip>
        <span style={{ flex: 1 }} />
        <span className="card-sub">
          <span className="type-in">+{brl(totalIn)}</span> · <span className="type-out">−{brl(totalOut)}</span>
        </span>
      </div>

      {list.length === 0 ? (
        <Empty text="Nenhum lançamento com esse filtro." />
      ) : (
        <TableWrap>
          <table className="tbl">
            <thead>
              <tr>
                <th>Data</th><th>Descrição</th><th>Categoria</th>
                <th className="num">Valor</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const cat = categoryOf(e.category);
                const late = e.status === 'previsto' && (e.dueDate || e.date) < todayISO();
                return (
                  <tr key={e.id}>
                    <td data-label="Data">
                      <b style={{ fontWeight: 550 }}>{fmtDate(e.date)}</b>
                      {e.dueDate && e.dueDate !== e.date && <div className="t-sub">vence {fmtDate(e.dueDate)}</div>}
                    </td>
                    <td data-label="Descrição">
                      {e.description || <span className="t-sub">—</span>}
                      {e.recurrence !== 'nenhuma' && <div className="t-sub">repete {e.recurrence}</div>}
                    </td>
                    <td data-label="Categoria"><span className="pill st-off"><i className="dot" />{cat?.label ?? e.category}</span></td>
                    <td data-label="Valor" className="num">
                      <span className={e.type === 'entrada' ? 'type-in' : 'type-out'} style={{ fontWeight: 600 }}>
                        {e.type === 'entrada' ? '+' : '−'}{brl(e.amount)}
                      </span>
                    </td>
                    <td data-label="Status">
                      {late ? <span className="late-chip">vencido</span>
                        : <span className={`pill ${e.status === 'liquidado' ? 'st-online' : 'st-usado'}`}>
                            <i className="dot" />{e.status === 'liquidado' ? 'Liquidado' : 'Previsto'}
                          </span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Btn variant="quiet" icon="edit" aria-label="Editar" onClick={() => onEdit(e)} />
                        <Btn variant="quiet" icon="trash" aria-label="Excluir" onClick={() => setDel(e)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {del && (
        <ConfirmModal
          title="Excluir lançamento"
          message={<>O lançamento de <b>{brl(del.amount)}</b> será removido.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => { await mutate('entry.delete', { id: del.id }); toast('Lançamento excluído'); }}
        />
      )}
    </>
  );
}

/* --------------------------- contas a pagar/receber ---------------------- */

function Contas() {
  const { data, mutate, toast } = useApp();
  const payables = useMemo(() => openPayables(data.entries), [data.entries]);
  const sorted = [...payables.open].sort((a, b) => (a.dueDate || a.date) < (b.dueDate || b.date) ? -1 : 1);

  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 12 }}>
        <Tile label="A pagar" value={brl(payables.aPagar)} foot={<span>{payables.open.filter((e) => e.type === 'saida').length} lançamento(s)</span>} />
        <Tile label="A receber" value={brl(payables.aReceber)} foot={<span>{payables.open.filter((e) => e.type === 'entrada').length} lançamento(s)</span>} />
        <Tile label="Vencido" value={brl(payables.atrasado)} negative={payables.atrasado > 0}
          foot={<span>{payables.late.length} em atraso</span>} />
        <Tile label="Saldo previsto" value={brl(payables.aReceber - payables.aPagar)}
          negative={payables.aReceber - payables.aPagar < 0} foot={<span>se tudo liquidar</span>} />
      </div>

      {sorted.length === 0 ? (
        <Empty text="Nada em aberto. Todo lançamento previsto já foi liquidado." />
      ) : (
        <TableWrap>
          <table className="tbl">
            <thead>
              <tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th><th /></tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const due = e.dueDate || e.date;
                const late = due < todayISO();
                return (
                  <tr key={e.id}>
                    <td data-label="Vencimento">
                      <b style={{ fontWeight: 550 }}>{fmtDate(due)}</b>
                      {late && <div><span className="late-chip">vencido</span></div>}
                    </td>
                    <td data-label="Descrição">{e.description || <span className="t-sub">—</span>}</td>
                    <td data-label="Categoria"><span className="t-sub">{categoryOf(e.category)?.label}</span></td>
                    <td data-label="Valor" className="num">
                      <span className={e.type === 'entrada' ? 'type-in' : 'type-out'} style={{ fontWeight: 600 }}>
                        {e.type === 'entrada' ? '+' : '−'}{brl(e.amount)}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Btn small icon="check" onClick={async () => {
                          await mutate('entry.settle', { id: e.id });
                          toast(e.type === 'entrada' ? 'Marcado como recebido' : 'Marcado como pago', 'good');
                        }}>
                          {e.type === 'entrada' ? 'Recebi' : 'Paguei'}
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}

/* ---------------------------------- DRE ---------------------------------- */

function Dre({ dre, entries, month }: { dre: ReturnType<typeof buildDre>; entries: Entry[]; month: string }) {
  const breakdown = categoryBreakdown(entries.filter((e) => e.type === 'saida'));
  const byGroup = (g: string) => breakdown.filter((r) => r.group === g);

  return (
    <Card>
      <CardHead title={`DRE · ${fmtMonth(month)}`} sub="regime de competência pela data do lançamento" />
      <table className="dre">
        <tbody>
          <tr>
            <td className="lbl">Receita bruta</td>
            <td>{brl(dre.receitaBruta)}</td>
          </tr>
          <tr className="sub"><td>Vendas registradas no tráfego</td><td>{brl(dre.receitaMetrics)}</td></tr>
          {dre.receitaLancada > 0 && <tr className="sub"><td>Outras entradas</td><td>{brl(dre.receitaLancada)}</td></tr>}

          <tr>
            <td className="lbl"><span className="op">(−)</span>Deduções</td>
            <td className="neg">{brl(dre.deducoes)}</td>
          </tr>
          {dre.deducoesMetrics > 0 && (
            <tr className="sub"><td>Taxas registradas no tráfego</td><td>{brl(dre.deducoesMetrics)}</td></tr>
          )}
          {byGroup('deducao').map((r) => (
            <tr className="sub" key={r.key}><td>{r.label}</td><td>{brl(r.total)}</td></tr>
          ))}

          <tr className="total">
            <td>Receita líquida</td>
            <td>{brl(dre.receitaLiquida)}</td>
          </tr>

          <tr>
            <td className="lbl"><span className="op">(−)</span>Custo de mídia</td>
            <td className="neg">{brl(dre.midia)}</td>
          </tr>

          <tr className="total">
            <td>Margem de contribuição</td>
            <td className={dre.margemContribuicao >= 0 ? 'pos' : 'neg'}>{brl(dre.margemContribuicao)}</td>
          </tr>

          <tr>
            <td className="lbl"><span className="op">(−)</span>Despesas operacionais</td>
            <td className="neg">{brl(dre.operacionais)}</td>
          </tr>
          {byGroup('operacao').map((r) => (
            <tr className="sub" key={r.key}><td>{r.label}</td><td>{brl(r.total)}</td></tr>
          ))}

          <tr className="total">
            <td>Lucro líquido</td>
            <td className={dre.lucroLiquido >= 0 ? 'pos' : 'neg'}>{brl(dre.lucroLiquido)}</td>
          </tr>
        </tbody>
      </table>

      <div className="kpi-strip" style={{ marginTop: 18 }}>
        <div><div className="tile-label">Margem líquida</div><div style={{ fontSize: 18, fontWeight: 650 }}>{pct(dre.margem, 1)}</div></div>
        <div><div className="tile-label">ROI sobre mídia</div><div style={{ fontSize: 18, fontWeight: 650 }}>{pct(dre.roi, 0)}</div></div>
        <div><div className="tile-label">ROAS</div><div style={{ fontSize: 18, fontWeight: 650 }}>{dre.roas.toFixed(2).replace('.', ',')}×</div></div>
      </div>
    </Card>
  );
}

/* -------------------------------- formulário ----------------------------- */

function EntryModal({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const { data, mutate, toast } = useApp();
  const form = useForm({
    date: entry?.date ?? todayISO(),
    dueDate: entry?.dueDate ?? '',
    type: (entry?.type ?? 'saida') as EntryType,
    category: entry?.category ?? 'ferramentas',
    amount: entry ? String(entry.amount) : '',
    description: entry?.description ?? '',
    status: entry?.status ?? 'liquidado',
    recurrence: entry?.recurrence ?? 'nenhuma',
    structureId: entry?.structureId ?? '',
    method: entry?.method ?? '',
  });
  const { values, set, bind } = form;

  const cats = categoriesFor(values.type);
  const catValid = cats.some((c) => c.key === values.category);
  const category = catValid ? values.category : cats[0].key;
  const isTrafego = category === 'trafego';
  const isVendas = category === 'vendas';

  return (
    <Modal
      title={entry ? 'Editar lançamento' : 'Novo lançamento'}
      submitLabel={entry ? 'Salvar' : 'Lançar'}
      onClose={onClose}
      onSubmit={async () => {
        await mutate('entry.save', { ...values, category, id: entry?.id });
        toast(entry ? 'Lançamento atualizado' : 'Lançamento registrado', 'good');
      }}
    >
      <div className="segment" style={{ width: '100%' }}>
        <button type="button" style={{ flex: 1 }} aria-pressed={values.type === 'entrada'}
          onClick={() => set('type', 'entrada')}>Entrada</button>
        <button type="button" style={{ flex: 1 }} aria-pressed={values.type === 'saida'}
          onClick={() => set('type', 'saida')}>Saída</button>
      </div>

      <div className="grid-2">
        <Field label="Valor (R$)">
          <input className="input" type="number" step="0.01" min="0" required placeholder="0,00" {...bind('amount')} />
        </Field>
        <Field label="Categoria">
          <Select options={cats.map((c) => ({ key: c.key, label: c.label }))}
            value={category} onChange={(e) => set('category', e.target.value)} />
        </Field>
      </div>

      {(isTrafego || isVendas) && (
        <p className="card-sub" style={{ marginTop: 10 }}>
          <Icon name="alert" /> O faturamento e a mídia das contas monitoradas já entram pelo módulo de
          Tráfego. Use esta categoria só para o que ficou de fora, senão o valor conta duas vezes no DRE.
        </p>
      )}

      <Field label="Descrição">
        <input className="input" placeholder="Assinatura da ferramenta, freela de edição…" {...bind('description')} />
      </Field>

      <div className="grid-2">
        <Field label="Data">
          <input className="input" type="date" required {...bind('date')} />
        </Field>
        <Field label="Situação">
          <Select options={ENTRY_STATUS} value={values.status} onChange={(e) => set('status', e.target.value as Entry['status'])} />
        </Field>
      </div>

      {values.status === 'previsto' && (
        <Field label="Vencimento" hint="quando precisa ser pago ou recebido">
          <input className="input" type="date" {...bind('dueDate')} />
        </Field>
      )}

      <div className="grid-2">
        <Field label="Repetição">
          <Select options={RECURRENCE} value={values.recurrence}
            onChange={(e) => set('recurrence', e.target.value as Entry['recurrence'])} />
        </Field>
        <Field label="Estrutura" hint="opcional">
          <Select
            options={[{ key: '', label: '— nenhuma —' }, ...data.structures.map((s) => ({ key: s.id, label: s.name }))]}
            value={values.structureId} onChange={(e) => set('structureId', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Forma de pagamento" hint="opcional">
        <input className="input" placeholder="PIX, cartão Nubank, boleto…" {...bind('method')} />
      </Field>
    </Modal>
  );
}

export { CATEGORIES };
