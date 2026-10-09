// 창고 기하 — 단위는 미터. 건물 남쪽 벽(z=13)에 도크, 그 앞이 야드
import type { Vec2 } from './path'

export const BAY_W = 2.6
export const BAYS_PER_HALF = 8
export const BAYS_PER_ROW = BAYS_PER_HALF * 2
export const LEVELS = 4
export const LEVEL_H = 1.6
export const SLOTS_PER_LEVEL = 2
export const BAY_CAP = LEVELS * SLOTS_PER_LEVEL // 8 PLT
export const ROW_DEPTH = 1.2
export const AISLE_W = 3.2
export const RACK_H = LEVELS * LEVEL_H + 0.2

export const WALL = { x0: -28, x1: 28, z0: -22.6, z1: 13 }
export const CROSS_X = [-25.5, 0, 25.5]
export const DOCK_LOC_Z = 11.2 // 도크 안쪽 지게차 작업 위치
export const DOCKED_Z = 13.35 // 접안 시 트레일러 후면
export const LANE_IN = 32 // 진입 차선 (서행, 서쪽 방향)
export const LANE_OUT = 37.6 // 출차 차선
export const SPAWN_X = 150
export const EXIT_X = -160
export const QUEUE_X0 = 44
export const QUEUE_GAP = 14.5

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
  facing: number // 통로에 선 지게차가 이 랙을 바라보는 heading
}

export interface Layout {
  rows: RowGeo[]
  aisles: number[]
  rowsEndZ: number
  corridorZ: number
  dockXs: number[]
  chargers: Loc[]
}

export function bayX(b: number): number {
  const half = b < BAYS_PER_HALF ? 0 : 1
  const i = b % BAYS_PER_HALF
  return half === 0 ? -22.8 + BAY_W * (i + 0.5) : 2 + BAY_W * (i + 0.5)
}

export function slotY(slot: number): number {
  return 0.12 + Math.floor(slot / SLOTS_PER_LEVEL) * LEVEL_H
}

export function slotX(slot: number): number {
  return slot % 2 === 0 ? -0.64 : 0.64
}

export function makeLayout(rowCount: number, dockCount: number): Layout {
  const k = rowCount / 2
  const rows: RowGeo[] = []
  const aisles: number[] = []
  let c = -21.6
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
  const rowsEndZ = c
  const corridorZ = rowsEndZ + 2.6
  const dockXs: number[] = []
  const span = dockCount > 7 ? 20 : 15
  for (let i = 0; i < dockCount; i++) dockXs.push(dockCount === 1 ? 0 : -span + (2 * span * i) / (dockCount - 1))
  const chargers: Loc[] = [0, 1, 2].map((i) => ({ x: -25.8, z: corridorZ + 3.2 + i * 2.2, heading: -Math.PI / 2 }))
  return { rows, aisles, rowsEndZ, corridorZ, dockXs, chargers }
}

// 지게차 직교 경로: 랙 통로 ↔ 교차 통로 ↔ 메인 통로
export function route(from: Vec2, to: Vec2, L: Layout): Vec2[] {
  const inRack = (z: number) => z < L.rowsEndZ
  const C = L.corridorZ
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  let xc = CROSS_X[0]
  let best = Infinity
  for (const x of CROSS_X) {
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

export const queueSlot = (i: number): Vec2 => ({ x: QUEUE_X0 + i * QUEUE_GAP, z: LANE_IN })
