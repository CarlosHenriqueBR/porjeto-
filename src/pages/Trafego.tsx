import { useMemo, useState } from 'react';
import {
  Banner, Btn, Card, CardHead, Chip, ConfirmModal, Empty, Field, Modal,
  Pill, Segment, Select, SubNav, TableWrap, Tile, useForm,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ProfitBars, RevenueLines, StatusBreakdown } from '@/components/charts';
import { useApp, useUsers } from '@/store/AppContext';
import { navigate, useRoute } from '@/lib/router';
import { ACCOUNT_STATUS, DOMAIN_STATUS, PLATFORMS, STRUCTURE_STATUS, labelOf } from '@/lib/model';
import { brl, fmtDate, int, pct, timeAgo, todayISO } from '@/lib/format';
import { countByStatus, daySeries, profitOf } from '@/lib/calc';
import type { AdAccount, Domain, Metric, Structure } from '@/types';

type Tab = 'visao' | 'dominios' | 'contas' | 'estruturas' | 'metricas';

const TABS: { key: Tab; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'dominios', label: 'Domínios' },
  { key: 'contas', label: 'Contas' },
  { key: 'estruturas', label: 'Estruturas' },
  { key: 'metricas', label: 'Métricas' },
];

export function Trafego() {
  const route = useRoute();
  const { data } = useApp();
  const tab = (TABS.find((t) => t.key === route.sub)?.key ?? 'visao') as Tab;

  return (
    <>
      <SubNav
        tabs={TABS.map((t) => ({
          ...t,
          count: t.key === 'dominios' ? data.domains.length
            : t.key === 'contas' ? data.accounts.length
            : t.key === 'estruturas' ? data.structures.length : undefined,
        }))}
        value={tab}
        onChange={(k) => navigate(`trafego/${k}`)}
      />
      {tab === 'visao' && <Visao />}
      {tab === 'dominios' && <Dominios />}
      {tab === 'contas' && <Contas />}
      {tab === 'estruturas' && <Estruturas />}
      {tab === 'metricas' && <Metricas />}
    </>
  );
}

/* ------------------------------- visão geral ----------------------------- */

function Visao() {
  const { data } = useApp();
  const [days, setDays] = useState(14);
  const series = useMemo(() => daySeries(data.metrics, days), [data.metrics, days]);
  const today = data.metrics.find((m) => m.date === todayISO()) ?? null;
  const totals = series.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, adSpend: t.adSpend + r.adSpend, profit: t.profit + r.profit, sales: t.sales + r.sales }),
    { revenue: 0, adSpend: 0, profit: 0, sales: 0 },
  );
  const roas = totals.adSpend ? totals.revenue / totals.adSpend : 0;

  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 12 }}>
        <Tile label="Lucro hoje" value={brl(profitOf(today))} negative={profitOf(today) < 0}
          foot={<span>{today ? `${int(today.sales ?? 0)} venda(s)` : 'sem lançamento'}</span>} />
        <Tile label={`Lucro em ${days} dias`} value={brl(totals.profit)} negative={totals.profit < 0}
          foot={<span>média {brl(totals.profit / days)}/dia</span>} />
        <Tile label="Investido em mídia" value={brl(totals.adSpend)}
          foot={<span>ROAS {roas.toFixed(2).replace('.', ',')}×</span>} />
        <Tile label="Faturamento" value={brl(totals.revenue)}
          foot={<span>{totals.sales ? `ticket ${brl(totals.revenue / totals.sales)}` : '—'}</span>} />
      </div>

      <div className="grid g-2" style={{ marginBottom: 12 }}>
        <Card>
          <CardHead title="Lucro por dia">
            <Segment options={[{ key: 7, label: '7d' }, { key: 14, label: '14d' }, { key: 30, label: '30d' }]}
              value={days} onChange={setDays} />
          </CardHead>
          <ProfitBars rows={series} />
        </Card>
        <Card>
          <CardHead title="Faturamento × mídia" sub={`${days} dias`} />
          <RevenueLines rows={series} />
        </Card>
      </div>

      <div className="grid g-half">
        <Card>
          <CardHead title="Domínios" sub={`${data.domains.length} total`}>
            <Btn small variant="quiet" onClick={() => navigate('trafego/dominios')}>Gerenciar</Btn>
          </CardHead>
          <StatusBreakdown counts={countByStatus(data.domains)} options={DOMAIN_STATUS} total={data.domains.length} />
        </Card>
        <Card>
          <CardHead title="Contas de anúncio" sub={`${data.accounts.length} total`}>
            <Btn small variant="quiet" onClick={() => navigate('trafego/contas')}>Gerenciar</Btn>
          </CardHead>
          <StatusBreakdown counts={countByStatus(data.accounts)} options={ACCOUNT_STATUS} total={data.accounts.length} />
        </Card>
      </div>
    </>
  );
}

/* -------------------------------- domínios ------------------------------- */

function Dominios() {
  const { data, mutate, toast } = useApp();
  const users = useUsers();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Domain | 'new' | null>(null);
  const [del, setDel] = useState<Domain | null>(null);

  const list = data.domains.filter((d) => {
    if (status && d.status !== status) return false;
    if (!q) return true;
    return `${d.url} ${d.folder} ${d.registrar} ${d.note}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <input className="input" placeholder="Buscar domínio ou pasta…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chip on={!status} onClick={() => setStatus('')}>Todos <b>{data.domains.length}</b></Chip>
        {DOMAIN_STATUS.map((s) => (
          <Chip key={s.key} on={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label} <b>{data.domains.filter((d) => d.status === s.key).length}</b>
          </Chip>
        ))}
        <span style={{ flex: 1 }} />
        <Btn variant="primary" icon="plus" onClick={() => setEditing('new')}>Novo domínio</Btn>
      </div>

      {list.length === 0 ? (
        <Empty text="Nenhum domínio com esse filtro."
          action={<Btn icon="plus" onClick={() => setEditing('new')}>Cadastrar domínio</Btn>} />
      ) : (
        <TableWrap>
          <table className="tbl">
            <thead>
              <tr><th>Domínio</th><th>Pasta</th><th>Status</th><th>Conta / estrutura</th><th>Atualizado</th><th /></tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const acc = data.accounts.find((a) => a.id === d.accountId);
                const st = data.structures.find((s) => s.id === d.structureId);
                return (
                  <tr key={d.id}>
                    <td data-label="Domínio">
                      <div className="split" style={{ minWidth: 0 }}>
                        <a className="mono" href={`https://${d.url}`} target="_blank" rel="noopener noreferrer"
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.url}</a>
                        <span className="muted" style={{ display: 'flex' }}><Icon name="external" size={13} /></span>
                      </div>
                      {d.registrar && <div className="t-sub">{d.registrar}</div>}
                    </td>
                    <td data-label="Pasta"><span className="mono t-sub">{d.folder || '—'}</span></td>
                    <td data-label="Status">
                      <select
                        className="select" data-st-val={d.status} value={d.status}
                        style={{ padding: '5px 26px 5px 9px', fontSize: 12.5, width: 'auto', minWidth: 126 }}
                        onChange={async (e) => {
                          try {
                            await mutate('domain.status', { id: d.id, status: e.target.value });
                            toast('Status atualizado', 'good');
                          } catch { toast('Não foi possível atualizar', 'bad'); }
                        }}
                      >
                        {DOMAIN_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td data-label="Vínculo">
                      <div className="t-sub">{acc?.name ?? '—'}{st ? ` · ${st.name}` : ''}</div>
                    </td>
                    <td data-label="Atualizado">
                      <span className="t-sub">
                        {timeAgo(d.updatedAt || d.createdAt)}
                        {d.updatedBy ? ` · ${users.byId(d.updatedBy)?.name.split(' ')[0] ?? ''}` : ''}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Btn variant="quiet" icon="edit" aria-label="Editar" onClick={() => setEditing(d)} />
                        <Btn variant="quiet" icon="trash" aria-label="Excluir" onClick={() => setDel(d)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing && <DomainModal domain={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {del && (
        <ConfirmModal title="Excluir domínio" message={<>O domínio <b>{del.url}</b> será removido.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => { await mutate('domain.delete', { id: del.id }); toast('Domínio excluído'); }} />
      )}
    </>
  );
}

function DomainModal({ domain, onClose }: { domain: Domain | null; onClose: () => void }) {
  const { data, mutate, toast } = useApp();
  const { values, set, bind } = useForm({
    url: domain?.url ?? '', folder: domain?.folder ?? '', registrar: domain?.registrar ?? '',
    status: domain?.status ?? 'online', accountId: domain?.accountId ?? '',
    structureId: domain?.structureId ?? '', note: domain?.note ?? '',
  });

  return (
    <Modal title={domain ? 'Editar domínio' : 'Novo domínio'} submitLabel={domain ? 'Salvar' : 'Cadastrar'}
      onClose={onClose}
      onSubmit={async () => {
        await mutate('domain.save', { ...values, id: domain?.id });
        toast(domain ? 'Domínio atualizado' : 'Domínio cadastrado', 'good');
      }}>
      <Field label="Domínio">
        <input className="input" required placeholder="meusite.com.br" {...bind('url')} />
      </Field>
      <div className="grid-2">
        <Field label="Pasta / diretório">
          <input className="input" placeholder="/estrutura-01" {...bind('folder')} />
        </Field>
        <Field label="Registrador">
          <input className="input" placeholder="Namecheap" {...bind('registrar')} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Status">
          <Select options={DOMAIN_STATUS} value={values.status} onChange={(e) => set('status', e.target.value as Domain['status'])} />
        </Field>
        <Field label="Conta de anúncio">
          <Select options={[{ key: '', label: '— nenhuma —' }, ...data.accounts.map((a) => ({ key: a.id, label: a.name }))]}
            value={values.accountId} onChange={(e) => set('accountId', e.target.value)} />
        </Field>
      </div>
      <Field label="Estrutura">
        <Select options={[{ key: '', label: '— nenhuma —' }, ...data.structures.map((s) => ({ key: s.id, label: s.name }))]}
          value={values.structureId} onChange={(e) => set('structureId', e.target.value)} />
      </Field>
      <Field label="Observações">
        <textarea className="textarea" placeholder="Cloudflare, DNS, quem comprou…" {...bind('note')} />
      </Field>
    </Modal>
  );
}

/* --------------------------------- contas -------------------------------- */

function Contas() {
  const { data, mutate, toast } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<AdAccount | 'new' | null>(null);
  const [del, setDel] = useState<AdAccount | null>(null);

  const list = data.accounts.filter((a) => {
    if (status && a.status !== status) return false;
    if (!q) return true;
    return `${a.name} ${a.adsId} ${a.email} ${a.note}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <input className="input" placeholder="Buscar conta, ID ou e-mail…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chip on={!status} onClick={() => setStatus('')}>Todas <b>{data.accounts.length}</b></Chip>
        {ACCOUNT_STATUS.map((s) => (
          <Chip key={s.key} on={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label} <b>{data.accounts.filter((a) => a.status === s.key).length}</b>
          </Chip>
        ))}
        <span style={{ flex: 1 }} />
        <Btn variant="primary" icon="plus" onClick={() => setEditing('new')}>Nova conta</Btn>
      </div>

      {list.length === 0 ? (
        <Empty text="Nenhuma conta com esse filtro."
          action={<Btn icon="plus" onClick={() => setEditing('new')}>Cadastrar conta</Btn>} />
      ) : (
        <TableWrap>
          <table className="tbl">
            <thead>
              <tr><th>Conta</th><th>Plataforma / ID</th><th>Status</th><th className="num">Budget</th><th>Domínios</th><th /></tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const linked = data.domains.filter((d) => d.accountId === a.id);
                return (
                  <tr key={a.id}>
                    <td data-label="Conta">
                      <b style={{ fontWeight: 550 }}>{a.name}</b>
                      {a.note && <div className="t-sub" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.note}</div>}
                    </td>
                    <td data-label="Plataforma">
                      <div className="t-sub">{labelOf(PLATFORMS, a.platform)}</div>
                      <div className="mono t-sub">{a.adsId || '—'}</div>
                    </td>
                    <td data-label="Status">
                      <select
                        className="select" data-st-val={a.status} value={a.status}
                        style={{ padding: '5px 26px 5px 9px', fontSize: 12.5, width: 'auto', minWidth: 140 }}
                        onChange={async (e) => {
                          try {
                            await mutate('account.status', { id: a.id, status: e.target.value });
                            toast('Status atualizado', 'good');
                          } catch { toast('Não foi possível atualizar', 'bad'); }
                        }}
                      >
                        {ACCOUNT_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td data-label="Budget" className="num">{a.budget ? brl(a.budget) : '—'}</td>
                    <td data-label="Domínios">
                      <span className="t-sub">
                        {linked.length}{linked.length ? ` · ${linked.filter((d) => d.status === 'online').length} on` : ''}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Btn variant="quiet" icon="edit" aria-label="Editar" onClick={() => setEditing(a)} />
                        <Btn variant="quiet" icon="trash" aria-label="Excluir" onClick={() => setDel(a)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing && <AccountModal account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {del && (
        <ConfirmModal title="Excluir conta" message={<>A conta <b>{del.name}</b> será removida.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => { await mutate('account.delete', { id: del.id }); toast('Conta excluída'); }} />
      )}
    </>
  );
}

function AccountModal({ account, onClose }: { account: AdAccount | null; onClose: () => void }) {
  const { mutate, toast } = useApp();
  const { values, set, bind } = useForm({
    name: account?.name ?? '', platform: account?.platform ?? 'google', adsId: account?.adsId ?? '',
    email: account?.email ?? '', status: account?.status ?? 'online',
    budget: account ? String(account.budget || '') : '', note: account?.note ?? '',
  });

  return (
    <Modal title={account ? 'Editar conta' : 'Nova conta de anúncio'} submitLabel={account ? 'Salvar' : 'Cadastrar'}
      onClose={onClose}
      onSubmit={async () => {
        await mutate('account.save', { ...values, id: account?.id });
        toast(account ? 'Conta atualizada' : 'Conta cadastrada', 'good');
      }}>
      <Field label="Nome da conta">
        <input className="input" required placeholder="Conta 03 — BM Carlos" {...bind('name')} />
      </Field>
      <div className="grid-2">
        <Field label="Plataforma">
          <Select options={PLATFORMS} value={values.platform} onChange={(e) => set('platform', e.target.value as AdAccount['platform'])} />
        </Field>
        <Field label="ID da conta">
          <input className="input mono" placeholder="123-456-7890" {...bind('adsId')} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="E-mail vinculado">
          <input className="input" type="email" placeholder="conta@gmail.com" {...bind('email')} />
        </Field>
        <Field label="Budget diário (R$)">
          <input className="input" type="number" step="0.01" min="0" placeholder="500" {...bind('budget')} />
        </Field>
      </div>
      <Field label="Status">
        <Select options={ACCOUNT_STATUS} value={values.status} onChange={(e) => set('status', e.target.value as AdAccount['status'])} />
      </Field>
      <Field label="Observações">
        <textarea className="textarea" placeholder="Método de pagamento, histórico de bloqueio…" {...bind('note')} />
      </Field>
    </Modal>
  );
}

/* ------------------------------- estruturas ------------------------------ */

function Estruturas() {
  const { data, mutate, toast } = useApp();
  const users = useUsers();
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Structure | 'new' | null>(null);
  const [del, setDel] = useState<Structure | null>(null);

  const list = data.structures.filter((s) => !status || s.status === status);

  return (
    <>
      <div className="toolbar">
        <Chip on={!status} onClick={() => setStatus('')}>Todas <b>{data.structures.length}</b></Chip>
        {STRUCTURE_STATUS.map((s) => (
          <Chip key={s.key} on={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label} <b>{data.structures.filter((x) => x.status === s.key).length}</b>
          </Chip>
        ))}
        <span style={{ flex: 1 }} />
        <Btn variant="primary" icon="plus" onClick={() => setEditing('new')}>Estrutura nova</Btn>
      </div>
      <p className="card-sub" style={{ margin: '-8px 0 14px' }}>
        Ao criar uma estrutura, todo mundo da equipe é notificado na hora.
      </p>

      {list.length === 0 ? (
        <Empty text="Nenhuma estrutura cadastrada."
          action={<Btn icon="plus" onClick={() => setEditing('new')}>Criar estrutura</Btn>} />
      ) : (
        <div className="grid g-kpi">
          {list.map((s) => {
            const dom = data.domains.find((d) => d.id === s.domainId);
            const acc = data.accounts.find((a) => a.id === s.accountId);
            return (
              <Card key={s.id}>
                <div className="card-head">
                  <Pill status={s.status} options={STRUCTURE_STATUS} />
                  <span className="spacer" />
                  <Btn variant="quiet" icon="edit" aria-label="Editar" onClick={() => setEditing(s)} />
                  <Btn variant="quiet" icon="trash" aria-label="Excluir" onClick={() => setDel(s)} />
                </div>
                <h3 style={{ fontSize: 15, marginBottom: 3 }}>{s.name}</h3>
                <p className="card-sub" style={{ margin: '0 0 12px' }}>{s.offer || 'sem oferta definida'}</p>
                <div className="stacklegend" style={{ gap: 6 }}>
                  <div className="r"><span className="muted">Domínio</span><span className="v mono">{dom?.url ?? '—'}</span></div>
                  <div className="r"><span className="muted">Conta</span><span className="v">{acc?.name ?? '—'}</span></div>
                  <div className="r">
                    <span className="muted">Criada</span>
                    <span className="v">{timeAgo(s.createdAt)} · {users.byId(s.createdBy)?.name.split(' ')[0] ?? '—'}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <StructureModal structure={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {del && (
        <ConfirmModal title="Excluir estrutura" message={<>A estrutura <b>{del.name}</b> será removida.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => { await mutate('structure.delete', { id: del.id }); toast('Estrutura excluída'); }} />
      )}
    </>
  );
}

function StructureModal({ structure, onClose }: { structure: Structure | null; onClose: () => void }) {
  const { data, mutate, toast } = useApp();
  const { values, set, bind } = useForm({
    name: structure?.name ?? '', offer: structure?.offer ?? '',
    domainId: structure?.domainId ?? '', accountId: structure?.accountId ?? '',
    status: structure?.status ?? 'ativa', note: structure?.note ?? '',
  });

  return (
    <Modal
      title={structure ? 'Editar estrutura' : 'Estrutura nova'}
      submitLabel={structure ? 'Salvar' : 'Criar e notificar equipe'}
      onClose={onClose}
      onSubmit={async () => {
        await mutate('structure.save', { ...values, id: structure?.id });
        toast(structure ? 'Estrutura atualizada' : 'Estrutura criada — equipe notificada', 'good');
      }}
    >
      <Field label="Nome da estrutura">
        <input className="input" required placeholder="Estrutura 04 — Black" {...bind('name')} />
      </Field>
      <Field label="Oferta / produto">
        <input className="input" placeholder="Emagrecimento VSL" {...bind('offer')} />
      </Field>
      <div className="grid-2">
        <Field label="Domínio">
          <Select options={[{ key: '', label: '— nenhum —' }, ...data.domains.map((d) => ({ key: d.id, label: d.url }))]}
            value={values.domainId} onChange={(e) => set('domainId', e.target.value)} />
        </Field>
        <Field label="Conta de anúncio">
          <Select options={[{ key: '', label: '— nenhuma —' }, ...data.accounts.map((a) => ({ key: a.id, label: a.name }))]}
            value={values.accountId} onChange={(e) => set('accountId', e.target.value)} />
        </Field>
      </div>
      <Field label="Status">
        <Select options={STRUCTURE_STATUS} value={values.status} onChange={(e) => set('status', e.target.value as Structure['status'])} />
      </Field>
      <Field label="Observações">
        <textarea className="textarea" placeholder="Copy, criativos, checkout…" {...bind('note')} />
      </Field>
    </Modal>
  );
}

/* -------------------------------- métricas ------------------------------- */

function Metricas() {
  const { data, mutate, toast } = useApp();
  const [days, setDays] = useState(30);
  const [editing, setEditing] = useState<string | null>(null);
  const series = useMemo(() => daySeries(data.metrics, days).slice().reverse(), [data.metrics, days]);
  const lastSync = data.settings.utmifyLastSync;
  const [syncing, setSyncing] = useState(false);

  return (
    <>
      <div className="toolbar">
        <Segment options={[{ key: 7, label: '7 dias' }, { key: 30, label: '30 dias' }, { key: 90, label: '90 dias' }]}
          value={days} onChange={setDays} />
        <span style={{ flex: 1 }} />
        <span className="card-sub">{lastSync ? `UTMify: ${timeAgo(lastSync)}` : 'UTMify não sincronizada'}</span>
        <Btn icon="refresh" disabled={syncing} onClick={async () => {
          setSyncing(true);
          try {
            const r = await fetch('/api/sync-utmify', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            const j = await r.json();
            toast(j.ok ? `Sincronizado: ${j.applied} dia(s)` : 'UTMify ainda não configurada (veja o README)', j.ok ? 'good' : 'info');
          } catch { toast('Falha ao sincronizar', 'bad'); }
          finally { setSyncing(false); }
        }}>Sincronizar</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setEditing(todayISO())}>Lançar dia</Btn>
      </div>

      {!data.metrics.some((m) => m.date === todayISO()) && (
        <Banner>Ainda não há lançamento de hoje.
          <Btn small style={{ marginLeft: 'auto' }} onClick={() => setEditing(todayISO())}>Lançar agora</Btn>
        </Banner>
      )}

      <TableWrap responsive={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Dia</th><th className="num">Faturamento</th><th className="num">Mídia</th>
              <th className="num">Outros</th><th className="num">Lucro</th>
              <th className="num">ROI</th><th className="num">Vendas</th><th>Origem</th><th />
            </tr>
          </thead>
          <tbody>
            {series.map((r) => {
              const m = data.metrics.find((x) => x.date === r.date);
              return (
                <tr key={r.date}>
                  <td>
                    <b style={{ fontWeight: 550 }}>{fmtDate(r.date)}</b>
                    <div className="t-sub">{new Date(`${r.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })}</div>
                  </td>
                  <td className="num">{r.has ? brl(r.revenue) : <span className="t-sub">—</span>}</td>
                  <td className="num">{r.has ? brl(r.adSpend) : <span className="t-sub">—</span>}</td>
                  <td className="num">{r.has ? brl(r.otherCost) : <span className="t-sub">—</span>}</td>
                  <td className="num" style={{ fontWeight: 600, color: !r.has ? 'var(--muted)' : r.profit >= 0 ? 'var(--ink)' : '#e88b8b' }}>
                    {r.has ? brl(r.profit) : '—'}
                  </td>
                  <td className="num">{r.has && r.adSpend ? pct((r.profit / r.adSpend) * 100, 0) : <span className="t-sub">—</span>}</td>
                  <td className="num">{r.sales || <span className="t-sub">—</span>}</td>
                  <td>
                    {m?.source === 'utmify'
                      ? <span className="pill st-restabelecida"><i className="dot" />UTMify</span>
                      : m ? <span className="pill st-off"><i className="dot" />Manual</span> : null}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Btn variant="quiet" icon="edit" aria-label="Editar" onClick={() => setEditing(r.date)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      {editing && <MetricModal date={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MetricModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { data, mutate, toast } = useApp();
  const m: Metric | undefined = data.metrics.find((x) => x.date === date);
  const { values, bind } = useForm({
    date,
    revenue: m ? String(m.revenue) : '',
    adSpend: m ? String(m.adSpend) : '',
    otherCost: m ? String(m.otherCost) : '',
    sales: m?.sales ? String(m.sales) : '',
    clicks: m?.clicks ? String(m.clicks) : '',
    note: m?.note ?? '',
  });

  const profit = Number(values.revenue || 0) - Number(values.adSpend || 0) - Number(values.otherCost || 0);

  return (
    <Modal title={`Métricas de ${fmtDate(date)}`} onClose={onClose}
      onSubmit={async () => { await mutate('metric.save', values); toast('Métricas salvas', 'good'); }}>
      <Field label="Data">
        <input className="input" type="date" required max={todayISO()} {...bind('date')} />
      </Field>
      <div className="grid-2">
        <Field label="Faturamento (R$)">
          <input className="input" type="number" step="0.01" min="0" placeholder="0,00" {...bind('revenue')} />
        </Field>
        <Field label="Gasto com mídia (R$)">
          <input className="input" type="number" step="0.01" min="0" placeholder="0,00" {...bind('adSpend')} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Outros custos (R$)" hint="taxas, gateway">
          <input className="input" type="number" step="0.01" min="0" placeholder="0,00" {...bind('otherCost')} />
        </Field>
        <Field label="Vendas" hint="opcional">
          <input className="input" type="number" min="0" placeholder="0" {...bind('sales')} />
        </Field>
      </div>
      <Field label="Observação">
        <input className="input" placeholder="opcional" {...bind('note')} />
      </Field>
      <p className="card-sub" style={{ marginTop: 14 }}>
        Lucro do dia: <b style={{ color: profit >= 0 ? 'var(--ink)' : '#e88b8b' }}>{brl(profit)}</b>
        {' '}— entra direto no DRE do mês.
      </p>
    </Modal>
  );
}
