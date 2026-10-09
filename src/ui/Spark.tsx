// 시간대별 정시율 스파크라인 (최근 8시간)
export function Spark({ data }: { data: { hour: number; pct: number | null; n: number }[] }) {
  const W = 132
  const H = 40
  const pad = 4
  const vals = data.map((d) => d.pct)
  const min = Math.min(60, ...vals.filter((v): v is number => v != null))
  const x = (i: number) => pad + (i * (W - pad * 2)) / (data.length - 1)
  const y = (v: number) => pad + (1 - (v - min) / (100 - min)) * (H - pad * 2 - 8)
  const pts = data.map((d, i) => (d.pct == null ? null : ([x(i), y(d.pct)] as const))).filter((p): p is readonly [number, number] => p != null)
  if (pts.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} />
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - 8} L${pts[0][0].toFixed(1)},${H - 8} Z`
  const last = pts[pts.length - 1]
  const y90 = y(90)
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="최근 8시간 정시율 추이">
      <line x1={pad} x2={W - pad} y1={y90} y2={y90} className="spark-ref" />
      <text x={W - pad} y={y90 - 2} className="spark-reftext" textAnchor="end">
        90
      </text>
      <path d={area} className="spark-area" />
      <path d={line} className="spark-line" />
      <circle cx={last[0]} cy={last[1]} r="2.6" className="spark-dot" />
      {data.map((d, i) =>
        i % 2 === (data.length - 1) % 2 ? (
          <text key={d.hour} x={x(i)} y={H - 0.5} className="spark-tick" textAnchor="middle">
            {((d.hour % 24) + 24) % 24}
          </text>
        ) : null,
      )}
    </svg>
  )
}
