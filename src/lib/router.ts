import { useSyncExternalStore, useCallback } from 'react';

const read = () => location.hash.replace(/^#\/?/, '') || 'dashboard';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export interface Route {
  path: string;
  segments: string[];
  page: string;
  sub: string | null;
}

export function useRoute(): Route {
  const raw = useSyncExternalStore(subscribe, read, () => 'dashboard');
  const path = raw.split('?')[0];
  const segments = path.split('/').filter(Boolean);
  return { path, segments, page: segments[0] || 'dashboard', sub: segments[1] ?? null };
}

export const navigate = (to: string) => {
  const next = to.startsWith('#') ? to : `#/${to.replace(/^\/+/, '')}`;
  if (location.hash !== next) location.hash = next;
};

export function useNavigate() {
  return useCallback(navigate, []);
}
