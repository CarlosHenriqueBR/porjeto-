import { useMemo, useState, type DragEvent } from 'react';
import {
  Avatar, Btn, Card, CardHead, Chip, ConfirmModal, Field, Modal, Segment, Select, useForm,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useApp, useUsers } from '@/store/AppContext';
import { TASK_COLUMNS, TASK_PRIORITY, labelOf } from '@/lib/model';
import { fmtDate, fmtDayShort, todayISO } from '@/lib/format';
import { sectorLoad } from '@/lib/calc';
import type { Task, TaskColumn } from '@/types';

export function Logistica() {
  const { data, mutate, toast } = useApp();
  const users = useUsers();
  const [sector, setSector] = useState<string>('todos');
  const [view, setView] = useState<'quadro' | 'setores'>('quadro');
  const [editing, setEditing] = useState<Task | Partial<Task> | null>(null);
  const [del, setDel] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);

  const visible = useMemo(
    () => data.tasks.filter((t) => sector === 'todos' || t.sectorId === sector),
    [data.tasks, sector],
  );

  const byColumn = (col: TaskColumn) =>
    visible.filter((t) => t.column === col).sort((a, b) => (b.order || 0) - (a.order || 0));

  const move = async (id: string, column: TaskColumn) => {
    const task = data.tasks.find((t) => t.id === id);
    if (!task || task.column === column) return;
    try {
      await mutate('task.move', { id, column, order: Date.now() });
    } catch {
      toast('Não foi possível mover', 'bad');
    }
  };

  const onDrop = (e: DragEvent, column: TaskColumn) => {
    e.preventDefault();
    setDropCol(null);
    const id = dragId || e.dataTransfer.getData('text/plain');
    setDragId(null);
    if (id) void move(id, column);
  };

  return (
    <>
      <div className="toolbar">
        <Chip on={sector === 'todos'} onClick={() => setSector('todos')}>
          Todos <b>{data.tasks.filter((t) => t.column !== 'feito').length}</b>
        </Chip>
        {data.sectors.map((s) => {
          const load = sectorLoad(data.tasks, s.id);
          return (
            <Chip key={s.id} on={sector === s.id} onClick={() => setSector(s.id)}>
              <span className="lane-dot" style={{ background: s.color, display: 'inline-block', marginRight: 6 }} />
              {s.name} <b>{load.open}</b>
            </Chip>
          );
        })}
        <span style={{ flex: 1 }} />
        <Segment
          options={[{ key: 'quadro' as const, label: 'Quadro' }, { key: 'setores' as const, label: 'Por setor' }]}
          value={view} onChange={setView}
        />
        <Btn variant="primary" icon="plus" onClick={() => setEditing({ sectorId: sector === 'todos' ? data.sectors[0]?.id : sector })}>
          Nova demanda
        </Btn>
      </div>

      {view === 'quadro' ? (
        <div className="board">
          {TASK_COLUMNS.map((col) => {
            const list = byColumn(col.key);
            return (
              <div
                key={col.key}
                className={`col${dropCol === col.key ? ' drop' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDropCol(col.key); }}
                onDragLeave={() => setDropCol((c) => (c === col.key ? null : c))}
                onDrop={(e) => onDrop(e, col.key)}
              >
                <div className="col-head">
                  <h4>{col.label}</h4>
                  <span className="n">{list.length}</span>
                  <span style={{ flex: 1 }} />
                  <Btn variant="quiet" icon="plus" aria-label={`Adicionar em ${col.label}`}
                    onClick={() => setEditing({ column: col.key, sectorId: sector === 'todos' ? data.sectors[0]?.id : sector })} />
                </div>
                <div>
                  {list.map((t) => (
                    <TaskCard
                      key={t.id} task={t}
                      showSector={sector === 'todos'}
                      dragging={dragId === t.id}
                      onDragStart={(e) => {
                        setDragId(t.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', t.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onOpen={() => setEditing(t)}
                      onDelete={() => setDel(t)}
                    />
                  ))}
                  {list.length === 0 && <p className="card-sub" style={{ padding: '10px 2px' }}>Vazio</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {data.sectors.map((s) => {
            const load = sectorLoad(data.tasks, s.id);
            const list = data.tasks.filter((t) => t.sectorId === s.id && t.column !== 'feito')
              .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
            return (
              <Card key={s.id} style={{ marginBottom: 12 }}>
                <CardHead title={s.name} sub={`SLA ${s.sla} dia(s)`}>
                  <Btn small icon="plus" onClick={() => setEditing({ sectorId: s.id })}>Demanda</Btn>
                </CardHead>
                <div className="split" style={{ marginBottom: 12, gap: 14 }}>
                  <span className="card-sub">{load.open} em aberto</span>
                  <span className="card-sub">{load.doing} em execução</span>
                  <span className="card-sub">{load.done} concluídas</span>
                  {load.late > 0 && <span className="late-chip">{load.late} atrasada(s)</span>}
                </div>
                {list.length === 0 ? <p className="card-sub">Nada em aberto neste setor.</p> : list.map((t) => {
                  const late = t.due && t.due < todayISO();
                  return (
                    <div className="feed-item" key={t.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(t)}>
                      <Avatar user={users.byId(t.assignee)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p>{t.title}</p>
                        <time>{labelOf(TASK_COLUMNS, t.column)}{t.due ? ` · vence ${fmtDate(t.due)}` : ''}</time>
                      </div>
                      {late ? <span className="late-chip">atrasada</span>
                        : <span className={`prio prio-${t.priority}`}>{labelOf(TASK_PRIORITY, t.priority)}</span>}
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}

      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} />}
      {del && (
        <ConfirmModal
          title="Excluir demanda"
          message={<>A demanda <b>{del.title}</b> será removida.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => { await mutate('task.delete', { id: del.id }); toast('Demanda excluída'); }}
        />
      )}
    </>
  );
}

function TaskCard({ task, showSector, dragging, onOpen, onDelete, ...drag }: {
  task: Task; showSector: boolean; dragging: boolean;
  onOpen: () => void; onDelete: () => void;
  onDragStart: (e: DragEvent) => void; onDragEnd: () => void;
}) {
  const { data } = useApp();
  const users = useUsers();
  const sector = data.sectors.find((s) => s.id === task.sectorId);
  const late = task.due && task.due < todayISO() && task.column !== 'feito';

  return (
    <div className={`tcard${dragging ? ' dragging' : ''}`} draggable onClick={onOpen} {...drag}>
      {showSector && sector && (
        <div className="split" style={{ marginBottom: 6 }}>
          <span className="lane-dot" style={{ background: sector.color }} />
          <span className="card-sub" style={{ fontSize: 11 }}>{sector.name}</span>
        </div>
      )}
      <h5>{task.title}</h5>
      <div className="tcard-foot">
        <Avatar user={users.byId(task.assignee)} />
        <span className={`prio prio-${task.priority}`}>{labelOf(TASK_PRIORITY, task.priority)}</span>
        {task.due && (
          <span className={`due${late ? ' late' : ''}`}>
            <Icon name="calendar" />{fmtDayShort(task.due)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Btn variant="quiet" small icon="trash" aria-label="Excluir"
          onClick={(e) => { e.stopPropagation(); onDelete(); }} />
      </div>
    </div>
  );
}

function TaskModal({ task, onClose }: { task: Task | Partial<Task>; onClose: () => void }) {
  const { data, mutate, toast } = useApp();
  const editing = Boolean(task.id);
  const form = useForm({
    title: task.title ?? '',
    desc: task.desc ?? '',
    sectorId: task.sectorId ?? data.sectors[0]?.id ?? '',
    column: (task.column ?? 'backlog') as TaskColumn,
    priority: task.priority ?? 'media',
    assignee: task.assignee ?? '',
    due: task.due ?? '',
  });
  const { values, set, bind } = form;

  return (
    <Modal
      title={editing ? 'Editar demanda' : 'Nova demanda'}
      submitLabel={editing ? 'Salvar' : 'Abrir demanda'}
      onClose={onClose}
      onSubmit={async () => {
        await mutate('task.save', { ...values, id: task.id });
        toast(editing ? 'Demanda atualizada' : 'Demanda aberta — equipe notificada', 'good');
      }}
    >
      <Field label="Título">
        <input className="input" required placeholder="Criar 3 criativos para a estrutura 04" {...bind('title')} />
      </Field>
      <Field label="Descrição">
        <textarea className="textarea" placeholder="Referências, links, o que precisa entregar…" {...bind('desc')} />
      </Field>
      <div className="grid-2">
        <Field label="Setor">
          <Select options={data.sectors.map((s) => ({ key: s.id, label: s.name }))}
            value={values.sectorId} onChange={(e) => set('sectorId', e.target.value)} />
        </Field>
        <Field label="Coluna">
          <Select options={TASK_COLUMNS} value={values.column} onChange={(e) => set('column', e.target.value as TaskColumn)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Prioridade">
          <Select options={TASK_PRIORITY} value={values.priority}
            onChange={(e) => set('priority', e.target.value as Task['priority'])} />
        </Field>
        <Field label="Responsável">
          <Select
            options={[{ key: '', label: '— ninguém —' }, ...data.users.filter((u) => u.active).map((u) => ({ key: u.id, label: u.name }))]}
            value={values.assignee} onChange={(e) => set('assignee', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Prazo">
        <input className="input" type="date" {...bind('due')} />
      </Field>
    </Modal>
  );
}
