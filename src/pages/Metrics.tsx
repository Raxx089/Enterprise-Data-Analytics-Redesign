import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, BadgeCheck, BarChart3, Download, ExternalLink, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useStore, uid } from '../lib/store'
import { DATASETS, METRICS, OPS, sampleRows, type Metric } from '../lib/data'
import { fmtDate, fmtNum, fmtPct, kpi, metricValue, monthlySeries, pick, type Filters, type MetricKey } from '../lib/analytics'
import { Badge, Banner, Button, Card, Drawer, EmptyState, Field, Input, Modal, PageHeader, ReadOnlyNote, SearchInput, Select, Skeleton, StatusBadge, Table, Textarea } from '../components/ui'
import { Sparkline } from '../components/charts'
import { Link, go, useDirty, useRoute } from '../lib/router'

type Cert = Metric['certification']
const CERTS: Cert[] = ['Certified', 'In review', 'Draft', 'Deprecated']
interface Ver { version: string; date: string; by: string; note: string }
interface CMetric extends Metric { history: Ver[]; custom?: boolean }

const seedCatalog = (): CMetric[] => METRICS.map((m) => ({
  ...m,
  history: [
    { version: '1.0', date: '2026-03-12', by: m.owner, note: 'Initial definition published.' },
    { version: '1.1', date: m.updated, by: m.owner, note: `Definition reviewed. Status: ${m.certification}.` },
  ].reverse(),
}))

function useCatalog() {
  const KEY = 'nexus:v1:metrics-catalog'
  const [cat, setCat] = useState<CMetric[]>(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as CMetric[] } catch { /* ignore */ }
    return seedCatalog()
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(cat)) } catch { /* ignore */ } }, [cat])
  return [cat, setCat] as const
}

// Maps catalog metrics onto analytics keys so values, reports and analyses line up with the Overview.
const KEYS: Record<string, MetricKey[]> = { revenue: ['revenue'], 'gross-margin': ['margin', 'profit'], conversion: ['conversion', 'won'], churn: ['retention', 'churned'], sla: [], csat: [], aov: [] }
const ANALYTICS_KEY: Record<string, string> = { 'gross-margin': 'margin', churn: 'retention' }

interface Cur { text: string; delta?: string; up?: boolean; good?: boolean; spark?: number[]; note: string }
function currentValue(m: Metric, f: Filters): Cur {
  const seg = `${f.region === 'All' ? 'all regions' : f.region} · ${f.unit === 'All' ? 'all units' : f.unit}`
  if (m.id === 'revenue' || m.id === 'gross-margin' || m.id === 'conversion') {
    const k = kpi(f, KEYS[m.id][0])
    return { text: k.text, delta: k.delta.text, up: k.delta.abs >= 0, good: k.delta.good, spark: k.spark, note: `Selected period vs previous period · ${seg}` }
  }
  if (m.id === 'churn') {
    const cur = 1 - metricValue(pick(f), 'retention')
    const pStart = Math.max(0, f.start - (f.end - f.start + 1)), pEnd = f.start - 1
    const prev = 1 - metricValue(pick(f, pStart, pEnd), 'retention')
    const d = cur - prev
    return { text: fmtPct(cur), delta: `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} pts`, up: d >= 0, good: d <= 0, spark: monthlySeries(f, 'retention').map((x) => 1 - x.value), note: `Churn = 1 − retention, selected period vs previous · ${seg}` }
  }
  if (m.id === 'sla' || m.id === 'csat') {
    const key = m.id === 'sla' ? 'sla' : 'csat'
    const at = (mm: number) => { const r = OPS.filter((o) => o.m === mm); return r.reduce((s, o) => s + o[key], 0) / r.length }
    const cur = at(23), prev = at(22)
    const d = cur - prev
    const dec = m.id === 'sla' ? 1 : 2
    return { text: m.id === 'sla' ? `${cur.toFixed(1)}%` : cur.toFixed(2), delta: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(dec)}${m.id === 'sla' ? ' pts' : ''}`, up: d >= 0, good: d >= 0, spark: Array.from({ length: 12 }, (_, i) => at(12 + i)), note: 'Latest month (Oct 26) vs previous month, average across teams' }
  }
  const ok = sampleRows('orders', 480).filter((r) => r.status !== 'Cancelled')
  const aov = ok.reduce((a, r) => a + (r.amount_usd as number), 0) / (ok.length || 1)
  return { text: `$${fmtNum(aov)}`, note: 'Average of the 480-row orders sample (cancelled excluded). Trend not available.' }
}

function fmtTarget(m: Metric) {
  if (!m.target) return 'No target set'
  if (m.unit === 'usd') return `$${fmtNum(m.target)}`
  if (m.unit === 'pct') return m.target <= 1 ? fmtPct(m.target) : `${m.target}%`
  if (m.unit === 'hrs') return `${m.target} h`
  return String(m.target)
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
interface Form { name: string; definition: string; formula: string; aggregation: string; owner: string; domain: string; dataset: string; frequency: string; unit: Metric['unit']; target: string; higherIsBetter: boolean }
const EMPTY: Form = { name: '', definition: '', formula: '', aggregation: 'Sum', owner: '', domain: 'Finance', dataset: 'sales', frequency: 'Monthly', unit: 'num', target: '', higherIsBetter: true }
const DOMAINS_BASE = ['Finance', 'Sales', 'Customer Success', 'Operations', 'Customer Support', 'Product']

function csvCell(v: string | number) { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export default function Metrics() {
  const { filters, users, reports, analyses, level, userName, log, toast, confirm } = useStore()
  const canEdit = level('metrics') === 'edit'
  const route = useRoute()
  const selectedId = route.query.get('id')
  const [cat, setCat] = useCatalog()
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const [q, setQ] = useState('')
  const [domain, setDomain] = useState('All')
  const [cert, setCert] = useState('All')
  const [owner, setOwner] = useState('All')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [errs, setErrs] = useState<Partial<Record<keyof Form, string>>>({})
  const [formDirty, setFormDirty] = useState(false)
  useDirty(formOpen && formDirty)

  const [certOpen, setCertOpen] = useState(false)
  const [newCert, setNewCert] = useState<Cert>('Certified')
  const [certNote, setCertNote] = useState('')

  const domains = useMemo(() => [...new Set([...DOMAINS_BASE, ...cat.map((m) => m.domain)])].sort(), [cat])
  const owners = useMemo(() => [...new Set(cat.map((m) => m.owner))].sort(), [cat])
  const rows = useMemo(() => cat.filter((m) => (domain === 'All' || m.domain === domain) && (cert === 'All' || m.certification === cert) && (owner === 'All' || m.owner === owner)
    && (!q.trim() || `${m.name} ${m.definition} ${m.formula} ${m.owner} ${m.domain}`.toLowerCase().includes(q.trim().toLowerCase()))), [cat, q, domain, cert, owner])

  const sel = cat.find((m) => m.id === selectedId) ?? null
  const cur = useMemo(() => (sel ? currentValue(sel, filters) : null), [sel, filters])
  const filtersActive = q || domain !== 'All' || cert !== 'All' || owner !== 'All'

  const open = (id: string | null) => go(id ? `/metrics?id=${encodeURIComponent(id)}` : '/metrics')

  const openForm = (m?: CMetric) => {
    setEditing(m?.id ?? null)
    setForm(m ? { name: m.name, definition: m.definition, formula: m.formula, aggregation: m.aggregation, owner: m.owner, domain: m.domain, dataset: m.dataset, frequency: m.frequency, unit: m.unit, target: m.target ? String(m.target) : '', higherIsBetter: m.higherIsBetter } : { ...EMPTY, owner: userName })
    setErrs({}); setFormDirty(false); setFormOpen(true)
  }
  const closeForm = async () => {
    if (formDirty && !(await confirm({ title: 'Discard unsaved changes?', body: 'The metric form has changes that have not been saved.', confirmLabel: 'Discard', danger: true }))) return
    setFormOpen(false); setFormDirty(false)
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setFormDirty(true); setErrs((e) => ({ ...e, [k]: undefined })) }

  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {}
    const n = form.name.trim()
    if (n.length < 3) e.name = 'Enter a name of at least 3 characters.'
    else if (cat.some((m) => m.id !== editing && m.name.toLowerCase() === n.toLowerCase())) e.name = 'A metric with this name already exists.'
    if (form.definition.trim().length < 20) e.definition = 'Describe the metric in at least 20 characters.'
    if (!form.formula.trim()) e.formula = 'Enter the formula or calculation.'
    if (!form.owner) e.owner = 'Choose an owner.'
    if (form.target.trim() && !Number.isFinite(+form.target)) e.target = 'Target must be a number.'
    setErrs(e)
    return !Object.keys(e).length
  }
  const submit = () => {
    if (!validate()) return
    const today = '2026-10-21'
    const base = { name: form.name.trim(), definition: form.definition.trim(), formula: form.formula.trim(), aggregation: form.aggregation, owner: form.owner, domain: form.domain, dataset: form.dataset, frequency: form.frequency, unit: form.unit, target: form.target.trim() ? +form.target : 0, higherIsBetter: form.higherIsBetter }
    if (editing) {
      setCat((c) => c.map((m) => {
        if (m.id !== editing) return m
        const [maj, min] = (m.history[0]?.version ?? '1.0').split('.').map(Number)
        return { ...m, ...base, updated: today, history: [{ version: `${maj}.${(min || 0) + 1}`, date: today, by: userName, note: 'Definition edited.' }, ...m.history] }
      }))
      log('metric.edit', base.name); toast(`Metric "${base.name}" updated.`)
    } else {
      let id = slug(base.name) || uid('metric'); if (cat.some((m) => m.id === id)) id = uid(id)
      const m: CMetric = { id, ...base, certification: 'Draft', updated: today, dashboards: [], custom: true, history: [{ version: '1.0', date: today, by: userName, note: 'Proposed as a new metric (Draft).' }] }
      setCat((c) => [m, ...c])
      log('metric.create', base.name); toast(`Metric "${base.name}" proposed as Draft.`)
      open(id)
    }
    setFormOpen(false); setFormDirty(false)
  }

  const changeCert = async () => {
    if (!sel) return
    if (newCert === sel.certification) { toast('Choose a different status.', 'warning'); return }
    if (!(await confirm({ title: `Change certification to ${newCert}?`, body: `"${sel.name}" is currently ${sel.certification}. ${newCert === 'Certified' ? 'Certified metrics are trusted across reports and dashboards.' : newCert === 'Deprecated' ? 'Deprecated metrics should no longer be used in new work.' : 'This change is recorded in the audit log.'}`, confirmLabel: 'Change status', danger: newCert === 'Deprecated' }))) return
    const today = '2026-10-21'
    setCat((c) => c.map((m) => {
      if (m.id !== sel.id) return m
      const [maj, min] = (m.history[0]?.version ?? '1.0').split('.').map(Number)
      return { ...m, certification: newCert, updated: today, history: [{ version: `${maj}.${(min || 0) + 1}`, date: today, by: userName, note: `Certification ${m.certification} → ${newCert}.${certNote.trim() ? ' ' + certNote.trim() : ''}` }, ...m.history] }
    }))
    log('metric.certify', `${sel.name}: ${sel.certification} → ${newCert}`); toast(`"${sel.name}" is now ${newCert}.`)
    setCertOpen(false); setCertNote('')
  }
  const removeMetric = async (m: CMetric) => {
    if (!(await confirm({ title: `Delete "${m.name}"?`, body: 'This proposed metric will be removed from the catalog.', confirmLabel: 'Delete metric', danger: true }))) return
    setCat((c) => c.filter((x) => x.id !== m.id)); log('metric.delete', m.name); toast(`Metric "${m.name}" deleted.`); open(null)
  }
  const exportCsv = () => {
    const head = ['Name', 'Domain', 'Certification', 'Owner', 'Dataset', 'Frequency', 'Formula', 'Definition']
    const text = [head, ...rows.map((m) => [m.name, m.domain, m.certification, m.owner, m.dataset, m.frequency, m.formula, m.definition])].map((r) => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'metrics-catalog.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    log('metric.export', `Metrics catalog (${rows.length} metrics, CSV)`); toast('Catalog exported as CSV.')
  }

  // Detail data
  const ds = sel ? DATASETS.find((d) => d.id === sel.dataset) : null
  const dims = ds ? ds.fields.filter((f) => (f.type === 'string' || f.type === 'date') && !f.pii) : []
  const keys = sel ? KEYS[sel.id] ?? [] : []
  const usedReports = sel ? reports.filter((r) => r.sections.some((s) => s.metric && keys.includes(s.metric as MetricKey)) || sel.dashboards.includes(r.name)) : []
  const usedAnalyses = sel ? analyses.filter((a) => a.metrics.some((x) => keys.includes(x as MetricKey))) : []
  const dashOnly = sel ? sel.dashboards.filter((d) => !usedReports.some((r) => r.name === d)) : []

  if (loading) return (
    <div aria-busy="true" aria-label="Loading metrics catalog">
      <Skeleton className="mb-2 h-7 w-56" /><Skeleton className="mb-6 h-4 w-96" /><Skeleton className="mb-3 h-10 w-full" /><Skeleton className="h-80 rounded-xl" />
    </div>
  )

  return (
    <div>
      <PageHeader title="Metrics Catalog" description="One governed definition for every number. Search, review and certify the metrics used across Nexus Analytics."
        actions={<>
          <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          {canEdit && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openForm()}>Propose metric</Button>}
        </>} />
      {!canEdit && <ReadOnlyNote page="the Metrics Catalog" />}

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput className="w-full sm:w-72" value={q} onChange={setQ} placeholder="Search metrics, formulas, owners" label="Search metrics" />
          <Select aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} className="w-44"><option value="All">All domains</option>{domains.map((d) => <option key={d}>{d}</option>)}</Select>
          <Select aria-label="Certification status" value={cert} onChange={(e) => setCert(e.target.value)} className="w-40"><option value="All">All statuses</option>{CERTS.map((d) => <option key={d}>{d}</option>)}</Select>
          <Select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44"><option value="All">All owners</option>{owners.map((d) => <option key={d}>{d}</option>)}</Select>
          {filtersActive && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setDomain('All'); setCert('All'); setOwner('All') }}>Clear filters</Button>}
          <span className="ml-auto text-xs text-muted" aria-live="polite">{rows.length} of {cat.length} metrics</span>
        </div>
        <Table caption="Metrics catalog" rows={rows} rowKey={(m) => m.id} pageSize={10} selectedKey={selectedId ?? undefined} onRowClick={(m) => open(m.id)}
          empty={<EmptyState icon={<BarChart3 className="size-5" />} title="No metrics match" body="Try a different search or clear the filters." action={filtersActive ? <Button onClick={() => { setQ(''); setDomain('All'); setCert('All'); setOwner('All') }}>Clear filters</Button> : undefined} />}
          cols={[
            { key: 'name', header: 'Metric', sort: (m) => m.name, render: (m) => <div><button className="text-left font-medium text-primary-ink hover:underline" onClick={(e) => { e.stopPropagation(); open(m.id) }}>{m.name}</button><p className="line-clamp-1 max-w-md text-xs text-muted">{m.definition}</p></div> },
            { key: 'domain', header: 'Domain', sort: (m) => m.domain },
            { key: 'certification', header: 'Certification', sort: (m) => m.certification, render: (m) => <StatusBadge status={m.certification} /> },
            { key: 'owner', header: 'Owner', sort: (m) => m.owner },
            { key: 'dataset', header: 'Dataset', sort: (m) => m.dataset, render: (m) => DATASETS.find((d) => d.id === m.dataset)?.name ?? m.dataset },
            { key: 'frequency', header: 'Refresh', sort: (m) => m.frequency },
            { key: 'updated', header: 'Updated', sort: (m) => m.updated, render: (m) => fmtDate(m.updated) },
          ]} />
      </Card>

      <Drawer open={!!sel} onClose={() => open(null)} title={sel?.name ?? ''} description={sel ? `${sel.domain} · owned by ${sel.owner}` : undefined} width="max-w-2xl"
        footer={sel && <>
          {canEdit && sel.custom && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => removeMetric(sel)}>Delete</Button>}
          {canEdit && <Button icon={<Pencil className="size-4" />} onClick={() => openForm(sel)}>Edit</Button>}
          <Link to={`/analytics?metric=${ANALYTICS_KEY[sel.id] ?? sel.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:bg-primary-hover"><ExternalLink className="size-4" aria-hidden />Open in Analytics</Link>
        </>}>
        {sel && cur && (
          <div className="space-y-5">
            {sel.certification === 'Deprecated' && <Banner tone="warning" title="Deprecated metric">Avoid using this metric in new reports or analyses.</Banner>}
            {sel.certification === 'Draft' && <Banner tone="info" title="Draft metric">This definition has not been reviewed. Numbers may change.</Banner>}
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={sel.certification} /><Badge>{sel.aggregation}</Badge><Badge>{sel.frequency}</Badge><span className="text-xs text-muted">Last updated {fmtDate(sel.updated)}</span></div>

            <section aria-label="Current value" className="rounded-xl border border-line bg-sunken p-4">
              <p className="text-xs font-medium text-ink-2">Current value</p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="tnum text-[26px] font-semibold leading-8 text-ink">{cur.text}</p>
                  {cur.delta && <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${cur.good ? 'text-success' : 'text-danger'}`}>{cur.up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}<span className="sr-only">{cur.up ? 'Up' : 'Down'} </span>{cur.delta}</span>}
                </div>
                {cur.spark && <Sparkline data={cur.spark} good={cur.good} width={140} height={44} />}
              </div>
              <p className="mt-2 text-xs text-muted">{cur.note}. Target: {fmtTarget(sel)}.</p>
            </section>

            <section><h3 className="mb-1 text-[13px] font-semibold text-ink">Definition</h3><p className="text-[13px] text-ink-2">{sel.definition}</p></section>
            <section><h3 className="mb-1 text-[13px] font-semibold text-ink">Formula</h3><code className="block overflow-x-auto rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-ink">{sel.formula}</code></section>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div><dt className="text-xs text-muted">Grain</dt><dd className="text-ink">{sel.frequency} · by {dims.some((d) => d.type === 'date') ? 'month' : 'period'}</dd></div>
              <div><dt className="text-xs text-muted">Aggregation</dt><dd className="text-ink">{sel.aggregation}</dd></div>
              <div><dt className="text-xs text-muted">Owner</dt><dd className="text-ink">{sel.owner}</dd></div>
              <div><dt className="text-xs text-muted">Direction</dt><dd className="text-ink">{sel.higherIsBetter ? 'Higher is better' : 'Lower is better'}</dd></div>
            </dl>

            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><ShieldCheck className="size-4 text-primary-ink" aria-hidden />Certification</h3>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={sel.certification} />
                {canEdit ? <Button size="sm" icon={<BadgeCheck className="size-3.5" />} onClick={() => { setNewCert(CERTS.find((c) => c !== sel.certification) ?? 'Certified'); setCertNote(''); setCertOpen(true) }}>Change certification</Button> : <span className="text-xs text-muted">Only editors can change certification.</span>}
              </div>
            </section>

            <section><h3 className="mb-1.5 text-[13px] font-semibold text-ink">Dimensions available</h3>
              {dims.length ? <div className="flex flex-wrap gap-1.5">{dims.map((d) => <Badge key={d.name} tone="primary">{d.name}</Badge>)}</div> : <p className="text-xs text-muted">No dimensions are exposed by the source dataset.</p>}
            </section>

            <section><h3 className="mb-1.5 text-[13px] font-semibold text-ink">Source datasets</h3>
              {ds ? (
                <ul className="space-y-1.5 text-[13px]">
                  <li><Link to={`/explore/${ds.id}`} className="font-medium text-primary-ink hover:underline">{ds.name}</Link> <span className="text-muted">· {ds.rows.toLocaleString()} rows · quality {ds.quality}%</span></li>
                  {ds.upstream.map((u) => <li key={u} className="pl-3 text-xs text-muted">Upstream: {u}</li>)}
                </ul>
              ) : <p className="text-xs text-muted">Dataset not found.</p>}
            </section>

            <section><h3 className="mb-1.5 text-[13px] font-semibold text-ink">Used in</h3>
              {!usedReports.length && !usedAnalyses.length && !dashOnly.length ? <p className="text-xs text-muted">Not used in any report or analysis yet.</p> : (
                <ul className="space-y-1 text-[13px]">
                  {usedReports.map((r) => <li key={r.id} className="flex items-center gap-2"><Badge>Report</Badge><Link to={`/reports/builder/${r.id}`} className="text-primary-ink hover:underline">{r.name}</Link></li>)}
                  {usedAnalyses.map((a) => <li key={a.id} className="flex items-center gap-2"><Badge tone="info">Analysis</Badge><Link to="/analytics" className="text-primary-ink hover:underline">{a.name}</Link></li>)}
                  {dashOnly.map((d) => <li key={d} className="flex items-center gap-2"><Badge>Dashboard</Badge><span className="text-ink">{d}</span></li>)}
                </ul>
              )}
            </section>

            <section><h3 className="mb-1.5 text-[13px] font-semibold text-ink">Version history</h3>
              <ol className="space-y-2 border-l border-line pl-4">
                {sel.history.map((v, i) => (
                  <li key={v.version + v.date + i} className="relative text-[13px]">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                    <p className="font-medium text-ink">v{v.version} <span className="font-normal text-muted">· {fmtDate(v.date)} · {v.by}</span></p>
                    <p className="text-xs text-ink-2">{v.note}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </Drawer>

      <Modal open={certOpen} onClose={() => setCertOpen(false)} title="Change certification" description={sel ? `${sel.name} is currently ${sel.certification}.` : undefined}
        footer={<><Button onClick={() => setCertOpen(false)}>Cancel</Button><Button variant="primary" onClick={changeCert}>Continue</Button></>}>
        <div className="space-y-4">
          <Field label="New status" htmlFor="cert-status"><Select id="cert-status" value={newCert} onChange={(e) => setNewCert(e.target.value as Cert)}>{CERTS.filter((c) => c !== sel?.certification).map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Note (optional)" htmlFor="cert-note" hint="Recorded in version history."><Textarea id="cert-note" value={certNote} onChange={(e) => setCertNote(e.target.value)} maxLength={240} /></Field>
        </div>
      </Modal>

      <Modal open={formOpen} onClose={closeForm} width="max-w-2xl" title={editing ? 'Edit metric' : 'Propose a metric'} description={editing ? 'Saving creates a new version.' : 'New metrics start as Draft until reviewed.'}
        footer={<><Button onClick={closeForm}>Cancel</Button><Button variant="primary" onClick={submit}>{editing ? 'Save changes' : 'Submit proposal'}</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); submit() }} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Name" required htmlFor="mf-name" error={errs.name}><Input id="mf-name" value={form.name} invalid={!!errs.name} onChange={(e) => set('name', e.target.value)} maxLength={60} /></Field></div>
          <div className="sm:col-span-2"><Field label="Definition" required htmlFor="mf-def" error={errs.definition} hint="Plain-language description, including inclusions and exclusions."><Textarea id="mf-def" value={form.definition} invalid={!!errs.definition} onChange={(e) => set('definition', e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Formula" required htmlFor="mf-formula" error={errs.formula}><Input id="mf-formula" value={form.formula} invalid={!!errs.formula} onChange={(e) => set('formula', e.target.value)} placeholder="SUM(revenue_usd_k)" className="font-mono" /></Field></div>
          <Field label="Owner" required htmlFor="mf-owner" error={errs.owner}><Select id="mf-owner" value={form.owner} invalid={!!errs.owner} onChange={(e) => set('owner', e.target.value)}><option value="">Select owner</option>{[...new Set([...users.filter((u) => u.status !== 'Suspended').map((u) => u.name), form.owner].filter(Boolean))].map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field label="Domain" htmlFor="mf-domain"><Select id="mf-domain" value={form.domain} onChange={(e) => set('domain', e.target.value)}>{domains.map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <Field label="Source dataset" htmlFor="mf-ds"><Select id="mf-ds" value={form.dataset} onChange={(e) => set('dataset', e.target.value)}>{DATASETS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Aggregation" htmlFor="mf-agg"><Select id="mf-agg" value={form.aggregation} onChange={(e) => set('aggregation', e.target.value)}>{['Sum', 'Average', 'Ratio', 'Count', 'Distinct count'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <Field label="Refresh frequency" htmlFor="mf-freq"><Select id="mf-freq" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>{['Daily', 'Weekly', 'Monthly', 'Quarterly'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <Field label="Unit" htmlFor="mf-unit"><Select id="mf-unit" value={form.unit} onChange={(e) => set('unit', e.target.value as Metric['unit'])}>{[['usd', 'Currency (USD)'], ['pct', 'Percentage'], ['num', 'Number'], ['hrs', 'Hours'], ['score', 'Score']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Target (optional)" htmlFor="mf-target" error={errs.target}><Input id="mf-target" inputMode="decimal" value={form.target} invalid={!!errs.target} onChange={(e) => set('target', e.target.value)} placeholder="e.g. 95" /></Field>
          <div className="sm:col-span-2"><Field label="Direction" htmlFor="mf-dir"><Select id="mf-dir" value={form.higherIsBetter ? 'up' : 'down'} onChange={(e) => set('higherIsBetter', e.target.value === 'up')}><option value="up">Higher is better</option><option value="down">Lower is better</option></Select></Field></div>
          <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
        </form>
      </Modal>
    </div>
  )
}
