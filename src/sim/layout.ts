// 물류 캠퍼스 기하 — 단위 m. 건물 남측 벽(z=13)에 도크, 그 앞이 야드·도로.
// 건물 크기는 섹션 수(8베이 단위)·랙 열 수·도크 수로 계산된다.
import type { Vec2 } from './path'

export const BAY_W = 2.6
export const BAYS_PER_SECTION = 8
export const LEVELS = 4
export const LEVEL_H = 1.6
export const SLOTS_PER_LEVEL = 2
export const BAY_CAP = LEVELS * SLOTS_PER_LEVEL // 8 PLT
export const ROW_DEPTH = 1.2
export const AISLE_W = 3.2
export const RACK_H = LEVELS * LEVEL_H + 0.2
export const SECTION_W = BAYS_PER_SECTION * BAY_W
export const SECTION_GAP = 4
export const SIDE = 7.2 // 벽 쪽 교차 통로 + 지게차 대기 주차 칸
export const FRONT = 18 // 마지막 랙 열 ~ 도크 벽 사이 작업 공간

export const DOCK_WALL_Z = 13
export const DOCK_LOC_Z = 11.2
export const DOCKED_Z = 13.35
export const LANE_IN = 34
export const LANE_OUT = 39.6

export interface Loc {
  x: number
  z: number
  heading: number
}

export interface RowGeo {
  idx: number
  letter: string
  z: number
  aisleZ: number
  facing: number
}

export type FacilityId = 'gate' | 'lot' | 'office' | 'shop' | 'parking'
export interface Facility {
  id: FacilityId
  name: string
  x: number
  z: number
  w: number
  d: number
  h: number
}

export interface LayoutSpec {
  rows: number
  sections: number
  docks: number
  chargers: number
}

export interface Layout {
  spec: LayoutSpec
  rows: RowGeo[]
  aisles: number[]
  rowsEndZ: number
  corridorZ: number
  dockXs: number[]
  chargers: Loc[]
  flPark: Loc[]
  wall: { x0: number; x1: number; z0: number; z1: number }
  width: number
  depth: number
  crossX: number[]
  sectionX0: number[]
  baysPerRow: number
  holding: { x0: number; laneZ: number[]; gap: number; perLane: number; eastX: number; entryX: number }
  gateX: number
  exitGateX: number
  spawnX: number
  exitX: number
  pedIn: Vec2
  pedOut: Vec2
  officeDoor: Vec2
  guardPost: Vec2
  facilities: Record<FacilityId, Facility>
  campus: { x0: number; x1: number; z0: number; z1: number }
  heat: { x0: number; z0: number; cell: number; w: number; h: number }
}

export function slotY(slot: number): number {
  return 0.12 + Math.floor(slot / SLOTS_PER_LEVEL) * LEVEL_H
}

export function slotX(slot: number): number {
  return slot % 2 === 0 ? -0.64 : 0.64
}

export function makeLayout(spec: LayoutSpec): Layout {
  const n = spec.sections
  const width = n * SECTION_W + (n - 1) * SECTION_GAP + 2 * SIDE
  const x0 = -width / 2
  const x1 = width / 2
  const sectionX0 = Array.from({ length: n }, (_, s) => x0 + SIDE + s * (SECTION_W + SECTION_GAP))
  const crossX = [x0 + 3.6, ...sectionX0.slice(0, -1).map((sx) => sx + SECTION_W + SECTION_GAP / 2), x1 - 3.6]

  const k = spec.rows / 2
  const rowsEndZ = DOCK_WALL_Z - FRONT
  const rowsStart = rowsEndZ - k * (2 * ROW_DEPTH + AISLE_W)
  const z0 = rowsStart - 1
  const rows: RowGeo[] = []
  const aisles: number[] = []
  let c = rowsStart
  const pushRow = (aisleIdx: number) => {
    rows.push({ idx: rows.length, letter: String.fromCharCode(65 + rows.length), z: c + ROW_DEPTH / 2, aisleZ: aisleIdx, facing: 0 })
    c += ROW_DEPTH
  }
  pushRow(0)
  aisles.push(c + AISLE_W / 2)
  c += AISLE_W
  for (let a = 1; a < k; a++) {
    pushRow(a - 1)
    pushRow(a)
    aisles.push(c + AISLE_W / 2)
    c += AISLE_W
  }
  pushRow(k - 1)
  for (const r of rows) {
    r.aisleZ = aisles[r.aisleZ]
    r.facing = r.z < r.aisleZ ? Math.PI : 0
  }
  const corridorZ = rowsEndZ + 2.6

  const span = width / 2 - 20 // 양 끝 8m+는 지게차 충전·주차 베이
  const dockXs = Array.from({ length: spec.docks }, (_, i) => (spec.docks === 1 ? 0 : -span + (2 * span * i) / (spec.docks - 1)))

  // 앞쪽 양 끝 베이: 벽 쪽부터 충전기, 이어서 주차 칸 (모두 북향, 열 단위로 직진 진입)
  const perSide = Math.ceil(spec.chargers / 2)
  const spotZ = DOCK_LOC_Z
  const bayEnd = span + 2.45 + 1.0 // 첫/끝 도크 작업 구역 바깥
  const cols: number[] = []
  for (let x = width / 2 - 1.3; x > bayEnd; x -= 1.95) cols.push(x)
  const chargers: Loc[] = []
  const flPark: Loc[] = []
  for (const side of [-1, 1]) {
    cols.forEach((cx, i) => {
      const loc = { x: side * cx, z: spotZ, heading: 0 }
      if (i < perSide) chargers.push(loc)
      else flPark.push(loc)
    })
  }

  const hx0 = x1 + 26
  const gap = 16.5
  const perLane = 5
  const eastX = hx0 + perLane * gap
  const entryX = eastX + 22
  const gateX = entryX + 26
  const exitGateX = x0 - 52
  const holding = { x0: hx0, laneZ: [16.6, 21.2, 25.8], gap, perLane, eastX, entryX }

  const office: Facility = { id: 'office', name: '사무동', x: x0 - 24, z: -7, w: 18, d: 13, h: 10.5 }
  const parking: Facility = { id: 'parking', name: '직원 주차장', x: x0 - 24, z: 16.5, w: 34, d: 16, h: 0 }
  const shop: Facility = { id: 'shop', name: '장비 정비동', x: x1 + 26, z: z0 + 10, w: 20, d: 15, h: 8 }
  const lot: Facility = { id: 'lot', name: '트럭 대기장', x: (hx0 - 13 + eastX) / 2, z: 21.2, w: eastX - hx0 + 13 + 6, d: 15, h: 0 }
  const gate: Facility = { id: 'gate', name: '정문 게이트', x: gateX, z: LANE_IN - 6, w: 3.2, d: 3.2, h: 3.2 }

  const campus = { x0: x0 - 58, x1: gateX + 14, z0: z0 - 16, z1: 47 }
  const depth = DOCK_WALL_Z - z0
  return {
    spec,
    rows,
    aisles,
    rowsEndZ,
    corridorZ,
    dockXs,
    chargers,
    flPark,
    wall: { x0, x1, z0, z1: DOCK_WALL_Z },
    width,
    depth,
    crossX,
    sectionX0,
    baysPerRow: n * BAYS_PER_SECTION,
    holding,
    gateX,
    exitGateX,
    spawnX: gateX + 70,
    exitX: exitGateX - 90,
    pedIn: { x: x0 + 1.2, z: corridorZ },
    pedOut: { x: x0 - 1.6, z: corridorZ },
    officeDoor: { x: office.x + office.w / 2 + 0.8, z: office.z + 2 },
    guardPost: { x: gateX - 2.6, z: LANE_IN - 6 },
    facilities: { office, parking, shop, lot, gate },
    campus,
    heat: { x0, z0, cell: 0.5, w: Math.ceil(width / 0.5), h: Math.ceil(depth / 0.5) },
  }
}

export function bayX(L: Layout, b: number): number {
  return L.sectionX0[Math.floor(b / BAYS_PER_SECTION)] + BAY_W * ((b % BAYS_PER_SECTION) + 0.5)
}

export function isInside(L: Layout, p: Vec2): boolean {
  return p.x > L.wall.x0 && p.x < L.wall.x1 && p.z > L.wall.z0 && p.z < L.wall.z1 + 0.2
}

// 지게차·사람 직교 경로: 랙 통로 ↔ 교차 통로 ↔ 메인 통로
export function route(from: Vec2, to: Vec2, L: Layout): Vec2[] {
  const inRack = (z: number) => z < L.rowsEndZ
  const C = L.corridorZ
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  let xc = L.crossX[0]
  let best = Infinity
  for (const x of L.crossX) {
    const cost = Math.abs(from.x - x) + Math.abs(to.x - x)
    if (cost < best) {
      best = cost
      xc = x
    }
  }
  const a = inRack(from.z)
  const b = inRack(to.z)
  if (!a && !b) {
    if (near(from.z, to.z) || near(from.x, to.x)) return [from, to]
    return [from, { x: from.x, z: C }, { x: to.x, z: C }, to]
  }
  if (a && b) {
    if (near(from.z, to.z)) return [from, to]
    return [from, { x: xc, z: from.z }, { x: xc, z: to.z }, to]
  }
  if (a) return [from, { x: xc, z: from.z }, { x: xc, z: C }, { x: to.x, z: C }, to]
  return [from, { x: from.x, z: C }, { x: xc, z: C }, { x: xc, z: to.z }, to]
}

// 보행 경로: 건물 안은 통로를 따라, 밖으로 나갈 때는 서측 보행자 출입구를 지난다
export function walkRoute(from: Vec2, to: Vec2, L: Layout): Vec2[] {
  const a = isInside(L, from)
  const b = isInside(L, to)
  if (a && b) return route(from, to, L)
  if (a && !b) return [...route(from, L.pedIn, L), L.pedOut, to]
  if (!a && b) return [from, L.pedOut, ...route(L.pedIn, to, L)]
  return [from, to]
}

// 우측통행: 경로 중간 구간을 진행 방향 오른쪽으로 off만큼 민다 (시작·끝 점은 그대로)
export function keepRight(points: Vec2[], off: number, opts: { straightFirst?: boolean; straightLast?: boolean } = {}): Vec2[] {
  const p: Vec2[] = []
  for (const q of points) if (!p.length || Math.hypot(q.x - p[p.length - 1].x, q.z - p[p.length - 1].z) > 1e-3) p.push(q)
  if (p.length < 2) return p
  const n = p.length
  const dir = (i: number) => {
    const dx = p[i + 1].x - p[i].x
    const dz = p[i + 1].z - p[i].z
    const l = Math.hypot(dx, dz) || 1
    return { dx: dx / l, dz: dz / l, l }
  }
  const nrm = (d: { dx: number; dz: number }) => ({ x: -d.dz * off, z: d.dx * off })
  const out: Vec2[] = [p[0]]
  const d0 = dir(0)
  if (opts.straightFirst && n > 2) {
    // 첫 구간은 오프셋 없이 똑바로 (도크 열에서 빠져나오는 구간)
    const d1 = dir(1)
    const nn = nrm(d1)
    out.push({ x: p[1].x, z: p[1].z })
    out.push({ x: p[1].x + d1.dx * Math.min(1.6, d1.l / 2) + nn.x, z: p[1].z + d1.dz * Math.min(1.6, d1.l / 2) + nn.z })
    for (let i = 2; i < n - 1; i++) {
      const a = nrm(dir(i - 1))
      const b = nrm(dir(i))
      out.push({ x: p[i].x + a.x + b.x, z: p[i].z + a.z + b.z })
    }
    const dl = dir(n - 2)
    if (!opts.straightLast && dl.l > 2.4) {
      const ln = nrm(dl)
      out.push({ x: p[n - 1].x - dl.dx * 1.1 + ln.x, z: p[n - 1].z - dl.dz * 1.1 + ln.z })
    }
    out.push(p[n - 1])
    return out
  }
  if (d0.l > 2.4) {
    const nn = nrm(d0)
    out.push({ x: p[0].x + d0.dx * 1.1 + nn.x, z: p[0].z + d0.dz * 1.1 + nn.z })
  }
  for (let i = 1; i < n - 1; i++) {
    const a = nrm(dir(i - 1))
    const b = nrm(dir(i))
    out.push({ x: p[i].x + a.x + b.x, z: p[i].z + a.z + b.z })
  }
  const dl = dir(n - 2)
  if (opts.straightLast && n > 2) {
    // 마지막 구간은 오프셋 없이 똑바로 (도크 열로 들어가는 구간)
    const dp = dir(n - 3)
    const pn = nrm(dp)
    out.pop()
    out.push({ x: p[n - 2].x - dp.dx * Math.min(1.6, dp.l / 2) + pn.x, z: p[n - 2].z - dp.dz * Math.min(1.6, dp.l / 2) + pn.z })
    out.push({ x: p[n - 2].x, z: p[n - 2].z })
  } else if (dl.l > 2.4) {
    const nn = nrm(dl)
    out.push({ x: p[n - 1].x - dl.dx * 1.1 + nn.x, z: p[n - 1].z - dl.dz * 1.1 + nn.z })
  }
  out.push(p[n - 1])
  return out
}

// 후진 접안 구역: 차선 위 진입 지점 ~ 도크 앞까지 (다른 트럭은 소유자가 들어오면 진입 금지)
export function reverseZone(dockX: number, len: number) {
  return [
    { x0: dockX - 13 - len - 1, x1: dockX + 2.2, z0: LANE_IN - 3.4, z1: LANE_IN + 2.6 },
    { x0: dockX - 9, x1: dockX + 2.2, z0: 24, z1: LANE_IN - 3.4 },
    { x0: dockX - 1.7, x1: dockX + 1.7, z0: DOCK_WALL_Z, z1: 24 },
  ]
}

// 출차 구역: 도크 앞 ~ 두 차선을 가로질러 출차 차선까지
export function departZone(dockX: number) {
  return [
    { x0: dockX - 1.7, x1: dockX + 1.7, z0: DOCK_WALL_Z, z1: 26 },
    { x0: dockX - 30, x1: dockX + 2.2, z0: 26, z1: LANE_OUT + 2.2 },
  ]
}

// 도크 앞 지게차 작업 구역 (이동 중인 지게차는 한 번에 1대만)
export const dockZoneZ0 = (L: Layout) => L.corridorZ + 5.2
export const dockApproachZ = (L: Layout) => L.corridorZ + 4.6
export function dockZoneRect(L: Layout, dockX: number) {
  return { x0: dockX - 2.45, x1: dockX + 2.45, z0: dockZoneZ0(L), z1: DOCK_WALL_Z }
}

export const holdingSlot = (L: Layout, lane: number, i: number): Vec2 => ({ x: L.holding.x0 + i * L.holding.gap, z: L.holding.laneZ[lane] })
