import { useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, CalendarClock, Copy, Download, FileText, History, LayoutGrid, Link2, List, MoreHorizontal, Pencil, Play, Plus, Share2, Trash2, X } from 'lucide-react'
import { useStore, uid } from '../lib/store'
import { REPORT_TEMPLATES, SEED_USERS, TODAY, type Report, type RunRec } from '../lib/data'
import { filterSummary, fmtDate } from '../lib/analytics'
import { Badge, Banner, Button, Card, Drawer, EmptyState, Field, IconButton, Input, Menu, Modal, PageHeader, Pagination, ReadOnlyNote, SearchInput, Segmented, Select, Skeleton, StatusBadge, Table, Tabs, Textarea, cx } from '../components/ui'
import { Link, go } from '../lib/router'
import { REPORT_CATEGORIES, SECTION_METRICS, fmtSectionValue, kpiFor, sectionRows } from './ReportBuilder'

const DOMAIN = '@halcyon.com'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function download(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ---------- create / edit metadata ----------
function ReportFormModal({ mode, report, templateId, onClose, onSubmit }: { mode: 'create' | 'edit'; report?: Report; templateId?: string; onClose: () => void; onSubmit: (v: { name: string; category: string; description: string; templateId: string }) => void }) {
  const { reports } = useStore()
  const tpl = REPORT_TEMPLATES.find((t) => t.id === templateId)
  const [name, setName] = useState(report?.name ?? (tpl ? tpl.name : ''))
  const [category, setCategory] = useState(report?.category ?? tpl?.category ?? 'Executive')
  const [description, setDescription] = useState(report?.description ?? tpl?.desc ?? '')
  const [tid, setTid] = useState(templateId ?? '')
  const [touched, setTouched] = useState(false)
  const trimmed = name.trim()
  const dup = reports.some((r) => r.id !== report?.id && r.name.toLowerCase() === trimmed.toLowerCase())
  const err = trimmed.length < 3 ? 'Name must be at least 3 characters.' : dup ? 'A report with this name already exists.' : undefined
  const submit = () => { setTouched(true); if (err) return; onSubmit({ name: trimmed, category, description: description.trim(), templateId: tid }) }
  return (
    <Modal open onClose={onClose} title={mode === 'create' ? 'Create report' : 'Edit report details'} description={mode === 'create' ? 'Start blank or from a template. You can add sections in the builder.' : 'Update the name, category and description.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{mode === 'create' ? 'Create and open builder' : 'Save details'}</Button></>}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Report name" htmlFor="rf-name" required error={touched ? err : undefined}><Input id="rf-name" data-autofocus value={name} maxLength={80} invalid={touched && Boolean(err)} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Category" htmlFor="rf-cat"><Select id="rf-cat" value={category} onChange={(e) => setCategory(e.target.value)}>{[...new Set([...REPORT_CATEGORIES, category])].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        {mode === 'create' && (
          <Field label="Template" htmlFor="rf-tpl" hint={tid ? REPORT_TEMPLATES.find((t) => t.id === tid)?.desc : 'Start with an empty report.'}>
            <Select id="rf-tpl" value={tid} onChange={(e) => { setTid(e.target.value); const t = REPORT_TEMPLATES.find((x) => x.id === e.target.value); if (t) { setCategory(t.category); if (!description) setDescription(t.desc) } }}>
              <option value="">Blank report</option>{REPORT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Description" htmlFor="rf-desc" hint={`${description.length}/300`}><Textarea id="rf-desc" value={description} maxLength={300} rows={3} onChange={(e) => setDescription(e.target.value)} /></Field>
      </form>
    </Modal>
  )
}

// ---------- share ----------
function ShareModal({ report, onClose, onSave }: { report: Report; onClose: () => void; onSave: (people: string[], access: string) => void }) {
  const { settings, toast } = useStore()
  const [people, setPeople] = useState(report.sharedWith)
  const [access, setAccess] = useState('Viewer')
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const link = `${window.location.origin}${window.location.pathname}#/reports/builder/${report.id}`
  const add = () => {
    const v = input.trim()
    if (!v) { setErr('Enter a name, team or email address.'); return }
    if (v.includes('@')) {
      if (!EMAIL.test(v)) { setErr('Enter a valid email address.'); return }
      if (!v.toLowerCase().endsWith(DOMAIN) && !settings.allowExternalShare) { setErr('External sharing is disabled by workspace policy. Use a halcyon.com address.'); return }
    }
    if (people.some((p) => p.toLowerCase() === v.toLowerCase())) { setErr('Already shared with this person or team.'); return }
    setPeople([...people, v]); setInput(''); setErr('')
  }
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied to clipboard.') } catch { toast('Copy failed. Select the link and copy it manually.', 'error') } }
  const names = [...SEED_USERS.map((u) => u.name), 'Executive Team', 'Finance', 'Sales Leadership', 'Operations', 'Support']
  return (
    <Modal open onClose={onClose} title={`Share "${report.name}"`} description="People you add can open this report according to the access level."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(people, access)}>Save sharing</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Add people or teams" htmlFor="sh-in" error={err || undefined}>
          <div className="flex gap-2">
            <Input id="sh-in" list="sh-names" data-autofocus value={input} invalid={Boolean(err)} placeholder="Name, team or email" onChange={(e) => { setInput(e.target.value); setErr('') }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
            <datalist id="sh-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
            <Button onClick={add}>Add</Button>
          </div>
        </Field>
        <Field label="Access level" htmlFor="sh-acc" hint="Viewers can read; commenters can also annotate; editors can change sections.">
          <Select id="sh-acc" value={access} onChange={(e) => setAccess(e.target.value)}><option>Viewer</option><option>Commenter</option><option>Editor</option></Select>
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink">Shared with ({people.length})</p>
          {people.length === 0 ? <p className="text-[13px] text-muted">Not shared with anyone yet.</p> : (
            <ul className="flex flex-wrap gap-1.5">{people.map((p) => (
              <li key={p} className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken py-0.5 pl-2.5 pr-1 text-[13px] text-ink">{p}<button type="button" aria-label={`Remove ${p}`} className="grid size-5 place-items-center rounded-full hover:bg-line" onClick={() => setPeople(people.filter((x) => x !== p))}><X className="size-3" /></button></li>
            ))}</ul>
          )}
        </div>
        <Field label="Report link" htmlFor="sh-link" hint="This link contains no secrets. Opening it still requires workspace sign-in and report permission.">
          <div className="flex gap-2"><Input id="sh-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /><Button icon={<Link2 className="size-4" />} onClick={copy}>Copy link</Button></div>
        </Field>
      </div>
    </Modal>
  )
}

// ---------- schedule ----------
function parseSchedule(s: string) {
  const m = /^(Daily|Weekly|Monthly) · (?:([^,]+), )?(\d\d:\d\d)$/.exec(s)
  if (!m) return { freq: 'None', day: 'Mon', dom: 1, time: '07:00' }
  return { freq: m[1], day: WEEKDAYS.includes(m[2]) ? m[2] : 'Mon', dom: parseInt(m[2]) || 1, time: m[3] }
}
function ScheduleModal({ report, onClose, onSave }: { report: Report; onClose: () => void; onSave: (schedule: string, recipients: string[], format: string) => void }) {
  const p = parseSchedule(report.schedule)
  const [freq, setFreq] = useState(p.freq)
  const [day, setDay] = useState(p.day)
  const [dom, setDom] = useState(p.dom)
  const [time, setTime] = useState(p.time)
  const [format, setFormat] = useState('PDF')
  const [rec, setRec] = useState(report.sharedWith.filter((x) => x.includes('@')).join(', '))
  const [touched, setTouched] = useState(false)
  const list = rec.split(/[,;\s]+/).filter(Boolean)
  const errs: Record<string, string> = {}
  if (freq !== 'None') {
    if (report.status !== 'Published') errs.freq = 'Only published reports can be scheduled. Publish it from the builder first.'
    if (!time) errs.time = 'Choose a time.'
    if (!list.length) errs.rec = 'Add at least one recipient email.'
    else { const bad = list.filter((x) => !EMAIL.test(x)); if (bad.length) errs.rec = `Invalid email: ${bad.join(', ')}` }
  }
  const save = () => {
    setTouched(true)
    if (Object.keys(errs).length) return
    const sched = freq === 'None' ? 'None' : freq === 'Daily' ? `Daily · ${time}` : freq === 'Weekly' ? `Weekly · ${day}, ${time}` : `Monthly · ${ord(dom)}, ${time}`
    onSave(sched, list, format)
  }
  return (
    <Modal open onClose={onClose} title="Schedule delivery" description={report.name} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{freq === 'None' ? 'Remove schedule' : 'Save schedule'}</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Frequency" htmlFor="sc-f" error={touched ? errs.freq : undefined}><Select id="sc-f" data-autofocus value={freq} invalid={touched && Boolean(errs.freq)} onChange={(e) => setFreq(e.target.value)}><option>None</option><option>Daily</option><option>Weekly</option><option>Monthly</option></Select></Field>
        {freq !== 'None' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {freq === 'Weekly' && <Field label="Day of week" htmlFor="sc-d"><Select id="sc-d" value={day} onChange={(e) => setDay(e.target.value)}>{WEEKDAYS.map((d) => <option key={d}>{d}</option>)}</Select></Field>}
              {freq === 'Monthly' && <Field label="Day of month" htmlFor="sc-m"><Select id="sc-m" value={dom} onChange={(e) => setDom(+e.target.value)}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ord(d)}</option>)}</Select></Field>}
              <Field label="Time (UTC)" htmlFor="sc-t" error={touched ? errs.time : undefined}><Input id="sc-t" type="time" value={time} onChange={(e) => setTime(e.target.value)} invalid={touched && Boolean(errs.time)} /></Field>
              <Field label="Format" htmlFor="sc-fmt"><Select id="sc-fmt" value={format} onChange={(e) => setFormat(e.target.value)}><option>PDF</option><option>CSV</option></Select></Field>
            </div>
            <Field label="Recipients" htmlFor="sc-r" hint="Comma-separated email addresses." error={touched ? errs.rec : undefined}><Textarea id="sc-r" rows={2} value={rec} invalid={touched && Boolean(errs.rec)} onChange={(e) => setRec(e.target.value)} placeholder="name@halcyon.com, name2@halcyon.com" /></Field>
          </>
        )}
        {freq === 'None' && report.schedule !== 'None' && <Banner tone="warning">Saving will stop the current schedule ({report.schedule}).</Banner>}
      </div>
    </Modal>
  )
}

// ---------- main ----------
type TabKey = 'library' | 'templates'
export default function Reports() {
  const { reports, setReports, level, log, toast, confirm, userName, settings, filters } = useStore()
  const canEdit = level('reports') === 'edit'
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])
  const [tab, setTab] = useState<TabKey>('library')
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [status, setStatus] = useState('All')
  const [owner, setOwner] = useState('All')
  const [sort, setSort] = useState('updated')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(10)
  const [form, setForm] = useState<null | { mode: 'create' | 'edit'; id?: string; templateId?: string }>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const [schedId, setSchedId] = useState<string | null>(null)
  const [runsId, setRunsId] = useState<string | null>(null)
  const [runFormat, setRunFormat] = useState('PDF')

  const owners = useMemo(() => [...new Set(reports.map((r) => r.owner))].sort(), [reports])
  const cats = useMemo(() => [...new Set([...REPORT_CATEGORIES, ...reports.map((r) => r.category)])], [reports])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    const a = reports.filter((r) => (cat === 'All' || r.category === cat) && (status === 'All' || r.status === status) && (owner === 'All' || r.owner === owner)
      && (!t || r.name.toLowerCase().includes(t) || r.description.toLowerCase().includes(t) || r.owner.toLowerCase().includes(t)))
    return a.sort((x, y) => sort === 'name' ? x.name.localeCompare(y.name) : sort === 'owner' ? x.owner.localeCompare(y.owner) : y.updated.localeCompare(x.updated))
  }, [reports, q, cat, status, owner, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const cur = Math.min(page, pages - 1)
  const pageRows = filtered.slice(cur * size, cur * size + size)
  const hasFilters = q !== '' || cat !== 'All' || status !== 'All' || owner !== 'All'
  const clear = () => { setQ(''); setCat('All'); setStatus('All'); setOwner('All'); setPage(0) }
  const byId = (id: string | null) => reports.find((r) => r.id === id)

  const patchReport = (id: string, p: Partial<Report>) => setReports((rs) => rs.map((r) => (r.id === id ? { ...r, ...p, updated: TODAY } : r)))

  const create = (v: { name: string; category: string; description: string; templateId: string }) => {
    const t = REPORT_TEMPLATES.find((x) => x.id === v.templateId)
    const r: Report = { id: uid('r'), name: v.name, category: v.category, owner: userName, status: 'Draft', updated: TODAY, schedule: 'None', sharedWith: [], description: v.description, runs: [], sections: (t?.sections ?? []).map((s) => ({ ...s, id: uid('s') })) }
    setReports((rs) => [r, ...rs]); log('report.create', r.name); setForm(null)
    toast(`Created "${r.name}"${t ? ` from the ${t.name} template` : ''}.`)
    go(`/reports/builder/${r.id}`)
  }
  const saveMeta = (id: string, v: { name: string; category: string; description: string }) => { patchReport(id, v); log('report.update', v.name); setForm(null); toast('Report details updated.') }
  const duplicate = (r: Report) => {
    const c: Report = { ...r, id: uid('r'), name: `${r.name} (copy)`, status: 'Draft', owner: userName, updated: TODAY, schedule: 'None', sharedWith: [], runs: [], sections: r.sections.map((s) => ({ ...s, id: uid('s') })) }
    setReports((rs) => [c, ...rs]); log('report.duplicate', r.name); toast(`Duplicated as "${c.name}".`)
  }
  const archive = (r: Report) => { patchReport(r.id, { status: 'Archived', schedule: 'None' }); log('report.archive', r.name); toast(`Archived "${r.name}". Its schedule was removed.`, 'info') }
  const restore = (r: Report) => { patchReport(r.id, { status: 'Draft' }); log('report.restore', r.name); toast(`Restored "${r.name}" as a draft.`) }
  const remove = async (r: Report) => {
    const ok = await confirm({ title: `Delete "${r.name}"?`, body: 'This permanently deletes the report, its sections and run history. This cannot be undone. Archive it instead to keep a copy.', confirmLabel: 'Delete report', danger: true })
    if (!ok) return
    setReports((rs) => rs.filter((x) => x.id !== r.id)); log('report.delete', r.name); toast(`Deleted "${r.name}".`)
  }

  const exportReport = (r: Report, kind: 'csv' | 'json') => {
    if (!settings.allowExports) { toast('Exports are disabled by workspace policy.', 'error'); return }
    const f = filters
    if (kind === 'json') {
      download(`${slug(r.name)}.json`, 'application/json', JSON.stringify({ ...r, exportedAt: new Date().toISOString(), filters: filterSummary(f) }, null, 2))
    } else {
      const lines = [['section', 'type', 'metric', 'dimension', 'group', 'value', 'previous_value'].map(cell).join(',')]
      r.sections.forEach((s) => {
        if (s.type === 'text') lines.push([s.title, 'text', '', '', '', s.text ?? '', ''].map(cell).join(','))
        else if (s.type === 'kpi' && s.metric) { const k = kpiFor(f, s.metric); lines.push([s.title, 'kpi', s.metric, '', 'Total', k.text, k.prevText].map(cell).join(',')) }
        else (sectionRows(f, s) ?? []).forEach((x) => lines.push([s.title, s.type, s.metric ?? '', s.dimension ?? '', x.key, fmtSectionValue(s.metric, x.value), x.prev === undefined ? '' : fmtSectionValue(s.metric, x.prev)].map(cell).join(',')))
      })
      lines.push('', cell(`Filters: ${filterSummary(f)}`))
      download(`${slug(r.name)}.csv`, 'text/csv', lines.join('\n'))
    }
    log('report.export', `${r.name} (${kind.toUpperCase()})`)
    toast(`Exported ${r.name} as ${kind.toUpperCase()}.`)
  }
  const exportList = () => {
    if (!settings.allowExports) { toast('Exports are disabled by workspace policy.', 'error'); return }
    const lines = [['name', 'category', 'status', 'owner', 'updated', 'schedule', 'sections'].map(cell).join(','), ...filtered.map((r) => [r.name, r.category, r.status, r.owner, r.updated, r.schedule, r.sections.length].map(cell).join(','))]
    download('reports-library.csv', 'text/csv', lines.join('\n')); log('report.export', 'Reports library (CSV)'); toast(`Exported ${filtered.length} reports.`)
  }

  const runNow = (r: Report) => {
    const id = uid('run')
    const dur = 18 + ((r.sections.length * 7 + r.name.length * 3) % 55)
    const run: RunRec = { id, at: `${TODAY}T${new Date().toISOString().slice(11, 19)}Z`, status: 'Running', durationS: 0, trigger: 'Manual', format: runFormat }
    setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, runs: [run, ...x.runs] } : x)))
    log('report.run', r.name)
    setTimeout(() => {
      const ok = r.sections.length > 0
      setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, runs: x.runs.map((u) => (u.id === id ? { ...u, status: ok ? 'Success' : 'Failed', durationS: ok ? dur : 3 } : u)) } : x)))
      toast(ok ? `${r.name} run finished in ${dur}s (simulated ${runFormat}).` : `${r.name} run failed: the report has no sections.`, ok ? 'success' : 'error')
    }, 1600)
  }

  const menuItems = (r: Report) => {
    const arch = r.status === 'Archived'
    return [
      { label: canEdit && !arch ? 'Open in builder' : 'Open', icon: <FileText className="size-4" />, onSelect: () => go(`/reports/builder/${r.id}`) },
      ...(canEdit ? [{ label: 'Edit details', icon: <Pencil className="size-4" />, onSelect: () => setForm({ mode: 'edit', id: r.id }) }, { label: 'Duplicate', icon: <Copy className="size-4" />, onSelect: () => duplicate(r) }] : []),
      'sep' as const,
      { label: 'Run history', icon: <History className="size-4" />, onSelect: () => setRunsId(r.id) },
      ...(canEdit && !arch ? [{ label: 'Share', icon: <Share2 className="size-4" />, onSelect: () => setShareId(r.id) }, { label: 'Schedule', icon: <CalendarClock className="size-4" />, onSelect: () => setSchedId(r.id) }] : []),
      'sep' as const,
      { label: 'Export CSV', icon: <Download className="size-4" />, onSelect: () => exportReport(r, 'csv') },
      { label: 'Export JSON', icon: <Download className="size-4" />, onSelect: () => exportReport(r, 'json') },
      ...(canEdit ? ['sep' as const, arch ? { label: 'Restore', icon: <ArchiveRestore className="size-4" />, onSelect: () => restore(r) } : { label: 'Archive', icon: <Archive className="size-4" />, onSelect: () => archive(r) }, { label: 'Delete', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => remove(r) }] : []),
    ]
  }
  const lastRun = (r: Report) => r.runs[0]
  const kebab = (r: Report) => <Menu label={`Actions for ${r.name}`} trigger={<span className="inline-grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink"><MoreHorizontal className="size-4" /></span>} items={menuItems(r)} />

  if (loading) return (
    <div aria-busy="true" aria-label="Loading reports">
      <Skeleton className="mb-2 h-7 w-48" /><Skeleton className="mb-6 h-4 w-96" /><Skeleton className="mb-4 h-10 w-full rounded-lg" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
    </div>
  )

  const runsReport = byId(runsId)
  const running = runsReport?.runs.some((x) => x.status === 'Running')

  return (
    <div>
      <PageHeader title="Reports" description="Build, schedule and share reports from the same governed metrics as the Executive Overview." badge={<Badge tone="info">Demo data</Badge>}
        actions={<><Button icon={<Download className="size-4" />} onClick={exportList} disabled={!filtered.length}>Export list</Button>{canEdit && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setForm({ mode: 'create' })}>New report</Button>}</>} />
      {!canEdit && <ReadOnlyNote page="reports" />}

      <Tabs label="Reports sections" value={tab} onChange={setTab} tabs={[{ value: 'library', label: 'Library', count: reports.length }, { value: 'templates', label: 'Templates', count: REPORT_TEMPLATES.length }]} />

      {tab === 'templates' ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_TEMPLATES.map((t) => (
            <Card key={t.id} title={t.name} actions={<Badge>{t.category}</Badge>}>
              <p className="text-[13px] text-ink-2">{t.desc}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Sections in this template">{t.sections.map((s) => <li key={s.id}><Badge tone="neutral">{s.type === 'kpi' ? 'KPI' : s.type === 'text' ? 'Narrative' : s.type === 'chart' ? 'Chart' : 'Table'}: {s.title}</Badge></li>)}</ul>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">{t.sections.length} sections</span>
                <Button variant="primary" size="sm" disabled={!canEdit} title={canEdit ? undefined : 'Your role cannot create reports'} onClick={() => setForm({ mode: 'create', templateId: t.id })}>Use template</Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0) }} placeholder="Search reports" label="Search reports" className="w-full sm:w-64" />
            <Select aria-label="Category" value={cat} onChange={(e) => { setCat(e.target.value); setPage(0) }} className="w-36"><option value="All">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
            <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }} className="w-36"><option value="All">All statuses</option><option>Published</option><option>Draft</option><option>Archived</option></Select>
            <Select aria-label="Owner" value={owner} onChange={(e) => { setOwner(e.target.value); setPage(0) }} className="w-40"><option value="All">All owners</option>{owners.map((o) => <option key={o}>{o}</option>)}</Select>
            <Select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)} className="w-44"><option value="updated">Sort: Recently updated</option><option value="name">Sort: Name</option><option value="owner">Sort: Owner</option></Select>
            {hasFilters && <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}
            <div className="ml-auto"><Segmented label="View" value={view} onChange={setView} options={[{ value: 'grid', label: <><LayoutGrid className="size-3.5" aria-hidden />Grid</> }, { value: 'table', label: <><List className="size-3.5" aria-hidden />Table</> }]} /></div>
          </div>
          <p className="mb-3 text-xs text-muted" role="status">{filtered.length} of {reports.length} reports</p>

          {filtered.length === 0 ? (
            <Card><EmptyState icon={<FileText className="size-5" />} title={reports.length ? 'No reports match your filters' : 'No reports yet'} body={reports.length ? 'Try a different search term or clear the filters.' : 'Create a report from scratch or start from a template.'}
              action={hasFilters ? <Button onClick={clear}>Clear filters</Button> : canEdit ? <Button variant="primary" onClick={() => setTab('templates')}>Browse templates</Button> : undefined} /></Card>
          ) : view === 'grid' ? (
            <>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((r) => {
                  const lr = lastRun(r)
                  return (
                    <li key={r.id}>
                      <article className={cx('flex h-full flex-col rounded-xl border border-line bg-surface p-4', r.status === 'Archived' && 'opacity-80')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-[14px] font-semibold leading-5 text-ink"><Link to={`/reports/builder/${r.id}`} className="hover:text-primary-ink hover:underline">{r.name}</Link></h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><StatusBadge status={r.status} /><Badge>{r.category}</Badge></div>
                          </div>
                          {kebab(r)}
                        </div>
                        <p className="mt-2 line-clamp-2 text-[13px] text-ink-2">{r.description || 'No description.'}</p>
                        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 pt-3 text-xs">
                          <div><dt className="text-muted">Owner</dt><dd className="text-ink">{r.owner}</dd></div>
                          <div><dt className="text-muted">Updated</dt><dd className="text-ink">{fmtDate(r.updated)}</dd></div>
                          <div><dt className="text-muted">Schedule</dt><dd className="text-ink">{r.schedule}</dd></div>
                          <div><dt className="text-muted">Last run</dt><dd>{lr ? <StatusBadge status={lr.status} /> : <span className="text-muted">Never</span>}</dd></div>
                        </dl>
                      </article>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3 rounded-xl border border-line bg-surface"><Pagination page={cur} pages={pages} total={filtered.length} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(0) }} /></div>
            </>
          ) : (
            <Card pad={false}>
              <Table caption="Reports library" rows={filtered} rowKey={(r) => r.id} pageSize={10}
                cols={[
                  { key: 'name', header: 'Report', sort: (r) => r.name, render: (r) => <Link to={`/reports/builder/${r.id}`} className="font-medium text-ink hover:text-primary-ink hover:underline">{r.name}</Link> },
                  { key: 'category', header: 'Category', sort: (r) => r.category },
                  { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'owner', header: 'Owner', sort: (r) => r.owner },
                  { key: 'updated', header: 'Updated', sort: (r) => r.updated, render: (r) => fmtDate(r.updated) },
                  { key: 'schedule', header: 'Schedule', render: (r) => <span className="text-ink-2">{r.schedule}</span> },
                  { key: 'actions', header: 'Actions', render: kebab, width: '64px' },
                ]} />
            </Card>
          )}
        </div>
      )}

      {form && (() => {
        const rep = form.mode === 'edit' ? byId(form.id ?? null) : undefined
        return <ReportFormModal key={`${form.mode}-${form.id ?? form.templateId ?? 'new'}`} mode={form.mode} report={rep} templateId={form.templateId} onClose={() => setForm(null)} onSubmit={(v) => (form.mode === 'create' ? create(v) : rep && saveMeta(rep.id, v))} />
      })()}
      {shareId && byId(shareId) && <ShareModal report={byId(shareId)!} onClose={() => setShareId(null)} onSave={(people, access) => { const r = byId(shareId)!; patchReport(r.id, { sharedWith: people }); log('report.share', `${r.name} (${access}, ${people.length} people)`); toast(`Sharing updated for "${r.name}".`); setShareId(null) }} />}
      {schedId && byId(schedId) && <ScheduleModal report={byId(schedId)!} onClose={() => setSchedId(null)} onSave={(sched, rec, fmt) => {
        const r = byId(schedId)!
        patchReport(r.id, { schedule: sched, sharedWith: [...new Set([...r.sharedWith, ...rec])] })
        log('report.schedule', `${r.name} (${sched}${sched === 'None' ? '' : ', ' + fmt})`); toast(sched === 'None' ? 'Schedule removed.' : `Scheduled: ${sched}.`); setSchedId(null)
      }} />}

      <Drawer open={Boolean(runsReport)} onClose={() => setRunsId(null)} title={runsReport ? `Run history · ${runsReport.name}` : ''} description={runsReport ? `${runsReport.schedule === 'None' ? 'Not scheduled' : runsReport.schedule} · ${runsReport.runs.length} runs` : undefined} width="max-w-2xl">
        {runsReport && (
          <div>
            <div className="mb-3 flex flex-wrap items-end gap-2">
              {canEdit && runsReport.status !== 'Archived' && (
                <>
                  <Field label="Format" htmlFor="run-fmt"><Select id="run-fmt" value={runFormat} onChange={(e) => setRunFormat(e.target.value)} className="w-28"><option>PDF</option><option>CSV</option></Select></Field>
                  <Button variant="primary" icon={<Play className="size-4" />} loading={running} disabled={running} onClick={() => runNow(runsReport)}>{running ? 'Running…' : 'Run now'}</Button>
                </>
              )}
              <Badge tone="info">Simulated runs</Badge>
            </div>
            {runsReport.runs.some((x) => x.status === 'Failed') && <div className="mb-3"><Banner tone="warning" title="Some runs failed">Failed runs are usually caused by upstream data issues (for example the stale Finance dataset, DQ-114) or an empty report. Re-run once the data is healthy.</Banner></div>}
            {runsReport.runs.length === 0 ? <EmptyState icon={<History className="size-5" />} title="No runs yet" body={runsReport.status === 'Archived' ? 'Archived reports do not run.' : 'Use Run now to generate the first run.'} /> : (
              <Table caption="Run history" rows={runsReport.runs} rowKey={(r) => r.id} pageSize={5} dense
                cols={[
                  { key: 'at', header: 'Started', render: (r) => fmtDate(r.at, true) },
                  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'dur', header: 'Duration', align: 'right', render: (r) => (r.status === 'Running' ? '—' : `${r.durationS}s`) },
                  { key: 'trigger', header: 'Trigger' }, { key: 'format', header: 'Format' },
                  { key: 'dl', header: '', render: (r) => r.status === 'Success' ? <IconButton label={`Download ${r.format} from ${fmtDate(r.at)}`} className="size-7" onClick={() => exportReport(runsReport, 'csv')}><Download className="size-4" /></IconButton> : null, width: '44px' },
                ]} />
            )}
            <p className="mt-3 text-xs text-muted">Metrics available in reports: {SECTION_METRICS.map((m) => m.label).slice(0, 4).join(', ')} and more. Downloads export the current report content as CSV.</p>
          </div>
        )}
      </Drawer>
    </div>
  )
}
