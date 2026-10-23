import { Component, type ReactNode } from 'react'
import Shell from './components/Shell'
import { NoAccess, Button } from './components/ui'
import { StoreProvider, useStore } from './lib/store'
import { PAGE_LABELS, type PageKey } from './lib/data'
import { useRoute, Link } from './lib/router'
import Overview from './pages/Overview'
import Analytics from './pages/Analytics'
import Explore from './pages/Explore'
import DatasetDetails from './pages/DatasetDetails'
import Reports from './pages/Reports'
import ReportBuilder from './pages/ReportBuilder'
import Copilot from './pages/Copilot'
import Forecasting from './pages/Forecasting'
import Sources from './pages/Sources'
import Pipelines from './pages/Pipelines'
import Quality from './pages/Quality'
import Metrics from './pages/Metrics'
import Collaboration from './pages/Collaboration'
import Users from './pages/admin/Users'
import Roles from './pages/admin/Roles'
import Audit from './pages/admin/Audit'
import Settings from './pages/admin/Settings'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { err: Error | null; key: string }> {
  state = { err: null as Error | null, key: this.props.resetKey }
  static getDerivedStateFromError(err: Error) { return { err } }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) { return p.resetKey !== s.key ? { err: null, key: p.resetKey } : null }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This page hit an unexpected error</h1>
        <p className="mt-1.5 text-[13px] text-ink-2">{this.state.err.message}</p>
        <div className="mt-4"><Button variant="primary" onClick={() => this.setState({ err: null })}>Try again</Button></div>
      </div>
    )
  }
}

function resolve(parts: string[]): { key: PageKey; el: ReactNode } | null {
  const [a, b, c] = parts
  switch (a) {
    case undefined: case 'overview': return { key: 'overview', el: <Overview /> }
    case 'analytics': return { key: 'analytics', el: <Analytics /> }
    case 'explore': return { key: 'explore', el: b ? <DatasetDetails /> : <Explore /> }
    case 'reports': return { key: 'reports', el: b === 'builder' ? <ReportBuilder key={c ?? 'new'} /> : <Reports /> }
    case 'copilot': return { key: 'copilot', el: <Copilot /> }
    case 'forecasting': return { key: 'forecasting', el: <Forecasting /> }
    case 'sources': return { key: 'sources', el: <Sources /> }
    case 'pipelines': return { key: 'pipelines', el: <Pipelines /> }
    case 'quality': return { key: 'quality', el: <Quality /> }
    case 'metrics': return { key: 'metrics', el: <Metrics /> }
    case 'collaboration': return { key: 'collaboration', el: <Collaboration /> }
    case 'admin':
      if (b === 'users') return { key: 'users', el: <Users /> }
      if (b === 'roles') return { key: 'roles', el: <Roles /> }
      if (b === 'audit') return { key: 'audit', el: <Audit /> }
      if (b === 'settings') return { key: 'settings', el: <Settings /> }
      return { key: 'users', el: <Users /> }
  }
  return null
}

function Routes() {
  const { parts, path } = useRoute()
  const { level, log, role } = useStore()
  const r = resolve(parts)
  if (!r) return (
    <div className="mx-auto mt-16 max-w-md text-center"><h1 className="text-lg font-semibold text-ink">Page not found</h1><p className="mt-1 text-[13px] text-ink-2">The address “{path}” does not match any page.</p><Link to="/overview" className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary">Go to Overview</Link></div>
  )
  if (level(r.key) === 'none') return <NoAccess page={PAGE_LABELS[r.key]} />
  void log; void role
  return <Boundary resetKey={path}>{r.el}</Boundary>
}

function AppContent() {
  const { parts } = useRoute()
  if (parts[0] === 'login') return <Login />
  if (parts[0] === 'onboarding') return <Onboarding />
  return <Shell><Routes /></Shell>
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  )
}
