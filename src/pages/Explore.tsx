import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Database, Play, Plus, Trash2, LayoutGrid, List } from 'lucide-react'
import { useStore, uid } from '../lib/store'
import { DATASETS, FRESHNESS, sampleRows, type Dataset, type Row, type Sensitivity } from '../lib/data'
import { ago, fmtNum } from '../lib/analytics'
import { Badge, Banner, Button, Card, Drawer, EmptyState, Field, IconButton, Input, Modal, NoAccess, PageHeader, ProgressBar, ReadOnlyNote, SearchInput, Segmented, Select, Skeleton, Table, type Tone } from '../components/ui'
import { Link, go } from '../lib/router'

const DOMAIN: Record<string, string> = { sales: 'Sales', customers: 'Customer', orders: 'Sales', products: 'Product', finance: 'Finance', operations: 'Operations', support: 'Customer' }
const SENS: Sensitivity[] = ['Public', 'Internal', 'Confidential', 'Restricted']
const sensTone = (s: Sensitivity): Tone => ({ Public: 'success', Internal: 'info', Confidential: 'warning', Restricted: 'danger' } as Record<Sensitivity, Tone>)[s]
const isStale = (d: Dataset) => { const f = FRESHNESS.find((x) => x.dataset === d.name); return !!f && f.ageH > f.expectedH }
const cell = (v: string | number | boolean) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? v.toLocaleString('en-US') : String(v))

export default function Explore() {
  const { level, queries, setQueries, userName, log, toast, confirm, role } = useStore()
  const lvl = level('explore')
  const canEdit = lvl === 'edit'
  const sensitiveOk = level('quality') === 'edit' || level('users') === 'edit'

  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [domain, setDomain] = useState('All')
  const [sens, setSens] = useState('All')
  const [cert, setCert] = useState('All')
  const [sort, setSort] = useState<'name' | 'quality' | 'rows' | 'fresh'>('name')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [runId, setRunId] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [qName, setQName] = useState('')
  const [qDs, setQDs] = useState(DATASETS[0].id)
  const [qFilter, setQFilter] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return DATASETS.filter((d) => (domain === 'All' || DOMAIN[d.id] === domain) && (sens === 'All' || d.sensitivity === sens) && (cert === 'All' || (cert === 'Certified') === d.certified)
      && (!s || [d.name, d.desc, d.owner, d.team, ...d.tags].some((x) => x.toLowerCase().includes(s))))
      .sort((a, b) => (sort === 'quality' ? b.quality - a.quality : sort === 'rows' ? b.rows - a.rows : sort === 'fresh' ? b.refreshed.localeCompare(a.refreshed) : a.name.localeCompare(b.name)))
  }, [q, domain, sens, cert, sort])
  const filtered = q || domain !== 'All' || sens !== 'All' || cert !== 'All'
  const clear = () => { setQ(''); setDomain('All'); setSens('All'); setCert('All') }

  const run = queries.find((x) => x.id === runId)
  const runDs = DATASETS.find((d) => d.id === run?.dataset)
  const runRows = useMemo(() => {
    if (!run || !runDs) return []
    const f = run.filter.trim().toLowerCase()
    return sampleRows(runDs.id).filter((r) => !f || Object.entries(r).some(([k, v]) => !(runDs.fields.find((x) => x.name === k)?.pii && !sensitiveOk) && String(v).toLowerCase().includes(f))).map((r, i): Row => ({ ...r, __k: String(i) }))
  }, [run, runDs, sensitiveOk])

  const saveQuery = () => {
    const name = qName.trim()
    if (!name) { setErr('Enter a name for this query.'); return }
    if (queries.some((x) => x.name.toLowerCase() === name.toLowerCase())) { setErr('A saved query with this name already exists.'); return }
    setQueries((x) => [...x, { id: uid('q'), name, dataset: qDs, filter: qFilter.trim(), owner: userName }])
    log('query.save', name); toast(`Saved query "${name}".`); setSaveOpen(false); setQName(''); setQFilter(''); setErr('')
  }
  const delQuery = async (id: string) => {
    const x = queries.find((y) => y.id === id)
    if (!x || !(await confirm({ title: `Delete "${x.name}"?`, body: 'This saved query will be removed for everyone who can see it.', confirmLabel: 'Delete query', danger: true }))) return
    setQueries((y) => y.filter((z) => z.id !== id)); if (runId === id) setRunId(null)
    log('query.delete', x.name); toast('Query deleted.')
  }

  if (lvl === 'none') return <NoAccess page="Explore Data" />
  if (loading) return (
    <div aria-busy="true" aria-label="Loading datasets">
      <Skeleton className="mb-2 h-7 w-56" /><Skeleton className="mb-6 h-4 w-96" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Explore Data" description="Browse the certified dataset catalog, inspect schemas and lineage, and run saved queries." badge={<Badge tone="info">Demo data</Badge>}
        actions={<Button variant="primary" icon={<Plus className="size-4" />} disabled={!canEdit} onClick={() => { setErr(''); setSaveOpen(true) }}>New saved query</Button>} />
      {lvl === 'view' && <ReadOnlyNote page="datasets and saved queries" />}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="mb-3 flex flex-wrap items-center gap-2" role="search" aria-label="Filter datasets">
            <SearchInput value={q} onChange={setQ} placeholder="Search datasets, owners, tags" label="Search datasets" className="w-64" />
            <Select aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} className="w-36"><option value="All">All domains</option>{[...new Set(Object.values(DOMAIN))].sort().map((d) => <option key={d}>{d}</option>)}</Select>
            <Select aria-label="Sensitivity" value={sens} onChange={(e) => setSens(e.target.value)} className="w-40"><option value="All">All sensitivity</option>{SENS.map((s) => <option key={s}>{s}</option>)}</Select>
            <Select aria-label="Certification" value={cert} onChange={(e) => setCert(e.target.value)} className="w-40"><option value="All">Any certification</option><option>Certified</option><option>Uncertified</option></Select>
            <Select aria-label="Sort datasets" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-40"><option value="name">Name A–Z</option><option value="quality">Quality score</option><option value="rows">Row count</option><option value="fresh">Most recently refreshed</option></Select>
            <div className="ml-auto"><Segmented label="View" value={view} onChange={setView} options={[{ value: 'cards', label: <><LayoutGrid className="size-3.5" aria-hidden />Cards</> }, { value: 'table', label: <><List className="size-3.5" aria-hidden />Table</> }]} /></div>
          </div>
          <p className="mb-2 text-xs text-muted" aria-live="polite">{shown.length} of {DATASETS.length} datasets{filtered && <> · <button className="font-medium text-primary-ink underline" onClick={clear}>Clear filters</button></>}</p>

          {shown.length === 0 ? (
            <Card><EmptyState icon={<Database className="size-5" />} title="No datasets match" body="Try a different search or clear the filters." action={<Button onClick={clear}>Clear filters</Button>} /></Card>
          ) : view === 'cards' ? (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Datasets">
              {shown.map((d) => (
                <li key={d.id} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/explore/${d.id}`} className="text-[15px] font-semibold text-ink hover:text-primary-ink hover:underline">{d.name}</Link>
                    <div className="flex flex-wrap justify-end gap-1">{d.certified ? <Badge tone="success"><BadgeCheck className="size-3" aria-hidden />Certified</Badge> : <Badge tone="warning">Uncertified</Badge>}<Badge tone={sensTone(d.sensitivity)}>{d.sensitivity}</Badge></div>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-2">{d.desc}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="text-muted">Rows</dt><dd className="tnum font-medium text-ink">{fmtNum(d.rows)}</dd></div>
                    <div><dt className="text-muted">Refreshed</dt><dd className="font-medium text-ink">{ago(d.refreshed)}{isStale(d) && <span className="ml-1 text-warning">· stale</span>}</dd></div>
                    <div><dt className="text-muted">Domain</dt><dd className="font-medium text-ink">{DOMAIN[d.id]}</dd></div>
                  </dl>
                  <div className="mt-3 flex items-center gap-2"><div className="flex-1"><ProgressBar value={d.quality} label={`${d.name} quality score`} tone={d.quality >= 97 ? 'success' : d.quality >= 93 ? 'warning' : 'danger'} /></div><span className="tnum text-xs font-medium text-ink">{d.quality}% quality</span></div>
                  <p className="mt-2 text-xs text-muted">Owner {d.owner} · {d.team}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Card pad={false}>
              <Table caption="Dataset catalog" rows={shown} rowKey={(d) => d.id} pageSize={10} onRowClick={(d) => go(`/explore/${d.id}`)}
                cols={[
                  { key: 'name', header: 'Dataset', sort: (d) => d.name, render: (d) => <Link to={`/explore/${d.id}`} className="font-medium text-primary-ink hover:underline" onClick={(e) => e.stopPropagation()}>{d.name}</Link> },
                  { key: 'domain', header: 'Domain', sort: (d) => DOMAIN[d.id], render: (d) => DOMAIN[d.id] },
                  { key: 'sens', header: 'Sensitivity', sort: (d) => SENS.indexOf(d.sensitivity), render: (d) => <Badge tone={sensTone(d.sensitivity)}>{d.sensitivity}</Badge> },
                  { key: 'cert', header: 'Certification', sort: (d) => Number(d.certified), render: (d) => (d.certified ? <Badge tone="success">Certified</Badge> : <Badge tone="warning">Uncertified</Badge>) },
                  { key: 'rows', header: 'Rows', align: 'right', sort: (d) => d.rows, render: (d) => fmtNum(d.rows) },
                  { key: 'q', header: 'Quality', align: 'right', sort: (d) => d.quality, render: (d) => `${d.quality}%` },
                  { key: 'ref', header: 'Refreshed', sort: (d) => d.refreshed, render: (d) => <span>{ago(d.refreshed)}{isStale(d) && <span className="ml-1 text-warning">stale</span>}</span> },
                  { key: 'owner', header: 'Owner', sort: (d) => d.owner },
                ]} />
            </Card>
          )}
        </div>

        <aside className="xl:col-span-4" aria-label="Saved queries">
          <Card title="Saved queries" subtitle="Filter a dataset sample and re-run it any time" pad={false}
            actions={<Button size="sm" icon={<Plus className="size-4" />} disabled={!canEdit} onClick={() => { setErr(''); setSaveOpen(true) }}>Save query</Button>}>
            {queries.length === 0 ? <EmptyState icon={<Database className="size-5" />} title="No saved queries" body="Save a query to reuse it later." /> : (
              <ul className="divide-y divide-line border-t border-line">
                {queries.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{x.name}</p>
                      <p className="truncate text-xs text-muted">{DATASETS.find((d) => d.id === x.dataset)?.name ?? x.dataset} · {x.filter ? `contains "${x.filter}"` : 'no filter'} · {x.owner}</p>
                    </div>
                    <Button size="sm" icon={<Play className="size-3.5" />} onClick={() => setRunId(x.id)}>Run</Button>
                    <IconButton label={`Delete query ${x.name}`} className="size-8" disabled={!canEdit} onClick={() => delQuery(x.id)}><Trash2 className="size-4" /></IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <Drawer open={!!run} onClose={() => setRunId(null)} title={run?.name ?? ''} description={run ? `${runDs?.name} · ${run.filter ? `rows containing "${run.filter}"` : 'all rows'} · ${runRows.length} of 60 sample rows` : undefined} width="max-w-4xl"
        footer={<>{runDs && <Button onClick={() => go(`/explore/${runDs.id}`)}>Open dataset</Button>}<Button onClick={() => setRunId(null)}>Close</Button></>}>
        {runDs && !sensitiveOk && runDs.fields.some((f) => f.pii) && <div className="mb-3"><Banner tone="info" title="Sensitive fields masked">Your role ({role}) cannot view PII, so those columns are masked.</Banner></div>}
        {runDs && (
          <Table caption={`Results of ${run?.name}`} rows={runRows} rowKey={(r) => String(r.__k)} pageSize={10} dense
            empty={<EmptyState title="Query returned no rows" body="No sample rows match this filter." />}
            cols={runDs.fields.map((f) => ({ key: f.name, header: f.name, sort: (r: (typeof runRows)[number]) => (r[f.name] as string | number) ?? '', align: f.type === 'number' || f.type === 'currency' ? 'right' as const : undefined, render: (r: (typeof runRows)[number]) => (f.pii && !sensitiveOk ? <span className="text-muted" title="Masked">••••••</span> : cell(r[f.name])) }))} />
        )}
      </Drawer>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save query" description="Saved queries filter a dataset sample for any value containing your text."
        footer={<><Button onClick={() => setSaveOpen(false)}>Cancel</Button><Button variant="primary" onClick={saveQuery}>Save query</Button></>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveQuery() }}>
          <Field label="Name" htmlFor="q-name" required error={err}><Input id="q-name" data-autofocus value={qName} invalid={!!err} maxLength={80} onChange={(e) => { setQName(e.target.value); setErr('') }} placeholder="e.g. Cancelled APAC orders" /></Field>
          <Field label="Dataset" htmlFor="q-ds"><Select id="q-ds" value={qDs} onChange={(e) => setQDs(e.target.value)}>{DATASETS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Filter text" htmlFor="q-f" hint="Optional. Matches any column value, for example EMEA or Cancelled."><Input id="q-f" value={qFilter} onChange={(e) => setQFilter(e.target.value)} /></Field>
        </form>
      </Modal>
    </div>
  )
}
