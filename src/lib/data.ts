// Synthetic seed data for "Halcyon Global" (fictional). Every number in the app derives from FACTS.

export const COMPANY = 'Halcyon Global'
export const TODAY = '2026-10-21'

export const REGIONS = ['North America', 'EMEA', 'APAC', 'LATAM'] as const
export const UNITS = ['Enterprise Software', 'Cloud Platform', 'Data & AI', 'Professional Services'] as const
export const CATEGORIES = ['Analytics Suite', 'Data Platform', 'Security', 'Services', 'Support Plans'] as const
export const SEGMENTS = ['Enterprise', 'Mid-Market', 'SMB'] as const
export type Region = (typeof REGIONS)[number]
export type Unit = (typeof UNITS)[number]
export type Category = (typeof CATEGORIES)[number]

export type RoleName = 'Executive' | 'Business Analyst' | 'Operations Manager' | 'Finance Manager' | 'Data Engineer' | 'Administrator'
export const ROLES: RoleName[] = ['Executive', 'Business Analyst', 'Operations Manager', 'Finance Manager', 'Data Engineer', 'Administrator']

export type PageKey =
  | 'overview' | 'analytics' | 'explore' | 'reports' | 'copilot' | 'forecasting' | 'sources' | 'pipelines'
  | 'quality' | 'metrics' | 'collaboration' | 'users' | 'roles' | 'audit' | 'settings'
export type Level = 'none' | 'view' | 'edit'
export type Perms = Record<RoleName, Record<PageKey, Level>>

export const PAGE_LABELS: Record<PageKey, string> = {
  overview: 'Executive Overview', analytics: 'Analytics Workspace', explore: 'Explore Data', reports: 'Reports',
  copilot: 'AI Insights', forecasting: 'Forecasting', sources: 'Data Sources', pipelines: 'Data Pipelines',
  quality: 'Data Quality', metrics: 'Metrics Catalog', collaboration: 'Collaboration', users: 'User Management',
  roles: 'Roles & Permissions', audit: 'Audit Logs', settings: 'Workspace Settings',
}

const ALL: PageKey[] = Object.keys(PAGE_LABELS) as PageKey[]
function mk(map: Partial<Record<PageKey, Level>>): Record<PageKey, Level> {
  const o = {} as Record<PageKey, Level>
  ALL.forEach((k) => (o[k] = map[k] ?? 'none'))
  return o
}
export const DEFAULT_PERMS: Perms = {
  Executive: mk({ overview: 'view', explore: 'view', reports: 'view', copilot: 'edit', forecasting: 'view', metrics: 'view', collaboration: 'edit' }),
  'Business Analyst': mk({ overview: 'view', analytics: 'edit', explore: 'edit', reports: 'edit', copilot: 'edit', forecasting: 'edit', quality: 'view', metrics: 'edit', collaboration: 'edit' }),
  'Operations Manager': mk({ overview: 'view', analytics: 'edit', explore: 'view', reports: 'edit', copilot: 'edit', forecasting: 'view', pipelines: 'view', quality: 'view', metrics: 'view', collaboration: 'edit' }),
  'Finance Manager': mk({ overview: 'view', analytics: 'edit', explore: 'view', reports: 'edit', copilot: 'edit', forecasting: 'edit', metrics: 'edit', collaboration: 'edit' }),
  'Data Engineer': mk({ overview: 'view', analytics: 'view', explore: 'edit', reports: 'view', copilot: 'view', sources: 'edit', pipelines: 'edit', quality: 'edit', metrics: 'edit', collaboration: 'view' }),
  Administrator: mk(Object.fromEntries(ALL.map((k) => [k, 'edit'])) as Record<PageKey, Level>),
}

// ---------- deterministic PRNG ----------
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- time ----------
// 24 months: index 0 = Nov 2024 ... index 23 = Oct 2026. The UI shows indices 12..23 (last 12 months); 0..11 feed prior-period comparisons.
export const MONTH_COUNT = 24
export const LAST = 23
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function monthLabel(i: number, long = false) {
  const cm = (10 + i) % 12
  const y = 2024 + Math.floor((10 + i) / 12)
  return long ? `${MN[cm]} ${y}` : `${MN[cm]} ${String(y).slice(2)}`
}

// ---------- fact table ----------
export interface Fact {
  m: number; region: Region; unit: Unit
  revenue: number; cost: number; target: number // $K
  visitors: number; leads: number; qualified: number; opps: number; won: number
  churned: number; cs: number // customers at start of month
}

const BASE: Record<Region, number> = { 'North America': 2300, EMEA: 1650, APAC: 1050, LATAM: 500 }
const GROW: Record<Region, number> = { 'North America': 0.015, EMEA: 0.012, APAC: 0.024, LATAM: 0.01 }
const SHARE: Record<Unit, number> = { 'Enterprise Software': 0.34, 'Cloud Platform': 0.3, 'Data & AI': 0.2, 'Professional Services': 0.16 }
const COSTR: Record<Unit, number> = { 'Enterprise Software': 0.57, 'Cloud Platform': 0.65, 'Data & AI': 0.6, 'Professional Services': 0.79 }
export const SEASON = [0.96, 0.97, 1.03, 1.0, 1.01, 1.04, 0.98, 0.97, 1.05, 1.01, 1.02, 1.07]
export const CAT_WEIGHTS: Record<Unit, number[]> = {
  'Enterprise Software': [0.5, 0.1, 0.12, 0.08, 0.2],
  'Cloud Platform': [0.12, 0.5, 0.18, 0.05, 0.15],
  'Data & AI': [0.4, 0.35, 0.05, 0.05, 0.15],
  'Professional Services': [0.02, 0.03, 0.05, 0.85, 0.05],
}

function buildFacts(): Fact[] {
  const r = rng(20261021)
  const out: Fact[] = []
  const cust: Record<string, number> = {}
  for (let m = 0; m < MONTH_COUNT; m++) {
    for (const region of REGIONS) {
      for (const unit of UNITS) {
        const key = region + unit
        const s = SEASON[(10 + m) % 12]
        const trend = Math.pow(1 + GROW[region], m)
        let rev = BASE[region] * SHARE[unit] * trend * s * (1 + (r() - 0.5) * 0.04)
        if (region === 'EMEA' && unit === 'Enterprise Software') { if (m === 22) rev *= 0.84; if (m === 23) rev *= 0.8 }
        if (region === 'LATAM' && unit === 'Professional Services' && m >= 20) rev *= 0.86
        if (region === 'APAC' && unit === 'Cloud Platform' && m >= 18) rev *= 1.06
        const target = BASE[region] * SHARE[unit] * Math.pow(1.0185, m) * s * 1.005
        const cost = rev * (COSTR[unit] + (r() - 0.5) * 0.02 + (unit === 'Professional Services' ? m * 0.0005 : 0))
        const won = Math.round((rev / 150) * (1 + (r() - 0.5) * 0.1))
        const leads = Math.round(won / (0.058 + r() * 0.008))
        const visitors = Math.round(leads / (0.045 + r() * 0.006))
        const qualified = Math.round(leads * (0.44 + r() * 0.04))
        const opps = Math.round(qualified * (0.5 + r() * 0.04))
        if (cust[key] === undefined) cust[key] = Math.round((BASE[region] * SHARE[unit]) / 1.9)
        const cs = cust[key]
        const churned = Math.round(cs * 0.0065 * (1 + (r() - 0.5) * 0.3))
        cust[key] = cs + won - churned
        out.push({ m, region, unit, revenue: Math.round(rev), cost: Math.round(cost), target: Math.round(target), visitors, leads, qualified, opps, won, churned, cs })
      }
    }
  }
  return out
}
export const FACTS: Fact[] = buildFacts()

// ---------- operations (SLA) ----------
export const TEAMS = ['Customer Support', 'Fulfillment', 'Onboarding', 'Implementation'] as const
export interface OpsRow { m: number; team: (typeof TEAMS)[number]; sla: number; tickets: number; throughput: number; resolutionH: number; backlog: number; csat: number }
function buildOps(): OpsRow[] {
  const r = rng(77)
  const out: OpsRow[] = []
  const base: Record<string, number> = { 'Customer Support': 96.2, Fulfillment: 97.4, Onboarding: 93.8, Implementation: 91.5 }
  for (let m = 0; m < MONTH_COUNT; m++)
    for (const team of TEAMS) {
      let sla = base[team] + m * 0.03 + (r() - 0.5) * 1.6
      if (team === 'Onboarding' && m >= 21) sla -= 2.4 + (m - 21) * 0.8
      out.push({
        m, team, sla: +Math.min(99.5, sla).toFixed(1), tickets: Math.round(900 + m * 14 + r() * 120), throughput: Math.round(1400 + m * 22 + r() * 180),
        resolutionH: +(6.8 - m * 0.02 + r() * 0.8 + (team === 'Onboarding' && m >= 21 ? 1.4 : 0)).toFixed(1), backlog: Math.round(120 + r() * 60 + (team === 'Onboarding' && m >= 21 ? 90 : 0)),
        csat: +(4.35 + r() * 0.2 - (team === 'Onboarding' && m >= 21 ? 0.25 : 0)).toFixed(2),
      })
    }
  return out
}
export const OPS: OpsRow[] = buildOps()

// ---------- datasets ----------
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'currency'
export type Sensitivity = 'Public' | 'Internal' | 'Confidential' | 'Restricted'
export interface Field { name: string; type: FieldType; desc: string; pii?: boolean }
export interface Dataset {
  id: string; name: string; desc: string; owner: string; team: string; rows: number; refreshed: string; sensitivity: Sensitivity
  fields: Field[]; upstream: string[]; downstream: string[]; certified: boolean; quality: number; tags: string[]
}
export const DATASETS: Dataset[] = [
  { id: 'sales', name: 'Sales', desc: 'Booked revenue by region, business unit and product category at monthly grain.', owner: 'Priya Raman', team: 'Revenue Operations', rows: 2304, refreshed: '2026-10-21T06:05:00Z', sensitivity: 'Internal', certified: true, quality: 98.6, tags: ['revenue', 'targets'],
    fields: [{ name: 'month', type: 'date', desc: 'Calendar month of booking' }, { name: 'region', type: 'string', desc: 'Sales region' }, { name: 'business_unit', type: 'string', desc: 'Owning business unit' }, { name: 'revenue_usd_k', type: 'currency', desc: 'Recognised revenue in $K' }, { name: 'target_usd_k', type: 'currency', desc: 'Plan target in $K' }, { name: 'new_customers', type: 'number', desc: 'Customers won in the month' }, { name: 'leads', type: 'number', desc: 'Marketing + sales leads' }],
    upstream: ['Salesforce CRM', 'NetSuite ERP', 'pl_revenue_daily'], downstream: ['Executive Overview', 'Revenue by Region', 'Forecast model'] },
  { id: 'customers', name: 'Customers', desc: 'Active and churned customer accounts with segment, tier and lifecycle dates.', owner: 'Marcus Webb', team: 'Customer Success', rows: 4218, refreshed: '2026-10-21T05:40:00Z', sensitivity: 'Restricted', certified: true, quality: 96.1, tags: ['pii', 'lifecycle'],
    fields: [{ name: 'customer_id', type: 'string', desc: 'Unique account ID' }, { name: 'company', type: 'string', desc: 'Legal company name' }, { name: 'contact_email', type: 'string', desc: 'Primary contact email', pii: true }, { name: 'segment', type: 'string', desc: 'Enterprise, Mid-Market or SMB' }, { name: 'region', type: 'string', desc: 'Account region' }, { name: 'arr_usd', type: 'currency', desc: 'Annual recurring revenue' }, { name: 'signed_on', type: 'date', desc: 'Contract start date' }, { name: 'churned', type: 'boolean', desc: 'True if account has churned' }],
    upstream: ['Salesforce CRM', 'Billing (Stripe)'], downstream: ['Customer Retention', 'Churn model', 'Customer Insights report'] },
  { id: 'orders', name: 'Orders', desc: 'Order-level transactions. The demo exposes a 480-row sample of 18,420 orders.', owner: 'Priya Raman', team: 'Revenue Operations', rows: 18420, refreshed: '2026-10-21T06:05:00Z', sensitivity: 'Confidential', certified: true, quality: 97.4, tags: ['transactions'],
    fields: [{ name: 'order_id', type: 'string', desc: 'Order number' }, { name: 'order_date', type: 'date', desc: 'Date the order was placed' }, { name: 'customer', type: 'string', desc: 'Customer company' }, { name: 'region', type: 'string', desc: 'Ship-to region' }, { name: 'category', type: 'string', desc: 'Product category' }, { name: 'amount_usd', type: 'currency', desc: 'Order value in USD' }, { name: 'status', type: 'string', desc: 'Fulfilment status' }],
    upstream: ['NetSuite ERP', 'Shopify Plus'], downstream: ['Sales', 'Average Order Value'] },
  { id: 'products', name: 'Products', desc: 'Product catalog with category, list price and lifecycle stage.', owner: 'Hana Ito', team: 'Product Management', rows: 312, refreshed: '2026-10-20T22:00:00Z', sensitivity: 'Internal', certified: true, quality: 99.2, tags: ['catalog'],
    fields: [{ name: 'sku', type: 'string', desc: 'Stock keeping unit' }, { name: 'product', type: 'string', desc: 'Product name' }, { name: 'category', type: 'string', desc: 'Product category' }, { name: 'business_unit', type: 'string', desc: 'Owning unit' }, { name: 'list_price_usd', type: 'currency', desc: 'Annual list price' }, { name: 'stage', type: 'string', desc: 'GA, Beta or Sunset' }],
    upstream: ['Product Hub'], downstream: ['Orders', 'Product category mix'] },
  { id: 'finance', name: 'Finance', desc: 'General ledger rollup: revenue, cost of delivery, opex and operating margin by unit.', owner: 'Elena Petrova', team: 'Finance', rows: 2304, refreshed: '2026-10-21T04:30:00Z', sensitivity: 'Restricted', certified: true, quality: 99.0, tags: ['gl', 'margin'],
    fields: [{ name: 'month', type: 'date', desc: 'Fiscal month' }, { name: 'region', type: 'string', desc: 'Region' }, { name: 'business_unit', type: 'string', desc: 'Business unit' }, { name: 'revenue_usd_k', type: 'currency', desc: 'Revenue in $K' }, { name: 'operating_cost_usd_k', type: 'currency', desc: 'Operating costs in $K' }, { name: 'operating_profit_usd_k', type: 'currency', desc: 'Revenue less operating costs' }],
    upstream: ['NetSuite ERP'], downstream: ['Financial Overview report', 'Operating Profit', 'Forecast model'] },
  { id: 'operations', name: 'Operations', desc: 'Team-level SLA compliance, throughput, backlog and resolution time.', owner: 'Tomas Alvarez', team: 'Operations', rows: 96, refreshed: '2026-10-21T05:55:00Z', sensitivity: 'Internal', certified: true, quality: 94.8, tags: ['sla'],
    fields: [{ name: 'month', type: 'date', desc: 'Calendar month' }, { name: 'team', type: 'string', desc: 'Operational team' }, { name: 'sla_compliance_pct', type: 'number', desc: '% of tickets inside SLA' }, { name: 'throughput', type: 'number', desc: 'Work items completed' }, { name: 'backlog', type: 'number', desc: 'Open items at month end' }, { name: 'avg_resolution_h', type: 'number', desc: 'Mean hours to resolve' }],
    upstream: ['ServiceNow', 'Zendesk'], downstream: ['Operations SLA report', 'SLA Compliance'] },
  { id: 'support', name: 'Customer Support', desc: 'Support tickets with priority, channel, CSAT score and resolution times.', owner: 'Aisha Khan', team: 'Customer Support', rows: 52310, refreshed: '2026-10-20T23:10:00Z', sensitivity: 'Confidential', certified: false, quality: 91.3, tags: ['tickets', 'csat'],
    fields: [{ name: 'ticket_id', type: 'string', desc: 'Ticket reference' }, { name: 'opened_at', type: 'date', desc: 'Time opened' }, { name: 'customer', type: 'string', desc: 'Customer company' }, { name: 'requester_email', type: 'string', desc: 'Requester email', pii: true }, { name: 'priority', type: 'string', desc: 'P1–P4' }, { name: 'csat', type: 'number', desc: 'Score 1–5' }, { name: 'resolved', type: 'boolean', desc: 'Resolved flag' }],
    upstream: ['Zendesk'], downstream: ['Customer Satisfaction', 'Customer Insights report'] },
]

const CUSTOMER_NAMES = ['Northwind Logistics', 'Aurora Health', 'Kestrel Bank', 'Meridian Retail', 'Blue Harbor Energy', 'Tandem Mobility', 'Vantage Telecom', 'Orbit Foods', 'Lumen Pharma', 'Cobalt Systems', 'Fjord Insurance', 'Sakura Electronics', 'Andes Mining', 'Pinecrest Education', 'Atlas Freight', 'Zenith Apparel', 'Quartz Media', 'Helix Biotech', 'Nimbus Travel', 'Ironwood Capital']
export const CUSTOMERS = CUSTOMER_NAMES

export type Row = Record<string, string | number | boolean>
export function sampleRows(id: string, n = 60): Row[] {
  const r = rng(id.length * 131 + id.charCodeAt(0))
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]
  const rows: Row[] = []
  for (let i = 0; i < n; i++) {
    const day = 1 + Math.floor(r() * 28)
    const mo = 1 + Math.floor(r() * 10)
    const date = `2026-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const co = pick(CUSTOMER_NAMES)
    switch (id) {
      case 'sales': { const f = FACTS[Math.floor(r() * 96) + 12 * 16]; rows.push({ month: monthLabel(f.m, true), region: f.region, business_unit: f.unit, revenue_usd_k: f.revenue, target_usd_k: f.target, new_customers: f.won, leads: f.leads }); break }
      case 'customers': rows.push({ customer_id: `C-${10400 + i}`, company: co, contact_email: `${co.split(' ')[0].toLowerCase()}.ops@${co.split(' ')[0].toLowerCase()}.com`, segment: pick(SEGMENTS), region: pick(REGIONS), arr_usd: Math.round(20000 + r() * 480000), signed_on: `202${3 + Math.floor(r() * 4)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(day).padStart(2, '0')}`, churned: r() < 0.07 }); break
      case 'orders': rows.push({ order_id: `SO-${88200 + i}`, order_date: date, customer: co, region: pick(REGIONS), category: pick(CATEGORIES), amount_usd: Math.round(4000 + r() * r() * 190000), status: pick(['Fulfilled', 'Fulfilled', 'Fulfilled', 'Processing', 'Backordered', 'Cancelled']) }); break
      case 'products': rows.push({ sku: `HG-${100 + i}`, product: `${pick(['Nexus', 'Halo', 'Prism', 'Vertex', 'Orbit'])} ${pick(['Studio', 'Core', 'Guard', 'Flow', 'Pulse', 'Lens'])}`, category: pick(CATEGORIES), business_unit: pick(UNITS), list_price_usd: Math.round(1200 + r() * 48000), stage: pick(['GA', 'GA', 'GA', 'Beta', 'Sunset']) }); break
      case 'finance': { const f = FACTS[Math.floor(r() * 96) + 12 * 16]; rows.push({ month: monthLabel(f.m, true), region: f.region, business_unit: f.unit, revenue_usd_k: f.revenue, operating_cost_usd_k: f.cost, operating_profit_usd_k: f.revenue - f.cost }); break }
      case 'operations': { const o = OPS[12 * 4 + Math.floor(r() * 48)]; rows.push({ month: monthLabel(o.m, true), team: o.team, sla_compliance_pct: o.sla, throughput: o.throughput, backlog: o.backlog, avg_resolution_h: o.resolutionH }); break }
      default: rows.push({ ticket_id: `T-${70200 + i}`, opened_at: date, customer: co, requester_email: `support@${co.split(' ')[0].toLowerCase()}.com`, priority: pick(['P1', 'P2', 'P2', 'P3', 'P3', 'P4']), csat: Math.ceil(r() * 2 + 3 - r()), resolved: r() < 0.9 })
    }
  }
  return rows
}

// ---------- metrics ----------
export interface Metric {
  id: string; name: string; definition: string; formula: string; aggregation: string; owner: string; domain: string; dataset: string
  frequency: string; target: number; unit: 'usd' | 'pct' | 'num' | 'hrs' | 'score'; certification: 'Certified' | 'In review' | 'Draft' | 'Deprecated'
  updated: string; dashboards: string[]; higherIsBetter: boolean
}
export const METRICS: Metric[] = [
  { id: 'revenue', name: 'Revenue', definition: 'Recognised revenue from all business units in the selected period, net of credits and refunds.', formula: 'SUM(revenue_usd_k)', aggregation: 'Sum', owner: 'Elena Petrova', domain: 'Finance', dataset: 'sales', frequency: 'Monthly', target: 0, unit: 'usd', certification: 'Certified', updated: '2026-10-19', dashboards: ['Executive Overview', 'Financial Overview', 'Sales Analytics'], higherIsBetter: true },
  { id: 'gross-margin', name: 'Gross Margin', definition: 'Share of revenue remaining after direct cost of delivery.', formula: '(SUM(revenue) − SUM(cost)) / SUM(revenue)', aggregation: 'Ratio', owner: 'Elena Petrova', domain: 'Finance', dataset: 'finance', frequency: 'Monthly', target: 0.37, unit: 'pct', certification: 'Certified', updated: '2026-10-19', dashboards: ['Financial Overview', 'Executive Overview'], higherIsBetter: true },
  { id: 'conversion', name: 'Conversion Rate', definition: 'Customers won divided by leads created in the same period.', formula: 'SUM(new_customers) / SUM(leads)', aggregation: 'Ratio', owner: 'Priya Raman', domain: 'Sales', dataset: 'sales', frequency: 'Weekly', target: 0.062, unit: 'pct', certification: 'Certified', updated: '2026-10-12', dashboards: ['Sales Analytics', 'Executive Overview'], higherIsBetter: true },
  { id: 'churn', name: 'Customer Churn', definition: 'Customers lost in the period divided by customers at period start. Retention = 1 − churn.', formula: 'SUM(churned) / customers_at_start', aggregation: 'Ratio', owner: 'Marcus Webb', domain: 'Customer Success', dataset: 'customers', frequency: 'Monthly', target: 0.08, unit: 'pct', certification: 'Certified', updated: '2026-10-05', dashboards: ['Customer Insights', 'Executive Overview'], higherIsBetter: false },
  { id: 'aov', name: 'Average Order Value', definition: 'Mean order amount for non-cancelled orders.', formula: 'AVG(amount_usd) WHERE status != "Cancelled"', aggregation: 'Average', owner: 'Priya Raman', domain: 'Sales', dataset: 'orders', frequency: 'Daily', target: 41000, unit: 'usd', certification: 'In review', updated: '2026-09-28', dashboards: ['Sales Analytics'], higherIsBetter: true },
  { id: 'sla', name: 'SLA Compliance', definition: 'Percentage of work items resolved inside the contractual SLA window.', formula: 'AVG(sla_compliance_pct)', aggregation: 'Average', owner: 'Tomas Alvarez', domain: 'Operations', dataset: 'operations', frequency: 'Daily', target: 95, unit: 'pct', certification: 'Certified', updated: '2026-10-18', dashboards: ['Operations SLA'], higherIsBetter: true },
  { id: 'csat', name: 'Customer Satisfaction', definition: 'Mean CSAT score (1–5) from post-resolution surveys.', formula: 'AVG(csat)', aggregation: 'Average', owner: 'Aisha Khan', domain: 'Customer Support', dataset: 'support', frequency: 'Weekly', target: 4.4, unit: 'score', certification: 'Draft', updated: '2026-08-30', dashboards: ['Customer Insights', 'Operations SLA'], higherIsBetter: true },
]

// ---------- reports ----------
export type SectionType = 'kpi' | 'chart' | 'table' | 'text'
export interface Section { id: string; type: SectionType; title: string; metric?: string; dimension?: string; chart?: 'line' | 'bar' | 'donut'; text?: string }
export interface RunRec { id: string; at: string; status: 'Success' | 'Failed' | 'Running'; durationS: number; trigger: 'Scheduled' | 'Manual'; format: string }
export interface Report {
  id: string; name: string; category: string; owner: string; status: 'Draft' | 'Published' | 'Archived'; updated: string; schedule: string
  sharedWith: string[]; sections: Section[]; runs: RunRec[]; description: string
}
let sid = 0
const S = (type: SectionType, title: string, extra: Partial<Section> = {}): Section => ({ id: `s${++sid}`, type, title, ...extra })
function runs(seed: number, n = 6, failAt = -1): RunRec[] {
  const r = rng(seed)
  return Array.from({ length: n }, (_, i) => ({ id: `run-${seed}-${i}`, at: `2026-10-${String(21 - i * 3).padStart(2, '0')}T07:00:00Z`, status: i === failAt ? 'Failed' as const : 'Success' as const, durationS: Math.round(20 + r() * 80), trigger: i % 3 === 2 ? 'Manual' as const : 'Scheduled' as const, format: i % 2 ? 'PDF' : 'CSV' }))
}
export const REPORT_TEMPLATES: { id: string; name: string; desc: string; category: string; sections: Section[] }[] = [
  { id: 't-exec', name: 'Executive Performance', category: 'Executive', desc: 'Revenue, profit and retention KPIs with regional trend and narrative.', sections: [S('text', 'Summary', { text: 'Headline performance for the selected period.' }), S('kpi', 'Revenue', { metric: 'revenue' }), S('kpi', 'Operating Profit', { metric: 'profit' }), S('chart', 'Revenue trend', { metric: 'revenue', dimension: 'month', chart: 'line' }), S('chart', 'Revenue by region', { metric: 'revenue', dimension: 'region', chart: 'bar' })] },
  { id: 't-sales', name: 'Sales Analytics', category: 'Sales', desc: 'Pipeline conversion, bookings by unit and product category contribution.', sections: [S('kpi', 'Conversion Rate', { metric: 'conversion' }), S('chart', 'Revenue by business unit', { metric: 'revenue', dimension: 'unit', chart: 'bar' }), S('chart', 'Category mix', { metric: 'revenue', dimension: 'category', chart: 'donut' }), S('table', 'Top segments', { metric: 'revenue', dimension: 'region' })] },
  { id: 't-fin', name: 'Financial Overview', category: 'Finance', desc: 'Revenue, cost and margin with budget variance by unit.', sections: [S('kpi', 'Revenue', { metric: 'revenue' }), S('kpi', 'Operating Costs', { metric: 'cost' }), S('kpi', 'Operating Profit', { metric: 'profit' }), S('chart', 'Cost by unit', { metric: 'cost', dimension: 'unit', chart: 'bar' }), S('table', 'Variance by unit', { metric: 'revenue', dimension: 'unit' })] },
  { id: 't-ops', name: 'Operations SLA', category: 'Operations', desc: 'SLA compliance, backlog and resolution time per team.', sections: [S('kpi', 'SLA Compliance', { metric: 'sla' }), S('chart', 'SLA by team', { metric: 'sla', dimension: 'team', chart: 'bar' }), S('text', 'Notes', { text: 'Onboarding has dropped below the 95% target since August.' })] },
  { id: 't-cust', name: 'Customer Insights', category: 'Customer', desc: 'Acquisition, churn and satisfaction by region and segment.', sections: [S('kpi', 'Customer Retention', { metric: 'retention' }), S('chart', 'New customers by region', { metric: 'won', dimension: 'region', chart: 'bar' }), S('chart', 'Customer growth', { metric: 'won', dimension: 'month', chart: 'line' })] },
]
const tpl = (id: string) => REPORT_TEMPLATES.find((t) => t.id === id)!.sections.map((s) => ({ ...s, id: `s${++sid}` }))
export const SEED_REPORTS: Report[] = [
  { id: 'r1', name: 'Q3 Executive Performance Review', category: 'Executive', owner: 'Nadia Okafor', status: 'Published', updated: '2026-10-14', schedule: 'Monthly · 1st, 07:00', sharedWith: ['Executive Team', 'Finance'], description: 'Board-ready summary of Q3 results.', sections: tpl('t-exec'), runs: runs(1) },
  { id: 'r2', name: 'Regional Sales Analytics', category: 'Sales', owner: 'Priya Raman', status: 'Published', updated: '2026-10-18', schedule: 'Weekly · Mon, 06:30', sharedWith: ['Sales Leadership'], description: 'Bookings, conversion and mix by region.', sections: tpl('t-sales'), runs: runs(2, 6, 2) },
  { id: 'r3', name: 'FY26 Financial Overview', category: 'Finance', owner: 'Elena Petrova', status: 'Published', updated: '2026-10-19', schedule: 'Monthly · 3rd, 08:00', sharedWith: ['Finance', 'Executive Team'], description: 'Revenue, cost and margin against plan.', sections: tpl('t-fin'), runs: runs(3) },
  { id: 'r4', name: 'Operations SLA Weekly', category: 'Operations', owner: 'Tomas Alvarez', status: 'Published', updated: '2026-10-20', schedule: 'Weekly · Fri, 16:00', sharedWith: ['Operations'], description: 'SLA compliance by team with backlog.', sections: tpl('t-ops'), runs: runs(4, 6, 0) },
  { id: 'r5', name: 'Customer Retention Deep Dive', category: 'Customer', owner: 'Marcus Webb', status: 'Draft', updated: '2026-10-17', schedule: 'None', sharedWith: [], description: 'Churn drivers by segment and region.', sections: tpl('t-cust'), runs: [] },
  { id: 'r6', name: 'EMEA Enterprise Software Variance', category: 'Sales', owner: 'Jonas Becker', status: 'Draft', updated: '2026-10-20', schedule: 'None', sharedWith: ['Nadia Okafor'], description: 'Investigating the Sep–Oct shortfall.', sections: [S('text', 'Context', { text: 'EMEA Enterprise Software missed plan by 16–20% in Sep and Oct.' }), S('chart', 'EMEA revenue', { metric: 'revenue', dimension: 'month', chart: 'line' })], runs: [] },
  { id: 'r7', name: 'FY25 Annual Financials', category: 'Finance', owner: 'Elena Petrova', status: 'Archived', updated: '2026-01-12', schedule: 'None', sharedWith: ['Finance'], description: 'Prior-year reference.', sections: tpl('t-fin'), runs: runs(7, 3) },
  { id: 'r8', name: 'Customer Support Quality', category: 'Customer', owner: 'Aisha Khan', status: 'Published', updated: '2026-10-09', schedule: 'Monthly · 5th, 09:00', sharedWith: ['Support'], description: 'CSAT and resolution time by priority.', sections: tpl('t-cust'), runs: runs(8) },
]

// ---------- saved analyses & queries ----------
export interface SavedAnalysis { id: string; name: string; dataset: string; metrics: string[]; dimension: string; chart: 'line' | 'bar' | 'donut' | 'table'; region: string; unit: string; owner: string; updated: string; compare: boolean }
export const SEED_ANALYSES: SavedAnalysis[] = [
  { id: 'a1', name: 'Revenue by region – trailing 12M', dataset: 'sales', metrics: ['revenue'], dimension: 'region', chart: 'bar', region: 'All', unit: 'All', owner: 'Priya Raman', updated: '2026-10-16', compare: true },
  { id: 'a2', name: 'Margin by business unit', dataset: 'finance', metrics: ['profit'], dimension: 'unit', chart: 'bar', region: 'All', unit: 'All', owner: 'Elena Petrova', updated: '2026-10-12', compare: false },
  { id: 'a3', name: 'EMEA monthly revenue', dataset: 'sales', metrics: ['revenue'], dimension: 'month', chart: 'line', region: 'EMEA', unit: 'All', owner: 'Jonas Becker', updated: '2026-10-20', compare: true },
]
export interface SavedQuery { id: string; name: string; dataset: string; filter: string; owner: string }
export const SEED_QUERIES: SavedQuery[] = [
  { id: 'q1', name: 'Large EMEA orders', dataset: 'orders', filter: 'EMEA', owner: 'Jonas Becker' },
  { id: 'q2', name: 'Churned enterprise accounts', dataset: 'customers', filter: 'Enterprise', owner: 'Marcus Webb' },
]

// ---------- data sources ----------
export interface Connector { id: string; name: string; kind: 'Database' | 'Warehouse' | 'File' | 'API' | 'SaaS'; desc: string; fields: { key: string; label: string; placeholder: string; type?: 'text' | 'number' | 'password' | 'url'; required?: boolean }[] }
const dbFields = (port: string) => [{ key: 'host', label: 'Host', placeholder: 'db.example.com', required: true }, { key: 'port', label: 'Port', placeholder: port, type: 'number' as const, required: true }, { key: 'database', label: 'Database', placeholder: 'analytics', required: true }]
export const CONNECTORS: Connector[] = [
  { id: 'postgres', name: 'PostgreSQL', kind: 'Database', desc: 'Relational database, read replicas supported.', fields: dbFields('5432') },
  { id: 'mysql', name: 'MySQL', kind: 'Database', desc: 'MySQL 5.7+ and MariaDB.', fields: dbFields('3306') },
  { id: 'mssql', name: 'Microsoft SQL Server', kind: 'Database', desc: 'On-prem and Azure SQL.', fields: dbFields('1433') },
  { id: 'snowflake', name: 'Snowflake', kind: 'Warehouse', desc: 'Cloud data warehouse.', fields: [{ key: 'host', label: 'Account URL', placeholder: 'acme.snowflakecomputing.com', required: true }, { key: 'database', label: 'Database', placeholder: 'ANALYTICS', required: true }, { key: 'warehouse', label: 'Warehouse', placeholder: 'COMPUTE_WH', required: true }] },
  { id: 'bigquery', name: 'BigQuery', kind: 'Warehouse', desc: 'Google Cloud serverless warehouse.', fields: [{ key: 'project', label: 'Project ID', placeholder: 'my-project-123', required: true }, { key: 'dataset', label: 'Default dataset', placeholder: 'analytics', required: true }] },
  { id: 'redshift', name: 'Amazon Redshift', kind: 'Warehouse', desc: 'AWS columnar warehouse.', fields: dbFields('5439') },
  { id: 'excel', name: 'Microsoft Excel', kind: 'File', desc: 'Workbooks from OneDrive or SharePoint.', fields: [{ key: 'path', label: 'Workbook URL', placeholder: 'https://contoso.sharepoint.com/…', type: 'url', required: true }, { key: 'sheet', label: 'Sheet name', placeholder: 'Sheet1', required: true }] },
  { id: 'csv', name: 'CSV Upload', kind: 'File', desc: 'One-off or recurring file uploads.', fields: [{ key: 'path', label: 'File name', placeholder: 'forecast_2027.csv', required: true }, { key: 'delimiter', label: 'Delimiter', placeholder: ',', required: true }] },
  { id: 'rest', name: 'REST API', kind: 'API', desc: 'JSON endpoints with pagination.', fields: [{ key: 'url', label: 'Base URL', placeholder: 'https://api.example.com/v1', type: 'url', required: true }, { key: 'path', label: 'Resource path', placeholder: '/orders', required: true }] },
  { id: 'salesforce', name: 'Salesforce', kind: 'SaaS', desc: 'CRM objects via OAuth.', fields: [{ key: 'url', label: 'Instance URL', placeholder: 'https://acme.my.salesforce.com', type: 'url', required: true }, { key: 'objects', label: 'Objects', placeholder: 'Account, Opportunity', required: true }] },
]
export interface Connection { id: string; connectorId: string; name: string; status: 'Connected' | 'Error' | 'Syncing' | 'Paused'; lastSync: string; tables: number; schedule: string; owner: string; error?: string }
export const SEED_CONNECTIONS: Connection[] = [
  { id: 'c1', connectorId: 'salesforce', name: 'Salesforce CRM', status: 'Connected', lastSync: '2026-10-21T06:00:00Z', tables: 14, schedule: 'Every hour', owner: 'Priya Raman' },
  { id: 'c2', connectorId: 'snowflake', name: 'Snowflake – Finance Warehouse', status: 'Syncing', lastSync: '2026-10-21T06:20:00Z', tables: 38, schedule: 'Every 30 min', owner: 'Dmitri Volkov' },
  { id: 'c3', connectorId: 'postgres', name: 'Billing (Stripe replica)', status: 'Connected', lastSync: '2026-10-21T05:45:00Z', tables: 9, schedule: 'Every 15 min', owner: 'Dmitri Volkov' },
  { id: 'c4', connectorId: 'mssql', name: 'NetSuite ERP export', status: 'Error', lastSync: '2026-10-20T21:00:00Z', tables: 22, schedule: 'Daily 02:00', owner: 'Dmitri Volkov', error: 'Login failed for user "svc_nexus". Credentials were rotated on 20 Oct.' },
  { id: 'c5', connectorId: 'rest', name: 'Zendesk Tickets API', status: 'Paused', lastSync: '2026-10-14T10:00:00Z', tables: 4, schedule: 'Every 6 hours', owner: 'Aisha Khan' },
]

// ---------- pipelines ----------
export type PStatus = 'Success' | 'Running' | 'Warning' | 'Failed'
export interface PRun { id: string; start: string; durationS: number; status: PStatus; rows: number; log: string }
export interface Pipeline { id: string; name: string; source: string; destination: string; schedule: string; status: PStatus; owner: string; steps: string[]; dependsOn: string[]; runs: PRun[] }
function pruns(seed: number, latest: PStatus, log?: string): PRun[] {
  const r = rng(seed)
  return Array.from({ length: 8 }, (_, i) => {
    const status: PStatus = i === 0 ? latest : r() < 0.08 ? 'Warning' : 'Success'
    const failed = status === 'Failed'
    return { id: `pr-${seed}-${i}`, start: `2026-10-${String(21 - Math.floor(i / 2)).padStart(2, '0')}T${i % 2 ? '18' : '06'}:00:00Z`, durationS: Math.round(60 + r() * 540), status, rows: failed ? 0 : Math.round(20000 + r() * 400000),
      log: failed ? (log ?? 'Step failed') : status === 'Warning' ? 'Completed with 214 rows quarantined (null customer_id).' : status === 'Running' ? 'Running transform step 2 of 4…' : 'Completed successfully.' }
  })
}
export const SEED_PIPELINES: Pipeline[] = [
  { id: 'pl_revenue_daily', name: 'Revenue daily load', source: 'NetSuite ERP', destination: 'Warehouse · finance.revenue', schedule: 'Daily 02:00', status: 'Failed', owner: 'Dmitri Volkov', steps: ['Extract', 'Currency normalise', 'Deduplicate', 'Load'], dependsOn: [], runs: pruns(11, 'Failed', 'Extract failed: Login failed for user "svc_nexus" (SQL Server error 18456). Retry after credentials are updated.') },
  { id: 'pl_crm_sync', name: 'CRM account sync', source: 'Salesforce', destination: 'Warehouse · crm.accounts', schedule: 'Hourly', status: 'Success', owner: 'Priya Raman', steps: ['Extract', 'Map fields', 'Load'], dependsOn: [], runs: pruns(12, 'Success') },
  { id: 'pl_billing', name: 'Billing events', source: 'Stripe replica', destination: 'Warehouse · billing.events', schedule: 'Every 15 min', status: 'Success', owner: 'Dmitri Volkov', steps: ['Extract', 'Filter test accounts', 'Load'], dependsOn: [], runs: pruns(13, 'Success') },
  { id: 'pl_sales_mart', name: 'Sales mart build', source: 'crm.accounts + finance.revenue', destination: 'Mart · sales', schedule: 'After upstream', status: 'Running', owner: 'Dmitri Volkov', steps: ['Join', 'Aggregate monthly', 'Apply targets', 'Publish'], dependsOn: ['pl_revenue_daily', 'pl_crm_sync'], runs: pruns(14, 'Running') },
  { id: 'pl_customer_360', name: 'Customer 360', source: 'crm.accounts + billing.events', destination: 'Mart · customers', schedule: 'Daily 04:00', status: 'Warning', owner: 'Marcus Webb', steps: ['Join', 'Resolve duplicates', 'Score health', 'Publish'], dependsOn: ['pl_crm_sync', 'pl_billing'], runs: pruns(15, 'Warning') },
  { id: 'pl_ops_sla', name: 'Ops SLA rollup', source: 'ServiceNow', destination: 'Mart · operations', schedule: 'Every 2 hours', status: 'Success', owner: 'Tomas Alvarez', steps: ['Extract', 'Compute SLA', 'Publish'], dependsOn: [], runs: pruns(16, 'Success') },
  { id: 'pl_support', name: 'Support tickets', source: 'Zendesk API', destination: 'Warehouse · support.tickets', schedule: 'Every 6 hours', status: 'Warning', owner: 'Aisha Khan', steps: ['Extract', 'Mask PII', 'Load'], dependsOn: [], runs: pruns(17, 'Warning') },
  { id: 'pl_forecast', name: 'Forecast features', source: 'Mart · sales + finance', destination: 'Mart · forecast', schedule: 'Daily 05:00', status: 'Success', owner: 'Dmitri Volkov', steps: ['Join', 'Seasonality features', 'Publish'], dependsOn: ['pl_sales_mart'], runs: pruns(18, 'Success') },
]

// ---------- data quality ----------
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
export interface QRule { id: string; name: string; dataset: string; column: string; check: 'Completeness' | 'Uniqueness' | 'Freshness' | 'Validity' | 'Schema' | 'Accuracy'; threshold: number; severity: Severity; enabled: boolean; passRate: number }
export const SEED_RULES: QRule[] = [
  { id: 'qr1', name: 'customer_id not null', dataset: 'customers', column: 'customer_id', check: 'Completeness', threshold: 99.9, severity: 'Critical', enabled: true, passRate: 99.2 },
  { id: 'qr2', name: 'order_id unique', dataset: 'orders', column: 'order_id', check: 'Uniqueness', threshold: 100, severity: 'High', enabled: true, passRate: 99.6 },
  { id: 'qr3', name: 'finance.revenue refreshed < 6h', dataset: 'finance', column: 'month', check: 'Freshness', threshold: 100, severity: 'High', enabled: true, passRate: 82.0 },
  { id: 'qr4', name: 'amount_usd > 0', dataset: 'orders', column: 'amount_usd', check: 'Validity', threshold: 99.5, severity: 'Medium', enabled: true, passRate: 99.8 },
  { id: 'qr5', name: 'ticket csat between 1–5', dataset: 'support', column: 'csat', check: 'Validity', threshold: 99, severity: 'Medium', enabled: true, passRate: 96.4 },
  { id: 'qr6', name: 'Revenue ties to GL', dataset: 'sales', column: 'revenue_usd_k', check: 'Accuracy', threshold: 99.5, severity: 'High', enabled: true, passRate: 99.7 },
  { id: 'qr7', name: 'products schema stable', dataset: 'products', column: '*', check: 'Schema', threshold: 100, severity: 'Low', enabled: false, passRate: 100 },
]
export interface QIssue { id: string; title: string; dataset: string; rule: string; severity: Severity; status: 'Open' | 'Investigating' | 'Resolved'; owner: string; opened: string; affected: number; notes: { at: string; by: string; text: string }[]; records: { id: string; field: string; value: string; problem: string }[] }
export const SEED_ISSUES: QIssue[] = [
  { id: 'DQ-114', title: 'Finance revenue table is 9 hours stale', dataset: 'finance', rule: 'qr3', severity: 'Critical', status: 'Investigating', owner: 'Dmitri Volkov', opened: '2026-10-21', affected: 2304, notes: [{ at: '2026-10-21T06:30:00Z', by: 'System', text: 'Freshness SLA breached: last successful load 20 Oct 21:00 UTC.' }, { at: '2026-10-21T07:05:00Z', by: 'Dmitri Volkov', text: 'Root cause: SQL Server service account password rotated. Waiting on new secret.' }], records: [{ id: 'finance/2026-10', field: 'month', value: 'Oct 2026', problem: 'Partial month, last load 20 Oct' }] },
  { id: 'DQ-113', title: 'Null customer_id in CRM account sync', dataset: 'customers', rule: 'qr1', severity: 'High', status: 'Open', owner: 'Marcus Webb', opened: '2026-10-20', affected: 214, notes: [{ at: '2026-10-20T18:10:00Z', by: 'System', text: '214 rows quarantined by pipeline Customer 360.' }], records: [{ id: 'row 10412', field: 'customer_id', value: '(null)', problem: 'Missing key' }, { id: 'row 10977', field: 'customer_id', value: '(null)', problem: 'Missing key' }, { id: 'row 11203', field: 'customer_id', value: '', problem: 'Empty string' }] },
  { id: 'DQ-112', title: 'Duplicate order IDs from Shopify retries', dataset: 'orders', rule: 'qr2', severity: 'Medium', status: 'Open', owner: 'Priya Raman', opened: '2026-10-18', affected: 71, notes: [], records: [{ id: 'SO-88217', field: 'order_id', value: 'SO-88217', problem: 'Appears 2 times' }, { id: 'SO-88301', field: 'order_id', value: 'SO-88301', problem: 'Appears 3 times' }] },
  { id: 'DQ-111', title: 'CSAT scores outside 1–5 range', dataset: 'support', rule: 'qr5', severity: 'Medium', status: 'Investigating', owner: 'Aisha Khan', opened: '2026-10-15', affected: 1884, notes: [{ at: '2026-10-16T09:00:00Z', by: 'Aisha Khan', text: 'Zendesk survey v2 emits 0–10 scale for some brands.' }], records: [{ id: 'T-70912', field: 'csat', value: '9', problem: 'Above max 5' }, { id: 'T-70990', field: 'csat', value: '0', problem: 'Below min 1' }] },
  { id: 'DQ-109', title: 'Region typo "Emea " with trailing space', dataset: 'sales', rule: 'qr6', severity: 'Low', status: 'Resolved', owner: 'Priya Raman', opened: '2026-10-02', affected: 12, notes: [{ at: '2026-10-03T11:00:00Z', by: 'Priya Raman', text: 'Added TRIM + UPPER normalisation in sales mart. Resolved.' }], records: [] },
]
export const FRESHNESS = [
  { dataset: 'Sales', expectedH: 6, ageH: 0.3 }, { dataset: 'Customers', expectedH: 6, ageH: 0.9 }, { dataset: 'Orders', expectedH: 6, ageH: 0.3 }, { dataset: 'Finance', expectedH: 6, ageH: 9.1 },
  { dataset: 'Operations', expectedH: 4, ageH: 0.5 }, { dataset: 'Customer Support', expectedH: 12, ageH: 7.2 }, { dataset: 'Products', expectedH: 24, ageH: 8.4 },
]

// ---------- users & audit ----------
export interface User { id: string; name: string; email: string; role: RoleName; team: string; status: 'Active' | 'Invited' | 'Suspended'; lastActive: string; mfa: boolean }
export const SEED_USERS: User[] = [
  { id: 'u1', name: 'Nadia Okafor', email: 'nadia.okafor@halcyon.com', role: 'Executive', team: 'Executive Team', status: 'Active', lastActive: '2026-10-21T07:10:00Z', mfa: true },
  { id: 'u2', name: 'Priya Raman', email: 'priya.raman@halcyon.com', role: 'Business Analyst', team: 'Revenue Operations', status: 'Active', lastActive: '2026-10-21T08:02:00Z', mfa: true },
  { id: 'u3', name: 'Tomas Alvarez', email: 'tomas.alvarez@halcyon.com', role: 'Operations Manager', team: 'Operations', status: 'Active', lastActive: '2026-10-21T06:48:00Z', mfa: true },
  { id: 'u4', name: 'Elena Petrova', email: 'elena.petrova@halcyon.com', role: 'Finance Manager', team: 'Finance', status: 'Active', lastActive: '2026-10-20T17:30:00Z', mfa: true },
  { id: 'u5', name: 'Dmitri Volkov', email: 'dmitri.volkov@halcyon.com', role: 'Data Engineer', team: 'Data Platform', status: 'Active', lastActive: '2026-10-21T07:45:00Z', mfa: true },
  { id: 'u6', name: 'Sofia Marin', email: 'sofia.marin@halcyon.com', role: 'Administrator', team: 'IT Security', status: 'Active', lastActive: '2026-10-21T05:20:00Z', mfa: true },
  { id: 'u7', name: 'Marcus Webb', email: 'marcus.webb@halcyon.com', role: 'Business Analyst', team: 'Customer Success', status: 'Active', lastActive: '2026-10-20T15:12:00Z', mfa: false },
  { id: 'u8', name: 'Aisha Khan', email: 'aisha.khan@halcyon.com', role: 'Operations Manager', team: 'Customer Support', status: 'Active', lastActive: '2026-10-19T11:00:00Z', mfa: true },
  { id: 'u9', name: 'Jonas Becker', email: 'jonas.becker@halcyon.com', role: 'Business Analyst', team: 'EMEA Sales', status: 'Active', lastActive: '2026-10-21T08:15:00Z', mfa: true },
  { id: 'u10', name: 'Hana Ito', email: 'hana.ito@halcyon.com', role: 'Business Analyst', team: 'Product Management', status: 'Active', lastActive: '2026-10-18T09:40:00Z', mfa: true },
  { id: 'u11', name: 'Leo Fernandes', email: 'leo.fernandes@halcyon.com', role: 'Finance Manager', team: 'LATAM Finance', status: 'Suspended', lastActive: '2026-09-02T10:00:00Z', mfa: false },
  { id: 'u12', name: 'Grace Liu', email: 'grace.liu@halcyon.com', role: 'Data Engineer', team: 'Data Platform', status: 'Invited', lastActive: '', mfa: false },
]
export interface Audit { id: string; at: string; actor: string; action: string; target: string; ip: string; result: 'Success' | 'Denied' | 'Failed' }
export const SEED_AUDIT: Audit[] = (() => {
  const r = rng(404)
  const acts: [string, string, string][] = [
    ['Sofia Marin', 'role.update', 'Role · Finance Manager'], ['Priya Raman', 'report.publish', 'Regional Sales Analytics'], ['Dmitri Volkov', 'pipeline.retry', 'Revenue daily load'],
    ['Nadia Okafor', 'report.view', 'Q3 Executive Performance Review'], ['Marcus Webb', 'dataset.export', 'Customers (CSV)'], ['Sofia Marin', 'user.invite', 'grace.liu@halcyon.com'],
    ['Elena Petrova', 'scenario.save', 'FY27 Base Case'], ['Jonas Becker', 'analysis.save', 'EMEA monthly revenue'], ['Aisha Khan', 'source.pause', 'Zendesk Tickets API'],
    ['Leo Fernandes', 'dataset.read', 'Finance (denied: Restricted)'], ['Sofia Marin', 'user.suspend', 'Leo Fernandes'], ['Dmitri Volkov', 'source.update', 'NetSuite ERP export'],
    ['Tomas Alvarez', 'report.schedule', 'Operations SLA Weekly'], ['Hana Ito', 'metric.edit', 'Average Order Value'], ['Sofia Marin', 'settings.update', 'Session timeout → 30 min'],
  ]
  return Array.from({ length: 40 }, (_, i) => {
    const a = acts[i % acts.length]
    const denied = a[1] === 'dataset.read'
    return { id: `au${i}`, at: new Date(Date.parse('2026-10-21T08:30:00Z') - i * 3600e3 * (1 + r() * 3)).toISOString(), actor: a[0], action: a[1], target: a[2], ip: `10.${Math.floor(r() * 30)}.${Math.floor(r() * 250)}.${Math.floor(r() * 250)}`, result: denied ? 'Denied' as const : r() < 0.05 ? 'Failed' as const : 'Success' as const }
  })
})()

// ---------- collaboration ----------
export interface DAction { id: string; text: string; owner: string; due: string; done: boolean }
export interface Decision {
  id: string; title: string; summary: string; status: 'Proposed' | 'Approved' | 'In progress' | 'Done' | 'Rejected'; owner: string; due: string; progress: number
  evidence: { label: string; href: string }[]; actions: DAction[]; created: string
}
export const SEED_DECISIONS: Decision[] = [
  { id: 'D-21', title: 'Launch EMEA enterprise recovery plan', summary: 'Enterprise Software in EMEA missed plan by ~16–20% in Sep–Oct. Approve targeted discounting and two additional solution architects.', status: 'In progress', owner: 'Nadia Okafor', due: '2026-11-15', progress: 40, created: '2026-10-19', evidence: [{ label: 'EMEA monthly revenue (analysis)', href: '#/analytics' }, { label: 'EMEA Enterprise Software Variance (report)', href: '#/reports' }], actions: [{ id: 'a1', text: 'Draft discount guardrails', owner: 'Jonas Becker', due: '2026-10-28', done: true }, { id: 'a2', text: 'Open 2 SA requisitions', owner: 'Nadia Okafor', due: '2026-11-04', done: false }, { id: 'a3', text: 'Weekly pipeline review', owner: 'Priya Raman', due: '2026-11-15', done: false }] },
  { id: 'D-20', title: 'Increase Onboarding headcount by 4', summary: 'Onboarding SLA compliance fell below 95% since August as backlog grew by ~90 items.', status: 'Proposed', owner: 'Tomas Alvarez', due: '2026-11-01', progress: 0, created: '2026-10-17', evidence: [{ label: 'Operations SLA Weekly', href: '#/reports' }, { label: 'SLA Compliance metric', href: '#/metrics' }], actions: [{ id: 'a4', text: 'Submit headcount case to Finance', owner: 'Tomas Alvarez', due: '2026-10-30', done: false }] },
  { id: 'D-19', title: 'Certify the CSAT metric', summary: 'Define a single CSAT scale (1–5) before certification; fix Zendesk survey v2.', status: 'Approved', owner: 'Aisha Khan', due: '2026-11-10', progress: 20, created: '2026-10-15', evidence: [{ label: 'DQ-111 – CSAT out of range', href: '#/quality' }], actions: [{ id: 'a5', text: 'Normalise survey v2 scale', owner: 'Dmitri Volkov', due: '2026-11-03', done: false }] },
  { id: 'D-18', title: 'Shift APAC marketing budget to Cloud Platform', summary: 'APAC Cloud Platform is running ~6% above the prior trend since Apr 2026.', status: 'Done', owner: 'Elena Petrova', due: '2026-10-01', progress: 100, created: '2026-08-20', evidence: [{ label: 'Revenue by region (analysis)', href: '#/analytics' }], actions: [{ id: 'a6', text: 'Reallocate Q4 budget', owner: 'Elena Petrova', due: '2026-09-25', done: true }] },
  { id: 'D-17', title: 'Adopt Snowflake as the single finance warehouse', summary: 'Retire two legacy marts to remove conflicting revenue definitions.', status: 'Rejected', owner: 'Dmitri Volkov', due: '2026-09-30', progress: 0, created: '2026-08-05', evidence: [], actions: [] },
]
export interface Msg { id: string; author: string; text: string; at: string }
export interface Thread { id: string; target: string; targetType: 'Report' | 'Chart' | 'Dataset' | 'Decision'; messages: Msg[]; resolved: boolean; annotation?: string }
export const SEED_THREADS: Thread[] = [
  { id: 'th1', target: 'Revenue by region', targetType: 'Chart', resolved: false, annotation: 'Sep 26 – EMEA dip', messages: [{ id: 'm1', author: 'Nadia Okafor', text: '@Jonas Becker what is driving the EMEA drop in September?', at: '2026-10-19T09:10:00Z' }, { id: 'm2', author: 'Jonas Becker', text: 'Three Enterprise Software renewals slipped to Q4. Details are in the variance report.', at: '2026-10-19T10:02:00Z' }] },
  { id: 'th2', target: 'Operations SLA Weekly', targetType: 'Report', resolved: false, messages: [{ id: 'm3', author: 'Tomas Alvarez', text: 'Onboarding is at 90.1% SLA. Proposing headcount decision D-20.', at: '2026-10-20T14:30:00Z' }] },
  { id: 'th3', target: 'Customers', targetType: 'Dataset', resolved: true, messages: [{ id: 'm4', author: 'Marcus Webb', text: '@Dmitri Volkov can we mask contact_email for analysts?', at: '2026-10-10T08:00:00Z' }, { id: 'm5', author: 'Dmitri Volkov', text: 'Done: masked for the Business Analyst role.', at: '2026-10-10T09:15:00Z' }] },
]

export interface Notification { id: string; type: 'report' | 'pipeline' | 'freshness' | 'share' | 'mention' | 'action'; title: string; body: string; at: string; read: boolean; href: string }
export const SEED_NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'pipeline', title: 'Pipeline failed: Revenue daily load', body: 'Extract step failed with a login error. Retry after updating credentials.', at: '2026-10-21T02:04:00Z', read: false, href: '#/pipelines' },
  { id: 'n2', type: 'freshness', title: 'Finance dataset is stale', body: 'Last refresh was 9 hours ago (SLA 6 hours).', at: '2026-10-21T06:30:00Z', read: false, href: '#/quality' },
  { id: 'n3', type: 'mention', title: 'Nadia Okafor mentioned you', body: '“what is driving the EMEA drop in September?”', at: '2026-10-19T09:10:00Z', read: false, href: '#/collaboration' },
  { id: 'n4', type: 'action', title: 'Action assigned: Open 2 SA requisitions', body: 'Due 4 Nov 2026 · Decision D-21', at: '2026-10-19T12:00:00Z', read: false, href: '#/collaboration' },
  { id: 'n5', type: 'report', title: 'Report completed: Operations SLA Weekly', body: 'Run finished in 41s. PDF is ready.', at: '2026-10-16T16:01:00Z', read: true, href: '#/reports' },
  { id: 'n6', type: 'share', title: 'Priya Raman shared a report', body: 'Regional Sales Analytics was shared with you.', at: '2026-10-14T09:30:00Z', read: true, href: '#/reports' },
]

export const RECENT_ITEMS = [
  { label: 'Q3 Executive Performance Review', kind: 'Report', href: '#/reports', when: '2h ago' },
  { label: 'Regional Sales Analytics', kind: 'Report', href: '#/reports', when: 'Yesterday' },
  { label: 'Operations SLA Weekly', kind: 'Report', href: '#/reports', when: 'Yesterday' },
  { label: 'FY26 Financial Overview', kind: 'Report', href: '#/reports', when: '2d ago' },
]
