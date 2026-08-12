import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '@/store/AppContext';
import { App } from '@/App';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('Elemento #root não encontrado');

createRoot(el).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
