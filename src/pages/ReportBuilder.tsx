import { useEffect, useState } from 'react'
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, BarChart3, Eye, Hash, Pencil, Table2, Trash2, Type } from 'lucide-react'
import { useStore, uid } from '../lib/store'
import { OPS, TODAY, monthLabel, type Report, type Section, type SectionType } from '../lib/data'
import { DIMS, METRIC_DEFS, breakdown, filterSummary, fmtMetric, kpi, metricDef, monthlySeries, prevWindow, type Dim, type Filters, type MetricKey } from '../lib/analytics'
import { Badge, Banner, Button, Card, DateRangePicker, EmptyState, Field, FilterBar, IconButton, Input, PageHeader, ReadOnlyNote, Segmented, Select, Skeleton, StatusBadge, Textarea, cx } from '../components/ui'
import { BarList, ColumnChart, Donut, LineChart, Sparkline } from '../components/charts'
import { Link, useDirty, useRoute } from '../lib/router'

// ---------- shared section helpers (also used by Reports.tsx exports) ----------
export const SECTION_METRICS: { value: string; label: string }[] = [...METRIC_DEFS.map((m) => ({ value: m.key as string, label: m.label })), { value: 'sla', label: 'SLA Compliance (operations)' }]
export const REPORT_CATEGORIES = ['Executive', 'Sales', 'Finance', 'Operations', 'Customer']
const isSla = (m?: string) => m === 'sla'
const ADDITIVE = ['revenue', 'cost', 'profit', 'target', 'won', 'leads', 'visitors', 'churned', 'netnew']

export function fmtSectionValue(metric: string | undefined, v: number) {
  return isSla(metric) ? `${v.toFixed(1)}%` : fmtMetric(metricDef(metric ?? 'revenue').key, v)
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const opsIn = (start: number, end: number) => OPS.filter((o) => o.m >= start && o.m <= end)

export function dimsFor(metric?: string): { key: string; label: string }[] {
  return isSla(metric) ? [{ key: 'month', label: 'Month' }, { key: 'team', label: 'Team' }] : DIMS
}

export function sectionRows(f: Filters, s: Section): { key: string; value: number; prev?: number }[] | null {
  if (!s.metric || !s.dimension) return null
  const pw = prevWindow(f)
  if (isSla(s.metric)) {
    if (s.dimension === 'month') {
      const out: { key: string; value: number }[] = []
      for (let m = f.start; m <= f.end; m++) out.push({ key: monthLabel(m), value: avg(opsIn(m, m).map((o) => o.sla)) })
      return out
    }
    if (s.dimension === 'team') {
      const teams = [...new Set(OPS.map((o) => o.team))]
      return teams.map((t) => ({ key: t as string, value: avg(opsIn(f.start, f.end).filter((o) => o.team === t).map((o) => o.sla)), prev: avg(opsIn(pw.start, pw.end).filter((o) => o.team === t).map((o) => o.sla)) }))
    }
    return null
  }
  if (s.dimension === 'team') return null
  const key = s.metric as MetricKey
  const cur = breakdown(f, s.dimension as Dim, key)
  if (s.dimension === 'month') return cur
  const prev = breakdown(f, s.dimension as Dim, key, pw.start, pw.end)
  return cur.map((c) => ({ ...c, prev: prev.find((p) => p.key === c.key)?.value }))
}

export function kpiFor(f: Filters, metric: string) {
  const pw = prevWindow(f)
  if (isSla(metric)) {
    const cur = avg(opsIn(f.start, f.end).map((o) => o.sla)), prev = avg(opsIn(pw.start, pw.end).map((o) => o.sla))
    const d = cur - prev
    const spark: number[] = []
    for (let m = f.start; m <= f.end; m++) spark.push(avg(opsIn(m, m).map((o) => o.sla)))
    return { text: `${cur.toFixed(1)}%`, prevText: `${prev.toFixed(1)}%`, deltaText: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pts`, up: d >= 0, good: d >= 0, spark }
  }
  const k = kpi(f, metric as MetricKey)
  return { text: k.text, prevText: k.prevText, deltaText: k.delta.text, up: k.delta.abs >= 0, good: k.delta.good, spark: k.spark }
}

export function validateReport(r: Report): string[] {
  const e: string[] = []
  if (r.name.trim().length < 3) e.push('Give the report a title of at least 3 characters.')
  if (!r.sections.length) e.push('Add at least one section.')
  r.sections.forEach((s, i) => {
    const n = `Section ${i + 1} (${s.title.trim() || 'untitled'})`
    if (!s.title.trim()) e.push(`${n} needs a title.`)
    if (s.type === 'text') { if (!s.text?.trim()) e.push(`${n} has no text.`); return }
    if (!s.metric) e.push(`${n} needs a metric.`)
    if ((s.type === 'chart' || s.type === 'table') && !s.dimension) e.push(`${n} needs a dimension.`)
    if (s.metric && s.dimension && !dimsFor(s.metric).some((d) => d.key === s.dimension)) e.push(`${n}: the dimension "${s.dimension}" is not available for this metric.`)
  })
  return e
}

// ---------- preview renderers ----------
function KpiBody({ f, s }: { f: Filters; s: Section }) {
  if (!s.metric) return <p className="text-xs text-muted">Choose a metric to preview this KPI.</p>
  const k = kpiFor(f, s.metric)
  const Arrow = k.up ? ArrowUpRight : ArrowDownRight
  return (
    <div>
      <p className="tnum text-[24px] font-semibold leading-8 tracking-tight text-ink">{k.text}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div>
          <span className={cx('inline-flex items-center gap-0.5 text-xs font-semibold', k.good ? 'text-success' : 'text-danger')}><Arrow className="size-3.5" aria-hidden /><span className="sr-only">{k.up ? 'Up' : 'Down'} </span>{k.deltaText}</span>
          <p className="text-[11px] text-muted">vs {k.prevText} in previous period</p>
        </div>
        <Sparkline data={k.spark} good={k.good} />
      </div>
    </div>
  )
}

function ChartBody({ f, s }: { f: Filters; s: Section }) {
  const rows = sectionRows(f, s)
  if (!rows) return <p className="text-xs text-muted">Choose a valid metric and dimension to preview this chart.</p>
  if (!rows.length) return <p className="text-xs text-muted">No data for the selected filters.</p>
  const fmt = (v: number) => fmtSectionValue(s.metric, v)
  const label = `${s.title}: ${metricDef(s.metric ?? 'revenue').label} by ${s.dimension}`
  if (s.dimension === 'month') {
    if (s.chart === 'line' || !s.chart) return <LineChart ariaLabel={label} labels={rows.map((r) => r.key)} format={fmt} height={200} series={[{ name: s.title, values: rows.map((r) => r.value), color: 'var(--c1)', area: true }]} />
    return <ColumnChart ariaLabel={label} data={rows.map((r) => ({ label: r.key, value: r.value }))} format={fmt} height={200} />
  }
  if (s.chart === 'donut') return <Donut ariaLabel={label} data={rows.map((r) => ({ label: r.key, value: Math.max(0, r.value) }))} format={fmt} />
  return <BarList ariaLabel={label} data={rows.map((r) => ({ label: r.key, value: Math.max(0, r.value) }))} format={fmt} colors />
}

function TableBody({ f, s }: { f: Filters; s: Section }) {
  const rows = sectionRows(f, s)
  if (!rows) return <p className="text-xs text-muted">Choose a valid metric and dimension to preview this table.</p>
  if (!rows.length) return <p className="text-xs text-muted">No data for the selected filters.</p>
  const total = rows.reduce((a, r) => a + r.value, 0)
  const share = ADDITIVE.includes(s.metric ?? '')
  const hasPrev = rows.some((r) => r.prev !== undefined)
  const def = metricDef(s.metric ?? 'revenue')
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{s.title}</caption>
        <thead><tr className="border-y border-line bg-sunken text-xs text-muted">
          <th scope="col" className="px-3 py-1.5 text-left font-medium">{dimsFor(s.metric).find((d) => d.key === s.dimension)?.label ?? 'Group'}</th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">{isSla(s.metric) ? 'SLA compliance' : def.label}</th>
          {hasPrev && <th scope="col" className="px-3 py-1.5 text-right font-medium">vs previous</th>}
          {share && <th scope="col" className="px-3 py-1.5 text-right font-medium">Share</th>}
        </tr></thead>
        <tbody>{rows.map((r) => {
          const ch = r.prev ? (isSla(s.metric) || def.kind === 'pct' ? r.value - r.prev : r.value / r.prev - 1) : null
          const pts = isSla(s.metric) || def.kind === 'pct'
          const good = ch === null ? true : def.higherIsBetter || isSla(s.metric) ? ch >= 0 : ch <= 0
          return (
            <tr key={r.key} className="border-b border-line last:border-0">
              <td className="px-3 py-1.5 text-ink">{r.key}</td>
              <td className="tnum px-3 py-1.5 text-right text-ink">{fmtSectionValue(s.metric, r.value)}</td>
              {hasPrev && <td className={cx('tnum px-3 py-1.5 text-right', ch === null ? 'text-muted' : good ? 'text-success' : 'text-danger')}>{ch === null ? '—' : pts ? `${ch >= 0 ? '+' : '−'}${Math.abs(isSla(s.metric) ? ch : ch * 100).toFixed(1)} pts` : `${ch >= 0 ? '+' : '−'}${Math.abs(ch * 100).toFixed(1)}%`}</td>}
              {share && <td className="tnum px-3 py-1.5 text-right text-ink-2">{total ? `${((r.value / total) * 100).toFixed(0)}%` : '—'}</td>}
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}

function SectionView({ f, s, active }: { f: Filters; s: Section; active?: boolean }) {
  return (
    <Card title={s.type === 'text' ? undefined : s.title} subtitle={s.type === 'text' ? undefined : s.type === 'kpi' ? 'KPI' : `${metricDef(s.metric ?? 'revenue').label} by ${s.dimension ?? '—'}`} className={cx(s.type === 'kpi' ? 'col-span-2 sm:col-span-1' : 'col-span-2', active && 'ring-2 ring-primary')} pad={s.type !== 'table'}>
      {s.type === 'kpi' && <KpiBody f={f} s={s} />}
      {s.type === 'chart' && <ChartBody f={f} s={s} />}
      {s.type === 'table' && <TableBody f={f} s={s} />}
      {s.type === 'text' && (
        <div>
          {s.title && <h4 className="mb-1 text-[13px] font-semibold text-ink">{s.title}</h4>}
          <p className="whitespace-pre-wrap text-[13px] leading-5 text-ink-2">{s.text?.trim() || 'No text yet.'}</p>
        </div>
      )}
    </Card>
  )
}

const TYPE_META: Record<SectionType, { label: string; icon: typeof Hash; blurb: string }> = {
  kpi: { label: 'KPI', icon: Hash, blurb: 'Single headline number' },
  chart: { label: 'Chart', icon: BarChart3, blurb: 'Line, bar or donut' },
  table: { label: 'Table', icon: Table2, blurb: 'Breakdown with change' },
  text: { label: 'Narrative', icon: Type, blurb: 'Written commentary' },
}

function newSection(type: SectionType): Section {
  const id = uid('s')
  if (type === 'kpi') return { id, type, title: 'Revenue', metric: 'revenue' }
  if (type === 'chart') return { id, type, title: 'Revenue trend', metric: 'revenue', dimension: 'month', chart: 'line' }
  if (type === 'table') return { id, type, title: 'Revenue by region', metric: 'revenue', dimension: 'region' }
  return { id, type, title: 'Commentary', text: '' }
}

function SectionConfig({ s, onChange }: { s: Section; onChange: (p: Partial<Section>) => void }) {
  const dims = dimsFor(s.metric)
  const setMetric = (metric: string) => {
    const ok = dimsFor(metric).some((d) => d.key === s.dimension)
    onChange({ metric, ...(s.type !== 'kpi' && !ok ? { dimension: 'month' } : {}) })
  }
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-line bg-sunken p-3">
      <Field label="Section title" htmlFor={`t-${s.id}`} required error={!s.title.trim() ? 'A title is required.' : undefined}>
        <Input id={`t-${s.id}`} value={s.title} maxLength={80} invalid={!s.title.trim()} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      {s.type !== 'text' && (
        <Field label="Metric" htmlFor={`m-${s.id}`} hint="Computed from the shared analytics, so values match the Executive Overview.">
          <Select id={`m-${s.id}`} value={s.metric ?? ''} onChange={(e) => setMetric(e.target.value)}>{SECTION_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select>
        </Field>
      )}
      {(s.type === 'chart' || s.type === 'table') && (
        <Field label="Group by" htmlFor={`d-${s.id}`}>
          <Select id={`d-${s.id}`} value={s.dimension ?? ''} onChange={(e) => onChange({ dimension: e.target.value })}>{dims.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</Select>
        </Field>
      )}
      {s.type === 'chart' && (
        <Field label="Chart type">
          <Segmented label="Chart type" value={s.chart ?? 'line'} onChange={(v) => onChange({ chart: v })} options={[{ value: 'line', label: 'Line' }, { value: 'bar', label: 'Bar' }, { value: 'donut', label: 'Donut' }]} />
          {s.dimension === 'month' && s.chart === 'donut' && <p className="text-xs text-muted">A donut is not meaningful over time, so a column chart is shown.</p>}
          {s.dimension !== 'month' && s.chart === 'line' && <p className="text-xs text-muted">Lines are for time series, so a bar chart is shown for this grouping.</p>}
        </Field>
      )}
      {s.type === 'text' && (
        <Field label="Narrative" htmlFor={`x-${s.id}`} required error={!s.text?.trim() ? 'Write some text or remove this section.' : undefined}>
          <Textarea id={`x-${s.id}`} value={s.text ?? ''} rows={5} maxLength={1500} invalid={!s.text?.trim()} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      )}
    </div>
  )
}

// ---------- editor ----------
function Editor({ initial, isNew }: { initial: Report; isNew: boolean }) {
  const { setReports, level, log, toast, confirm, filters, setFilters } = useStore()
  const [draft, setDraft] = useState<Report>(initial)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial))
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [announce, setAnnounce] = useState('')
  const dirty = JSON.stringify(draft) !== savedJson
  useDirty(dirty)

  const readOnly = level('reports') !== 'edit' || draft.status === 'Archived'
  const showPreviewOnly = readOnly || preview
  const f = filters
  const nameErr = draft.name.trim().length < 3 ? 'Title must be at least 3 characters.' : undefined

  const patch = (p: Partial<Report>) => setDraft((d) => ({ ...d, ...p }))
  const patchSection = (id: string, p: Partial<Section>) => setDraft((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, ...p } : s)) }))
  const add = (type: SectionType) => {
    const s = newSection(type)
    setDraft((d) => ({ ...d, sections: [...d.sections, s] }))
    setSelected(s.id)
    setAnnounce(`${TYPE_META[type].label} section added at position ${draft.sections.length + 1}.`)
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= draft.sections.length) return
    const title = draft.sections[i].title || 'Untitled section'
    setDraft((d) => { const a = [...d.sections];[a[i], a[j]] = [a[j], a[i]]; return { ...d, sections: a } })
    setAnnounce(`Moved ${title} to position ${j + 1} of ${draft.sections.length}.`)
  }
  const remove = (id: string) => {
    const s = draft.sections.find((x) => x.id === id)
    setDraft((d) => ({ ...d, sections: d.sections.filter((x) => x.id !== id) }))
    if (selected === id) setSelected(null)
    setAnnounce(`Removed ${s?.title || 'section'}.`)
    toast(`Removed section "${s?.title || 'Untitled'}". Discard changes to restore it.`, 'info')
  }

  const persist = (next: Report, verb: string) => {
    const saved: Report = { ...next, updated: TODAY }
    setReports((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...rs]))
    setDraft(saved)
    setSavedJson(JSON.stringify(saved))
    log(isNew ? 'report.create' : verb, saved.name)
    if (isNew) window.location.replace(`#/reports/builder/${saved.id}`)
  }

  const saveDraft = () => {
    if (nameErr) { setErrors([nameErr]); toast('Fix the title before saving.', 'error'); return }
    setErrors([])
    persist(draft, 'report.update')
    toast(draft.status === 'Published' ? 'Changes saved.' : 'Draft saved.')
  }
  const publish = async () => {
    const issues = validateReport(draft)
    setErrors(issues)
    if (issues.length) { toast(`Cannot publish: ${issues.length} issue${issues.length > 1 ? 's' : ''} to fix.`, 'error'); return }
    const ok = await confirm({ title: draft.status === 'Published' ? 'Publish changes?' : 'Publish report?', body: `"${draft.name}" will be available to ${draft.sharedWith.length ? draft.sharedWith.join(', ') : 'its owner only until it is shared'}. You can archive it later from the Reports library.`, confirmLabel: 'Publish' })
    if (!ok) return
    persist({ ...draft, status: 'Published' }, 'report.publish')
    toast(`Published "${draft.name}".`)
  }
  const discard = async () => {
    if (!dirty && !isNew) { window.location.hash = '/reports'; return }
    const ok = await confirm({ title: isNew ? 'Discard this new report?' : 'Discard unsaved changes?', body: isNew ? 'The report has not been saved and will be lost.' : 'Your edits since the last save will be lost.', confirmLabel: 'Discard', danger: true })
    if (!ok) return
    if (isNew) { window.location.hash = '/reports'; return }
    setDraft(JSON.parse(savedJson))
    setSelected(null); setErrors([])
    toast('Changes discarded.', 'info')
  }

  return (
    <div>
      <PageHeader title={draft.name.trim() || 'Untitled report'} crumbs={[{ label: 'Reports', to: '/reports' }, { label: isNew ? 'New report' : 'Report builder' }]}
        description={`${draft.category} · owner ${draft.owner} · ${draft.sections.length} section${draft.sections.length === 1 ? '' : 's'}`}
        badge={<span className="flex items-center gap-1.5"><StatusBadge status={draft.status} />{dirty && <Badge tone="warning">Unsaved changes</Badge>}</span>}
        actions={<>
          {!readOnly && <Segmented label="Builder mode" value={preview ? 'preview' : 'edit'} onChange={(v) => setPreview(v === 'preview')} options={[{ value: 'edit', label: <><Pencil className="size-3.5" aria-hidden />Edit</> }, { value: 'preview', label: <><Eye className="size-3.5" aria-hidden />Preview</> }]} />}
          {!readOnly && <Button onClick={discard} variant="ghost">Discard</Button>}
          {!readOnly && <Button onClick={saveDraft} disabled={!dirty && !isNew}>{draft.status === 'Draft' ? 'Save draft' : 'Save changes'}</Button>}
          {!readOnly && <Button variant="primary" onClick={publish}>{draft.status === 'Published' ? 'Publish changes' : 'Publish'}</Button>}
          {readOnly && <Link to="/reports" className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium text-ink hover:bg-sunken">Back to reports</Link>}
        </>} />

      {level('reports') !== 'edit' && <ReadOnlyNote page="reports" />}
      {level('reports') === 'edit' && draft.status === 'Archived' && <div className="mb-4"><Banner tone="info" title="Archived report">Archived reports are read-only. Restore it from the Reports library to edit.</Banner></div>}
      {errors.length > 0 && (
        <div className="mb-4"><Banner tone="danger" title={`Fix ${errors.length} issue${errors.length > 1 ? 's' : ''} before publishing`}>
          <ul className="mt-1 list-disc pl-4 text-[13px]">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Banner></div>
      )}
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>

      <div className={cx('grid gap-4', !showPreviewOnly && 'xl:grid-cols-12')}>
        {!showPreviewOnly && (
          <div className="flex flex-col gap-4 xl:col-span-5">
            <Card title="Report details">
              <div className="flex flex-col gap-3">
                <Field label="Title" htmlFor="rb-title" required error={nameErr}>
                  <Input id="rb-title" value={draft.name} maxLength={80} invalid={Boolean(nameErr)} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Q4 Executive Review" />
                </Field>
                <Field label="Category" htmlFor="rb-cat">
                  <Select id="rb-cat" value={draft.category} onChange={(e) => patch({ category: e.target.value })}>{[...new Set([...REPORT_CATEGORIES, draft.category])].map((c) => <option key={c}>{c}</option>)}</Select>
                </Field>
                <Field label="Description" htmlFor="rb-desc" hint={`${draft.description.length}/300`}>
                  <Textarea id="rb-desc" value={draft.description} maxLength={300} rows={3} onChange={(e) => patch({ description: e.target.value })} />
                </Field>
              </div>
            </Card>

            <Card title="Sections" subtitle="Add sections, then use the arrows to reorder them. Select a section to configure it.">
              <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Add a section">
                {(Object.keys(TYPE_META) as SectionType[]).map((t) => {
                  const I = TYPE_META[t].icon
                  return (
                    <button key={t} type="button" onClick={() => add(t)} className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface p-2 text-left text-[13px] hover:border-primary hover:bg-primary-soft">
                      <I className="size-4 text-primary-ink" aria-hidden /><span><span className="block font-medium text-ink">Add {TYPE_META[t].label}</span><span className="block text-[11px] text-muted">{TYPE_META[t].blurb}</span></span>
                    </button>
                  )
                })}
              </div>
              {draft.sections.length === 0 ? (
                <EmptyState icon={<BarChart3 className="size-5" />} title="No sections yet" body="Add a KPI, chart, table or narrative to start building the report." />
              ) : (
                <ol className="flex flex-col gap-2" aria-label="Report sections">
                  {draft.sections.map((s, i) => {
                    const M = TYPE_META[s.type]
                    const open = selected === s.id
                    return (
                      <li key={s.id} className={cx('rounded-lg border bg-surface p-2', open ? 'border-primary' : 'border-line')}>
                        <div className="flex items-center gap-1">
                          <span className="tnum grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2">{i + 1}</span>
                          <button type="button" aria-expanded={open} onClick={() => setSelected(open ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left">
                            <M.icon className="size-4 shrink-0 text-muted" aria-hidden />
                            <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-ink">{s.title || 'Untitled section'}</span><span className="block text-[11px] text-muted">{M.label}{s.metric ? ` · ${SECTION_METRICS.find((m) => m.value === s.metric)?.label ?? s.metric}` : ''}</span></span>
                          </button>
                          <IconButton label={`Move ${s.title || 'section'} up`} className="size-8" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconButton>
                          <IconButton label={`Move ${s.title || 'section'} down`} className="size-8" disabled={i === draft.sections.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconButton>
                          <IconButton label={`Remove ${s.title || 'section'}`} className="size-8 hover:text-danger" onClick={() => remove(s.id)}><Trash2 className="size-4" /></IconButton>
                        </div>
                        {open && <SectionConfig s={s} onChange={(p) => patchSection(s.id, p)} />}
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>
          </div>
        )}

        <div className={cx(!showPreviewOnly && 'xl:col-span-7')}>
          <Card title={showPreviewOnly ? 'Report preview' : 'Live preview'} subtitle={`${filterSummary(f)} · values come from the shared analytics, same as the Executive Overview`}
            actions={<div className="flex flex-wrap items-center gap-2"><FilterBar filters={f} onChange={setFilters} compact /><DateRangePicker filters={f} onChange={setFilters} /></div>}>
            <div className="mb-3 border-b border-line pb-3">
              <h2 className="text-lg font-semibold text-ink">{draft.name.trim() || 'Untitled report'}</h2>
              {draft.description && <p className="mt-0.5 text-[13px] text-ink-2">{draft.description}</p>}
            </div>
            {draft.sections.length === 0 ? (
              <EmptyState icon={<Eye className="size-5" />} title="Nothing to preview" body={readOnly ? 'This report has no sections.' : 'Sections you add will render here with real data.'} />
            ) : (
              <div className="grid grid-cols-2 gap-3">{draft.sections.map((s) => <SectionView key={s.id} f={f} s={s} active={!showPreviewOnly && selected === s.id} />)}</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Loader({ id }: { id: string }) {
  const { reports, userName } = useStore()
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])
  const isNew = id === 'new'
  const [initial] = useState<Report | undefined>(() => {
    if (isNew) return { id: uid('r'), name: '', category: 'Executive', owner: userName, status: 'Draft', updated: TODAY, schedule: 'None', sharedWith: [], sections: [], runs: [], description: '' }
    const r = reports.find((x) => x.id === id)
    return r ? (JSON.parse(JSON.stringify(r)) as Report) : undefined
  })
  if (loading) return (
    <div aria-busy="true" aria-label="Loading report builder">
      <Skeleton className="mb-2 h-7 w-72" /><Skeleton className="mb-6 h-4 w-96" />
      <div className="grid gap-4 xl:grid-cols-12"><Skeleton className="h-96 rounded-xl xl:col-span-5" /><Skeleton className="h-96 rounded-xl xl:col-span-7" /></div>
    </div>
  )
  if (!initial) return (
    <Card><EmptyState icon={<Eye className="size-5" />} title="Report not found" body="This report may have been deleted or never existed." action={<Link to="/reports" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:bg-primary-hover">Back to reports</Link>} /></Card>
  )
  return <Editor initial={initial} isNew={isNew} />
}

export default function ReportBuilder() {
  const { parts } = useRoute()
  const id = parts[2] || 'new'
  return <Loader key={id} id={id} />
}
