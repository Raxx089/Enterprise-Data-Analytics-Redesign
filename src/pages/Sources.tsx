import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, KeyRound, Pause, Pencil, Play, Plug, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { useStore } from '../lib/store'
import { uid } from '../lib/store'
import { CONNECTORS, ROLES, type Connection, type Connector, type RoleName } from '../lib/data'
import { ago, fmtDate } from '../lib/analytics'
import { Badge, Banner, Button, Card, Checkbox, DemoBadge, Drawer, EmptyState, Field, Input, Modal, NoAccess, PageHeader, ReadOnlyNote, SearchInput, Select, Skeleton, Stepper, StatusBadge, Switch, Table, cx } from '../components/ui'
import { Link, go, useDirty, useRoute } from '../lib/router'

type Conn = Connection & { roles?: RoleName[]; pii?: boolean; sensitivity?: string; authMethod?: string; objects?: string[]; detail?: Record<string, string> }

const NOW = Date.parse('2026-10-21T08:30:00Z')
const SCHEDULES = ['Every 15 min', 'Every 30 min', 'Every hour', 'Every 6 hours', 'Daily 02:00', 'Weekly (Mon 03:00)', 'Manual only']
const KINDS = ['Database', 'Warehouse', 'File', 'API', 'SaaS'] as const
const AUTHS = [
  { id: 'password', label: 'Username and password' },
  { id: 'apikey', label: 'API key / token' },
  { id: 'service', label: 'Service account key' },
  { id: 'oauth', label: 'OAuth 2.0 (simulated consent)' },
  { id: 'none', label: 'No authentication (public / local file)' },
]
const connectorOf = (id: string) => CONNECTORS.find((c) => c.id === id)

function objectsFor(c: Connector): string[] {
  switch (c.kind) {
    case 'Database': case 'Warehouse': return ['public.accounts', 'public.orders', 'public.order_items', 'public.invoices', 'public.payments', 'public.products', 'public.customers', 'public.refunds', 'audit.events']
    case 'File': return ['Sheet1', 'Summary', 'Raw_import']
    case 'API': return ['/orders', '/customers', '/tickets', '/events']
    default: return ['Account', 'Opportunity', 'Contact', 'Lead', 'Campaign', 'Case']
  }
}
const freshness = (c: Connection) => {
  const h = (NOW - Date.parse(c.lastSync)) / 3600000
  if (c.status === 'Error') return { label: `Stale (${Math.round(h)}h)`, tone: 'danger' as const }
  if (c.status === 'Paused') return { label: 'Paused', tone: 'warning' as const }
  return h <= 2 ? { label: 'Fresh', tone: 'success' as const } : h <= 8 ? { label: 'Aging', tone: 'warning' as const } : { label: 'Stale', tone: 'danger' as const }
}

// ---- deterministic simulated connection test (no network, never touches the secret value) ----
const TEST_STEPS = ['Resolving host', 'Opening network connection', 'Authenticating', 'Listing objects']
interface TestResult { ok: boolean; failStep: number; title: string; fix: string }
function simulateTest(connector: Connector, values: Record<string, string>, method: string, secretLen: number, authorized: boolean): TestResult {
  const target = Object.entries(values).filter(([k]) => ['host', 'url', 'project', 'path'].includes(k)).map(([, v]) => v.toLowerCase()).join(' ')
  if (/invalid|unreachable|localhost|0\.0\.0\.0|127\.0\.0\.1/.test(target)) return { ok: false, failStep: 0, title: `Host could not be resolved for ${connector.name}`, fix: 'Check the hostname for typos and make sure it is reachable from the Nexus egress IP range. Private hosts need an allow-listed network route.' }
  if (values.port === '1') return { ok: false, failStep: 1, title: 'Connection timed out on the configured port', fix: 'Confirm the port number and that the firewall allows inbound traffic from Nexus.' }
  if (method === 'oauth' && !authorized) return { ok: false, failStep: 2, title: 'OAuth consent was not completed', fix: 'Go back to Authentication and choose Authorize before testing.' }
  if (['password', 'apikey', 'service'].includes(method) && secretLen < 8) return { ok: false, failStep: 2, title: 'Authentication failed: credential rejected', fix: 'Re-enter the credential (at least 8 characters in this demo). Make sure the account has read-only access to the selected schemas.' }
  return { ok: true, failStep: -1, title: 'Connection verified', fix: '' }
}
function useSimTest() {
  const [phase, setPhase] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle')
  const [step, setStep] = useState(0)
  const [res, setRes] = useState<TestResult | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
  const run = (compute: () => TestResult) => {
    if (timer.current) clearInterval(timer.current)
    const r = compute()
    setPhase('running'); setStep(0); setRes(null)
    let i = 0
    timer.current = setInterval(() => {
      i++
      const stop = !r.ok && i > r.failStep
      if (stop || i >= TEST_STEPS.length) {
        if (timer.current) clearInterval(timer.current)
        setStep(stop ? r.failStep : TEST_STEPS.length); setRes(r); setPhase(r.ok ? 'ok' : 'fail')
      } else setStep(i)
    }, 550)
  }
  const reset = () => { if (timer.current) clearInterval(timer.current); setPhase('idle'); setStep(0); setRes(null) }
  return { phase, step, res, run, reset }
}
function TestPanel({ phase, step, res, onRetry }: { phase: string; step: number; res: TestResult | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[13px] font-semibold text-ink">Connection test</p><DemoBadge>Simulation</DemoBadge></div>
      <ol className="space-y-2" aria-live="polite">
        {TEST_STEPS.map((s, i) => {
          const failed = phase === 'fail' && i === step
          const done = phase === 'ok' || i < step
          const active = phase === 'running' && i === step
          return (
            <li key={s} className="flex items-center gap-2 text-[13px]">
              {failed ? <XCircle className="size-4 text-danger" aria-hidden /> : done ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : active ? <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden /> : <span className="size-4 rounded-full border border-line-strong" aria-hidden />}
              <span className={cx(failed ? 'font-medium text-danger' : done || active ? 'text-ink' : 'text-muted')}>{s}</span>
              <span className="sr-only">{failed ? 'failed' : done ? 'passed' : active ? 'in progress' : 'pending'}</span>
            </li>
          )
        })}
      </ol>
      {phase === 'ok' && <div className="mt-3"><Banner tone="success" title="Connection successful">All checks passed. No data has been read or stored (simulated test).</Banner></div>}
      {phase === 'fail' && res && (
        <div className="mt-3"><Banner tone="danger" title={res.title} action={<Button size="sm" onClick={onRetry}>Retry test</Button>}>{res.fix}</Banner></div>
      )}
    </div>
  )
}

// ---------------- Wizard ----------------
const WSTEPS = ['Connector', 'Configure', 'Authentication', 'Test', 'Objects', 'Schedule', 'Access', 'Review', 'Done']
function Wizard({ onClose }: { onClose: () => void }) {
  const { connections, setConnections, userName, toast, log, confirm } = useStore()
  const [step, setStep] = useState(0)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('All')
  const [cid, setCid] = useState('')
  const [name, setName] = useState('')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [method, setMethod] = useState('password')
  const [user, setUser] = useState('')
  const [secret, setSecret] = useState('') // held only in memory for the simulated test; never persisted, logged or displayed
  const [authorized, setAuthorized] = useState(false)
  const [objs, setObjs] = useState<string[]>([])
  const [schedule, setSchedule] = useState('Every hour')
  const [roles, setRoles] = useState<RoleName[]>(['Data Engineer', 'Administrator'])
  const [pii, setPii] = useState(false)
  const [sens, setSens] = useState('Internal')
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<string | null>(null)
  const t = useSimTest()
  const conn = connectorOf(cid)
  const dirty = created === null && (cid !== '' || name !== '')
  useDirty(dirty)

  const list = CONNECTORS.filter((c) => (kind === 'All' || c.kind === kind) && (c.name + c.desc).toLowerCase().includes(q.toLowerCase()))
  const needSecret = ['password', 'apikey', 'service'].includes(method)

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (step === 0 && !cid) e.cid = 'Choose a connector to continue.'
    if (step === 1 && conn) {
      if (!name.trim()) e.name = 'Enter a connection name.'
      else if (connections.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) e.name = 'A connection with this name already exists.'
      conn.fields.forEach((f) => {
        const v = (vals[f.key] ?? '').trim()
        if (f.required && !v) e[f.key] = `${f.label} is required.`
        else if (v && f.type === 'number' && !(/^\d+$/.test(v) && +v >= 1 && +v <= 65535)) e[f.key] = 'Enter a port between 1 and 65535.'
        else if (v && f.type === 'url' && !/^https?:\/\/\S+\.\S+/.test(v)) e[f.key] = 'Enter a valid URL starting with http:// or https://.'
      })
    }
    if (step === 2) {
      if (needSecret && !user.trim() && method === 'password') e.user = 'Enter a username.'
      if (needSecret && !secret) e.secret = 'Enter a credential. It is masked and never saved.'
      if (method === 'oauth' && !authorized) e.oauth = 'Authorize access to continue.'
    }
    if (step === 3 && t.phase !== 'ok') e.test = 'The connection test must pass before you continue.'
    if (step === 4 && objs.length === 0) e.objs = 'Select at least one table or object.'
    if (step === 6 && roles.length === 0) e.roles = 'Grant access to at least one role.'
    setErrs(e)
    return Object.keys(e).length === 0
  }
  const next = () => { if (validate()) setStep((s) => s + 1) }
  const back = () => { setErrs({}); setStep((s) => Math.max(0, s - 1)) }
  const runTest = () => { if (conn) t.run(() => simulateTest(conn, vals, method, secret.length, authorized)) }
  useEffect(() => { if (step === 3 && t.phase === 'idle') runTest() }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Cancel this connection?', body: 'The details you entered will be discarded. Nothing has been saved.', confirmLabel: 'Discard', danger: true }))) return
    setSecret(''); onClose()
  }
  const create = () => {
    if (!conn) return
    const id = uid('c')
    const detail: Record<string, string> = {}
    conn.fields.forEach((f) => { detail[f.key] = vals[f.key] ?? '' })
    const c: Conn = { id, connectorId: conn.id, name: name.trim(), status: 'Connected', lastSync: '2026-10-21T08:30:00Z', tables: objs.length, schedule, owner: userName, roles, pii, sensitivity: sens, authMethod: method, objects: objs, detail }
    setConnections((cs) => [c, ...cs])
    log('source.create', c.name)
    toast(`Connection "${c.name}" created (demo).`)
    setSecret(''); setUser(''); setCreated(id); setStep(8)
  }

  const err = (k: string) => errs[k]
  return (
    <Modal open onClose={cancel} width="max-w-3xl" title="Add data connection" description="All tests in this wizard are simulated. No external system is contacted."
      footer={step === 8 ? <><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => { onClose(); go('/pipelines?new=1') }}>Create a pipeline from it</Button></> : (
        <>
          <Button variant="ghost" onClick={cancel}>Cancel</Button>
          <Button onClick={back} disabled={step === 0}>Back</Button>
          {step < 7 ? <Button variant="primary" onClick={next} disabled={step === 3 && t.phase === 'running'}>Next</Button> : <Button variant="primary" onClick={create}>Create connection</Button>}
        </>
      )}>
      <div className="mb-4"><Stepper steps={WSTEPS} current={step} /></div>
      {step === 0 && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search connectors" className="w-60" label="Search connectors" />
            <Select aria-label="Category" value={kind} onChange={(e) => setKind(e.target.value)} className="w-40"><option value="All">All categories</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Connector">
            {list.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={cid === c.id} onClick={() => { setCid(c.id); setVals({}); setErrs({}); t.reset(); if (!name) setName('') }}
                className={cx('flex items-start gap-3 rounded-xl border p-3 text-left hover:bg-sunken', cid === c.id ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-line')}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2"><Database className="size-4" aria-hidden /></span>
                <span><span className="flex items-center gap-2 text-[13px] font-semibold text-ink">{c.name}<Badge>{c.kind}</Badge></span><span className="text-xs text-muted">{c.desc}</span></span>
              </button>
            ))}
          </div>
          {!list.length && <EmptyState title="No connectors match" body="Try a different search or category." />}
          {err('cid') && <p role="alert" className="mt-2 text-xs text-danger">{err('cid')}</p>}
        </div>
      )}
      {step === 1 && conn && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Connection name" required error={err('name')} htmlFor="w-name"><Input id="w-name" value={name} invalid={!!err('name')} onChange={(e) => setName(e.target.value)} placeholder={`${conn.name} – Production`} /></Field></div>
          {conn.fields.map((f) => (
            <Field key={f.key} label={f.label} required={f.required} error={err(f.key)} htmlFor={`w-${f.key}`} hint={f.key === 'host' ? 'Try a host containing "invalid" to see the failure path.' : undefined}>
              <Input id={`w-${f.key}`} value={vals[f.key] ?? ''} invalid={!!err(f.key)} placeholder={f.placeholder} inputMode={f.type === 'number' ? 'numeric' : undefined} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
            </Field>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Authentication method" htmlFor="w-auth"><Select id="w-auth" value={method} onChange={(e) => { setMethod(e.target.value); setErrs({}); t.reset() }}>{AUTHS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field></div>
          {method === 'password' && <Field label="Username" required error={err('user')} htmlFor="w-user"><Input id="w-user" autoComplete="off" value={user} invalid={!!err('user')} onChange={(e) => setUser(e.target.value)} /></Field>}
          {needSecret && (
            <Field label={method === 'password' ? 'Password' : method === 'apikey' ? 'API key' : 'Service account key'} required error={err('secret')} htmlFor="w-secret" hint="Masked. Used only for the simulated test, never saved, logged or shown again.">
              <Input id="w-secret" type="password" autoComplete="new-password" value={secret} invalid={!!err('secret')} onChange={(e) => { setSecret(e.target.value); t.reset() }} />
            </Field>
          )}
          {method === 'oauth' && (
            <div className="sm:col-span-2">
              <Button icon={<KeyRound className="size-4" />} onClick={() => { setAuthorized(true); setErrs({}) }}>{authorized ? 'Authorized (simulated)' : 'Authorize access'}</Button>
              {err('oauth') && <p role="alert" className="mt-1.5 text-xs text-danger">{err('oauth')}</p>}
            </div>
          )}
          {method === 'none' && <div className="sm:col-span-2"><Banner tone="info">No credentials will be requested. Only use this for public endpoints or uploaded files.</Banner></div>}
          <div className="sm:col-span-2"><Banner tone="info" title="Credentials are handled safely">Secrets are held in memory for this wizard only. Saved connections show "Stored in vault (not displayed)".</Banner></div>
        </div>
      )}
      {step === 3 && (
        <div>
          <TestPanel phase={t.phase} step={t.step} res={t.res} onRetry={runTest} />
          {err('test') && t.phase !== 'running' && <p role="alert" className="mt-2 text-xs text-danger">{err('test')}</p>}
          {t.phase === 'fail' && <p className="mt-2 text-xs text-muted">Use Back to fix the host or credential, then retest.</p>}
        </div>
      )}
      {step === 4 && conn && (
        <div>
          <div className="mb-2 flex items-center justify-between"><Checkbox label={`Select all (${objectsFor(conn).length})`} checked={objs.length === objectsFor(conn).length} onChange={(v) => setObjs(v ? objectsFor(conn) : [])} /><span className="text-xs text-muted">{objs.length} selected</span></div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {objectsFor(conn).map((o) => <li key={o} className="px-3 py-2"><Checkbox label={o} checked={objs.includes(o)} onChange={(v) => setObjs((x) => (v ? [...x, o] : x.filter((y) => y !== o)))} /></li>)}
          </ul>
          {err('objs') && <p role="alert" className="mt-2 text-xs text-danger">{err('objs')}</p>}
        </div>
      )}
      {step === 5 && (
        <div className="max-w-sm"><Field label="Sync schedule" htmlFor="w-sched" hint="Syncs are simulated in this demo."><Select id="w-sched" value={schedule} onChange={(e) => setSchedule(e.target.value)}>{SCHEDULES.map((s) => <option key={s}>{s}</option>)}</Select></Field></div>
      )}
      {step === 6 && (
        <div className="space-y-4">
          <fieldset><legend className="mb-1.5 text-xs font-medium text-ink">Roles that can query this connection</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">{ROLES.map((r) => <Checkbox key={r} label={r} checked={roles.includes(r)} onChange={(v) => setRoles((x) => (v ? [...x, r] : x.filter((y) => y !== r)))} />)}</div>
            {err('roles') && <p role="alert" className="mt-1.5 text-xs text-danger">{err('roles')}</p>}
          </fieldset>
          <div className="flex items-center gap-3"><Switch label="Contains personally identifiable information" checked={pii} onChange={(v) => { setPii(v); if (v && sens === 'Internal') setSens('Confidential') }} /><span className="text-[13px] text-ink">Contains PII</span></div>
          <div className="max-w-xs"><Field label="Sensitivity" htmlFor="w-sens"><Select id="w-sens" value={sens} onChange={(e) => setSens(e.target.value)}>{['Public', 'Internal', 'Confidential', 'Restricted'].map((s) => <option key={s}>{s}</option>)}</Select></Field></div>
        </div>
      )}
      {step === 7 && conn && (
        <dl className="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
          {[['Connector', conn.name], ['Name', name], ...conn.fields.map((f) => [f.label, vals[f.key] || '—']), ['Authentication', AUTHS.find((a) => a.id === method)?.label ?? ''], ['Credential', needSecret ? '•••••••• (stored in vault, not displayed)' : method === 'oauth' ? 'Token (stored in vault, not displayed)' : 'None'], ['Objects', `${objs.length} selected`], ['Schedule', schedule], ['Roles', roles.join(', ')], ['PII', pii ? 'Yes' : 'No'], ['Sensitivity', sens], ['Test', 'Passed (simulated)']].map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="break-words text-ink">{v}</dd></div>)}
        </dl>
      )}
      {step === 8 && (
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-6" aria-hidden /></div>
          <h3 className="text-base font-semibold text-ink">Connection created</h3>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-2">"{name}" is connected (demo). Data will sync {schedule.toLowerCase()}. Next, build a pipeline or review the connection.</p>
          <div className="mt-4 flex justify-center gap-4 text-[13px]"><Link to="/pipelines?new=1" onClick={onClose} className="font-medium text-primary-ink underline">Create a pipeline</Link><Link to="/quality" onClick={onClose} className="font-medium text-primary-ink underline">Set quality rules</Link></div>
        </div>
      )}
    </Modal>
  )
}

// ---------------- Reauthorize ----------------
function Reauth({ c, onClose }: { c: Conn; onClose: () => void }) {
  const { setConnections, toast, log } = useStore()
  const [secret, setSecret] = useState('')
  const [user, setUser] = useState('')
  const [err, setErr] = useState('')
  const t = useSimTest()
  const conn = connectorOf(c.connectorId)
  const submit = () => {
    if (!secret) { setErr('Enter the new credential. It is masked and never saved.'); return }
    setErr('')
    const len = secret.length
    t.run(() => (len >= 8 ? { ok: true, failStep: -1, title: 'ok', fix: '' } : { ok: false, failStep: 2, title: 'Authentication failed: credential rejected', fix: 'The credential was rejected (minimum 8 characters in this demo). Check the rotated password and try again.' }))
  }
  useEffect(() => {
    if (t.phase === 'ok') {
      setSecret(''); setUser('')
      setConnections((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: 'Connected', error: undefined, lastSync: '2026-10-21T08:30:00Z' } : x)))
      log('source.reauthorize', c.name); toast(`"${c.name}" reauthorized (simulated). Retry the pipeline to refresh data.`)
      const id = setTimeout(onClose, 900)
      return () => clearTimeout(id)
    }
  }, [t.phase]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open onClose={onClose} title="Reauthorize connection" description={`${c.name} · ${conn?.name ?? ''}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={t.phase === 'running'} onClick={submit} disabled={t.phase === 'ok'}>Test and save</Button></>}>
      <div className="space-y-3">
        <Banner tone="info" title="Simulation">No external system is contacted. The credential is checked locally for length only, then discarded.</Banner>
        <Field label="Username" htmlFor="ra-user"><Input id="ra-user" autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} placeholder="svc_nexus" /></Field>
        <Field label="New password or key" required error={err} htmlFor="ra-secret" hint="Masked. Never stored, logged or displayed."><Input id="ra-secret" type="password" autoComplete="new-password" value={secret} invalid={!!err} onChange={(e) => { setSecret(e.target.value); if (t.phase !== 'running') t.reset() }} /></Field>
        {t.phase !== 'idle' && <TestPanel phase={t.phase} step={t.step} res={t.res} onRetry={submit} />}
      </div>
    </Modal>
  )
}

// ---------------- Page ----------------
export default function Sources() {
  const { level, connections, setConnections, toast, log, confirm } = useStore()
  const route = useRoute()
  const lvl = level('sources')
  const canEdit = lvl === 'edit'
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [type, setType] = useState('All')
  const [status, setStatus] = useState('All')
  const [sel, setSel] = useState<string | null>(null)
  const [wizard, setWizard] = useState(false)
  const [edit, setEdit] = useState<Conn | null>(null)
  const [editName, setEditName] = useState('')
  const [editSched, setEditSched] = useState('')
  const [reauth, setReauth] = useState<Conn | null>(null)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])
  const wantsNew = route.query.get('new') === '1'
  useEffect(() => { if (wantsNew && canEdit) setWizard(true) }, [wantsNew, canEdit])

  const rows = useMemo(() => (connections as Conn[]).filter((c) => {
    const cn = connectorOf(c.connectorId)
    return (type === 'All' || cn?.kind === type) && (status === 'All' || c.status === status) && (c.name + ' ' + c.owner + ' ' + (cn?.name ?? '')).toLowerCase().includes(q.toLowerCase())
  }), [connections, q, type, status])
  const current = (connections as Conn[]).find((c) => c.id === sel) ?? null

  if (lvl === 'none') return <NoAccess page="Data Sources" />

  const patch = (id: string, p: Partial<Conn>) => setConnections((cs) => cs.map((c) => (c.id === id ? ({ ...c, ...p } as Connection) : c)))
  const closeWizard = () => { setWizard(false); if (wantsNew) window.location.hash = '#/sources' }
  const toggle = (c: Conn) => {
    const pausing = c.status !== 'Paused'
    patch(c.id, { status: pausing ? 'Paused' : c.error ? 'Error' : 'Connected' })
    log(pausing ? 'source.pause' : 'source.resume', c.name); toast(`${c.name} ${pausing ? 'paused' : 'resumed'}.`)
  }
  const remove = async (c: Conn) => {
    if (!(await confirm({ title: `Delete "${c.name}"?`, body: 'Pipelines that read from this connection will stop working. This cannot be undone.', confirmLabel: 'Delete connection', danger: true }))) return
    setConnections((cs) => cs.filter((x) => x.id !== c.id)); setSel(null); log('source.delete', c.name); toast(`Deleted ${c.name}.`)
  }
  const saveEdit = () => {
    if (!edit) return
    const n = editName.trim()
    if (!n) return
    patch(edit.id, { name: n, schedule: editSched }); log('source.update', n); toast('Connection updated.'); setEdit(null)
  }
  const syncNow = (c: Conn) => {
    if (c.status === 'Error' || c.status === 'Paused') { toast(c.status === 'Error' ? 'Reauthorize before syncing.' : 'Resume the connection before syncing.', 'warning'); return }
    patch(c.id, { lastSync: '2026-10-21T08:30:00Z' }); log('source.sync', c.name); toast(`Sync of ${c.name} completed (simulated).`)
  }

  if (loading) return <div aria-busy="true" aria-label="Loading data sources"><Skeleton className="mb-2 h-7 w-56" /><Skeleton className="mb-6 h-4 w-96" /><Skeleton className="h-96 rounded-xl" /></div>

  const errCount = connections.filter((c) => c.status === 'Error').length
  const nameErr = edit && !editName.trim()
  return (
    <div>
      <PageHeader title="Data Sources" description="Connect, monitor and govern the systems that feed Nexus Analytics." badge={<DemoBadge>Simulated connections</DemoBadge>}
        actions={canEdit && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setWizard(true)}>Add connection</Button>} />
      {!canEdit && <ReadOnlyNote page="data sources" />}
      {errCount > 0 && (
        <div className="mb-4"><Banner tone="danger" title={`${errCount} connection${errCount > 1 ? 's need' : ' needs'} attention`}>
          NetSuite ERP export cannot authenticate, so finance data is stale. <Link to="/quality" className="font-medium text-primary-ink underline">See DQ-114</Link>. {canEdit ? 'Open the connection and choose Reauthorize.' : 'A Data Engineer or Administrator can reauthorize it.'}
        </Banner></div>
      )}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search by name, owner or connector" className="w-72" label="Search connections" />
          <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="w-40"><option value="All">All types</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="All">All statuses</option>{['Connected', 'Syncing', 'Error', 'Paused'].map((k) => <option key={k}>{k}</option>)}</Select>
          {(q || type !== 'All' || status !== 'All') && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setType('All'); setStatus('All') }}>Clear</Button>}
          <span className="ml-auto text-xs text-muted">{rows.length} of {connections.length} connections</span>
        </div>
        <Table caption="Data connections" rows={rows} rowKey={(r) => r.id} pageSize={10} onRowClick={(r) => setSel(r.id)} selectedKey={sel ?? undefined} initialSort={{ key: 'status', dir: 'asc' }}
          empty={<EmptyState icon={<Plug className="size-5" />} title={connections.length ? 'No connections match' : 'No connections yet'} body={connections.length ? 'Try adjusting your search or filters.' : 'Add your first connection to start syncing data.'} action={canEdit && !connections.length ? <Button variant="primary" onClick={() => setWizard(true)}>Add connection</Button> : undefined} />}
          cols={[
            { key: 'name', header: 'Connection', sort: (r) => r.name, render: (r) => <span><span className="font-medium text-ink">{r.name}</span><span className="block text-xs text-muted">{connectorOf(r.connectorId)?.name} · {connectorOf(r.connectorId)?.kind}</span></span> },
            { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
            { key: 'last', header: 'Last sync', sort: (r) => r.lastSync, render: (r) => <span title={fmtDate(r.lastSync, true)}>{ago(r.lastSync)}</span> },
            { key: 'fresh', header: 'Freshness', sort: (r) => freshness(r).label, render: (r) => { const f = freshness(r); return <Badge tone={f.tone}>{f.label}</Badge> } },
            { key: 'tables', header: 'Objects', align: 'right', sort: (r) => r.tables },
            { key: 'schedule', header: 'Schedule', sort: (r) => r.schedule },
            { key: 'owner', header: 'Owner', sort: (r) => r.owner },
          ]} />
      </Card>

      {wizard && canEdit && <Wizard onClose={closeWizard} />}
      {reauth && <Reauth c={reauth} onClose={() => setReauth(null)} />}

      <Drawer open={!!current} onClose={() => setSel(null)} title={current?.name ?? ''} description={current ? `${connectorOf(current.connectorId)?.name} · ${connectorOf(current.connectorId)?.kind}` : ''}>
        {current && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={current.status} /><Badge tone={freshness(current).tone}>{freshness(current).label}</Badge><DemoBadge>Simulated</DemoBadge></div>
            {current.status === 'Error' && (
              <Banner tone="danger" title="Authentication failed" action={canEdit ? <Button size="sm" variant="primary" icon={<KeyRound className="size-3.5" />} onClick={() => setReauth(current)}>Reauthorize</Button> : undefined}>
                {current.error} Finance datasets depend on this connection. <Link to="/pipelines" className="font-medium text-primary-ink underline">View Revenue daily load</Link>
              </Banner>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              {[['Owner', current.owner], ['Last sync', fmtDate(current.lastSync, true)], ['Schedule', current.schedule], ['Objects synced', String(current.tables)], ['Sensitivity', current.sensitivity ?? 'Internal'], ['Contains PII', current.pii ? 'Yes' : 'No'], ['Authentication', AUTHS.find((a) => a.id === current.authMethod)?.label ?? 'Managed credential'], ['Credential', 'Stored in vault (not displayed)']].map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}
            </dl>
            {current.detail && Object.keys(current.detail).length > 0 && (
              <div><p className="mb-1 text-xs font-medium text-muted">Configuration</p><dl className="grid grid-cols-2 gap-2 rounded-lg bg-sunken p-3 text-[13px]">{Object.entries(current.detail).map(([k, v]) => <div key={k}><dt className="text-xs capitalize text-muted">{k}</dt><dd className="break-words text-ink">{v || '—'}</dd></div>)}</dl></div>
            )}
            {current.roles && <div><p className="mb-1 text-xs font-medium text-muted">Roles with access</p><div className="flex flex-wrap gap-1.5">{current.roles.map((r) => <Badge key={r}>{r}</Badge>)}</div></div>}
            {current.objects && <div><p className="mb-1 text-xs font-medium text-muted">Selected objects</p><div className="flex flex-wrap gap-1.5">{current.objects.map((o) => <Badge key={o}>{o}</Badge>)}</div></div>}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button icon={<RefreshCw className="size-4" />} onClick={() => syncNow(current)} disabled={!canEdit}>Sync now</Button>
              <Button icon={current.status === 'Paused' ? <Play className="size-4" /> : <Pause className="size-4" />} onClick={() => toggle(current)} disabled={!canEdit}>{current.status === 'Paused' ? 'Resume' : 'Pause'}</Button>
              <Button icon={<Pencil className="size-4" />} onClick={() => { setEdit(current); setEditName(current.name); setEditSched(current.schedule) }} disabled={!canEdit}>Edit</Button>
              <Button icon={<KeyRound className="size-4" />} onClick={() => setReauth(current)} disabled={!canEdit}>Reauthorize</Button>
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => remove(current)} disabled={!canEdit}>Delete</Button>
            </div>
            {!canEdit && <p className="flex items-center gap-1.5 text-xs text-muted"><AlertTriangle className="size-3.5" aria-hidden />Actions are disabled for view-only roles.</p>}
          </div>
        )}
      </Drawer>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit connection" footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={saveEdit} disabled={!!nameErr}>Save changes</Button></>}>
        <div className="space-y-3">
          <Field label="Connection name" required error={nameErr ? 'Name is required.' : undefined} htmlFor="e-name"><Input id="e-name" value={editName} invalid={!!nameErr} onChange={(e) => setEditName(e.target.value)} /></Field>
          <Field label="Sync schedule" htmlFor="e-sched"><Select id="e-sched" value={editSched} onChange={(e) => setEditSched(e.target.value)}>{[...new Set([editSched, ...SCHEDULES])].map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <p className="text-xs text-muted">Credentials: stored in vault (not displayed). Use Reauthorize to replace them.</p>
        </div>
      </Modal>
    </div>
  )
}
