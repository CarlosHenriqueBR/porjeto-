import { useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Avatar, Banner, Btn, Card, CardHead, Segment, Tile } from '@/components/ui';
import { ProfitBars, RevenueLines, StatusBreakdown } from '@/components/charts';
import { useApp, useUsers } from '@/store/AppContext';
import { navigate } from '@/lib/router';
import { ACCOUNT_STATUS, DOMAIN_STATUS, TASK_COLUMNS, TASK_PRIORITY, can, labelOf } from '@/lib/model';
import { brl, monthISO, pct, timeAgo, todayISO, fmtDate } from '@/lib/format';
import { buildDre, countByStatus, daySeries, inMonth, openPayables, profitOf, sectorLoad } from '@/lib/calc';
import type { Pillar } from '@/types';

const RANGES = [{ key: 7, label: '7d' }, { key: 14, label: '14d' }, { key: 30, label: '30d' }];

export function Dashboard() {
  const { data, me } = useApp();
  const users = useUsers();
  const [days, setDays] = useState(14);

  const money = can(me, 'financas');
  const traffic = can(me, 'trafego');
  const logistics = can(me, 'logistica');

  const month = monthISO();
  const series = useMemo(() => daySeries(data.metrics, days), [data.metrics, days]);
  const dre = useMemo(
    () => buildDre(inMonth(data.entries, month), inMonth(data.metrics, month)),
    [data.entries, data.metrics, month],
  );
  const payables = useMemo(() => openPayables(data.entries), [data.entries]);

  const today = data.metrics.find((m) => m.date === todayISO()) ?? null;
  const yesterday = data.metrics.find((m) => m.date === todayISO(-1)) ?? null;
  const profitToday = profitOf(today);
  const profitYest = profitOf(yesterday);
  const delta = profitYest !== 0 ? ((profitToday - profitYest) / Math.abs(profitYest)) * 100 : null;

  const domainCounts = countByStatus(data.domains);
  const accountCounts = countByStatus(data.accounts);
  const down = data.domains.filter((d) => d.status === 'caiu');
  const banned = data.accounts.filter((a) => a.status === 'banida');
  const openTasks = data.tasks.filter((t) => t.column !== 'feito');
  const lateTasks = openTasks.filter((t) => t.due && t.due < todayISO());

  return (
    <>
      {down.length > 0 && (
        <Banner kind="crit">
          <b>{down.length} domínio{down.length > 1 ? 's' : ''} caído{down.length > 1 ? 's' : ''}</b>
          <span>· {down.slice(0, 3).map((d) => d.url).join(', ')}{down.length > 3 ? '…' : ''}</span>
          <Btn small style={{ marginLeft: 'auto' }} onClick={() => navigate('trafego/dominios')}>Ver</Btn>
        </Banner>
      )}
      {banned.length > 0 && (
        <Banner kind="crit">
          <b>{banned.length} conta{banned.length > 1 ? 's' : ''} banida{banned.length > 1 ? 's' : ''}</b>
          <span>· {banned.slice(0, 2).map((a) => a.name).join(', ')}</span>
          <Btn small style={{ marginLeft: 'auto' }} onClick={() => navigate('trafego/contas')}>Ver</Btn>
        </Banner>
      )}
      {money && payables.late.length > 0 && (
        <Banner>
          <b>{payables.late.length} lançamento(s) vencido(s)</b>
          <span>· {brl(payables.atrasado)} em aberto</span>
          <Btn small style={{ marginLeft: 'auto' }} onClick={() => navigate('financas/contas')}>Resolver</Btn>
        </Banner>
      )}

      {/* ------------------------ maquete dos pilares ------------------------ */}
      <h2 style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 12px' }}>
        Os quatro pilares
      </h2>
      <div className="maquete" style={{ marginBottom: 20 }}>
        <PillarCard
          pillar="financas" icon="money" label="Finanças" color="var(--s3)"
          value={money ? brl(dre.lucroLiquido) : null}
          caption="lucro líquido do mês"
          rows={money ? [
            ['Receita bruta', brl(dre.receitaBruta)],
            ['Margem', pct(dre.margem, 0)],
            ['A pagar', brl(payables.aPagar)],
          ] : []}
          to="financas"
        />
        <PillarCard
          pillar="trafego" icon="traffic" label="Tráfego" color="var(--s1)"
          value={traffic || money ? brl(profitToday) : null}
          caption="lucro de hoje"
          rows={traffic ? [
            ['Domínios online', String(domainCounts.online || 0)],
            ['Contas online', String(accountCounts.online || 0)],
            ['Estruturas ativas', String(data.structures.filter((s) => s.status === 'ativa').length)],
          ] : []}
          to="trafego"
        />
        <PillarCard
          pillar="logistica" icon="boxes" label="Logística" color="var(--s7)"
          value={logistics ? String(openTasks.length) : null}
          caption="demandas em aberto"
          rows={logistics ? [
            ['Em execução', String(data.tasks.filter((t) => t.column === 'fazendo').length)],
            ['Atrasadas', String(lateTasks.length)],
            ['Setores', String(data.sectors.length)],
          ] : []}
          to="logistica"
        />
        <PillarCard
          pillar="cofre" icon="lock" label="Cofre" color="var(--s4)"
          value={can(me, 'cofre') ? String(data.vault.length) : null}
          caption="acessos guardados"
          rows={can(me, 'cofre') ? [
            ['Equipe', String(data.users.filter((u) => u.active).length)],
            ['Última visualização', lastReveal(data.activities)],
          ] : []}
          to="cofre"
        />
      </div>

      {(money || traffic) && (
        <>
          <div className="grid g-kpi" style={{ marginBottom: 12 }}>
            <Tile
              label="Lucro hoje" value={brl(profitToday)} negative={profitToday < 0}
              foot={delta == null ? <span>sem base de ontem</span> : (
                <>
                  <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
                    <Icon name={delta >= 0 ? 'up' : 'down'} />{pct(Math.abs(delta))}
                  </span>
                  <span>vs ontem</span>
                </>
              )}
            />
            <Tile label="Faturamento hoje" value={brl(today?.revenue ?? 0)}
              foot={<span>ROI {pct(today?.adSpend ? (profitToday / today.adSpend) * 100 : 0, 0)}</span>} />
            <Tile label="Mídia hoje" value={brl(today?.adSpend ?? 0)}
              foot={<span>{accountCounts.online || 0} conta(s) online</span>} />
            <Tile label="Lucro do mês" value={brl(money ? dre.lucroLiquido : series.reduce((t, r) => t + r.profit, 0))}
              negative={dre.lucroLiquido < 0}
              foot={<span>margem {pct(dre.margem, 0)}</span>} />
          </div>

          <div className="grid g-2" style={{ marginBottom: 12 }}>
            <Card>
              <CardHead title="Lucro por dia">
                <Segment options={RANGES} value={days} onChange={setDays} />
              </CardHead>
              <ProfitBars rows={series} />
            </Card>
            <Card>
              <CardHead title="Faturamento × mídia" sub={`${days} dias`} />
              <RevenueLines rows={series} />
            </Card>
          </div>
        </>
      )}

      <div className="grid g-2" style={{ marginBottom: 12 }}>
        {traffic && (
          <div className="grid g-half" style={{ gap: 12 }}>
            <Card>
              <CardHead title="Domínios" sub={`${data.domains.length} total`} />
              <StatusBreakdown counts={domainCounts} options={DOMAIN_STATUS} total={data.domains.length} />
            </Card>
            <Card>
              <CardHead title="Contas de anúncio" sub={`${data.accounts.length} total`} />
              <StatusBreakdown counts={accountCounts} options={ACCOUNT_STATUS} total={data.accounts.length} />
            </Card>
          </div>
        )}
        {logistics && (
          <Card>
            <CardHead title="Carga por setor">
              <Btn small variant="quiet" onClick={() => navigate('logistica')}>Abrir quadro</Btn>
            </CardHead>
            <div className="stack" style={{ gap: 11 }}>
              {data.sectors.map((s) => {
                const load = sectorLoad(data.tasks, s.id);
                return (
                  <div key={s.id}>
                    <div className="split" style={{ marginBottom: 5 }}>
                      <span className="lane-dot" style={{ background: s.color }} />
                      <span style={{ fontSize: 13 }}>{s.name}</span>
                      <span className="spacer" />
                      {load.late > 0 && <span className="late-chip">{load.late} atrasada{load.late > 1 ? 's' : ''}</span>}
                      <span className="card-sub num">{load.done}/{load.total} concluídas</span>
                    </div>
                    <div className="meter">
                      <i style={{
                        width: `${load.total ? (load.done / load.total) * 100 : 0}%`,
                        background: s.color,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <div className="grid g-half">
        <Card>
          <CardHead title="Atividade recente">
            <Btn small variant="quiet" onClick={() => navigate('historico')}>Ver tudo</Btn>
          </CardHead>
          {data.activities.slice(0, 8).map((a) => (
            <div className="feed-item" key={a.id}>
              <span className="avatar" style={{ background: '#2f2f2d', color: 'var(--muted)' }}>{a.userName[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p>{a.message}</p>
                <time>{a.userName} · {timeAgo(a.ts)}</time>
              </div>
            </div>
          ))}
          {data.activities.length === 0 && <p className="card-sub">Nada por aqui ainda.</p>}
        </Card>

        {logistics && (
          <Card>
            <CardHead title="Demandas em aberto" sub={`${openTasks.length}`} />
            {openTasks.slice(0, 8).map((t) => {
              const sector = data.sectors.find((s) => s.id === t.sectorId);
              const late = t.due && t.due < todayISO();
              return (
                <div className="feed-item" key={t.id}>
                  <Avatar user={users.byId(t.assignee)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p>{t.title}</p>
                    <time>
                      {sector?.name} · {labelOf(TASK_COLUMNS, t.column)}
                      {t.due ? ` · vence ${fmtDate(t.due)}` : ''}
                    </time>
                  </div>
                  {late ? <span className="late-chip">atrasada</span> : <span className={`prio prio-${t.priority}`}>{labelOf(TASK_PRIORITY, t.priority)}</span>}
                </div>
              );
            })}
            {openTasks.length === 0 && <p className="card-sub">Nenhuma demanda em aberto.</p>}
          </Card>
        )}
      </div>
    </>
  );
}

function PillarCard({ icon, label, color, value, caption, rows, to, pillar }: {
  icon: IconName; label: string; color: string; value: string | null;
  caption: string; rows: [string, string][]; to: string; pillar: Pillar;
}) {
  const { me } = useApp();
  const allowed = can(me, pillar);
  return (
    <button
      type="button"
      className={`pillar-card${allowed ? '' : ' pillar-locked'}`}
      onClick={() => allowed && navigate(to)}
      disabled={!allowed}
    >
      <div className="pillar-top">
        <span className="pillar-icon" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
          <Icon name={icon} />
        </span>
        <b>{label}</b>
        <span className="go"><Icon name={allowed ? 'arrowRight' : 'lock'} /></span>
      </div>
      {allowed ? (
        <>
          <div className="pillar-value">{value}</div>
          <div className="card-sub" style={{ marginTop: -6 }}>{caption}</div>
          <div className="pillar-rows">
            {rows.map(([k, v]) => <div className="r" key={k}>{k}<b>{v}</b></div>)}
          </div>
        </>
      ) : (
        <div className="card-sub">Sem acesso a este módulo.</div>
      )}
    </button>
  );
}

function lastReveal(activities: { action: string; ts: string }[]) {
  const a = activities.find((x) => x.action === 'revelou');
  return a ? timeAgo(a.ts) : '—';
}
