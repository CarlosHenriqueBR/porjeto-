import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type MouseEvent as ReactMouseEvent, type ReactNode, type TouchEvent as ReactTouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { brl, brlShort, fmtDayShort } from '@/lib/format';
import type { DayRow } from '@/lib/calc';

const PAD = { t: 14, r: 14, b: 26, l: 56 };
const H = 224;

/* ------------------------------- utilidades ------------------------------ */

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, el.clientWidth || 640));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) { min = Math.min(0, min); max = max === 0 ? 1 : max * 1.2; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { ticks, lo, hi: ticks[ticks.length - 1] };
}

/** Rótulos do eixo X a partir do último, garantindo ~44px de folga. */
function labelIndexes(n: number, innerWidth: number) {
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerWidth / 44))));
  const keep = new Set<number>();
  for (let i = n - 1; i >= 0; i -= step) keep.add(i);
  return keep;
}

/** Retângulo com as pontas do lado do dado arredondadas em 4px. */
function barPath(x: number, y: number, w: number, h: number, up: boolean, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0.6) return `M${x} ${y}h${w}`;
  return up
    ? `M${x} ${y + h}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h}Z`
    : `M${x} ${y}v${h - rr}a${rr} ${rr} 0 0 0 ${rr} ${rr}h${w - 2 * rr}a${rr} ${rr} 0 0 0 ${rr} ${-rr}V${y}Z`;
}

/* -------------------------------- tooltip -------------------------------- */

interface TipState { x: number; y: number; content: ReactNode }

function Tooltip({ tip }: { tip: TipState | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  useEffect(() => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(Math.max(8, tip.x - r.width / 2), window.innerWidth - r.width - 8),
      top: tip.y - r.height - 12 < 8 ? tip.y + 18 : tip.y - r.height - 12,
    });
  }, [tip]);
  if (!tip) return null;
  return createPortal(
    <div className="tip" ref={ref} style={{ left: pos.left, top: pos.top }}>{tip.content}</div>,
    document.body,
  );
}

function DayTip({ row }: { row: DayRow }) {
  return (
    <>
      <b>{fmtDayShort(row.date)}</b>
      <div className="row">
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><i style={{ background: 'var(--s3)' }} />Faturamento</span>
        <span>{brl(row.revenue)}</span>
      </div>
      <div className="row">
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><i style={{ background: 'var(--s2)' }} />Mídia</span>
        <span>{brl(row.adSpend)}</span>
      </div>
      <div className="row" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--line)' }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <i style={{ background: row.profit >= 0 ? 'var(--s1)' : 'var(--critical)' }} />Lucro
        </span>
        <span style={{ fontWeight: 650 }}>{brl(row.profit)}</span>
      </div>
    </>
  );
}

/* ---------------------------- barras de lucro ---------------------------- */

export function ProfitBars({ rows }: { rows: DayRow[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const iw = width - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const values = rows.map((r) => r.profit);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const band = iw / Math.max(1, rows.length);
  const bw = Math.max(3, Math.min(28, band - Math.max(2, band * 0.34)));
  const zero = y(0);
  const keep = labelIndexes(rows.length, iw);

  const show = useCallback((i: number, e: ReactMouseEvent | ReactTouchEvent) => {
    const pt = 'touches' in e ? e.touches[0] : e;
    setHover(i);
    setTip({ x: pt.clientX, y: pt.clientY, content: <DayTip row={rows[i]} /> });
  }, [rows]);

  return (
    <div ref={ref}>
      <svg
        className="chart" viewBox={`0 0 ${width} ${H}`} width="100%" height={H} role="img"
        aria-label={`Lucro por dia nos últimos ${rows.length} dias`}
        onMouseLeave={() => { setHover(null); setTip(null); }}
      >
        {ticks.map((t) => (
          <line key={t} className={t === 0 ? 'axis-line' : 'grid-line'}
            x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} />
        ))}
        {ticks.map((t) => (
          <text key={`l${t}`} className="tick" x={PAD.l - 9} y={y(t) + 3.5} textAnchor="end">{brlShort(t)}</text>
        ))}
        {rows.map((r, i) => keep.has(i) ? (
          <text key={`x${r.date}`} className="tick" x={PAD.l + band * i + band / 2} y={H - 8} textAnchor="middle">
            {fmtDayShort(r.date)}
          </text>
        ) : null)}
        {rows.map((r, i) => {
          const up = r.profit >= 0;
          const top = up ? y(r.profit) : zero;
          const h = Math.abs(zero - y(r.profit));
          const fill = !r.has ? '#2c2c2a' : up ? 'var(--s1)' : 'var(--critical)';
          return (
            <path key={r.date} className="bar" d={barPath(PAD.l + band * i + band / 2 - bw / 2, top, bw, h, up)}
              fill={fill} opacity={hover == null || hover === i ? 1 : 0.45} />
          );
        })}
        {rows.map((r, i) => (
          <rect key={`h${r.date}`} className="hit" x={PAD.l + band * i} y={PAD.t} width={band} height={ih}
            onMouseEnter={(e) => show(i, e)} onMouseMove={(e) => show(i, e)}
            onTouchStart={(e) => show(i, e)} />
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--s1)' }} />Lucro</span>
        <span><i style={{ background: 'var(--critical)' }} />Prejuízo</span>
        <span><i style={{ background: '#2c2c2a' }} />Sem lançamento</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/* --------------------- faturamento × mídia (linhas) ---------------------- */

const SERIES = [
  { key: 'revenue' as const, name: 'Faturamento', color: 'var(--s3)' },
  { key: 'adSpend' as const, name: 'Mídia', color: 'var(--s2)' },
];

export function RevenueLines({ rows }: { rows: DayRow[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const iw = width - PAD.l - PAD.r - 34;
  const ih = H - PAD.t - PAD.b;
  const all = rows.flatMap((r) => [r.revenue, r.adSpend]);
  const { ticks, lo, hi } = niceTicks(0, Math.max(1, ...all));
  const x = (i: number) => PAD.l + (iw * i) / Math.max(1, rows.length - 1);
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const keep = labelIndexes(rows.length, iw);
  const bandW = iw / Math.max(1, rows.length - 1);
  const last = rows[rows.length - 1];

  const show = (i: number, e: ReactMouseEvent | ReactTouchEvent) => {
    const pt = 'touches' in e ? e.touches[0] : e;
    setHover(i);
    setTip({ x: pt.clientX, y: pt.clientY, content: <DayTip row={rows[i]} /> });
  };

  return (
    <div ref={ref}>
      <svg
        className="chart" viewBox={`0 0 ${width} ${H}`} width="100%" height={H} role="img"
        aria-label="Faturamento e gasto com mídia por dia"
        onMouseLeave={() => { setHover(null); setTip(null); }}
      >
        {ticks.map((t) => (
          <line key={t} className={t === 0 ? 'axis-line' : 'grid-line'} x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} />
        ))}
        {ticks.map((t) => (
          <text key={`l${t}`} className="tick" x={PAD.l - 9} y={y(t) + 3.5} textAnchor="end">{brlShort(t)}</text>
        ))}
        {rows.map((r, i) => keep.has(i) ? (
          <text key={`x${r.date}`} className="tick" x={x(i)} y={H - 8} textAnchor="middle">{fmtDayShort(r.date)}</text>
        ) : null)}
        {hover != null ? <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} /> : null}
        {SERIES.map((s) => (
          <g key={s.key}>
            <path
              d={rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r[s.key]).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            />
            <circle cx={x(rows.length - 1)} cy={y(last[s.key])} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
            <text className="series-label" x={x(rows.length - 1) + 8} y={y(last[s.key]) + 4} fill={s.color}>
              {brlShort(last[s.key])}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <rect key={`h${r.date}`} className="hit" x={x(i) - bandW / 2} y={PAD.t} width={bandW} height={ih}
            onMouseEnter={(e) => show(i, e)} onMouseMove={(e) => show(i, e)} onTouchStart={(e) => show(i, e)} />
        ))}
      </svg>
      <div className="legend">
        {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.name}</span>)}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/* --------------------------- composição por status ----------------------- */

export function StatusBreakdown({ counts, options, total }: {
  counts: Record<string, number>;
  options: { key: string; label: string; color?: string }[];
  total?: number;
}) {
  const sum = total ?? Object.values(counts).reduce((a, b) => a + b, 0);
  const rows = options.map((o) => ({ ...o, n: counts[o.key] || 0 }));
  return (
    <>
      <div className="stackbar" role="img" aria-label={rows.map((r) => `${r.label}: ${r.n}`).join(', ')}>
        {sum === 0
          ? <i style={{ width: '100%', background: '#2c2c2a' }} />
          : rows.filter((r) => r.n).map((r) => (
            <i key={r.key} style={{ width: `${(r.n / sum) * 100}%`, background: r.color }} title={`${r.label}: ${r.n}`} />
          ))}
      </div>
      <div className="stacklegend">
        {rows.map((r) => (
          <div className="r" key={r.key}>
            <i style={{ background: r.color }} />{r.label}
            <span className="v">{r.n}<span className="muted"> · {sum ? Math.round((r.n / sum) * 100) : 0}%</span></span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------- barra única ----------------------------- */

export function Meter({ value, max, color = 'var(--s1)' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return <div className="meter"><i style={{ width: `${w}%`, background: color }} /></div>;
}
