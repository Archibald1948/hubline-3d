// 물류 캠퍼스 기하 — 단위 m. 건물 남측 벽(z=13)에 도크, 그 앞이 야드·도로.
// 건물 크기는 섹션 수(8베이 단위)·랙 열 수·도크 수로 계산된다.
import { rounded, type Vec2 } from './path'

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
export const SIDE = 5.2
export const FRONT = 18 // 마지막 랙 열 ~ 도크 벽 사이 작업 공간

export const DOCK_WALL_Z = 13
export const DOCK_LOC_Z = 11.2
// 지게차 기준점 = 차체(포크 끝 포함) 중심. 외곽 1.2 × 3.3 m
export const FL_HL = 1.65
export const FL_HW = 0.6
export const FL_DOCK_Z = DOCK_LOC_Z + 0.35
// 도크마다 작업 위치 2개 (차폭 1.2 m, 같은 도크의 두 작업선 사이 1.4 m)
export const DOCK_LANES = [-1.3, 1.3]
// 우측통행 차로 오프셋: 랙 통로(3.2 m)는 0.7, 넓은 메인·교차 통로는 1.0 (꺾을 때 차체가 반대 차로로 휘어 들어가지 않게)
export const KEEP_RIGHT = 0.7
export const KEEP_RIGHT_WIDE = 1.3
export const CORNER_R = 1.2
export const MERGE = 3
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

// 지게차가 서는 자리. entry = 주행망 위의 진입점
// 도착 arrive: 'corner' = 진입점에서 꺾어 앞으로 들어감, 'turn' = 진입점에서 제자리 회전 후 들어감
// 출발: 랙 칸 = 진입점으로 물러나 회전, 도크 = 회전 포켓까지 후진해 회전, 대기 칸 = 칸 안에서 회전, 충전기 = 진입로로 후진해 회전
export type SpotKind = 'bay' | 'dock' | 'park' | 'charger'
export interface Spot {
  kind: SpotKind
  x: number
  z: number
  heading: number
  entry: Vec2
  arrive: 'corner' | 'turn'
  pocket?: Vec2
}

// 교차로: 양방향 도로끼리 만나는 곳. 지나가는 모든 지게차는 상자 밖에서 멈췄다가 궤적·출구를 확보하고 들어간다
export interface Junction {
  x: number
  z: number
  hx: number
  hz: number
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
  chargerSpots: Spot[]
  parkSpots: Spot[]
  junctions: Junction[]
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
  const crossX = [x0 + SIDE / 2, ...sectionX0.slice(0, -1).map((sx) => sx + SECTION_W + SECTION_GAP / 2), x1 - SIDE / 2]

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
  // 메인 통로: 랙 앞에 지게차 대기 칸(3.3 m)을 두고 그 앞으로 양방향 2차로
  const corridorZ = DOCK_WALL_Z - 10

  // 측면에 충전기 + 진입로를 두기 위해 양 끝 도크를 안쪽으로
  const span = width / 2 - 7.8
  const dockXs = Array.from({ length: spec.docks }, (_, i) => (spec.docks === 1 ? 0 : -span + (2 * span * i) / (spec.docks - 1)))

  // 랙 앞 띠(랙 면 ~ 메인 통로 사이)의 정차 칸: 랙을 보고 앞으로 들어가고, 나올 때는 후진하며 차로 쪽으로 꺾어 나온다
  // (제자리 회전이 없어 이웃 칸과 겹치지 않는다). 양 끝 칸은 충전 칸, 나머지는 대기 칸
  const strip: Spot[] = []
  const parkZ = rowsEndZ + 1.75
  const PITCH = 2.5
  for (let i = 0; i + 1 < crossX.length; i++) {
    const a = crossX[i] + 3
    const b = crossX[i + 1] - 3
    const n = Math.floor((b - a) / PITCH) + 1
    const pad = (b - a - (n - 1) * PITCH) / 2
    for (let k = 0; k < n; k++) {
      const x = a + pad + k * PITCH
      strip.push({ kind: 'park', x, z: parkZ, heading: Math.PI, entry: { x, z: corridorZ }, arrive: 'corner' })
    }
  }
  const perSide = Math.ceil(spec.chargers / 2)
  const chargerSpots: Spot[] = []
  for (let i = 0; i < spec.chargers; i++) {
    const west = i < perSide
    const j = west ? i : i - perSide
    const sp = strip[west ? j : strip.length - 1 - j]
    sp.kind = 'charger'
    chargerSpots.push(sp)
  }
  const parkSpots = strip.filter((sp) => sp.kind === 'park')
  const chargers: Loc[] = chargerSpots.map((sp) => ({ x: sp.x, z: sp.z, heading: sp.heading }))

  const hx0 = x1 + 26
  const gap = 14.5
  const perLane = 5
  const eastX = hx0 + (perLane - 1) * gap
  const entryX = eastX + 22
  const gateX = entryX + 26
  const exitGateX = x0 - 52
  const holding = { x0: hx0, laneZ: [16.6, 21.2, 25.8], gap, perLane, eastX, entryX }

  const office: Facility = { id: 'office', name: '사무동', x: x0 - 24, z: -7, w: 18, d: 13, h: 10.5 }
  const parking: Facility = { id: 'parking', name: '직원 주차장', x: x0 - 24, z: 16.5, w: 34, d: 16, h: 0 }
  const shop: Facility = { id: 'shop', name: '장비 정비동', x: x1 + 26, z: z0 + 10, w: 20, d: 15, h: 8 }
  const lot: Facility = { id: 'lot', name: '트럭 대기장', x: (hx0 - 13 + eastX) / 2, z: 21.2, w: eastX - hx0 + 13 + 6, d: 15, h: 0 }
  const gate: Facility = { id: 'gate', name: '정문 게이트', x: gateX, z: LANE_IN - 6, w: 3.2, d: 3.2, h: 3.2 }

  const junctions: Junction[] = []
  // 상자 = 반폭 + 꺾을 때 차체 앞뒤가 바깥으로 휘는 폭 (모든 통로가 한 차로)
  const cross = FL_HW + 2
  for (const x of crossX) {
    junctions.push({ x, z: corridorZ, hx: cross, hz: cross })
    for (const z of aisles) junctions.push({ x, z, hx: cross, hz: AISLE_W / 2 })
  }

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
    chargerSpots,
    parkSpots,
    junctions,
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

// 지게차 통로 방향: 랙 통로는 맨 뒤가 서행이고 번갈아, 교차 통로는 맨 서쪽 북행·맨 동쪽 남행이고 사이는 번갈아
export function aisleDir(L: Layout, z: number): number {
  const i = L.aisles.findIndex((a) => Math.abs(a - z) < 0.01)
  return i % 2 === 0 ? -1 : 1
}
export function crossDir(L: Layout, c: number): 'N' | 'S' {
  const n = L.crossX.length
  if (c === 0) return 'N'
  if (c === n - 1) return 'S'
  return c % 2 === 1 ? 'S' : 'N'
}

export function flRoute(from: Vec2, to: Vec2, L: Layout): Vec2[] {
  const inRack = (p: Vec2) => p.z < L.rowsEndZ
  const C = L.corridorZ
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  // 랙 통로 위 점에서 빠져나가는 교차 통로(진행 방향 앞) / 들어오는 교차 통로(진행 방향 뒤)
  const exitX = (p: Vec2) => {
    const d = aisleDir(L, p.z)
    const xs = L.crossX.filter((x) => (d > 0 ? x > p.x : x < p.x))
    return d > 0 ? Math.min(...xs) : Math.max(...xs)
  }
  const entryX = (p: Vec2) => {
    const d = aisleDir(L, p.z)
    const xs = L.crossX.filter((x) => (d > 0 ? x < p.x : x > p.x))
    return d > 0 ? Math.max(...xs) : Math.min(...xs)
  }
  const a = inRack(from)
  const b = inRack(to)
  if (!a && !b) {
    // 바로 맞은편(도크선 ↔ 대기 칸 등)은 메인 통로를 곧게 가로지른다 (차로를 타면 급한 S자가 되어 차체가 크게 휩쓴다)
    if (near(from.z, to.z) || Math.abs(from.x - to.x) < 4) return [from, to]
    return [from, { x: from.x, z: C }, { x: to.x, z: C }, to]
  }
  if (a && b) {
    if (near(from.z, to.z) && aisleDir(L, from.z) * (to.x - from.x) > 0) return [from, to]
    const xe = exitX(from)
    const xi = entryX(to)
    if (near(xe, xi)) return [from, { x: xe, z: from.z }, { x: xe, z: to.z }, to]
    return [from, { x: xe, z: from.z }, { x: xe, z: C }, { x: xi, z: C }, { x: xi, z: to.z }, to]
  }
  if (a) {
    const xe = exitX(from)
    return [from, { x: xe, z: from.z }, { x: xe, z: C }, { x: to.x, z: C }, to]
  }
  const xi = entryX(to)
  return [from, { x: from.x, z: C }, { x: xi, z: C }, { x: xi, z: to.z }, to]
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

export const holdingSlot = (L: Layout, lane: number, i: number): Vec2 => ({ x: L.holding.x0 + i * L.holding.gap, z: L.holding.laneZ[lane] })

// ───────── 지게차 자리·주행망 ─────────
export function baySpot(bayX: number, row: RowGeo): Spot {
  return { kind: 'bay', x: bayX, z: row.aisleZ + 0.3 * Math.cos(row.facing), heading: row.facing, entry: { x: bayX, z: row.aisleZ }, arrive: 'turn' }
}

export function dockSpot(L: Layout, dockX: number, lane: number): Spot {
  const x = dockX + lane
  // pocket: 도크에서 후진해 나와 제자리 회전하는 자리. 회전 반경이 메인 통로 동행 차로와 이웃 도크 작업 위치(z 9.9~)에 닿지 않는 높이
  const pz = L.corridorZ + KEEP_RIGHT_WIDE + FL_HW + 0.25 + Math.hypot(FL_HL, FL_HW) + 0.1
  return { kind: 'dock', x, z: FL_DOCK_Z, heading: 0, entry: { x, z: L.corridorZ }, arrive: 'corner', pocket: { x, z: pz } }
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

function segOffset(a: Vec2, b: Vec2, L: Layout): number {
  if (near(a.z, b.z) && near(a.z, L.corridorZ)) return KEEP_RIGHT_WIDE
  if (near(a.z, b.z) && L.aisles.some((z) => near(a.z, z))) return 0
  if (near(a.x, b.x) && L.crossX.some((x) => near(a.x, x)) && Math.min(a.z, b.z) < L.rowsEndZ) return KEEP_RIGHT_WIDE
  return 0
}

// 직교 경로를 진행 방향 오른쪽 차로로 옮기고(우측통행) 모서리를 둥글린다. 양 끝점은 그대로
// 꺾이는 모서리: p = 차로 위 모서리, stop = p에서 들어오는 방향으로 이만큼 앞에서 멈추면 차체가 진입 도로 띠 밖에 있다
export interface Corner {
  p: Vec2
  stop: number
}

export function lanePath(raw: Vec2[], L: Layout): { pts: Vec2[]; corners: Corner[] } {
  // 아주 짧은 선분(교차 통로와 도크 작업선이 거의 겹칠 때 등)은 합친다
  const p: Vec2[] = []
  for (const q of raw) {
    const last = p[p.length - 1]
    if (!last || Math.hypot(last.x - q.x, last.z - q.z) > 0.5) p.push({ x: q.x, z: q.z })
    else if (p.length > 1) p[p.length - 1] = { x: q.x, z: q.z }
  }
  const end = raw[raw.length - 1]
  if (p.length > 1) p[p.length - 1] = { x: end.x, z: end.z }
  // 한 직선 위의 중간점 제거
  for (let i = p.length - 2; i >= 1; i--) {
    const a = p[i - 1]
    const b = p[i]
    const c = p[i + 1]
    if (Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) < 1e-6 && (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z) > 0) {
      if (segOffset(a, b, L) === segOffset(b, c, L)) p.splice(i, 1)
    }
  }
  if (p.length < 2) return { pts: p, corners: [] }
  const segs = p.slice(0, -1).map((a, i) => {
    const b = p[i + 1]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const d = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
    return { d, r: { x: -d.z, z: d.x }, len, o: segOffset(a, b, L) }
  })
  const out: Vec2[] = [p[0]]
  const corners: Corner[] = []
  const s0 = segs[0]
  if (s0.o) {
    const k = Math.min(MERGE, s0.len / 2)
    out.push({ x: p[0].x + s0.d.x * k + s0.r.x * s0.o, z: p[0].z + s0.d.z * k + s0.r.z * s0.o })
  }
  for (let i = 1; i < p.length - 1; i++) {
    const a = segs[i - 1]
    const b = segs[i]
    const cross = a.d.x * b.d.z - a.d.z * b.d.x
    if (Math.abs(cross) > 0.5) {
      const c = { x: p[i].x + a.r.x * a.o + b.r.x * b.o, z: p[i].z + a.r.z * a.o + b.r.z * b.o }
      out.push(c)
      // 진입 도로 띠 반폭 W (양방향 도로 = 차로 오프셋 + 차폭/2, 외길 = 차폭/2), u = 모서리가 도로 중심에서 들어오는 방향으로 떨어진 거리
      const w = b.o + FL_HW + 0.1
      const u = (c.x - p[i].x) * a.d.x + (c.z - p[i].z) * a.d.z
      corners.push({ p: c, stop: u + w + FL_HL + 2 })
    } else {
      out.push({ x: p[i].x + a.r.x * a.o, z: p[i].z + a.r.z * a.o })
      if (a.o !== b.o) out.push({ x: p[i].x + b.d.x * 1.2 + b.r.x * b.o, z: p[i].z + b.d.z * 1.2 + b.r.z * b.o })
    }
  }
  const sl = segs[segs.length - 1]
  if (sl.o) {
    const k = Math.min(MERGE, sl.len / 2)
    out.push({ x: end.x - sl.d.x * k + sl.r.x * sl.o, z: end.z - sl.d.z * k + sl.r.z * sl.o })
  }
  out.push(end)
  return { pts: rounded(out, CORNER_R), corners }
}
