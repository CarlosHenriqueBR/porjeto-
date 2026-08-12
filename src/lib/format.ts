export const TZ = 'America/Sao_Paulo';

export const brl = (n: number | undefined | null) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

export const brlShort = (n: number) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}R$ ${(a / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (a >= 1000) return `${sign}R$ ${(a / 1000).toFixed(1).replace('.', ',')}k`;
  return `${sign}R$ ${a.toFixed(0)}`;
};

export const pct = (n: number, digits = 1) =>
  `${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const int = (n: number) => (Number(n) || 0).toLocaleString('pt-BR');

export function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export const monthISO = (offsetMonths = 0) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const fmtDayShort = (iso: string) => {
  const [, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}`;
};

export const fmtMonth = (iso: string) => {
  const [y, m] = iso.split('-');
  const nome = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${y}`;
};

export const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

export function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 45) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const AVATAR_COLORS = ['#3987e5', '#199e70', '#9085e9', '#d95926', '#d55181', '#c98500'];
export function avatarColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
