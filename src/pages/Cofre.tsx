import { useEffect, useRef, useState } from 'react';
import {
  Banner, Btn, Chip, ConfirmModal, Empty, Field, Modal, Select, TableWrap, useForm,
} from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { VAULT_CATEGORIES, labelOf } from '@/lib/model';
import { timeAgo } from '@/lib/format';
import type { VaultItem } from '@/types';

const REVEAL_MS = 45_000;

export function Cofre() {
  const { data, mutate, toast, pull } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<VaultItem | 'new' | null>(null);
  const [del, setDel] = useState<VaultItem | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const hide = (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setRevealed((r) => { const next = { ...r }; delete next[id]; return next; });
  };

  const reveal = async (id: string) => {
    if (revealed[id]) return hide(id);
    setBusy(id);
    try {
      const res = await fetch('/api/vault-reveal', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast(
          j.error === 'segredo_ilegivel'
            ? 'Esta senha foi criptografada com outra VAULT_SECRET — cadastre-a de novo.'
            : 'Não foi possível revelar',
          'bad',
        );
        return;
      }
      setRevealed((r) => ({ ...r, [id]: j.secret }));
      timers.current[id] = window.setTimeout(() => hide(id), REVEAL_MS);
      // a visualização vira registro no histórico — puxa já, sem esperar o ciclo
      void pull(true);
    } catch {
      toast('Não foi possível revelar', 'bad');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copiado`); }
    catch { toast('Não foi possível copiar', 'bad'); }
  };

  const used = VAULT_CATEGORIES.filter((c) => data.vault.some((v) => v.category === c.key));
  const list = data.vault.filter((v) => {
    if (cat && v.category !== cat) return false;
    if (!q) return true;
    return `${v.title} ${v.login} ${v.url} ${v.note}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <Banner kind="info" icon="lock">
        As senhas são guardadas criptografadas (AES-256-GCM) e só aparecem sob demanda — cada
        visualização fica registrada no histórico com autor e horário.
      </Banner>

      <div className="toolbar">
        <div className="search">
          <input className="input" placeholder="Buscar acesso…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chip on={!cat} onClick={() => setCat('')}>Todos</Chip>
        {used.map((c) => (
          <Chip key={c.key} on={cat === c.key} onClick={() => setCat(c.key)}>{c.label}</Chip>
        ))}
        <span style={{ flex: 1 }} />
        <Btn variant="primary" icon="plus" onClick={() => setEditing('new')}>Novo acesso</Btn>
      </div>

      {list.length === 0 ? (
        <Empty text="Nenhum acesso guardado ainda."
          action={<Btn icon="plus" onClick={() => setEditing('new')}>Adicionar acesso</Btn>} />
      ) : (
        <TableWrap>
          <table className="tbl">
            <thead>
              <tr><th>Título</th><th>Categoria</th><th>Login</th><th>Senha</th><th>Atualizado</th><th /></tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td data-label="Título">
                    <b style={{ fontWeight: 550 }}>{v.title}</b>
                    {v.url && (
                      <div className="t-sub">
                        <a href={v.url.startsWith('http') ? v.url : `https://${v.url}`} target="_blank" rel="noopener noreferrer">{v.url}</a>
                      </div>
                    )}
                  </td>
                  <td data-label="Categoria">
                    <span className="pill st-off"><i className="dot" />{labelOf(VAULT_CATEGORIES, v.category)}</span>
                  </td>
                  <td data-label="Login">
                    <div className="split">
                      <span className="mono">{v.login || '—'}</span>
                      {v.login && <Btn variant="quiet" small icon="copy" aria-label="Copiar login" onClick={() => void copy(v.login, 'Login')} />}
                    </div>
                  </td>
                  <td data-label="Senha">
                    {v.hasSecret ? (
                      <div className="split">
                        <span
                          className="mono"
                          style={revealed[v.id] ? { color: '#9cc5f4', cursor: 'pointer' } : undefined}
                          title={revealed[v.id] ? 'Clique para copiar' : undefined}
                          onClick={() => revealed[v.id] && void copy(revealed[v.id], 'Senha')}
                        >
                          {revealed[v.id] ?? '••••••••'}
                        </span>
                        <Btn
                          variant="quiet" small
                          icon={revealed[v.id] ? 'eyeOff' : 'eye'}
                          disabled={busy === v.id}
                          aria-label={revealed[v.id] ? 'Ocultar senha' : 'Mostrar senha'}
                          onClick={() => void reveal(v.id)}
                        />
                      </div>
                    ) : <span className="t-sub">—</span>}
                  </td>
                  <td data-label="Atualizado"><span className="t-sub">{timeAgo(v.updatedAt || v.createdAt)}</span></td>
                  <td>
                    <div className="row-actions">
                      <Btn variant="quiet" icon="edit" aria-label="Editar" onClick={() => setEditing(v)} />
                      <Btn variant="quiet" icon="trash" aria-label="Excluir" onClick={() => setDel(v)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {editing && <VaultModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {del && (
        <ConfirmModal title="Excluir acesso" message={<><b>{del.title}</b> será removido do cofre.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => { await mutate('vault.delete', { id: del.id }); toast('Acesso removido'); }} />
      )}
    </>
  );
}

function VaultModal({ item, onClose }: { item: VaultItem | null; onClose: () => void }) {
  const { mutate, toast } = useApp();
  const { values, set, bind } = useForm({
    title: item?.title ?? '', category: item?.category ?? 'outro', url: item?.url ?? '',
    login: item?.login ?? '', secret: '', note: item?.note ?? '',
  });

  return (
    <Modal title={item ? 'Editar acesso' : 'Novo acesso'} submitLabel={item ? 'Salvar' : 'Guardar no cofre'}
      onClose={onClose}
      onSubmit={async () => { await mutate('vault.save', { ...values, id: item?.id }); toast('Acesso salvo', 'good'); }}>
      <Field label="Título">
        <input className="input" required placeholder="Google Ads — conta 03" {...bind('title')} />
      </Field>
      <div className="grid-2">
        <Field label="Categoria">
          <Select options={VAULT_CATEGORIES} value={values.category} onChange={(e) => set('category', e.target.value)} />
        </Field>
        <Field label="URL">
          <input className="input" placeholder="ads.google.com" {...bind('url')} />
        </Field>
      </div>
      <Field label="Login / e-mail">
        <input className="input" autoComplete="off" {...bind('login')} />
      </Field>
      <Field label="Senha" hint={item ? 'deixe em branco para manter a atual' : undefined}>
        <input className="input" type="password" autoComplete="new-password"
          placeholder={item?.hasSecret ? '•••••••• (mantida)' : ''} {...bind('secret')} />
      </Field>
      <Field label="Observações">
        <textarea className="textarea" placeholder="2FA, telefone de recuperação, chave de API…" {...bind('note')} />
      </Field>
    </Modal>
  );
}
