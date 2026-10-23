import { CAT_WEIGHTS, CATEGORIES, FACTS, REGIONS, SEASON, UNITS, monthLabel, type Fact } from './data'

export interface Filters { start: number; end: number; region: string; unit: string }
export const DEFAULT_FILTERS: Filters = { start: 12, end: 23, region: 'All', unit: 'All' }

export const RANGE_PRESETS = [
  { id: '3m', label: 'Last 3 months', start: 21, end: 23 },
  { id: '6m', label: 'Last 6 months', start: 18, end: 23 },
  { id: 'ytd', label: 'Year to date', start: 14, end: 23 },
  { id: '12m', label: 'Last 12 months', start: 12, end: 23 },
]
export function rangeLabel(f: Filters) {
  const p = RANGE_PRESETS.find((x) => x.start === f.start && x.end === f.end)
  return p ? p.label : `${monthLabel(f.start, true)} – ${monthLabel(f.end, true)}`
}
export function filterSummary(f: Filters) {
  return `${rangeLabel(f)} · ${f.region === 'All' ? 'All regions' : f.region} · ${f.unit === 'All' ? 'All units' : f.unit}`
}

export function pick(f: Filters, start = f.start, end = f.end): Fact[] {
  return FACTS.filter((x) => x.m >= start && x.m <= end && (f.region === 'All' || x.region === f.region) && (f.unit === 'All' || x.unit === f.unit))
}
export function prevWindow(f: Filters) {
  const len = f.end - f.start + 1
  return { start: Math.max(0, f.start - len), end: f.start - 1 }
}

export type MetricKey = 'revenue' | 'cost' | 'profit' | 'margin' | 'target' | 'won' | 'leads' | 'visitors' | 'conversion' | 'churned' | 'retention' | 'attainment' | 'netnew'
export interface MetricDef { key: MetricKey; label: string; kind: 'usd' | 'pct' | 'num'; higherIsBetter: boolean; desc: string }
export const METRIC_DEFS: MetricDef[] = [
  { key: 'revenue', label: 'Revenue', kind: 'usd', higherIsBetter: true, desc: 'Recognised revenue' },
  { key: 'cost', label: 'Operating Costs', kind: 'usd', higherIsBetter: false, desc: 'Operating costs' },
  { key: 'profit', label: 'Operating Profit', kind: 'usd', higherIsBetter: true, desc: 'Revenue − costs' },
  { key: 'margin', label: 'Operating Margin', kind: 'pct', higherIsBetter: true, desc: 'Profit ÷ revenue' },
  { key: 'target', label: 'Revenue Target', kind: 'usd', higherIsBetter: true, desc: 'Plan target' },
  { key: 'attainment', label: 'Target Attainment', kind: 'pct', higherIsBetter: true, desc: 'Revenue ÷ target' },
  { key: 'won', label: 'New Customers', kind: 'num', higherIsBetter: true, desc: 'Customers won' },
  { key: 'leads', label: 'Leads', kind: 'num', higherIsBetter: true, desc: 'Leads created' },
  { key: 'visitors', label: 'Visitors', kind: 'num', higherIsBetter: true, desc: 'Web visitors' },
  { key: 'conversion', label: 'Conversion Rate', kind: 'pct', higherIsBetter: true, desc: 'Won ÷ leads' },
  { key: 'netnew', label: 'Net New Customers', kind: 'num', higherIsBetter: true, desc: 'Won − churned' },
  { key: 'churned', label: 'Churned Customers', kind: 'num', higherIsBetter: false, desc: 'Customers lost' },
  { key: 'retention', label: 'Customer Retention', kind: 'pct', higherIsBetter: true, desc: '1 − churned ÷ start customers' },
]
export const metricDef = (k: string) => METRIC_DEFS.find((m) => m.key === k) ?? METRIC_DEFS[0]

const sum = (fs: Fact[], k: keyof Fact) => fs.reduce((a, f) => a + (f[k] as number), 0)

export function metricValue(fs: Fact[], key: MetricKey): number {
  if (!fs.length) return 0
  switch (key) {
    case 'revenue': return sum(fs, 'revenue')
    case 'cost': return sum(fs, 'cost')
    case 'profit': return sum(fs, 'revenue') - sum(fs, 'cost')
    case 'margin': return (sum(fs, 'revenue') - sum(fs, 'cost')) / (sum(fs, 'revenue') || 1)
    case 'target': return sum(fs, 'target')
    case 'attainment': return sum(fs, 'revenue') / (sum(fs, 'target') || 1)
    case 'won': return sum(fs, 'won')
    case 'leads': return sum(fs, 'leads')
    case 'visitors': return sum(fs, 'visitors')
    case 'conversion': return sum(fs, 'won') / (sum(fs, 'leads') || 1)
    case 'churned': return sum(fs, 'churned')
    case 'netnew': return sum(fs, 'won') - sum(fs, 'churned')
    case 'retention': {
      const first = Math.min(...fs.map((f) => f.m))
      const start = fs.filter((f) => f.m === first).reduce((a, f) => a + f.cs, 0)
      return 1 - sum(fs, 'churned') / (start || 1)
    }
  }
}

export function fmtMoney(k: number, digits = 1) {
  const a = Math.abs(k)
  const s = k < 0 ? '−' : ''
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(digits)}B`
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(digits)}M`
  return `${s}$${Math.round(a)}K`
}
export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtPct = (r: number, d = 1) => `${(r * 100).toFixed(d)}%`
export function fmtMetric(key: MetricKey, v: number) {
  const k = metricDef(key).kind
  return k === 'usd' ? fmtMoney(v) : k === 'pct' ? fmtPct(v) : fmtNum(v)
}
export function fmtDate(iso: string, withTime = false) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + (withTime ? ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) + ' UTC' : '')
}
export function ago(iso: string) {
  if (!iso) return 'never'
  const mins = Math.max(1, Math.round((Date.parse('2026-10-21T08:30:00Z') - Date.parse(iso)) / 60000))
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export interface Delta { abs: number; pct: number; good: boolean; text: string }
export function delta(key: MetricKey, cur: number, prev: number): Delta {
  const kind = metricDef(key).kind
  const abs = cur - prev
  const pct = kind === 'pct' ? abs : prev ? abs / Math.abs(prev) : 0
  const good = metricDef(key).higherIsBetter ? abs >= 0 : abs <= 0
  const text = kind === 'pct' ? `${abs >= 0 ? '+' : '−'}${Math.abs(abs * 100).toFixed(1)} pts` : `${abs >= 0 ? '+' : '−'}${Math.abs(pct * 100).toFixed(1)}%`
  return { abs, pct, good, text }
}

export function monthlySeries(f: Filters, key: MetricKey, start = f.start, end = f.end) {
  const out: { m: number; label: string; value: number }[] = []
  for (let m = start; m <= end; m++) out.push({ m, label: monthLabel(m), value: metricValue(pick(f, m, m), key) })
  return out
}

export interface Kpi { key: MetricKey; label: string; cur: number; prev: number; delta: Delta; spark: number[]; text: string; prevText: string }
export function kpi(f: Filters, key: MetricKey, label?: string): Kpi {
  const cur = metricValue(pick(f), key)
  const pw = prevWindow(f)
  const prev = metricValue(pick(f, pw.start, pw.end), key)
  return { key, label: label ?? metricDef(key).label, cur, prev, delta: delta(key, cur, prev), spark: monthlySeries(f, key).map((x) => x.value), text: fmtMetric(key, cur), prevText: fmtMetric(key, prev) }
}

export type Dim = 'month' | 'region' | 'unit' | 'category'
export const DIMS: { key: Dim; label: string }[] = [{ key: 'month', label: 'Month' }, { key: 'region', label: 'Region' }, { key: 'unit', label: 'Business unit' }, { key: 'category', label: 'Product category' }]

function scale(f: Fact, w: number): Fact {
  return { ...f, revenue: f.revenue * w, cost: f.cost * w, target: f.target * w, visitors: f.visitors * w, leads: f.leads * w, qualified: f.qualified * w, opps: f.opps * w, won: f.won * w, churned: f.churned * w, cs: f.cs * w }
}
export function groupBy(fs: Fact[], dim: Dim): { key: string; facts: Fact[] }[] {
  if (dim === 'month') {
    const ms = [...new Set(fs.map((f) => f.m))].sort((a, b) => a - b)
    return ms.map((m) => ({ key: monthLabel(m), facts: fs.filter((f) => f.m === m) }))
  }
  if (dim === 'region') return REGIONS.map((r) => ({ key: r as string, facts: fs.filter((f) => f.region === r) })).filter((g) => g.facts.length)
  if (dim === 'unit') return UNITS.map((u) => ({ key: u as string, facts: fs.filter((f) => f.unit === u) })).filter((g) => g.facts.length)
  return CATEGORIES.map((c, i) => ({ key: c as string, facts: fs.map((f) => scale(f, CAT_WEIGHTS[f.unit][i])) }))
}
export function breakdown(f: Filters, dim: Dim, key: MetricKey, start = f.start, end = f.end) {
  return groupBy(pick(f, start, end), dim).map((g) => ({ key: g.key, value: metricValue(g.facts, key) }))
}

export function funnel(f: Filters, start = f.start, end = f.end) {
  const fs = pick(f, start, end)
  return [
    { label: 'Visitors', value: sum(fs, 'visitors') }, { label: 'Leads', value: sum(fs, 'leads') }, { label: 'Qualified', value: sum(fs, 'qualified') },
    { label: 'Opportunities', value: sum(fs, 'opps') }, { label: 'Won', value: sum(fs, 'won') },
  ]
}

// Underperforming slices: revenue vs target for the selected window.
export function underperformers(f: Filters) {
  const rows: { region: string; unit: string; revenue: number; target: number; gap: number }[] = []
  for (const r of REGIONS) for (const u of UNITS) {
    if ((f.region !== 'All' && f.region !== r) || (f.unit !== 'All' && f.unit !== u)) continue
    const fs = pick({ ...f, region: r, unit: u })
    const revenue = sum(fs, 'revenue'), target = sum(fs, 'target')
    rows.push({ region: r, unit: u, revenue, target, gap: revenue / (target || 1) - 1 })
  }
  return rows.sort((a, b) => a.gap - b.gap)
}

// ---------- forecasting ----------
export interface Assumptions { growthAdj: number; costInflation: number; demandAdj: number }
export interface FcPoint { m: number; label: string; expected: number; lo: number; hi: number }
export function forecastSeries(f: Filters, key: 'revenue' | 'cost' | 'leads' | 'won', horizon: number, a: Assumptions = { growthAdj: 0, costInflation: 0, demandAdj: 0 }): { hist: { m: number; label: string; value: number }[]; fc: FcPoint[]; growth: number } {
  const base: Filters = { ...f, start: 12, end: 23 }
  const hist = monthlySeries(base, key)
  const seasonOf = (m: number) => SEASON[(10 + m) % 12]
  const des = hist.map((h) => h.value / seasonOf(h.m))
  // log-linear trend on deseasonalised series
  const n = des.length
  const xs = des.map((_, i) => i), ys = des.map((v) => Math.log(v))
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const resid = Math.sqrt(ys.reduce((s, y, i) => s + (y - (my + slope * (xs[i] - mx))) ** 2, 0) / (n - 2))
  const level = Math.exp(my + slope * (n - 1 - mx))
  const g = Math.exp(slope) - 1
  const gAdj = g + a.growthAdj / 100
  const fc: FcPoint[] = []
  for (let t = 1; t <= horizon; t++) {
    const m = 23 + t
    let e = level * Math.pow(1 + gAdj, t) * seasonOf(m) * (1 + a.demandAdj / 100)
    if (key === 'cost') e *= 1 + (a.costInflation / 100) * (t / 12)
    const band = 1.28 * (resid + 0.004) * Math.sqrt(t)
    fc.push({ m, label: monthLabel(m), expected: e, lo: e * Math.exp(-band), hi: e * Math.exp(band) })
  }
  return { hist, fc, growth: g }
}
