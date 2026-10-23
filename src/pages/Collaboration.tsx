import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarDays, CheckCircle2, Link2, MessageSquare, Pencil, Plus, RotateCcw, Trash2, Undo2, Users as UsersIcon, Activity as ActivityIcon, Send } from 'lucide-react'
import { useStore, uid } from '../lib/store'
import { DATASETS, TODAY, type DAction, type Decision, type Msg, type Thread } from '../lib/data'
import { ago, fmtDate } from '../lib/analytics'
import { Avatar, Badge, Banner, Button, Card, Drawer, EmptyState, Field, IconButton, Input, Modal, PageHeader, ProgressBar, ReadOnlyNote, SearchInput, Select, Skeleton, StatusBadge, Table, Tabs, Textarea, cx } from '../components/ui'
import { Link, go, useDirty, useRoute } from '../lib/router'

const STATUSES: Decision['status'][] = ['Proposed', 'Approved', 'In progress', 'Done', 'Rejected']
const isClosed = (s: Decision['status']) => s === 'Done' || s === 'Rejected'
const overdue = (due: string, s: Decision['status']) => !isClosed(s) && due < TODAY
const nextId = (ds: Decision[]) => `D-${Math.max(0, ...ds.map((d) => +d.id.replace(/\D/g, '') || 0)) + 1}`
const pct = (acts: DAction[]) => (acts.length ? Math.round((acts.filter((a) => a.done).length / acts.length) * 100) : 0)
const linkTo = (href: string) => href.replace(/^#/, '')

interface Evi { label: string; href: string }

// ---------- evidence picker ----------
function useEvidenceOptions() {
  const { reports, analyses } = useStore()
  return useMemo(() => ({
    Datasets: DATASETS.map((d) => ({ label: `${d.name} (dataset)`, href: `#/explore/${d.id}` })),
    Reports: reports.map((r) => ({ label: `${r.name} (report)`, href: `#/reports/builder/${r.id}` })),
    Analyses: analyses.map((a) => ({ label: `${a.name} (analysis)`, href: '#/analytics' })),
  }), [reports, analyses])
}
function EvidenceSelect({ onPick, label = 'Attach evidence' }: { onPick: (e: Evi) => void; label?: string }) {
  const opts = useEvidenceOptions()
  return (
    <Select aria-label={label} value="" onChange={(e) => { const [g, i] = e.target.value.split(':'); const o = opts[g as keyof typeof opts]?.[+i]; if (o) onPick(o) }}>
      <option value="">{label}…</option>
      {(Object.keys(opts) as (keyof typeof opts)[]).map((g) => <optgroup key={g} label={g}>{opts[g].map((o, i) => <option key={o.href + i} value={`${g}:${i}`}>{o.label}</option>)}</optgroup>)}
    </Select>
  )
}

// ---------- @mention textarea ----------
function MentionBox({ id, value, onChange, names, placeholder, invalid, onSubmit, rows = 3 }: { id: string; value: string; onChange: (v: string) => void; names: string[]; placeholder?: string; invalid?: boolean; onSubmit?: () => void; rows?: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const getTa = () => wrap.current?.querySelector('textarea') ?? null
  const listId = useId()
  const [caret, setCaret] = useState(0)
  const [idx, setIdx] = useState(0)
  const [closed, setClosed] = useState(false)
  const before = value.slice(0, caret)
  const m = /(?:^|\s)@([A-Za-z]*(?: [A-Za-z]*)?)$/.exec(before)
  const opts = m && !closed ? names.filter((n) => n.toLowerCase().includes(m[1].toLowerCase())).slice(0, 5) : []
  const open = opts.length > 0
  const choose = (n: string) => {
    if (!m) return
    const start = before.length - (m[1].length + 1)
    const nv = value.slice(0, start) + '@' + n + ' ' + value.slice(caret)
    const pos = start + n.length + 2
    onChange(nv); setCaret(pos); setIdx(0)
    setTimeout(() => { const ta = getTa(); ta?.focus(); ta?.setSelectionRange(pos, pos) }, 0)
  }
  return (
    <div className="relative" ref={wrap}>
      <Textarea id={id} rows={rows} value={value} invalid={invalid} placeholder={placeholder} role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-autocomplete="list" aria-activedescendant={open ? `${listId}-${idx}` : undefined}
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setIdx(0); setClosed(false) }}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)} onKeyUp={(e) => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) setCaret(e.currentTarget.selectionStart) }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => (i + 1) % opts.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => (i - 1 + opts.length) % opts.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(opts[idx] ?? opts[0]); return }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setClosed(true); return }
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit?.() }
        }} />
      {open && (
        <ul id={listId} role="listbox" aria-label="Mention a teammate" className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-line bg-surface py-1 shadow-xl">
          {opts.map((n, i) => (
            <li key={n} id={`${listId}-${i}`} role="option" aria-selected={i === idx} onMouseDown={(e) => { e.preventDefault(); choose(n) }} className={cx('flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px]', i === idx ? 'bg-primary-soft text-primary-ink' : 'text-ink hover:bg-sunken')}><Avatar name={n} size={20} />{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RichText({ text, names }: { text: string; names: string[] }) {
  const re = useMemo(() => new RegExp(`(\\[\\[[^\\]|]+\\|[^\\]]+\\]\\]${names.length ? `|@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})` : ''})`, 'g'), [names])
  const parts = text.split(re)
  return (
    <>{parts.map((p, i) => {
      const ev = /^\[\[([^\]|]+)\|([^\]]+)\]\]$/.exec(p)
      if (ev) return <Link key={i} to={linkTo(ev[2])} className="inline-flex items-center gap-1 rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info hover:underline"><Link2 className="size-3" aria-hidden />{ev[1]}</Link>
      if (p.startsWith('@') && names.includes(p.slice(1))) return <span key={i} className="rounded bg-primary-soft px-1 font-medium text-primary-ink">{p}</span>
      return <span key={i}>{p}</span>
    })}</>
  )
}

// ---------- decision form ----------
interface DForm { title: string; summary: string; owner: string; due: string; status: Decision['status']; evidence: Evi[] }
const emptyD = (owner: string): DForm => ({ title: '', summary: '', owner, due: '', status: 'Proposed', evidence: [] })

export default function Collaboration() {
  const { users, decisions, setDecisions, threads, setThreads, audit, userName, level, log, toast, confirm } = useStore()
  const canEdit = level('collaboration') === 'edit'
  const route = useRoute()
  const [tab, setTab] = useState<'decisions' | 'discussions' | 'activity'>('decisions')
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])
  const names = useMemo(() => users.filter((u) => u.status !== 'Suspended').map((u) => u.name), [users])

  // ----- decisions state -----
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [selId, setSelId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<DForm>(emptyD(userName))
  const [errs, setErrs] = useState<Partial<Record<keyof DForm, string>>>({})
  const [dirty, setDirty] = useState(false)
  useDirty(formOpen && dirty)
  const [closeOpen, setCloseOpen] = useState(false)
  const [outcome, setOutcome] = useState<'Done' | 'Rejected'>('Done')
  const [closeNote, setCloseNote] = useState('')
  const [act, setAct] = useState({ text: '', owner: '', due: '' })
  const [actErr, setActErr] = useState<{ text?: string; due?: string }>({})

  const sel = decisions.find((d) => d.id === selId) ?? null
  const rows = useMemo(() => decisions.filter((d) => (status === 'All' || d.status === status) && (!q.trim() || `${d.id} ${d.title} ${d.summary} ${d.owner}`.toLowerCase().includes(q.trim().toLowerCase()))), [decisions, q, status])

  const openForm = (d?: Decision) => {
    setEditId(d?.id ?? null)
    setForm(d ? { title: d.title, summary: d.summary, owner: d.owner, due: d.due, status: d.status, evidence: d.evidence } : emptyD(userName))
    setErrs({}); setDirty(false); setFormOpen(true)
  }
  const closeForm = async () => {
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', body: 'The decision form has changes that have not been saved.', confirmLabel: 'Discard', danger: true }))) return
    setFormOpen(false); setDirty(false)
    if (route.query.get('new')) go('/collaboration')
  }
  useEffect(() => {
    if (route.query.get('new') === '1' && !loading && canEdit && !formOpen) { setTab('decisions'); openForm() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.query.get('new'), loading])
  const setF = <K extends keyof DForm>(k: K, v: DForm[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); setErrs((e) => ({ ...e, [k]: undefined })) }
  const submitForm = () => {
    const e: Partial<Record<keyof DForm, string>> = {}
    if (form.title.trim().length < 5) e.title = 'Enter a title of at least 5 characters.'
    if (form.summary.trim().length < 20) e.summary = 'Explain the rationale in at least 20 characters.'
    if (!form.owner) e.owner = 'Choose an owner.'
    if (!form.due) e.due = 'Choose a due date.'
    else if (!editId && form.due < TODAY) e.due = 'The due date cannot be in the past.'
    setErrs(e)
    if (Object.keys(e).length) return
    if (editId) {
      setDecisions((ds) => ds.map((d) => d.id === editId ? { ...d, ...form, title: form.title.trim(), summary: form.summary.trim(), progress: form.status === 'Done' ? 100 : pct(d.actions) } : d))
      log('decision.edit', `${editId} ${form.title.trim()}`); toast(`Decision ${editId} updated.`)
    } else {
      const id = nextId(decisions)
      setDecisions((ds) => [{ id, ...form, title: form.title.trim(), summary: form.summary.trim(), progress: 0, created: TODAY, actions: [] }, ...ds])
      log('decision.create', `${id} ${form.title.trim()}`); toast(`Decision ${id} created.`)
      setSelId(id)
    }
    setFormOpen(false); setDirty(false)
    if (route.query.get('new')) go('/collaboration')
  }
  const patch = (id: string, fn: (d: Decision) => Decision) => setDecisions((ds) => ds.map((d) => (d.id === id ? fn(d) : d)))
  const toggleAction = (d: Decision, a: DAction) => {
    patch(d.id, (x) => { const actions = x.actions.map((y) => (y.id === a.id ? { ...y, done: !y.done } : y)); return { ...x, actions, progress: x.status === 'Done' ? 100 : pct(actions) } })
    log('decision.action', `${d.id}: ${a.text} (${a.done ? 'reopened' : 'completed'})`)
  }
  const addAction = () => {
    if (!sel) return
    const e: { text?: string; due?: string } = {}
    if (act.text.trim().length < 3) e.text = 'Describe the action (3+ characters).'
    if (!act.due) e.due = 'Choose a due date.'
    setActErr(e)
    if (Object.keys(e).length) return
    const a: DAction = { id: uid('a'), text: act.text.trim(), owner: act.owner || sel.owner, due: act.due, done: false }
    patch(sel.id, (x) => { const actions = [...x.actions, a]; return { ...x, actions, progress: x.status === 'Done' ? 100 : pct(actions) } })
    log('decision.action.add', `${sel.id}: ${a.text}`); toast('Action item added.')
    setAct({ text: '', owner: '', due: '' })
  }
  const delAction = async (d: Decision, a: DAction) => {
    if (!(await confirm({ title: 'Delete action item?', body: `"${a.text}" will be removed from ${d.id}.`, confirmLabel: 'Delete', danger: true }))) return
    patch(d.id, (x) => { const actions = x.actions.filter((y) => y.id !== a.id); return { ...x, actions, progress: x.status === 'Done' ? 100 : pct(actions) } })
    log('decision.action.delete', `${d.id}: ${a.text}`); toast('Action item deleted.')
  }
  const doClose = () => {
    if (!sel) return
    if (outcome === 'Rejected' && closeNote.trim().length < 5) { toast('Add a short reason for rejecting this decision.', 'warning'); return }
    patch(sel.id, (x) => ({ ...x, status: outcome, progress: outcome === 'Done' ? 100 : x.progress, summary: closeNote.trim() ? `${x.summary}\n\nClosed (${outcome}): ${closeNote.trim()}` : x.summary }))
    log('decision.close', `${sel.id} ${outcome}`); toast(`Decision ${sel.id} closed as ${outcome}.`)
    setCloseOpen(false); setCloseNote('')
  }
  const reopen = async (d: Decision) => {
    if (!(await confirm({ title: `Reopen ${d.id}?`, body: 'The decision will return to In progress.', confirmLabel: 'Reopen' }))) return
    patch(d.id, (x) => ({ ...x, status: 'In progress', progress: pct(x.actions) })); log('decision.reopen', d.id); toast(`Decision ${d.id} reopened.`)
  }
  const delDecision = async (d: Decision) => {
    if (!(await confirm({ title: `Delete ${d.id}?`, body: `"${d.title}" and its ${d.actions.length} action items will be permanently removed.`, confirmLabel: 'Delete decision', danger: true }))) return
    setDecisions((ds) => ds.filter((x) => x.id !== d.id)); setSelId(null); log('decision.delete', `${d.id} ${d.title}`); toast(`Decision ${d.id} deleted.`)
  }

  // ----- threads state -----
  const [tq, setTq] = useState('')
  const [tf, setTf] = useState<'open' | 'resolved' | 'all'>('open')
  const [thId, setThId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [cErr, setCErr] = useState('')
  const [ntOpen, setNtOpen] = useState(false)
  const [nt, setNt] = useState({ type: 'Report' as Thread['targetType'], target: '', text: '' })
  const [ntErr, setNtErr] = useState<{ target?: string; text?: string }>({})
  const { reports } = useStore()

  const tRows = useMemo(() => threads.filter((t) => (tf === 'all' || (tf === 'open') === !t.resolved) && (!tq.trim() || `${t.target} ${t.messages.map((m) => m.text).join(' ')}`.toLowerCase().includes(tq.trim().toLowerCase()))), [threads, tf, tq])
  const th = threads.find((t) => t.id === thId) ?? tRows[0] ?? null
  const targetOptions: Record<Thread['targetType'], string[]> = {
    Report: reports.map((r) => r.name), Dataset: DATASETS.map((d) => d.name), Decision: decisions.map((d) => `${d.id} ${d.title}`),
    Chart: ['Revenue by region', 'Revenue trend', 'Actual versus target', 'Customer acquisition funnel', 'Forecast versus historical'],
  }
  const addMsg = (tid: string, text: string) => {
    const m: Msg = { id: uid('m'), author: userName, text: text.trim(), at: new Date().toISOString() }
    setThreads((ts) => ts.map((t) => (t.id === tid ? { ...t, messages: [...t.messages, m] } : t)))
    return m
  }
  const mentionsIn = (text: string) => names.filter((n) => text.includes('@' + n))
  const postComment = () => {
    if (!th) return
    const t = comment.trim()
    if (!t) { setCErr('Write a comment before posting.'); return }
    if (t.length > 1000) { setCErr('Comments are limited to 1000 characters.'); return }
    addMsg(th.id, t)
    log('thread.comment', th.target)
    const ms = mentionsIn(t); toast(ms.length ? `Comment posted. Notified ${ms.join(', ')}.` : 'Comment posted.')
    setComment(''); setCErr('')
  }
  const toggleResolve = (t: Thread) => {
    setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, resolved: !x.resolved } : x)))
    log(t.resolved ? 'thread.reopen' : 'thread.resolve', t.target); toast(t.resolved ? 'Thread reopened.' : 'Thread resolved.')
  }
  const delMsg = async (t: Thread, m: Msg) => {
    const last = t.messages.length === 1
    if (!(await confirm({ title: 'Delete your comment?', body: last ? 'This is the only comment, so the whole thread will be deleted.' : 'This comment will be permanently removed.', confirmLabel: 'Delete', danger: true }))) return
    if (last) { setThreads((ts) => ts.filter((x) => x.id !== t.id)); setThId(null) } else setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, messages: x.messages.filter((y) => y.id !== m.id) } : x)))
    log('thread.comment.delete', t.target); toast('Comment deleted.')
  }
  const attach = (e: Evi) => { setComment((c) => `${c}${c && !c.endsWith(' ') ? ' ' : ''}[[${e.label}|${e.href}]] `) }
  const submitThread = () => {
    const e: { target?: string; text?: string } = {}
    if (!nt.target) e.target = 'Choose what this discussion is about.'
    if (nt.text.trim().length < 3) e.text = 'Write the first comment.'
    setNtErr(e)
    if (Object.keys(e).length) return
    const t: Thread = { id: uid('th'), target: nt.target, targetType: nt.type, resolved: false, messages: [{ id: uid('m'), author: userName, text: nt.text.trim(), at: new Date().toISOString() }] }
    setThreads((ts) => [t, ...ts]); setThId(t.id); setTf('open'); setTq('')
    log('thread.create', nt.target); toast('Discussion started.')
    setNtOpen(false); setNt({ type: 'Report', target: '', text: '' })
  }

  // ----- activity -----
  const [akind, setAkind] = useState('All')
  const [amax, setAmax] = useState(15)
  const feed = useMemo(() => {
    const items: { id: string; at: string; actor: string; text: ReactNode; kind: 'Decisions' | 'Discussions' | 'Audit'; href: string }[] = []
    decisions.forEach((d) => {
      items.push({ id: 'dc' + d.id, at: `${d.created}T09:00:00Z`, actor: d.owner, text: <>created decision <b>{d.id}</b>: {d.title}</>, kind: 'Decisions', href: '/collaboration' })
      if (isClosed(d.status)) items.push({ id: 'dx' + d.id, at: `${d.due}T12:00:00Z`, actor: d.owner, text: <>closed decision <b>{d.id}</b> as {d.status}</>, kind: 'Decisions', href: '/collaboration' })
      d.actions.filter((a) => a.done).forEach((a) => items.push({ id: 'da' + a.id, at: `${a.due}T10:00:00Z`, actor: a.owner, text: <>completed action &ldquo;{a.text}&rdquo; on {d.id}</>, kind: 'Decisions', href: '/collaboration' }))
    })
    threads.forEach((t) => t.messages.forEach((m) => items.push({ id: 'tm' + m.id, at: m.at, actor: m.author, text: <>commented on {t.targetType.toLowerCase()} <b>{t.target}</b>{t.resolved ? ' (resolved)' : ''}</>, kind: 'Discussions', href: '/collaboration' })))
    audit.filter((a) => /^(decision|thread|scenario|metric|report|analysis)\./.test(a.action) && !/^(decision|thread)\./.test(a.action) || /^(decision|thread)\./.test(a.action)).forEach((a) => items.push({ id: 'au' + a.id, at: a.at, actor: a.actor, text: <>{a.action.replace('.', ' ')} · {a.target}</>, kind: 'Audit', href: '/audit' }))
    return items.filter((i) => Date.parse(i.at) <= Date.parse('2026-10-21T23:59:59Z') + 86400e3 * 0 || true).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  }, [decisions, threads, audit])
  const feedRows = feed.filter((i) => akind === 'All' || i.kind === akind)

  if (loading) return (
    <div aria-busy="true" aria-label="Loading collaboration">
      <Skeleton className="mb-2 h-7 w-56" /><Skeleton className="mb-6 h-4 w-96" /><Skeleton className="mb-3 h-10 w-80" /><Skeleton className="h-80 rounded-xl" />
    </div>
  )

  const openActions = decisions.reduce((n, d) => n + d.actions.filter((a) => !a.done).length, 0)

  return (
    <div>
      <PageHeader title="Collaboration" description="Record decisions with evidence, discuss reports and charts, and follow what the team is doing."
        actions={canEdit ? (tab === 'discussions' ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setNt({ type: 'Report', target: '', text: '' }); setNtErr({}); setNtOpen(true) }}>New discussion</Button> : <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openForm()}>New decision</Button>) : undefined} />
      {!canEdit && <ReadOnlyNote page="Collaboration" />}

      <Tabs label="Collaboration areas" value={tab} onChange={setTab} tabs={[
        { value: 'decisions', label: <><CheckCircle2 className="size-4" aria-hidden />Decisions</>, count: decisions.filter((d) => !isClosed(d.status)).length },
        { value: 'discussions', label: <><MessageSquare className="size-4" aria-hidden />Discussions</>, count: threads.filter((t) => !t.resolved).length },
        { value: 'activity', label: <><ActivityIcon className="size-4" aria-hidden />Activity</> },
      ]} />

      <div className="mt-4">
        {tab === 'decisions' && (
          <Card pad={false}>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <SearchInput className="w-full sm:w-72" value={q} onChange={setQ} placeholder="Search decisions" label="Search decisions" />
              <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44"><option value="All">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
              {(q || status !== 'All') && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setStatus('All') }}>Clear filters</Button>}
              <span className="ml-auto text-xs text-muted" aria-live="polite">{rows.length} decisions · {openActions} open action items</span>
            </div>
            <Table caption="Decisions" rows={rows} rowKey={(d) => d.id} pageSize={10} selectedKey={selId ?? undefined} onRowClick={(d) => setSelId(d.id)}
              empty={<EmptyState icon={<CheckCircle2 className="size-5" />} title={decisions.length ? 'No decisions match' : 'No decisions yet'} body={decisions.length ? 'Try a different search or status.' : 'Record the first decision so the team can follow it through.'} action={canEdit && !decisions.length ? <Button variant="primary" onClick={() => openForm()}>New decision</Button> : undefined} />}
              cols={[
                { key: 'id', header: 'ID', sort: (d) => d.id, render: (d) => <span className="font-mono text-xs text-ink-2">{d.id}</span> },
                { key: 'title', header: 'Decision', sort: (d) => d.title, render: (d) => <div><button className="text-left font-medium text-primary-ink hover:underline" onClick={(e) => { e.stopPropagation(); setSelId(d.id) }}>{d.title}</button><p className="line-clamp-1 max-w-md text-xs text-muted">{d.summary}</p></div> },
                { key: 'status', header: 'Status', sort: (d) => d.status, render: (d) => <StatusBadge status={d.status} /> },
                { key: 'owner', header: 'Owner', sort: (d) => d.owner },
                { key: 'due', header: 'Due', sort: (d) => d.due, render: (d) => <span className={overdue(d.due, d.status) ? 'font-medium text-danger' : ''}>{fmtDate(d.due)}{overdue(d.due, d.status) && <span className="ml-1.5 text-xs">Overdue</span>}</span> },
                { key: 'progress', header: 'Actions', sort: (d) => d.progress, render: (d) => <div className="w-28"><ProgressBar value={d.progress} tone={d.status === 'Rejected' ? 'danger' : d.progress === 100 ? 'success' : 'primary'} label={`${d.id} progress`} /><p className="mt-1 text-xs text-muted">{d.actions.filter((a) => a.done).length}/{d.actions.length} done</p></div> },
                { key: 'evidence', header: 'Evidence', sort: (d) => d.evidence.length, align: 'right', render: (d) => d.evidence.length },
              ]} />
          </Card>
        )}

        {tab === 'discussions' && (
          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-4" pad={false} title="Threads">
              <div className="space-y-2 p-3">
                <SearchInput value={tq} onChange={setTq} placeholder="Search discussions" label="Search discussions" />
                <div role="group" aria-label="Thread status" className="flex gap-1">
                  {(['open', 'resolved', 'all'] as const).map((f) => <button key={f} type="button" aria-pressed={tf === f} onClick={() => setTf(f)} className={cx('h-7 rounded-md border px-2.5 text-xs font-medium capitalize', tf === f ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line text-ink-2 hover:bg-sunken')}>{f}</button>)}
                </div>
              </div>
              {tRows.length ? (
                <ul className="border-t border-line" aria-label="Discussion threads">
                  {tRows.map((t) => {
                    const last = t.messages[t.messages.length - 1]
                    return (
                      <li key={t.id} className="border-b border-line last:border-0">
                        <button type="button" onClick={() => setThId(t.id)} aria-current={th?.id === t.id || undefined} className={cx('block w-full px-3 py-2.5 text-left hover:bg-sunken', th?.id === t.id && 'bg-primary-soft')}>
                          <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-medium text-ink">{t.target}</span><StatusBadge status={t.resolved ? 'Resolved' : 'Open'} /></div>
                          <p className="mt-0.5 text-xs text-muted">{t.targetType} · {t.messages.length} {t.messages.length === 1 ? 'comment' : 'comments'}{last && ` · ${ago(last.at)}`}</p>
                          {last && <p className="mt-1 line-clamp-2 text-xs text-ink-2">{last.author}: {last.text.replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, '$1')}</p>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : <EmptyState icon={<MessageSquare className="size-5" />} title="No discussions" body={tq || tf !== 'all' ? 'Nothing matches this view.' : 'Start a discussion on a report, chart, dataset or decision.'} action={canEdit ? <Button variant="primary" onClick={() => setNtOpen(true)}>New discussion</Button> : undefined} />}
            </Card>

            <Card className="lg:col-span-8" title={th ? <span className="flex flex-wrap items-center gap-2">{th.target}<Badge>{th.targetType}</Badge><StatusBadge status={th.resolved ? 'Resolved' : 'Open'} /></span> : 'Discussion'} subtitle={th?.annotation ? `Annotation: ${th.annotation}` : undefined}
              actions={th && canEdit ? <Button size="sm" icon={th.resolved ? <Undo2 className="size-3.5" /> : <CheckCircle2 className="size-3.5" />} onClick={() => toggleResolve(th)}>{th.resolved ? 'Reopen' : 'Resolve'}</Button> : undefined}>
              {!th ? <EmptyState icon={<MessageSquare className="size-5" />} title="Select a discussion" body="Choose a thread to read and reply." /> : (
                <div>
                  <ul className="space-y-4" aria-label="Comments">
                    {th.messages.map((m) => (
                      <li key={m.id} className="flex gap-3">
                        <Avatar name={m.author} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px]"><span className="font-semibold text-ink">{m.author}</span> <span className="text-xs text-muted">{ago(m.at)}</span></p>
                          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink"><RichText text={m.text} names={names} /></p>
                        </div>
                        {canEdit && m.author === userName && <IconButton label="Delete comment" className="size-8" onClick={() => delMsg(th, m)}><Trash2 className="size-4" /></IconButton>}
                      </li>
                    ))}
                  </ul>
                  {th.resolved && <div className="mt-4"><Banner tone="success" title="Resolved">Reopen the thread to add more comments.</Banner></div>}
                  {canEdit && !th.resolved && (
                    <form className="mt-5 border-t border-line pt-4" noValidate onSubmit={(e) => { e.preventDefault(); postComment() }}>
                      <Field label="Add a comment" htmlFor="cm-text" error={cErr} hint="Type @ to mention a teammate. Ctrl+Enter to post.">
                        <MentionBox id="cm-text" value={comment} onChange={(v) => { setComment(v); setCErr('') }} names={names} invalid={!!cErr} onSubmit={postComment} placeholder="Share an insight or ask a question" />
                      </Field>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="w-60"><EvidenceSelect onPick={attach} /></div>
                        <Button type="submit" variant="primary" icon={<Send className="size-4" />}>Post comment</Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === 'activity' && (
          <Card title="Team activity" subtitle="Decisions, discussions and related audit events, newest first"
            actions={<Select aria-label="Filter activity" value={akind} onChange={(e) => { setAkind(e.target.value); setAmax(15) }} className="w-40"><option value="All">All activity</option><option>Decisions</option><option>Discussions</option><option>Audit</option></Select>}>
            {feedRows.length ? (
              <>
                <ol className="space-y-3" aria-label="Activity feed">
                  {feedRows.slice(0, amax).map((i) => (
                    <li key={i.id} className="flex items-start gap-3 text-[13px]">
                      <Avatar name={i.actor} />
                      <div className="min-w-0 flex-1"><p className="text-ink"><b>{i.actor}</b> {i.text}</p><p className="text-xs text-muted">{ago(i.at)} · <Link to={i.href} className="text-primary-ink hover:underline">{i.kind}</Link></p></div>
                    </li>
                  ))}
                </ol>
                {feedRows.length > amax && <div className="mt-4"><Button onClick={() => setAmax((n) => n + 15)}>Show more ({feedRows.length - amax} remaining)</Button></div>}
              </>
            ) : <EmptyState icon={<UsersIcon className="size-5" />} title="No activity" body="Nothing has happened in this category yet." />}
          </Card>
        )}
      </div>

      {/* decision detail */}
      <Drawer open={!!sel} onClose={() => setSelId(null)} title={sel ? `${sel.id} · ${sel.title}` : ''} width="max-w-2xl"
        footer={sel && canEdit && <>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => delDecision(sel)}>Delete</Button>
          <Button icon={<Pencil className="size-4" />} onClick={() => openForm(sel)}>Edit</Button>
          {isClosed(sel.status) ? <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => reopen(sel)}>Reopen</Button> : <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => { setOutcome('Done'); setCloseNote(''); setCloseOpen(true) }}>Close decision</Button>}
        </>}>
        {sel && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={sel.status} />{overdue(sel.due, sel.status) && <Badge tone="danger">Overdue</Badge>}</div>
            <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
              <div><dt className="text-xs text-muted">Owner</dt><dd className="flex items-center gap-1.5 text-ink"><Avatar name={sel.owner} size={20} />{sel.owner}</dd></div>
              <div><dt className="text-xs text-muted">Due</dt><dd className="text-ink">{fmtDate(sel.due)}</dd></div>
              <div><dt className="text-xs text-muted">Created</dt><dd className="text-ink">{fmtDate(sel.created)}</dd></div>
            </dl>
            <section><h3 className="mb-1 text-[13px] font-semibold text-ink">Rationale</h3><p className="whitespace-pre-wrap text-[13px] text-ink-2">{sel.summary}</p></section>
            <section><h3 className="mb-1.5 text-[13px] font-semibold text-ink">Progress</h3><ProgressBar value={sel.progress} tone={sel.progress === 100 ? 'success' : 'primary'} label="Decision progress" /><p className="mt-1 text-xs text-muted">{sel.progress}% · {sel.actions.filter((a) => a.done).length} of {sel.actions.length} action items complete</p></section>
            <section><h3 className="mb-1.5 text-[13px] font-semibold text-ink">Evidence</h3>
              {sel.evidence.length ? <ul className="space-y-1">{sel.evidence.map((e, i) => <li key={e.href + i}><Link to={linkTo(e.href)} className="inline-flex items-center gap-1.5 text-[13px] text-primary-ink hover:underline"><Link2 className="size-3.5" aria-hidden />{e.label}</Link></li>)}</ul> : <p className="text-xs text-muted">No evidence attached. Edit the decision to link datasets, reports or analyses.</p>}
            </section>
            <section><h3 className="mb-1.5 text-[13px] font-semibold text-ink">Action items</h3>
              {sel.actions.length ? (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {sel.actions.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
                      <input type="checkbox" aria-label={`Mark "${a.text}" ${a.done ? 'incomplete' : 'complete'}`} checked={a.done} disabled={!canEdit} onChange={() => toggleAction(sel, a)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                      <div className="min-w-0 flex-1"><p className={cx('text-[13px]', a.done ? 'text-muted line-through' : 'text-ink')}>{a.text}</p><p className="flex flex-wrap items-center gap-x-3 text-xs text-muted"><span>{a.owner}</span><span className={cx('inline-flex items-center gap-1', !a.done && a.due < TODAY && 'font-medium text-danger')}><CalendarDays className="size-3" aria-hidden />{fmtDate(a.due)}{!a.done && a.due < TODAY && ' (overdue)'}</span></p></div>
                      {canEdit && <IconButton label={`Delete action "${a.text}"`} className="size-7" onClick={() => delAction(sel, a)}><Trash2 className="size-3.5" /></IconButton>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted">No action items yet.</p>}
              {canEdit && (
                <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]" noValidate onSubmit={(e) => { e.preventDefault(); addAction() }}>
                  <Field label="New action" htmlFor="ac-text" error={actErr.text}><Input id="ac-text" value={act.text} invalid={!!actErr.text} onChange={(e) => { setAct({ ...act, text: e.target.value }); setActErr({ ...actErr, text: undefined }) }} placeholder="What needs to happen?" /></Field>
                  <Field label="Owner" htmlFor="ac-owner"><Select id="ac-owner" value={act.owner || sel.owner} onChange={(e) => setAct({ ...act, owner: e.target.value })}>{[...new Set([...names, sel.owner])].map((n) => <option key={n}>{n}</option>)}</Select></Field>
                  <Field label="Due" htmlFor="ac-due" error={actErr.due}><Input id="ac-due" type="date" value={act.due} invalid={!!actErr.due} onChange={(e) => { setAct({ ...act, due: e.target.value }); setActErr({ ...actErr, due: undefined }) }} /></Field>
                  <div className="flex items-end"><Button type="submit" icon={<Plus className="size-4" />}>Add</Button></div>
                </form>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* decision form */}
      <Modal open={formOpen} onClose={closeForm} width="max-w-2xl" title={editId ? `Edit ${editId}` : 'New decision'} description="Record what was decided, who owns it and the evidence behind it."
        footer={<><Button onClick={closeForm}>Cancel</Button><Button variant="primary" onClick={submitForm}>{editId ? 'Save changes' : 'Create decision'}</Button></>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); submitForm() }} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Title" required htmlFor="df-title" error={errs.title}><Input id="df-title" value={form.title} invalid={!!errs.title} onChange={(e) => setF('title', e.target.value)} maxLength={120} /></Field></div>
          <div className="sm:col-span-2"><Field label="Rationale" required htmlFor="df-sum" error={errs.summary} hint="Why this decision, and what data supports it."><Textarea id="df-sum" value={form.summary} invalid={!!errs.summary} onChange={(e) => setF('summary', e.target.value)} /></Field></div>
          <Field label="Owner" required htmlFor="df-owner" error={errs.owner}><Select id="df-owner" value={form.owner} invalid={!!errs.owner} onChange={(e) => setF('owner', e.target.value)}><option value="">Select owner</option>{[...new Set([...names, form.owner].filter(Boolean))].map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field label="Due date" required htmlFor="df-due" error={errs.due}><Input id="df-due" type="date" value={form.due} invalid={!!errs.due} onChange={(e) => setF('due', e.target.value)} /></Field>
          <Field label="Status" htmlFor="df-status"><Select id="df-status" value={form.status} onChange={(e) => setF('status', e.target.value as Decision['status'])}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-ink">Evidence links</p>
            {form.evidence.length > 0 && <ul className="mb-2 flex flex-wrap gap-1.5">{form.evidence.map((e, i) => <li key={e.href + i}><Badge tone="info">{e.label}<button type="button" aria-label={`Remove ${e.label}`} className="ml-1 text-info hover:text-ink" onClick={() => setF('evidence', form.evidence.filter((_, j) => j !== i))}>×</button></Badge></li>)}</ul>}
            <EvidenceSelect label="Add evidence" onPick={(e) => !form.evidence.some((x) => x.href === e.href && x.label === e.label) && setF('evidence', [...form.evidence, e])} />
          </div>
          <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
        </form>
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title={`Close ${sel?.id ?? 'decision'}`} description="Record the outcome. You can reopen it later."
        footer={<><Button onClick={() => setCloseOpen(false)}>Cancel</Button><Button variant="primary" onClick={doClose}>Close decision</Button></>}>
        <div className="space-y-4">
          <Field label="Outcome" htmlFor="cl-out"><Select id="cl-out" value={outcome} onChange={(e) => setOutcome(e.target.value as 'Done' | 'Rejected')}><option value="Done">Done (implemented)</option><option value="Rejected">Rejected</option></Select></Field>
          <Field label={outcome === 'Rejected' ? 'Reason (required)' : 'Closing note (optional)'} htmlFor="cl-note"><Textarea id="cl-note" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} /></Field>
        </div>
      </Modal>

      <Modal open={ntOpen} onClose={() => setNtOpen(false)} title="New discussion" description="Attach the conversation to something in the workspace."
        footer={<><Button onClick={() => setNtOpen(false)}>Cancel</Button><Button variant="primary" onClick={submitThread}>Start discussion</Button></>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); submitThread() }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="About" htmlFor="nt-type"><Select id="nt-type" value={nt.type} onChange={(e) => setNt({ ...nt, type: e.target.value as Thread['targetType'], target: '' })}>{(['Report', 'Chart', 'Dataset', 'Decision'] as const).map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Item" required htmlFor="nt-target" error={ntErr.target}><Select id="nt-target" value={nt.target} invalid={!!ntErr.target} onChange={(e) => { setNt({ ...nt, target: e.target.value }); setNtErr({ ...ntErr, target: undefined }) }}><option value="">Select…</option>{targetOptions[nt.type].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          </div>
          <Field label="First comment" required htmlFor="nt-text" error={ntErr.text} hint="Type @ to mention a teammate."><MentionBox id="nt-text" value={nt.text} names={names} invalid={!!ntErr.text} onChange={(v) => { setNt({ ...nt, text: v }); setNtErr({ ...ntErr, text: undefined }) }} /></Field>
          <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
        </form>
      </Modal>
    </div>
  )
}
