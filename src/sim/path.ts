// 경로(폴리라인/캐트멀롬)와 시간 기반 모션 샘플링
export interface Vec2 {
  x: number
  z: number
}
export interface Pose {
  x: number
  z: number
  heading: number // rotation.y — 전방 = (sin h, cos h)
}
export type Ease = 'linear' | 'inout'

function dedupe(points: Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 1e-3) out.push({ x: p.x, z: p.z })
  }
  return out
}

function catmull(points: Vec2[], seg: number): Vec2[] {
  const p = dedupe(points)
  if (p.length < 3) return p
  const out: Vec2[] = []
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p[i + 1]
    for (let s = 0; s < seg; s++) {
      const t = s / seg
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) })
    }
  }
  out.push(p[p.length - 1])
  return dedupe(out)
}

// 폴리라인의 꺾이는 지점을 반경 r 안에서 2차 베지어로 둥글게 만든다 (트럭 주행용)
export function rounded(points: Vec2[], r: number): Vec2[] {
  const p = dedupe(points)
  if (p.length < 3) return p
  const out: Vec2[] = [p[0]]
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]
    const b = p[i]
    const c = p[i + 1]
    const l1 = Math.hypot(b.x - a.x, b.z - a.z)
    const l2 = Math.hypot(c.x - b.x, c.z - b.z)
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const p1 = { x: b.x + ((a.x - b.x) / l1) * rr, z: b.z + ((a.z - b.z) / l1) * rr }
    const p2 = { x: b.x + ((c.x - b.x) / l2) * rr, z: b.z + ((c.z - b.z) / l2) * rr }
    out.push(p1)
    for (let s = 1; s < 10; s++) {
      const t = s / 10
      const u = 1 - t
      out.push({ x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x, z: u * u * p1.z + 2 * u * t * b.z + t * t * p2.z })
    }
    out.push(p2)
  }
  out.push(p[p.length - 1])
  return dedupe(out)
}

export class Path {
  readonly pts: Vec2[]
  readonly cum: number[]
  readonly length: number
  constructor(points: Vec2[], smooth = false) {
    const pts = smooth ? catmull(points, 12) : dedupe(points)
    this.pts = pts.length ? pts : [{ x: 0, z: 0 }]
    const cum = [0]
    for (let i = 1; i < this.pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z))
    }
    this.cum = cum
    this.length = cum[cum.length - 1]
  }
  static join(a: Path, tail: Vec2[]): Path {
    return new Path([...a.pts, ...tail])
  }
  sample(d: number): { x: number; z: number; dx: number; dz: number } {
    const { pts, cum } = this
    if (pts.length === 1) return { x: pts[0].x, z: pts[0].z, dx: 0, dz: 0 }
    const dd = Math.max(0, Math.min(this.length, d))
    let i = 1
    while (i < cum.length - 1 && cum[i] < dd) i++
    const seg = cum[i] - cum[i - 1] || 1e-6
    const u = (dd - cum[i - 1]) / seg
    const a = pts[i - 1]
    const b = pts[i]
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, dx: b.x - a.x, dz: b.z - a.z }
  }
}

export interface Motion {
  path: Path
  t0: number
  dur: number
  reverse: boolean
  ease: Ease
}

export function motion(path: Path, t0: number, speed: number, reverse = false, ease: Ease = 'inout'): Motion {
  const base = path.length / speed
  return { path, t0, dur: Math.max(1, ease === 'inout' ? base * 1.3 + 2 : base), reverse, ease }
}

export const motionEnd = (m: Motion) => m.t0 + m.dur

const smooth = (u: number) => u * u * (3 - 2 * u)

export function poseOn(m: Motion, t: number, fallbackHeading: number): Pose {
  const u = Math.max(0, Math.min(1, (t - m.t0) / m.dur))
  const e = m.ease === 'inout' ? smooth(u) : u
  const s = m.path.sample(e * m.path.length)
  let heading = s.dx || s.dz ? Math.atan2(s.dx, s.dz) : fallbackHeading
  if (m.reverse && (s.dx || s.dz)) heading += Math.PI
  return { x: s.x, z: s.z, heading }
}

export function posePlan(plan: Motion[], t: number, fallback: Pose): Pose {
  if (!plan.length) return fallback
  let m = plan[0]
  for (const p of plan) if (t >= p.t0) m = p
  return poseOn(m, t, fallback.heading)
}
