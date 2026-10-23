import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'

export const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)']

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function niceTicks(min: number, max: number, count = 4) {
  if (max === min) { max = min + 1 }
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const t: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(6))
  return t
}

export function Sparkline({ data, color = 'var(--c1)', width = 88, height = 28, good }: { data: number[]; color?: string; width?: number; height?: number; good?: boolean }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const x = (i: number) => (i / (data.length - 1)) * (width - 4) + 2
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const c = good === undefined ? color : good ? 'var(--success)' : 'var(--danger)'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <path d={`${d} L${x(data.length - 1)},${height} L${x(0)},${height} Z`} fill={c} opacity="0.08" />
      <path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.2" fill={c} />
    </svg>
  )
}

export interface LineSeries { name: string; color?: string; values: (number | null)[]; dashed?: boolean; band?: { lo: (number | null)[]; hi: (number | null)[] }; area?: boolean; width?: number }
export function LineChart({ labels, series, height = 260, format = (v: number) => String(v), ariaLabel, onPoint, markerAt, markerLabel, className }: {
  labels: string[]; series: LineSeries[]; height?: number; format?: (v: number) => string; ariaLabel: string; onPoint?: (i: number) => void; markerAt?: number; markerLabel?: string; className?: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 52, padR = 12, padT = 10, padB = 24
  const all: number[] = []
  series.forEach((s) => { s.values.forEach((v) => v !== null && all.push(v)); s.band?.lo.forEach((v) => v !== null && all.push(v)); s.band?.hi.forEach((v) => v !== null && all.push(v)) })
  const ticks = niceTicks(Math.min(...all), Math.max(...all))
  const y0 = ticks[0], y1 = ticks[ticks.length - 1]
  const n = labels.length
  const x = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (w - padL - padR))
  const y = (v: number) => padT + (1 - (v - y0) / (y1 - y0 || 1)) * (height - padT - padB)
  const path = (vals: (number | null)[]) => { let d = '', pen = false; vals.forEach((v, i) => { if (v === null) { pen = false; return } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true }); return d }
  const bandPath = (b: { lo: (number | null)[]; hi: (number | null)[] }) => {
    const idx = b.lo.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0)
    if (!idx.length) return ''
    return idx.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(b.hi[i]!)}`).join(' ') + ' ' + [...idx].reverse().map((i) => `L${x(i)},${y(b.lo[i]!)}`).join(' ') + ' Z'
  }
  const step = Math.ceil(n / Math.max(2, Math.floor((w - padL) / 56)))
  const move = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect()
    const i = Math.round(((clientX - r.left - padL) / (w - padL - padR)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  return (
    <div ref={ref} className={cx('relative w-full', className)}>
      <svg width={w} height={height} role="img" aria-label={ariaLabel} tabIndex={0} className="block overflow-visible rounded"
        onMouseMove={(e) => move(e.clientX, e.currentTarget)} onMouseLeave={() => setHover(null)} onClick={() => hover !== null && onPoint?.(hover)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)) }
          if (e.key === 'Enter' && hover !== null) onPoint?.(hover)
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => i % step === 0 && <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{l}</text>)}
        {markerAt !== undefined && markerAt >= 0 && markerAt < n && (
          <g><line x1={x(markerAt)} x2={x(markerAt)} y1={padT} y2={height - padB} stroke="var(--line-strong)" strokeDasharray="3 3" />{markerLabel && <text x={x(markerAt) + 6} y={padT + 10} fontSize="11" fill="var(--muted)">{markerLabel}</text>}</g>
        )}
        {series.map((s, si) => s.band && <path key={'b' + si} d={bandPath(s.band)} fill={s.color ?? PALETTE[si % 5]} opacity="0.14" />)}
        {series.map((s, si) => {
          const c = s.color ?? PALETTE[si % 5]
          return (
            <g key={si}>
              {s.area && <path d={path(s.values) + `L${x(n - 1)},${y(y0)} L${x(0)},${y(y0)} Z`} fill={c} opacity="0.08" />}
              <path d={path(s.values)} fill="none" stroke={c} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - padB} stroke="var(--line-strong)" />
            {series.map((s, si) => s.values[hover] !== null && s.values[hover] !== undefined && <circle key={si} cx={x(hover)} cy={y(s.values[hover]!)} r="4" fill="var(--surface)" stroke={s.color ?? PALETTE[si % 5]} strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs shadow-lg" style={{ left: Math.min(Math.max(x(hover) + 12, 4), w - 170), top: 4 }}>
          <p className="mb-1 font-semibold text-ink">{labels[hover]}</p>
          {series.map((s, si) => s.values[hover] !== null && s.values[hover] !== undefined && (
            <p key={si} className="flex items-center justify-between gap-3 text-ink-2"><span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3" style={{ background: s.color ?? PALETTE[si % 5] }} />{s.name}</span><span className="tnum font-medium text-ink">{format(s.values[hover]!)}</span></p>
          ))}
        </div>
      )}
      <table className="sr-only"><caption>{ariaLabel}</caption><thead><tr><th>Period</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={i}><td>{l}</td>{series.map((s) => <td key={s.name}>{s.values[i] === null || s.values[i] === undefined ? '' : format(s.values[i]!)}</td>)}</tr>)}</tbody></table>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color?: string; dashed?: boolean; swatch?: 'line' | 'box' }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it, i) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.swatch === 'box' ? <span className="size-2.5 rounded-sm" style={{ background: it.color ?? PALETTE[i % 5] }} /> : <svg width="16" height="6" aria-hidden><line x1="0" x2="16" y1="3" y2="3" stroke={it.color ?? PALETTE[i % 5]} strokeWidth="2" strokeDasharray={it.dashed ? '4 3' : undefined} /></svg>}
          {it.label}
        </li>
      ))}
    </ul>
  )
}

// Vertical columns with optional target tick.
export function ColumnChart({ data, height = 240, format = (v: number) => String(v), ariaLabel, onBar, activeKey, color = 'var(--c1)', targetLabel = 'Target' }: {
  data: { label: string; value: number; target?: number; color?: string }[]; height?: number; format?: (v: number) => string; ariaLabel: string; onBar?: (label: string) => void; activeKey?: string | null; color?: string; targetLabel?: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 52, padR = 8, padT = 10, padB = 24
  const max = Math.max(...data.map((d) => Math.max(d.value, d.target ?? 0)), 1)
  const ticks = niceTicks(0, max)
  const top = ticks[ticks.length - 1]
  const bw = (w - padL - padR) / data.length
  const y = (v: number) => padT + (1 - v / top) * (height - padT - padB)
  const step = Math.ceil(data.length / Math.max(2, Math.floor((w - padL) / 48)))
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} role="img" aria-label={ariaLabel} className="block">
        {ticks.map((t) => <g key={t}><line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{format(t)}</text></g>)}
        {data.map((d, i) => {
          const bx = padL + i * bw + bw * 0.18
          const bwid = bw * 0.64
          const dim = activeKey && activeKey !== d.label
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onBar?.(d.label)} className={onBar ? 'cursor-pointer' : ''} opacity={dim ? 0.45 : 1}>
              <rect x={padL + i * bw} y={padT} width={bw} height={height - padT - padB} fill="transparent" />
              <rect x={bx} y={y(d.value)} width={bwid} height={Math.max(0, y(0) - y(d.value))} rx="3" fill={d.color ?? color} opacity={hover === i ? 1 : 0.9} />
              {d.target !== undefined && <line x1={bx - 3} x2={bx + bwid + 3} y1={y(d.target)} y2={y(d.target)} stroke="var(--ink)" strokeWidth="2" strokeDasharray="3 2" />}
              {i % step === 0 && <text x={bx + bwid / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs shadow-lg" style={{ left: Math.min(Math.max(padL + hover * bw + bw / 2 - 60, 4), w - 150), top: 0 }}>
          <p className="mb-0.5 font-semibold text-ink">{data[hover].label}</p>
          <p className="tnum text-ink-2">Actual <span className="font-medium text-ink">{format(data[hover].value)}</span></p>
          {data[hover].target !== undefined && <p className="tnum text-ink-2">{targetLabel} <span className="font-medium text-ink">{format(data[hover].target!)}</span></p>}
        </div>
      )}
      <table className="sr-only"><caption>{ariaLabel}</caption><thead><tr><th>Category</th><th>Actual</th>{data[0]?.target !== undefined && <th>{targetLabel}</th>}</tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{format(d.value)}</td>{d.target !== undefined && <td>{format(d.target)}</td>}</tr>)}</tbody></table>
    </div>
  )
}

// Horizontal bars (HTML) – good for long labels, with optional comparison value.
export function BarList({ data, format = (v: number) => String(v), onBar, activeKey, ariaLabel, colors, compare, compareLabel = 'Previous' }: {
  data: { label: string; value: number; prev?: number; extra?: ReactNode }[]; format?: (v: number) => string; onBar?: (label: string) => void; activeKey?: string | null; ariaLabel: string; colors?: boolean; compare?: boolean; compareLabel?: string
}) {
  const max = Math.max(...data.map((d) => Math.max(d.value, compare ? d.prev ?? 0 : 0)), 1)
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {data.map((d, i) => {
        const dim = activeKey && activeKey !== d.label
        const c = colors ? PALETTE[i % 5] : 'var(--c1)'
        const Tag = onBar ? 'button' : 'div'
        return (
          <li key={d.label} className={dim ? 'opacity-50' : ''}>
            <Tag {...(onBar ? { onClick: () => onBar(d.label), type: 'button' as const } : {})} className="block w-full rounded text-left">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]"><span className="truncate text-ink">{d.label}</span><span className="tnum shrink-0 font-medium text-ink">{format(d.value)}{d.extra}</span></div>
              <div className="h-2 rounded-full bg-sunken"><div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: c }} /></div>
              {compare && d.prev !== undefined && <div className="mt-1 h-1 rounded-full bg-sunken"><div className="h-full rounded-full bg-line-strong" style={{ width: `${(d.prev / max) * 100}%` }} title={`${compareLabel}: ${format(d.prev)}`} /></div>}
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}

export function Donut({ data, format = (v: number) => String(v), onSlice, activeKey, ariaLabel, centerLabel }: {
  data: { label: string; value: number }[]; format?: (v: number) => string; onSlice?: (l: string) => void; activeKey?: string | null; ariaLabel: string; centerLabel?: string
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const R = 52, C = 2 * Math.PI * R
  let off = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={ariaLabel} className="shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--sunken)" strokeWidth="18" />
        {data.map((d, i) => {
          const len = (d.value / total) * C
          const el = <circle key={d.label} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % 5]} strokeWidth={activeKey === d.label ? 22 : 18} strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} opacity={activeKey && activeKey !== d.label ? 0.4 : 1} className={onSlice ? 'cursor-pointer' : ''} onClick={() => onSlice?.(d.label)} />
          off += len
          return el
        })}
        {centerLabel && <text x="70" y="74" textAnchor="middle" transform="rotate(90 70 70)" fontSize="13" fontWeight="600" fill="var(--ink)">{centerLabel}</text>}
      </svg>
      <ul className="flex min-w-40 flex-1 flex-col gap-1.5 text-[13px]">
        {data.map((d, i) => (
          <li key={d.label}>
            <button type="button" disabled={!onSlice} onClick={() => onSlice?.(d.label)} className={cx('flex w-full items-center gap-2 rounded text-left', activeKey && activeKey !== d.label && 'opacity-50')}>
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % 5] }} />
              <span className="flex-1 truncate text-ink">{d.label}</span>
              <span className="tnum font-medium text-ink">{format(d.value)}</span>
              <span className="tnum w-10 text-right text-muted">{((d.value / total) * 100).toFixed(0)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Funnel({ stages, format }: { stages: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = stages[0]?.value || 1
  return (
    <ol aria-label="Customer acquisition funnel" className="flex flex-col gap-2">
      {stages.map((s, i) => (
        <li key={s.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-[13px]">
          <span className="text-ink-2">{s.label}</span>
          <div className="h-6 rounded-md bg-sunken"><div className="flex h-full items-center rounded-md px-2 text-xs font-medium text-white" style={{ width: `${Math.max(6, (s.value / max) * 100)}%`, background: PALETTE[0], opacity: 1 - i * 0.14 }} /></div>
          <span className="tnum w-24 text-right"><span className="font-medium text-ink">{format(s.value)}</span>{i > 0 && <span className="ml-1.5 text-xs text-muted">{((s.value / stages[i - 1].value) * 100).toFixed(0)}%</span>}</span>
        </li>
      ))}
    </ol>
  )
}
