import { useEffect, useState, type ReactElement } from 'react';
import { Layout, Toasts } from '@/components/Layout';
import { useApp } from '@/store/AppContext';
import { useRoute, navigate } from '@/lib/router';
import { can, PILLAR_LABELS } from '@/lib/model';
import { Btn, Card, Empty } from '@/components/ui';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Financas } from '@/pages/Financas';
import { Logistica } from '@/pages/Logistica';
import { Trafego } from '@/pages/Trafego';
import { Cofre } from '@/pages/Cofre';
import { Historico } from '@/pages/Historico';
import { Config, PasswordModal } from '@/pages/Config';
import type { Pillar } from '@/types';

const PAGES: Record<string, { title: string; pillar: Pillar; render: () => ReactElement }> = {
  dashboard: { title: 'Visão geral da operação', pillar: 'dashboard', render: () => <Dashboard /> },
  financas: { title: 'Finanças', pillar: 'financas', render: () => <Financas /> },
  logistica: { title: 'Logística', pillar: 'logistica', render: () => <Logistica /> },
  trafego: { title: 'Tráfego', pillar: 'trafego', render: () => <Trafego /> },
  cofre: { title: 'Cofre de acessos', pillar: 'cofre', render: () => <Cofre /> },
  historico: { title: 'Histórico', pillar: 'dashboard', render: () => <Historico /> },
  config: { title: 'Configurações', pillar: 'config', render: () => <Config /> },
};

export function App() {
  const { ready, authed, me } = useApp();
  const route = useRoute();
  const [pwPrompt, setPwPrompt] = useState(false);

  // primeiro acesso ainda com a senha provisória
  useEffect(() => {
    if (!me?.mustChangePassword) return;
    if (sessionStorage.getItem('pwd-prompted')) return;
    sessionStorage.setItem('pwd-prompted', '1');
    const t = setTimeout(() => setPwPrompt(true), 700);
    return () => clearTimeout(t);
  }, [me]);

  useEffect(() => {
    if (authed && route.page === 'login') navigate('dashboard');
    if (!authed && ready && route.page !== 'login') navigate('login');
  }, [authed, ready, route.page]);

  if (!ready) {
    return (
      <div className="loading-screen">
        <div>
          <div className="spinner" />
          <p style={{ marginTop: 12, fontSize: 13 }}>Carregando a operação…</p>
        </div>
      </div>
    );
  }

  if (!authed) return <><Login /><Toasts /></>;

  const page = PAGES[route.page] ?? PAGES.dashboard;
  const allowed = can(me, page.pillar);

  return (
    <>
      <Layout title={page.title}>
        {allowed ? page.render() : (
          <Card>
            <Empty
              text={`Você não tem acesso ao módulo ${PILLAR_LABELS[page.pillar]}. Fale com um owner da operação.`}
              action={<Btn onClick={() => navigate('dashboard')}>Voltar ao dashboard</Btn>}
            />
          </Card>
        )}
      </Layout>
      <Toasts />
      {pwPrompt && <PasswordModal onClose={() => setPwPrompt(false)} />}
    </>
  );
}
