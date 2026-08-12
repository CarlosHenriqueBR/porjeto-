import { useState } from 'react';
import {
  Avatar, Btn, Card, CardHead, ConfirmModal, Field, Modal, Select, useForm,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useApp } from '@/store/AppContext';
import { PILLAR_LABELS } from '@/lib/model';
import { timeAgo } from '@/lib/format';
import type { Pillar, User } from '@/types';

const MANAGED_PILLARS: Pillar[] = ['dashboard', 'financas', 'logistica', 'trafego', 'cofre', 'config'];

export function Config() {
  const { me, data, driver, version, mutate, toast } = useApp();
  const [pwOpen, setPwOpen] = useState(false);
  const [userModal, setUserModal] = useState<User | 'new' | null>(null);
  const [sectorModal, setSectorModal] = useState<{ id?: string; name: string; color: string; sla: string } | null>(null);
  const [delSector, setDelSector] = useState<{ id: string; name: string } | null>(null);
  const [discover, setDiscover] = useState<DiscoverResult | null>(null);
  const [busy, setBusy] = useState('');

  const isOwner = me?.role === 'owner';

  return (
    <>
      <div className="grid g-half">
        <Card>
          <CardHead title="Sua conta" />
          <div className="stacklegend" style={{ gap: 9, marginBottom: 16 }}>
            <div className="r"><span className="muted">Nome</span><span className="v">{me?.name}</span></div>
            <div className="r"><span className="muted">E-mail</span><span className="v">{me?.email}</span></div>
            <div className="r"><span className="muted">Perfil</span><span className="v">{isOwner ? 'Owner' : 'Membro'}</span></div>
          </div>
          <Btn icon="key" onClick={() => setPwOpen(true)}>Alterar senha</Btn>
        </Card>

        <Card>
          <CardHead title="Equipe e permissões" sub={`${data.users.filter((u) => u.active).length} ativo(s)`}>
            {isOwner && <Btn small icon="plus" onClick={() => setUserModal('new')}>Adicionar</Btn>}
          </CardHead>
          {data.users.map((u) => (
            <div className="feed-item" key={u.id}>
              <Avatar user={u} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p>{u.name} {u.role === 'owner' && <span className="card-sub">· owner</span>}</p>
                <time>
                  {u.role === 'owner'
                    ? 'acesso total'
                    : MANAGED_PILLARS.filter((k) => u.perms?.[k]).map((k) => PILLAR_LABELS[k]).join(', ') || 'sem acesso'}
                </time>
              </div>
              {u.active
                ? <span className="pill st-online"><i className="dot" />Ativo</span>
                : <span className="pill st-off"><i className="dot" />Inativo</span>}
              {isOwner && <Btn variant="quiet" icon="edit" aria-label="Editar" onClick={() => setUserModal(u)} />}
            </div>
          ))}
        </Card>

        <Card>
          <CardHead title="Setores da logística">
            <Btn small icon="plus" onClick={() => setSectorModal({ name: '', color: '#3987e5', sla: '2' })}>Novo setor</Btn>
          </CardHead>
          {data.sectors.map((s) => (
            <div className="feed-item" key={s.id}>
              <span className="lane-dot" style={{ background: s.color, width: 12, height: 12 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p>{s.name}</p>
                <time>SLA {s.sla} dia(s) · {data.tasks.filter((t) => t.sectorId === s.id && t.column !== 'feito').length} em aberto</time>
              </div>
              <Btn variant="quiet" icon="edit" aria-label="Editar"
                onClick={() => setSectorModal({ id: s.id, name: s.name, color: s.color, sla: String(s.sla) })} />
              <Btn variant="quiet" icon="trash" aria-label="Excluir" onClick={() => setDelSector(s)} />
            </div>
          ))}
        </Card>

        <Card>
          <CardHead title="Integração UTMify" />
          <p className="card-sub" style={{ margin: '0 0 12px' }}>
            Última sincronização: <b style={{ color: 'var(--ink-2)' }}>
              {data.settings.utmifyLastSync ? timeAgo(data.settings.utmifyLastSync) : 'nunca'}
            </b>. O cron da Vercel roda todo dia às 03:00 (Brasília) e grava faturamento, mídia e
            lucro nas métricas de Tráfego.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn icon="refresh" disabled={busy === 'sync'} onClick={async () => {
              setBusy('sync');
              try {
                const r = await fetch('/api/sync-utmify', {
                  method: 'POST', credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' }, body: '{}',
                });
                const j = await r.json();
                toast(j.ok ? `Sincronizado: ${j.applied} dia(s)` : 'UTMify ainda não configurada (veja o README)', j.ok ? 'good' : 'info');
              } catch { toast('Falha ao sincronizar', 'bad'); }
              finally { setBusy(''); }
            }}>Sincronizar agora</Btn>
            <Btn icon="search" disabled={busy === 'discover'} onClick={async () => {
              setBusy('discover');
              try {
                const r = await fetch('/api/sync-utmify', {
                  method: 'POST', credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'discover' }),
                });
                setDiscover(await r.json());
              } catch { toast('Falha na descoberta', 'bad'); }
              finally { setBusy(''); }
            }}>Descobrir ferramentas MCP</Btn>
          </div>
        </Card>

        <Card>
          <CardHead title="Sistema" />
          <div className="stacklegend" style={{ gap: 9 }}>
            <div className="r">
              <span className="muted">Banco</span>
              <span className="v">
                {driver === 'kv' ? 'KV REST (Vercel/Upstash)' : driver === 'blob' ? 'Vercel Blob' : 'Arquivo local db.json'}
              </span>
            </div>
            <div className="r"><span className="muted">Versão dos dados</span><span className="v mono">#{version}</span></div>
            <div className="r"><span className="muted">Atualização</span><span className="v">a cada 3 s</span></div>
            <div className="r">
              <span className="muted">Registros</span>
              <span className="v">
                {data.domains.length + data.accounts.length + data.structures.length +
                  data.tasks.length + data.vault.length + data.entries.length + data.metrics.length}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
      {userModal && <UserModal user={userModal === 'new' ? null : userModal} onClose={() => setUserModal(null)} />}
      {sectorModal && (
        <Modal
          title={sectorModal.id ? 'Editar setor' : 'Novo setor'}
          onClose={() => setSectorModal(null)}
          onSubmit={async () => { await mutate('sector.save', sectorModal); toast('Setor salvo', 'good'); }}
        >
          <Field label="Nome">
            <input className="input" required value={sectorModal.name}
              onChange={(e) => setSectorModal({ ...sectorModal, name: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Cor">
              <input className="input" type="color" value={sectorModal.color} style={{ padding: 4, height: 40 }}
                onChange={(e) => setSectorModal({ ...sectorModal, color: e.target.value })} />
            </Field>
            <Field label="SLA (dias)">
              <input className="input" type="number" min="0" value={sectorModal.sla}
                onChange={(e) => setSectorModal({ ...sectorModal, sla: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {delSector && (
        <ConfirmModal title="Excluir setor" message={<>O setor <b>{delSector.name}</b> será removido.</>}
          onClose={() => setDelSector(null)}
          onConfirm={async () => { await mutate('sector.delete', { id: delSector.id }); toast('Setor excluído'); }} />
      )}
      {discover && <DiscoverModal result={discover} onClose={() => setDiscover(null)} />}
    </>
  );
}

/* ------------------------------- modais ---------------------------------- */

export function PasswordModal({ onClose }: { onClose: () => void }) {
  const { mutate, toast } = useApp();
  const { values, bind } = useForm({ current: '', next: '' });
  return (
    <Modal title="Alterar senha" onClose={onClose}
      onSubmit={async () => { await mutate('user.password', values); toast('Senha alterada', 'good'); }}>
      <Field label="Senha atual">
        <input className="input" type="password" required autoComplete="current-password" {...bind('current')} />
      </Field>
      <Field label="Nova senha">
        <input className="input" type="password" required minLength={8} autoComplete="new-password" {...bind('next')} />
      </Field>
      <p className="card-sub" style={{ marginTop: 10 }}>Mínimo de 8 caracteres. Use algo que só você saiba.</p>
    </Modal>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { mutate, toast } = useApp();
  const [role, setRole] = useState<'owner' | 'member'>(user?.role ?? 'member');
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {};
    for (const p of MANAGED_PILLARS) base[p] = user ? !!user.perms?.[p] : p === 'dashboard';
    return base;
  });
  const [active, setActive] = useState(user?.active ?? true);
  const { values, bind } = useForm({ name: user?.name ?? '', email: user?.email ?? '', password: '' });

  return (
    <Modal
      title={user ? `Acesso de ${user.name}` : 'Adicionar pessoa'}
      submitLabel={user ? 'Salvar' : 'Criar acesso'}
      onClose={onClose}
      onSubmit={async () => {
        await mutate('user.save', { ...values, id: user?.id, role, perms, active });
        toast(user ? 'Acesso atualizado' : 'Pessoa adicionada', 'good');
      }}
    >
      <Field label="Nome">
        <input className="input" required {...bind('name')} />
      </Field>
      {!user && (
        <Field label="E-mail">
          <input className="input" type="email" required {...bind('email')} />
        </Field>
      )}
      <Field label={user ? 'Nova senha' : 'Senha provisória'} hint={user ? 'deixe em branco para manter' : undefined}>
        <input className="input" type="password" minLength={8} required={!user} autoComplete="new-password" {...bind('password')} />
      </Field>

      <Field label="Perfil">
        <Select
          options={[{ key: 'member', label: 'Membro — acesso escolhido abaixo' }, { key: 'owner', label: 'Owner — acesso total' }]}
          value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'member')}
        />
      </Field>

      {role === 'member' && (
        <>
          <p className="card-sub" style={{ marginTop: 14, marginBottom: 0 }}>Módulos liberados</p>
          <div className="perm-grid">
            {MANAGED_PILLARS.map((p) => (
              <label className="perm" key={p} data-on={perms[p] ? 'true' : 'false'}>
                <input type="checkbox" checked={!!perms[p]}
                  onChange={(e) => setPerms({ ...perms, [p]: e.target.checked })} />
                {PILLAR_LABELS[p]}
              </label>
            ))}
          </div>
        </>
      )}

      {user && (
        <label className="perm" style={{ marginTop: 14 }} data-on={active ? 'true' : 'false'}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Acesso ativo
        </label>
      )}
    </Modal>
  );
}

interface DiscoverResult {
  ok?: boolean;
  server?: { name?: string } | null;
  tools?: { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown> } }[];
  hint?: string;
  detail?: string;
}

function DiscoverModal({ result, onClose }: { result: DiscoverResult; onClose: () => void }) {
  return (
    <Modal title="Ferramentas do servidor MCP" onClose={onClose} submitLabel="Fechar" hideCancel wide>
      {result.ok ? (
        <>
          <p className="card-sub" style={{ margin: '0 0 12px' }}>
            Servidor: <b style={{ color: 'var(--ink-2)' }}>{result.server?.name ?? '—'}</b>. Escolha a
            ferramenta de métricas e coloque o nome dela na variável <span className="mono">UTMIFY_MCP_TOOL</span> na Vercel.
          </p>
          {(result.tools ?? []).length === 0 && <p className="card-sub">Nenhuma ferramenta exposta.</p>}
          {(result.tools ?? []).map((t) => (
            <div className="feed-item" key={t.name}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="mono" style={{ fontSize: 12.5, color: '#9cc5f4' }}>{t.name}</p>
                <time>{t.description || 'sem descrição'}</time>
                <details style={{ marginTop: 6 }}>
                  <summary className="t-sub" style={{ cursor: 'pointer' }}>parâmetros</summary>
                  <pre className="mono t-sub" style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: '6px 0 0' }}>
                    {JSON.stringify(t.inputSchema?.properties ?? {}, null, 1)}
                  </pre>
                </details>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <p className="card-sub" style={{ margin: 0 }}>
            <Icon name="alert" /> {result.hint || result.detail || 'Não foi possível conectar ao servidor MCP.'}
          </p>
          <p className="card-sub" style={{ marginTop: 10 }}>
            Configure <span className="mono">UTMIFY_MCP_URL</span> nas variáveis de ambiente da Vercel e tente de novo.
          </p>
        </>
      )}
    </Modal>
  );
}
