import { World } from '../src/sim/engine'
const t0 = performance.now()
const w = new World(new Date('2026-10-09T22:15:00+09:00'), 5)
console.log('warmup ms', Math.round(performance.now() - t0))
const s = w.sites[0]
for (const k of ['urgent', 'surge', 'forkliftDown', 'truckDown'] as const) console.log(k, JSON.stringify(s.triggerScenario(k, w.time)))
for (let h = 0; h < 3; h++) {
  w.runTo(w.time + 1800)
  const k = s.kpis(w.time)
  const urg = s.shipments.filter((x) => x.urgent)
  console.log(`+${(h + 1) * 30}m 정시${k.onTimePct.toFixed(0)}% 대기${k.yardCount} 도크${k.occupied}/${k.opDocks} FL${k.flActive}/${k.flTotal} 고장${k.flDown} heatMax=${s.heatMax.toFixed(0)} urgent=${urg.map((u) => `${u.id}:${u.status}${u.doneAt ? ' 완료' + Math.round((u.doneAt - (u.arrivedAt ?? 0)) / 60) + 'm onTime=' + u.onTime : ''}`).join(',')}`)
}
// 불변식: 예약/진행 중 수량 음수 금지, flight 일치
let bad = 0
for (const site of w.sites) {
  for (const b of site.bays) if (b.stock < 0 || b.stock > 8 || b.resIn < 0 || b.resOut < 0) bad++
  for (const sh of site.shipments) for (const l of sh.lines) if (l.flight < 0 || l.done > l.qty) bad++
  for (const sh of site.shipments) for (const [li, l] of sh.lines.entries()) {
    const real = site.forklifts.filter((f) => f.task?.shipId === sh.id && f.task.line === li).length
    if (real !== l.flight) bad++
  }
}
console.log('invariant violations', bad)
console.log(s.events.slice(0, 8).map((e) => `[${e.level}] ${e.text}`).join('\n'))
