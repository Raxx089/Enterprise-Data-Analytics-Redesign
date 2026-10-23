import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { DEFAULT_SETTINGS, useStore, type Settings as SettingsT } from '../../lib/store'
import { useDirty } from '../../lib/router'
import { AdminNav, Banner, Button, Card, Field, Input, PageHeader, ReadOnlyNote, Select, Skeleton, Switch, Tabs, Textarea, Tooltip, cx } from '../../components/ui'

type TabKey = 'workspace' | 'security' | 'notifications' | 'data' | 'danger'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'BRL', 'SGD']
const REGIONS = ['United States', 'European Union', 'United Kingdom', 'Asia Pacific', 'Latin America']
const RANGES = ['Last 3 months', 'Last 6 months', 'Last 12 months', 'Year to date']
const CHANNELS = [{ id: 'app', label: 'In-app' }, { id: 'email', label: 'Email' }, { id: 'slack', label: 'Slack' }] as const
const EVENTS = [{ id: 'report', label: 'Report runs and schedules' }, { id: 'pipeline', label: 'Pipeline failures' }, { id: 'freshness', label: 'Data freshness alerts' }, { id: 'share', label: 'Items shared with me' }, { id: 'mention', label: 'Mentions' }, { id: 'action', label: 'Assigned actions' }]

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/
export function validateIps(text: string): string[] {
  return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).filter((s) => !IPV4.test(s))
}
const prefKey = (ch: string, ev: string) => (ch === 'app' ? ev : `${ch}:${ev}`)

const DEFAULTS: Required<SettingsT> = { ...DEFAULT_SETTINGS, region: 'United States', defaultRange: 'Last 12 months', ssoRequired: false, pwMinLength: 12, pwRotateDays: 90, piiMasking: true, exportRoles: 'Analysts and above', digest: 'Daily', quietOn: false, quietStart: '20:00', quietEnd: '07:00' }

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"><div className="min-w-0 flex-1 basis-64"><p className="text-[13px] font-medium text-ink">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div><div>{children}</div></div>
}

export default function Settings() {
  const { settings, setSettings, notifPrefs, setNotifPrefs, level, log, toast, confirm, resetDemo } = useStore()
  const canEdit = level('settings') === 'edit'
  const saved = useMemo(() => ({ ...DEFAULTS, ...settings }), [settings])
  const [d, setD] = useState<Required<SettingsT>>(saved)
  const [prefs, setPrefs] = useState<Record<string, boolean>>(notifPrefs)
  const [tab, setTab] = useState<TabKey>('workspace')
  const [loading, setLoading] = useState(true)
  const [tried, setTried] = useState(false)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const set = <K extends keyof SettingsT>(k: K, v: Required<SettingsT>[K]) => setD((x) => ({ ...x, [k]: v }))
  const changedKeys = (Object.keys(d) as (keyof SettingsT)[]).filter((k) => d[k] !== saved[k])
  const prefsChanged = JSON.stringify(prefs) !== JSON.stringify(notifPrefs)
  const dirty = changedKeys.length > 0 || prefsChanged
  useDirty(dirty)

  const badIps = validateIps(d.ipAllowlist)
  const errors: Partial<Record<keyof SettingsT, string>> = {}
  if (!d.workspaceName.trim()) errors.workspaceName = 'Workspace name is required.'
  else if (d.workspaceName.length > 60) errors.workspaceName = 'Use 60 characters or fewer.'
  if (!Number.isInteger(d.sessionTimeout) || d.sessionTimeout < 5 || d.sessionTimeout > 720) errors.sessionTimeout = 'Enter a whole number between 5 and 720 minutes.'
  if (badIps.length) errors.ipAllowlist = `Invalid entr${badIps.length > 1 ? 'ies' : 'y'}: ${badIps.slice(0, 3).join(', ')}${badIps.length > 3 ? '…' : ''}. Use one IPv4 address or CIDR range (for example 203.0.113.0/24) per line.`
  if (!Number.isInteger(d.pwMinLength) || d.pwMinLength < 8 || d.pwMinLength > 64) errors.pwMinLength = 'Minimum length must be between 8 and 64.'
  if (!Number.isInteger(d.pwRotateDays) || d.pwRotateDays < 0 || d.pwRotateDays > 365) errors.pwRotateDays = 'Enter 0 (never) to 365 days.'
  if (!Number.isInteger(d.retentionDays) || d.retentionDays < 30 || d.retentionDays > 3650) errors.retentionDays = 'Retention must be between 30 and 3650 days.'
  const tabOf: Partial<Record<keyof SettingsT, TabKey>> = { workspaceName: 'workspace', sessionTimeout: 'security', ipAllowlist: 'security', pwMinLength: 'security', pwRotateDays: 'security', retentionDays: 'data' }
  const errCount = (t: TabKey) => Object.keys(errors).filter((k) => tabOf[k as keyof SettingsT] === t).length
  const errFor = (k: keyof SettingsT) => (tried || (k !== 'workspaceName' && d[k] !== saved[k]) || (k === 'workspaceName' && d.workspaceName !== saved.workspaceName) ? errors[k] : undefined)

  const save = () => {
    setTried(true)
    const bad = Object.keys(errors)
    if (bad.length) { setTab(tabOf[bad[0] as keyof SettingsT] ?? 'workspace'); return toast('Fix the highlighted fields before saving.', 'error') }
    setSettings({ ...d, workspaceName: d.workspaceName.trim() }); setNotifPrefs(prefs)
    const names: string[] = changedKeys.map((k): string => (k === 'ipAllowlist' ? 'IP allowlist' : k)).concat(prefsChanged ? ['notification preferences'] : [])
    log('settings.update', names.join(', ')); toast('Settings saved'); setTried(false)
  }
  const discard = () => { setD(saved); setPrefs(notifPrefs); setTried(false); toast('Changes discarded', 'info') }

  const revoke = async () => {
    if (!(await confirm({ title: 'Revoke all sessions?', body: 'Every signed-in user, including you, will be asked to sign in again. Use this if you suspect an account has been compromised.', confirmLabel: 'Revoke all sessions', danger: true }))) return
    log('security.sessions.revoke', 'All sessions'); toast('All sessions revoked. Users will re-authenticate on next request.', 'warning')
  }
  const reset = async () => {
    if (!(await confirm({ title: 'Reset demo data?', body: 'All local changes (users, permissions, reports, settings and audit entries) will be erased and the demo reloaded with the original data.', confirmLabel: 'Reset demo data', danger: true }))) return
    log('demo.reset', 'Workspace'); resetDemo()
  }

  const dis = !canEdit
  const prefOn = (ch: string, ev: string) => prefs[prefKey(ch, ev)] ?? ch !== 'slack'

  return (
    <div>
      <PageHeader title="Workspace settings" description="Configure defaults, security policy, notifications and data governance for the whole workspace." crumbs={[{ label: 'Administration' }, { label: 'Settings' }]} />
      <AdminNav />
      {dis && <ReadOnlyNote page="workspace settings" />}
      {dirty && canEdit && (
        <div className="sticky top-0 z-20 mb-4">
          <Banner tone="warning" title="You have unsaved changes" action={<div className="flex shrink-0 gap-2"><Button size="sm" onClick={discard}>Discard</Button><Button size="sm" variant="primary" onClick={save}>Save changes</Button></div>}>
            {changedKeys.length + (prefsChanged ? 1 : 0)} setting{changedKeys.length + (prefsChanged ? 1 : 0) === 1 ? '' : 's'} modified.
          </Banner>
        </div>
      )}
      <Tabs<TabKey> label="Settings sections" value={tab} onChange={setTab} tabs={[
        { value: 'workspace', label: 'Workspace', count: errCount('workspace') || undefined }, { value: 'security', label: 'Security', count: errCount('security') || undefined },
        { value: 'notifications', label: 'Notifications' }, { value: 'data', label: 'Data and privacy', count: errCount('data') || undefined }, { value: 'danger', label: 'Danger zone' }]} />
      <div className="mt-4" role="tabpanel">
        {loading ? <div className="space-y-3"><Skeleton className="h-10 w-full max-w-md" /><Skeleton className="h-10 w-full max-w-md" /><Skeleton className="h-10 w-full max-w-md" /></div> : <>
          {tab === 'workspace' && (
            <Card title="Workspace" subtitle="Defaults applied to new reports, charts and members.">
              <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
                <Field label="Workspace name" required htmlFor="s-name" error={errFor('workspaceName')}><Input id="s-name" value={d.workspaceName} disabled={dis} invalid={!!errFor('workspaceName')} onChange={(e) => set('workspaceName', e.target.value)} /></Field>
                <Field label="Data region" htmlFor="s-region" hint="Where workspace data is stored."><Select id="s-region" value={d.region} disabled={dis} onChange={(e) => set('region', e.target.value)}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Fiscal year starts" htmlFor="s-fy"><Select id="s-fy" value={d.fiscalStart} disabled={dis} onChange={(e) => set('fiscalStart', e.target.value)}>{MONTHS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Currency" htmlFor="s-cur"><Select id="s-cur" value={d.currency} disabled={dis} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Default date range" htmlFor="s-range"><Select id="s-range" value={d.defaultRange} disabled={dis} onChange={(e) => set('defaultRange', e.target.value)}>{RANGES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Time zone" htmlFor="s-tz"><Select id="s-tz" value={d.timezone} disabled={dis} onChange={(e) => set('timezone', e.target.value)}>{ZONES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
              </div>
            </Card>
          )}

          {tab === 'security' && (
            <Card title="Security" subtitle="Authentication and access policy.">
              <div className="max-w-3xl">
                <Row label="Require single sign-on (SSO)" hint="Members must sign in through your identity provider."><Switch label="Require SSO" checked={d.ssoRequired} disabled={dis} onChange={(v) => set('ssoRequired', v)} /></Row>
                <Row label="Require multi-factor authentication" hint="Users without MFA are prompted to enrol at next sign-in."><Switch label="Require MFA" checked={d.enforceMfa} disabled={dis} onChange={(v) => set('enforceMfa', v)} /></Row>
                <Row label="Session timeout" hint="Minutes of inactivity before sign-out (5 to 720).">
                  <div className="w-32"><Field label="Minutes" htmlFor="s-sess" error={errFor('sessionTimeout')}><Input id="s-sess" type="number" min={5} max={720} value={Number.isNaN(d.sessionTimeout) ? '' : d.sessionTimeout} disabled={dis} invalid={!!errFor('sessionTimeout')} onChange={(e) => set('sessionTimeout', e.target.value === '' ? NaN : Number(e.target.value))} /></Field></div>
                </Row>
                <div className="grid gap-4 border-b border-line py-3 sm:grid-cols-2">
                  <Field label="Password minimum length" htmlFor="s-pwl" error={errFor('pwMinLength')}><Input id="s-pwl" type="number" value={Number.isNaN(d.pwMinLength) ? '' : d.pwMinLength} disabled={dis} invalid={!!errFor('pwMinLength')} onChange={(e) => set('pwMinLength', e.target.value === '' ? NaN : Number(e.target.value))} /></Field>
                  <Field label="Password rotation (days)" htmlFor="s-pwr" hint="0 means passwords never expire." error={errFor('pwRotateDays')}><Input id="s-pwr" type="number" value={Number.isNaN(d.pwRotateDays) ? '' : d.pwRotateDays} disabled={dis} invalid={!!errFor('pwRotateDays')} onChange={(e) => set('pwRotateDays', e.target.value === '' ? NaN : Number(e.target.value))} /></Field>
                </div>
                <div className="py-3">
                  <Field label="IP allowlist" htmlFor="s-ip" hint="One IPv4 address or CIDR range per line. Leave empty to allow all addresses." error={errFor('ipAllowlist')}>
                    <Textarea id="s-ip" rows={4} value={d.ipAllowlist} disabled={dis} invalid={!!errFor('ipAllowlist')} placeholder={'203.0.113.10\n198.51.100.0/24'} onChange={(e) => set('ipAllowlist', e.target.value)} className="font-mono text-xs" />
                  </Field>
                  {d.ipAllowlist.trim() && !badIps.length && <div className="mt-2"><Banner tone="warning">Make sure your current IP address is included, otherwise you may lock yourself out after saving.</Banner></div>}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-sunken px-3 py-3">
                  <div><p className="text-[13px] font-medium text-ink">Revoke all sessions</p><p className="text-xs text-muted">Sign out every user immediately.</p></div>
                  <Button variant="danger" disabled={dis} onClick={revoke}>Revoke all sessions</Button>
                </div>
              </div>
            </Card>
          )}

          {tab === 'notifications' && (
            <div className="space-y-4">
              <Card title="Notification channels" subtitle="Choose how each type of event reaches you." pad={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-[13px]">
                    <caption className="sr-only">Notification channels by event type</caption>
                    <thead><tr className="border-y border-line bg-sunken"><th scope="col" className="px-4 py-2 text-left text-xs font-medium text-muted">Event</th>{CHANNELS.map((c) => <th key={c.id} scope="col" className="px-4 py-2 text-center text-xs font-medium text-muted">{c.label}</th>)}</tr></thead>
                    <tbody>{EVENTS.map((e) => (
                      <tr key={e.id} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink">{e.label}</th>
                        {CHANNELS.map((c) => <td key={c.id} className="px-4 py-2.5 text-center"><span className="inline-flex"><Switch label={`${e.label} via ${c.label}`} checked={prefOn(c.id, e.id)} disabled={dis} onChange={(v) => setPrefs((p) => ({ ...p, [prefKey(c.id, e.id)]: v }))} /></span></td>)}
                      </tr>))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card title="Delivery" subtitle="Digest and quiet hours.">
                <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
                  <Field label="Email digest" htmlFor="s-dig" hint="Bundle non-urgent email notifications."><Select id="s-dig" value={d.digest} disabled={dis} onChange={(e) => set('digest', e.target.value)}>{['Off', 'Daily', 'Weekly'].map((r) => <option key={r}>{r}</option>)}</Select></Field>
                  <div className="flex items-center justify-between gap-3 self-end rounded-lg border border-line px-3 py-2"><span className="text-[13px] text-ink">Enable quiet hours</span><Switch label="Enable quiet hours" checked={d.quietOn} disabled={dis} onChange={(v) => set('quietOn', v)} /></div>
                  <Field label="Quiet hours start" htmlFor="s-qs"><Input id="s-qs" type="time" value={d.quietStart} disabled={dis || !d.quietOn} onChange={(e) => set('quietStart', e.target.value)} /></Field>
                  <Field label="Quiet hours end" htmlFor="s-qe" hint="Notifications are held until quiet hours end."><Input id="s-qe" type="time" value={d.quietEnd} disabled={dis || !d.quietOn} onChange={(e) => set('quietEnd', e.target.value)} /></Field>
                </div>
              </Card>
            </div>
          )}

          {tab === 'data' && (
            <Card title="Data and privacy" subtitle="Retention, masking and export controls.">
              <div className="max-w-3xl">
                <Row label="Audit and activity retention" hint="Days to keep audit events (30 to 3650).">
                  <div className="w-32"><Field label="Days" htmlFor="s-ret" error={errFor('retentionDays')}><Input id="s-ret" type="number" value={Number.isNaN(d.retentionDays) ? '' : d.retentionDays} disabled={dis} invalid={!!errFor('retentionDays')} onChange={(e) => set('retentionDays', e.target.value === '' ? NaN : Number(e.target.value))} /></Field></div>
                </Row>
                <Row label="Mask PII by default" hint="Email addresses and other personal fields are masked unless a role is granted unmasked access."><Switch label="Mask PII by default" checked={d.piiMasking} disabled={dis} onChange={(v) => set('piiMasking', v)} /></Row>
                <Row label="Allow data exports" hint="Turn off to disable CSV, JSON and report exports for everyone."><Switch label="Allow data exports" checked={d.allowExports} disabled={dis} onChange={(v) => set('allowExports', v)} /></Row>
                <Row label="Who can export" hint="Applies when exports are allowed."><div className="w-52"><Select aria-label="Who can export" value={d.exportRoles} disabled={dis || !d.allowExports} onChange={(e) => set('exportRoles', e.target.value)}>{['Administrators only', 'Analysts and above', 'Everyone with view access'].map((r) => <option key={r}>{r}</option>)}</Select></div></Row>
                <Row label="Allow external sharing" hint="Permit share links for people outside the workspace."><Switch label="Allow external sharing" checked={d.allowExternalShare} disabled={dis} onChange={(v) => set('allowExternalShare', v)} /></Row>
              </div>
            </Card>
          )}

          {tab === 'danger' && (
            <div className="max-w-3xl overflow-hidden rounded-xl border border-danger bg-surface">
              <div className="border-b border-line bg-danger-soft px-4 py-3"><h3 className="text-[13px] font-semibold text-danger">Danger zone</h3><p className="text-xs text-ink-2">These actions are irreversible. They are recorded in the audit log.</p></div>
              <div className="px-4">
                <Row label="Reset demo data" hint="Erase all local changes and restore the original demo data."><Button variant="danger" disabled={dis} onClick={reset}>Reset demo data</Button></Row>
                <Row label="Delete workspace" hint="Permanently delete this workspace and all of its content. Disabled in the demo so the sample data stays available.">
                  <Tooltip text="Workspace deletion is disabled in this demo environment." side="top"><span><Button variant="danger" disabled className={cx('pointer-events-none')} icon={<Lock className="size-3.5" />}>Delete workspace</Button></span></Tooltip>
                </Row>
              </div>
            </div>
          )}
        </>}
      </div>
    </div>
  )
}
