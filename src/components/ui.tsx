import { useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info, Lock, Search, X, XCircle, ChevronsUpDown, Check } from 'lucide-react'
import { MONTH_COUNT, monthLabel, REGIONS, UNITS } from '../lib/data'
import { RANGE_PRESETS, rangeLabel, type Filters } from '../lib/analytics'
import { Link, useRoute } from '../lib/router'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

// ---------- Button ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: ReactNode; loading?: boolean }
export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-primary text-on-primary hover:bg-primary-hover border-transparent',
    secondary: 'bg-surface text-ink border-line-strong hover:bg-sunken',
    ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-sunken hover:text-ink',
    danger: 'bg-danger-soft text-danger border-transparent hover:brightness-95',
  }[variant]
  return (
    <button {...rest} disabled={disabled || loading} className={cx('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50', size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-[13px]', v, className)}>
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      {children}
    </button>
  )
}
export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...rest} aria-label={label} title={label} className={cx('inline-flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-50', className)}>{children}</button>
}

// ---------- Badge ----------
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2 border-line', primary: 'bg-primary-soft text-primary-ink border-transparent', success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent', danger: 'bg-danger-soft text-danger border-transparent', info: 'bg-info-soft text-info border-transparent',
}
export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}{children}</span>
}
export function statusTone(s: string): Tone {
  const x = s.toLowerCase()
  if (['success', 'connected', 'certified', 'published', 'active', 'done', 'resolved', 'approved', 'fulfilled', 'ga'].includes(x)) return 'success'
  if (['running', 'syncing', 'investigating', 'in progress', 'in review', 'invited', 'processing', 'beta', 'proposed'].includes(x)) return 'info'
  if (['warning', 'draft', 'paused', 'medium', 'backordered', 'open'].includes(x)) return 'warning'
  if (['failed', 'error', 'critical', 'high', 'suspended', 'denied', 'rejected', 'cancelled', 'deprecated', 'sunset'].includes(x)) return 'danger'
  return 'neutral'
}
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={statusTone(status)} dot>{status}</Badge>
export const DemoBadge = ({ children = 'Demo data' }: { children?: ReactNode }) => <Badge tone="info">{children}</Badge>

// ---------- Layout ----------
export function Card({ title, subtitle, actions, children, className, pad = true, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section id={id} className={cx('rounded-xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5">
          <div className="min-w-0">
            {title && <h3 className="text-[13px] font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cx(pad && 'p-4', Boolean(title || actions) && pad && 'pt-3')}>{children}</div>
    </section>
  )
}
export function PageHeader({ title, description, actions, crumbs, badge }: { title: string; description?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[]; badge?: ReactNode }) {
  return (
    <div className="mb-5">
      {crumbs && (
        <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs text-muted">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" aria-hidden />}
              {c.to ? <Link to={c.to} className="hover:text-ink hover:underline">{c.label}</Link> : <span aria-current="page" className="text-ink-2">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h1 className="text-[22px] font-semibold leading-7 tracking-tight text-ink">{title}</h1>{badge}</div>
          {description && <p className="mt-1 max-w-3xl text-[13px] text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Banner({ tone = 'info', title, children, action }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle }[tone]
  const c = { info: 'bg-info-soft text-info', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger' }[tone]
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px]', c)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-ink">{title && <p className="font-semibold">{title}</p>}<div className={title ? 'text-ink-2' : ''}>{children}</div></div>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      {icon && <div className="mb-2 grid size-10 place-items-center rounded-full bg-sunken text-muted">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('nx-skeleton', className)} aria-hidden />

export function NoAccess({ page, need = 'view' }: { page: string; need?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-8 text-center">
      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-warning-soft text-warning"><Lock className="size-5" aria-hidden /></div>
      <h1 className="text-lg font-semibold text-ink">You do not have access to {page}</h1>
      <p className="mt-1.5 text-[13px] text-ink-2">Your role does not include {need} permission for this area. Content is hidden and no data was loaded. Ask a workspace administrator to update your role.</p>
      <div className="mt-5 flex justify-center gap-2"><Link to="/overview" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:bg-primary-hover">Back to Overview</Link></div>
    </div>
  )
}
export function ReadOnlyNote({ page }: { page: string }) {
  return <div className="mb-4"><Banner tone="info" title="View-only access"><span>Your role can view {page} but cannot make changes. Edit actions are disabled.</span></Banner></div>
}

// ---------- Forms ----------
export function Field({ label, hint, error, required, children, htmlFor }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink">{label}{required && <span className="text-danger" aria-hidden> *</span>}</label>
      {children}
      {error ? <p className="flex items-center gap-1 text-xs text-danger" role="alert"><XCircle className="size-3.5" aria-hidden />{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
const ctl = 'w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-muted transition-colors hover:border-line-strong disabled:bg-sunken disabled:opacity-70'
export function Input({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} aria-invalid={invalid || undefined} className={cx(ctl, 'h-9', invalid ? 'border-danger' : 'border-line-strong', className)} />
}
export function Textarea({ invalid, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} aria-invalid={invalid || undefined} className={cx(ctl, 'min-h-20 py-2', invalid ? 'border-danger' : 'border-line-strong', className)} />
}
export function Select({ className, children, invalid, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className={cx('relative', className)}>
      <select {...rest} aria-invalid={invalid || undefined} className={cx(ctl, 'h-9 appearance-none pr-8', invalid ? 'border-danger' : 'border-line-strong')}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  )
}
export function SearchInput({ value, onChange, placeholder = 'Search', className, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(ctl, 'h-9 border-line-strong pl-8')} />
    </div>
  )
}
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors disabled:opacity-50', checked ? 'bg-primary' : 'bg-line-strong')}>
      <span className={cx('size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}
export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-[13px] text-ink', disabled && 'opacity-60')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-line-strong accent-[var(--primary)]" />
      {label}
    </label>
  )
}
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; aria?: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line-strong bg-sunken p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} aria-label={o.aria} onClick={() => onChange(o.value)}
          className={cx('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>{o.label}</button>
      ))}
    </div>
  )
}

// ---------- Tabs ----------
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; label: string }) {
  const id = useId()
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.value === value)
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].value)
    if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].value)
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" id={`${id}-${t.value}`} aria-selected={value === t.value} tabIndex={value === t.value ? 0 : -1} onClick={() => onChange(t.value)}
          className={cx('-mb-px inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-medium transition-colors', value === t.value ? 'border-primary text-primary-ink' : 'border-transparent text-ink-2 hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="rounded-full bg-sunken px-1.5 text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------- Overlays ----------
function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])
}
function Overlay({ children, onClose, side }: { children: ReactNode; onClose: () => void; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button:not([aria-label="Close"])')
    el?.focus()
    return () => prev?.focus?.()
  }, [])
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return
    const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
    if (!f.length) return
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
  }
  return createPortal(
    <div className={cx('fixed inset-0 z-[90] bg-[var(--overlay)] nx-fade', side ? 'flex justify-end' : 'grid place-items-center p-4')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} onKeyDown={trap}>
      <div ref={ref} className="contents">{children}</div>
    </div>, document.body)
}
export function Modal({ open, onClose, title, description, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEsc(open, onClose)
  const id = useId()
  if (!open) return null
  return (
    <Overlay onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className={cx('nx-pop flex max-h-[90vh] w-full flex-col rounded-xl border border-line bg-surface shadow-2xl', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div><h2 id={id} className="text-base font-semibold text-ink">{title}</h2>{description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}</div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1.5"><X className="size-4" /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </Overlay>
  )
}
export function Drawer({ open, onClose, title, description, children, footer, width = 'max-w-xl' }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEsc(open, onClose)
  const id = useId()
  if (!open) return null
  return (
    <Overlay onClose={onClose} side>
      <aside role="dialog" aria-modal="true" aria-labelledby={id} className={cx('nx-slide flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0"><h2 id={id} className="truncate text-base font-semibold text-ink">{title}</h2>{description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}</div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1.5"><X className="size-4" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </aside>
    </Overlay>
  )
}

// ---------- Menu ----------
export function Menu({ trigger, items, align = 'right', label }: { trigger: ReactNode; label: string; align?: 'left' | 'right'; items: ({ label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean } | 'sep')[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
  }
  return (
    <div ref={ref} className="relative inline-block" onKeyDown={onKey}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center rounded-lg">{trigger}</button>
      {open && (
        <div role="menu" aria-label={label} className={cx('nx-pop absolute z-50 mt-1 min-w-48 rounded-lg border border-line bg-surface py-1 shadow-xl', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) => it === 'sep' ? <div key={i} className="my-1 h-px bg-line" role="separator" /> : (
            <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect() }}
              className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-sunken disabled:opacity-40', it.danger ? 'text-danger' : 'text-ink')}>{it.icon}{it.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  const id = useId()
  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className={cx('pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-md bg-[#101828] px-2 py-1.5 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100', side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>{text}</span>
    </span>
  )
}

// ---------- Table ----------
export interface Col<T> { key: string; header: string; render?: (r: T) => ReactNode; sort?: (r: T) => string | number; align?: 'left' | 'right'; width?: string; hidden?: boolean; className?: string }
export function Table<T>({ cols, rows, rowKey, pageSize = 10, onRowClick, caption, empty, initialSort, dense, loading, toolbar, selectedKey }: {
  cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; pageSize?: number; onRowClick?: (r: T) => void; caption: string; empty?: ReactNode; initialSort?: { key: string; dir: 'asc' | 'desc' }; dense?: boolean; loading?: boolean; toolbar?: ReactNode; selectedKey?: string
}) {
  const [sort, setSort] = useState(initialSort ?? null)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(pageSize)
  const visible = cols.filter((c) => !c.hidden)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const c = cols.find((x) => x.key === sort.key)
    if (!c?.sort) return rows
    const f = c.sort
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return sort.dir === 'asc' ? r : -r })
  }, [rows, sort, cols])
  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const cur = Math.min(page, pages - 1)
  const slice = sorted.slice(cur * size, cur * size + size)
  const py = dense ? 'py-1.5' : 'py-2.5'
  return (
    <div>
      {toolbar}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-y border-line bg-sunken">
              {visible.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined} style={{ width: c.width }} className={cx('whitespace-nowrap px-3 py-2 text-xs font-medium text-muted', c.align === 'right' ? 'text-right' : 'text-left')}>
                    {c.sort ? (
                      <button className={cx('inline-flex items-center gap-1 rounded hover:text-ink', c.align === 'right' && 'flex-row-reverse')} onClick={() => { setSort(active && sort!.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: c.key, dir: 'asc' }); setPage(0) }}>
                        {c.header}{active ? (sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-50" />}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-b border-line"><td colSpan={visible.length} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td></tr>) : slice.map((r) => {
              const k = rowKey(r)
              return (
                <tr key={k} aria-selected={selectedKey === k || undefined} className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-sunken', selectedKey === k && 'bg-primary-soft')}
                  onClick={onRowClick ? () => onRowClick(r) : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r) } : undefined} tabIndex={onRowClick ? 0 : undefined}>
                  {visible.map((c) => <td key={c.key} className={cx('px-3 text-ink', py, c.align === 'right' && 'tnum text-right', c.className)}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && !rows.length && (empty ?? <EmptyState icon={<Search className="size-5" />} title="No results" body="Try adjusting your search or filters." />)}
      </div>
      {rows.length > 0 && <Pagination page={cur} pages={pages} total={sorted.length} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(0) }} />}
    </div>
  )
}
export function Pagination({ page, pages, total, size, onPage, onSize }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void; onSize?: (n: number) => void }) {
  const from = total ? page * size + 1 : 0
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-muted">
      <span className="tnum">{from}–{Math.min(total, (page + 1) * size)} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        {onSize && <label className="flex items-center gap-1.5">Rows<select aria-label="Rows per page" value={size} onChange={(e) => onSize(+e.target.value)} className="h-7 rounded-md border border-line-strong bg-surface px-1 text-xs text-ink">{[5, 10, 25, 50].map((n) => <option key={n}>{n}</option>)}</select></label>}
        <IconButton label="Previous page" className="size-7" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" /></IconButton>
        <span className="tnum text-ink-2">Page {page + 1} of {pages}</span>
        <IconButton label="Next page" className="size-7" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></IconButton>
      </div>
    </nav>
  )
}

// ---------- Stepper / progress ----------
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className="flex items-center gap-2">
          <span className={cx('grid size-5 place-items-center rounded-full text-[11px] font-semibold', i < current ? 'bg-success text-white' : i === current ? 'bg-primary text-on-primary' : 'bg-sunken text-muted border border-line')}>{i < current ? <Check className="size-3" /> : i + 1}</span>
          <span className={cx(i === current ? 'font-medium text-ink' : 'text-muted')}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-line-strong" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}
export function ProgressBar({ value, tone = 'primary', label }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; label: string }) {
  const c = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone]
  return <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"><div className={cx('h-full rounded-full', c)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
}
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const i = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return <span aria-hidden className="inline-grid shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary-ink" style={{ width: size, height: size, fontSize: size * 0.38 }}>{i}</span>
}

// ---------- Filters ----------
export function FilterBar({ filters, onChange, compact }: { filters: Filters; onChange: (f: Filters) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Segment filters">
      <Select aria-label="Region" value={filters.region} onChange={(e) => onChange({ ...filters, region: e.target.value })} className="w-40"><option value="All">All regions</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}</Select>
      <Select aria-label="Business unit" value={filters.unit} onChange={(e) => onChange({ ...filters, unit: e.target.value })} className="w-48"><option value="All">All business units</option>{UNITS.map((r) => <option key={r}>{r}</option>)}</Select>
      {!compact && (filters.region !== 'All' || filters.unit !== 'All') && <Button size="sm" variant="ghost" onClick={() => onChange({ ...filters, region: 'All', unit: 'All' })}>Clear filters</Button>}
    </div>
  )
}

export function DateRangePicker({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(filters.start)
  const [e, setE] = useState(filters.end)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { setS(filters.start); setE(filters.end) }, [filters.start, filters.end, open])
  useEffect(() => {
    if (!open) return
    const h = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) setOpen(false) }
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  const opts = Array.from({ length: 12 }, (_, i) => MONTH_COUNT - 12 + i)
  const valid = s <= e
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink hover:bg-sunken">
        <CalendarIcon />{rangeLabel(filters)}<ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Select date range" className="nx-pop absolute right-0 z-50 mt-1 w-[320px] rounded-xl border border-line bg-surface p-3 shadow-xl">
          <p className="mb-1.5 text-xs font-medium text-muted">Presets</p>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {RANGE_PRESETS.map((p) => <button key={p.id} onClick={() => { onChange({ ...filters, start: p.start, end: p.end }); setOpen(false) }} className={cx('h-8 rounded-md border text-[13px]', filters.start === p.start && filters.end === p.end ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line hover:bg-sunken')}>{p.label}</button>)}
          </div>
          <p className="mb-1.5 text-xs font-medium text-muted">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="From month" value={s} onChange={(x) => setS(+x.target.value)}>{opts.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}</Select>
            <Select aria-label="To month" value={e} onChange={(x) => setE(+x.target.value)}>{opts.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}</Select>
          </div>
          {!valid && <p role="alert" className="mt-1.5 text-xs text-danger">The start month must be on or before the end month.</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Compared with the previous {e - s + 1} months</span>
            <Button size="sm" variant="primary" disabled={!valid} onClick={() => { onChange({ ...filters, start: s, end: e }); setOpen(false) }}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  )
}
const CalendarIcon = () => <svg viewBox="0 0 24 24" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>

// ---------- Admin sub-navigation ----------
export function AdminNav() {
  const { path } = useRoute()
  const items = [{ to: '/admin/users', label: 'Users' }, { to: '/admin/roles', label: 'Roles & permissions' }, { to: '/admin/audit', label: 'Audit logs' }, { to: '/admin/settings', label: 'Settings' }]
  return (
    <nav aria-label="Administration" className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {items.map((i) => (
        <Link key={i.to} to={i.to} aria-current={path === i.to ? 'page' : undefined} className={cx('-mb-px inline-flex h-9 items-center border-b-2 px-3 text-[13px] font-medium', path === i.to ? 'border-primary text-primary-ink' : 'border-transparent text-ink-2 hover:text-ink')}>{i.label}</Link>
      ))}
    </nav>
  )
}
