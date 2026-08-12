import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Avatar, IconBtn } from './ui';
import { useApp } from '@/store/AppContext';
import { navigate, useRoute } from '@/lib/router';
import { can } from '@/lib/model';
import { timeAgo } from '@/lib/format';
import type { Pillar } from '@/types';

interface NavEntry { key: string; label: string; icon: IconName; pillar: Pillar; count?: () => number | null }

export function useNav(): NavEntry[] {
  const { data, me } = useApp();
  return useMemo(() => {
    const all: NavEntry[] = [
      { key: 'dashboard', label: 'Dashboard', icon: 'dash', pillar: 'dashboard' },
      { key: 'financas', label: 'Finanças', icon: 'money', pillar: 'financas' },
      { key: 'logistica', label: 'Logística', icon: 'boxes', pillar: 'logistica', count: () => data.tasks.filter((t) => t.column !== 'feito').length },
      { key: 'trafego', label: 'Tráfego', icon: 'traffic', pillar: 'trafego', count: () => data.domains.filter((d) => d.status === 'caiu').length || null },
      { key: 'cofre', label: 'Cofre', icon: 'lock', pillar: 'cofre', count: () => data.vault.length },
      { key: 'historico', label: 'Histórico', icon: 'activity', pillar: 'dashboard' },
      { key: 'config', label: 'Configurações', icon: 'settings', pillar: 'config' },
    ];
    return all.filter((n) => can(me, n.pillar));
  }, [data, me]);
}

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  const { me, data, online, lastSync, logout, mutate } = useApp();
  const route = useRoute();
  const nav = useNav();
  const [popOpen, setPopOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const [, forceTick] = useState(0);

  // mantém o indicador de "tempo real" honesto mesmo sem novos dados
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!popOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [popOpen]);

  const unread = me ? data.notifications.filter((n) => !n.readBy.includes(me.id)).length : 0;
  const stale = !online || Date.now() - lastSync > 12000;
  const mobileNav = nav.filter((n) => n.key !== 'historico' && n.key !== 'config').slice(0, 5);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand">
          <div className="brand-mark">CO</div>
          <div>
            <b>Central</b>
            <small>Operation</small>
          </div>
        </div>
        <nav>
          {nav.map((n) => {
            const count = n.count?.() ?? null;
            const alert = n.key === 'trafego' && !!count;
            return (
              <a key={n.key} className={`nav-item${route.page === n.key ? ' active' : ''}`} href={`#/${n.key}`}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {count ? <span className={`nav-count${alert ? ' alert' : ''}`}>{count}</span> : null}
              </a>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="nav-item" style={{ cursor: 'default' }}>
            <Avatar user={me} size={26} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {me?.name}
              </div>
              <div className={`live${stale ? ' stale' : ''}`}>
                <i className="dot" />
                <span>{stale ? 'reconectando…' : 'tempo real'}</span>
              </div>
            </div>
            <IconBtn icon="logout" onClick={() => void logout()} aria-label="Sair" title="Sair" />
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <span className="spacer" />
          <div style={{ position: 'relative' }} ref={popRef}>
            <IconBtn icon="bell" badge={unread} aria-label="Notificações" onClick={() => setPopOpen((v) => !v)} />
            {popOpen ? (
              <div className="popover">
                <div className="popover-head">
                  <b>Notificações</b>
                  <button className="btn btn-sm btn-quiet" type="button" onClick={() => void mutate('notif.readAll')}>
                    Marcar lidas
                  </button>
                </div>
                {data.notifications.length === 0 ? (
                  <div style={{ padding: 26, textAlign: 'center' }} className="card-sub">Nada novo por aqui.</div>
                ) : data.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`notif k-${n.kind}${me && n.readBy.includes(me.id) ? '' : ' unread'}`}
                    onClick={() => { if (n.link) { navigate(n.link); setPopOpen(false); } }}
                    style={{ cursor: n.link ? 'pointer' : 'default' }}
                  >
                    <i className="bar" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p>{n.message}</p>
                      <time>{timeAgo(n.ts)}</time>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </header>
        <main className="page">{children}</main>
      </div>

      <nav className="tabbar">
        {mobileNav.map((n) => (
          <a key={n.key} className={`tab${route.page === n.key ? ' active' : ''}`} href={`#/${n.key}`}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'bad' ? 'bad' : t.kind === 'good' ? 'good' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
