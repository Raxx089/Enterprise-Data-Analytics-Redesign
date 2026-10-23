import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Pause, Play, Plus, RefreshCw, RotateCcw, Trash2, Workflow, X } from 'lucide-react'
import { useStore, uid } from '../lib/store'
import { type PRun, type Pipeline } from '../lib/data'
import { ago, fmtDate, fmtNum } from '../lib/analytics'
import { Badge, Banner, Button, Card, DemoBadge, EmptyState, Field, Input, Menu, Modal, NoAccess, PageHeader, ProgressBar, ReadOnlyNote, SearchInput, Select, Skeleton, Stepper, StatusBadge, Table, Tabs, cx } from '../components/ui'
import { Link, go, useDirty, useRoute } from '../lib/router'

type PL = Pipeline & { paused?: boolean; alerts?: string }

const SCHEDULES = ['Every 15 min', 'Every 30 min', 'Hourly', 'Every 2 hours', 'Every 6 hours', 'Daily 02:00', 'Daily 04:00', 'Daily 05:00', 'Weekly Mon 03:00', 'After upstream']
const TRANSFORMS = ['Extract', 'Filter test accounts', 'Map fields', 'Currency normalise', 'Deduplicate', 'Mask PII', 'Join', 'Aggregate monthly', 'Validate schema', 'Load', 'Publish']
const TARGETS = ['Warehouse · finance.revenue', 'Warehouse · crm.accounts', 'Warehouse · support.tickets', 'Mart · sales', 'Mart · customers', 'Mart · operations', 'Mart · forecast']
const BASE_TIME = Date.parse('2026-10-21T08:30:00Z')

const disp = (p: PL) => (p.paused ? 'Paused' : p.runs.length === 0 ? 'Draft' : p.status)
const mins = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)
const NETSUITE = (p: PL) => p.id === 'pl_revenue_daily' || p.source === 'NetSuite ERP'

// ---------- dependency DAG (SVG) ----------
function failedStep(p: PL): string | null {
  const r = p.runs[0]
  if (!r || r.status !== 'Failed') return null
  const m = r.log.match(/^([A-Za-z ]+?) failed/)
  return m && p.steps.includes(m[1]) ? m[1] : p.steps[0]
}
function Dag({ p, all }: { p: PL; all: PL[] }) {
  const W = 168, H = 38, GX = 36, GY = 14
  const ups: { label: string; kind: string; bad: boolean; id?: string }[] = p.source.split(' + ').map((s) => ({ label: s, kind: 'Source', bad: p.status === 'Failed' && s === 'NetSuite ERP' }))
  p.dependsOn.forEach((d) => { const u = all.find((x) => x.id === d); ups.push({ label: u?.name ?? d, kind: 'Pipeline', bad: u?.status === 'Failed', id: d }) })
  const fs = failedStep(p)
  const steps = p.steps.map((s) => ({ label: s, kind: 'Step', bad: s === fs }))
  const target = [{ label: p.destination, kind: 'Target', bad: false }]
  const down = all.filter((x) => x.dependsOn.includes(p.id)).map((x) => ({ label: x.name, kind: 'Downstream', bad: p.status === 'Failed', id: x.id }))
  const cols = [ups, ...steps.map((s) => [s]), target, ...(down.length ? [down] : [])]
  const maxRows = Math.max(...cols.map((c) => c.length))
  const height = maxRows * (H + GY) + GY
  const width = cols.length * (W + GX) - GX + 20
  const pos = cols.map((c, ci) => c.map((n, ri) => ({ ...n, x: 10 + ci * (W + GX), y: (height - c.length * (H + GY) + GY) / 2 + ri * (H + GY) })))
  const edges: { x1: number; y1: number; x2: number; y2: number; bad: boolean }[] = []
  for (let ci = 0; ci < pos.length - 1; ci++) for (const a of pos[ci]) for (const b of pos[ci + 1]) {
    const isSteps = ci >= 1 && ci <= steps.length
    if (!isSteps && ci === 0 && b.kind !== 'Step') continue
    if (b.kind === 'Downstream' && a.kind !== 'Target') continue
    edges.push({ x1: a.x + W, y1: a.y + H / 2, x2: b.x, y2: b.y + H / 2, bad: a.bad || b.bad })
  }
  const col = (k: string, bad: boolean) => (bad ? { stroke: 'var(--danger)', fill: 'var(--danger-soft)' } : k === 'Step' ? { stroke: 'var(--c1)', fill: 'var(--primary-soft)' } : { stroke: 'var(--line-strong)', fill: 'var(--sunken)' })
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface p-2">
        <svg width={width} height={height} role="img" aria-label={`Dependency graph for ${p.name}: ${ups.map((u) => u.label).join(', ')} flow through ${p.steps.join(', ')} into ${p.destination}${fs ? `. Failed at ${fs}` : ''}`}>
          <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--muted)" /></marker><marker id="arr-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--danger)" /></marker></defs>
          {edges.map((e, i) => <path key={i} d={`M${e.x1},${e.y1} C${e.x1 + GX / 2},${e.y1} ${e.x2 - GX / 2},${e.y2} ${e.x2},${e.y2}`} fill="none" stroke={e.bad ? 'var(--danger)' : 'var(--muted)'} strokeWidth="1.5" markerEnd={`url(#${e.bad ? 'arr-bad' : 'arr'})`} />)}
          {pos.flat().map((n, i) => {
            const c = col(n.kind, n.bad)
            return (
              <g key={i}>
                <rect x={n.x} y={n.y} width={W} height={H} rx="8" fill={c.fill} stroke={c.stroke} strokeWidth={n.bad ? 2 : 1} />
                <text x={n.x + 10} y={n.y + 15} fontSize="10" fill="var(--muted)">{n.kind}{n.bad ? ' · failed' : ''}</text>
                <text x={n.x + 10} y={n.y + 29} fontSize="12" fontWeight="600" fill={n.bad ? 'var(--danger)' : 'var(--ink)'}>{n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-2 text-xs text-muted">Upstream sources and pipelines on the left, processing steps in the middle, target dataset on the right{down.length ? ', then downstream pipelines' : ''}. Failed nodes are outlined in red.</p>
    </div>
  )
}

// ---------- builder ----------
const BSTEPS = ['Basics', 'Source', 'Steps', 'Target', 'Schedule & alerts', 'Review']
function Builder({ onClose, sources, existing, onCreate }: { onClose: () => void; sources: string[]; existing: string[]; onCreate: (p: PL) => void }) {
  const { userName, confirm } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [steps, setSteps] = useState<string[]>(['Extract', 'Load'])
  const [pick, setPick] = useState(TRANSFORMS[1])
  const [target, setTarget] = useState(TARGETS[0])
  const [schedule, setSchedule] = useState('Daily 02:00')
  const [alerts, setAlerts] = useState('')
  const [errs, setErrs] = useState<Record<string, string>>({})
  const dirty = name !== '' || source !== '' || steps.length !== 2
  useDirty(dirty)
  const validate = () => {
    const e: Record<string, string> = {}
    if (step === 0) { if (!name.trim()) e.name = 'Enter a pipeline name.'; else if (existing.some((n) => n.toLowerCase() === name.trim().toLowerCase())) e.name = 'A pipeline with this name already exists.' }
    if (step === 1 && !source) e.source = 'Choose a source.'
    if (step === 2) { if (steps.length < 2) e.steps = 'Add at least two steps.'; else if (steps[0] !== 'Extract') e.steps = 'The first step must be Extract.'; else if (!['Load', 'Publish'].includes(steps[steps.length - 1])) e.steps = 'The last step must be Load or Publish.' }
    if (step === 4 && alerts.trim() && !alerts.split(',').every((a) => /^\S+@\S+\.\S+$/.test(a.trim()))) e.alerts = 'Enter valid, comma-separated email addresses.'
    setErrs(e)
    return !Object.keys(e).length
  }
  const move = (i: number, d: number) => setSteps((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n })
  const cancel = async () => { if (dirty && !(await confirm({ title: 'Discard this pipeline?', body: 'Your pipeline configuration has not been saved.', confirmLabel: 'Discard', danger: true }))) return; onClose() }
  const create = () => onCreate({ id: uid('pl'), name: name.trim(), source: source.replace(/ \((failing|paused)\)$/, ''), destination: target, schedule, status: 'Success', owner: userName, steps, dependsOn: [], runs: [], alerts: alerts.trim() })
  return (
    <Modal open onClose={cancel} width="max-w-2xl" title="New pipeline" description="Pipelines run as simulations in this demo."
      footer={<><Button variant="ghost" onClick={cancel}>Cancel</Button><Button onClick={() => { setErrs({}); setStep((s) => s - 1) }} disabled={step === 0}>Back</Button>{step < 5 ? <Button variant="primary" onClick={() => validate() && setStep((s) => s + 1)}>Next</Button> : <Button variant="primary" onClick={create}>Create pipeline</Button>}</>}>
      <div className="mb-4"><Stepper steps={BSTEPS} current={step} /></div>
      {step === 0 && <Field label="Pipeline name" required error={errs.name} htmlFor="b-name"><Input id="b-name" value={name} invalid={!!errs.name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing spend load" /></Field>}
      {step === 1 && <Field label="Source" required error={errs.source} htmlFor="b-src" hint="Connections you can read from. Paused or failing connections are flagged."><Select id="b-src" value={source} invalid={!!errs.source} onChange={(e) => setSource(e.target.value)}><option value="">Select a source…</option>{sources.map((s) => <option key={s}>{s}</option>)}</Select></Field>}
      {step === 2 && (
        <div>
          <div className="mb-3 flex gap-2"><Select aria-label="Transformation" value={pick} onChange={(e) => setPick(e.target.value)} className="w-56">{TRANSFORMS.map((t) => <option key={t}>{t}</option>)}</Select><Button icon={<Plus className="size-4" />} onClick={() => setSteps((s) => [...s.slice(0, s.length), pick])}>Add step</Button></div>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px]">
                <span className="grid size-5 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{i + 1}</span><span className="flex-1 text-ink">{s}</span>
                <button aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-ink-2 hover:bg-sunken disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button aria-label={`Move ${s} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-ink-2 hover:bg-sunken disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button aria-label={`Remove ${s}`} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-danger hover:bg-danger-soft"><X className="size-4" /></button>
              </li>
            ))}
          </ol>
          {errs.steps && <p role="alert" className="mt-2 text-xs text-danger">{errs.steps}</p>}
        </div>
      )}
      {step === 3 && <Field label="Target dataset" htmlFor="b-tgt"><Select id="b-tgt" value={target} onChange={(e) => setTarget(e.target.value)}>{TARGETS.map((t) => <option key={t}>{t}</option>)}</Select></Field>}
      {step === 4 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Schedule" htmlFor="b-sch"><Select id="b-sch" value={schedule} onChange={(e) => setSchedule(e.target.value)}>{SCHEDULES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Alert recipients" error={errs.alerts} htmlFor="b-al" hint="Comma-separated emails notified on failure (optional)."><Input id="b-al" value={alerts} invalid={!!errs.alerts} onChange={(e) => setAlerts(e.target.value)} placeholder="data-team@halcyon.com" /></Field>
        </div>
      )}
      {step === 5 && (
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">{[['Name', name], ['Source', source], ['Steps', steps.join(' → ')], ['Target', target], ['Schedule', schedule], ['Alerts', alerts || 'None']].map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}</dl>
      )}
    </Modal>
  )
}

// ---------- page ----------
interface RunState { pct: number; step: number }
export default function Pipelines() {
  const { level, pipelines, setPipelines, connections, issues, setIssues, userName, toast, log, confirm } = useStore()
  const route = useRoute()
  const lvl = level('pipelines')
  const canEdit = lvl === 'edit'
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [owner, setOwner] = useState('All')
  const [tab, setTab] = useState<'overview' | 'runs' | 'deps' | 'settings'>('overview')
  const [building, setBuilding] = useState(false)
  const [running, setRunning] = useState<Record<string, RunState>>({})
  const [runSel, setRunSel] = useState<string | null>(null)
  const [setName, setSetName] = useState('')
  const [setSched, setSetSched] = useState('')
  const [setAlerts, setSetAlerts] = useState('')
  const timers = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const counter = useRef(0)
  const PL = pipelines as PL[]
  const selId = route.parts[1]
  const sel = PL.find((p) => p.id === selId) ?? null

  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])
  useEffect(() => () => { Object.values(timers.current).forEach(clearInterval) }, [])
  const wantsNew = route.query.get('new') === '1'
  useEffect(() => { if (wantsNew && canEdit) setBuilding(true) }, [wantsNew, canEdit])
  useEffect(() => { if (sel) { setSetName(sel.name); setSetSched(sel.schedule); setSetAlerts(sel.alerts ?? ''); setRunSel(null) } }, [selId]) // eslint-disable-line react-hooks/exhaustive-deps

  const settingsDirty = !!sel && (setName !== sel.name || setSched !== sel.schedule || setAlerts !== (sel.alerts ?? ''))
  useDirty(settingsDirty)

  const rows = useMemo(() => PL.filter((p) => (status === 'All' || disp(p) === status) && (owner === 'All' || p.owner === owner) && (p.name + p.source + p.destination).toLowerCase().includes(q.toLowerCase())), [PL, q, status, owner])
  const owners = [...new Set(PL.map((p) => p.owner))]

  if (lvl === 'none') return <NoAccess page="Data Pipelines" />

  const upd = (id: string, patch: Partial<PL>) => setPipelines((ps) => ps.map((p) => (p.id === id ? ({ ...p, ...patch } as Pipeline) : p)))
  const netsuiteDown = connections.some((c) => /netsuite/i.test(c.name) && c.status === 'Error')

  const startRun = (p: PL, how: 'Run' | 'Retry') => {
    if (running[p.id]) return
    const total = p.steps.length
    const willFail = NETSUITE(p) && netsuiteDown
    const failAt = 0
    let i = 0
    setRunning((r) => ({ ...r, [p.id]: { pct: 4, step: 0 } }))
    log(how === 'Retry' ? 'pipeline.retry' : 'pipeline.run', p.name)
    timers.current[p.id] = setInterval(() => {
      i++
      const done = willFail ? i > failAt + 1 : i >= total
      if (!done) { setRunning((r) => ({ ...r, [p.id]: { pct: Math.round(((i + 0.4) / total) * 100), step: i } })); return }
      clearInterval(timers.current[p.id]); delete timers.current[p.id]
      counter.current++
      const run: PRun = {
        id: uid('pr'), start: new Date(BASE_TIME + counter.current * 60000).toISOString(), durationS: willFail ? 4 : 40 + total * 25, status: willFail ? 'Failed' : 'Success', rows: willFail ? 0 : 120000 + counter.current * 1337,
        log: willFail ? `${p.steps[failAt]} failed: Login failed for user "svc_nexus" (SQL Server error 18456). Retry after the NetSuite ERP export connection is reauthorized in Data Sources. (Simulated)` : 'Completed successfully. (Simulated run)',
      }
      setPipelines((ps) => ps.map((x) => (x.id === p.id ? ({ ...x, status: run.status, runs: [run, ...x.runs].slice(0, 20) } as Pipeline) : x)))
      setRunning((r) => { const n = { ...r }; delete n[p.id]; return n })
      setRunSel(run.id)
      if (willFail) { toast(`${p.name} failed again: NetSuite credentials still invalid.`, 'error'); log('pipeline.run', p.name, 'Failed') } else {
        toast(`${p.name} ${how === 'Retry' ? 'retried' : 'ran'} successfully (simulated).`)
        if (p.id === 'pl_revenue_daily') setIssues((is) => is.map((x) => (x.id === 'DQ-114' ? { ...x, notes: [...x.notes, { at: '2026-10-21T08:30:00Z', by: 'System', text: 'Revenue daily load succeeded after reauthorization. Finance freshness is recovering.' }] } : x)))
      }
    }, 750)
  }
  const toggle = (p: PL) => { upd(p.id, { paused: !p.paused }); log(p.paused ? 'pipeline.resume' : 'pipeline.pause', p.name); toast(`${p.name} ${p.paused ? 'resumed' : 'paused'}.`) }
  const dup = (p: PL) => {
    const c: PL = { ...p, id: uid('pl'), name: `${p.name} (copy)`, runs: [], status: 'Success', owner: userName, paused: true }
    setPipelines((ps) => [c, ...ps]); log('pipeline.duplicate', p.name); toast(`Duplicated as "${c.name}" (paused).`)
  }
  const remove = async (p: PL) => {
    const deps = PL.filter((x) => x.dependsOn.includes(p.id))
    if (!(await confirm({ title: `Delete "${p.name}"?`, body: deps.length ? `${deps.map((d) => d.name).join(', ')} depend on this pipeline and will lose their upstream. This cannot be undone.` : 'Run history will be removed. This cannot be undone.', confirmLabel: 'Delete pipeline', danger: true }))) return
    setPipelines((ps) => ps.filter((x) => x.id !== p.id).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => d !== p.id) })))
    log('pipeline.delete', p.name); toast(`Deleted ${p.name}.`)
    if (sel?.id === p.id) go('/pipelines')
  }
  const saveSettings = () => {
    if (!sel || !setName.trim()) return
    upd(sel.id, { name: setName.trim(), schedule: setSched, alerts: setAlerts.trim() }); log('pipeline.update', setName.trim()); toast('Pipeline settings saved.')
  }
  const closeBuilder = () => { setBuilding(false); if (wantsNew) window.location.hash = '#/pipelines' }
  const create = (p: PL) => { setPipelines((ps) => [p, ...ps]); log('pipeline.create', p.name); toast(`Pipeline "${p.name}" created (demo).`); setBuilding(false); window.location.hash = `#/pipelines/${p.id}` }
  const sources = connections.map((c) => c.name + (c.status === 'Error' ? ' (failing)' : c.status === 'Paused' ? ' (paused)' : ''))
  const dq114 = issues.find((i) => i.id === 'DQ-114')

  if (loading) return <div aria-busy="true" aria-label="Loading pipelines"><Skeleton className="mb-2 h-7 w-56" /><Skeleton className="mb-6 h-4 w-96" /><Skeleton className="h-96 rounded-xl" /></div>

  const RunCell = ({ p }: { p: PL }) => { const r = running[p.id]; return r ? <span className="flex items-center gap-2"><Badge tone="info" dot>Running</Badge><span className="w-16"><ProgressBar value={r.pct} label={`${p.name} progress`} /></span></span> : <StatusBadge status={disp(p)} /> }

  // ---- detail ----
  if (selId) {
    if (!sel) return <EmptyState icon={<Workflow className="size-5" />} title="Pipeline not found" body="It may have been deleted." action={<Button onClick={() => go('/pipelines')}>Back to pipelines</Button>} />
    const rs = running[sel.id]
    const last = sel.runs[0]
    const selRun = sel.runs.find((r) => r.id === runSel) ?? null
    const lastFailed = last?.status === 'Failed'
    const blocked = lastFailed && NETSUITE(sel) && netsuiteDown
    const ok = sel.runs.filter((r) => r.status === 'Success').length
    return (
      <div>
        <PageHeader title={sel.name} badge={<DemoBadge>Simulated runs</DemoBadge>} crumbs={[{ label: 'Pipelines', to: '/pipelines' }, { label: sel.name }]} description={`${sel.source} → ${sel.destination} · ${sel.schedule} · owned by ${sel.owner}`}
          actions={<>
            <RunCell p={sel} />
            <Button variant="primary" icon={<Play className="size-4" />} onClick={() => startRun(sel, 'Run')} disabled={!canEdit || !!rs || !!sel.paused}>Run now</Button>
            <Menu label="More actions" trigger={<span className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-sunken">More</span>}
              items={[{ label: sel.paused ? 'Resume' : 'Pause', icon: sel.paused ? <Play className="size-4" /> : <Pause className="size-4" />, onSelect: () => toggle(sel), disabled: !canEdit }, { label: 'Duplicate', icon: <Copy className="size-4" />, onSelect: () => dup(sel), disabled: !canEdit }, 'sep', { label: 'Delete', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(sel), disabled: !canEdit }]} />
          </>} />
        {!canEdit && <ReadOnlyNote page="pipelines" />}
        {lastFailed && (
          <div className="mb-4"><Banner tone="danger" title="Last run failed" action={canEdit ? <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => startRun(sel, 'Retry')} disabled={!!rs}>Retry</Button> : undefined}>
            {last.log}{' '}{blocked && <>The source connection still has an authentication error. <Link to="/sources" className="font-medium text-primary-ink underline">Reauthorize NetSuite in Data Sources</Link>, then retry.</>}
            {NETSUITE(sel) && dq114 && dq114.status !== 'Resolved' && <> Related issue <Link to="/quality" className="font-medium text-primary-ink underline">DQ-114</Link> (stale finance data).</>}
          </Banner></div>
        )}
        {rs && <div className="mb-4 rounded-xl border border-line bg-surface p-3"><div className="mb-1.5 flex justify-between text-[13px]"><span className="font-medium text-ink">Running: {sel.steps[Math.min(rs.step, sel.steps.length - 1)]}</span><span className="tnum text-muted">{rs.pct}%</span></div><ProgressBar value={rs.pct} label="Run progress" /><p className="mt-1.5 text-xs text-muted">Simulated run. No data is moved.</p></div>}
        <Tabs label="Pipeline sections" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'runs', label: 'Run history', count: sel.runs.length }, { value: 'deps', label: 'Dependencies' }, { value: 'settings', label: 'Settings' }]} />
        <div className="mt-4">
          {tab === 'overview' && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Summary" className="lg:col-span-1">
                <dl className="space-y-2.5 text-[13px]">{[['Status', disp(sel)], ['Schedule', sel.schedule], ['Last run', last ? `${ago(last.start)} (${fmtDate(last.start, true)})` : 'Never'], ['Last duration', last ? mins(last.durationS) : '—'], ['Success rate', sel.runs.length ? `${Math.round((ok / sel.runs.length) * 100)}% of last ${sel.runs.length} runs` : '—'], ['Owner', sel.owner], ['Alerts', sel.alerts || 'None']].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right text-ink">{v}</dd></div>)}</dl>
              </Card>
              <Card title="Steps" className="lg:col-span-1">
                <ol className="space-y-1.5">{sel.steps.map((s, i) => <li key={i} className={cx('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]', s === failedStep(sel) ? 'border-danger bg-danger-soft' : 'border-line')}><span className="grid size-5 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{i + 1}</span>{s}{s === failedStep(sel) && <Badge tone="danger" className="ml-auto">Failed</Badge>}</li>)}</ol>
              </Card>
              <Card title="Recent runs" className="lg:col-span-1">
                {sel.runs.length ? <ul className="space-y-2">{sel.runs.slice(0, 5).map((r) => <li key={r.id} className="flex items-center justify-between text-[13px]"><span className="text-ink-2">{ago(r.start)}</span><StatusBadge status={r.status} /><span className="tnum text-muted">{mins(r.durationS)}</span></li>)}</ul> : <p className="text-[13px] text-muted">This pipeline has not run yet.</p>}
              </Card>
            </div>
          )}
          {tab === 'runs' && (
            <div className="space-y-4">
              <Card pad={false}>
                <Table caption="Run history" rows={sel.runs} rowKey={(r) => r.id} pageSize={8} selectedKey={runSel ?? undefined} onRowClick={(r) => setRunSel(r.id === runSel ? null : r.id)}
                  empty={<EmptyState icon={<Workflow className="size-5" />} title="No runs yet" body="Run the pipeline to see history here." />}
                  cols={[
                    { key: 'start', header: 'Started', sort: (r) => r.start, render: (r) => fmtDate(r.start, true) },
                    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'dur', header: 'Duration', align: 'right', sort: (r) => r.durationS, render: (r) => mins(r.durationS) },
                    { key: 'rows', header: 'Rows', align: 'right', sort: (r) => r.rows, render: (r) => fmtNum(r.rows) },
                    { key: 'log', header: 'Logs', render: (r) => <Button size="sm" variant="ghost" aria-expanded={runSel === r.id}>{runSel === r.id ? 'Hide' : 'View'}</Button> },
                  ]} />
              </Card>
              {selRun && (
                <Card title="Run log" subtitle={`${fmtDate(selRun.start, true)} · ${selRun.status}`} actions={selRun.status === 'Failed' && canEdit ? <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => startRun(sel, 'Retry')} disabled={!!rs}>Retry</Button> : undefined}>
                  <pre className="whitespace-pre-wrap rounded-lg bg-sunken p-3 font-mono text-xs text-ink">{`[${selRun.start}] start ${sel.name}\n${sel.steps.map((s, i) => `[step ${i + 1}/${sel.steps.length}] ${s}${selRun.status === 'Failed' && s === failedStep(sel) ? ' ... FAILED' : selRun.status === 'Failed' && i > sel.steps.indexOf(failedStep(sel) ?? '') ? ' ... skipped' : ' ... ok'}`).join('\n')}\n${selRun.log}`}</pre>
                  {selRun.status === 'Failed' && NETSUITE(sel) && <p className="mt-2 text-[13px] text-ink-2">Fix: <Link to="/sources" className="font-medium text-primary-ink underline">reauthorize the NetSuite ERP export connection</Link>.</p>}
                </Card>
              )}
            </div>
          )}
          {tab === 'deps' && <Card title="Dependencies" subtitle="Upstream sources → steps → target dataset"><Dag p={sel} all={PL} /></Card>}
          {tab === 'settings' && (
            <Card title="Pipeline settings" actions={settingsDirty ? <Badge tone="warning">Unsaved changes</Badge> : undefined}>
              <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Name" required error={!setName.trim() ? 'Name is required.' : undefined} htmlFor="s-name"><Input id="s-name" value={setName} disabled={!canEdit} invalid={!setName.trim()} onChange={(e) => setSetName(e.target.value)} /></Field></div>
                <Field label="Schedule" htmlFor="s-sch"><Select id="s-sch" value={setSched} disabled={!canEdit} onChange={(e) => setSetSched(e.target.value)}>{[...new Set([setSched, ...SCHEDULES])].map((s) => <option key={s}>{s}</option>)}</Select></Field>
                <Field label="Alert recipients" htmlFor="s-al" hint="Comma-separated emails"><Input id="s-al" value={setAlerts} disabled={!canEdit} onChange={(e) => setSetAlerts(e.target.value)} /></Field>
              </div>
              <div className="mt-4 flex gap-2"><Button variant="primary" onClick={saveSettings} disabled={!canEdit || !settingsDirty || !setName.trim()}>Save changes</Button><Button onClick={() => { setSetName(sel.name); setSetSched(sel.schedule); setSetAlerts(sel.alerts ?? '') }} disabled={!settingsDirty}>Reset</Button></div>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ---- list ----
  const failed = PL.filter((p) => p.status === 'Failed' && !p.paused)
  return (
    <div>
      <PageHeader title="Data Pipelines" description="Monitor, run and build the jobs that move data into the warehouse and marts." badge={<DemoBadge>Simulated runs</DemoBadge>}
        actions={canEdit && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setBuilding(true)}>New pipeline</Button>} />
      {!canEdit && <ReadOnlyNote page="pipelines" />}
      {failed.length > 0 && (
        <div className="mb-4"><Banner tone="danger" title={`${failed.length} pipeline${failed.length > 1 ? 's' : ''} failed`}>
          {failed.map((f) => f.name).join(', ')}: the NetSuite connection cannot authenticate, so finance data is stale (<Link to="/quality" className="font-medium text-primary-ink underline">DQ-114</Link>). <Link to="/sources" className="font-medium text-primary-ink underline">Reauthorize in Data Sources</Link>.
        </Banner></div>
      )}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search pipelines" className="w-64" label="Search pipelines" />
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="All">All statuses</option>{['Success', 'Running', 'Warning', 'Failed', 'Paused', 'Draft'].map((s) => <option key={s}>{s}</option>)}</Select>
          <Select aria-label="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44"><option value="All">All owners</option>{owners.map((s) => <option key={s}>{s}</option>)}</Select>
          {(q || status !== 'All' || owner !== 'All') && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setStatus('All'); setOwner('All') }}>Clear</Button>}
          <span className="ml-auto text-xs text-muted">{rows.length} of {PL.length}</span>
        </div>
        <Table caption="Pipelines" rows={rows} rowKey={(r) => r.id} pageSize={8} onRowClick={(r) => go(`/pipelines/${r.id}`)} initialSort={{ key: 'status', dir: 'asc' }}
          empty={<EmptyState icon={<Workflow className="size-5" />} title={PL.length ? 'No pipelines match' : 'No pipelines yet'} body={PL.length ? 'Try adjusting your search or filters.' : 'Create a pipeline to move data on a schedule.'} action={canEdit && !PL.length ? <Button variant="primary" onClick={() => setBuilding(true)}>New pipeline</Button> : undefined} />}
          cols={[
            { key: 'name', header: 'Pipeline', sort: (r) => r.name, render: (r) => <span><span className="font-medium text-ink">{r.name}</span><span className="block text-xs text-muted">{r.source} → {r.destination}</span></span> },
            { key: 'status', header: 'Status', sort: (r) => disp(r), render: (r) => <RunCell p={r} /> },
            { key: 'schedule', header: 'Schedule', sort: (r) => r.schedule },
            { key: 'last', header: 'Last run', sort: (r) => r.runs[0]?.start ?? '', render: (r) => (r.runs[0] ? ago(r.runs[0].start) : 'Never') },
            { key: 'dur', header: 'Duration', align: 'right', sort: (r) => r.runs[0]?.durationS ?? 0, render: (r) => (r.runs[0] ? mins(r.runs[0].durationS) : '—') },
            { key: 'owner', header: 'Owner', sort: (r) => r.owner },
            { key: 'act', header: 'Actions', render: (r) => (
              <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <Menu label={`Actions for ${r.name}`} trigger={<span className="inline-flex h-8 items-center rounded-lg px-2 text-ink-2 hover:bg-sunken">•••</span>}
                  items={[{ label: 'Open', onSelect: () => go(`/pipelines/${r.id}`) }, { label: 'Run now', icon: <Play className="size-4" />, onSelect: () => startRun(r, 'Run'), disabled: !canEdit || !!running[r.id] || !!r.paused }, ...(r.status === 'Failed' ? [{ label: 'Retry failed run', icon: <RefreshCw className="size-4" />, onSelect: () => startRun(r, 'Retry'), disabled: !canEdit || !!running[r.id] }] : []), { label: r.paused ? 'Resume' : 'Pause', icon: <Pause className="size-4" />, onSelect: () => toggle(r), disabled: !canEdit }, { label: 'Duplicate', icon: <Copy className="size-4" />, onSelect: () => dup(r), disabled: !canEdit }, 'sep' as const, { label: 'Delete', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(r), disabled: !canEdit }]} />
              </span>
            ) },
          ]} />
      </Card>
      {building && canEdit && <Builder onClose={closeBuilder} sources={sources} existing={PL.map((p) => p.name)} onCreate={create} />}
    </div>
  )
}
