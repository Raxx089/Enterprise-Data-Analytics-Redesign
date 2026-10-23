import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Lightbulb, RefreshCw, Sparkles, TrendingUp, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { CATEGORIES, FACTS, OPS, REGIONS, UNITS, monthLabel } from '../lib/data'
import { breakdown, filterSummary, fmtDate, fmtMetric, fmtMoney, fmtNum, fmtPct, forecastSeries, funnel, groupBy, kpi, metricDef, metricValue, monthlySeries, pick, prevWindow, underperformers, ago, type Filters, type Kpi, type MetricKey } from '../lib/analytics'
import { Badge, Banner, Button, Card, Drawer, FilterBar, PageHeader, Skeleton, StatusBadge, Table, Tooltip, cx } from '../components/ui'
import { BarList, ColumnChart, Donut, Funnel, Legend, LineChart, Sparkline } from '../components/charts'
import { Link, go } from '../lib/router'

const KPI_SET: { key: MetricKey; label: string; hint: string }[] = [
  { key: 'revenue', label: 'Total Revenue', hint: 'Sum of recognised revenue across the selected segments.' },
  { key: 'profit', label: 'Operating Profit', hint: 'Revenue minus operating costs.' },
  { key: 'netnew', label: 'Customer Growth', hint: 'Net new customers: customers won minus customers churned.' },
  { key: 'conversion', label: 'Conversion Rate', hint: 'Customers won divided by leads created.' },
  { key: 'cost', label: 'Operating Costs', hint: 'Cost of delivery and operations. Lower is better.' },
  { key: 'retention', label: 'Customer Retention', hint: '1 minus customers churned divided by customers at the start of the period.' },
]

function KpiCard({ k, hint, label, active, onSelect, span }: { k: Kpi; hint: string; label: string; active: boolean; onSelect: () => void; span: number }) {
  const up = k.delta.abs >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <button type="button" onClick={onSelect} aria-pressed={active} className={cx('rounded-xl border bg-surface p-3.5 text-left transition-colors hover:border-line-strong', active ? 'border-primary ring-1 ring-primary' : 'border-line')}>
      <div className="flex items-center justify-between gap-2">
        <Tooltip text={`${hint} Previous ${span} months: ${k.prevText}.`}><span className="text-xs font-medium text-ink-2 underline decoration-dotted decoration-line-strong underline-offset-4">{label}</span></Tooltip>
      </div>
      <p className="tnum mt-1.5 text-[22px] font-semibold leading-7 tracking-tight text-ink">{k.text}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <span className={cx('inline-flex items-center gap-0.5 text-xs font-semibold', k.delta.good ? 'text-success' : 'text-danger')}><Arrow className="size-3.5" aria-hidden /><span className="sr-only">{up ? 'Up' : 'Down'} </span>{k.delta.text}</span>
          <p className="text-[11px] text-muted">vs {k.prevText} prev. {span}M</p>
        </div>
        <Sparkline data={k.spark} good={k.delta.good} />
      </div>
    </button>
  )
}

export default function Overview() {
  const { filters, setFilters, issues, pipelines, decisions, audit, reports, toast, level } = useStore()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshErr, setRefreshErr] = useState(false)
  const [lastRefresh, setLastRefresh] = useState('2026-10-21T06:05:00Z')
  const [sel, setSel] = useState<MetricKey>('revenue')
  const [month, setMonth] = useState<number | null>(null)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 450); return () => clearTimeout(t) }, [])

  const f = filters
  const span = f.end - f.start + 1
  const kpis = useMemo(() => KPI_SET.map((x) => ({ ...x, k: kpi(f, x.key, x.label) })), [f])
  const pw = prevWindow(f)
  const cur = monthlySeries(f, sel)
  const prev = monthlySeries(f, sel, pw.start, pw.end)
  const selDef = metricDef(sel)
  const fmt = (v: number) => (selDef.kind === 'usd' ? fmtMoney(v) : selDef.kind === 'pct' ? fmtPct(v) : fmtNum(v))
  const region = breakdown(f, 'region', 'revenue')
  const regionPrev = breakdown(f, 'region', 'revenue', pw.start, pw.end)
  const unit = breakdown(f, 'unit', 'revenue')
  const unitPrev = breakdown(f, 'unit', 'revenue', pw.start, pw.end)
  const cat = breakdown(f, 'category', 'revenue')
  const stages = funnel(f)
  const attain = monthlySeries(f, 'revenue').map((x, i) => ({ label: x.label, value: x.value, target: monthlySeries(f, 'target')[i].value }))
  const fcAll = useMemo(() => forecastSeries(f, 'revenue', 6), [f])
  const under = useMemo(() => underperformers(f), [f])
  const bad = under.filter((u) => u.gap < -0.04).slice(0, 4)

  const opportunities = useMemo(() => {
    const rows: { name: string; growth: number; rev: number }[] = []
    for (const r of REGIONS) for (const u of UNITS) {
      if ((f.region !== 'All' && f.region !== r) || (f.unit !== 'All' && f.unit !== u)) continue
      const c = metricValue(pick({ ...f, region: r, unit: u }), 'revenue')
      const p = metricValue(pick({ ...f, region: r, unit: u }, pw.start, pw.end), 'revenue')
      rows.push({ name: `${r} · ${u}`, growth: p ? c / p - 1 : 0, rev: c })
    }
    return rows.sort((a, b) => b.growth - a.growth).slice(0, 3)
  }, [f, pw.start, pw.end])

  const rev = kpis[0].k, profit = kpis[1].k, cust = kpis[2].k, ret = kpis[5].k
  const attainV = metricValue(pick(f), 'attainment')
  const worst = under[0]
  const summary = [
    `Revenue was ${rev.text}, ${rev.delta.text} versus the previous ${span} months, and ${fmtPct(attainV)} of plan.`,
    `Operating profit was ${profit.text} (${fmtPct(metricValue(pick(f), 'margin'))} margin), ${profit.delta.text} versus the prior period.`,
    `The business added ${fmtNum(cust.cur)} net new customers; retention was ${ret.text}.`,
    worst && worst.gap < 0 ? `Largest shortfall: ${worst.region} · ${worst.unit} at ${fmtPct(worst.gap)} against target.` : 'No segment is materially behind target.',
  ]
  const finStale = issues.find((i) => i.id === 'DQ-114' && i.status !== 'Resolved')
  const failedPipes = pipelines.filter((p) => p.status === 'Failed')
  const onbRow = OPS.find((o) => o.m === 23 && o.team === 'Onboarding') ?? OPS.filter((o) => o.m === 23)[0]
  const onb = `${onbRow.team} SLA compliance is ${onbRow.sla.toFixed(1)}%, below the 95% target`

  const refresh = () => {
    setRefreshing(true); setRefreshErr(false)
    setTimeout(() => {
      setRefreshing(false)
      if (finStale) { setRefreshErr(true); toast('Refreshed 6 of 7 datasets. Finance failed to refresh.', 'warning') } else { setLastRefresh(new Date().toISOString()); toast('All datasets refreshed.') }
    }, 1100)
  }

  const monthRows = month === null ? [] : FACTS.filter((x) => x.m === month && (f.region === 'All' || x.region === f.region) && (f.unit === 'All' || x.unit === f.unit)).map((x) => ({ ...x, gap: x.revenue / x.target - 1 }))

  if (loading) return (
    <div aria-busy="true" aria-label="Loading overview">
      <Skeleton className="mb-2 h-7 w-64" /><Skeleton className="mb-6 h-4 w-96" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[112px] rounded-xl" />)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 rounded-xl lg:col-span-2" /><Skeleton className="h-80 rounded-xl" /></div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Executive Overview" description={<>Business health for Halcyon Global · {filterSummary(f)} · data refreshed {ago(lastRefresh)}</>}
        badge={<Badge tone="info">Demo data</Badge>}
        actions={<Button icon={<RefreshCw className={cx('size-4', refreshing && 'animate-spin')} />} onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh data'}</Button>} />

      {refreshErr && (
        <div className="mb-4"><Banner tone="warning" title="Finance data failed to refresh" action={<Button size="sm" onClick={refresh}>Retry</Button>}>
          Profit and cost figures may be up to 9 hours old. The Revenue daily load pipeline cannot authenticate to NetSuite. <Link to="/quality" className="font-medium text-primary-ink underline">See DQ-114</Link>.
        </Banner></div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <FilterBar filters={f} onChange={setFilters} />
        <p className="text-xs text-muted">Click a KPI to chart it. Click a region, unit or month to drill down.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Key performance indicators">
        {kpis.map((x) => <KpiCard key={x.key} k={x.k} hint={x.hint} label={x.label} span={span} active={sel === x.key} onSelect={() => setSel(x.key)} />)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8" title={`${selDef.label} trend`} subtitle={`Monthly · ${monthLabel(f.start, true)} – ${monthLabel(f.end, true)} vs previous ${span} months. Select a point to drill into that month.`}
          actions={<Legend items={[{ label: 'Current period', color: 'var(--c1)' }, { label: 'Previous period', color: 'var(--c5)', dashed: true }]} />}>
          <LineChart labels={cur.map((c) => c.label)} format={fmt} height={270} ariaLabel={`${selDef.label} by month for the selected period compared with the previous period`} onPoint={(i) => setMonth(cur[i].m)}
            series={[{ name: 'Current', values: cur.map((c) => c.value), color: 'var(--c1)', area: true }, { name: 'Previous', values: prev.map((c) => c.value), color: 'var(--c5)', dashed: true, width: 1.6 }]} />
        </Card>
        <Card className="xl:col-span-4" title="Revenue by region" subtitle="Click a region to filter the whole dashboard">
          <BarList ariaLabel="Revenue by region" data={region.map((r, i) => ({ label: r.key, value: r.value, prev: regionPrev[i]?.value, extra: <span className={cx('ml-2 text-xs', r.value >= (regionPrev[i]?.value ?? 0) ? 'text-success' : 'text-danger')}>{regionPrev[i]?.value ? `${r.value >= regionPrev[i].value ? '+' : '−'}${Math.abs((r.value / regionPrev[i].value - 1) * 100).toFixed(1)}%` : ''}</span> }))}
            format={fmtMoney} compare compareLabel="Previous period" activeKey={f.region === 'All' ? null : f.region} onBar={(l) => setFilters({ ...f, region: f.region === l ? 'All' : l })} />
          <p className="mt-3 text-xs text-muted">Thin bar = previous {span} months.</p>
        </Card>

        <Card className="xl:col-span-4" title="Performance by business unit" subtitle="Revenue and change vs previous period">
          <BarList ariaLabel="Revenue by business unit" colors data={unit.map((r, i) => ({ label: r.key, value: r.value, prev: unitPrev[i]?.value, extra: <span className={cx('ml-2 text-xs', r.value >= (unitPrev[i]?.value ?? 0) ? 'text-success' : 'text-danger')}>{unitPrev[i]?.value ? `${r.value >= unitPrev[i].value ? '+' : '−'}${Math.abs((r.value / unitPrev[i].value - 1) * 100).toFixed(1)}%` : ''}</span> }))}
            format={fmtMoney} activeKey={f.unit === 'All' ? null : f.unit} onBar={(l) => setFilters({ ...f, unit: f.unit === l ? 'All' : l })} />
        </Card>
        <Card className="xl:col-span-4" title="Product category contribution" subtitle="Share of revenue, derived from unit mix">
          <Donut ariaLabel="Revenue share by product category" data={cat.map((c) => ({ label: c.key, value: c.value }))} format={fmtMoney} centerLabel={rev.text} />
        </Card>
        <Card className="xl:col-span-4" title="Customer acquisition funnel" subtitle={`${fmtPct(stages[4].value / stages[1].value)} of leads convert to customers`}>
          <Funnel stages={stages} format={fmtNum} />
        </Card>

        <Card className="xl:col-span-6" title="Actual versus target" subtitle="Monthly revenue; dashed marker is the plan target" actions={<Legend items={[{ label: 'Actual', color: 'var(--c1)', swatch: 'box' }, { label: 'Target', color: 'var(--ink)', dashed: true }]} />}>
          <ColumnChart ariaLabel="Monthly revenue actual versus target" data={attain} format={fmtMoney} onBar={(l) => { const m = cur.find((c) => c.label === l)?.m; if (m !== undefined) setMonth(m) }} />
        </Card>
        <Card className="xl:col-span-6" title="Forecast versus historical" subtitle="Next 6 months, 80% confidence band. Projected values are model output, not actuals."
          actions={<Legend items={[{ label: 'Actual', color: 'var(--c1)' }, { label: 'Projected', color: 'var(--c3)', dashed: true }]} />}>
          <LineChart ariaLabel="Historical revenue and 6-month projection with confidence band" format={fmtMoney} height={240} markerAt={fcAll.hist.length - 1} markerLabel="Today"
            labels={[...fcAll.hist.map((h) => h.label), ...fcAll.fc.map((h) => h.label)]}
            series={[
              { name: 'Actual', color: 'var(--c1)', values: [...fcAll.hist.map((h) => h.value), ...fcAll.fc.map(() => null)] },
              { name: 'Projected', color: 'var(--c3)', dashed: true, values: [...fcAll.hist.map((h, i) => (i === fcAll.hist.length - 1 ? h.value : null)), ...fcAll.fc.map((h) => h.expected)], band: { lo: [...fcAll.hist.map(() => null), ...fcAll.fc.map((h) => h.lo)], hi: [...fcAll.hist.map(() => null), ...fcAll.fc.map((h) => h.hi)] } },
            ]} />
          <p className="mt-2 text-xs text-muted">Projection uses the last 12 months for the selected segments, independent of the date filter. <Link to="/forecasting" className="font-medium text-primary-ink underline">Open scenarios</Link></p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5" title={<span className="flex items-center gap-1.5"><Sparkles className="size-4 text-primary-ink" aria-hidden />Executive summary</span>} actions={<Badge tone="info">Demo summary · rules-based, not an LLM</Badge>}>
          <ul className="space-y-2 text-[13px] text-ink">{summary.map((s, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{s}</li>)}</ul>
          <details className="mt-3 text-xs text-ink-2"><summary className="cursor-pointer font-medium text-primary-ink">How this was calculated</summary>
            <p className="mt-1.5">Computed from the Sales and Finance datasets for {filterSummary(f)}. Revenue = SUM(revenue_usd_k). Previous period = the {span} months before {monthLabel(f.start, true)}. Margin = (revenue − cost) ÷ revenue. Retention = 1 − churned ÷ customers at period start.</p></details>
          <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => go('/copilot')} icon={<Sparkles className="size-3.5" />}>Ask the copilot</Button></div>
        </Card>
        <Card className="xl:col-span-3" title={<span className="flex items-center gap-1.5"><Lightbulb className="size-4 text-success" aria-hidden />Key opportunities</span>} subtitle="Fastest-growing segments vs previous period">
          <ul className="space-y-3">{opportunities.map((o) => (
            <li key={o.name} className="text-[13px]"><div className="flex items-baseline justify-between gap-2"><span className="font-medium text-ink">{o.name}</span><span className="tnum font-semibold text-success">{o.growth >= 0 ? '+' : '−'}{Math.abs(o.growth * 100).toFixed(1)}%</span></div><p className="text-xs text-muted">{fmtMoney(o.rev)} revenue in period</p></li>
          ))}</ul>
        </Card>
        <Card className="xl:col-span-4" title={<span className="flex items-center gap-1.5"><AlertTriangle className="size-4 text-warning" aria-hidden />Anomalies and risks</span>}>
          <ul className="space-y-2.5 text-[13px]">
            {bad.slice(0, 2).map((b) => <li key={b.region + b.unit} className="flex gap-2"><Badge tone="danger">Revenue</Badge><span className="text-ink">{b.region} · {b.unit} is {fmtPct(Math.abs(b.gap))} below target ({fmtMoney(b.revenue)} vs {fmtMoney(b.target)}).</span></li>)}
            <li className="flex gap-2"><Badge tone="warning">Operations</Badge><span className="text-ink">{onb}. Backlog up ~90 items since August.</span></li>
            {finStale && <li className="flex gap-2"><Badge tone="danger">Data</Badge><span className="text-ink">Finance dataset is 9h stale. Profit figures may lag. <Link to="/quality" className="text-primary-ink underline">DQ-114</Link></span></li>}
            {failedPipes.length > 0 && <li className="flex gap-2"><Badge tone="danger">Pipeline</Badge><span className="text-ink">{failedPipes.map((p) => p.name).join(', ')} failed on its last run.</span></li>}
            {!bad.length && !finStale && !failedPipes.length && <li className="text-muted">No active risks for this selection.</li>}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-6" title="Underperforming segments" subtitle="Lowest revenue attainment against target" pad={false}>
          <Table caption="Segments ranked by attainment gap" rows={under.slice(0, 8)} rowKey={(r) => r.region + r.unit} pageSize={5} dense onRowClick={(r) => setFilters({ ...f, region: r.region, unit: r.unit })}
            cols={[
              { key: 'seg', header: 'Segment', sort: (r) => r.region + r.unit, render: (r) => <span><span className="font-medium">{r.region}</span> <span className="text-muted">· {r.unit}</span></span> },
              { key: 'revenue', header: 'Revenue', align: 'right', sort: (r) => r.revenue, render: (r) => fmtMoney(r.revenue) },
              { key: 'target', header: 'Target', align: 'right', sort: (r) => r.target, render: (r) => fmtMoney(r.target) },
              { key: 'gap', header: 'vs target', align: 'right', sort: (r) => r.gap, render: (r) => <span className={r.gap < -0.04 ? 'font-semibold text-danger' : r.gap < 0 ? 'text-warning' : 'text-success'}>{r.gap >= 0 ? '+' : '−'}{Math.abs(r.gap * 100).toFixed(1)}%</span> },
            ]} />
        </Card>
        <Card className="xl:col-span-3" title="Recently viewed reports">
          <ul className="space-y-2.5">{reports.filter((r) => r.status !== 'Archived').slice(0, 4).map((r) => (
            <li key={r.id}><Link to={`/reports/builder/${r.id}`} className="block rounded-lg p-1 -m-1 hover:bg-sunken"><p className="text-[13px] font-medium text-ink">{r.name}</p><p className="text-xs text-muted">{r.category} · updated {fmtDate(r.updated)}</p></Link></li>
          ))}</ul>
          {level('reports') === 'none' && <p className="text-xs text-muted">Reports are not available to your role.</p>}
        </Card>
        <Card className="xl:col-span-3" title="Recent activity and decisions">
          <ul className="space-y-2.5 text-[13px]">
            {decisions.slice(0, 2).map((d) => <li key={d.id}><Link to="/collaboration" className="block"><span className="flex items-center gap-1.5"><StatusBadge status={d.status} /></span><span className="mt-0.5 block font-medium text-ink">{d.title}</span><span className="text-xs text-muted">{d.owner} · due {fmtDate(d.due)}</span></Link></li>)}
            {audit.filter((a) => a.result === 'Success').slice(0, 2).map((a) => <li key={a.id} className="flex gap-2 text-xs text-ink-2"><TrendingUp className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden /><span><b className="text-ink">{a.actor}</b> {a.action.replace('.', ' ')} · {a.target} · {ago(a.at)}</span></li>)}
          </ul>
        </Card>
      </div>

      <Drawer open={month !== null} onClose={() => setMonth(null)} title={month !== null ? `${monthLabel(month, true)} detail` : ''} description={`Revenue by region and business unit · ${f.region === 'All' ? 'all regions' : f.region} · ${f.unit === 'All' ? 'all units' : f.unit}`} width="max-w-2xl">
        <Table caption="Revenue records for the selected month" rows={monthRows} rowKey={(r) => r.region + r.unit} pageSize={8} dense
          cols={[
            { key: 'region', header: 'Region', sort: (r) => r.region }, { key: 'unit', header: 'Business unit', sort: (r) => r.unit },
            { key: 'revenue', header: 'Revenue', align: 'right', sort: (r) => r.revenue, render: (r) => fmtMoney(r.revenue) },
            { key: 'target', header: 'Target', align: 'right', sort: (r) => r.target, render: (r) => fmtMoney(r.target) },
            { key: 'gap', header: 'vs target', align: 'right', sort: (r) => r.gap, render: (r) => <span className={r.gap < -0.04 ? 'font-semibold text-danger' : ''}>{r.gap >= 0 ? '+' : '−'}{Math.abs(r.gap * 100).toFixed(1)}%</span> },
          ]} />
        <p className="mt-3 text-xs text-muted">Total {month !== null && fmtMetric('revenue', metricValue(pick(f, month, month), 'revenue'))}. Source: Sales dataset (monthly grain). <Link to="/explore/sales" className="text-primary-ink underline">Open dataset</Link></p>
        <div className="mt-4 flex justify-end"><Button icon={<X className="size-4" />} onClick={() => setMonth(null)}>Close</Button></div>
      </Drawer>
    </div>
  )
}
export type { Filters }
export { groupBy, CATEGORIES }
