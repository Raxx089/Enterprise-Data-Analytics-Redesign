import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  DEFAULT_PERMS, SEED_ANALYSES, SEED_AUDIT, SEED_CONNECTIONS, SEED_DECISIONS, SEED_ISSUES, SEED_NOTIFICATIONS, SEED_PIPELINES, SEED_QUERIES, SEED_REPORTS, SEED_RULES, SEED_THREADS, SEED_USERS,
  type Audit, type Connection, type Decision, type Level, type Notification, type PageKey, type Perms, type Pipeline, type QIssue, type QRule, type Report, type RoleName, type SavedAnalysis, type SavedQuery, type Thread, type User,
} from './data'
import { DEFAULT_FILTERS, type Assumptions, type Filters } from './analytics'
import { setGuard } from './router'

const PREFIX = 'nexus:v1:'
function usePersisted<T>(key: string, init: T): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(PREFIX + key); if (raw) return JSON.parse(raw) as T } catch { /* ignore */ }
    return init
  })
  useEffect(() => { try { localStorage.setItem(PREFIX + key, JSON.stringify(v)) } catch { /* ignore */ } }, [key, v])
  return [v, setV]
}

export const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 8)}`

export interface Scenario { id: string; name: string; kind: 'Best' | 'Expected' | 'Worst' | 'Custom'; assumptions: Assumptions; owner: string; updated: string }
export const SEED_SCENARIOS: Scenario[] = [
  { id: 'sc1', name: 'Base case', kind: 'Expected', assumptions: { growthAdj: 0, costInflation: 3, demandAdj: 0 }, owner: 'Elena Petrova', updated: '2026-10-15' },
  { id: 'sc2', name: 'Upside – APAC acceleration', kind: 'Best', assumptions: { growthAdj: 0.6, costInflation: 3, demandAdj: 3 }, owner: 'Elena Petrova', updated: '2026-10-15' },
  { id: 'sc3', name: 'Downside – EMEA slippage', kind: 'Worst', assumptions: { growthAdj: -0.9, costInflation: 5, demandAdj: -4 }, owner: 'Elena Petrova', updated: '2026-10-15' },
]
export interface ChatMsg { id: string; role: 'user' | 'assistant'; text: string; payload?: unknown; at: string }
export interface Settings { workspaceName: string; timezone: string; currency: string; fiscalStart: string; sessionTimeout: number; enforceMfa: boolean; ipAllowlist: string; retentionDays: number; allowExports: boolean; allowExternalShare: boolean
  region?: string; defaultRange?: string; ssoRequired?: boolean; pwMinLength?: number; pwRotateDays?: number; piiMasking?: boolean; exportRoles?: string; digest?: string; quietOn?: boolean; quietStart?: string; quietEnd?: string }
export const DEFAULT_SETTINGS: Settings = { workspaceName: 'Halcyon Global', timezone: 'UTC', currency: 'USD', fiscalStart: 'January', sessionTimeout: 30, enforceMfa: true, ipAllowlist: '', retentionDays: 730, allowExports: true, allowExternalShare: false }
export const WORKSPACES = ['Halcyon Global · Production', 'Halcyon EMEA · Regional', 'Sandbox · Experiments']
export const PERSONAS: Record<RoleName, string> = {
  Executive: 'Nadia Okafor', 'Business Analyst': 'Priya Raman', 'Operations Manager': 'Tomas Alvarez', 'Finance Manager': 'Elena Petrova', 'Data Engineer': 'Dmitri Volkov', Administrator: 'Sofia Marin',
}
export const initials = (n: string) => n.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()

type Kind = 'success' | 'error' | 'info' | 'warning'
interface ToastItem { id: number; msg: string; kind: Kind }
interface ConfirmOpts { title: string; body: string; confirmLabel?: string; danger?: boolean }

export interface Store {
  signedIn: boolean; setSignedIn: (signedIn: boolean) => void
  theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void
  role: RoleName; setRole: (r: RoleName) => void; userName: string
  workspace: string; setWorkspace: (w: string) => void
  filters: Filters; setFilters: Dispatch<SetStateAction<Filters>>
  collapsed: boolean; setCollapsed: (b: boolean) => void
  onboarded: boolean; setOnboarded: (b: boolean) => void
  perms: Perms; setPerms: Dispatch<SetStateAction<Perms>>
  level: (page: PageKey) => Level
  reports: Report[]; setReports: Dispatch<SetStateAction<Report[]>>
  analyses: SavedAnalysis[]; setAnalyses: Dispatch<SetStateAction<SavedAnalysis[]>>
  queries: SavedQuery[]; setQueries: Dispatch<SetStateAction<SavedQuery[]>>
  connections: Connection[]; setConnections: Dispatch<SetStateAction<Connection[]>>
  pipelines: Pipeline[]; setPipelines: Dispatch<SetStateAction<Pipeline[]>>
  rules: QRule[]; setRules: Dispatch<SetStateAction<QRule[]>>
  issues: QIssue[]; setIssues: Dispatch<SetStateAction<QIssue[]>>
  users: User[]; setUsers: Dispatch<SetStateAction<User[]>>
  audit: Audit[]; log: (action: string, target: string, result?: Audit['result']) => void
  decisions: Decision[]; setDecisions: Dispatch<SetStateAction<Decision[]>>
  threads: Thread[]; setThreads: Dispatch<SetStateAction<Thread[]>>
  notifications: Notification[]; setNotifications: Dispatch<SetStateAction<Notification[]>>
  notifPrefs: Record<string, boolean>; setNotifPrefs: Dispatch<SetStateAction<Record<string, boolean>>>
  scenarios: Scenario[]; setScenarios: Dispatch<SetStateAction<Scenario[]>>
  chat: ChatMsg[]; setChat: Dispatch<SetStateAction<ChatMsg[]>>
  settings: Settings; setSettings: Dispatch<SetStateAction<Settings>>
  recentSearches: string[]; addRecentSearch: (q: string) => void
  toast: (msg: string, kind?: Kind) => void
  confirm: (o: ConfirmOpts) => Promise<boolean>
  openCreate: boolean; setOpenCreate: (b: boolean) => void
  resetDemo: () => void
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false)
  const [theme, setTheme] = usePersisted<'light' | 'dark'>('theme', 'light')
  const [role, setRole] = usePersisted<RoleName>('role', 'Executive')
  const [workspace, setWorkspace] = usePersisted('workspace', WORKSPACES[0])
  const [filters, setFilters] = usePersisted<Filters>('filters', DEFAULT_FILTERS)
  const [collapsed, setCollapsed] = usePersisted('collapsed', false)
  const [onboarded, setOnboarded] = usePersisted('onboarded', false)
  const [perms, setPerms] = usePersisted<Perms>('perms', DEFAULT_PERMS)
  const [reports, setReports] = usePersisted<Report[]>('reports', SEED_REPORTS)
  const [analyses, setAnalyses] = usePersisted<SavedAnalysis[]>('analyses', SEED_ANALYSES)
  const [queries, setQueries] = usePersisted<SavedQuery[]>('queries', SEED_QUERIES)
  const [connections, setConnections] = usePersisted<Connection[]>('connections', SEED_CONNECTIONS)
  const [pipelines, setPipelines] = usePersisted<Pipeline[]>('pipelines', SEED_PIPELINES)
  const [rules, setRules] = usePersisted<QRule[]>('rules', SEED_RULES)
  const [issues, setIssues] = usePersisted<QIssue[]>('issues', SEED_ISSUES)
  const [users, setUsers] = usePersisted<User[]>('users', SEED_USERS)
  const [audit, setAudit] = usePersisted<Audit[]>('audit', SEED_AUDIT)
  const [decisions, setDecisions] = usePersisted<Decision[]>('decisions', SEED_DECISIONS)
  const [threads, setThreads] = usePersisted<Thread[]>('threads', SEED_THREADS)
  const [notifications, setNotifications] = usePersisted<Notification[]>('notifications', SEED_NOTIFICATIONS)
  const [notifPrefs, setNotifPrefs] = usePersisted<Record<string, boolean>>('notifPrefs', { report: true, pipeline: true, freshness: true, share: true, mention: true, action: true })
  const [scenarios, setScenarios] = usePersisted<Scenario[]>('scenarios', SEED_SCENARIOS)
  const [chat, setChat] = usePersisted<ChatMsg[]>('chat', [])
  const [settings, setSettings] = usePersisted<Settings>('settings', DEFAULT_SETTINGS)
  const [recentSearches, setRecent] = usePersisted<string[]>('recent', ['EMEA revenue', 'Customer churn'])
  const [openCreate, setOpenCreate] = useState(false)

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])

  const [toasts, setToasts] = useState<ToastItem[]>([])
  const tid = useRef(0)
  const toast = useCallback((msg: string, kind: Kind = 'success') => {
    const id = ++tid.current
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), [])
  useEffect(() => {
    setGuard(() => confirm({ title: 'Discard unsaved changes?', body: 'You have changes that have not been saved. If you leave now they will be lost.', confirmLabel: 'Discard and leave', danger: true }))
  }, [confirm])

  const userName = PERSONAS[role]
  const log = useCallback((action: string, target: string, result: Audit['result'] = 'Success') => {
    setAudit((a) => [{ id: uid('au'), at: new Date().toISOString(), actor: userName, action, target, ip: '10.4.22.17', result }, ...a].slice(0, 300))
  }, [setAudit, userName])

  const level = useCallback((p: PageKey): Level => perms[role]?.[p] ?? 'none', [perms, role])
  const addRecentSearch = useCallback((q: string) => { if (q.trim()) setRecent((r) => [q.trim(), ...r.filter((x) => x !== q.trim())].slice(0, 5)) }, [setRecent])
  const resetDemo = useCallback(() => {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k))
    location.reload()
  }, [])

  const value: Store = useMemo(() => ({
    signedIn, setSignedIn, theme, setTheme, role, setRole, userName, workspace, setWorkspace, filters, setFilters, collapsed, setCollapsed, onboarded, setOnboarded, perms, setPerms, level,
    reports, setReports, analyses, setAnalyses, queries, setQueries, connections, setConnections, pipelines, setPipelines, rules, setRules, issues, setIssues, users, setUsers,
    audit, log, decisions, setDecisions, threads, setThreads, notifications, setNotifications, notifPrefs, setNotifPrefs, scenarios, setScenarios, chat, setChat, settings, setSettings,
    recentSearches, addRecentSearch, toast, confirm, openCreate, setOpenCreate, resetDemo,
  }), [signedIn, theme, role, userName, workspace, filters, collapsed, onboarded, perms, level, reports, analyses, queries, connections, pipelines, rules, issues, users, audit, log, decisions, threads, notifications, notifPrefs, scenarios, chat, settings, recentSearches, addRecentSearch, toast, confirm, openCreate, resetDemo]) // eslint-disable-line

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`nx-slide flex items-start gap-2 rounded-lg border bg-surface px-3 py-2.5 text-[13px] shadow-lg ${t.kind === 'error' ? 'border-danger' : t.kind === 'warning' ? 'border-warning' : t.kind === 'info' ? 'border-info' : 'border-success'}`}>
            <span className={`mt-1 size-2 shrink-0 rounded-full ${t.kind === 'error' ? 'bg-danger' : t.kind === 'warning' ? 'bg-warning' : t.kind === 'info' ? 'bg-info' : 'bg-success'}`} aria-hidden />
            <span className="flex-1 text-ink">{t.msg}</span>
            <button className="text-muted hover:text-ink" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
      {dlg && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-[var(--overlay)] p-4 nx-fade" onKeyDown={(e) => { if (e.key === 'Escape') { dlg.resolve(false); setDlg(null) } }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="cfm-t" aria-describedby="cfm-b" className="nx-pop w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-2xl">
            <h2 id="cfm-t" className="text-base font-semibold text-ink">{dlg.title}</h2>
            <p id="cfm-b" className="mt-1.5 text-[13px] text-ink-2">{dlg.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button autoFocus className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-sunken" onClick={() => { dlg.resolve(false); setDlg(null) }}>Cancel</button>
              <button className={`h-9 rounded-lg px-3 text-[13px] font-medium text-white ${dlg.danger ? 'bg-[#b42318] hover:bg-[#912018]' : 'bg-primary hover:bg-primary-hover'}`} onClick={() => { dlg.resolve(true); setDlg(null) }}>{dlg.confirmLabel ?? 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
