import { useEffect, useMemo, useState } from 'react'
import { Eye, Lock, RotateCcw } from 'lucide-react'
import { useStore } from '../../lib/store'
import { DEFAULT_PERMS, PAGE_LABELS, ROLES, type Level, type PageKey, type Perms, type RoleName } from '../../lib/data'
import { useDirty } from '../../lib/router'
import { AdminNav, Badge, Banner, Button, Card, Modal, PageHeader, ReadOnlyNote, Skeleton, Tooltip, cx } from '../../components/ui'

const DESC: Record<RoleName, string> = {
  Executive: 'Board and leadership view: headline KPIs, reports and AI insights.',
  'Business Analyst': 'Builds analyses, reports and forecasts across revenue and customer data.',
  'Operations Manager': 'Monitors SLA, pipelines health and data quality for operational teams.',
  'Finance Manager': 'Owns financial reporting, forecasts and metric definitions.',
  'Data Engineer': 'Manages sources, pipelines, data quality and the metrics catalog.',
  Administrator: 'Full access including user management, permissions, audit logs and settings.',
}
const PAGES = Object.keys(PAGE_LABELS) as PageKey[]
const LOCKED: PageKey[] = ['users', 'roles']
const isLocked = (r: RoleName, p: PageKey) => r === 'Administrator' && LOCKED.includes(p)
const LEVELS: { v: Level; label: string }[] = [{ v: 'none', label: 'No access' }, { v: 'view', label: 'View' }, { v: 'edit', label: 'Edit' }]
const clone = (p: Perms): Perms => JSON.parse(JSON.stringify(p))

export default function Roles() {
  const { perms, setPerms, users, level, log, toast, confirm, role: current, setRole } = useStore()
  const canEdit = level('roles') === 'edit'
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Perms>(() => clone(perms))
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const diff = useMemo(() => {
    const out: { role: RoleName; page: PageKey; from: Level; to: Level }[] = []
    ROLES.forEach((r) => PAGES.forEach((p) => { if (draft[r][p] !== perms[r][p]) out.push({ role: r, page: p, from: perms[r][p], to: draft[r][p] }) }))
    return out
  }, [draft, perms])
  const dirty = diff.length > 0
  useDirty(dirty)

  const set = (r: RoleName, p: PageKey, v: Level) => setDraft((d) => ({ ...d, [r]: { ...d[r], [p]: v } }))
  const save = () => {
    setPerms(clone(draft)); log('role.update', `${diff.length} permission change${diff.length > 1 ? 's' : ''} · ${[...new Set(diff.map((d) => d.role))].join(', ')}`)
    toast('Permissions saved'); setReviewing(false)
  }
  const discard = () => { setDraft(clone(perms)); toast('Changes discarded', 'info') }
  const reset = async () => {
    if (!(await confirm({ title: 'Reset permissions to defaults?', body: 'The matrix will be restored to the built-in defaults. You can still review and discard before saving.', confirmLabel: 'Reset to defaults', danger: true }))) return
    setDraft(clone(DEFAULT_PERMS)); toast('Defaults loaded. Review and save to apply.', 'info')
  }
  const preview = async (r: RoleName) => {
    if (r === current) return toast(`You are already viewing as ${r}`, 'info')
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', body: `Switching to ${r} may remove access to this page and unsaved permission edits will be lost.`, confirmLabel: 'Discard and switch', danger: true }))) return
    log('role.preview', r); setRole(r); toast(`Now previewing as ${r}`, 'info')
  }

  const count = (r: RoleName) => users.filter((u) => u.role === r).length
  const summary = (r: RoleName) => ({ edit: PAGES.filter((p) => draft[r][p] === 'edit').length, view: PAGES.filter((p) => draft[r][p] === 'view').length })

  return (
    <div>
      <PageHeader title="Roles and permissions" description="Control what each role can see and change. Permissions apply immediately to everyone assigned the role once saved." crumbs={[{ label: 'Administration' }, { label: 'Roles' }]}
        actions={canEdit ? <Button icon={<RotateCcw className="size-4" />} onClick={reset}>Reset to defaults</Button> : undefined} />
      <AdminNav />
      {!canEdit && <ReadOnlyNote page="roles and permissions" />}
      {dirty && canEdit && (
        <div className="sticky top-0 z-20 mb-4">
          <Banner tone="warning" title={`${diff.length} unsaved permission change${diff.length > 1 ? 's' : ''}`} action={<div className="flex shrink-0 gap-2"><Button size="sm" onClick={discard}>Discard</Button><Button size="sm" variant="primary" onClick={() => setReviewing(true)}>Review and save</Button></div>}>
            Changes are not applied until you save them.
          </Banner>
        </div>
      )}

      {loading ? <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div> : <>
        <Card title="Roles" subtitle="Each user is assigned exactly one role." className="mb-4" pad={false}>
          <ul className="divide-y divide-line">
            {ROLES.map((r) => { const s = summary(r); return (
              <li key={r} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">{r}{r === current && <Badge tone="primary">Current persona</Badge>}</p>
                  <p className="text-xs text-ink-2">{DESC[r]}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-2"><Badge>{count(r)} user{count(r) === 1 ? '' : 's'}</Badge><span>{s.edit} edit · {s.view} view</span></div>
                <Button size="sm" icon={<Eye className="size-3.5" />} onClick={() => preview(r)} aria-label={`Preview as ${r}`}>Preview as role</Button>
              </li>) })}
          </ul>
        </Card>

        <Card title="Permission matrix" subtitle="Choose No access, View or Edit for each role and page. Use the keyboard arrow keys on a dropdown to change its value." pad={false}>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[13px]">
              <caption className="sr-only">Permissions by page and role</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 top-0 z-30 border-b border-line bg-sunken px-3 py-2 text-left text-xs font-medium text-muted">Page</th>
                  {ROLES.map((r) => <th key={r} scope="col" className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-sunken px-3 py-2 text-left text-xs font-medium text-muted">{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {PAGES.map((p) => (
                  <tr key={p} className="group">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-line bg-surface px-3 py-2 text-left font-medium text-ink">{PAGE_LABELS[p]}</th>
                    {ROLES.map((r) => {
                      const v = draft[r][p]
                      const changed = v !== perms[r][p]
                      return (
                        <td key={r} className={cx('border-b border-line px-2 py-1.5', changed && 'bg-warning-soft')}>
                          {isLocked(r, p) ? (
                            <Tooltip text="Locked: Administrators always keep Edit access to Users and Roles so the workspace cannot be locked out." side="bottom">
                              <span tabIndex={0} role="img" aria-label={`${r}, ${PAGE_LABELS[p]}: Edit, locked`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 text-xs text-ink-2"><Lock className="size-3" aria-hidden />Edit</span>
                            </Tooltip>
                          ) : (
                            <select aria-label={`${r}, ${PAGE_LABELS[p]}`} value={v} disabled={!canEdit} onChange={(e) => set(r, p, e.target.value as Level)}
                              className={cx('h-8 w-full min-w-24 rounded-lg border bg-surface px-2 text-xs disabled:opacity-70', v === 'edit' ? 'border-primary text-primary-ink font-medium' : v === 'view' ? 'border-line-strong text-ink' : 'border-line text-muted')}>
                              {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                            </select>
                          )}
                          {changed && <span className="sr-only"> (changed)</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </>}

      <Modal open={reviewing} onClose={() => setReviewing(false)} title="Review permission changes" description={`${diff.length} change${diff.length === 1 ? '' : 's'} across ${new Set(diff.map((d) => d.role)).size} role(s). This will be recorded in the audit log.`} width="max-w-xl"
        footer={<><Button onClick={() => setReviewing(false)}>Keep editing</Button><Button variant="primary" onClick={save}>Save changes</Button></>}>
        <ul className="divide-y divide-line rounded-lg border border-line text-[13px]">
          {diff.map((d) => (
            <li key={d.role + d.page} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-ink"><span className="font-medium">{d.role}</span> · {PAGE_LABELS[d.page]}</span>
              <span className="flex items-center gap-1.5 text-xs"><Badge>{LEVELS.find((l) => l.v === d.from)!.label}</Badge><span aria-label="changes to">→</span><Badge tone={d.to === 'edit' ? 'primary' : d.to === 'view' ? 'info' : 'neutral'}>{LEVELS.find((l) => l.v === d.to)!.label}</Badge></span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
