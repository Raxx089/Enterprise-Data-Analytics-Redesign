import { useEffect, useMemo, useState } from 'react'
import { Archive, Copy, Download, MoreHorizontal, Plus, Redo2, Save, Share2, Undo2, FolderOpen, BarChart3 } from 'lucide-react'
import { useStore, uid } from '../lib/store'
import { TODAY, monthLabel, type Fact, type SavedAnalysis } from '../lib/data'
import { DIMS, METRIC_DEFS, delta, filterSummary, fmtDate, fmtMetric, fmtMoney, fmtNum, groupBy, metricDef, metricValue, pick, prevWindow, type Dim, type Filters, type MetricKey } from '../lib/analytics'
import { Badge, Banner, Button, Card, Checkbox, DateRangePicker, Drawer, EmptyState, Field, FilterBar, Input, Menu, Modal, NoAccess, PageHeader, ReadOnlyNote, SearchInput, Segmented, Select, Skeleton, Switch, Table, cx, type Col } from '../components/ui'
import { BarList, ColumnChart, Legend, LineChart } from '../components/charts'
import { useDirty, useRoute } from '../lib/router'

type Viz = 'line' | 'column' | 'bar'
type Access = 'private' | 'workspace-view' | 'workspace-edit' | 'external'
interface Calc { on: boolean; num: MetricKey; den: MetricKey }
interface B { metrics: MetricKey[]; dim: Dim; viz: Viz; f: Filters; compare: boolean; calc: Calc }
type Saved = SavedAnalysis & { start?: number; end?: number; viz?: Viz; calc?: Calc; archived?: boolean; access?: Access }
interface Ser { id: string; label: string; fmt: (v: number) => string; calc: (fs: Fact[]) => number }
interface Row { key: string; v: Record<string, number>; p: Record<string, number | undefined>; facts: Fact[] }

const MAX_METRICS = 4
const blank = (f: Filters): B => ({ metrics: ['revenue'], dim: 'month', viz: 'line', f: { ...f }, compare: true, calc: { on: false, num: 'revenue', den: 'leads' } })
const isKey = (k: string): k is MetricKey => METRIC_DEFS.some((m) => m.key === k)
function fromSaved(a: Saved): B {
  const metrics = a.metrics.filter(isKey)
  const dim = (DIMS.some((d) => d.key === a.dimension) ? a.dimension : 'month') as Dim
  return {
    metrics: metrics.length ? metrics : ['revenue'], dim, viz: a.viz ?? (a.chart === 'line' ? 'line' : 'bar'),
    f: { start: a.start ?? 12, end: a.end ?? 23, region: a.region, unit: a.unit }, compare: a.compare, calc: a.calc ?? { on: false, num: 'revenue', den: 'leads' },
  }
}
const fmtRatio = (v: number) => (Number.isFinite(v) ? v.toFixed(Math.abs(v) < 10 ? 3 : 1) : '—')
const nz = (v: number) => (Number.isFinite(v) ? v : 0)
const ACCESS: { value: Access; label: string }[] = [
  { value: 'private', label: 'Only me' }, { value: 'workspace-view', label: 'Workspace members can view' },
  { value: 'workspace-edit', label: 'Workspace members can edit' }, { value: 'external', label: 'Anyone with the link (external)' },
]

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (c: string | number) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const chg = (cur: number, prev: number | undefined) => (prev === undefined || !prev || !Number.isFinite(cur) ? '—' : `${cur >= prev ? '+' : '−'}${Math.abs((cur / prev - 1) * 100).toFixed(1)}%`)

export default function Analytics() {
  const { level, filters, analyses, setAnalyses, userName, log, toast, confirm, settings } = useStore()
  const { query } = useRoute()
  const lvl = level('analytics')
  const canEdit = lvl === 'edit'
  const list = analyses as Saved[]

  const [loading, setLoading] = useState(true)
  const [hist, setHist] = useState<{ past: B[]; cur: B; future: B[] }>(() => ({ past: [], cur: blank(filters), future: [] }))
  const b = hist.cur
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [base, setBase] = useState(() => JSON.stringify(blank(filters)))
  const [plot, setPlot] = useState('')
  const [drill, setDrill] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'updated' | 'name' | 'owner'>('updated')
  const [showArchived, setShowArchived] = useState(false)
  const [nameModal, setNameModal] = useState<{ mode: 'save' | 'copy' | 'rename'; id?: string } | null>(null)
  const [nameVal, setNameVal] = useState('')
  const [nameErr, setNameErr] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareAccess, setShareAccess] = useState<Access>('private')
  const [missing, setMissing] = useState<string | null>(null)

  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const current = list.find((a) => a.id === currentId) ?? null
  const dirty = JSON.stringify(b) !== base
  useDirty(dirty)

  const set = (p: Partial<B>) => setHist((s) => ({ past: [...s.past.slice(-49), s.cur], cur: { ...s.cur, ...p }, future: [] }))
  const undo = () => setHist((s) => (s.past.length ? { past: s.past.slice(0, -1), cur: s.past[s.past.length - 1], future: [s.cur, ...s.future] } : s))
  const redo = () => setHist((s) => (s.future.length ? { past: [...s.past, s.cur], cur: s.future[0], future: s.future.slice(1) } : s))
  const reset = (nb: B, id: string | null) => { setHist({ past: [], cur: nb, future: [] }); setBase(JSON.stringify(nb)); setCurrentId(id); setPlot(''); setMissing(null) }

  const loadSaved = (a: Saved) => reset(fromSaved(a), a.id)
  const guarded = async (fn: () => void) => {
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', body: 'The current analysis has changes that have not been saved.', confirmLabel: 'Discard changes', danger: true }))) return
    fn()
  }

  const openId = query.get('open')
  const isNew = query.get('new')
  useEffect(() => {
    if (loading) return
    if (openId) { const a = list.find((x) => x.id === openId); if (a) loadSaved(a); else setMissing(openId) } else if (isNew) reset(blank(filters), null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, isNew, loading])

  // ----- results -----
  const series = useMemo<Ser[]>(() => {
    const s: Ser[] = b.metrics.map((k) => ({ id: k, label: metricDef(k).label, fmt: (v: number) => fmtMetric(k, v), calc: (fs: Fact[]) => metricValue(fs, k) }))
    if (b.calc.on) s.push({ id: 'calc', label: `${metricDef(b.calc.num).label} ÷ ${metricDef(b.calc.den).label}`, fmt: fmtRatio, calc: (fs) => { const d = metricValue(fs, b.calc.den); return d ? metricValue(fs, b.calc.num) / d : NaN } })
    return s
  }, [b.metrics, b.calc])
  const pw = prevWindow(b.f)
  const rows = useMemo<Row[]>(() => {
    const cur = groupBy(pick(b.f), b.dim)
    const prevG = pw.end < pw.start ? [] : groupBy(pick(b.f, pw.start, pw.end), b.dim)
    return cur.map((g, i) => {
      const pg = b.dim === 'month' ? prevG[i] : prevG.find((x) => x.key === g.key)
      const v: Record<string, number> = {}, p: Record<string, number | undefined> = {}
      series.forEach((s) => { v[s.id] = s.calc(g.facts); p[s.id] = pg ? s.calc(pg.facts) : undefined })
      return { key: g.key, v, p, facts: g.facts }
    })
  }, [b.f, b.dim, series, pw.start, pw.end])
  const totals = useMemo(() => series.map((s) => ({ s, cur: s.calc(pick(b.f)), prev: s.calc(pick(b.f, pw.start, pw.end)) })), [series, b.f, pw.start, pw.end])
  const plotSer = series.find((s) => s.id === plot) ?? series[0]
  const dimLabel = DIMS.find((d) => d.key === b.dim)!.label
  const span = b.f.end - b.f.start + 1

  const drillRow = rows.find((r) => r.key === drill)
  const drillRecords = (drillRow?.facts ?? []).map((x) => ({ k: `${x.m}-${x.region}-${x.unit}`, m: x.m, region: x.region, unit: x.unit, revenue: Math.round(x.revenue), cost: Math.round(x.cost), leads: Math.round(x.leads), won: Math.round(x.won) }))

  // ----- save / share -----
  const toSaved = (id: string, name: string, old?: Saved): Saved => ({
    id, name, dataset: b.metrics.some((k) => ['cost', 'profit', 'margin'].includes(k)) ? 'finance' : 'sales', metrics: b.metrics, dimension: b.dim, chart: b.viz === 'line' ? 'line' : 'bar',
    region: b.f.region, unit: b.f.unit, owner: old?.owner ?? userName, updated: TODAY, compare: b.compare, start: b.f.start, end: b.f.end, viz: b.viz, calc: b.calc, archived: old?.archived, access: old?.access,
  })
  const emptyMetrics = !series.length
  const quickSave = () => {
    if (!current) { openName('save'); return }
    setAnalyses((a) => a.map((x) => (x.id === current.id ? toSaved(x.id, x.name, x as Saved) : x)))
    setBase(JSON.stringify(b)); log('analysis.save', current.name); toast(`Saved "${current.name}".`)
  }
  const openName = (mode: 'save' | 'copy' | 'rename', id?: string) => {
    const target = id ? list.find((x) => x.id === id) : current
    setNameVal(mode === 'copy' ? `${target?.name ?? 'Untitled analysis'} (copy)` : mode === 'rename' ? target?.name ?? '' : '')
    setNameErr(''); setNameModal({ mode, id })
  }
  const submitName = () => {
    const name = nameVal.trim()
    if (!name) { setNameErr('Enter a name for this analysis.'); return }
    if (name.length > 80) { setNameErr('Use 80 characters or fewer.'); return }
    if (list.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== nameModal?.id)) { setNameErr('An analysis with this name already exists.'); return }
    const m = nameModal!
    if (m.mode === 'rename') {
      setAnalyses((a) => a.map((x) => (x.id === m.id ? { ...x, name, updated: TODAY } : x)))
      log('analysis.rename', name); toast('Analysis renamed.')
    } else {
      const id = uid('an')
      setAnalyses((a) => [toSaved(id, name, m.mode === 'copy' ? undefined : (current ?? undefined)), ...a])
      setCurrentId(id); setBase(JSON.stringify(b)); log(m.mode === 'copy' ? 'analysis.duplicate' : 'analysis.create', name)
      toast(m.mode === 'copy' ? `Saved a copy as "${name}".` : `Saved "${name}".`)
    }
    setNameModal(null)
  }
  const duplicateItem = (a: Saved) => {
    const id = uid('an'); const name = `${a.name} (copy)`
    setAnalyses((x) => [{ ...a, id, name, owner: userName, updated: TODAY, archived: false, access: 'private' } as Saved, ...x])
    log('analysis.duplicate', name); toast(`Duplicated as "${name}".`)
  }
  const archiveItem = (a: Saved) => {
    setAnalyses((x) => x.map((y) => (y.id === a.id ? ({ ...y, archived: !a.archived, updated: TODAY } as Saved) : y)))
    log(a.archived ? 'analysis.restore' : 'analysis.archive', a.name); toast(a.archived ? `Restored "${a.name}".` : `Archived "${a.name}".`)
  }
  const deleteItem = async (a: Saved) => {
    if (!(await confirm({ title: `Delete "${a.name}"?`, body: 'This analysis will be permanently removed. Reports or decisions linking to it will no longer open it.', confirmLabel: 'Delete analysis', danger: true }))) return
    setAnalyses((x) => x.filter((y) => y.id !== a.id))
    if (a.id === currentId) reset(blank(filters), null)
    log('analysis.delete', a.name); toast(`Deleted "${a.name}".`)
  }
  const exportCsv = () => {
    if (!settings.allowExports) { toast('Exports are disabled by workspace settings.', 'error'); return }
    const head = [dimLabel, ...series.flatMap((s) => (b.compare ? [s.label, `${s.label} (previous period)`] : [s.label]))]
    const body = rows.map((r) => [r.key, ...series.flatMap((s) => (b.compare ? [+nz(r.v[s.id]).toFixed(4), r.p[s.id] === undefined ? '' : +nz(r.p[s.id]!).toFixed(4)] : [+nz(r.v[s.id]).toFixed(4)]))])
    downloadCsv(`${(current?.name ?? 'analysis').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, [head, ...body])
    log('analysis.export', current?.name ?? 'Untitled analysis (CSV)'); toast('CSV exported.')
  }
  const exportDrill = () => {
    if (!settings.allowExports) { toast('Exports are disabled by workspace settings.', 'error'); return }
    downloadCsv(`records-${drill}.csv`.replace(/\s+/g, '-'), [['Month', 'Region', 'Business unit', 'Revenue ($K)', 'Cost ($K)', 'Leads', 'New customers'], ...drillRecords.map((r) => [monthLabel(r.m, true), r.region, r.unit, r.revenue, r.cost, r.leads, r.won])])
    log('analysis.export', `${drill} records (CSV)`); toast('Records exported.')
  }
  const link = current ? `${location.origin}${location.pathname}#/analytics?open=${current.id}` : ''
  const openShare = () => {
    if (!current) { toast('Save the analysis before sharing it.', 'info'); openName('save'); return }
    setShareAccess(current.access ?? 'private'); setShareOpen(true)
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copied to clipboard.') } catch { toast('Could not access the clipboard. Select the link and copy it manually.', 'error') }
  }
  const applyShare = () => {
    if (!current) return
    setAnalyses((a) => a.map((x) => (x.id === current.id ? ({ ...x, access: shareAccess } as Saved) : x)))
    log('analysis.share', `${current.name} · ${ACCESS.find((a) => a.value === shareAccess)!.label}`); toast('Sharing settings updated.'); setShareOpen(false)
  }

  const toggleMetric = (k: MetricKey, on: boolean) => {
    if (on && b.metrics.length >= MAX_METRICS) { toast(`Choose up to ${MAX_METRICS} metrics.`, 'warning'); return }
    set({ metrics: on ? [...b.metrics, k] : b.metrics.filter((x) => x !== k) })
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return list.filter((a) => (showArchived || !a.archived) && (!s || a.name.toLowerCase().includes(s) || a.owner.toLowerCase().includes(s)))
      .sort((x, y) => (sort === 'name' ? x.name.localeCompare(y.name) : sort === 'owner' ? x.owner.localeCompare(y.owner) : y.updated.localeCompare(x.updated)))
  }, [list, q, sort, showArchived])

  if (lvl === 'none') return <NoAccess page="Analytics Workspace" />
  if (loading) return (
    <div aria-busy="true" aria-label="Loading analytics workspace">
      <Skeleton className="mb-2 h-7 w-64" /><Skeleton className="mb-6 h-4 w-96" />
      <div className="grid gap-4 xl:grid-cols-12"><Skeleton className="h-96 rounded-xl xl:col-span-3" /><Skeleton className="h-96 rounded-xl xl:col-span-9" /></div>
    </div>
  )

  // chart
  const labels = rows.map((r) => r.key)
  const pf = plotSer?.fmt ?? String
  const chart = !plotSer ? null : b.viz === 'line' ? (
    <LineChart labels={labels} format={pf} height={280} ariaLabel={`${plotSer.label} by ${dimLabel.toLowerCase()}${b.compare ? ' compared with the previous period' : ''}`} onPoint={(i) => setDrill(rows[i].key)}
      series={[{ name: plotSer.label, color: 'var(--c1)', area: true, values: rows.map((r) => (Number.isFinite(r.v[plotSer.id]) ? r.v[plotSer.id] : null)) },
        ...(b.compare ? [{ name: 'Previous period', color: 'var(--c5)', dashed: true, width: 1.6, values: rows.map((r) => (r.p[plotSer.id] !== undefined && Number.isFinite(r.p[plotSer.id]!) ? r.p[plotSer.id]! : null)) }] : [])]} />
  ) : b.viz === 'column' ? (
    <ColumnChart ariaLabel={`${plotSer.label} by ${dimLabel.toLowerCase()}`} format={pf} targetLabel="Previous period" onBar={(l) => setDrill(l)}
      data={rows.map((r) => ({ label: r.key, value: nz(r.v[plotSer.id]), target: b.compare && r.p[plotSer.id] !== undefined ? nz(r.p[plotSer.id]!) : undefined }))} />
  ) : (
    <BarList ariaLabel={`${plotSer.label} by ${dimLabel.toLowerCase()}`} format={pf} compare={b.compare} compareLabel="Previous period" onBar={(l) => setDrill(l)}
      data={rows.map((r) => ({ label: r.key, value: nz(r.v[plotSer.id]), prev: r.p[plotSer.id] === undefined ? undefined : nz(r.p[plotSer.id]!) }))} />
  )

  const cols: Col<Row>[] = [
    { key: 'dim', header: dimLabel, sort: (r) => (b.dim === 'month' ? rows.indexOf(r) : r.key), render: (r) => <span className="font-medium">{r.key}</span> },
    ...series.flatMap<Col<Row>>((s) => [
      { key: `v-${s.id}`, header: s.label, align: 'right', sort: (r) => nz(r.v[s.id]), render: (r) => s.fmt(r.v[s.id]) },
      ...(b.compare ? [
        { key: `p-${s.id}`, header: `${s.label} prev.`, align: 'right' as const, sort: (r: Row) => nz(r.p[s.id] ?? 0), render: (r: Row) => (r.p[s.id] === undefined ? '—' : s.fmt(r.p[s.id]!)) },
        { key: `d-${s.id}`, header: 'Change', align: 'right' as const, sort: (r: Row) => (r.p[s.id] ? nz(r.v[s.id]) / r.p[s.id]! : 0), render: (r: Row) => <span className={cx(r.p[s.id] !== undefined && nz(r.v[s.id]) < r.p[s.id]! ? 'text-danger' : 'text-success')}>{chg(r.v[s.id], r.p[s.id])}</span> },
      ] : []),
    ]),
  ]

  return (
    <div>
      <PageHeader title="Analytics Workspace" badge={<Badge tone="info">Demo data</Badge>}
        description={current ? <>Editing <b className="text-ink">{current.name}</b>{dirty && <span className="ml-1 text-warning">· unsaved changes</span>}</> : <>Build an analysis from shared metrics. {dirty ? <span className="text-warning">Unsaved changes.</span> : null}</>}
        actions={<>
          <Button icon={<Plus className="size-4" />} onClick={() => guarded(() => reset(blank(filters), null))}>New analysis</Button>
          <Button variant="primary" icon={<Save className="size-4" />} disabled={!canEdit || emptyMetrics || (!!current && !dirty)} onClick={quickSave}>{current ? 'Save' : 'Save analysis'}</Button>
          <Button icon={<Share2 className="size-4" />} onClick={openShare} disabled={!canEdit && !current}>Share</Button>
          <Menu label="More analysis actions" trigger={<span className="inline-flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface hover:bg-sunken"><MoreHorizontal className="size-4" aria-hidden /></span>}
            items={[
              { label: 'Save as copy…', icon: <Copy className="size-4" />, disabled: !canEdit || emptyMetrics, onSelect: () => openName('copy') },
              { label: 'Rename…', disabled: !canEdit || !current, onSelect: () => openName('rename') },
              { label: current?.archived ? 'Restore from archive' : 'Archive', icon: <Archive className="size-4" />, disabled: !canEdit || !current, onSelect: () => current && archiveItem(current) },
              'sep',
              { label: 'Delete…', danger: true, disabled: !canEdit || !current, onSelect: () => current && deleteItem(current) },
            ]} />
        </>} />
      {lvl === 'view' && <ReadOnlyNote page="analyses" />}
      {missing && <div className="mb-4"><Banner tone="danger" title="Analysis not found">No saved analysis has the ID "{missing}". It may have been deleted. Showing a blank workspace instead.</Banner></div>}

      <div className="grid gap-4 xl:grid-cols-12">
        <aside className="xl:col-span-3" aria-label="Saved analyses">
          <Card title="Saved analyses" subtitle={`${shown.length} shown`} pad={false}>
            <div className="space-y-2 px-4 pb-3 pt-3">
              <SearchInput value={q} onChange={setQ} placeholder="Search analyses" label="Search saved analyses" />
              <div className="flex items-center gap-2">
                <Select aria-label="Sort saved analyses" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="flex-1"><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="owner">Owner</option></Select>
              </div>
              <Checkbox checked={showArchived} onChange={setShowArchived} label="Show archived" />
            </div>
            {shown.length === 0 ? <EmptyState icon={<FolderOpen className="size-5" />} title={list.length ? 'No matching analyses' : 'No saved analyses'} body={list.length ? 'Try a different search or show archived analyses.' : 'Build an analysis and save it to see it here.'} /> : (
              <ul className="max-h-[560px] divide-y divide-line overflow-y-auto border-t border-line">
                {shown.map((a) => (
                  <li key={a.id} className={cx('flex items-start gap-1 px-3 py-2.5', a.id === currentId && 'bg-primary-soft')}>
                    <button type="button" className="min-w-0 flex-1 rounded text-left" aria-current={a.id === currentId || undefined} onClick={() => guarded(() => loadSaved(a))}>
                      <span className="block truncate text-[13px] font-medium text-ink">{a.name}</span>
                      <span className="block truncate text-xs text-muted">{a.owner} · {fmtDate(a.updated)}</span>
                      <span className="mt-1 flex flex-wrap gap-1">{a.archived && <Badge>Archived</Badge>}{a.access && a.access !== 'private' && <Badge tone="info">Shared</Badge>}</span>
                    </button>
                    <Menu label={`Actions for ${a.name}`} trigger={<span className="inline-flex size-7 items-center justify-center rounded-md hover:bg-sunken"><MoreHorizontal className="size-4 text-muted" aria-hidden /></span>}
                      items={[
                        { label: 'Open', onSelect: () => guarded(() => loadSaved(a)) },
                        { label: 'Duplicate', disabled: !canEdit, onSelect: () => duplicateItem(a) },
                        { label: 'Rename…', disabled: !canEdit, onSelect: () => openName('rename', a.id) },
                        { label: a.archived ? 'Restore' : 'Archive', disabled: !canEdit, onSelect: () => archiveItem(a) },
                        'sep',
                        { label: 'Delete…', danger: true, disabled: !canEdit, onSelect: () => deleteItem(a) },
                      ]} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>

        <div className="space-y-4 xl:col-span-9">
          <Card title="Query builder" subtitle={`${filterSummary(b.f)}${b.compare ? ` · compared with previous ${span} months` : ''}`}
            actions={<>
              <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={undo} disabled={!hist.past.length} aria-label="Undo builder change">Undo</Button>
              <Button size="sm" variant="ghost" icon={<Redo2 className="size-4" />} onClick={redo} disabled={!hist.future.length} aria-label="Redo builder change">Redo</Button>
            </>}>
            <div className="grid gap-4 lg:grid-cols-2">
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-ink">Metrics <span className="font-normal text-muted">({b.metrics.length}/{MAX_METRICS} selected)</span></legend>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {METRIC_DEFS.map((m) => <Checkbox key={m.key} label={m.label} checked={b.metrics.includes(m.key)} onChange={(on) => toggleMetric(m.key, on)} />)}
                </div>
              </fieldset>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Group by" htmlFor="an-dim"><Select id="an-dim" value={b.dim} onChange={(e) => set({ dim: e.target.value as Dim })}>{DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</Select></Field>
                  <Field label="Visualization"><Segmented label="Chart type" value={b.viz} onChange={(v) => set({ viz: v })} options={[{ value: 'line', label: 'Line' }, { value: 'column', label: 'Column' }, { value: 'bar', label: 'Bar' }]} /></Field>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <FilterBar filters={b.f} onChange={(f) => set({ f })} compact />
                  <DateRangePicker filters={b.f} onChange={(f) => set({ f })} />
                </div>
                <div className="flex items-center gap-2 text-[13px] text-ink"><Switch checked={b.compare} onChange={(v) => set({ compare: v })} label="Compare to previous period" />Compare to previous period</div>
                <div className="rounded-lg border border-line p-3">
                  <div className="flex items-center gap-2 text-[13px] text-ink"><Switch checked={b.calc.on} onChange={(v) => set({ calc: { ...b.calc, on: v } })} label="Add calculated metric" />Calculated metric (ratio)</div>
                  {b.calc.on && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Select aria-label="Numerator metric" value={b.calc.num} onChange={(e) => set({ calc: { ...b.calc, num: e.target.value as MetricKey } })} className="w-44">{METRIC_DEFS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>
                      <span aria-hidden className="text-ink-2">÷</span>
                      <Select aria-label="Denominator metric" value={b.calc.den} onChange={(e) => set({ calc: { ...b.calc, den: e.target.value as MetricKey } })} className="w-44">{METRIC_DEFS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>
                    </div>
                  )}
                  {b.calc.on && b.calc.num === b.calc.den && <p className="mt-1.5 text-xs text-warning">Numerator and denominator are the same metric, so the ratio is always 1.</p>}
                </div>
              </div>
            </div>
          </Card>

          {emptyMetrics ? (
            <Card><EmptyState icon={<BarChart3 className="size-5" />} title="Choose a metric to start" body="Select at least one metric, or turn on a calculated metric, to see results." /></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Period totals">
                {totals.map(({ s, cur, prev }) => {
                  const key = (s.id === 'calc' ? 'revenue' : s.id) as MetricKey
                  const d = delta(key, cur, prev)
                  return (
                    <div key={s.id} className="rounded-xl border border-line bg-surface p-3">
                      <p className="truncate text-xs font-medium text-ink-2">{s.label}</p>
                      <p className="tnum mt-1 text-xl font-semibold text-ink">{s.fmt(cur)}</p>
                      {b.compare && <p className={cx('text-xs font-medium', d.good ? 'text-success' : 'text-danger')}>{s.id === 'calc' ? chg(cur, prev) : d.text} <span className="font-normal text-muted">vs {s.fmt(prev)}</span></p>}
                    </div>
                  )
                })}
              </div>
              <Card title={`${plotSer.label} by ${dimLabel.toLowerCase()}`} subtitle="Select a point or bar to see the underlying records."
                actions={<>
                  {series.length > 1 && <Select aria-label="Metric shown in chart" value={plotSer.id} onChange={(e) => setPlot(e.target.value)} className="w-48">{series.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}
                  {b.compare && b.viz === 'line' && <Legend items={[{ label: 'Current', color: 'var(--c1)' }, { label: 'Previous', color: 'var(--c5)', dashed: true }]} />}
                </>}>
                {rows.length ? chart : <EmptyState title="No data for this selection" body="Try widening the date range or clearing filters." />}
              </Card>
              <Card title="Results table" subtitle={`${rows.length} ${dimLabel.toLowerCase()} rows · click a row to drill down`} pad={false}
                actions={<Button size="sm" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!settings.allowExports}>Export CSV</Button>}>
                <Table caption={`Analysis results grouped by ${dimLabel.toLowerCase()}`} cols={cols} rows={rows} rowKey={(r) => r.key} pageSize={10} onRowClick={(r) => setDrill(r.key)} selectedKey={drill ?? undefined} />
              </Card>
            </>
          )}
        </div>
      </div>

      <Drawer open={drill !== null} onClose={() => setDrill(null)} title={`${drill ?? ''} · underlying records`} description={`${drillRecords.length} fact rows · ${filterSummary(b.f)}`} width="max-w-3xl"
        footer={<><Button icon={<Download className="size-4" />} onClick={exportDrill} disabled={!settings.allowExports}>Export records</Button><Button onClick={() => setDrill(null)}>Close</Button></>}>
        {b.dim === 'category' && <div className="mb-3"><Banner tone="info">Category rows are allocated from each business unit using its product mix, so amounts are shares of the unit totals.</Banner></div>}
        <Table caption="Underlying fact records" rows={drillRecords} rowKey={(r) => r.k} pageSize={10} dense
          cols={[
            { key: 'm', header: 'Month', sort: (r) => r.m, render: (r) => monthLabel(r.m, true) }, { key: 'region', header: 'Region', sort: (r) => r.region }, { key: 'unit', header: 'Business unit', sort: (r) => r.unit },
            { key: 'revenue', header: 'Revenue', align: 'right', sort: (r) => r.revenue, render: (r) => fmtMoney(r.revenue) }, { key: 'cost', header: 'Cost', align: 'right', sort: (r) => r.cost, render: (r) => fmtMoney(r.cost) },
            { key: 'leads', header: 'Leads', align: 'right', sort: (r) => r.leads, render: (r) => fmtNum(r.leads) }, { key: 'won', header: 'Won', align: 'right', sort: (r) => r.won, render: (r) => fmtNum(r.won) },
          ]} />
      </Drawer>

      <Modal open={nameModal !== null} onClose={() => setNameModal(null)} title={nameModal?.mode === 'rename' ? 'Rename analysis' : nameModal?.mode === 'copy' ? 'Save as copy' : 'Save analysis'}
        description={nameModal?.mode === 'rename' ? undefined : 'Saved analyses appear in the list and can be shared.'}
        footer={<><Button onClick={() => setNameModal(null)}>Cancel</Button><Button variant="primary" onClick={submitName}>{nameModal?.mode === 'rename' ? 'Rename' : 'Save'}</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); submitName() }}>
          <Field label="Name" htmlFor="an-name" required error={nameErr}><Input id="an-name" data-autofocus value={nameVal} invalid={!!nameErr} maxLength={100} onChange={(e) => { setNameVal(e.target.value); setNameErr('') }} placeholder="e.g. Revenue by region – Q3" /></Field>
        </form>
      </Modal>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title={`Share "${current?.name ?? ''}"`} description="Anyone you share with sees the last saved version."
        footer={<><Button onClick={() => setShareOpen(false)}>Cancel</Button><Button variant="primary" onClick={applyShare} disabled={!canEdit}>Apply</Button></>}>
        <div className="space-y-4">
          <Field label="Link" htmlFor="an-link">
            <div className="flex gap-2"><Input id="an-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /><Button icon={<Copy className="size-4" />} onClick={copyLink}>Copy link</Button></div>
          </Field>
          <Field label="Access level" htmlFor="an-access" hint={settings.allowExternalShare ? undefined : 'External sharing is disabled in workspace settings.'}>
            <Select id="an-access" value={shareAccess} disabled={!canEdit} onChange={(e) => setShareAccess(e.target.value as Access)}>
              {ACCESS.map((a) => <option key={a.value} value={a.value} disabled={a.value === 'external' && !settings.allowExternalShare}>{a.label}</option>)}
            </Select>
          </Field>
          {dirty && <Banner tone="warning">You have unsaved changes. Save first so collaborators see them.</Banner>}
        </div>
      </Modal>
    </div>
  )
}
