import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Database, Download, EyeOff, SearchX } from 'lucide-react'
import { useStore } from '../lib/store'
import { DATASETS, FRESHNESS, METRICS, ROLES, sampleRows, type Dataset, type Row, type FieldType, type Sensitivity } from '../lib/data'
import { ago, fmtDate, fmtNum } from '../lib/analytics'
import { Badge, Banner, Button, Card, Checkbox, EmptyState, NoAccess, PageHeader, ProgressBar, SearchInput, Skeleton, StatusBadge, Table, Tabs, type Tone } from '../components/ui'
import { Link, useRoute } from '../lib/router'

type Tab = 'overview' | 'schema' | 'sample' | 'lineage' | 'usage'
const sensTone = (s: Sensitivity): Tone => ({ Public: 'success', Internal: 'info', Confidential: 'warning', Restricted: 'danger' } as Record<Sensitivity, Tone>)[s]
const TYPE_TONE: Record<FieldType, Tone> = { string: 'neutral', number: 'info', currency: 'success', date: 'primary', boolean: 'warning' }
const MASK = '••••••'
const cell = (v: string | number | boolean) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? v.toLocaleString('en-US') : String(v))

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (c: string | number) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DatasetDetails() {
  const { level, perms, role, issues, queries, analyses, pipelines, audit, settings, log, toast } = useStore()
  const { parts } = useRoute()
  const id = parts[1]
  const ds: Dataset | undefined = DATASETS.find((d) => d.id === id)
  const lvl = level('explore')
  const sensitiveOk = level('quality') === 'edit' || level('users') === 'edit'

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [hiddenCols, setHiddenCols] = useState<string[]>([])
  useEffect(() => { setLoading(true); setTab('overview'); setSearch(''); setHiddenCols([]); const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [id])

  const rows = useMemo(() => (ds ? sampleRows(ds.id).map((r, i): Row => ({ ...r, __k: String(i) })) : []), [ds])
  const isMasked = (name: string) => !!ds?.fields.find((f) => f.name === name)?.pii && !sensitiveOk
  const visibleFields = ds ? ds.fields.filter((f) => !hiddenCols.includes(f.name)) : []
  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s || !ds) return rows
    return rows.filter((r) => visibleFields.some((f) => !isMasked(f.name) && String(r[f.name]).toLowerCase().includes(s)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, hiddenCols, ds, sensitiveOk])

  if (lvl === 'none') return <NoAccess page="Explore Data" />
  if (!ds) return (
    <div>
      <PageHeader title="Dataset not found" crumbs={[{ label: 'Explore Data', to: '/explore' }, { label: 'Not found' }]} />
      <Card><EmptyState icon={<SearchX className="size-5" />} title={`No dataset with ID "${id ?? ''}"`} body="The dataset may have been renamed or you followed an outdated link."
        action={<Link to="/explore" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:bg-primary-hover">Back to Explore Data</Link>} /></Card>
    </div>
  )
  if (loading) return (
    <div aria-busy="true" aria-label="Loading dataset">
      <Skeleton className="mb-2 h-4 w-40" /><Skeleton className="mb-2 h-7 w-64" /><Skeleton className="mb-6 h-4 w-96" />
      <Skeleton className="mb-4 h-10 w-full" /><Skeleton className="h-64 rounded-xl" />
    </div>
  )

  const fr = FRESHNESS.find((x) => x.dataset === ds.name)
  const stale = !!fr && fr.ageH > fr.expectedH
  const openIssues = issues.filter((i) => i.dataset === ds.id && i.status !== 'Resolved')
  const hasPii = ds.fields.some((f) => f.pii)
  const fieldSens = (pii?: boolean) => (pii ? 'Restricted' : ds.sensitivity)

  const exportCsv = () => {
    if (!settings.allowExports) { toast('Exports are disabled by workspace settings.', 'error'); return }
    downloadCsv(`${ds.id}-sample.csv`, [visibleFields.map((f) => f.name), ...filteredRows.map((r) => visibleFields.map((f) => (isMasked(f.name) ? MASK : (r[f.name] as string | number | boolean) === true ? 'true' : (r[f.name] as string | number | boolean) === false ? 'false' : (r[f.name] as string | number))))])
    log('dataset.export', `${ds.name} (CSV)`); toast(`Exported ${filteredRows.length} rows.`)
  }

  // lineage
  const nodeLink = (name: string) => {
    const d = DATASETS.find((x) => x.name === name); if (d) return `/explore/${d.id}`
    if (name.startsWith('pl_')) return '/pipelines'
    if (METRICS.some((m) => m.name === name)) return '/metrics'
    if (/report|overview|model|revenue by region/i.test(name)) return '/reports'
    return undefined
  }
  const nodeState = (name: string) => pipelines.find((p) => p.id === name)?.status
  const nodeLabel = (name: string) => pipelines.find((p) => p.id === name)?.name ?? name
  const ROW_H = 56, W = 760, NW = 210
  const H = Math.max(ds.upstream.length, ds.downstream.length, 1) * ROW_H + 24
  const yAt = (i: number, n: number) => (H - n * ROW_H) / 2 + i * ROW_H + ROW_H / 2
  const trunc = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const Node = ({ x, y, name, center }: { x: number; y: number; name: string; center?: boolean }) => {
    const href = center ? undefined : nodeLink(name)
    const st = nodeState(name)
    const body = (
      <g>
        <title>{nodeLabel(name)}{st ? ` (${st})` : ''}</title>
        <rect x={x} y={y - 18} width={NW} height={36} rx={9} fill={center ? 'var(--primary-soft)' : 'var(--surface)'} stroke={st === 'Failed' ? 'var(--danger)' : center ? 'var(--primary)' : 'var(--line-strong)'} strokeWidth={center || st === 'Failed' ? 2 : 1} />
        <text x={x + NW / 2} y={y + 4} textAnchor="middle" fontSize="12" fontWeight={center ? 600 : 500} fill="var(--ink)">{trunc(nodeLabel(name))}</text>
      </g>
    )
    return href ? <a href={`#${href}`} aria-label={`${nodeLabel(name)}${st ? `, status ${st}` : ''}`}>{body}</a> : body
  }
  const cx0 = 10, cx1 = (W - NW) / 2, cx2 = W - NW - 10
  const cy = H / 2

  const accessRows = ROLES.map((r) => ({ role: r, access: perms[r].explore, pii: perms[r].quality === 'edit' || perms[r].users === 'edit' }))
  const usedBy = {
    metrics: METRICS.filter((m) => m.dataset === ds.id),
    queries: queries.filter((x) => x.dataset === ds.id),
    analyses: analyses.filter((a) => a.dataset === ds.id),
  }
  const recent = audit.filter((a) => a.target.toLowerCase().includes(ds.name.toLowerCase())).slice(0, 6)

  return (
    <div>
      <PageHeader title={ds.name} crumbs={[{ label: 'Explore Data', to: '/explore' }, { label: ds.name }]} description={ds.desc}
        badge={<span className="flex gap-1">{ds.certified ? <Badge tone="success"><BadgeCheck className="size-3" aria-hidden />Certified</Badge> : <Badge tone="warning">Uncertified</Badge>}<Badge tone={sensTone(ds.sensitivity)}>{ds.sensitivity}</Badge></span>}
        actions={<><Link to="/explore" className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium text-ink hover:bg-sunken">All datasets</Link>
          <Button variant="primary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!settings.allowExports}>Export sample CSV</Button></>} />

      {stale && <div className="mb-4"><Banner tone="warning" title={`${ds.name} data is stale`}>Last refresh was {fr!.ageH} hours ago; the freshness SLA is {fr!.expectedH} hours. Figures built on this dataset may lag. <Link to="/quality" className="font-medium text-primary-ink underline">View data quality</Link></Banner></div>}
      {hasPii && !sensitiveOk && <div className="mb-4"><Banner tone="info" title="Sensitive fields are masked"><span>Your role ({role}) does not have edit access to Data Quality or User Management, so PII columns are hidden in samples and exports.</span></Banner></div>}

      <Tabs label="Dataset sections" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'schema', label: 'Schema', count: ds.fields.length }, { value: 'sample', label: 'Sample records' }, { value: 'lineage', label: 'Lineage' }, { value: 'usage', label: 'Usage & access' }]} />

      <div className="mt-4" role="tabpanel" aria-label={tab}>
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Summary" className="lg:col-span-2">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px] sm:grid-cols-3">
                <div><dt className="text-xs text-muted">Owner</dt><dd className="font-medium text-ink">{ds.owner}</dd></div>
                <div><dt className="text-xs text-muted">Team</dt><dd className="font-medium text-ink">{ds.team}</dd></div>
                <div><dt className="text-xs text-muted">Row count</dt><dd className="tnum font-medium text-ink">{fmtNum(ds.rows)}</dd></div>
                <div><dt className="text-xs text-muted">Last refreshed</dt><dd className="font-medium text-ink">{fmtDate(ds.refreshed, true)}<span className="block text-xs font-normal text-muted">{ago(ds.refreshed)}{fr ? ` · SLA ${fr.expectedH}h` : ''}</span></dd></div>
                <div><dt className="text-xs text-muted">Fields</dt><dd className="tnum font-medium text-ink">{ds.fields.length}{hasPii && <span className="text-xs font-normal text-muted"> ({ds.fields.filter((f) => f.pii).length} PII)</span>}</dd></div>
                <div><dt className="text-xs text-muted">Freshness</dt><dd><StatusBadge status={stale ? 'Warning' : 'Success'} /></dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">{ds.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
            </Card>
            <Card title="Quality score">
              <p className="tnum text-3xl font-semibold text-ink">{ds.quality}%</p>
              <div className="mt-2"><ProgressBar value={ds.quality} label={`${ds.name} quality score`} tone={ds.quality >= 97 ? 'success' : ds.quality >= 93 ? 'warning' : 'danger'} /></div>
              <p className="mt-3 text-xs text-muted">Weighted pass rate across the dataset&apos;s quality rules.</p>
              {openIssues.length > 0 ? (
                <ul className="mt-3 space-y-2 text-[13px]">{openIssues.map((i) => <li key={i.id}><Link to="/quality" className="block rounded-lg border border-line p-2 hover:bg-sunken"><span className="flex items-center gap-2"><StatusBadge status={i.severity} /><span className="text-xs text-muted">{i.id}</span></span><span className="mt-1 block text-ink">{i.title}</span></Link></li>)}</ul>
              ) : <p className="mt-3 text-[13px] text-success">No open quality issues.</p>}
            </Card>
          </div>
        )}

        {tab === 'schema' && (
          <Card pad={false} title="Fields" subtitle={`${ds.fields.length} fields. Sensitivity is inherited from the dataset unless a field is flagged as PII.`}>
            <Table caption={`Schema of ${ds.name}`} rows={ds.fields} rowKey={(f) => f.name} pageSize={10}
              cols={[
                { key: 'name', header: 'Field', sort: (f) => f.name, render: (f) => <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs">{f.name}</code> },
                { key: 'type', header: 'Type', sort: (f) => f.type, render: (f) => <Badge tone={TYPE_TONE[f.type]}>{f.type}</Badge> },
                { key: 'desc', header: 'Description', render: (f) => <span className="text-ink-2">{f.desc}</span> },
                { key: 'sens', header: 'Sensitivity', sort: (f) => fieldSens(f.pii), render: (f) => <span className="flex items-center gap-1.5"><Badge tone={sensTone(fieldSens(f.pii))}>{fieldSens(f.pii)}</Badge>{f.pii && <Badge tone="danger">PII</Badge>}{f.pii && !sensitiveOk && <EyeOff className="size-3.5 text-muted" aria-label="Masked for your role" />}</span> },
              ]} />
          </Card>
        )}

        {tab === 'sample' && (
          <Card pad={false} title="Sample records" subtitle={`${filteredRows.length} of ${rows.length} sample rows${ds.rows > rows.length ? ` · full dataset has ${fmtNum(ds.rows)} rows` : ''}`}>
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search visible columns" label="Search sample records" className="w-64" />
              <details className="relative">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-sunken">Columns ({visibleFields.length}/{ds.fields.length})</summary>
                <div className="absolute left-0 z-30 mt-1 w-60 space-y-1.5 rounded-lg border border-line bg-surface p-3 shadow-xl">
                  {ds.fields.map((f) => <Checkbox key={f.name} label={f.name} checked={!hiddenCols.includes(f.name)} disabled={!hiddenCols.includes(f.name) && visibleFields.length === 1} onChange={(on) => setHiddenCols((h) => (on ? h.filter((x) => x !== f.name) : [...h, f.name]))} />)}
                  <button className="pt-1 text-xs font-medium text-primary-ink underline" onClick={() => setHiddenCols([])}>Show all</button>
                </div>
              </details>
              <Button className="ml-auto" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!settings.allowExports || !filteredRows.length}>Export CSV</Button>
            </div>
            <Table caption={`Sample records from ${ds.name}`} rows={filteredRows} rowKey={(r) => String(r.__k)} pageSize={10} dense
              empty={<EmptyState icon={<Database className="size-5" />} title="No matching rows" body="No sample rows match your search." />}
              cols={ds.fields.map((f) => ({
                key: f.name, header: f.name, hidden: hiddenCols.includes(f.name), align: f.type === 'number' || f.type === 'currency' ? 'right' as const : undefined,
                sort: isMasked(f.name) ? undefined : (r: (typeof rows)[number]) => (typeof r[f.name] === 'boolean' ? Number(r[f.name]) : (r[f.name] as string | number)),
                render: (r: (typeof rows)[number]) => (isMasked(f.name) ? <span className="text-muted" title="Masked for your role">{MASK}</span> : cell(r[f.name])),
              }))} />
            {hasPii && !sensitiveOk && <p className="border-t border-line px-4 py-2 text-xs text-muted">Masked columns ({ds.fields.filter((f) => f.pii).map((f) => f.name).join(', ')}) are not searchable or sortable for your role.</p>}
          </Card>
        )}

        {tab === 'lineage' && (
          <Card title="Lineage" subtitle="Where this dataset comes from and what depends on it. Select a node to open it.">
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full min-w-[640px] max-w-[820px]" role="group" aria-label={`Lineage diagram: ${ds.upstream.length} upstream sources feed ${ds.name}, which feeds ${ds.downstream.length} downstream assets`}>
                {ds.upstream.map((_, i) => <path key={'u' + i} d={`M${cx0 + NW},${yAt(i, ds.upstream.length)} C${cx0 + NW + 60},${yAt(i, ds.upstream.length)} ${cx1 - 60},${cy} ${cx1},${cy}`} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />)}
                {ds.downstream.map((_, i) => <path key={'d' + i} d={`M${cx1 + NW},${cy} C${cx1 + NW + 60},${cy} ${cx2 - 60},${yAt(i, ds.downstream.length)} ${cx2},${yAt(i, ds.downstream.length)}`} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />)}
                <text x={cx0} y={12} fontSize="11" fill="var(--muted)">UPSTREAM</text><text x={cx1} y={12} fontSize="11" fill="var(--muted)">DATASET</text><text x={cx2} y={12} fontSize="11" fill="var(--muted)">DOWNSTREAM</text>
                {ds.upstream.map((n, i) => <Node key={n} x={cx0} y={yAt(i, ds.upstream.length)} name={n} />)}
                <Node x={cx1} y={cy} name={ds.name} center />
                {ds.downstream.map((n, i) => <Node key={n} x={cx2} y={yAt(i, ds.downstream.length)} name={n} />)}
              </svg>
            </div>
            <div className="mt-4 grid gap-4 border-t border-line pt-4 text-[13px] sm:grid-cols-2">
              <div><h4 className="mb-1.5 text-xs font-semibold text-muted">Upstream sources</h4><ul className="space-y-1">{ds.upstream.map((n) => <li key={n} className="flex items-center gap-2 text-ink">{nodeLabel(n)}{nodeState(n) && <StatusBadge status={nodeState(n)!} />}</li>)}</ul></div>
              <div><h4 className="mb-1.5 text-xs font-semibold text-muted">Downstream consumers</h4><ul className="space-y-1">{ds.downstream.map((n) => <li key={n} className="text-ink">{n}</li>)}</ul></div>
            </div>
            {ds.upstream.some((n) => nodeState(n) === 'Failed') && <div className="mt-4"><Banner tone="danger" title="An upstream pipeline failed">Data in this dataset and everything downstream may be out of date. <Link to="/pipelines" className="font-medium text-primary-ink underline">Open pipelines</Link></Banner></div>}
          </Card>
        )}

        {tab === 'usage' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Usage" subtitle="Saved assets built on this dataset">
              <dl className="grid grid-cols-3 gap-3 text-center">
                {([['Metrics', usedBy.metrics.length], ['Saved queries', usedBy.queries.length], ['Analyses', usedBy.analyses.length]] as const).map(([l, n]) => <div key={l} className="rounded-lg bg-sunken p-3"><dd className="tnum text-xl font-semibold text-ink">{n}</dd><dt className="text-xs text-muted">{l}</dt></div>)}
              </dl>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {usedBy.metrics.map((m) => <li key={m.id}><Link to="/metrics" className="text-primary-ink hover:underline">{m.name}</Link> <span className="text-muted">· metric</span></li>)}
                {usedBy.queries.map((x) => <li key={x.id}><Link to="/explore" className="text-primary-ink hover:underline">{x.name}</Link> <span className="text-muted">· saved query</span></li>)}
                {usedBy.analyses.map((a) => <li key={a.id}><Link to={`/analytics?open=${a.id}`} className="text-primary-ink hover:underline">{a.name}</Link> <span className="text-muted">· analysis</span></li>)}
                {!usedBy.metrics.length && !usedBy.queries.length && !usedBy.analyses.length && <li className="text-muted">Nothing references this dataset yet.</li>}
              </ul>
              <h4 className="mb-1.5 mt-4 text-xs font-semibold text-muted">Recent activity</h4>
              {recent.length ? <ul className="space-y-1.5 text-xs text-ink-2">{recent.map((a) => <li key={a.id}><b className="text-ink">{a.actor}</b> {a.action.replace('.', ' ')} · {ago(a.at)}</li>)}</ul> : <p className="text-xs text-muted">No recent audited activity.</p>}
            </Card>
            <Card title="Access by role" subtitle="Based on the current Roles & Permissions configuration" pad={false}>
              <Table caption="Role access to this dataset" rows={accessRows} rowKey={(r) => r.role} pageSize={10} dense
                cols={[
                  { key: 'role', header: 'Role', sort: (r) => r.role, render: (r) => <span className={r.role === role ? 'font-semibold' : ''}>{r.role}{r.role === role && <span className="ml-1 text-xs text-muted">(you)</span>}</span> },
                  { key: 'access', header: 'Dataset access', sort: (r) => r.access, render: (r) => (r.access === 'none' ? <Badge>No access</Badge> : r.access === 'view' ? <Badge tone="info">Read</Badge> : <Badge tone="success">Read and manage</Badge>) },
                  { key: 'pii', header: 'PII fields', render: (r) => (r.access === 'none' ? '—' : r.pii ? 'Visible' : 'Masked') },
                ]} />
              <p className="border-t border-line px-4 py-2 text-xs text-muted">Sensitivity: {ds.sensitivity}. PII is visible only to roles with edit access to Data Quality or User Management.</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
