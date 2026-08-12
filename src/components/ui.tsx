import {
  useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ChangeEvent, type FormEvent, type HTMLAttributes,
  type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { errorMessage } from '@/lib/api';
import { avatarColor, initials } from '@/lib/format';
import type { Option } from '@/lib/model';
import type { User } from '@/types';

/* ------------------------------- primitivos ------------------------------ */

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function CardHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-head">
      <h3>{title}</h3>
      <span className="spacer" />
      {sub ? <span className="card-sub">{sub}</span> : null}
      {children}
    </div>
  );
}

export function Tile({ label, value, foot, negative }: { label: string; value: ReactNode; foot?: ReactNode; negative?: boolean }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value${negative ? ' neg' : ''}`}>{value}</div>
      {foot ? <div className="tile-foot">{foot}</div> : null}
    </div>
  );
}

export function Pill({ status, options }: { status: string; options: Option[] }) {
  const label = options.find((o) => o.key === status)?.label ?? status;
  return <span className={`pill st-${status}`}><i className="dot" />{label}</span>;
}

type BtnProps = {
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger';
  icon?: IconName; block?: boolean; small?: boolean; children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Btn({ variant = 'ghost', icon, block, small, children, className = '', ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}${block ? ' btn-block' : ''}${small ? ' btn-sm' : ''} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function IconBtn({ icon, badge, ...rest }: { icon: IconName; badge?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-btn" {...rest}>
      <Icon name={icon} />
      {badge ? <span className="badge">{badge > 9 ? '9+' : badge}</span> : null}
    </button>
  );
}

export function Chip({ on, children, ...rest }: { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`chip${on ? ' on' : ''}`} {...rest}>{children}</button>;
}

export function Avatar({ user, size = 21 }: { user: User | null; size?: number }) {
  if (!user) {
    return <span className="avatar" style={{ background: '#3a3a38', width: size, height: size }} title="Sem responsável">–</span>;
  }
  return (
    <span className="avatar" style={{ background: avatarColor(user.id), width: size, height: size, fontSize: size * 0.44 }} title={user.name}>
      {initials(user.name)}
    </span>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name="inbox" />
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Banner({ kind = 'warn', icon = 'alert', children }: { kind?: 'warn' | 'crit' | 'info'; icon?: IconName; children: ReactNode }) {
  const cls = kind === 'crit' ? 'crit' : kind === 'info' ? 'info' : '';
  return <div className={`alert-banner ${cls}`}><Icon name={icon} />{children}</div>;
}

/* -------------------------------- campos --------------------------------- */

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}{hint ? <span className="muted" style={{ fontWeight: 400 }}> · {hint}</span> : null}</span>
      {children}
    </label>
  );
}

export type Bind<T> = <K extends keyof T>(name: K) => {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
};

export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(name: K, value: T[K]) =>
    setValues((v) => ({ ...v, [name]: value }));
  const bind: Bind<T> = (name) => ({
    value: String(values[name] ?? ''),
    onChange: (e) => set(name, e.target.value as T[typeof name]),
  });
  return { values, set, setValues, bind };
}

export function Select({ options, ...rest }: { options: Option[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="select" {...rest}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

/* --------------------------------- modal --------------------------------- */

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => Promise<void> | void;
  submitLabel?: string;
  danger?: boolean;
  wide?: boolean;
  hideCancel?: boolean;
}

export function Modal({ title, children, onClose, onSubmit, submitLabel = 'Salvar', danger, wide, hideCancel }: ModalProps) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const el = firstField.current?.querySelector<HTMLElement>('input,select,textarea');
    const t = setTimeout(() => el?.focus(), 40);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
    };
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return onClose();
    setErr('');
    setBusy(true);
    try {
      await onSubmit();
      onClose();
    } catch (ex) {
      setErr(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="overlay" ref={overlay}
      onMouseDown={(e) => { if (e.target === overlay.current) onClose(); }}
    >
      <form className="modal" style={wide ? { maxWidth: 760 } : undefined} onSubmit={submit} ref={firstField} noValidate>
        <div className="modal-head">
          <h3>{title}</h3>
          <IconBtn icon="x" onClick={onClose} aria-label="Fechar" />
        </div>
        <div className="modal-body">
          {children}
          {err ? <p className="err">{err}</p> : null}
        </div>
        <div className="modal-foot">
          {hideCancel ? null : <Btn onClick={onClose}>Cancelar</Btn>}
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? 'Salvando…' : submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ title, message, confirmLabel = 'Excluir', onClose, onConfirm }: {
  title: string; message: ReactNode; confirmLabel?: string;
  onClose: () => void; onConfirm: () => Promise<void> | void;
}) {
  return (
    <Modal title={title} onClose={onClose} onSubmit={onConfirm} submitLabel={confirmLabel} danger>
      <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.55 }}>{message}</p>
    </Modal>
  );
}

/* --------------------------------- tabela -------------------------------- */

export function TableWrap({ children, responsive = true }: { children: ReactNode; responsive?: boolean }) {
  return <div className={`table-wrap${responsive ? ' responsive' : ''}`}>{children}</div>;
}

/* -------------------------------- sub-abas -------------------------------- */

export function SubNav<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="subnav" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null ? <span className="n">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segment<T extends string | number>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="segment">
      {options.map((o) => (
        <button key={String(o.key)} type="button" aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
