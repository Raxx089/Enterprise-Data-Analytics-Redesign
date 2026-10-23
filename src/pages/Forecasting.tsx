import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, Download, GitCompare, MoreHorizontal, Pencil, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import { useStore, uid, type Scenario } from '../lib/store'
import { SEED_SCENARIOS } from '../lib/store'
import { monthLabel } from '../lib/data'
import { filterSummary, fmtDate, fmtMoney, fmtNum, forecastSeries, type Assumptions, type FcPoint, type Filters } from '../lib/analytics'
import { Badge, Banner, Button, Card, EmptyState, Field, FilterBar, Input, Menu, Modal, PageHeader, ReadOnlyNote, Segmented, Select, Skeleton, Table, cx } from '../components/ui'
import { Legend, LineChart, PALETTE } from '../components/charts'
import { useDirty } from '../lib/router'

type FcMetric = 'revenue' | 'cost' | 'profit' | 'won' | 'leads'
const METRIC_OPTS: { key: FcMetric; label: string; usd: boolean }[] = [
  { key: 'revenue', label: 'Revenue', usd: true },
  { key: 'cost', label: 'Operating costs', usd: true },
  { key: 'profit', label: 'Operating profit', usd: true },
  { key: 'won', label: 'New customers', usd: false },
  { key: 'leads', label: 'Leads', usd: false },
]
const ZERO: Assumptions = { growthAdj: 0, costInflation: 0, demandAdj: 0 }
const same = (a: Assumptions, b: Assumptions) => a.growthAdj === b.growthAdj && a.costInflation === b.costInflation && a.demandAdj === b.demandAdj

interface Proj { hist: { m: number; label: string; value: number }[]; fc: FcPoint[]; growth: number }
function project(f: Filters, metric: FcMetric, h: number, a: Assumptions): Proj {
  if (metric !== 'profit') return forecastSeries(f, metric, h, a)
  const r = forecastSeries(f, 'revenue', h, a)
  const c = forecastSeries(f, 'cost', h, a)
  return {
    growth: r.growth,
    hist: r.hist.map((x, i) => ({ ...x, value: x.value - c.hist[i].value })),
    fc: r.fc.map((p, i) => ({ m: p.m, label: p.label, expected: p.expected - c.fc[i].expected, lo: p.lo - c.fc[i].hi, hi: p.hi - c.fc[i].lo })),
  }
}

function csvCell(v: string | number) { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
function downloadFile(name: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

function Slider({ id, label, value, min, max, step, unit, onChange, hint }: { id: string; label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-ink">{label}</label>
        <span className="tnum text-[13px] font-semibold text-ink">{value > 0 ? '+' : ''}{value.toFixed(step < 1 ? 1 : 0)}{unit}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} aria-valuetext={`${value}${unit}`} className="mt-1.5 w-full accent-[var(--primary)]" />
      <p className="text-xs text-muted">{hint}</p>
    </div>
  )
}

const KIND_TONE = { Best: 'success', Expected: 'primary', Worst: 'danger', Custom: 'neutral' } as const
const describeA = (a: Assumptions) => `Growth ${a.growthAdj >= 0 ? '+' : ''}${a.growthAdj} pt/mo · Cost infl. ${a.costInflation}% · Demand ${a.demandAdj >= 0 ? '+' : ''}${a.demandAdj}%`

export default function Forecasting() {
  const { filters, scenarios, setScenarios, userName, level, log, toast, confirm } = useStore()
  const canEdit = level('forecasting') === 'edit'
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 400); return () => clearTimeout(t) }, [])

  const [metric, setMetric] = useState<FcMetric>('revenue')
  const [horizon, setHorizon] = useState<'3' | '6' | '9' | '12'>('6')
  const [seg, setSeg] = useState<Filters>({ ...filters, start: 12, end: 23 })
  const [a, setA] = useState<Assumptions>(ZERO)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])
  const [retry, setRetry] = useState(0)

  const [saveOpen, setSaveOpen] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Scenario['kind']>('Custom')
  const [nameErr, setNameErr] = useState('')

  const active = scenarios.find((s) => s.id === activeId) ?? null
  const dirty = !same(a, active ? active.assumptions : ZERO)
  useDirty(dirty)

  const h = +horizon
  const def = METRIC_OPTS.find((m) => m.key === metric)!
  const fmt = (v: number) => (def.usd ? fmtMoney(v) : fmtNum(v))

  const calc = useMemo(() => {
    try {
      const base = project(seg, metric, h, ZERO)
      const sim = project(seg, metric, h, a)
      if ([...base.fc, ...sim.fc].some((p) => !Number.isFinite(p.expected))) return null
      return { base, sim }
    } catch { return null }
  }, [seg, metric, h, a, retry]) // eslint-disable-line react-hooks/exhaustive-deps

  const showSim = !same(a, ZERO) || !!active
  const simName = active ? (dirty ? `${active.name} (modified)` : active.name) : 'Simulated scenario'

  const compared = compare.map((id) => scenarios.find((s) => s.id === id)).filter((s): s is Scenario => !!s)
  const compProj = useMemo(() => {
    try { return compared.map((s) => ({ s, p: project(seg, metric, h, s.assumptions) })) } catch { return [] }
  }, [compared.map((s) => s.id + JSON.stringify(s.assumptions)).join('|'), seg, metric, h]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardedLoad = async (s: Scenario) => {
    if (dirty && !(await confirm({ title: 'Discard unsaved assumption changes?', body: `Loading "${s.name}" will replace the assumptions you have modified.`, confirmLabel: 'Discard and load', danger: true }))) return
    setA(s.assumptions); setActiveId(s.id)
    toast(`Loaded scenario "${s.name}".`, 'info')
  }

  const reset = async () => {
    if (dirty && !(await confirm({ title: 'Reset assumptions?', body: 'Your modified assumptions will be lost.', confirmLabel: 'Reset', danger: true }))) return
    setA(active ? active.assumptions : ZERO)
  }

  const validName = (n: string, exceptId?: string) => {
    const t = n.trim()
    if (!t) return 'Enter a scenario name.'
    if (t.length > 60) return 'Use 60 characters or fewer.'
    if (scenarios.some((s) => s.id !== exceptId && s.name.toLowerCase() === t.toLowerCase())) return 'A scenario with this name already exists.'
    return ''
  }
  const today = '2026-10-21'
  const openSave = () => { setRenameId(null); setName(''); setKind('Custom'); setNameErr(''); setSaveOpen(true) }
  const doSave = () => {
    const err = validName(name, renameId ?? undefined)
    if (err) { setNameErr(err); return }
    const t = name.trim()
    if (renameId) {
      setScenarios((x) => x.map((s) => (s.id === renameId ? { ...s, name: t, updated: today } : s)))
      log('scenario.rename', t); toast(`Scenario renamed to "${t}".`)
    } else {
      const sc: Scenario = { id: uid('sc'), name: t, kind, assumptions: a, owner: userName, updated: today }
      setScenarios((x) => [sc, ...x]); setActiveId(sc.id)
      log('scenario.save', t); toast(`Scenario "${t}" saved.`)
    }
    setSaveOpen(false); setRenameId(null)
  }
  const doUpdate = () => {
    if (!active) return
    setScenarios((x) => x.map((s) => (s.id === active.id ? { ...s, assumptions: a, updated: today } : s)))
    log('scenario.edit', active.name); toast(`Scenario "${active.name}" updated.`)
  }
  const openRename = (s: Scenario) => { setRenameId(s.id); setName(s.name); setKind(s.kind); setNameErr(''); setSaveOpen(true) }
  const duplicate = (s: Scenario) => {
    let n = `${s.name} (copy)`, i = 2
    while (scenarios.some((x) => x.name === n)) n = `${s.name} (copy ${i++})`
    setScenarios((x) => [{ ...s, id: uid('sc'), name: n, owner: userName, updated: today }, ...x])
    log('scenario.duplicate', n); toast(`Duplicated as "${n}".`)
  }
  const remove = async (s: Scenario) => {
    if (!(await confirm({ title: `Delete "${s.name}"?`, body: 'This scenario will be permanently removed for everyone in the workspace.', confirmLabel: 'Delete scenario', danger: true }))) return
    setScenarios((x) => x.filter((y) => y.id !== s.id))
    setCompare((c) => c.filter((id) => id !== s.id))
    if (activeId === s.id) setActiveId(null)
    log('scenario.delete', s.name); toast(`Scenario "${s.name}" deleted.`)
  }
  const restoreSeeds = () => { setScenarios(SEED_SCENARIOS); log('scenario.restore', 'Default scenarios'); toast('Default scenarios restored.') }
  const toggleCompare = (id: string) => {
    if (compare.includes(id)) { setCompare(compare.filter((c) => c !== id)); return }
    if (compare.length >= 3) { toast('You can compare up to 3 scenarios at a time.', 'warning'); return }
    setCompare([...compare, id])
  }

  const exportProjection = () => {
    if (!calc) return
    const rows: (string | number)[][] = [['Month', `Baseline low (${def.label})`, 'Baseline expected', 'Baseline high', `${simName} low`, `${simName} expected`, `${simName} high`]]
    calc.base.fc.forEach((p, i) => { const s = calc.sim.fc[i]; rows.push([monthLabel(p.m, true), Math.round(p.lo), Math.round(p.expected), Math.round(p.hi), Math.round(s.lo), Math.round(s.expected), Math.round(s.hi)]) })
    downloadFile(`forecast-${metric}-${h}m.csv`, toCsv(rows))
    log('forecast.export', `${def.label} ${h}m projection (CSV)`); toast('Projection exported as CSV.')
  }
  const exportCompare = () => {
    if (!calc || !compProj.length) return
    const baseTotal = calc.base.fc.reduce((s, p) => s + p.expected, 0)
    const rows: (string | number)[][] = [['Scenario', 'Growth adj (pt/mo)', 'Cost inflation (%)', 'Demand adj (%)', `Total ${h}m expected`, 'Delta vs baseline', 'Delta %']]
    rows.push(['Baseline', 0, 0, 0, Math.round(baseTotal), 0, 0])
    compProj.forEach(({ s, p }) => { const t = p.fc.reduce((x, y) => x + y.expected, 0); rows.push([s.name, s.assumptions.growthAdj, s.assumptions.costInflation, s.assumptions.demandAdj, Math.round(t), Math.round(t - baseTotal), +(((t / baseTotal) - 1) * 100).toFixed(2)]) })
    downloadFile(`scenario-comparison-${metric}-${h}m.csv`, toCsv(rows))
    log('scenario.export', `Comparison of ${compProj.length} scenarios (CSV)`); toast('Comparison exported as CSV.')
  }

  if (loading) return (
    <div aria-busy="true" aria-label="Loading forecasting">
      <Skeleton className="mb-2 h-7 w-56" /><Skeleton className="mb-6 h-4 w-96" />
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96 rounded-xl" /><Skeleton className="h-96 rounded-xl lg:col-span-2" /></div>
    </div>
  )

  const labels = calc ? [...calc.base.hist.map((x) => x.label), ...calc.base.fc.map((x) => x.label)] : []
  const nh = calc?.base.hist.length ?? 12
  const nulls = (n: number) => Array.from({ length: n }, () => null)
  const lastHist = calc ? calc.base.hist[nh - 1].value : 0
  const proj = (p: Proj) => [...nulls(nh - 1), lastHist, ...p.fc.map((x) => x.expected)] as (number | null)[]
  const totalBase = calc ? calc.base.fc.reduce((s, p) => s + p.expected, 0) : 0
  const totalSim = calc ? calc.sim.fc.reduce((s, p) => s + p.expected, 0) : 0

  return (
    <div>
      <PageHeader title="Forecasting" description={<>Project {def.label.toLowerCase()} and test what-if assumptions · {filterSummary({ ...seg, start: 12, end: 23 }).replace('Last 12 months', 'Trailing 12 months history')}</>}
        badge={<Badge tone="info">Simulated</Badge>}
        actions={<Button icon={<Download className="size-4" />} onClick={exportProjection} disabled={!calc}>Export projection (CSV)</Button>} />
      {!canEdit && <ReadOnlyNote page="Forecasting" />}

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Forecast settings">
        <Select aria-label="Metric to forecast" value={metric} onChange={(e) => setMetric(e.target.value as FcMetric)} className="w-48">{METRIC_OPTS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>
        <Segmented label="Forecast horizon" value={horizon} onChange={setHorizon} options={(['3', '6', '9', '12'] as const).map((v) => ({ value: v, label: `${v} mo`, aria: `${v} months` }))} />
        <FilterBar filters={seg} onChange={setSeg} />
      </div>

      {!calc ? (
        <Card><EmptyState icon={<AlertTriangle className="size-5" />} title="The forecast could not be calculated" body="The model failed for this selection. Adjust the filters or try again." action={<Button onClick={() => setRetry((r) => r + 1)}>Retry</Button>} /></Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-4" title="Scenario assumptions" subtitle={active ? `Based on "${active.name}"${dirty ? ' · modified' : ''}` : 'Adjust to simulate a what-if scenario'}
            actions={dirty && <Badge tone="warning" dot>Unsaved changes</Badge>}>
            <div className="space-y-5">
              <Slider id="as-g" label="Growth adjustment" value={a.growthAdj} min={-3} max={3} step={0.1} unit=" pt/mo" onChange={(v) => setA({ ...a, growthAdj: v })} hint="Added to the modelled monthly growth rate." />
              <Slider id="as-c" label="Cost inflation" value={a.costInflation} min={0} max={15} step={0.5} unit="%" onChange={(v) => setA({ ...a, costInflation: v })} hint="Annualised; phased in across the horizon. Affects cost and profit only." />
              <Slider id="as-d" label="Demand adjustment" value={a.demandAdj} min={-15} max={15} step={1} unit="%" onChange={(v) => setA({ ...a, demandAdj: v })} hint="One-off level shift applied to every projected month." />
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={reset} disabled={!dirty}>Reset</Button>
              {canEdit && active && <Button size="sm" onClick={doUpdate} disabled={!dirty} icon={<Save className="size-3.5" />}>Update "{active.name.length > 14 ? active.name.slice(0, 14) + '…' : active.name}"</Button>}
              {canEdit && <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} onClick={openSave}>Save as scenario</Button>}
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-2">Baseline {h}-month total</dt><dd className="tnum font-medium text-ink">{fmt(totalBase)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Simulated {h}-month total</dt><dd className="tnum font-medium text-ink">{fmt(totalSim)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Difference</dt><dd className={cx('tnum font-semibold', totalSim - totalBase >= 0 === (metric !== 'cost') ? 'text-success' : 'text-danger')}>{totalSim >= totalBase ? '+' : '−'}{fmt(Math.abs(totalSim - totalBase))} ({totalBase ? (((totalSim / totalBase) - 1) * 100).toFixed(1) : '0.0'}%)</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Modelled monthly trend</dt><dd className="tnum font-medium text-ink">{(calc.base.growth * 100).toFixed(2)}%</dd></div>
            </dl>
          </Card>

          <Card className="xl:col-span-8" title={`${def.label}: actual and projected`} subtitle={`Trailing 12 months actual, then ${h} months projected. Band is the 80% confidence range for the baseline.`}
            actions={<Legend items={[{ label: 'Actual', color: 'var(--c1)' }, { label: 'Projected baseline (dashed, shaded 80% band)', color: 'var(--c3)', dashed: true }, ...(showSim ? [{ label: `Simulated: ${simName}`, color: 'var(--c2)', dashed: true }] : [])]} />}>
            <LineChart ariaLabel={`${def.label}: 12 months of actuals, ${h}-month projected baseline with confidence band${showSim ? ' and simulated scenario' : ''}`} labels={labels} format={fmt} height={300} markerAt={nh - 1} markerLabel="Today"
              series={[
                { name: 'Actual', color: 'var(--c1)', values: [...calc.base.hist.map((x) => x.value), ...nulls(h)] },
                { name: 'Projected baseline', color: 'var(--c3)', dashed: true, width: 2, values: proj(calc.base), band: { lo: [...nulls(nh), ...calc.base.fc.map((x) => x.lo)], hi: [...nulls(nh), ...calc.base.fc.map((x) => x.hi)] } },
                ...(showSim ? [{ name: simName, color: 'var(--c2)', dashed: true, width: 2.6, values: proj(calc.sim) }] : []),
              ]} />
            <p className="mt-2 text-xs text-muted">
              <span className="font-medium text-ink-2">Actual</span> = solid line. <span className="font-medium text-ink-2">Projected baseline</span> = dashed with shaded confidence band (no adjustments). {showSim ? <><span className="font-medium text-ink-2">Simulated</span> = your assumptions, shown in a separate colour. </> : 'Change an assumption to add a simulated scenario line. '}Projections are model output, not actuals.
            </p>
          </Card>

          <Card className="xl:col-span-12" title="Projected values" subtitle={`${def.label} · ${seg.region === 'All' ? 'all regions' : seg.region} · ${seg.unit === 'All' ? 'all units' : seg.unit}. Low and high form the 80% band.`} pad={false}>
            <Table caption={`Projected ${def.label} by month: low, expected and high`} rows={calc.base.fc.map((p, i) => ({ p, s: calc.sim.fc[i] }))} rowKey={(r) => String(r.p.m)} pageSize={12} dense
              cols={[
                { key: 'month', header: 'Month', sort: (r) => r.p.m, render: (r) => <span className="font-medium">{monthLabel(r.p.m, true)}</span> },
                { key: 'bl', header: 'Baseline low', align: 'right', render: (r) => fmt(r.p.lo) },
                { key: 'be', header: 'Baseline expected', align: 'right', sort: (r) => r.p.expected, render: (r) => <b>{fmt(r.p.expected)}</b> },
                { key: 'bh', header: 'Baseline high', align: 'right', render: (r) => fmt(r.p.hi) },
                { key: 'sl', header: 'Simulated low', align: 'right', hidden: !showSim, render: (r) => fmt(r.s.lo) },
                { key: 'se', header: 'Simulated expected', align: 'right', hidden: !showSim, render: (r) => <b>{fmt(r.s.expected)}</b> },
                { key: 'sh', header: 'Simulated high', align: 'right', hidden: !showSim, render: (r) => fmt(r.s.hi) },
                { key: 'd', header: 'Sim vs baseline', align: 'right', hidden: !showSim, render: (r) => { const d = r.s.expected - r.p.expected; return <span className={d >= 0 === (metric !== 'cost') ? 'text-success' : 'text-danger'}>{d >= 0 ? '+' : '−'}{fmt(Math.abs(d))}</span> } },
              ]} />
          </Card>

          <Card className="xl:col-span-12" title="Saved scenarios" subtitle="Select up to 3 to compare against the baseline" pad={false}
            actions={canEdit ? <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} onClick={openSave}>Save current</Button> : undefined}>
            <Table caption="Saved forecast scenarios" rows={scenarios} rowKey={(s) => s.id} pageSize={5} selectedKey={activeId ?? undefined}
              empty={<EmptyState icon={<GitCompare className="size-5" />} title="No saved scenarios" body="Adjust the assumptions and save a scenario to compare it later." action={canEdit ? <div className="flex gap-2"><Button variant="primary" onClick={openSave}>Save current assumptions</Button><Button onClick={restoreSeeds}>Restore defaults</Button></div> : undefined} />}
              cols={[
                { key: 'cmp', header: 'Compare', render: (s) => <label className="inline-flex items-center gap-1.5"><input type="checkbox" aria-label={`Compare ${s.name}`} checked={compare.includes(s.id)} onChange={() => toggleCompare(s.id)} className="size-4 accent-[var(--primary)]" /></label> },
                { key: 'name', header: 'Scenario', sort: (s) => s.name, render: (s) => <span className="font-medium">{s.name}{s.id === activeId && <span className="ml-2 text-xs font-normal text-primary-ink">loaded</span>}</span> },
                { key: 'kind', header: 'Type', sort: (s) => s.kind, render: (s) => <Badge tone={KIND_TONE[s.kind]}>{s.kind}</Badge> },
                { key: 'as', header: 'Assumptions', render: (s) => <span className="text-ink-2">{describeA(s.assumptions)}</span> },
                { key: 'owner', header: 'Owner', sort: (s) => s.owner },
                { key: 'updated', header: 'Updated', sort: (s) => s.updated, render: (s) => fmtDate(s.updated) },
                { key: 'act', header: 'Actions', render: (s) => (
                  <div className="flex items-center gap-1">
                    <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => guardedLoad(s)}>Load</Button>
                    <Menu label={`More actions for ${s.name}`} trigger={<span className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-sunken"><MoreHorizontal className="size-4" /></span>}
                      items={[
                        { label: 'Rename', icon: <Pencil className="size-3.5" />, disabled: !canEdit, onSelect: () => openRename(s) },
                        { label: 'Duplicate', icon: <Copy className="size-3.5" />, disabled: !canEdit, onSelect: () => duplicate(s) },
                        'sep',
                        { label: 'Delete', icon: <Trash2 className="size-3.5" />, danger: true, disabled: !canEdit, onSelect: () => remove(s) },
                      ]} />
                  </div>
                ) },
              ]} />
          </Card>

          <Card className="xl:col-span-12" title="Scenario comparison" subtitle={compared.length ? `${compared.length} of 3 scenarios vs model baseline · ${def.label}` : 'Choose scenarios above to compare'}
            actions={<Button size="sm" icon={<Download className="size-3.5" />} onClick={exportCompare} disabled={!compared.length}>Export CSV</Button>}>
            {!compared.length ? (
              <EmptyState icon={<GitCompare className="size-5" />} title="Nothing to compare yet" body="Tick the Compare box on up to three saved scenarios to see them side by side." />
            ) : (
              <div className="space-y-5">
                <Legend items={[{ label: 'Actual', color: 'var(--c1)' }, { label: 'Baseline', color: 'var(--c3)', dashed: true }, ...compProj.map(({ s }, i) => ({ label: s.name, color: PALETTE[[1, 3, 4][i] % 5], dashed: true }))]} />
                <LineChart ariaLabel={`${def.label} baseline compared with ${compProj.map((c) => c.s.name).join(', ')}`} labels={labels} format={fmt} height={280} markerAt={nh - 1} markerLabel="Today"
                  series={[
                    { name: 'Actual', color: 'var(--c1)', values: [...calc.base.hist.map((x) => x.value), ...nulls(h)] },
                    { name: 'Baseline', color: 'var(--c3)', dashed: true, values: proj(calc.base) },
                    ...compProj.map(({ s, p }, i) => ({ name: s.name, color: PALETTE[[1, 3, 4][i] % 5], dashed: i % 2 === 1, width: 2.2, values: proj(p) })),
                  ]} />
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <caption className="sr-only">Scenario totals and difference versus baseline</caption>
                    <thead><tr className="border-y border-line bg-sunken text-xs text-muted"><th scope="col" className="px-3 py-2 text-left font-medium">Scenario</th><th scope="col" className="px-3 py-2 text-right font-medium">{h}-month total</th><th scope="col" className="px-3 py-2 text-right font-medium">Final month</th><th scope="col" className="px-3 py-2 text-right font-medium">Delta vs baseline</th><th scope="col" className="px-3 py-2 text-right font-medium">Delta %</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-line"><th scope="row" className="px-3 py-2 text-left font-medium">Baseline (no adjustments)</th><td className="tnum px-3 py-2 text-right">{fmt(totalBase)}</td><td className="tnum px-3 py-2 text-right">{fmt(calc.base.fc[h - 1].expected)}</td><td className="px-3 py-2 text-right text-muted">—</td><td className="px-3 py-2 text-right text-muted">—</td></tr>
                      {compProj.map(({ s, p }) => {
                        const t = p.fc.reduce((x, y) => x + y.expected, 0); const d = t - totalBase; const good = d >= 0 === (metric !== 'cost')
                        return <tr key={s.id} className="border-b border-line last:border-0"><th scope="row" className="px-3 py-2 text-left font-medium">{s.name}<span className="block text-xs font-normal text-muted">{describeA(s.assumptions)}</span></th><td className="tnum px-3 py-2 text-right">{fmt(t)}</td><td className="tnum px-3 py-2 text-right">{fmt(p.fc[h - 1].expected)}</td><td className={cx('tnum px-3 py-2 text-right font-semibold', good ? 'text-success' : 'text-danger')}>{d >= 0 ? '+' : '−'}{fmt(Math.abs(d))}</td><td className={cx('tnum px-3 py-2 text-right', good ? 'text-success' : 'text-danger')}>{d >= 0 ? '+' : '−'}{Math.abs((t / totalBase - 1) * 100).toFixed(1)}%</td></tr>
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <caption className="sr-only">Expected value by month for each compared scenario</caption>
                    <thead><tr className="border-y border-line bg-sunken text-xs text-muted"><th scope="col" className="px-3 py-2 text-left font-medium">Month</th><th scope="col" className="px-3 py-2 text-right font-medium">Baseline</th>{compProj.map(({ s }) => <th key={s.id} scope="col" className="px-3 py-2 text-right font-medium">{s.name}</th>)}</tr></thead>
                    <tbody>{calc.base.fc.map((p, i) => <tr key={p.m} className="border-b border-line last:border-0"><th scope="row" className="px-3 py-1.5 text-left font-medium">{monthLabel(p.m, true)}</th><td className="tnum px-3 py-1.5 text-right">{fmt(p.expected)}</td>{compProj.map(({ s, p: q }) => { const d = q.fc[i].expected - p.expected; return <td key={s.id} className="tnum px-3 py-1.5 text-right">{fmt(q.fc[i].expected)} <span className={cx('text-xs', d >= 0 === (metric !== 'cost') ? 'text-success' : 'text-danger')}>({d >= 0 ? '+' : '−'}{fmt(Math.abs(d))})</span></td> })}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          <div className="xl:col-span-12">
            <Banner tone="info" title="About this model">
              <p>Forecasts use a log-linear seasonal model: the last 12 months are deseasonalised using monthly seasonality indices, a straight-line trend is fitted to the logarithm of the series (a constant monthly growth rate), and the trend is projected forward and re-seasonalised. The shaded band is an 80% range that widens with the square root of the horizon, based on the fit residuals.</p>
              <p className="mt-1.5">Growth adjustment shifts the monthly growth rate, demand adjustment applies a level shift, and cost inflation phases in over twelve months for cost and profit. Outputs are simulated estimates for planning discussions, not guarantees of future results. Profit is calculated as projected revenue minus projected cost, so its band is conservative.</p>
            </Banner>
          </div>
        </div>
      )}

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title={renameId ? 'Rename scenario' : 'Save scenario'} description={renameId ? undefined : describeA(a)}
        footer={<><Button onClick={() => setSaveOpen(false)}>Cancel</Button><Button variant="primary" onClick={doSave}>{renameId ? 'Rename' : 'Save scenario'}</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); doSave() }} className="space-y-4" noValidate>
          <Field label="Scenario name" htmlFor="sc-name" required error={nameErr}>
            <Input id="sc-name" value={name} invalid={!!nameErr} onChange={(e) => { setName(e.target.value); setNameErr('') }} placeholder="e.g. FY27 upside" maxLength={80} data-autofocus />
          </Field>
          {!renameId && (
            <Field label="Scenario type" htmlFor="sc-kind">
              <Select id="sc-kind" value={kind} onChange={(e) => setKind(e.target.value as Scenario['kind'])}>{(['Best', 'Expected', 'Worst', 'Custom'] as const).map((k) => <option key={k}>{k}</option>)}</Select>
            </Field>
          )}
          <button type="submit" className="sr-only" tabIndex={-1}>Submit</button>
        </form>
      </Modal>
    </div>
  )
}
