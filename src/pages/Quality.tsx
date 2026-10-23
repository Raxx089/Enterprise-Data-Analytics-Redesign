import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, FlaskConical, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { DATASETS, FRESHNESS, METRICS, rng, type Dataset, type QIssue, type QRule, type Sensitivity, type Severity } from '../lib/data'
import { ago, fmtDate } from '../lib/analytics'
import { Badge, Banner, Button, Card, DemoBadge, Drawer, EmptyState, Field, Input, Modal, NoAccess, PageHeader, ProgressBar, ReadOnlyNote, SearchInput, Select, Skeleton, StatusBadge, Switch, Table, Tabs, Textarea, cx } from '../components/ui'
import { LineChart, Legend, Sparkline } from '../components/charts'
import { Link, useDirty } from '../lib/router'

const CHECKS: QRule['check'][] = ['Completeness', 'Uniqueness', 'Freshness', 'Validity', 'Schema', 'Accuracy']
const SEVS: Severity[] = ['Critical', 'High', 'Medium', 'Low']
const SENS: Sensitivity[] = ['Public', 'Internal', 'Confidential', 'Restricted']
const RETENTION = [{ v: '90', l: '90 days' }, { v: '365', l: '1 year' }, { v: '730', l: '2 years' }, { v: '1825', l: '5 years' }, { v: '2555', l: '7 years' }, { v: '0', l: 'Indefinite' }]
const NOW_ISO = '2026-10-21T08:30:00Z'
const WEEKS = Array.from({ length: 12 }, (_, i) => `W${i + 1}`)

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const pct = (v: number) => `${v.toFixed(1)}%`
const scoreTone = (v: number) => (v >= 98 ? 'text-success' : v >= 95 ? 'text-ink' : v >= 90 ? 'text-warning' : 'text-danger')
const barTone = (v: number) => (v >= 95 ? 'success' as const : v >= 90 ? 'warning' as const : 'danger' as const)

interface Scores { id: string; name: string; completeness: number; validity: number; freshness: number; uniqueness: number; overall: number; trend: number[] }
function datasetScores(d: Dataset, rules: QRule[]): Scores {
  const rp = (c: QRule['check']) => { const r = rules.filter((x) => x.dataset === d.id && x.check === c && x.enabled); return r.length ? mean(r.map((x) => x.passRate)) : null }
  const fr = FRESHNESS.find((f) => f.dataset === d.name)
  const ratio = fr ? fr.ageH / fr.expectedH : 0
  const fresh = ratio <= 1 ? 100 - ratio * 4 : Math.max(50, 96 - (ratio - 1) * 27)
  const completeness = rp('Completeness') ?? Math.min(100, d.quality + 1.1)
  const validity = rp('Validity') ?? Math.min(100, d.quality + 0.7)
  const uniqueness = rp('Uniqueness') ?? Math.min(100, d.quality + 1.4)
  const overall = mean([completeness, validity, fresh, uniqueness])
  const r = rng(d.id.length * 97 + d.id.charCodeAt(1))
  const trend = Array.from({ length: 12 }, (_, i) => {
    if (i === 11) return overall
    if (d.id === 'finance') return i <= 9 ? 98.4 + (r() - 0.5) * 0.6 : 98.4 - (i - 9) * 4
    return Math.min(100, overall + (r() - 0.5) * 0.8 + (11 - i) * 0.06)
  })
  return { id: d.id, name: d.name, completeness, validity, freshness: fresh, uniqueness, overall, trend }
}

function useClassification() {
  const key = 'nexus:v1:classification'
  const [v, setV] = useState<Record<string, { sens: Sensitivity; ret: string }>>(() => { try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) } catch { /* ignore */ } return {} })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ } }, [v])
  return [v, setV] as const
}

function linkFor(name: string): { to: string; kind: string } {
  if (METRICS.some((m) => m.name === name)) return { to: '/metrics', kind: 'Metric' }
  if (/model/i.test(name)) return { to: '/forecasting', kind: 'Model' }
  if (/report/i.test(name) || /Insights|Financial Overview/.test(name)) return { to: '/reports', kind: 'Report' }
  if (/Executive Overview/.test(name)) return { to: '/overview', kind: 'Dashboard' }
  if (DATASETS.some((d) => d.name === name)) return { to: `/explore/${DATASETS.find((d) => d.name === name)!.id}`, kind: 'Dataset' }
  return { to: '/analytics', kind: 'Chart' }
}
function impactOf(dsId: string) {
  const d = DATASETS.find((x) => x.id === dsId)
  if (!d) return { up: [] as string[], down: [] as { name: string; to: string; kind: string }[] }
  const names = [...new Set([...d.downstream, ...METRICS.filter((m) => m.dataset === d.id).map((m) => m.name), ...METRICS.filter((m) => m.dataset === d.id).flatMap((m) => m.dashboards)])]
  return { up: d.upstream, down: names.map((n) => ({ name: n, ...linkFor(n) })) }
}

interface RuleForm { id?: string; name: string; dataset: string; column: string; check: QRule['check']; threshold: string; severity: Severity; enabled: boolean }
const EMPTY_RULE: RuleForm = { name: '', dataset: 'sales', column: '', check: 'Completeness', threshold: '99', severity: 'Medium', enabled: true }

export default function Quality() {
  const { level, rules, setRules, issues, setIssues, pipelines, users, userName, toast, log, confirm } = useStore()
  const lvl = level('quality')
  const canEdit = lvl === 'edit'
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'rules' | 'issues' | 'governance'>('overview')
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  // rules state
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null)
  const [ruleErr, setRuleErr] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testRes, setTestRes] = useState<{ id: string; ok: boolean; text: string } | null>(null)
  const [rq, setRq] = useState('')
  const [rds, setRds] = useState('All')
  // issues state
  const [iq, setIq] = useState('')
  const [ist, setIst] = useState('All')
  const [isev, setIsev] = useState('All')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [newIssue, setNewIssue] = useState<{ title: string; dataset: string; rule: string; severity: Severity; owner: string } | null>(null)
  const [newErr, setNewErr] = useState('')
  // governance
  const [cls, setCls] = useClassification()
  const [draft, setDraft] = useState<Record<string, { sens: Sensitivity; ret: string }>>({})
  const dirtyGov = Object.keys(draft).length > 0
  useDirty(dirtyGov)

  const scores = useMemo(() => DATASETS.map((d) => datasetScores(d, rules)), [rules])
  const overall = mean(scores.map((s) => s.overall))
  const overallTrend = WEEKS.map((_, i) => mean(scores.map((s) => s.trend[i])))
  const fin = scores.find((s) => s.id === 'finance')!
  const dq114 = issues.find((i) => i.id === 'DQ-114')
  const finStale = !!dq114 && dq114.status !== 'Resolved'
  const revPipe = pipelines.find((p) => p.id === 'pl_revenue_daily')
  const financeFresh = revPipe?.status === 'Success'
  const open = issues.filter((i) => i.status !== 'Resolved')
  const issueRows = useMemo(() => issues.filter((i) => (ist === 'All' || i.status === ist) && (isev === 'All' || i.severity === isev) && (i.id + i.title + i.dataset + i.owner).toLowerCase().includes(iq.toLowerCase())), [issues, ist, isev, iq])
  const ruleRows = useMemo(() => rules.filter((r) => (rds === 'All' || r.dataset === rds) && (r.name + r.column + r.check).toLowerCase().includes(rq.toLowerCase())), [rules, rds, rq])
  const current = issues.find((i) => i.id === openId) ?? null

  if (lvl === 'none') return <NoAccess page="Data Quality" />
  if (loading) return <div aria-busy="true" aria-label="Loading data quality"><Skeleton className="mb-2 h-7 w-56" /><Skeleton className="mb-6 h-4 w-96" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl lg:col-span-2" /></div></div>

  const dsName = (id: string) => DATASETS.find((d) => d.id === id)?.name ?? id
  const patchIssue = (id: string, p: Partial<QIssue>) => setIssues((is) => is.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const addNote = (i: QIssue, text: string, by = userName) => ({ notes: [...i.notes, { at: NOW_ISO, by, text }] })

  // ---- rules ----
  const saveRule = () => {
    if (!ruleForm) return
    const e: Record<string, string> = {}
    const th = Number(ruleForm.threshold)
    if (!ruleForm.name.trim()) e.name = 'Enter a rule name.'
    if (!ruleForm.column.trim()) e.column = 'Enter a column (use * for the whole table).'
    if (ruleForm.threshold === '' || Number.isNaN(th) || th < 0 || th > 100) e.threshold = 'Threshold must be a percentage from 0 to 100.'
    setRuleErr(e)
    if (Object.keys(e).length) return
    if (ruleForm.id) {
      setRules((rs) => rs.map((r) => (r.id === ruleForm.id ? { ...r, name: ruleForm.name.trim(), dataset: ruleForm.dataset, column: ruleForm.column.trim(), check: ruleForm.check, threshold: th, severity: ruleForm.severity, enabled: ruleForm.enabled } : r)))
      log('quality.rule.update', ruleForm.name); toast('Rule updated.')
    } else {
      const r: QRule = { id: `qr${Date.now().toString(36)}`, name: ruleForm.name.trim(), dataset: ruleForm.dataset, column: ruleForm.column.trim(), check: ruleForm.check, threshold: th, severity: ruleForm.severity, enabled: ruleForm.enabled, passRate: 100 }
      setRules((rs) => [r, ...rs]); log('quality.rule.create', r.name); toast('Rule created. Run a test to evaluate it.')
    }
    setRuleForm(null)
  }
  const delRule = async (r: QRule) => {
    if (!(await confirm({ title: `Delete rule "${r.name}"?`, body: 'The rule will stop being evaluated. Linked issues are kept.', confirmLabel: 'Delete rule', danger: true }))) return
    setRules((rs) => rs.filter((x) => x.id !== r.id)); log('quality.rule.delete', r.name); toast('Rule deleted.')
  }
  const testRule = (r: QRule) => {
    setTesting(r.id); setTestRes(null)
    setTimeout(() => {
      let rate = r.passRate
      if (r.id === 'qr3' && financeFresh) rate = 100
      const ok = rate >= r.threshold
      setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, passRate: rate } : x)))
      setTestRes({ id: r.id, ok, text: `${r.name}: pass rate ${pct(rate)} vs threshold ${pct(r.threshold)}. ${ok ? 'Rule passed.' : r.id === 'qr3' ? 'Finance data is stale because the Revenue daily load pipeline failed.' : 'Rule failed. Review the affected records.'}` })
      setTesting(null); log('quality.rule.test', r.name, ok ? 'Success' : 'Failed')
    }, 900)
  }
  const raiseIssue = (r: QRule) => {
    const existing = issues.find((i) => i.rule === r.id && i.status !== 'Resolved')
    if (existing) { setOpenId(existing.id); setTab('issues'); return }
    const n = Math.max(...issues.map((i) => +i.id.replace('DQ-', '')), 100) + 1
    const i: QIssue = { id: `DQ-${n}`, title: `Rule failed: ${r.name}`, dataset: r.dataset, rule: r.id, severity: r.severity, status: 'Open', owner: userName, opened: '2026-10-21', affected: 0, notes: [{ at: NOW_ISO, by: 'System', text: `Test run pass rate ${pct(r.passRate)} is below threshold ${pct(r.threshold)}.` }], records: [] }
    setIssues((is) => [i, ...is]); log('quality.issue.create', i.id); toast(`Issue ${i.id} opened.`); setOpenId(i.id); setTab('issues')
  }

  // ---- issues ----
  const advance = async (i: QIssue, to: QIssue['status']) => {
    if (to === 'Resolved' && i.id === 'DQ-114' && !financeFresh && !(await confirm({ title: 'Resolve DQ-114 anyway?', body: 'The Revenue daily load pipeline is still failing, so finance data is still stale. Resolve only if the issue is tracked elsewhere.', confirmLabel: 'Resolve anyway', danger: true }))) return
    patchIssue(i.id, { status: to, ...addNote(i, `Status changed from ${i.status} to ${to}.`) })
    log('quality.issue.status', `${i.id} → ${to}`); toast(`${i.id} marked ${to}.`)
  }
  const bulkResolve = async () => {
    const ids = [...sel].filter((id) => issues.find((i) => i.id === id)?.status !== 'Resolved')
    if (!ids.length) { toast('Selected issues are already resolved.', 'info'); return }
    if (!(await confirm({ title: `Resolve ${ids.length} issue${ids.length > 1 ? 's' : ''}?`, body: `${ids.join(', ')} will be marked Resolved.`, confirmLabel: 'Resolve issues', danger: true }))) return
    setIssues((is) => is.map((i) => (ids.includes(i.id) ? { ...i, status: 'Resolved', ...addNote(i, 'Bulk resolved.') } : i)))
    ids.forEach((id) => log('quality.issue.status', `${id} → Resolved`)); toast(`${ids.length} issue${ids.length > 1 ? 's' : ''} resolved.`); setSel(new Set())
  }
  const submitComment = () => { if (!current || !comment.trim()) return; patchIssue(current.id, addNote(current, comment.trim())); log('quality.issue.comment', current.id); setComment(''); toast('Comment added.') }
  const createIssue = () => {
    if (!newIssue) return
    if (!newIssue.title.trim()) { setNewErr('Enter a title.'); return }
    const n = Math.max(...issues.map((i) => +i.id.replace('DQ-', '')), 100) + 1
    const i: QIssue = { id: `DQ-${n}`, title: newIssue.title.trim(), dataset: newIssue.dataset, rule: newIssue.rule, severity: newIssue.severity, status: 'Open', owner: newIssue.owner, opened: '2026-10-21', affected: 0, notes: [], records: [] }
    setIssues((is) => [i, ...is]); log('quality.issue.create', i.id); toast(`Issue ${i.id} created.`); setNewIssue(null); setNewErr('')
  }
  const toggleSel = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const allSel = issueRows.length > 0 && issueRows.every((i) => sel.has(i.id))

  // ---- governance ----
  const getCls = (d: Dataset) => draft[d.id] ?? cls[d.id] ?? { sens: d.sensitivity, ret: '730' }
  const setD = (d: Dataset, p: Partial<{ sens: Sensitivity; ret: string }>) => setDraft((x) => ({ ...x, [d.id]: { ...getCls(d), ...p } }))
  const saveGov = () => { setCls((c) => ({ ...c, ...draft })); log('quality.classification.update', `${Object.keys(draft).length} dataset(s)`); toast('Classification and retention saved.'); setDraft({}) }

  const impact = current ? impactOf(current.dataset) : null
  const pipeHint = current?.dataset === 'finance'
  return (
    <div>
      <PageHeader title="Data Quality" description="Scores, freshness, rules and issues across every certified dataset." badge={<DemoBadge>Demo data</DemoBadge>}
        actions={canEdit && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setTab('issues'); setNewIssue({ title: '', dataset: 'sales', rule: rules[0]?.id ?? '', severity: 'Medium', owner: userName }) }}>New issue</Button>} />
      {!canEdit && <ReadOnlyNote page="data quality" />}

      {dq114 && (
        <div className="mb-4">
          <Banner tone={finStale ? 'danger' : 'success'} title={finStale ? `${dq114.id} · ${dq114.title}` : `${dq114.id} resolved`}
            action={<Button size="sm" onClick={() => { setTab('issues'); setOpenId(dq114.id) }}>View issue</Button>}>
            {finStale
              ? <>Finance data is {FRESHNESS.find((f) => f.dataset === 'Finance')?.ageH}h old against a 6h SLA. Cause: the NetSuite credentials were rotated, so <Link to="/pipelines/pl_revenue_daily" className="font-medium text-primary-ink underline">Revenue daily load</Link> cannot authenticate. <Link to="/sources" className="font-medium text-primary-ink underline">Reauthorize in Data Sources</Link>, then retry the pipeline. Profit and margin figures may lag. {financeFresh && 'The pipeline has since succeeded; resolve this issue to confirm.'}</>
              : 'Finance data has been confirmed fresh.'}
          </Banner>
        </div>
      )}

      <Tabs label="Quality sections" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'rules', label: 'Rules', count: rules.length }, { value: 'issues', label: 'Issues', count: open.length }, { value: 'governance', label: 'Retention & sensitivity' }]} />
      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-4" title="Overall quality score" subtitle="Mean of completeness, validity, freshness and uniqueness">
              <p className={cx('tnum text-[40px] font-semibold leading-none', scoreTone(overall))}>{overall.toFixed(1)}<span className="text-lg text-muted">/100</span></p>
              <p className="mt-1 text-xs text-muted">{overallTrend[11] >= overallTrend[10] ? 'Up' : 'Down'} {Math.abs(overallTrend[11] - overallTrend[10]).toFixed(1)} pts vs last week · {open.length} open issue{open.length === 1 ? '' : 's'}</p>
              <div className="mt-4"><LineChart ariaLabel="Overall quality score over the last 12 weeks, all datasets compared with Finance" labels={WEEKS} height={170} format={(v) => v.toFixed(0)}
                series={[{ name: 'All datasets', color: 'var(--c1)', values: overallTrend, area: true }, { name: 'Finance', color: 'var(--c3)', values: fin.trend, dashed: true }]} /></div>
              <div className="mt-2"><Legend items={[{ label: 'All datasets', color: 'var(--c1)' }, { label: 'Finance', color: 'var(--c3)', dashed: true }]} /></div>
            </Card>
            <Card className="xl:col-span-8" title="Scores by dataset" subtitle="Dimension scores recalculate from enabled rules" pad={false}>
              <Table caption="Quality score by dataset and dimension" rows={scores} rowKey={(r) => r.id} pageSize={10} dense initialSort={{ key: 'overall', dir: 'asc' }}
                cols={[
                  { key: 'name', header: 'Dataset', sort: (r) => r.name, render: (r) => <Link to={`/explore/${r.id}`} className="font-medium text-ink hover:underline">{r.name}</Link> },
                  { key: 'overall', header: 'Overall', sort: (r) => r.overall, render: (r) => <span className="flex items-center gap-2"><span className={cx('tnum w-12 font-semibold', scoreTone(r.overall))}>{r.overall.toFixed(1)}</span><span className="w-16"><ProgressBar value={r.overall} tone={barTone(r.overall)} label={`${r.name} overall`} /></span></span> },
                  ...(['completeness', 'validity', 'freshness', 'uniqueness'] as const).map((k) => ({ key: k, header: k[0].toUpperCase() + k.slice(1), align: 'right' as const, sort: (r: Scores) => r[k], render: (r: Scores) => <span className={cx('tnum', scoreTone(r[k]))}>{pct(r[k])}</span> })),
                  { key: 'trend', header: '12-wk trend', render: (r) => <Sparkline data={r.trend} good={r.trend[11] >= r.trend[0] - 1} /> },
                ]} />
            </Card>
            <Card className="xl:col-span-12" title="Freshness" subtitle="Hours since last successful refresh against each dataset's SLA" pad={false}
              actions={<Link to="/pipelines" className="text-xs font-medium text-primary-ink underline">Open pipelines</Link>}>
              <Table caption="Dataset freshness against SLA" rows={FRESHNESS} rowKey={(r) => r.dataset} pageSize={10} dense initialSort={{ key: 'ratio', dir: 'desc' }}
                cols={[
                  { key: 'dataset', header: 'Dataset', sort: (r) => r.dataset, render: (r) => <span className="font-medium">{r.dataset}{r.dataset === 'Finance' && finStale && <Link to="/quality" onClick={(e) => { e.preventDefault(); setTab('issues'); setOpenId('DQ-114') }} className="ml-2 text-xs text-danger underline">DQ-114</Link>}</span> },
                  { key: 'age', header: 'Age', align: 'right', sort: (r) => r.ageH, render: (r) => `${r.ageH}h` },
                  { key: 'exp', header: 'SLA', align: 'right', sort: (r) => r.expectedH, render: (r) => `${r.expectedH}h` },
                  { key: 'ratio', header: 'SLA used', sort: (r) => r.ageH / r.expectedH, render: (r) => <span className="flex items-center gap-2"><span className="tnum w-10 text-xs text-ink-2">{Math.round((r.ageH / r.expectedH) * 100)}%</span><span className="w-28"><ProgressBar value={(r.ageH / r.expectedH) * 100} tone={r.ageH > r.expectedH ? 'danger' : r.ageH / r.expectedH > 0.8 ? 'warning' : 'success'} label={`${r.dataset} SLA used`} /></span></span> },
                  { key: 'status', header: 'Status', sort: (r) => (r.ageH > r.expectedH ? 1 : 0), render: (r) => (r.ageH > r.expectedH ? <Badge tone="danger" dot>Stale</Badge> : <Badge tone="success" dot>Fresh</Badge>) },
                ]} />
            </Card>
          </div>
        )}

        {tab === 'rules' && (
          <Card pad={false}>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <SearchInput value={rq} onChange={setRq} placeholder="Search rules" className="w-60" label="Search rules" />
              <Select aria-label="Filter by dataset" value={rds} onChange={(e) => setRds(e.target.value)} className="w-44"><option value="All">All datasets</option>{DATASETS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              <DemoBadge>Test runs are simulated</DemoBadge>
              {canEdit && <Button variant="primary" className="ml-auto" icon={<Plus className="size-4" />} onClick={() => { setRuleErr({}); setRuleForm({ ...EMPTY_RULE }) }}>New rule</Button>}
            </div>
            {testRes && <div className="px-3 pb-3"><Banner tone={testRes.ok ? 'success' : 'danger'} title={testRes.ok ? 'Test passed' : 'Test failed'} action={!testRes.ok && canEdit ? <Button size="sm" onClick={() => raiseIssue(rules.find((r) => r.id === testRes.id)!)}>{issues.some((i) => i.rule === testRes.id && i.status !== 'Resolved') ? 'View issue' : 'Open issue'}</Button> : undefined}>{testRes.text}</Banner></div>}
            <Table caption="Quality rules" rows={ruleRows} rowKey={(r) => r.id} pageSize={8}
              empty={<EmptyState icon={<ShieldCheck className="size-5" />} title={rules.length ? 'No rules match' : 'No rules yet'} body={rules.length ? 'Try adjusting your search or filters.' : 'Create a rule to start monitoring a dataset.'} action={canEdit && !rules.length ? <Button variant="primary" onClick={() => setRuleForm({ ...EMPTY_RULE })}>New rule</Button> : undefined} />}
              cols={[
                { key: 'name', header: 'Rule', sort: (r) => r.name, render: (r) => <span><span className="font-medium text-ink">{r.name}</span><span className="block text-xs text-muted">{dsName(r.dataset)} · {r.column}</span></span> },
                { key: 'check', header: 'Check', sort: (r) => r.check },
                { key: 'sev', header: 'Severity', sort: (r) => SEVS.indexOf(r.severity), render: (r) => <StatusBadge status={r.severity} /> },
                { key: 'thr', header: 'Threshold', align: 'right', sort: (r) => r.threshold, render: (r) => pct(r.threshold) },
                { key: 'pass', header: 'Pass rate', align: 'right', sort: (r) => r.passRate, render: (r) => <span className={cx('font-medium', r.passRate >= r.threshold ? 'text-success' : 'text-danger')}>{pct(r.passRate)}<span className="sr-only">{r.passRate >= r.threshold ? ' passing' : ' failing'}</span></span> },
                { key: 'en', header: 'Enabled', render: (r) => <Switch label={`${r.name} enabled`} checked={r.enabled} disabled={!canEdit} onChange={(v) => { setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: v } : x))); log(v ? 'quality.rule.enable' : 'quality.rule.disable', r.name); toast(`Rule ${v ? 'enabled' : 'disabled'}.`) }} /> },
                { key: 'act', header: 'Actions', render: (r) => (
                  <span className="flex gap-1">
                    <Button size="sm" icon={<FlaskConical className="size-3.5" />} loading={testing === r.id} onClick={() => testRule(r)} disabled={!r.enabled}>Test</Button>
                    {canEdit && <><Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} icon={<Pencil className="size-3.5" />} onClick={() => { setRuleErr({}); setRuleForm({ id: r.id, name: r.name, dataset: r.dataset, column: r.column, check: r.check, threshold: String(r.threshold), severity: r.severity, enabled: r.enabled }) }} />
                      <Button size="sm" variant="ghost" aria-label={`Delete ${r.name}`} icon={<Trash2 className="size-3.5" />} onClick={() => delRule(r)} /></>}
                  </span>
                ) },
              ]} />
          </Card>
        )}

        {tab === 'issues' && (
          <Card pad={false}>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <SearchInput value={iq} onChange={setIq} placeholder="Search issues" className="w-60" label="Search issues" />
              <Select aria-label="Filter by status" value={ist} onChange={(e) => setIst(e.target.value)} className="w-40"><option value="All">All statuses</option>{['Open', 'Investigating', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</Select>
              <Select aria-label="Filter by severity" value={isev} onChange={(e) => setIsev(e.target.value)} className="w-40"><option value="All">All severities</option>{SEVS.map((s) => <option key={s}>{s}</option>)}</Select>
              <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={allSel} disabled={!canEdit} onChange={(e) => setSel(e.target.checked ? new Set(issueRows.map((i) => i.id)) : new Set())} />Select all {issueRows.length}</label>
              {canEdit && <Button variant="danger" disabled={!sel.size} onClick={bulkResolve} icon={<CheckCircle2 className="size-4" />}>Resolve selected ({sel.size})</Button>}
            </div>
            <Table caption="Data quality issues" rows={issueRows} rowKey={(r) => r.id} pageSize={8} onRowClick={(r) => setOpenId(r.id)} initialSort={{ key: 'sev', dir: 'asc' }}
              empty={<EmptyState icon={<CheckCircle2 className="size-5" />} title={issues.length ? 'No issues match' : 'No issues'} body={issues.length ? 'Try adjusting your search or filters.' : 'All datasets are healthy.'} />}
              cols={[
                { key: 'sel', header: 'Select', render: (r) => <span onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.id}`} className="size-4 accent-[var(--primary)]" disabled={!canEdit} checked={sel.has(r.id)} onChange={(e) => toggleSel(r.id, e.target.checked)} /></span> },
                { key: 'id', header: 'ID', sort: (r) => r.id, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
                { key: 'title', header: 'Issue', sort: (r) => r.title, render: (r) => <span><span className="font-medium text-ink">{r.title}</span><span className="block text-xs text-muted">{dsName(r.dataset)} · {r.affected.toLocaleString()} rows affected</span></span> },
                { key: 'sev', header: 'Severity', sort: (r) => SEVS.indexOf(r.severity), render: (r) => <StatusBadge status={r.severity} /> },
                { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
                { key: 'owner', header: 'Owner', sort: (r) => r.owner },
                { key: 'opened', header: 'Opened', sort: (r) => r.opened, render: (r) => fmtDate(r.opened) },
              ]} />
          </Card>
        )}

        {tab === 'governance' && (
          <Card title="Retention and sensitivity classification" subtitle="Controls who can see each dataset and how long records are kept" pad={false}
            actions={dirtyGov ? <><Badge tone="warning">Unsaved changes</Badge><Button size="sm" onClick={() => setDraft({})}>Discard</Button><Button size="sm" variant="primary" onClick={saveGov}>Save changes</Button></> : undefined}>
            <Table caption="Retention and sensitivity by dataset" rows={DATASETS} rowKey={(r) => r.id} pageSize={10}
              cols={[
                { key: 'name', header: 'Dataset', sort: (r) => r.name, render: (r) => <span><span className="font-medium text-ink">{r.name}</span><span className="block text-xs text-muted">Owner {r.owner}</span></span> },
                { key: 'pii', header: 'PII fields', sort: (r) => r.fields.filter((f) => f.pii).length, render: (r) => { const p = r.fields.filter((f) => f.pii); return p.length ? <Badge tone="warning">{p.map((f) => f.name).join(', ')}</Badge> : <span className="text-muted">None</span> } },
                { key: 'sens', header: 'Sensitivity', sort: (r) => getCls(r).sens, render: (r) => canEdit ? <Select aria-label={`Sensitivity for ${r.name}`} value={getCls(r).sens} onChange={(e) => setD(r, { sens: e.target.value as Sensitivity })} className="w-40">{SENS.map((s) => <option key={s}>{s}</option>)}</Select> : <Badge>{getCls(r).sens}</Badge> },
                { key: 'ret', header: 'Retention', sort: (r) => Number(getCls(r).ret), render: (r) => canEdit ? <Select aria-label={`Retention for ${r.name}`} value={getCls(r).ret} onChange={(e) => setD(r, { ret: e.target.value })} className="w-36">{RETENTION.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</Select> : <span>{RETENTION.find((o) => o.v === getCls(r).ret)?.l ?? `${getCls(r).ret} days`}</span> },
              ]} />
            <p className="border-t border-line px-4 py-3 text-xs text-muted">Classification changes are recorded in the audit log. Restricted datasets are hidden from roles without explicit access.</p>
          </Card>
        )}
      </div>

      {/* rule modal */}
      <Modal open={!!ruleForm} onClose={() => setRuleForm(null)} title={ruleForm?.id ? 'Edit rule' : 'New rule'} footer={<><Button onClick={() => setRuleForm(null)}>Cancel</Button><Button variant="primary" onClick={saveRule}>{ruleForm?.id ? 'Save changes' : 'Create rule'}</Button></>}>
        {ruleForm && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Rule name" required error={ruleErr.name} htmlFor="r-name"><Input id="r-name" value={ruleForm.name} invalid={!!ruleErr.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="e.g. email is not null" /></Field></div>
            <Field label="Dataset" htmlFor="r-ds"><Select id="r-ds" value={ruleForm.dataset} onChange={(e) => setRuleForm({ ...ruleForm, dataset: e.target.value })}>{DATASETS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Column" required error={ruleErr.column} htmlFor="r-col"><Input id="r-col" value={ruleForm.column} invalid={!!ruleErr.column} onChange={(e) => setRuleForm({ ...ruleForm, column: e.target.value })} /></Field>
            <Field label="Check type" htmlFor="r-chk"><Select id="r-chk" value={ruleForm.check} onChange={(e) => setRuleForm({ ...ruleForm, check: e.target.value as QRule['check'] })}>{CHECKS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Threshold (%)" required error={ruleErr.threshold} htmlFor="r-th"><Input id="r-th" inputMode="decimal" value={ruleForm.threshold} invalid={!!ruleErr.threshold} onChange={(e) => setRuleForm({ ...ruleForm, threshold: e.target.value })} /></Field>
            <Field label="Severity" htmlFor="r-sev"><Select id="r-sev" value={ruleForm.severity} onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value as Severity })}>{SEVS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <div className="flex items-end gap-2 pb-2"><Switch label="Enabled" checked={ruleForm.enabled} onChange={(v) => setRuleForm({ ...ruleForm, enabled: v })} /><span className="text-[13px] text-ink">Enabled</span></div>
          </div>
        )}
      </Modal>

      {/* new issue modal */}
      <Modal open={!!newIssue} onClose={() => { setNewIssue(null); setNewErr('') }} title="New issue" footer={<><Button onClick={() => { setNewIssue(null); setNewErr('') }}>Cancel</Button><Button variant="primary" onClick={createIssue}>Create issue</Button></>}>
        {newIssue && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Title" required error={newErr} htmlFor="n-t"><Input id="n-t" value={newIssue.title} invalid={!!newErr} onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })} /></Field></div>
            <Field label="Dataset" htmlFor="n-d"><Select id="n-d" value={newIssue.dataset} onChange={(e) => setNewIssue({ ...newIssue, dataset: e.target.value })}>{DATASETS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Related rule" htmlFor="n-r"><Select id="n-r" value={newIssue.rule} onChange={(e) => setNewIssue({ ...newIssue, rule: e.target.value })}>{rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            <Field label="Severity" htmlFor="n-s"><Select id="n-s" value={newIssue.severity} onChange={(e) => setNewIssue({ ...newIssue, severity: e.target.value as Severity })}>{SEVS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Owner" htmlFor="n-o"><Select id="n-o" value={newIssue.owner} onChange={(e) => setNewIssue({ ...newIssue, owner: e.target.value })}>{users.filter((u) => u.status === 'Active').map((u) => <option key={u.id}>{u.name}</option>)}</Select></Field>
          </div>
        )}
      </Modal>

      {/* issue drawer */}
      <Drawer open={!!current} onClose={() => { setOpenId(null); setComment('') }} title={current ? `${current.id} · ${current.title}` : ''} description={current ? `${dsName(current.dataset)} · opened ${fmtDate(current.opened)} · ${current.affected.toLocaleString()} rows affected` : ''} width="max-w-2xl">
        {current && impact && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={current.status} /><StatusBadge status={current.severity} />{rules.find((r) => r.id === current.rule) && <Badge>Rule: {rules.find((r) => r.id === current.rule)!.name}</Badge>}</div>
            {pipeHint && current.status !== 'Resolved' && <Banner tone="warning" title="Likely cause">{financeFresh ? 'Revenue daily load has succeeded. Verify freshness and resolve.' : <>Revenue daily load is failing on NetSuite authentication. <Link to="/pipelines/pl_revenue_daily" className="font-medium text-primary-ink underline">Open pipeline</Link> · <Link to="/sources" className="font-medium text-primary-ink underline">Reauthorize source</Link></>}</Banner>}

            <section aria-label="Workflow">
              <p className="mb-1.5 text-xs font-medium text-muted">Workflow</p>
              <div className="flex flex-wrap items-center gap-2">
                {(['Open', 'Investigating', 'Resolved'] as const).map((s, i) => <span key={s} className="flex items-center gap-2"><Badge tone={current.status === s ? 'primary' : 'neutral'}>{s}</Badge>{i < 2 && <ArrowRight className="size-3.5 text-muted" aria-hidden />}</span>)}
                <span className="ml-auto flex gap-2">
                  {current.status === 'Open' && <Button size="sm" variant="primary" disabled={!canEdit} onClick={() => advance(current, 'Investigating')}>Start investigating</Button>}
                  {current.status === 'Investigating' && <Button size="sm" variant="primary" disabled={!canEdit} onClick={() => advance(current, 'Resolved')}>Mark resolved</Button>}
                  {current.status === 'Resolved' && <Button size="sm" disabled={!canEdit} onClick={() => advance(current, 'Open')}>Reopen</Button>}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Owner" htmlFor="d-own"><Select id="d-own" value={current.owner} disabled={!canEdit} onChange={(e) => { patchIssue(current.id, { owner: e.target.value, ...addNote(current, `Assigned to ${e.target.value}.`) }); log('quality.issue.assign', `${current.id} → ${e.target.value}`); toast(`Assigned to ${e.target.value}.`) }}>{[...new Set([current.owner, ...users.filter((u) => u.status === 'Active').map((u) => u.name)])].map((n) => <option key={n}>{n}</option>)}</Select></Field>
                <Field label="Severity" htmlFor="d-sev"><Select id="d-sev" value={current.severity} disabled={!canEdit} onChange={(e) => { patchIssue(current.id, { severity: e.target.value as Severity }); log('quality.issue.severity', `${current.id} → ${e.target.value}`) }}>{SEVS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
            </section>

            <section aria-label="Lineage impact">
              <p className="mb-1.5 text-xs font-medium text-muted">Lineage impact</p>
              <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1.2fr]">
                <div className="rounded-lg border border-line p-2.5"><p className="mb-1 text-[11px] font-medium uppercase text-muted">Upstream</p><ul className="space-y-1 text-[13px]">{impact.up.map((u) => <li key={u} className={cx(u === 'NetSuite ERP' && finStale && current.dataset === 'finance' && 'font-semibold text-danger')}>{u}</li>)}</ul></div>
                <ArrowRight className="hidden size-4 self-center text-muted sm:block" aria-hidden />
                <div className="rounded-lg border-2 border-danger bg-danger-soft p-2.5"><p className="mb-1 text-[11px] font-medium uppercase text-danger">Affected dataset</p><p className="text-[13px] font-semibold text-ink">{dsName(current.dataset)}</p><p className="text-xs text-ink-2">{current.status === 'Resolved' ? 'Issue resolved' : 'Data may be wrong or stale'}</p></div>
                <ArrowRight className="hidden size-4 self-center text-muted sm:block" aria-hidden />
                <div className="rounded-lg border border-line p-2.5"><p className="mb-1 text-[11px] font-medium uppercase text-muted">Downstream ({impact.down.length})</p>
                  <ul className="space-y-1 text-[13px]">{impact.down.map((d) => <li key={d.name} className="flex items-center justify-between gap-2"><Link to={d.to} className="text-primary-ink underline">{d.name}</Link><Badge>{d.kind}</Badge></li>)}</ul></div>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted"><AlertTriangle className="size-3.5" aria-hidden />{impact.down.length} downstream asset{impact.down.length === 1 ? '' : 's'} read from {dsName(current.dataset)} and may show {current.severity === 'Critical' ? 'stale' : 'incorrect'} values until this is resolved.</p>
            </section>

            {current.records.length > 0 && (
              <section aria-label="Sample records"><p className="mb-1.5 text-xs font-medium text-muted">Sample affected records</p>
                <Table caption="Sample affected records" rows={current.records} rowKey={(r) => r.id + r.field} pageSize={5} dense cols={[{ key: 'id', header: 'Record' }, { key: 'field', header: 'Field' }, { key: 'value', header: 'Value' }, { key: 'problem', header: 'Problem' }]} /></section>
            )}

            <section aria-label="Activity">
              <p className="mb-1.5 text-xs font-medium text-muted">Activity</p>
              {current.notes.length ? <ul className="space-y-2">{current.notes.map((n, i) => <li key={i} className="rounded-lg bg-sunken p-2.5 text-[13px]"><p className="text-xs text-muted"><b className="text-ink">{n.by}</b> · {ago(n.at)}</p><p className="mt-0.5 text-ink">{n.text}</p></li>)}</ul> : <p className="text-[13px] text-muted">No activity yet.</p>}
              <div className="mt-3 flex flex-col gap-2">
                <Textarea aria-label="Add a comment" placeholder="Add a comment" value={comment} disabled={!canEdit} onChange={(e) => setComment(e.target.value)} />
                <div className="flex justify-end"><Button variant="primary" size="sm" disabled={!canEdit || !comment.trim()} onClick={submitComment}>Comment</Button></div>
              </div>
            </section>
          </div>
        )}
      </Drawer>
    </div>
  )
}
