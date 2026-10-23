import { useEffect, useMemo, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'
import { useStore } from '../../lib/store'
import type { Audit as AuditRow } from '../../lib/data'
import { fmtDate } from '../../lib/analytics'
import { AdminNav, Banner, Button, Card, EmptyState, Field, Drawer, Input, Menu, PageHeader, SearchInput, Select, Skeleton, StatusBadge, Table, type Col } from '../../components/ui'

const cat = (a: AuditRow) => a.action.split('.')[0]
const SECRET_RE = /(secret|password|passwd|token|api[_-]?key|credential)/i
const redact = (v: string) => (SECRET_RE.test(v) ? '••• redacted' : v)

// Demo before/after values derived from the event; secrets are never included.
function changeOf(a: AuditRow): { field: string; before: string; after: string }[] {
  if (a.target.includes('→')) { const [l, r] = a.target.split('→'); return [{ field: l.trim(), before: 'previous value', after: r.trim() }] }
  switch (a.action) {
    case 'user.suspend': return [{ field: 'status', before: 'Active', after: 'Suspended' }]
    case 'user.reactivate': return [{ field: 'status', before: 'Suspended', after: 'Active' }]
    case 'user.invite': return [{ field: 'status', before: '(none)', after: 'Invited' }]
    case 'user.remove': return [{ field: 'account', before: 'Present', after: 'Removed' }]
    case 'role.update': return [{ field: 'permissions', before: 'previous matrix', after: 'updated matrix' }]
    case 'report.publish': return [{ field: 'status', before: 'Draft', after: 'Published' }]
    case 'source.pause': return [{ field: 'status', before: 'Connected', after: 'Paused' }]
    case 'source.update': return [{ field: 'connection settings', before: 'previous', after: 'updated (credentials hidden)' }]
    default: return []
  }
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`

export default function Audit() {
  const { audit, log, toast, settings } = useStore()
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [actor, setActor] = useState('All')
  const [category, setCategory] = useState('All')
  const [result, setResult] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<AuditRow | null>(null)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const actors = useMemo(() => [...new Set(audit.map((a) => a.actor))].sort(), [audit])
  const cats = useMemo(() => [...new Set(audit.map(cat))].sort(), [audit])
  const rangeBad = !!from && !!to && from > to

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return audit.filter((a) => (actor === 'All' || a.actor === actor) && (category === 'All' || cat(a) === category) && (result === 'All' || a.result === result)
      && (!from || a.at.slice(0, 10) >= from) && (!to || a.at.slice(0, 10) <= to)
      && (!s || a.actor.toLowerCase().includes(s) || a.action.toLowerCase().includes(s) || a.target.toLowerCase().includes(s) || a.ip.includes(s)))
  }, [audit, q, actor, category, result, from, to])

  const failures = rows.filter((r) => r.result !== 'Success').length
  const uniqueActors = new Set(rows.map((r) => r.actor)).size
  const filtersOn = q || actor !== 'All' || category !== 'All' || result !== 'All' || from || to

  const exportAs = (fmt: 'CSV' | 'JSON') => {
    if (!settings.allowExports) return toast('Exports are disabled in workspace settings.', 'error')
    if (!rows.length) return toast('Nothing to export for the current filters.', 'warning')
    const data = rows.map((r) => ({ id: r.id, at: r.at, actor: r.actor, action: r.action, target: redact(r.target), ip: r.ip, result: r.result }))
    const body = fmt === 'JSON' ? JSON.stringify(data, null, 2) : [Object.keys(data[0]).join(','), ...data.map((d) => Object.values(d).map(csvCell).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([body], { type: fmt === 'JSON' ? 'application/json' : 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `audit-log-2026-10-21.${fmt.toLowerCase()}`; a.click(); URL.revokeObjectURL(url)
    log('audit.export', `${rows.length} events (${fmt})`); toast(`Exported ${rows.length} events as ${fmt}`)
  }

  const cols: Col<AuditRow>[] = [
    { key: 'at', header: 'Time (UTC)', sort: (r) => Date.parse(r.at), render: (r) => <button className="whitespace-nowrap text-left font-medium text-primary-ink hover:underline" onClick={() => setOpen(r)}>{fmtDate(r.at, true)}</button> },
    { key: 'actor', header: 'Actor', sort: (r) => r.actor, render: (r) => r.actor },
    { key: 'action', header: 'Action', sort: (r) => r.action, render: (r) => <code className="rounded bg-sunken px-1.5 py-0.5 text-xs">{r.action}</code> },
    { key: 'target', header: 'Target', sort: (r) => r.target, render: (r) => <span className="block max-w-72 truncate" title={redact(r.target)}>{redact(r.target)}</span> },
    { key: 'ip', header: 'IP address', sort: (r) => r.ip, render: (r) => <span className="tnum text-ink-2">{r.ip}</span> },
    { key: 'result', header: 'Result', sort: (r) => r.result, render: (r) => <StatusBadge status={r.result} /> },
  ]

  const tiles = [{ label: 'Events', value: rows.length }, { label: 'Failures and denials', value: failures }, { label: 'Unique actors', value: uniqueActors }]

  return (
    <div>
      <PageHeader title="Audit logs" description="A record of sign-ins, configuration changes and data access across the workspace." crumbs={[{ label: 'Administration' }, { label: 'Audit logs' }]}
        actions={<Menu label="Export audit log" align="right" trigger={<span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium text-ink hover:bg-sunken"><Download className="size-4" aria-hidden />Export</span>}
          items={[{ label: 'Export as CSV', onSelect: () => exportAs('CSV') }, { label: 'Export as JSON', onSelect: () => exportAs('JSON') }]} />} />
      <AdminNav />
      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-xl">
        {tiles.map((t) => <div key={t.label} className="rounded-lg border border-line bg-surface px-3 py-2"><p className="text-[11px] text-muted">{t.label}</p><p className="tnum text-lg font-semibold leading-6 text-ink">{loading ? '–' : t.value}</p></div>)}
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-end gap-2 px-4 py-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search actor, action, target or IP" label="Search audit log" className="w-64" />
          <Select aria-label="Actor" value={actor} onChange={(e) => setActor(e.target.value)} className="w-40"><option value="All">All actors</option>{actors.map((a) => <option key={a}>{a}</option>)}</Select>
          <Select aria-label="Action category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-40"><option value="All">All categories</option>{cats.map((a) => <option key={a}>{a}</option>)}</Select>
          <Select aria-label="Result" value={result} onChange={(e) => setResult(e.target.value)} className="w-36"><option value="All">All results</option>{['Success', 'Denied', 'Failed'].map((a) => <option key={a}>{a}</option>)}</Select>
          <Field label="From" htmlFor="au-from"><Input id="au-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
          <Field label="To" htmlFor="au-to"><Input id="au-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
          {filtersOn && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setActor('All'); setCategory('All'); setResult('All'); setFrom(''); setTo('') }}>Clear filters</Button>}
        </div>
        {rangeBad && <div className="px-4 pb-3"><Banner tone="danger">The start date must be on or before the end date.</Banner></div>}
        <p className="sr-only" role="status" aria-live="polite">{loading ? 'Loading audit events' : `${rows.length} event${rows.length === 1 ? '' : 's'} match the current filters`}</p>
        {loading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : (
          <Table cols={cols} rows={rangeBad ? [] : rows} rowKey={(r) => r.id} caption="Audit events" initialSort={{ key: 'at', dir: 'desc' }} selectedKey={open?.id}
            empty={<EmptyState icon={<ScrollText className="size-5" />} title="No events match" body="Try widening the date range or clearing filters." />} />
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Retention: audit events are kept for {settings.retentionDays.toLocaleString()} days, then permanently deleted. Exports are themselves recorded in this log. Secrets and credentials are never stored or displayed.</p>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.action ?? ''} description={open ? fmtDate(open.at, true) : undefined}>
        {open && (() => {
          const ch = changeOf(open)
          return (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-xs text-muted">Actor</dt><dd className="text-ink">{open.actor}</dd></div>
                <div><dt className="text-xs text-muted">Result</dt><dd><StatusBadge status={open.result} /></dd></div>
                <div><dt className="text-xs text-muted">Category</dt><dd className="text-ink">{cat(open)}</dd></div>
                <div><dt className="text-xs text-muted">IP address</dt><dd className="tnum text-ink">{open.ip}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-muted">Target</dt><dd className="text-ink">{redact(open.target)}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-muted">Event ID</dt><dd className="font-mono text-xs text-ink-2">{open.id}</dd></div>
              </dl>
              <div>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Changes</h3>
                {ch.length ? (
                  <div className="overflow-hidden rounded-lg border border-line text-[13px]">
                    <div className="grid grid-cols-3 bg-sunken px-3 py-1.5 text-xs font-medium text-muted"><span>Field</span><span>Before</span><span>After</span></div>
                    {ch.map((c) => <div key={c.field} className="grid grid-cols-3 gap-2 border-t border-line px-3 py-2"><span className="text-ink">{redact(c.field)}</span><span className="text-ink-2">{redact(c.before)}</span><span className="text-ink">{redact(c.after)}</span></div>)}
                  </div>
                ) : <p className="text-[13px] text-muted">No field-level changes were recorded for this event.</p>}
                <p className="mt-2 text-xs text-muted">Sensitive values such as passwords, tokens and keys are excluded from audit records.</p>
              </div>
            </div>
          )
        })()}
      </Drawer>
    </div>
  )
}
