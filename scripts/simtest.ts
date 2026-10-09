// 헤드리스 시뮬레이션 점검: 워밍업 시간, 시간대별 KPI, 시나리오, 불변식
import { World } from '../src/sim/engine'
const t0 = performance.now()
const w = new World(new Date(process.env.SIM_NOW ?? '2026-10-09T12:05:00+09:00'), 5)
console.log('warmup ms', Math.round(performance.now() - t0))
const fmt = (t: number) => { const m = Math.floor((((t % 86400) + 86400) % 86400) / 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
const report = () => w.sites.map((s) => {
  const k = s.kpis(w.time)
  return `${s.cfg.short} 정시${k.onTimePct.toFixed(0)}%(${k.done}) 도크${k.occupied}/${k.opDocks} 대기장${k.yardCount}/${k.yardCap} 대기${k.avgWaitMin.toFixed(0)}m 재고${k.fillPct.toFixed(0)}% 품절${k.out} FL${k.flActive}/${k.flTotal} 인원${k.onFloor}/${k.crew} 휴게${k.onBreak} 게이트${s.stats.gateIn}/${s.stats.gateOut}`
}).join('\n   ')
console.log(fmt(w.time), report())
const s = w.sites[0]
for (const k of ['urgent', 'surge', 'forkliftDown', 'truckDown'] as const) console.log(k, s.triggerScenario(k, w.time).text)
for (let h = 0; h < 4; h++) {
  const t1 = performance.now()
  w.runTo(w.time + 3600)
  console.log(fmt(w.time), `(${Math.round(performance.now() - t1)}ms/h)`, report())
}
let bad = 0
for (const site of w.sites) {
  for (const b of site.bays) if (b.stock < 0 || b.stock > 8 || b.resIn < 0 || b.resOut < 0) bad++
  for (const sh of site.shipments) for (const [li, l] of sh.lines.entries()) {
    if (l.flight < 0 || l.done > l.qty) bad++
    if (site.forklifts.filter((f) => f.task?.shipId === sh.id && f.task.line === li).length !== l.flight) bad++
  }
  for (const wk of site.workers) if (!Number.isFinite(wk.pose.x) || !Number.isFinite(wk.pose.z)) bad++
}
console.log('invariant violations', bad)
console.log(s.workers.slice(0, 40).filter((_, i) => i % 4 === 0).map((x) => `${x.name}(${x.role}) ${x.activity} @${x.place}`).join('\n'))
