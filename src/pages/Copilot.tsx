import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, MessageSquare, Send, Share2, Sparkles, ThumbsDown, ThumbsUp, Trash2, FilePlus2 } from 'lucide-react'
import { useStore, uid, type ChatMsg } from '../lib/store'
import { DATASETS, FACTS, FRESHNESS, METRICS, OPS, REGIONS, TODAY, UNITS, monthLabel, type Pipeline, type QIssue, type Report } from '../lib/data'
import { DEFAULT_FILTERS, breakdown, filterSummary, fmtMoney, fmtNum, fmtPct, forecastSeries, kpi, metricValue, monthlySeries, pick, prevWindow, rangeLabel, underperformers, type Filters } from '../lib/analytics'
import { Badge, Banner, Button, Card, DateRangePicker, EmptyState, Field, FilterBar, Modal, PageHeader, ReadOnlyNote, Select, Textarea, cx } from '../components/ui'
import { BarList, LineChart } from '../components/charts'
import { Link, go } from '../lib/router'

// ---------- answer model (stored in ChatMsg.payload; JSON-serialisable) ----------
type Fmt = 'usd' | 'pct' | 'num' | 'sla' | 'hrs'
interface ChartSpec { type: 'line' | 'bar'; title: string; labels: string[]; series: { name: string; values: (number | null)[]; dashed?: boolean; band?: { lo: (number | null)[]; hi: (number | null)[] } }[]; fmt: Fmt }
interface Answer {
  kind: 'answer' | 'fallback' | 'error'; intent: string; question: string; headline: string; bullets: string[]
  stats: { label: string; value: string; tone?: 'good' | 'bad' }[]; chart?: ChartSpec
  sources: { datasets: string[]; formula: string; period: string; filters: string; method?: string }
  confidence: 'High' | 'Medium' | 'Low'; confidenceWhy: string; caveat?: string; followUps: string[]; feedback?: 'up' | 'down'
}
const FMT: Record<Fmt, (v: number) => string> = { usd: fmtMoney, pct: (v) => fmtPct(v), num: fmtNum, sla: (v) => `${v.toFixed(1)}%`, hrs: (v) => `${v.toFixed(1)}h` }
const sp = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}%`
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const dsName = (id: string) => DATASETS.find((d) => d.id === id)?.name ?? id

const SUGGESTED = [
  'Why did revenue change?',
  'Which segment is underperforming?',
  'What are the top growth opportunities?',
  'How is customer churn trending?',
  'What is the revenue forecast for the next quarter?',
  'Are there data quality caveats I should know about?',
  'Is the Onboarding SLA getting worse?',
  'Give me an executive summary',
]
const CAPABILITIES = [
  'Revenue changes and their drivers', 'Underperforming segments vs target', 'Growth opportunities', 'Customer churn and retention',
  'Revenue forecast (next 6 months)', 'Profit and margin', 'Operations and SLA (Onboarding)', 'Data quality and freshness caveats', 'Executive summary',
]

// ---------- intent matcher ----------
const INTENTS: { id: string; strong: RegExp; weak: RegExp }[] = [
  { id: 'dq', strong: /data quality|\bdq\b|stale|fresh|trust|reliab|caveat|caution|pipeline|data issue/i, weak: /accura|issue|source|lineage|freshness/i },
  { id: 'sla', strong: /\bsla\b|onboarding|backlog|resolution time|support team|ticket/i, weak: /operations?|team|service level/i },
  { id: 'churn', strong: /churn|retention|retain|attrition|lost customers|cancell/i, weak: /customers?/i },
  { id: 'forecast', strong: /forecast|predict|projection|project(ed)?\b|outlook|next (quarter|month|\d+ months?)|will (we|revenue)/i, weak: /expect|future|trend/i },
  { id: 'opps', strong: /opportunit|growth|grow(ing)?\b|boost|fastest|outperform|upside|bright spot|best perform/i, weak: /best|top|win/i },
  { id: 'under', strong: /underperform|under-perform|weak|behind|miss(ing|ed)?\b|worst|lagging|below (target|plan)|shortfall|struggl/i, weak: /segment|target|plan/i },
  { id: 'margin', strong: /margin|profit|cost|expens|profitab/i, weak: /finance|spend/i },
  { id: 'change', strong: /why .*(revenue|sales)|(revenue|sales) .*(change|drop|declin|fell|fall|down|up|increase|dip)|what('s| is) driv|\bdrop(ped)?\b|\bdip\b|declin/i, weak: /why|revenue|sales|driver|reason|cause|change/i },
  { id: 'summary', strong: /summary|overview|how (are|is) (we|the business)|recap|brief me|health/i, weak: /performance|status|headline/i },
]
function matchIntent(q: string): string | null {
  let best: string | null = null, top = 0
  for (const it of INTENTS) {
    const s = (it.strong.test(q) ? 3 : 0) + (it.weak.test(q) ? 1 : 0)
    if (s > top) { top = s; best = it.id }
  }
  return top >= 1 ? best : null
}
function scopeFrom(q: string, base: Filters): { f: Filters; notes: string[] } {
  const t = q.toLowerCase()
  const f = { ...base }
  const notes: string[] = []
  const reg = t.includes('emea') ? 'EMEA' : t.includes('apac') ? 'APAC' : t.includes('latam') ? 'LATAM' : /north america|\bna\b/.test(t) ? 'North America' : null
  if (reg && (REGIONS as readonly string[]).includes(reg)) { f.region = reg; notes.push(`region set to ${reg} from your question`) }
  const un = /enterprise software/.test(t) ? 'Enterprise Software' : /cloud/.test(t) ? 'Cloud Platform' : /data (&|and) ai/.test(t) ? 'Data & AI' : /professional services/.test(t) ? 'Professional Services' : null
  if (un && (UNITS as readonly string[]).includes(un)) { f.unit = un; notes.push(`business unit set to ${un} from your question`) }
  if (/last (3|three) months|last quarter|past quarter/.test(t)) { f.start = 21; f.end = 23; notes.push('period set to the last 3 months') }
  else if (/last (6|six) months|half[- ]year/.test(t)) { f.start = 18; f.end = 23; notes.push('period set to the last 6 months') }
  return { f, notes }
}

interface Ctx { issues: QIssue[]; pipelines: Pipeline[] }
function segDiffs(f: Filters) {
  const pw = prevWindow(f)
  const rows: { name: string; cur: number; prev: number; diff: number; g: number }[] = []
  for (const r of REGIONS) for (const u of UNITS) {
    if ((f.region !== 'All' && f.region !== r) || (f.unit !== 'All' && f.unit !== u)) continue
    const cur = metricValue(pick({ ...f, region: r, unit: u }), 'revenue'), prev = metricValue(pick({ ...f, region: r, unit: u }, pw.start, pw.end), 'revenue')
    rows.push({ name: `${r} · ${u}`, cur, prev, diff: cur - prev, g: prev ? cur / prev - 1 : 0 })
  }
  return rows
}
const onbSeries = () => OPS.filter((o) => o.team === 'Onboarding' && o.m >= 12)

function buildAnswer(question: string, base: Filters, ctx: Ctx): Answer {
  const { f, notes } = scopeFrom(question, base)
  const intent = matchIntent(question)
  const span = f.end - f.start + 1
  const pw = prevWindow(f)
  const filt = filterSummary(f) + (notes.length ? ` (${notes.join('; ')})` : '')
  const period = `${monthLabel(f.start, true)} – ${monthLabel(f.end, true)} (${rangeLabel(f)}) vs ${monthLabel(pw.start, true)} – ${monthLabel(pw.end, true)}`
  const finStale = ctx.issues.find((i) => i.id === 'DQ-114' && i.status !== 'Resolved')
  const dq113 = ctx.issues.find((i) => i.id === 'DQ-113' && i.status !== 'Resolved')
  const finCaveat = finStale ? 'DQ-114: the Finance dataset is about 9 hours stale, so cost, profit and margin figures may lag the latest month.' : undefined
  const base0 = { question, kind: 'answer' as const }

  if (intent === 'change') {
    const rev = kpi(f, 'revenue')
    const diffs = segDiffs(f).sort((a, b) => a.diff - b.diff)
    const recent = underperformers({ ...f, start: 22, end: 23 })
    const w = recent[0]
    const attain = metricValue(pick(f), 'attainment')
    const labels = monthlySeries(f, 'revenue')
    const bullets = [
      `Total revenue was ${rev.text} versus ${rev.prevText} in the previous ${span} months (${rev.delta.text}); plan attainment was ${fmtPct(attain)}.`,
      diffs.length ? `Biggest contributor to growth: ${diffs[diffs.length - 1].name}, ${diffs[diffs.length - 1].diff >= 0 ? '+' : '−'}${fmtMoney(Math.abs(diffs[diffs.length - 1].diff))} (${sp(diffs[diffs.length - 1].g)}).` : '',
      diffs.length && diffs[0].diff < 0 ? `Largest decline over the full period: ${diffs[0].name}, −${fmtMoney(Math.abs(diffs[0].diff))} (${sp(diffs[0].g)}).` : 'No segment declined versus the previous period over the full window.',
      ...recent.filter((r) => r.gap < -0.05).slice(0, 2).map((r) => `Last two months (${monthLabel(22)}–${monthLabel(23)}): ${r.region} · ${r.unit} delivered ${fmtMoney(r.revenue)} against a ${fmtMoney(r.target)} target (${sp(r.gap)}).`),
    ].filter(Boolean)
    return { ...base0, intent: 'change', headline: w && w.gap < -0.05 ? `Revenue is ${rev.text} (${rev.delta.text}), but the last two months are being pulled down by ${w.region} · ${w.unit}, ${fmtPct(Math.abs(w.gap), 0)} below target.` : `Revenue is ${rev.text}, ${rev.delta.text} versus the previous ${span} months, with no segment materially below target in the last two months.`,
      bullets, stats: [{ label: 'Revenue', value: rev.text }, { label: `vs prev ${span}M`, value: rev.delta.text, tone: rev.delta.good ? 'good' : 'bad' }, { label: 'Plan attainment', value: fmtPct(attain), tone: attain >= 1 ? 'good' : 'bad' }, { label: 'Previous period', value: rev.prevText }],
      chart: { type: 'line', title: 'Monthly revenue vs target', labels: labels.map((x) => x.label), fmt: 'usd', series: [{ name: 'Revenue', values: labels.map((x) => x.value) }, { name: 'Target', values: monthlySeries(f, 'target').map((x) => x.value), dashed: true }] },
      sources: { datasets: ['sales'], formula: 'Revenue = SUM(revenue_usd_k). Change = current ÷ previous − 1. Segment driver = current − previous revenue per region × business unit. Attainment = revenue ÷ target.', period, filters: filt, method: 'Last-two-months check compares Sep–Oct 2026 revenue with plan for each region × unit.' },
      confidence: 'High', confidenceWhy: 'Revenue comes from the certified Sales dataset (quality 98.6%) and refreshed 21 Oct 06:05 UTC.', caveat: finCaveat && undefined,
      followUps: ['Which segment is underperforming?', 'What is the revenue forecast for the next quarter?', 'Are there data quality caveats I should know about?'] }
  }

  if (intent === 'under') {
    const full = underperformers(f)
    const recent = underperformers({ ...f, start: 21, end: 23 })
    const w = recent[0], w2 = recent[1]
    const onb = onbSeries()
    const onbRecent = avg(onb.filter((o) => o.m >= 21).map((o) => o.sla))
    const behind = recent.filter((r) => r.gap < 0).slice(0, 5)
    return { ...base0, intent: 'under', headline: w && w.gap < 0 ? `${w.region} · ${w.unit} is furthest behind plan over the last 3 months (${sp(w.gap)})${w2 && w2.gap < 0 ? `, followed by ${w2.region} · ${w2.unit} (${sp(w2.gap)})` : ''}.` : 'Every segment is at or above plan over the last 3 months.',
      bullets: [
        ...recent.filter((r) => r.gap < -0.03).slice(0, 3).map((r) => `${r.region} · ${r.unit}: ${fmtMoney(r.revenue)} vs ${fmtMoney(r.target)} target (${sp(r.gap)}), last 3 months.`),
        ...full.filter((r) => r.gap < 0).slice(0, 2).map((r) => `Over ${rangeLabel(f).toLowerCase()}: ${r.region} · ${r.unit} is ${sp(r.gap)} vs target.`),
        `Operations: Onboarding SLA averaged ${onbRecent.toFixed(1)}% over the last 3 months against the 95% target.`,
      ],
      stats: [{ label: 'Worst segment (3M)', value: w ? sp(w.gap) : '—', tone: 'bad' }, { label: 'Segments below plan', value: String(recent.filter((r) => r.gap < 0).length) + ' of ' + recent.length }, { label: 'Onboarding SLA (3M)', value: `${onbRecent.toFixed(1)}%`, tone: onbRecent < 95 ? 'bad' : 'good' }],
      chart: behind.length ? { type: 'bar', title: 'Shortfall vs target, last 3 months', labels: behind.map((r) => `${r.region} · ${r.unit}`), fmt: 'pct', series: [{ name: 'Shortfall', values: behind.map((r) => Math.abs(r.gap)) }] } : undefined,
      sources: { datasets: ['sales', 'operations'], formula: 'Gap = SUM(revenue) ÷ SUM(target) − 1 per region × business unit; ranked ascending. SLA = AVG(sla_compliance_pct).', period: `Last 3 months (${monthLabel(21, true)} – ${monthLabel(23, true)}) and ${rangeLabel(f)}`, filters: filt, method: 'Revenue targets come from the Sales dataset plan; operations data is not segmented by region or unit.' },
      confidence: 'High', confidenceWhy: 'Gaps are computed directly from certified Sales targets and actuals.', followUps: ['Why did revenue change?', 'Is the Onboarding SLA getting worse?', 'What are the top growth opportunities?'] }
  }

  if (intent === 'opps') {
    const rows = segDiffs(f).sort((a, b) => b.g - a.g)
    const top = rows.slice(0, 5)
    const apacFilter = { ...f, region: 'APAC', unit: 'Cloud Platform', start: 18, end: 23 }
    const apacOk = (f.region === 'All' || f.region === 'APAC') && (f.unit === 'All' || f.unit === 'Cloud Platform')
    const apacAtt = metricValue(pick(apacFilter), 'attainment')
    return { ...base0, intent: 'opps', headline: top[0] ? `${top[0].name} is the strongest opportunity, growing ${sp(top[0].g)} versus the previous ${span} months${top[1] ? `, ahead of ${top[1].name} (${sp(top[1].g)})` : ''}.` : 'No segments in the selected scope.',
      bullets: [
        ...top.slice(0, 3).map((r) => `${r.name}: ${fmtMoney(r.cur)} revenue, ${sp(r.g)} vs previous period (${r.diff >= 0 ? '+' : '−'}${fmtMoney(Math.abs(r.diff))}).`),
        ...(apacOk ? [`APAC · Cloud Platform has been boosted since mid-2026: ${fmtPct(apacAtt)} of plan over the last 6 months, ahead of plan while most other segments track near it.`] : []),
        'Consider reallocating budget toward the top two segments and protecting capacity in APAC Cloud Platform.',
      ],
      stats: [{ label: 'Top growth', value: top[0] ? sp(top[0].g) : '—', tone: 'good' }, { label: 'Segments growing', value: `${rows.filter((r) => r.g > 0).length} of ${rows.length}` }, ...(apacOk ? [{ label: 'APAC Cloud attainment (6M)', value: fmtPct(apacAtt), tone: (apacAtt >= 1 ? 'good' : 'bad') as 'good' | 'bad' }] : [])],
      chart: { type: 'bar', title: 'Revenue growth vs previous period', labels: top.map((r) => r.name), fmt: 'pct', series: [{ name: 'Growth', values: top.map((r) => Math.max(0, r.g)) }] },
      sources: { datasets: ['sales'], formula: 'Growth = SUM(revenue, current) ÷ SUM(revenue, previous) − 1 per region × business unit, ranked descending.', period, filters: filt },
      confidence: 'High', confidenceWhy: 'Direct comparison of two windows in the certified Sales dataset. Growth does not account for capacity or margin.', followUps: ['Show profit and margin by business unit', 'What is the revenue forecast for the next quarter?', 'Which segment is underperforming?'] }
  }

  if (intent === 'churn') {
    const ret = kpi(f, 'retention'), ch = kpi(f, 'churned')
    const rate = 1 - ret.cur
    const target = METRICS.find((m) => m.id === 'churn')?.target ?? 0.08
    const byReg = breakdown(f, 'region', 'retention').map((r) => ({ label: r.key, value: 1 - r.value })).sort((a, b) => b.value - a.value)
    const byUnit = breakdown(f, 'unit', 'retention').map((r) => ({ label: r.key, value: 1 - r.value })).sort((a, b) => b.value - a.value)
    return { ...base0, intent: 'churn', headline: `Customer churn is ${fmtPct(rate)} over ${span} months (target ≤ ${fmtPct(target, 0)}); retention is ${ret.text}${byReg[0] ? `, with ${byReg[0].label} highest at ${fmtPct(byReg[0].value)}` : ''}.`,
      bullets: [
        `${fmtNum(ch.cur)} customers churned versus ${fmtNum(ch.prev)} in the previous ${span} months (${ch.delta.text}).`,
        rate <= target ? `Churn is ${fmtPct(target - rate)} points inside the ${fmtPct(target, 0)} target, so the headroom is thin.` : `Churn is ${fmtPct(rate - target)} points above the ${fmtPct(target, 0)} target.`,
        byUnit[0] ? `By business unit, ${byUnit[0].label} has the highest churn (${fmtPct(byUnit[0].value)}) and ${byUnit[byUnit.length - 1].label} the lowest (${fmtPct(byUnit[byUnit.length - 1].value)}).` : '',
      ].filter(Boolean),
      stats: [{ label: 'Churn rate', value: fmtPct(rate), tone: rate <= target ? 'good' : 'bad' }, { label: 'Retention', value: ret.text }, { label: 'Churned customers', value: fmtNum(ch.cur), tone: ch.delta.good ? 'good' : 'bad' }, { label: 'Target', value: `≤ ${fmtPct(target, 0)}` }],
      chart: { type: 'bar', title: 'Churn rate by region', labels: byReg.map((r) => r.label), fmt: 'pct', series: [{ name: 'Churn', values: byReg.map((r) => r.value) }] },
      sources: { datasets: ['customers', 'sales'], formula: 'Churn rate = SUM(churned) ÷ customers at period start; Retention = 1 − churn rate. Target from the Metrics Catalog (Customer Churn).', period, filters: filt },
      confidence: dq113 ? 'Medium' : 'High', confidenceWhy: dq113 ? 'Customers dataset has an open data quality issue (DQ-113).' : 'No open quality issues on the Customers dataset.',
      caveat: dq113 ? 'DQ-113: 214 CRM rows with a null customer_id are quarantined, so churn counts may be slightly understated.' : undefined,
      followUps: ['Why did revenue change?', 'Are there data quality caveats I should know about?', 'Give me an executive summary'] }
  }

  if (intent === 'forecast') {
    const fc = forecastSeries(f, 'revenue', 6)
    const n3 = fc.fc.slice(0, 3)
    const next = n3.reduce((a, p) => a + p.expected, 0), lo = n3.reduce((a, p) => a + p.lo, 0), hi = n3.reduce((a, p) => a + p.hi, 0)
    const last3 = fc.hist.slice(-3).reduce((a, p) => a + p.value, 0)
    const g = next / last3 - 1
    const width = (fc.fc[5].hi - fc.fc[5].lo) / 2 / fc.fc[5].expected
    const recentBad = underperformers({ ...f, start: 22, end: 23 }).find((r) => r.gap < -0.08)
    const hn = fc.hist.length
    return { ...base0, intent: 'forecast', headline: `Revenue is projected at ${fmtMoney(next)} for ${monthLabel(24, true)} – ${monthLabel(26, true)} (80% range ${fmtMoney(lo)} – ${fmtMoney(hi)}), ${sp(g)} vs the last 3 months.`,
      bullets: [
        `Underlying trend growth is ${fmtPct(Math.pow(1 + fc.growth, 12) - 1)} annualised (${fmtPct(fc.growth)} per month, after removing seasonality).`,
        `By month ${monthLabel(29, true)} the 80% band widens to ±${fmtPct(width, 0)} around ${fmtMoney(fc.fc[5].expected)}.`,
        recentBad ? `The trend does not yet price in the recent ${recentBad.region} · ${recentBad.unit} shortfall (${sp(recentBad.gap)} vs target in the last 2 months), so treat this as optimistic for that segment.` : 'No recent segment shortfall is large enough to bias the trend materially.',
        'Open Forecasting to compare Best, Expected and Worst scenarios.',
      ],
      stats: [{ label: 'Next 3 months', value: fmtMoney(next) }, { label: 'vs last 3 months', value: sp(g), tone: g >= 0 ? 'good' : 'bad' }, { label: '80% range', value: `${fmtMoney(lo)} – ${fmtMoney(hi)}` }],
      chart: { type: 'line', title: 'Actual and projected revenue', labels: [...fc.hist.map((h) => h.label), ...fc.fc.map((p) => p.label)], fmt: 'usd', series: [
        { name: 'Actual', values: [...fc.hist.map((h) => h.value), ...fc.fc.map(() => null)] },
        { name: 'Projected', dashed: true, values: [...fc.hist.map((h, i) => (i === hn - 1 ? h.value : null)), ...fc.fc.map((p) => p.expected)], band: { lo: [...fc.hist.map(() => null), ...fc.fc.map((p) => p.lo)], hi: [...fc.hist.map(() => null), ...fc.fc.map((p) => p.hi)] } }] },
      sources: { datasets: ['sales', 'finance'], formula: 'Log-linear trend fitted to deseasonalised monthly revenue; seasonal index re-applied; band = ±1.28 × residual σ × √t (80%).', period: `History ${monthLabel(12, true)} – ${monthLabel(23, true)}; projection ${monthLabel(24, true)} – ${monthLabel(29, true)}`, filters: `${f.region === 'All' ? 'All regions' : f.region} · ${f.unit === 'All' ? 'All units' : f.unit} (the date filter does not apply to forecasts)`, method: 'Same model as the Executive Overview and Forecasting pages.' },
      confidence: width > 0.2 ? 'Low' : 'Medium', confidenceWhy: `Statistical projection from 12 months of history; the band widens to ±${fmtPct(width, 0)} by month 6. Not a commitment.`, caveat: finCaveat,
      followUps: ['Why did revenue change?', 'Which segment is underperforming?', 'What are the top growth opportunities?'] }
  }

  if (intent === 'margin') {
    const profit = kpi(f, 'profit'), margin = kpi(f, 'margin'), cost = kpi(f, 'cost')
    const byUnit = breakdown(f, 'unit', 'margin').sort((a, b) => b.value - a.value)
    const ms = monthlySeries(f, 'margin')
    const early = avg(ms.slice(0, 3).map((x) => x.value)), late = avg(ms.slice(-3).map((x) => x.value))
    return { ...base0, intent: 'margin', headline: `Operating profit is ${profit.text} (${margin.text} margin), ${profit.delta.text} vs the previous ${span} months${byUnit.length > 1 ? `; ${byUnit[byUnit.length - 1].key} has the thinnest margin at ${fmtPct(byUnit[byUnit.length - 1].value)}` : ''}.`,
      bullets: [
        `Operating costs were ${cost.text} (${cost.delta.text} vs previous period) against revenue growth of ${kpi(f, 'revenue').delta.text}.`,
        `Margin moved from ${fmtPct(early)} (first 3 months of the window) to ${fmtPct(late)} (last 3 months).`,
        ...byUnit.slice(0, 2).map((u) => `${u.key}: ${fmtPct(u.value)} operating margin.`),
      ],
      stats: [{ label: 'Operating profit', value: profit.text }, { label: 'Margin', value: margin.text }, { label: 'Profit vs prev.', value: profit.delta.text, tone: profit.delta.good ? 'good' : 'bad' }],
      chart: byUnit.length ? { type: 'bar', title: 'Operating margin by business unit', labels: byUnit.map((u) => u.key), fmt: 'pct', series: [{ name: 'Margin', values: byUnit.map((u) => Math.max(0, u.value)) }] } : undefined,
      sources: { datasets: ['finance', 'sales'], formula: 'Profit = SUM(revenue) − SUM(operating_cost); Margin = Profit ÷ Revenue.', period, filters: filt },
      confidence: finStale ? 'Medium' : 'High', confidenceWhy: finStale ? 'Finance data is stale (DQ-114), so the latest month may be incomplete.' : 'Finance dataset is fresh and certified.', caveat: finCaveat,
      followUps: ['Are there data quality caveats I should know about?', 'What are the top growth opportunities?', 'Give me an executive summary'] }
  }

  if (intent === 'sla') {
    const o = onbSeries()
    const last = o[o.length - 1], peak = o.find((x) => x.m === 20)!
    const target = METRICS.find((m) => m.id === 'sla')?.target ?? 95
    const latest = OPS.filter((x) => x.m === 23)
    return { ...base0, intent: 'sla', headline: `Onboarding SLA compliance has fallen to ${last.sla.toFixed(1)}% (target ${target}%), down ${(peak.sla - last.sla).toFixed(1)} points since ${monthLabel(20, true)}.`,
      bullets: [
        `Backlog grew from ${peak.backlog} to ${last.backlog} open items; average resolution time rose from ${peak.resolutionH}h to ${last.resolutionH}h.`,
        `CSAT for Onboarding is ${last.csat.toFixed(2)} vs ${peak.csat.toFixed(2)} in ${monthLabel(20, true)}.`,
        `Other teams in ${monthLabel(23, true)}: ${latest.filter((x) => x.team !== 'Onboarding').map((x) => `${x.team} ${x.sla.toFixed(1)}%`).join(', ')}.`,
        'Decision D-20 (add 4 Onboarding heads) is proposed in Collaboration.',
      ],
      stats: [{ label: 'Onboarding SLA', value: `${last.sla.toFixed(1)}%`, tone: last.sla >= target ? 'good' : 'bad' }, { label: 'Target', value: `${target}%` }, { label: 'Backlog', value: fmtNum(last.backlog), tone: 'bad' }],
      chart: { type: 'line', title: 'Onboarding SLA compliance vs target', labels: o.map((x) => monthLabel(x.m)), fmt: 'sla', series: [{ name: 'Onboarding SLA', values: o.map((x) => x.sla) }, { name: 'Target', values: o.map(() => target), dashed: true }] },
      sources: { datasets: ['operations'], formula: 'SLA compliance = AVG(sla_compliance_pct) per team and month; backlog = open items at month end.', period: `${monthLabel(12, true)} – ${monthLabel(23, true)}`, filters: 'Operations data is not segmented by region or business unit, so those filters do not apply.' },
      confidence: 'High', confidenceWhy: 'Operations dataset is fresh (0.5h) and certified; quality 94.8%.', followUps: ['Which segment is underperforming?', 'Give me an executive summary', 'Are there data quality caveats I should know about?'] }
  }

  if (intent === 'dq') {
    const sev = ['Critical', 'High', 'Medium', 'Low']
    const open = ctx.issues.filter((i) => i.status !== 'Resolved').sort((a, b) => sev.indexOf(a.severity) - sev.indexOf(b.severity))
    const stale = FRESHNESS.filter((x) => x.ageH > x.expectedH)
    const failed = ctx.pipelines.filter((p) => p.status === 'Failed')
    return { ...base0, intent: 'dq', headline: open[0] ? `${open.length} data quality issues are open; the most serious is ${open[0].id}: ${open[0].title}.` : 'No open data quality issues.',
      bullets: [
        ...open.slice(0, 3).map((i) => `${i.id} · ${i.severity} · ${dsName(i.dataset)}: ${i.title} (${fmtNum(i.affected)} records affected, ${i.status.toLowerCase()}).`),
        stale.length ? `Stale datasets: ${stale.map((x) => `${x.dataset} ${x.ageH}h old (SLA ${x.expectedH}h)`).join(', ')}.` : 'All datasets are inside their freshness SLA.',
        failed.length ? `Failed pipeline: ${failed.map((p) => p.name).join(', ')}.` : '',
        'Treat profit, cost and margin figures with caution while Finance is stale. Revenue (Sales, refreshed 0.3h ago) is current.',
      ].filter(Boolean),
      stats: [{ label: 'Open issues', value: String(open.length), tone: open.length ? 'bad' : 'good' }, { label: 'Stale datasets', value: String(stale.length), tone: stale.length ? 'bad' : 'good' }, { label: 'Failed pipelines', value: String(failed.length), tone: failed.length ? 'bad' : 'good' }],
      chart: { type: 'bar', title: 'Data age (hours since last refresh)', labels: FRESHNESS.map((x) => x.dataset), fmt: 'hrs', series: [{ name: 'Age', values: FRESHNESS.map((x) => x.ageH) }] },
      sources: { datasets: ['finance', 'customers', 'support', 'operations'], formula: 'Freshness = hours since last successful load vs expected SLA. Issues = open and investigating items in the Data Quality log.', period: `As of ${TODAY} 08:30 UTC`, filters: 'Not filtered by date, region or unit.' },
      confidence: 'High', confidenceWhy: 'Read directly from the Data Quality log and freshness monitor.',
      followUps: ['Why did revenue change?', 'Show profit and margin by business unit', 'Is the Onboarding SLA getting worse?'] }
  }

  if (intent === 'summary') {
    const rev = kpi(f, 'revenue'), pr = kpi(f, 'profit'), nn = kpi(f, 'netnew'), ret = kpi(f, 'retention')
    const w = underperformers({ ...f, start: 21, end: 23 })[0]
    const labels = monthlySeries(f, 'revenue')
    const o = onbSeries(); const ol = o[o.length - 1]
    return { ...base0, intent: 'summary', headline: `Revenue is ${rev.text} (${rev.delta.text}) and operating profit ${pr.text}; watch ${w && w.gap < 0 ? `${w.region} · ${w.unit}` : 'no single segment'} and Onboarding SLA.`,
      bullets: [
        `Plan attainment ${fmtPct(metricValue(pick(f), 'attainment'))}; operating margin ${fmtPct(metricValue(pick(f), 'margin'))}.`,
        `${fmtNum(nn.cur)} net new customers; retention ${ret.text}.`,
        w && w.gap < 0 ? `Biggest revenue risk (last 3 months): ${w.region} · ${w.unit} at ${sp(w.gap)} vs target.` : 'No segment is behind target in the last 3 months.',
        `Operational risk: Onboarding SLA ${ol.sla.toFixed(1)}% vs 95% target.`,
        finStale ? 'Data risk: DQ-114 Finance freshness issue is open.' : 'No open critical data issues.',
      ],
      stats: [{ label: 'Revenue', value: rev.text, tone: rev.delta.good ? 'good' : 'bad' }, { label: 'Operating profit', value: pr.text, tone: pr.delta.good ? 'good' : 'bad' }, { label: 'Net new customers', value: fmtNum(nn.cur) }, { label: 'Retention', value: ret.text }],
      chart: { type: 'line', title: 'Monthly revenue', labels: labels.map((x) => x.label), fmt: 'usd', series: [{ name: 'Revenue', values: labels.map((x) => x.value) }] },
      sources: { datasets: ['sales', 'finance', 'customers', 'operations'], formula: 'Same KPI definitions as the Executive Overview (see Metrics Catalog).', period, filters: filt },
      confidence: finStale ? 'Medium' : 'High', confidenceWhy: finStale ? 'Profit relies on the stale Finance dataset (DQ-114).' : 'All source datasets are fresh.', caveat: finCaveat,
      followUps: ['Why did revenue change?', 'Which segment is underperforming?', 'What are the top growth opportunities?'] }
  }

  return { ...base0, kind: 'fallback', intent: 'unsupported', headline: "I can't answer that one yet.",
    bullets: ['This demo copilot recognises a fixed set of analytics questions about Halcyon Global. It cannot browse the web, read files or answer general questions.', `I can help with: ${CAPABILITIES.join('; ')}.`, 'Try rephrasing using words like revenue, segment, churn, forecast, margin, SLA or data quality.'],
    stats: [], sources: { datasets: [], formula: 'No calculation was run.', period: '—', filters: filt }, confidence: 'Low', confidenceWhy: 'The question did not match any supported topic.', followUps: SUGGESTED.slice(0, 4) }
}

// ---------- rendering ----------
const confTone = { High: 'success', Medium: 'warning', Low: 'danger' } as const
function AnswerChart({ c }: { c: ChartSpec }) {
  const fmt = FMT[c.fmt]
  return (
    <figure className="mt-3 rounded-lg border border-line p-3">
      <figcaption className="mb-2 text-xs font-medium text-ink-2">{c.title}</figcaption>
      {c.type === 'line'
        ? <LineChart ariaLabel={c.title} labels={c.labels} format={fmt} height={170} series={c.series.map((s, i) => ({ name: s.name, values: s.values, dashed: s.dashed, band: s.band, color: i === 0 ? 'var(--c1)' : 'var(--c3)', area: i === 0 && !s.band }))} />
        : <BarList ariaLabel={c.title} format={fmt} data={c.labels.map((l, i) => ({ label: l, value: c.series[0].values[i] ?? 0 }))} />}
    </figure>
  )
}
function plainText(a: Answer) {
  return [a.headline, ...a.bullets.map((b) => `• ${b}`), `Confidence: ${a.confidence}. ${a.confidenceWhy}`, a.caveat ? `Caveat: ${a.caveat}` : '', `Sources: ${a.sources.datasets.map(dsName).join(', ') || 'n/a'} · ${a.sources.period} · ${a.sources.filters}`, '(Demo answer from a deterministic rules engine, not a live LLM.)'].filter(Boolean).join('\n')
}

function AssistantMessage({ m, a, last, canAct, canSaveReport, canShare, onAsk, onFeedback, onCopy, onSave, onShare, onRetry }: {
  m: ChatMsg; a: Answer; last: boolean; canAct: boolean; canSaveReport: boolean; canShare: boolean; onAsk: (q: string) => void; onFeedback: (v: 'up' | 'down') => void; onCopy: () => void; onSave: () => void; onShare: () => void; onRetry: () => void
}) {
  if (a.kind === 'error') return (
    <div className="max-w-3xl"><Banner tone="danger" title="Something went wrong" action={canAct ? <Button size="sm" onClick={onRetry}>Retry</Button> : undefined}>I could not compute that answer. No data was changed. Please retry or ask a different question.</Banner></div>
  )
  return (
    <article className="max-w-3xl rounded-xl border border-line bg-surface p-4" aria-label="Copilot answer">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="grid size-6 place-items-center rounded-full bg-primary-soft text-primary-ink"><Sparkles className="size-3.5" aria-hidden /></span>
        <span className="text-xs font-semibold text-ink">Insights Copilot</span><Badge tone="info">Demo · rules-based</Badge>
        {a.kind === 'answer' && <Badge tone={confTone[a.confidence]}>Confidence: {a.confidence}</Badge>}
      </div>
      <h3 className="text-[15px] font-semibold leading-6 text-ink">{a.headline}</h3>
      {a.stats.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {a.stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-sunken px-3 py-2"><dt className="text-[11px] text-muted">{s.label}</dt><dd className={cx('tnum text-[15px] font-semibold', s.tone === 'good' ? 'text-success' : s.tone === 'bad' ? 'text-danger' : 'text-ink')}>{s.value}</dd></div>
          ))}
        </dl>
      )}
      <ul className="mt-3 space-y-1.5 text-[13px] text-ink">{a.bullets.map((b, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{b}</li>)}</ul>
      {a.chart && <AnswerChart c={a.chart} />}
      {a.caveat && <div className="mt-3"><Banner tone="warning" title="Caveat">{a.caveat}</Banner></div>}
      {a.kind === 'answer' && (
        <details className="mt-3 rounded-lg border border-line text-[13px]">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-primary-ink">Sources &amp; calculation</summary>
          <dl className="space-y-2 border-t border-line px-3 py-2.5 text-xs">
            <div><dt className="font-medium text-ink">Datasets used</dt><dd className="text-ink-2">{a.sources.datasets.map((d, i) => <span key={d}>{i > 0 && ', '}<Link to={`/explore/${d}`} className="text-primary-ink underline">{dsName(d)}</Link></span>)}</dd></div>
            <div><dt className="font-medium text-ink">Formula</dt><dd className="text-ink-2">{a.sources.formula}</dd></div>
            <div><dt className="font-medium text-ink">Period</dt><dd className="text-ink-2">{a.sources.period}</dd></div>
            <div><dt className="font-medium text-ink">Filters</dt><dd className="text-ink-2">{a.sources.filters}</dd></div>
            {a.sources.method && <div><dt className="font-medium text-ink">Method</dt><dd className="text-ink-2">{a.sources.method}</dd></div>}
            <div><dt className="font-medium text-ink">Confidence: {a.confidence}</dt><dd className="text-ink-2">{a.confidenceWhy}</dd></div>
          </dl>
        </details>
      )}
      {last && a.followUps.length > 0 && canAct && (
        <div className="mt-3" role="group" aria-label="Suggested follow-up questions">
          <p className="mb-1.5 text-xs text-muted">{a.kind === 'fallback' ? 'Try one of these' : 'Follow-up questions'}</p>
          <div className="flex flex-wrap gap-1.5">{a.followUps.map((q) => <button key={q} type="button" onClick={() => onAsk(q)} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink hover:border-primary hover:bg-primary-soft">{q}</button>)}</div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={onCopy}>Copy</Button>
        {a.kind === 'answer' && (
          <>
            <Button size="sm" variant="ghost" icon={<FilePlus2 className="size-3.5" />} disabled={!canSaveReport} title={canSaveReport ? undefined : 'Your role cannot edit reports'} onClick={onSave}>Save to report</Button>
            <Button size="sm" variant="ghost" icon={<Share2 className="size-3.5" />} disabled={!canShare} title={canShare ? undefined : 'Your role cannot post in Collaboration'} onClick={onShare}>Share to Collaboration</Button>
            <span className="ml-auto flex items-center gap-1" role="group" aria-label="Was this answer helpful?">
              <Button size="sm" variant="ghost" aria-pressed={a.feedback === 'up'} aria-label="Helpful" disabled={!canAct} onClick={() => onFeedback('up')} className={cx(a.feedback === 'up' && 'bg-success-soft text-success')}><ThumbsUp className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" aria-pressed={a.feedback === 'down'} aria-label="Not helpful" disabled={!canAct} onClick={() => onFeedback('down')} className={cx(a.feedback === 'down' && 'bg-danger-soft text-danger')}><ThumbsDown className="size-3.5" /></Button>
            </span>
          </>
        )}
      </div>
      <span className="sr-only">Answered {m.at}</span>
    </article>
  )
}

export default function Copilot() {
  const { chat, setChat, filters, setFilters, issues, pipelines, reports, setReports, threads, setThreads, level, log, toast, confirm, userName } = useStore()
  const canAct = level('copilot') === 'edit'
  const canSaveReport = canAct && level('reports') === 'edit'
  const canShare = canAct && level('collaboration') === 'edit'
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [saveFor, setSaveFor] = useState<ChatMsg | null>(null)
  const [shareFor, setShareFor] = useState<ChatMsg | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [chat.length, pending])

  const ask = (q: string) => {
    const text = q.trim().slice(0, 500)
    if (!text || pending || !canAct) return
    const userMsg: ChatMsg = { id: uid('m'), role: 'user', text, at: new Date().toISOString() }
    setChat((c) => [...c, userMsg]); setInput(''); setPending(true)
    setTimeout(() => {
      let ans: Answer
      try { ans = buildAnswer(text, filters, { issues, pipelines }) } catch { ans = { kind: 'error', intent: 'error', question: text, headline: 'Error', bullets: [], stats: [], sources: { datasets: [], formula: '', period: '', filters: '' }, confidence: 'Low', confidenceWhy: '', followUps: [] } }
      setChat((c) => [...c, { id: uid('m'), role: 'assistant', text: ans.kind === 'error' ? 'Error computing answer.' : plainText(ans), payload: ans, at: new Date().toISOString() }])
      setPending(false)
      log('copilot.ask', text.slice(0, 80))
    }, 900)
  }
  const setFeedback = (id: string, v: 'up' | 'down') => {
    setChat((c) => c.map((m) => { if (m.id !== id) return m; const a = m.payload as Answer; return { ...m, payload: { ...a, feedback: a.feedback === v ? undefined : v } } }))
    toast('Thanks for the feedback. In this demo it is stored locally only.', 'info')
  }
  const copy = async (m: ChatMsg) => { try { await navigator.clipboard.writeText(m.text); toast('Answer copied to clipboard.') } catch { toast('Copy failed. Select the text and copy it manually.', 'error') } }
  const clear = async () => {
    const ok = await confirm({ title: 'Clear conversation?', body: 'This removes all messages from this conversation on this device. Saved reports and shared threads are not affected.', confirmLabel: 'Clear conversation', danger: true })
    if (!ok) return
    setChat([]); log('copilot.clear', 'Conversation'); toast('Conversation cleared.', 'info')
  }
  const lastAssistantId = [...chat].reverse().find((m) => m.role === 'assistant')?.id
  const prevQuestion = (id: string) => { const i = chat.findIndex((m) => m.id === id); return chat.slice(0, i).reverse().find((m) => m.role === 'user')?.text ?? '' }

  return (
    <div>
      <PageHeader title="AI Insights Copilot" badge={<Badge tone="info">Demo</Badge>} description="Ask questions about revenue, segments, churn, forecasts and data quality. Every answer shows its sources and calculation."
        actions={canAct && <Button icon={<Trash2 className="size-4" />} onClick={clear} disabled={!chat.length || pending}>Clear conversation</Button>} />
      <div className="mb-4"><Banner tone="info" title="Deterministic demo, not a live LLM">Answers are generated by a rules and intent matcher over the shared Halcyon Global analytics. The same question always returns the same answer for the same filters. Verify important figures in the linked datasets.</Banner></div>
      {!canAct && <ReadOnlyNote page="the copilot" />}

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="flex flex-col xl:col-span-8" aria-label="Conversation">
          <div className="min-h-[420px] flex-1 space-y-4 rounded-xl border border-line bg-sunken/40 p-4 xl:max-h-[calc(100vh-380px)] xl:overflow-y-auto" role="log" aria-live="polite" aria-label="Conversation history">
            {chat.length === 0 && !pending ? (
              <EmptyState icon={<MessageSquare className="size-5" />} title="Ask your first question" body={canAct ? 'Pick a suggested prompt below or type your own question.' : 'Your role can read conversations but cannot ask new questions.'} />
            ) : chat.map((m) => m.role === 'user' ? (
              <div key={m.id} className="flex justify-end"><p className="max-w-xl rounded-xl rounded-br-sm bg-primary px-3.5 py-2 text-[13px] text-on-primary">{m.text}</p></div>
            ) : (
              <AssistantMessage key={m.id} m={m} a={m.payload as Answer} last={m.id === lastAssistantId && !pending} canAct={canAct} canSaveReport={canSaveReport} canShare={canShare}
                onAsk={ask} onFeedback={(v) => setFeedback(m.id, v)} onCopy={() => copy(m)} onSave={() => setSaveFor(m)} onShare={() => setShareFor(m)} onRetry={() => ask(prevQuestion(m.id))} />
            ))}
            {pending && (
              <div className="flex max-w-xs items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-2" role="status">
                <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 120}ms` }} />)}</span>
                Analysing the data…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {canAct && (
            <div className="mt-3">
              <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Suggested prompts">
                {SUGGESTED.map((s) => <button key={s} type="button" disabled={pending} onClick={() => ask(s)} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink hover:border-primary hover:bg-primary-soft disabled:opacity-50">{s}</button>)}
              </div>
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
                <label htmlFor="cp-input" className="sr-only">Ask a question about your data</label>
                <Textarea id="cp-input" rows={2} value={input} maxLength={500} placeholder="Ask about revenue, segments, churn, forecast, SLA or data quality…" className="min-h-0 flex-1 resize-none"
                  onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} />
                <Button type="submit" variant="primary" icon={<Send className="size-4" />} disabled={!input.trim() || pending} className="h-[52px]">Send</Button>
              </form>
              <p className="mt-1 text-xs text-muted">Enter to send, Shift+Enter for a new line. {input.length}/500</p>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4 xl:col-span-4" aria-label="Copilot context">
          <Card title="Analysis context" subtitle={`Answers use these filters: ${filterSummary(filters)}`}>
            <div className="flex flex-col gap-2"><DateRangePicker filters={filters} onChange={setFilters} /><FilterBar filters={filters} onChange={setFilters} compact />
              {(filters.region !== DEFAULT_FILTERS.region || filters.unit !== DEFAULT_FILTERS.unit || filters.start !== DEFAULT_FILTERS.start || filters.end !== DEFAULT_FILTERS.end) && <Button size="sm" variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</Button>}
            </div>
            <p className="mt-2 text-xs text-muted">Naming a region, unit or period in your question overrides these filters for that answer.</p>
          </Card>
          <Card title="What I can answer">
            <ul className="space-y-1.5 text-[13px] text-ink-2">{CAPABILITIES.map((c) => <li key={c} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />{c}</li>)}</ul>
            <div className="mt-3 flex gap-2 rounded-lg bg-warning-soft p-2.5 text-xs text-ink"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /><span>Unsupported questions get a clear fallback; nothing is guessed or invented.</span></div>
          </Card>
        </aside>
      </div>

      {saveFor && <SaveToReportModal msg={saveFor} reports={reports} onClose={() => setSaveFor(null)} onSave={(target) => {
        const a = saveFor.payload as Answer
        const section = { id: uid('s'), type: 'text' as const, title: a.headline.slice(0, 80), text: `${a.bullets.map((b) => `• ${b}`).join('\n')}\n\nSource: ${a.sources.datasets.map(dsName).join(', ')} · ${a.sources.period}. Generated by the demo copilot (confidence ${a.confidence}).` }
        let name = ''
        if (target === 'new') {
          const r: Report = { id: uid('r'), name: `Copilot insight: ${a.headline.slice(0, 50)}`, category: 'Executive', owner: userName, status: 'Draft', updated: TODAY, schedule: 'None', sharedWith: [], description: 'Created from an AI Insights answer (demo).', sections: [section], runs: [] }
          setReports((rs) => [r, ...rs]); name = r.name; log('report.create', name)
        } else {
          setReports((rs) => rs.map((r) => { if (r.id === target) { name = r.name; return { ...r, sections: [...r.sections, section], updated: TODAY } } return r }))
          name = reports.find((r) => r.id === target)?.name ?? ''; log('report.update', name)
        }
        setSaveFor(null); toast(`Saved to "${name}".`)
        if (target === 'new') go('/reports')
      }} />}
      {shareFor && <ShareModal msg={shareFor} onClose={() => setShareFor(null)} onShare={(note) => {
        const a = shareFor.payload as Answer
        setThreads((t) => [{ id: uid('th'), target: a.headline.slice(0, 60), targetType: a.chart ? 'Chart' : 'Dataset', resolved: false, annotation: 'From AI Insights (demo)', messages: [{ id: uid('m'), author: userName, text: `${a.headline}${note ? `\n${note}` : ''}\n(Shared from AI Insights demo answer, confidence ${a.confidence}.)`, at: new Date().toISOString() }] }, ...t])
        log('thread.create', a.headline.slice(0, 60)); setShareFor(null); toast('Shared to Collaboration as a new thread.')
      }} />}
      {useMemo(() => null, [threads.length])}
    </div>
  )
}

function SaveToReportModal({ msg, reports, onClose, onSave }: { msg: ChatMsg; reports: Report[]; onClose: () => void; onSave: (target: string) => void }) {
  const opts = reports.filter((r) => r.status !== 'Archived')
  const [target, setTarget] = useState('new')
  const a = msg.payload as Answer
  return (
    <Modal open onClose={onClose} title="Save insight to report" description="The answer is added as a narrative section you can edit in the builder." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(target)}>Save</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Destination" htmlFor="sv-t"><Select id="sv-t" value={target} onChange={(e) => setTarget(e.target.value)}><option value="new">New draft report</option>{opts.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.status})</option>)}</Select></Field>
        <div className="rounded-lg bg-sunken p-3 text-[13px]"><p className="font-medium text-ink">{a.headline}</p><p className="mt-1 text-xs text-muted">{a.bullets.length} supporting points and the source summary will be included.</p></div>
      </div>
    </Modal>
  )
}
function ShareModal({ msg, onClose, onShare }: { msg: ChatMsg; onClose: () => void; onShare: (note: string) => void }) {
  const [note, setNote] = useState('')
  const a = msg.payload as Answer
  return (
    <Modal open onClose={onClose} title="Share to Collaboration" description="Creates a discussion thread your team can reply to." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onShare(note.trim())}>Share</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-sunken p-3 text-[13px]"><p className="font-medium text-ink">{a.headline}</p></div>
        <Field label="Add a note (optional)" htmlFor="sh-note" hint={`${note.length}/300`}><Textarea id="sh-note" data-autofocus rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. @Jonas Becker can you confirm the cause?" /></Field>
        <p className="text-xs text-muted">Only the answer summary is shared. No raw data or credentials are included. <Link to="/collaboration" className="text-primary-ink underline">Open Collaboration</Link></p>
      </div>
    </Modal>
  )
}

export { FACTS }
