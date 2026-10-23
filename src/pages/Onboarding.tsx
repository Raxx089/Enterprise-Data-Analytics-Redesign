import { useState } from 'react'
import { ArrowLeft, ArrowRight, BarChart3, Check, Database, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, go } from '../lib/router'
import { ROLES, type RoleName } from '../lib/data'
import { useStore, WORKSPACES } from '../lib/store'

const ROLE_DETAILS: Record<RoleName, { description: string; icon: typeof BarChart3 }> = {
  Executive: { description: 'Business health, forecasts, and key risks.', icon: BarChart3 },
  'Business Analyst': { description: 'Explore data, build reports, and find trends.', icon: BarChart3 },
  'Operations Manager': { description: 'Monitor service levels and team throughput.', icon: ShieldCheck },
  'Finance Manager': { description: 'Track revenue, margins, budgets, and forecasts.', icon: BarChart3 },
  'Data Engineer': { description: 'Manage data sources, pipelines, and quality.', icon: Database },
  Administrator: { description: 'Manage users, permissions, and governance.', icon: ShieldCheck },
}

export default function Onboarding() {
  const { role, setRole, workspace, setWorkspace, onboarded, setOnboarded } = useStore()
  const [step, setStep] = useState(0)

  const finish = () => {
    setOnboarded(true)
    go('/overview')
  }

  return (
    <main className="min-h-full bg-sunken px-4 py-5 text-ink sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between">
          <Link to="/login" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Nexus Analytics home">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-on-primary">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 19V5l14 14V5" /></svg>
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Nexus Analytics</span>
          </Link>
          <Link to={onboarded ? '/overview' : '/login'} className="text-xs font-medium text-ink-2 hover:text-ink">{onboarded ? 'Back to workspace' : 'Sign in instead'}</Link>
        </header>

        <div className="my-auto grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:gap-14">
          <section className="mx-auto w-full max-w-2xl">
            <div className="mb-7 flex items-center gap-3" aria-label={`Step ${step + 1} of 2`}>
              <span className="flex items-center gap-2 text-xs font-semibold text-primary-ink"><span className="grid size-7 place-items-center rounded-full bg-primary text-xs text-on-primary">{step > 0 ? <Check className="size-3.5" /> : '1'}</span> Personalize</span>
              <span className="h-px w-10 bg-line-strong" />
              <span className={`flex items-center gap-2 text-xs font-semibold ${step === 1 ? 'text-primary-ink' : 'text-muted'}`}><span className={`grid size-7 place-items-center rounded-full text-xs ${step === 1 ? 'bg-primary text-on-primary' : 'bg-surface text-muted'}`}>2</span> Finish setup</span>
            </div>

            {step === 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-ink">Get started</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Make this workspace yours</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-ink-2">Choose your role and workspace. We’ll tailor your navigation and starting view to match.</p>

                <fieldset className="mt-8">
                  <legend className="mb-3 text-[13px] font-semibold text-ink">What best describes your role?</legend>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Choose your role">
                    {ROLES.map((item) => {
                      const Icon = ROLE_DETAILS[item].icon
                      const selected = role === item
                      return (
                        <button type="button" key={item} role="radio" aria-checked={selected} onClick={() => setRole(item)} className={`flex min-h-[84px] items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${selected ? 'border-primary bg-primary-soft ring-1 ring-primary/20' : 'border-line bg-surface hover:border-line-strong hover:bg-surface'}`}>
                          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? 'bg-surface text-primary-ink' : 'bg-sunken text-ink-2'}`}><Icon className="size-4" aria-hidden /></span>
                          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-1 text-[13px] font-semibold text-ink">{item}{selected && <Check className="size-4 shrink-0 text-primary-ink" aria-hidden />}</span><span className="mt-1 block text-xs leading-4 text-ink-2">{ROLE_DETAILS[item].description}</span></span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <label className="mt-6 block text-[13px] font-semibold text-ink" htmlFor="workspace">Workspace
                  <select id="workspace" value={workspace} onChange={(e) => setWorkspace(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm font-normal text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15">
                    {WORKSPACES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <div className="mt-7 flex items-center justify-between gap-3">
                  <Link to="/login" className="inline-flex h-10 items-center rounded-lg px-3 text-[13px] font-medium text-ink-2 hover:bg-surface">Cancel</Link>
                  <button type="button" onClick={() => setStep(1)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-semibold text-on-primary hover:bg-primary-hover">Continue <ArrowRight className="size-4" aria-hidden /></button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-ink">You’re all set</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your workspace is ready</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-ink-2">We’ve tailored your Nexus Analytics experience. You can update your role or workspace at any time.</p>
                <div className="mt-7 rounded-2xl border border-line bg-surface p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Your setup</p>
                  <dl className="mt-4 divide-y divide-line text-[13px]">
                    <div className="flex items-center justify-between gap-4 py-3"><dt className="text-ink-2">Role</dt><dd className="font-semibold text-ink">{role}</dd></div>
                    <div className="flex items-center justify-between gap-4 py-3"><dt className="text-ink-2">Workspace</dt><dd className="text-right font-semibold text-ink">{workspace}</dd></div>
                    <div className="flex items-center justify-between gap-4 py-3"><dt className="text-ink-2">Starting page</dt><dd className="font-semibold text-ink">Executive Overview</dd></div>
                  </dl>
                </div>
                <div className="mt-5 flex gap-3 rounded-xl border border-info/25 bg-info-soft p-4 text-xs leading-5 text-info"><Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden /><p>This is a demo workspace with synthetic Halcyon Global data. No live data sources are connected.</p></div>
                <div className="mt-7 flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setStep(0)} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-ink-2 hover:bg-surface"><ArrowLeft className="size-4" aria-hidden /> Back</button>
                  <button type="button" onClick={finish} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-semibold text-on-primary hover:bg-primary-hover">Open workspace <ArrowRight className="size-4" aria-hidden /></button>
                </div>
              </>
            )}
          </section>

          <aside className="hidden rounded-3xl bg-[#17183d] p-7 text-white lg:block">
            <div className="grid size-10 place-items-center rounded-xl bg-white/10 text-indigo-200"><Sparkles className="size-5" aria-hidden /></div>
            <h2 className="mt-5 text-lg font-semibold">Everything you need, in one place.</h2>
            <p className="mt-2 text-[13px] leading-6 text-indigo-100/70">Your role shapes the workspace so the most relevant tools are easy to find.</p>
            <ul className="mt-6 space-y-4 text-[13px] text-indigo-50/90">
              <li className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><BarChart3 className="size-3.5" /></span>Business performance and analytics</li>
              <li className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><Database className="size-3.5" /></span>Data exploration and trusted metrics</li>
              <li className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><ShieldCheck className="size-3.5" /></span>Governance for your team</li>
            </ul>
          </aside>
        </div>
        <footer className="flex items-center justify-between text-[11px] text-muted"><span>© 2026 Nexus Analytics</span><span>Setup takes less than a minute</span></footer>
      </div>
    </main>
  )
}
