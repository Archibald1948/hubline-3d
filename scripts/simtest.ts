// 헤드리스 시뮬레이션 점검: 워밍업 시간, KPI, 시나리오, 불변식, 차량 겹침
import { World } from '../src/sim/engine'
const t0 = performance.now()
const w = new World(new Date(process.env.SIM_NOW ?? '2026-10-09T12:05:00+09:00'), 5)
console.log('warmup ms', Math.round(performance.now() - t0))
const fmt = (t: number) => { const m = Math.floor((((t % 86400) + 86400) % 86400) / 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
const report = () => w.sites.map((s) => {
  const k = s.kpis(w.time)
  return `${s.cfg.short} 정시${k.onTimePct.toFixed(0)}%(${k.done}) 도크${k.occupied}/${k.opDocks} 대기장${k.yardCount}/${k.yardCap} 대기${k.avgWaitMin.toFixed(0)}m 체류${k.avgDwellMin.toFixed(0)}m 처리${k.palletsIn + k.palletsOut} FL${k.flActive}/${k.flTotal} 게이트${s.stats.gateIn}/${s.stats.gateOut} 구역${s.zones.size}`
}).join('\n   ')
console.log(fmt(w.time), report())
const s0 = w.sites[0]
if (process.env.SCEN) for (const k of ['urgent', 'surge', 'forkliftDown', 'truckDown'] as const) console.log(k, s0.triggerScenario(k, w.time).text)
// 겹침 검사: 매 시뮬 초마다
let truckHits = 0, flHits = 0, samples = 0
const seen = new Set<string>()
const hours = Number(process.env.HOURS ?? 4)
for (let h = 0; h < hours; h++) {
  const t1 = performance.now()
  for (let i = 0; i < 3600; i++) {
    w.runTo(w.time + 1)
    if (i % 3 === 0) for (const s of w.sites) {
      const o = s.overlaps()
      samples++
      truckHits += o.trucks
      flHits += o.forklifts
      for (const p of o.pairs) if (seen.size < 10) seen.add(`${fmt(w.time)} ${s.cfg.short} ${p}`)
    }
  }
  console.log(fmt(w.time), `(${Math.round(performance.now() - t1)}ms/h)`, report())
}
let bad = 0
for (const site of w.sites) {
  for (const b of site.bays) if (b.stock < 0 || b.stock > 8 || b.resIn < 0 || b.resOut < 0) bad++
  for (const sh of site.shipments) for (const [li, l] of sh.lines.entries()) {
    if (l.flight < 0 || l.done > l.qty) bad++
    if (site.forklifts.filter((f) => f.task?.shipId === sh.id && f.task.line === li).length !== l.flight) bad++
  }
}
console.log('invariant violations', bad)
console.log(`overlap samples ${samples}: truck-pairs ${truckHits}, forklift-pairs ${flHits}`)
console.log([...seen].join('\n'))
// 멈춘 차량 진단
for (const site of w.sites) {
  const stuck = [...site.trucks.values()].filter((t) => t.mv.waitFrom != null && w.time - t.mv.waitFrom > 900)
  if (stuck.length) console.log(site.cfg.short, 'stuck>15m', stuck.map((t) => `${t.id}:${t.phase}:${t.mv.blocker}`).join(' '))
}
