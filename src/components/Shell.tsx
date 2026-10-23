import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart3, Bell, BookOpen, ChevronDown, ChevronRight, ChevronsLeft, Compass, FileText, HelpCircle, LayoutDashboard, Lock, Menu as MenuIcon,
  MessageSquare, Moon, Plug, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, TrendingUp, Workflow, X, Building2,
} from 'lucide-react'
import { Link, go, useRoute } from '../lib/router'
import { useStore, WORKSPACES, PERSONAS } from '../lib/store'
import { DATASETS, METRICS, ROLES, type PageKey } from '../lib/data'
import { ago } from '../lib/analytics'
import { Avatar, Badge, Button, DateRangePicker, EmptyState, IconButton, Menu, Modal, Switch, cx } from './ui'

type NavItem = { key: PageKey; label: string; to: string; icon: ReactNode; children?: { label: string; to: string; key: PageKey }[] }
const ic = 'size-[18px] shrink-0'
const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', to: '/overview', icon: <LayoutDashboard className={ic} /> },
  { key: 'analytics', label: 'Analytics', to: '/analytics', icon: <BarChart3 className={ic} /> },
  { key: 'explore', label: 'Explore Data', to: '/explore', icon: <Compass className={ic} /> },
  { key: 'reports', label: 'Reports', to: '/reports', icon: <FileText className={ic} />, children: [{ label: 'Library', to: '/reports', key: 'reports' }, { label: 'Report builder', to: '/reports/builder', key: 'reports' }] },
  { key: 'copilot', label: 'AI Insights', to: '/copilot', icon: <Sparkles className={ic} /> },
  { key: 'forecasting', label: 'Forecasting', to: '/forecasting', icon: <TrendingUp className={ic} /> },
  { key: 'sources', label: 'Data Sources', to: '/sources', icon: <Plug className={ic} /> },
  { key: 'pipelines', label: 'Data Pipelines', to: '/pipelines', icon: <Workflow className={ic} /> },
  { key: 'quality', label: 'Data Quality', to: '/quality', icon: <ShieldCheck className={ic} /> },
  { key: 'metrics', label: 'Metrics Catalog', to: '/metrics', icon: <BookOpen className={ic} /> },
  { key: 'collaboration', label: 'Collaboration', to: '/collaboration', icon: <MessageSquare className={ic} /> },
  { key: 'users', label: 'Administration', to: '/admin/users', icon: <Settings className={ic} />, children: [
    { label: 'Users', to: '/admin/users', key: 'users' }, { label: 'Roles & permissions', to: '/admin/roles', key: 'roles' }, { label: 'Audit logs', to: '/admin/audit', key: 'audit' }, { label: 'Workspace settings', to: '/admin/settings', key: 'settings' },
  ] },
]

function Logo({ small }: { small?: boolean }) {
  return (
    <Link to="/overview" className="flex items-center gap-2.5 rounded-lg" aria-label="Nexus Analytics home">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-on-primary">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 19V5l14 14V5" /></svg>
      </span>
      {!small && <span className="text-[15px] font-semibold tracking-tight text-ink">Nexus Analytics</span>}
    </Link>
  )
}

function Sidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const { collapsed, setCollapsed, level, role } = useStore()
  const { path } = useRoute()
  const narrow = collapsed && !mobile
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isActive = (to: string) => path === to || (to !== '/reports' && path.startsWith(to + '/')) || (to === '/explore' && path.startsWith('/explore'))
  return (
    <nav aria-label="Primary" className={cx('flex h-full flex-col border-r border-line bg-surface', narrow ? 'w-[68px]' : 'w-[248px]')}>
      <div className={cx('flex h-14 shrink-0 items-center border-b border-line', narrow ? 'justify-center' : 'justify-between px-4')}>
        <Logo small={narrow} />
        {mobile && <IconButton label="Close navigation" onClick={onClose}><X className="size-4" /></IconButton>}
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const lock = level(item.key) === 'none' && !item.children
          const adminLock = item.children && item.children.every((c) => level(c.key) === 'none')
          const locked = lock || adminLock
          const active = item.children ? item.children.some((c) => path === c.to || (c.to !== '/reports' && path.startsWith(c.to + '/'))) || path.startsWith('/reports') && item.key === 'reports' : isActive(item.to)
          const expanded = item.children ? (open[item.label] ?? active) : false
          const cls = cx('group flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors', narrow && 'justify-center px-0', active ? 'bg-primary-soft text-primary-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink')
          return (
            <li key={item.label}>
              {item.children && !narrow ? (
                <button type="button" aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [item.label]: !expanded }))} className={cls}>
                  {item.icon}<span className="flex-1 text-left">{item.label}</span>{locked && <Lock className="size-3.5 text-muted" aria-label="No access" />}
                  <ChevronRight className={cx('size-4 text-muted transition-transform', expanded && 'rotate-90')} aria-hidden />
                </button>
              ) : (
                <Link to={item.to} onClick={onClose} aria-current={active ? 'page' : undefined} title={narrow ? item.label : undefined} className={cls}>
                  {item.icon}{!narrow && <span className="flex-1">{item.label}</span>}{!narrow && locked && <Lock className="size-3.5 text-muted" aria-label="No access for your role" />}
                  {narrow && <span className="sr-only">{item.label}</span>}
                </Link>
              )}
              {item.children && expanded && !narrow && (
                <ul className="ml-[22px] mt-0.5 space-y-0.5 border-l border-line pl-2.5">
                  {item.children.map((c) => {
                    const ca = path === c.to || (c.to === '/reports' && path === '/reports')
                    return (
                      <li key={c.to}>
                        <Link to={c.to} onClick={onClose} aria-current={ca ? 'page' : undefined} className={cx('flex h-8 items-center justify-between rounded-md px-2.5 text-[13px]', ca ? 'font-medium text-primary-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink')}>
                          {c.label}{level(c.key) === 'none' && <Lock className="size-3 text-muted" aria-label="No access" />}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <div className="shrink-0 border-t border-line p-2">
        {!narrow && <p className="mb-1 truncate px-2.5 text-xs text-muted">Viewing as {role}</p>}
        {!mobile && (
          <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-pressed={collapsed} className={cx('flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-ink-2 hover:bg-sunken hover:text-ink', narrow && 'justify-center px-0')}>
            <ChevronsLeft className={cx('size-[18px] transition-transform', collapsed && 'rotate-180')} aria-hidden />{!narrow && 'Collapse'}
          </button>
        )}
      </div>
    </nav>
  )
}

// ---------- Global search ----------
type Hit = { cat: string; label: string; sub: string; to: string }
function SearchPalette({ onClose }: { onClose: () => void }) {
  const { reports, analyses, recentSearches, addRecentSearch, level } = useStore()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [idx, setIdx] = useState(0)
  const index: Hit[] = useMemo(() => [
    ...(level('explore') !== 'none' ? DATASETS.map((d) => ({ cat: 'Datasets', label: d.name, sub: `${d.rows.toLocaleString()} rows · ${d.sensitivity}`, to: `/explore/${d.id}` })) : []),
    ...(level('reports') !== 'none' ? reports.filter((r) => r.status !== 'Archived').map((r) => ({ cat: 'Reports', label: r.name, sub: `${r.category} · ${r.status}`, to: `/reports/builder/${r.id}` })) : []),
    ...(level('metrics') !== 'none' ? METRICS.map((m) => ({ cat: 'Metrics', label: m.name, sub: `${m.domain} · ${m.certification}`, to: `/metrics?id=${m.id}` })) : []),
    ...(level('overview') !== 'none' ? [{ cat: 'Dashboards', label: 'Executive Overview', sub: 'Business health dashboard', to: '/overview' }, { cat: 'Dashboards', label: 'Operations SLA', sub: 'Dashboard', to: '/analytics' }] : []),
    ...(level('analytics') !== 'none' ? analyses.map((a) => ({ cat: 'Saved analyses', label: a.name, sub: `Owner ${a.owner}`, to: `/analytics?open=${a.id}` })) : []),
  ], [reports, analyses, level])
  const cats = ['All', 'Datasets', 'Reports', 'Metrics', 'Dashboards', 'Saved analyses']
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    return index.filter((h) => (cat === 'All' || h.cat === cat) && (!t || h.label.toLowerCase().includes(t) || h.sub.toLowerCase().includes(t))).slice(0, 12)
  }, [q, cat, index])
  useEffect(() => setIdx(0), [q, cat])
  const open = (h: Hit) => { addRecentSearch(q || h.label); onClose(); go(h.to) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && hits[idx]) open(hits[idx])
  }
  return createPortal(
    <div className="nx-fade fixed inset-0 z-[95] flex items-start justify-center bg-[var(--overlay)] p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Global search" onKeyDown={onKey} className="nx-pop w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-muted" aria-hidden />
          <input autoFocus role="combobox" aria-expanded aria-controls="search-results" aria-activedescendant={hits[idx] ? `sr-${idx}` : undefined} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search datasets, reports, metrics, dashboards…" className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" aria-label="Search" />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2" role="group" aria-label="Filter by category">
          {cats.map((c) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={cx('h-7 shrink-0 rounded-full border px-3 text-xs font-medium', cat === c ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line text-ink-2 hover:bg-sunken')}>{c}</button>)}
        </div>
        <div className="max-h-[50vh] overflow-y-auto" id="search-results" role="listbox" aria-label="Results">
          {!q && cat === 'All' && recentSearches.length > 0 && (
            <div className="border-b border-line px-4 py-2"><p className="mb-1 text-xs font-medium text-muted">Recent searches</p><div className="flex flex-wrap gap-1.5">{recentSearches.map((r) => <button key={r} onClick={() => setQ(r)} className="rounded-md bg-sunken px-2 py-1 text-xs text-ink-2 hover:text-ink">{r}</button>)}</div></div>
          )}
          {hits.length ? hits.map((h, i) => (
            <button key={h.cat + h.label} id={`sr-${i}`} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => open(h)} className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left', i === idx && 'bg-primary-soft')}>
              <Badge>{h.cat}</Badge><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{h.label}</span><span className="block truncate text-xs text-muted">{h.sub}</span></span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </button>
          )) : <EmptyState icon={<Search className="size-5" />} title={`No results for “${q}”`} body="Check the spelling, try a broader term, or switch category. Results only include items your role can access." action={<Button size="sm" onClick={() => { setQ(''); setCat('All') }}>Clear search</Button>} />}
        </div>
      </div>
    </div>, document.body)
}

// ---------- Notifications ----------
const NOTIF_LABELS: Record<string, string> = { report: 'Report completed', pipeline: 'Pipeline failures', freshness: 'Data freshness warnings', share: 'Shared reports', mention: 'Mentions', action: 'Assigned actions' }
function Notifications() {
  const { notifications, setNotifications, notifPrefs, setNotifPrefs } = useStore()
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const shown = notifications.filter((n) => notifPrefs[n.type] !== false)
  const unread = shown.filter((n) => !n.read).length
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <IconButton label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="size-[18px]" />{unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{unread}</span>}
      </IconButton>
      {open && (
        <div role="dialog" aria-label="Notifications" className="nx-pop absolute right-0 z-50 mt-1 w-[min(380px,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink">Notifications</h2>
            <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={!unread} onClick={() => setNotifications((n) => n.map((x) => ({ ...x, read: true })))}>Mark all read</Button><IconButton label="Notification preferences" className="size-8" onClick={() => { setOpen(false); setPrefs(true) }}><SlidersHorizontal className="size-4" /></IconButton></div>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {shown.length ? shown.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <div className={cx('flex gap-2.5 px-4 py-3', !n.read && 'bg-primary-soft/50')}>
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} aria-label={n.read ? 'Read' : 'Unread'} />
                  <div className="min-w-0 flex-1">
                    <button className="block w-full text-left" onClick={() => { setNotifications((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setOpen(false); go(n.href.replace('#', '')) }}>
                      <p className="text-[13px] font-medium text-ink">{n.title}</p><p className="text-xs text-ink-2">{n.body}</p>
                    </button>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted"><span>{ago(n.at)}</span><button className="hover:text-ink hover:underline" onClick={() => setNotifications((l) => l.map((x) => (x.id === n.id ? { ...x, read: !x.read } : x)))}>Mark as {n.read ? 'unread' : 'read'}</button></div>
                  </div>
                </div>
              </li>
            )) : <li><EmptyState icon={<Bell className="size-5" />} title="You are all caught up" body="No notifications match your preferences." /></li>}
          </ul>
        </div>
      )}
      <Modal open={prefs} onClose={() => setPrefs(false)} title="Notification preferences" description="Choose which events appear in your notification list." footer={<Button variant="primary" onClick={() => setPrefs(false)}>Done</Button>}>
        <ul className="divide-y divide-line">{Object.entries(NOTIF_LABELS).map(([k, l]) => <li key={k} className="flex items-center justify-between py-2.5 text-[13px] text-ink">{l}<Switch label={l} checked={notifPrefs[k] !== false} onChange={(v) => setNotifPrefs((p) => ({ ...p, [k]: v }))} /></li>)}</ul>
      </Modal>
    </div>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { theme, setTheme, role, setRole, userName, workspace, setWorkspace, level, toast, filters, setFilters, setOnboarded, log, resetDemo } = useStore()
  const [mobileNav, setMobileNav] = useState(false)
  const [search, setSearch] = useState(false)
  const [help, setHelp] = useState(false)
  const { path } = useRoute()
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch((s) => !s) } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
  useEffect(() => { setMobileNav(false); document.getElementById('main')?.scrollTo({ top: 0 }) }, [path])
  const can = (k: PageKey) => level(k) === 'edit'
  const createItem = (label: string, to: string, page: PageKey) => ({ label: can(page) ? label : `${label} (no access)`, disabled: !can(page), onSelect: () => go(to) })
  return (
    <div className="flex h-full bg-canvas">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }} className="sr-only z-[200] rounded-lg bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to main content</a>
      <div className="hidden lg:block"><Sidebar /></div>
      {mobileNav && <div className="fixed inset-0 z-[80] flex bg-[var(--overlay)] lg:hidden nx-fade" onMouseDown={(e) => e.target === e.currentTarget && setMobileNav(false)}><Sidebar mobile onClose={() => setMobileNav(false)} /></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-5">
          <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileNav(true)}><MenuIcon className="size-5" /></IconButton>
          <div className="lg:hidden"><Logo small /></div>
          <Menu label="Switch workspace" align="left" trigger={<span className="hidden h-9 items-center gap-2 rounded-lg border border-line-strong px-2.5 text-[13px] font-medium text-ink hover:bg-sunken md:inline-flex"><Building2 className="size-4 text-muted" />{workspace.split(' · ')[0]}<ChevronDown className="size-4 text-muted" /></span>}
            items={WORKSPACES.map((w) => ({ label: w + (w === workspace ? '  ✓' : ''), onSelect: () => { setWorkspace(w); toast(`Switched to ${w} (demo: data is shared across workspaces)`, 'info') } }))} />
          <button onClick={() => setSearch(true)} aria-label="Search (Ctrl K)" className="mx-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-sunken px-3 text-left text-[13px] text-muted hover:border-ink-2 sm:max-w-md">
            <Search className="size-4 shrink-0" aria-hidden /><span className="flex-1 truncate">Search datasets, reports, metrics…</span><kbd className="hidden rounded border border-line bg-surface px-1.5 text-[11px] sm:block">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <div className="hidden xl:block"><DateRangePicker filters={filters} onChange={setFilters} /></div>
            <Menu label="Create" trigger={<span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover"><Plus className="size-4" /><span className="hidden sm:inline">Create</span></span>}
              items={[createItem('New report', '/reports/builder', 'reports'), createItem('New analysis', '/analytics?new=1', 'analytics'), createItem('Ask the AI copilot', '/copilot', 'copilot'), 'sep', createItem('New data connection', '/sources?new=1', 'sources'), createItem('New pipeline', '/pipelines?new=1', 'pipelines'), createItem('New decision', '/collaboration?new=1', 'collaboration')]} />
            <Notifications />
            <IconButton label="Help center" onClick={() => setHelp(true)}><HelpCircle className="size-[18px]" /></IconButton>
            <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</IconButton>
            <Menu label={`Account menu, ${userName}`} trigger={<span className="ml-1 flex items-center gap-2 rounded-lg p-1 hover:bg-sunken"><Avatar name={userName} size={30} /><span className="hidden text-left leading-tight lg:block"><span className="block text-[13px] font-medium text-ink">{userName}</span><span className="block text-xs text-muted">{role}</span></span></span>}
              items={[{ label: `Signed in as ${userName}`, disabled: true, onSelect: () => {} }, 'sep', ...ROLES.map((r) => ({ label: `${r === role ? '✓ ' : '   '}Switch to ${r} (${PERSONAS[r].split(' ')[0]})`, onSelect: () => { setRole(r); log('role.switch', `Demo persona → ${r}`); toast(`Now viewing as ${r}. Navigation and permissions updated.`, 'info') } })), 'sep',
                { label: 'Replay onboarding', onSelect: () => { setOnboarded(false); go('/onboarding') } }, { label: 'Reset demo data', onSelect: resetDemo }, { label: 'Sign out (demo)', onSelect: () => go('/login') }]} />
          </div>
        </header>
        <div className="border-b border-line bg-surface px-3 py-2 xl:hidden"><DateRangePicker filters={filters} onChange={setFilters} /></div>
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto px-3 py-5 outline-none sm:px-6 lg:px-8"><div className="mx-auto w-full max-w-[1400px]">{children}</div></main>
      </div>
      {search && <SearchPalette onClose={() => setSearch(false)} />}
      <Modal open={help} onClose={() => setHelp(false)} title="Help center" description="Nexus Analytics demo · Halcyon Global synthetic dataset" footer={<Button onClick={() => setHelp(false)}>Close</Button>}>
        <dl className="space-y-3 text-[13px]">
          {[['Is this real data?', 'No. All numbers come from one seeded synthetic fact table, so every KPI, chart, report and AI answer agrees.'], ['Does the AI copilot use a language model?', 'No. Responses are deterministic demo answers computed from the same dataset, and each one shows its calculation.'], ['Are connections and pipelines live?', 'No. Connection tests and pipeline runs are simulated and labelled as demos.'], ['Keyboard shortcuts', 'Ctrl/Cmd + K opens search. Esc closes dialogs. Arrow keys move between tabs, menus and chart points.'], ['Where are my changes stored?', 'In this browser only (localStorage). Use “Reset demo data” in the account menu to restore the seed.']].map(([t, d]) => <div key={t}><dt className="font-semibold text-ink">{t}</dt><dd className="mt-0.5 text-ink-2">{d}</dd></div>)}
        </dl>
      </Modal>
    </div>
  )
}
