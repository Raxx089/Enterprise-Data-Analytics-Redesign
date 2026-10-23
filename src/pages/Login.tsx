import { useState, type FormEvent } from 'react'
import { ArrowRight, BarChart3, Check, LockKeyhole, Sparkles } from 'lucide-react'
import { Link, go } from '../lib/router'
import { useStore } from '../lib/store'

function Logo() {
  return (
    <Link to="/login" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Nexus Analytics">
      <span className="grid size-9 place-items-center rounded-xl bg-white text-indigo-700">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 19V5l14 14V5" /></svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Nexus Analytics</span>
    </Link>
  )
}

export default function Login() {
  const { onboarded, setSignedIn } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice('')
    setSignedIn(true)
    go(onboarded ? '/overview' : '/onboarding')
  }

  return (
    <main className="min-h-full bg-surface text-ink lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#17183d] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
        <div className="absolute -right-28 top-24 size-[520px] rounded-full border border-white/10" />
        <div className="absolute -right-12 top-40 size-[360px] rounded-full border border-white/10" />
        <div className="absolute right-16 top-56 size-40 rounded-full bg-indigo-400/10 blur-3xl" />
        <Logo />
        <div className="relative my-auto max-w-xl py-20">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-indigo-100">
            <Sparkles className="size-3.5" aria-hidden /> Your data, in focus
          </p>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">Make confident decisions with a clearer view.</h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-indigo-100/75">Bring performance, forecasts, and operational signals together in one workspace built for your team.</p>
          <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <BarChart3 className="size-5 text-indigo-200" aria-hidden />
              <p className="mt-4 text-sm font-semibold">One source of truth</p>
              <p className="mt-1 text-xs leading-5 text-indigo-100/65">Explore consistent metrics across your business.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <Check className="size-5 text-teal-200" aria-hidden />
              <p className="mt-4 text-sm font-semibold">Built for your role</p>
              <p className="mt-1 text-xs leading-5 text-indigo-100/65">A workspace tailored to how you work.</p>
            </div>
          </div>
        </div>
        <p className="relative text-xs text-indigo-100/50">Nexus Analytics · Halcyon Global demo workspace</p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:justify-center lg:px-14 xl:px-20">
        <div className="mb-10 lg:hidden"><Logo /></div>
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-8">
            <div className="mb-5 grid size-11 place-items-center rounded-xl bg-primary-soft text-primary-ink"><LockKeyhole className="size-5" aria-hidden /></div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-2 text-sm text-ink-2">Sign in to continue to your analytics workspace.</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <label className="block text-[13px] font-medium text-ink" htmlFor="login-email">
              Work email
              <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm font-normal text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
            </label>
            <label className="block text-[13px] font-medium text-ink" htmlFor="login-password">
              Password
              <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm font-normal text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
            </label>
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" className="size-4 accent-indigo-700" /> Remember me</label>
              <button type="button" onClick={() => setNotice('Password recovery is not connected in this demo. No account or password is required.')} className="text-xs font-medium text-primary-ink hover:underline">Forgot password?</button>
            </div>
            {notice && <p role="status" className="rounded-lg border border-info/30 bg-info-soft px-3 py-2.5 text-xs text-info">{notice}</p>}
            <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
              Sign in <ArrowRight className="size-4" aria-hidden />
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <button type="button" onClick={() => setNotice('Single sign-on is not connected in this demo. Use any work email and password to continue.')} className="h-11 w-full rounded-lg border border-line-strong bg-surface text-sm font-medium text-ink transition-colors hover:bg-sunken">Continue with SSO</button>
          <p className="mt-5 text-center text-xs leading-5 text-muted">Demo access: use any valid email and password. Nothing is sent to a server or saved.</p>
          <p className="mt-7 text-center text-xs text-ink-2">New to Nexus? Sign in to set up your workspace.</p>
        </div>
        <p className="mt-auto pt-10 text-center text-[11px] text-muted lg:absolute lg:bottom-6 lg:left-[55%] lg:right-0 lg:pt-0">© 2026 Nexus Analytics · Demo experience</p>
      </section>
    </main>
  )
}
