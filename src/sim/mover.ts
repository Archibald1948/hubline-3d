// 물리 기반 이동: 경로를 따라 매 스텝 전진하되, 앞에 다른 차체(회전 사각형)나
// 남이 점유한 구역이 있으면 멈춘다. 렌더는 직전 스텝과 현재 스텝 자세를 보간한다.
import type { Path, Pose } from './path'

export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface Leg {
  path: Path
  vmax: number
  reverse: boolean
  // 이 구간을 시작하려면 해당 구역을 확보해야 한다
  zone: string | null
  // 구역 소유자의 기동(후진 접안 등): 구간 동안 다른 차체를 무시 — 구역이 비어 있음이 보장될 때만 사용
  ghost?: boolean
}

export interface Mover {
  id: string
  legs: Leg[]
  s: number
  v: number
  pose: Pose
  prev: Pose
  len: number // 차체 길이
  width: number
  ref: number // 기준점 → 차체 중심 (전방 +)
  look: number // 전방 감지 거리
  accel: number
  blocker: string | null
  waitFrom: number | null
}

export interface OBB {
  id: string
  cx: number
  cz: number
  ux: number
  uz: number
  hl: number
  hw: number
}

export function makeMover(id: string, pose: Pose, len: number, width: number, ref: number, look: number, accel: number): Mover {
  return { id, legs: [], s: 0, v: 0, pose: { ...pose }, prev: { ...pose }, len, width, ref, look, accel, blocker: null, waitFrom: null }
}

export function obbAt(m: Mover, p: Pose, extra = 0): OBB {
  const ux = Math.sin(p.heading)
  const uz = Math.cos(p.heading)
  return { id: m.id, cx: p.x + ux * m.ref, cz: p.z + uz * m.ref, ux, uz, hl: m.len / 2 + extra, hw: m.width / 2 }
}

function project(o: OBB, ax: number, az: number): [number, number] {
  const c = o.cx * ax + o.cz * az
  const r = Math.abs(o.ux * ax + o.uz * az) * o.hl + Math.abs(-o.uz * ax + o.ux * az) * o.hw
  return [c - r, c + r]
}

export function obbOverlap(a: OBB, b: OBB): boolean {
  const axes: [number, number][] = [
    [a.ux, a.uz],
    [-a.uz, a.ux],
    [b.ux, b.uz],
    [-b.uz, b.ux],
  ]
  for (const [ax, az] of axes) {
    const [a0, a1] = project(a, ax, az)
    const [b0, b1] = project(b, ax, az)
    if (a1 <= b0 || b1 <= a0) return false
  }
  return true
}

export function obbRect(a: OBB, r: Rect): boolean {
  const b: OBB = { id: '', cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, ux: 0, uz: 1, hl: (r.z1 - r.z0) / 2, hw: (r.x1 - r.x0) / 2 }
  return obbOverlap(a, b)
}

export function legPose(leg: Leg, s: number, fallback: number): Pose {
  const p = leg.path.sample(s)
  let heading = p.dx || p.dz ? Math.atan2(p.dx, p.dz) : fallback
  if (leg.reverse && (p.dx || p.dz)) heading += Math.PI
  return { x: p.x, z: p.z, heading }
}

export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  let d = (b.heading - a.heading) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, heading: a.heading + d * u }
}

export interface StepEnv {
  t: number
  obbs: Map<string, OBB> // 같은 그룹 차체들의 현재 위치 (움직이면 즉시 갱신)
  zones: { owner: string; rects: Rect[]; active: boolean }[]
  canStartZone: (m: Mover, zone: string) => boolean
  movers: Map<string, Mover>
  // 교차로 박스 진입 통제: 막히면 막은 대상 id, 통과 가능하면 null
  gate?: (m: Mover, leg: Leg, ds: number, fut: OBB, cur: OBB) => string | null
}

// 한 스텝 전진. 반환값: 이번 스텝에 끝난 구간 수
export function stepMover(m: Mover, env: StepEnv): number {
  if (!m.legs.length) {
    m.v = 0
    return 0
  }
  const leg = m.legs[0]
  if (leg.zone && m.s === 0 && !env.canStartZone(m, leg.zone)) {
    m.v = 0
    return 0
  }
  const remaining = leg.path.length - m.s
  let ds = Math.min(leg.vmax, m.v + m.accel, remaining)
  ds = Math.min(ds, Math.max(0.06, remaining * 0.45), remaining)
  if (!leg.ghost && ds > 0) {
    const ahead = legPose(leg, Math.min(leg.path.length, m.s + ds + m.look), m.pose.heading)
    const tip = leg.path.sample(Math.min(leg.path.length, m.s + ds))
    const dirX = tip.dx
    const dirZ = tip.dz
    const dn = Math.hypot(dirX, dirZ) || 1
    const fut = obbAt(m, ahead)
    const cur = obbAt(m, m.pose)
    let blocker: string | null = null
    for (const o of env.obbs.values()) {
      if (o.id === m.id) continue
      const ddx = o.cx - cur.cx
      const ddz = o.cz - cur.cz
      if ((ddx * dirX + ddz * dirZ) / dn <= 0) continue // 뒤쪽 차량은 무시
      if (Math.abs(ddx) > 40 || Math.abs(ddz) > 40) continue
      if (obbOverlap(fut, o)) {
        // 서로가 서로를 막는 경우: id가 작은 쪽은 실제 차체가 닿지 않는 만큼은 기어간다
        const other = env.movers.get(o.id)
        if (other && other.blocker === m.id && m.id < o.id) {
          const exact = obbAt(m, legPose(leg, Math.min(leg.path.length, m.s + ds), m.pose.heading), 0.05)
          if (!obbOverlap(exact, o)) continue
        }
        blocker = o.id
        break
      }
    }
    if (!blocker && env.gate) blocker = env.gate(m, leg, ds, fut, cur)
    if (!blocker) {
      for (const z of env.zones) {
        if (!z.active || z.owner === m.id) continue
        if (z.rects.some((r) => obbRect(fut, r)) && !z.rects.some((r) => obbRect(cur, r))) {
          blocker = `zone:${z.owner}`
          break
        }
      }
    }
    if (blocker) {
      if (m.blocker !== blocker || m.waitFrom == null) m.waitFrom = env.t
      m.blocker = blocker
      m.v = 0
      return 0
    }
  }
  m.blocker = null
  m.waitFrom = null
  m.s += ds
  m.v = ds
  m.pose = legPose(leg, m.s, m.pose.heading)
  env.obbs.set(m.id, obbAt(m, m.pose))
  if (m.s >= leg.path.length - 1e-4) {
    m.legs.shift()
    m.s = 0
    m.v = m.legs.length ? m.v : 0
    return 1
  }
  return 0
}
