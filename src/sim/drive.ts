// 충돌을 피하는 차량 주행 — 경로 위 진행거리(s)와 속도(v)를 1초 스텝마다 갱신한다.
// 매 스텝 앞쪽 경로에 놓일 자기 외곽(OBB)을 미리 그려 보고, 다른 차량 외곽과 겹치면 감속·정지한다.
import type { Path, Pose, Vec2 } from './path'

export interface Seg {
  path: Path
  reverse: boolean
  vmax: number
  pause: number // 이 구간을 시작하기 전 정차 시간(초)
}

export interface Drive {
  segs: Seg[]
  i: number
  s: number
  v: number
  wait: number
  prevI: number
  prevS: number
  stuck: number
  blockedBy: string | null
  backoff: number
}

export interface Dims {
  hw: number // 반폭
  hl: number // 반길이
  off: number // 기준점 → 외곽 중심 (전방 +)
}

export interface Agent {
  id: string
  drive: Drive | null
  pose: Pose // 정지 상태일 때의 자세
  dims: Dims
  prio: number
  handlingHeading?: number | null
}

export function makeDrive(segs: Seg[]): Drive {
  return { segs, i: 0, s: 0, v: 0, wait: segs[0]?.pause ?? 0, prevI: 0, prevS: 0, stuck: 0, blockedBy: null, backoff: 0 }
}

export const driveDone = (d: Drive | null) => !d || d.i >= d.segs.length

function segPose(seg: Seg, s: number, fallback: number): Pose {
  const p = seg.path.sample(s)
  let heading = p.dx || p.dz ? Math.atan2(p.dx, p.dz) : fallback
  if (seg.reverse && (p.dx || p.dz)) heading += Math.PI
  return { x: p.x, z: p.z, heading }
}

export function driveEndPose(d: Drive, fallback: Pose): Pose {
  const last = d.segs[d.segs.length - 1]
  return last ? segPose(last, last.path.length, fallback.heading) : fallback
}

// 현재 스텝 자세 (f = 0..1 스텝 사이 보간)
export function drivePose(d: Drive | null, f: number, fallback: Pose): Pose {
  if (!d || !d.segs.length) return fallback
  if (d.i >= d.segs.length) return driveEndPose(d, fallback)
  const seg = d.segs[d.i]
  const s = d.prevI === d.i ? d.prevS + (d.s - d.prevS) * Math.max(0, Math.min(1, f)) : d.s
  return segPose(seg, s, fallback.heading)
}

function curPose(a: Agent): Pose {
  return a.drive && a.drive.i < a.drive.segs.length ? segPose(a.drive.segs[a.drive.i], a.drive.s, a.pose.heading) : a.drive ? driveEndPose(a.drive, a.pose) : a.pose
}

// ── OBB ──
export interface Box {
  cx: number
  cz: number
  fx: number
  fz: number
  hw: number
  hl: number
}

export function boxOf(p: Pose, d: Dims, pad = 0): Box {
  const fx = Math.sin(p.heading)
  const fz = Math.cos(p.heading)
  return { cx: p.x + fx * d.off, cz: p.z + fz * d.off, fx, fz, hw: d.hw + pad, hl: d.hl + pad }
}

function project(b: Box, ax: number, az: number): number {
  // 축에 대한 반지름
  return Math.abs(b.fx * ax + b.fz * az) * b.hl + Math.abs(-b.fz * ax + b.fx * az) * b.hw
}

export function overlap(a: Box, b: Box): boolean {
  const dx = b.cx - a.cx
  const dz = b.cz - a.cz
  if (dx * dx + dz * dz > (a.hl + a.hw + b.hl + b.hw) ** 2) return false
  const axes: [number, number][] = [
    [a.fx, a.fz],
    [-a.fz, a.fx],
    [b.fx, b.fz],
    [-b.fz, b.fx],
  ]
  for (const [ax, az] of axes) {
    const dist = Math.abs(dx * ax + dz * az)
    if (dist > project(a, ax, az) + project(b, ax, az)) return false
  }
  return true
}

// 경로를 진행 방향 오른쪽으로 off만큼 평행 이동 (양 끝점은 그대로) — 우측통행
export function keepRight(points: Vec2[], off: number): Vec2[] {
  if (points.length < 3) return points
  const out: Vec2[] = [points[0]]
  const norm = (a: Vec2, b: Vec2) => {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const l = Math.hypot(dx, dz) || 1
    // 진행 방향 (dx,dz)의 오른쪽: heading = atan2(dx,dz) 기준 오른쪽은 (-dz, dx)… 화면 좌표계에서 우측 = (−fz, fx)
    return { x: -dz / l, z: dx / l }
  }
  for (let i = 1; i < points.length - 1; i++) {
    const n1 = norm(points[i - 1], points[i])
    const n2 = norm(points[i], points[i + 1])
    const same = Math.abs(n1.x - n2.x) < 1e-6 && Math.abs(n1.z - n2.z) < 1e-6
    out.push({ x: points[i].x + (n1.x + (same ? 0 : n2.x)) * off, z: points[i].z + (n1.z + (same ? 0 : n2.z)) * off })
  }
  out.push(points[points.length - 1])
  return out
}

// ── 한 스텝 진행 ──
export function stepAgents(agents: Agent[], accel: number) {
  const n = agents.length
  const poses = agents.map(curPose)
  const boxes = agents.map((a, i) => boxOf(poses[i], a.dims))
  const moving: number[] = []
  for (let i = 0; i < n; i++) {
    const d = agents[i].drive
    if (!d) continue
    d.prevI = d.i
    d.prevS = d.s
    if (d.i < d.segs.length) moving.push(i)
  }
  for (const i of moving) {
    const a = agents[i]
    const d = a.drive!
    if (d.wait > 0) {
      d.wait--
      continue
    }
    const near: number[] = []
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const dx = boxes[j].cx - boxes[i].cx
      const dz = boxes[j].cz - boxes[i].cz
      if (dx * dx + dz * dz < 40 * 40) near.push(j)
    }
    // 이미 겹친 상대는 빠져나갈 수 있게 무시 (생성 직후 등 예외 상황)
    const escape = new Set(near.filter((j) => overlap(boxes[i], boxes[j])))

    // 후진 양보 중
    if (d.backoff > 0) {
      const step = Math.min(0.4, d.backoff)
      const back = probe(a, d, -step, poses[i].heading)
      const bb = back ? boxOf(back, a.dims) : null
      const clear = bb && !near.some((j) => !escape.has(j) && overlap(bb, boxes[j]))
      if (back && clear) moveBy(d, -step)
      else d.backoff = 0
      d.backoff = Math.max(0, d.backoff - step)
      d.v = 0
      continue
    }

    const look = Math.max(2.4, Math.min(12, (d.v * d.v) / (2 * accel) + 2.2))
    let free = Infinity
    let blocker: string | null = null
    for (let k = 0.6; k <= look + 1e-6 && free === Infinity; k += 0.6) {
      const p = probe(a, d, k, poses[i].heading)
      if (!p) break
      const b = boxOf(p, a.dims, 0.15)
      for (const j of near) {
        if (escape.has(j)) continue
        if (overlap(b, boxes[j])) {
          free = k - 0.6
          blocker = agents[j].id
          break
        }
      }
    }
    const seg = d.segs[d.i]
    let v = Math.min(seg.vmax, d.v + accel)
    if (free !== Infinity) v = Math.min(v, Math.sqrt(2 * accel * Math.max(0, free - 0.2)), Math.max(0, free - 0.2))
    if (v < 0.02) v = 0
    d.v = v
    if (v > 0) moveBy(d, v)
    if (v === 0 && blocker) {
      d.stuck++
      d.blockedBy = blocker
    } else {
      d.stuck = 0
      d.blockedBy = null
    }
  }
  // 교착 해소: 서로를 막고 있으면 우선순위 낮은 쪽이 물러난다
  const byId = new Map(agents.map((a) => [a.id, a]))
  for (const i of moving) {
    const a = agents[i]
    const d = a.drive!
    if (d.stuck < 25 || !d.blockedBy || d.backoff > 0) continue
    const b = byId.get(d.blockedBy)
    const bd = b?.drive
    const mutual = bd && bd.blockedBy === a.id && bd.stuck >= 25
    const lower = !b || a.prio < b.prio || (a.prio === b.prio && a.id < b.id)
    if ((mutual && lower) || d.stuck > 240) {
      d.backoff = 5
      d.stuck = 0
    }
  }
}

// 현재 위치에서 경로를 따라 k만큼 간 자세 (음수면 뒤로)
function probe(a: Agent, d: Drive, k: number, fallback: number): Pose | null {
  let i = d.i
  let s = d.s + k
  while (i < d.segs.length && s > d.segs[i].path.length) {
    const next = d.segs[i + 1]
    if (!next || next.pause > 0) return segPose(d.segs[i], d.segs[i].path.length, fallback)
    s -= d.segs[i].path.length
    i++
  }
  while (s < 0) {
    if (i === 0) return null
    i--
    s += d.segs[i].path.length
  }
  if (i >= d.segs.length) return null
  void a
  return segPose(d.segs[i], s, fallback)
}

function moveBy(d: Drive, ds: number) {
  d.s += ds
  while (d.i < d.segs.length && d.s >= d.segs[d.i].path.length - 1e-6) {
    const extra = d.s - d.segs[d.i].path.length
    d.i++
    if (d.i >= d.segs.length) {
      d.s = 0
      return
    }
    const next = d.segs[d.i]
    if (next.pause > 0) {
      d.wait = next.pause
      d.s = 0
      d.v = 0
      return
    }
    d.s = Math.max(0, extra)
  }
  while (d.s < 0 && d.i > 0) {
    d.i--
    d.s += d.segs[d.i].path.length
  }
  if (d.s < 0) d.s = 0
}
