import {
  createContext, useContext, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '@/lib/api';
import type { AppData, Notification, StateResponse, Summary, User } from '@/types';

const EMPTY: AppData = {
  users: [], sectors: [], domains: [], accounts: [], structures: [], metrics: [],
  entries: [], tasks: [], vault: [], activities: [], notifications: [],
  settings: { utmifyLastSync: null, currency: 'BRL', companyName: 'Central Operation' },
};

export interface Toast { id: number; message: string; kind: 'info' | 'good' | 'bad' }

interface Ctx {
  ready: boolean;
  authed: boolean;
  me: User | null;
  data: AppData;
  summary: Summary | null;
  version: number;
  driver: string;
  online: boolean;
  lastSync: number;
  toasts: Toast[];
  pull: (force?: boolean) => Promise<void>;
  mutate: <T = unknown>(action: string, payload?: Record<string, unknown>) => Promise<T>;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  logout: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [data, setData] = useState<AppData>(EMPTY);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [version, setVersion] = useState(0);
  const [driver, setDriver] = useState('');
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const versionRef = useRef(0);
  const pullingRef = useRef(false);
  const seenNotifs = useRef<Set<string>>(new Set());
  const meIdRef = useRef<string | null>(null);
  const toastSeq = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = toastSeq.current++;
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => dismissToast(id), 4600);
  }, [dismissToast]);

  const announce = useCallback((list: Notification[]) => {
    const fresh = list.filter((n) => !seenNotifs.current.has(n.id));
    for (const n of list) seenNotifs.current.add(n.id);
    // na primeira carga só marcamos como vistas, sem despejar toasts na tela
    if (!meIdRef.current) return;
    for (const n of fresh.slice(0, 4).reverse()) {
      if (n.actorId === meIdRef.current) continue;
      toast(n.message, n.kind === 'critical' ? 'bad' : n.kind === 'good' ? 'good' : 'info');
    }
  }, [toast]);

  const pull = useCallback(async (force = false) => {
    if (pullingRef.current) return;
    pullingRef.current = true;
    try {
      const j = await api<StateResponse>(`/api/state?v=${force ? 0 : versionRef.current}`);
      setOnline(true);
      setLastSync(Date.now());
      setAuthed(true);
      versionRef.current = j.version;
      setVersion(j.version);
      if (j.changed && j.data && j.me) {
        const first = !meIdRef.current;
        announce(j.data.notifications);
        if (first) meIdRef.current = j.me.id;
        setMe(j.me);
        setData(j.data);
        setSummary(j.summary ?? null);
        setDriver(j.driver ?? '');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuthed(false);
        setMe(null);
        meIdRef.current = null;
      } else {
        setOnline(false);
      }
    } finally {
      pullingRef.current = false;
      setReady(true);
    }
  }, [announce]);

  const mutate = useCallback(async <T,>(action: string, payload: Record<string, unknown> = {}) => {
    const res = await api<{ result: T }>('/api/mutate', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
    await pull(true);
    return res.result;
  }, [pull]);

  const logout = useCallback(async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    meIdRef.current = null;
    versionRef.current = 0;
    setAuthed(false);
    setMe(null);
    setData(EMPTY);
    location.hash = '#/login';
  }, []);

  // primeira carga + polling de 3s enquanto a aba estiver visível
  useEffect(() => { void pull(true); }, [pull]);

  useEffect(() => {
    if (!authed) return;
    const tick = () => { if (document.visibilityState === 'visible') void pull(); };
    const id = window.setInterval(tick, 3000);
    const onFocus = () => void pull();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [authed, pull]);

  const value = useMemo<Ctx>(() => ({
    ready, authed, me, data, summary, version, driver, online, lastSync,
    toasts, pull, mutate, toast, dismissToast, logout,
  }), [ready, authed, me, data, summary, version, driver, online, lastSync, toasts, pull, mutate, toast, dismissToast, logout]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}

/** Atalhos derivados usados em várias telas. */
export function useUsers() {
  const { data } = useApp();
  return useMemo(() => {
    const map = new Map(data.users.map((u) => [u.id, u]));
    return { list: data.users, byId: (id?: string | null) => (id ? map.get(id) ?? null : null) };
  }, [data.users]);
}
