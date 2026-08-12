import { useState } from 'react';
import { Card, CardHead, Chip, Empty } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { PILLAR_LABELS } from '@/lib/model';
import { timeAgo } from '@/lib/format';
import type { Pillar } from '@/types';

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Tudo' },
  { key: 'financas', label: PILLAR_LABELS.financas },
  { key: 'logistica', label: PILLAR_LABELS.logistica },
  { key: 'trafego', label: PILLAR_LABELS.trafego },
  { key: 'cofre', label: PILLAR_LABELS.cofre },
];

export function Historico() {
  const { data } = useApp();
  const [pillar, setPillar] = useState('');
  const [q, setQ] = useState('');

  const list = data.activities.filter((a) => {
    if (pillar && a.pillar !== (pillar as Pillar)) return false;
    if (!q) return true;
    return `${a.message} ${a.userName}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <input className="input" placeholder="Buscar no histórico…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {FILTERS.map((f) => (
          <Chip key={f.key} on={pillar === f.key} onClick={() => setPillar(f.key)}>{f.label}</Chip>
        ))}
      </div>

      <Card>
        <CardHead title="Histórico da operação" sub={`${list.length} registro(s)`} />
        {list.length === 0 ? (
          <Empty text="Nenhuma atividade com esse filtro." />
        ) : list.map((a) => (
          <div className="feed-item" key={a.id}>
            <span className="avatar" style={{ background: '#2f2f2d', color: 'var(--muted)' }}>{a.userName[0]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p>{a.message}</p>
              <time>
                {a.userName} · {timeAgo(a.ts)}
                {a.pillar ? ` · ${PILLAR_LABELS[a.pillar]}` : ''}
              </time>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
