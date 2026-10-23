import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, ShieldCheck, ShieldOff, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useStore, uid } from '../../lib/store'
import { ROLES, type RoleName, type User } from '../../lib/data'
import { ago, fmtDate } from '../../lib/analytics'
import { AdminNav, Avatar, Badge, Button, Card, Checkbox, Drawer, EmptyState, Field, Input, Menu, Modal, PageHeader, ReadOnlyNote, SearchInput, Select, Skeleton, StatusBadge, Table, type Col } from '../../components/ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const TEAM_SUGGEST = ['Executive Team', 'Revenue Operations', 'Operations', 'Finance', 'Data Platform', 'IT Security', 'Customer Success', 'Customer Support', 'EMEA Sales', 'Product Management']

interface FormState { name: string; email: string; role: RoleName; team: string }

export default function Users() {
  const { users, setUsers, audit, log, toast, confirm, level, userName } = useStore()
  const canEdit = level('users') === 'edit'
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState('All')
  const [statusF, setStatusF] = useState('All')
  const [teamF, setTeamF] = useState('All')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [invite, setInvite] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const teams = useMemo(() => [...new Set(users.map((u) => u.team))].sort(), [users])
  const adminCount = users.filter((u) => u.role === 'Administrator' && u.status !== 'Suspended').length
  const detail = users.find((u) => u.id === detailId) ?? null

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return users.filter((u) => (roleF === 'All' || u.role === roleF) && (statusF === 'All' || u.status === statusF) && (teamF === 'All' || u.team === teamF)
      && (!s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.team.toLowerCase().includes(s)))
  }, [users, q, roleF, statusF, teamF])

  // Returns a reason string if the user may not be removed or deactivated.
  const protectedReason = (u: User, action: 'remove' | 'suspend' | 'demote'): string | null => {
    if (u.name === userName && action !== 'demote') return `You cannot ${action} your own account.`
    if (u.role === 'Administrator' && u.status !== 'Suspended' && adminCount <= 1) return `${u.name} is the last active Administrator.`
    return null
  }

  const patch = (id: string, p: Partial<User>) => setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...p } : u)))

  const suspend = async (u: User) => {
    const why = protectedReason(u, 'suspend')
    if (why) return toast(why, 'error')
    if (!(await confirm({ title: `Suspend ${u.name}?`, body: 'They will be signed out immediately and cannot access the workspace until reactivated.', confirmLabel: 'Suspend', danger: true }))) return
    patch(u.id, { status: 'Suspended' }); log('user.suspend', u.name); toast(`${u.name} suspended`)
  }
  const reactivate = (u: User) => { patch(u.id, { status: 'Active' }); log('user.reactivate', u.name); toast(`${u.name} reactivated`) }
  const resend = (u: User) => { log('user.invite.resend', u.email); toast(`Invitation re-sent to ${u.email}`) }
  const remove = async (u: User) => {
    const why = protectedReason(u, 'remove')
    if (why) return toast(why, 'error')
    if (!(await confirm({ title: `Remove ${u.name}?`, body: 'Their account and access will be deleted. Content they own stays in the workspace. This cannot be undone.', confirmLabel: 'Remove user', danger: true }))) return
    setUsers((us) => us.filter((x) => x.id !== u.id)); setSel((s) => { const n = new Set(s); n.delete(u.id); return n })
    if (detailId === u.id) setDetailId(null)
    log('user.remove', u.email); toast(`${u.name} removed`)
  }

  const picked = users.filter((u) => sel.has(u.id))
  const bulk = async (kind: 'suspend' | 'reactivate' | 'remove') => {
    const ok = picked.filter((u) => (kind === 'reactivate' ? u.status === 'Suspended' : !protectedReason(u, kind)))
    const skipped = picked.length - ok.length
    if (!ok.length) return toast('No selected users can be changed with this action.', 'warning')
    if (kind !== 'reactivate' && !(await confirm({ title: `${kind === 'remove' ? 'Remove' : 'Suspend'} ${ok.length} user${ok.length > 1 ? 's' : ''}?`, body: `${skipped ? `${skipped} protected or ineligible user${skipped > 1 ? 's' : ''} will be skipped. ` : ''}${kind === 'remove' ? 'This cannot be undone.' : 'They will lose access until reactivated.'}`, confirmLabel: kind === 'remove' ? 'Remove' : 'Suspend', danger: true }))) return
    const ids = new Set(ok.map((u) => u.id))
    if (kind === 'remove') setUsers((us) => us.filter((u) => !ids.has(u.id)))
    else setUsers((us) => us.map((u) => (ids.has(u.id) ? { ...u, status: kind === 'suspend' ? 'Suspended' : 'Active' } : u)))
    log(`user.bulk.${kind}`, `${ok.length} users`); toast(`${ok.length} user${ok.length > 1 ? 's' : ''} updated${skipped ? `, ${skipped} skipped` : ''}`); setSel(new Set())
  }

  const allOn = filtered.length > 0 && filtered.every((u) => sel.has(u.id))
  const toggleAll = (on: boolean) => setSel((s) => { const n = new Set(s); filtered.forEach((u) => (on ? n.add(u.id) : n.delete(u.id))); return n })

  const cols: Col<User>[] = [
    { key: 'sel', header: 'Select', width: '48px', render: (u) => <Checkbox checked={sel.has(u.id)} label={`Select ${u.name}`} disabled={!canEdit} onChange={(on) => setSel((s) => { const n = new Set(s); if (on) n.add(u.id); else n.delete(u.id); return n })} />, hidden: !canEdit },
    { key: 'name', header: 'User', sort: (u) => u.name.toLowerCase(), render: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.name} />
        <div className="min-w-0"><button className="block text-left font-medium text-ink hover:underline" onClick={() => setDetailId(u.id)}>{u.name}{u.name === userName && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}</button><span className="block truncate text-xs text-muted">{u.email}</span></div>
      </div>) },
    { key: 'role', header: 'Role', sort: (u) => u.role, render: (u) => u.role },
    { key: 'team', header: 'Team', sort: (u) => u.team, render: (u) => u.team },
    { key: 'status', header: 'Status', sort: (u) => u.status, render: (u) => <StatusBadge status={u.status} /> },
    { key: 'mfa', header: 'MFA', sort: (u) => (u.mfa ? 1 : 0), render: (u) => u.mfa ? <Badge tone="success"><ShieldCheck className="size-3" aria-hidden />Enabled</Badge> : <Badge tone="warning"><ShieldOff className="size-3" aria-hidden />Not set up</Badge> },
    { key: 'last', header: 'Last active', sort: (u) => u.lastActive ? Date.parse(u.lastActive) : 0, render: (u) => <span title={u.lastActive ? fmtDate(u.lastActive, true) : undefined} className="text-ink-2">{u.status === 'Invited' ? 'Not yet signed in' : ago(u.lastActive)}</span> },
    { key: 'act', header: 'Actions', align: 'right', hidden: !canEdit, render: (u) => (
      <Menu label={`Actions for ${u.name}`} trigger={<span className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-sunken"><MoreHorizontal className="size-4" aria-hidden /></span>} items={[
        { label: 'View details', onSelect: () => setDetailId(u.id) },
        { label: 'Edit role and team', onSelect: () => setEditing(u) },
        ...(u.status === 'Invited' ? [{ label: 'Resend invite', onSelect: () => resend(u) }] : []),
        ...(u.status === 'Suspended' ? [{ label: 'Reactivate', onSelect: () => reactivate(u) }] : u.status === 'Active' ? [{ label: 'Suspend', onSelect: () => suspend(u) }] : []),
        'sep', { label: 'Remove user', danger: true, onSelect: () => remove(u) },
      ]} />) },
  ]

  const filtersOn = roleF !== 'All' || statusF !== 'All' || teamF !== 'All' || q !== ''

  return (
    <div>
      <PageHeader title="User management" description="Invite people, assign roles and teams, and control who can access the workspace." crumbs={[{ label: 'Administration' }, { label: 'Users' }]}
        actions={canEdit ? <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInvite(true)}>Invite user</Button> : undefined} />
      <AdminNav />
      {!canEdit && <ReadOnlyNote page="users" />}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, email or team" label="Search users" className="w-64" />
          <Select aria-label="Filter by role" value={roleF} onChange={(e) => setRoleF(e.target.value)} className="w-44"><option value="All">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
          <Select aria-label="Filter by status" value={statusF} onChange={(e) => setStatusF(e.target.value)} className="w-36"><option value="All">All statuses</option>{['Active', 'Invited', 'Suspended'].map((r) => <option key={r}>{r}</option>)}</Select>
          <Select aria-label="Filter by team" value={teamF} onChange={(e) => setTeamF(e.target.value)} className="w-44"><option value="All">All teams</option>{teams.map((r) => <option key={r}>{r}</option>)}</Select>
          {filtersOn && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setRoleF('All'); setStatusF('All'); setTeamF('All') }}>Clear</Button>}
          <span className="ml-auto text-xs text-muted" role="status" aria-live="polite">{filtered.length} of {users.length} users</span>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken px-4 py-2">
            <Checkbox checked={allOn} onChange={toggleAll} label="Select all filtered" disabled={!filtered.length} />
            {sel.size > 0 && <>
              <span className="text-xs text-ink-2">{sel.size} selected</span>
              <Button size="sm" onClick={() => bulk('suspend')}>Suspend</Button>
              <Button size="sm" onClick={() => bulk('reactivate')}>Reactivate</Button>
              <Button size="sm" variant="danger" onClick={() => bulk('remove')}>Remove</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear selection</Button>
            </>}
          </div>
        )}
        {loading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <Table cols={cols} rows={filtered} rowKey={(u) => u.id} caption="Workspace users" initialSort={{ key: 'name', dir: 'asc' }}
            empty={<EmptyState icon={<UsersIcon className="size-5" />} title="No users match" body="Adjust the search or filters, or invite a new user." action={canEdit ? <Button variant="primary" onClick={() => setInvite(true)}>Invite user</Button> : undefined} />} />
        )}
      </Card>

      {invite && <UserForm mode="invite" users={users} onClose={() => setInvite(false)} onSubmit={(f) => {
        const u: User = { id: uid('u'), name: f.name.trim() || f.email.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()), email: f.email.trim().toLowerCase(), role: f.role, team: f.team.trim() || 'Unassigned', status: 'Invited', lastActive: '', mfa: false }
        setUsers((us) => [...us, u]); log('user.invite', u.email); toast(`Invitation sent to ${u.email}`); setInvite(false)
      }} />}
      {editing && <UserForm mode="edit" user={editing} users={users} onClose={() => setEditing(null)} onSubmit={(f) => {
        if (editing.role === 'Administrator' && f.role !== 'Administrator' && protectedReason(editing, 'demote')) return toast('Cannot change role: this is the last active Administrator.', 'error')
        patch(editing.id, { role: f.role, team: f.team.trim() || editing.team }); log('user.update', `${editing.name} · ${f.role} · ${f.team}`); toast(`${editing.name} updated`); setEditing(null)
      }} />}

      <Drawer open={!!detail} onClose={() => setDetailId(null)} title={detail?.name ?? ''} description={detail?.email}
        footer={detail && canEdit ? <>
          <Button onClick={() => setEditing(detail)}>Edit role and team</Button>
          {detail.status === 'Suspended' ? <Button onClick={() => reactivate(detail)}>Reactivate</Button> : detail.status === 'Invited' ? <Button onClick={() => resend(detail)}>Resend invite</Button> : <Button onClick={() => suspend(detail)}>Suspend</Button>}
          <Button variant="danger" onClick={() => remove(detail)}>Remove</Button>
        </> : undefined}>
        {detail && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              {[['Role', detail.role], ['Team', detail.team], ['Last active', detail.status === 'Invited' ? 'Not yet signed in' : fmtDate(detail.lastActive, true)]].map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}
              <div><dt className="text-xs text-muted">Status</dt><dd><StatusBadge status={detail.status} /></dd></div>
              <div><dt className="text-xs text-muted">Multi-factor authentication</dt><dd>{detail.mfa ? <Badge tone="success">Enabled</Badge> : <Badge tone="warning">Not set up</Badge>}</dd></div>
            </dl>
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Recent audit activity</h3>
              {(() => {
                const rows = audit.filter((a) => a.actor === detail.name || a.target.includes(detail.email) || a.target.includes(detail.name)).slice(0, 8)
                return rows.length ? (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {rows.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                        <div className="min-w-0"><p className="font-medium text-ink">{a.action}</p><p className="truncate text-xs text-muted">{a.actor === detail.name ? 'Performed' : `By ${a.actor}`} · {a.target}</p></div>
                        <div className="shrink-0 text-right"><StatusBadge status={a.result} /><p className="mt-0.5 text-xs text-muted">{ago(a.at)}</p></div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-muted">No audit entries for this user yet.</p>
              })()}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}

function UserForm({ mode, user, users, onClose, onSubmit }: { mode: 'invite' | 'edit'; user?: User; users: User[]; onClose: () => void; onSubmit: (f: FormState) => void }) {
  const [f, setF] = useState<FormState>({ name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'Business Analyst', team: user?.team ?? '' })
  const [touched, setTouched] = useState(false)
  const emailErr = mode === 'edit' ? '' : !f.email.trim() ? 'Email is required.' : !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address, for example name@company.com.' : users.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase()) ? 'A user with this email already exists.' : ''
  const submit = () => { setTouched(true); if (!emailErr) onSubmit(f) }
  return (
    <Modal open onClose={onClose} title={mode === 'invite' ? 'Invite user' : `Edit ${user?.name}`} description={mode === 'invite' ? 'They will receive an email invitation and appear as Invited until they sign in.' : user?.email}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{mode === 'invite' ? 'Send invite' : 'Save changes'}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
        {mode === 'invite' && <>
          <Field label="Email" required htmlFor="inv-email" error={touched ? emailErr : undefined}><Input id="inv-email" type="email" value={f.email} invalid={touched && !!emailErr} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@company.com" autoComplete="off" /></Field>
          <Field label="Full name" htmlFor="inv-name" hint="Optional. Derived from the email if left blank."><Input id="inv-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        </>}
        <Field label="Role" htmlFor="inv-role"><Select id="inv-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as RoleName })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label="Team" htmlFor="inv-team"><Input id="inv-team" list="team-list" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} placeholder="Choose or type a team" /><datalist id="team-list">{[...new Set([...TEAM_SUGGEST, ...users.map((u) => u.team)])].map((t) => <option key={t} value={t} />)}</datalist></Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
