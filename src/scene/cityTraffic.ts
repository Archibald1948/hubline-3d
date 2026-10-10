// 도시 일반 차량 주행: 차로마다 앞차 간격을 지키고 교차로 신호에 선다. 그리기와 분리된 순수 계산
import { Rng } from '../sim/rng'
import { MAIN_Z0, MAIN_Z1, type CityPlan, type Road } from './cityPlan'

// 교차로 신호: 남북 녹색 → 전방향 적색 → 동서 녹색 → 전방향 적색 (교차로마다 위상만 다름)
const CYCLE = 28
const GREEN = 11
const CLEAR = 3
function green(axis: 'x' | 'z', t: number, off: number) {
  const ph = (((t + off) % CYCLE) + CYCLE) % CYCLE
  return axis === 'z' ? ph < GREEN : ph >= GREEN + CLEAR && ph < 2 * GREEN + CLEAR
}
const CAR_GAP = 6.8 // 앞차 중심까지 최소 거리 (차 길이 4.3 + 여유)
const ACCEL = 3
const BRAKE = 5

export interface Lane {
  axis: 'x' | 'z'
  len: number
  ids: number[] // 차로 위 차량, 진행 방향 앞쪽이 뒤로 오도록 정렬
  stops: { s: number; end: number; off: number }[] // 정지선·교차로를 빠져나간 위치(차 중심 기준)와 교차로 위상
}
export interface Mover {
  lane: number
  s: number
  v: number
  vmax: number
}

export function lanesOf(plan: CityPlan): Lane[] {
  const crossings = (rd: Road) => {
    const out = plan.roads.filter((o) => o.axis !== rd.axis).map((o) => ({ t: o.at, hw: o.w / 2 }))
    if (rd.axis === 'z') out.push({ t: (MAIN_Z0 + MAIN_Z1) / 2, hw: (MAIN_Z1 - MAIN_Z0) / 2 })
    return out
  }
  return plan.lanes.map((ln, i) => {
    const rd = plan.roads[i >> 1] // 도로마다 차로 2개씩 순서대로
    const dir = ln.dx + ln.dz
    const stops = crossings(rd).map((c) => {
      const ix = rd.axis === 'z' ? rd.at : c.t
      const iz = rd.axis === 'z' ? c.t : rd.at
      const off = (Math.abs(Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453) % 1) * CYCLE
      // 횡단보도 앞에서 차 앞머리가 멈추도록
      const s = (dir > 0 ? c.t - rd.from : rd.to - c.t) - c.hw - 5.8
      return { s, end: s + 2 * c.hw + 11.6, off }
    })
    stops.sort((a, b) => a.s - b.s)
    return { axis: rd.axis, len: ln.len, ids: [], stops }
  })
}

// 한 걸음: 차로마다 앞차 간격과 신호를 지키며 전진 (같은 차로 추월 없음)
export function stepCars(lanes: Lane[], movers: Mover[], t: number, step: number) {
  for (const lane of lanes) {
    const ids = lane.ids
    // 앞차부터 움직인다 (뒤차는 이번 프레임의 앞차 위치를 본다)
    for (let k = ids.length - 1; k >= 0; k--) {
      const mv = movers[ids[k]]
      let free = Infinity
      if (ids.length > 1) {
        const lead = movers[ids[(k + 1) % ids.length]]
        free = (((lead.s - mv.s) % lane.len) + lane.len) % lane.len - CAR_GAP
      }
      // 다음 정지선: 적색이거나 교차로 건너편에 설 자리가 없으면 선다.
      // 제동 거리 안에 서지 못하면(황색 딜레마) 그냥 지나간다
      const stop = lane.stops.find((st) => st.s >= mv.s - 0.05)
      if (stop && (!green(lane.axis, t, stop.off) || mv.s + free < stop.end)) {
        const dist = stop.s - mv.s
        // 한 걸음 이동분을 빼야 정지선에 맞춰 감속 중인 차가 딜레마로 잘못 빠지지 않는다
        if (dist >= (mv.v * mv.v) / (2 * BRAKE) - mv.v * step - 0.5) free = Math.min(free, dist)
      }
      const target = Math.min(mv.vmax, Math.sqrt(2 * BRAKE * Math.max(0, free)))
      mv.v = mv.v < target ? Math.min(target, mv.v + ACCEL * step) : target
      mv.s += Math.min(mv.v * step, Math.max(0, free))
    }
    // 도시 끝을 지난 맨 앞차는 반대편 끝으로 다시 들어온다: 정렬 순서도 한 칸 돌린다
    while (movers[ids[ids.length - 1]].s >= lane.len) {
      movers[ids[ids.length - 1]].s -= lane.len
      ids.unshift(ids.pop()!)
    }
  }
}

// 차로 길이 85m마다 한 대. 교차로 안에서 시작하지 않도록 정지선 앞으로 당긴다
export function spawnCars(plan: CityPlan, lanes: Lane[], seed: number): Mover[] {
  const r = new Rng(seed)
  const movers: Mover[] = []
  plan.lanes.forEach((ln, i) => {
    const n = Math.max(1, Math.floor(ln.len / 85))
    for (let k = 0; k < n; k++) {
      let s = (k / n) * ln.len + r.range(0, 30)
      const box = lanes[i].stops.find((st) => s > st.s && s < st.end)
      if (box) s = box.s
      lanes[i].ids.push(movers.length)
      movers.push({ lane: i, s, v: 0, vmax: r.range(7, 11) })
    }
  })
  return movers
}
