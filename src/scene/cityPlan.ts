// 캠퍼스 바깥 도시 계획 — 격자 도로, 구역(물류·상업·주거·공원·주차), 필지와 건물을 시드 고정으로 만든다
// 순수 데이터만 만들고 그리기는 City.tsx / Surroundings.tsx가 맡는다
import type { Site } from '../sim/engine'
import { Rng } from '../sim/rng'

export interface Road {
  axis: 'x' | 'z' // x: 동서로 뻗음(z 고정), z: 남북으로 뻗음(x 고정)
  at: number // 고정 좌표 (도로 중심)
  from: number
  to: number
  w: number // 차도 폭
  major: boolean // 대로 (노란 중앙선)
}

export type Facade = 'punch' | 'ribbon' | 'plain'
export interface Bldg {
  x: number
  z: number
  w: number // x 방향 길이 (회전 전)
  d: number // z 방향 길이
  h: number
  rot: number
  facade: Facade
  color: string
  roof: string
  accent?: string // 아파트 상단 띠·측벽 색
  shop?: string // 1층 상가 차양 색
  docks?: boolean // 물류창고 하역문
}

export type Zone = 'industrial' | 'commercial' | 'residential' | 'park' | 'parking'
export interface Block {
  x0: number
  x1: number
  z0: number
  z1: number
  zone: Zone
  near: boolean // 캠퍼스와 맞닿은 블록 (낮게)
}

// 블록 안 포장면: 골목(alley), 단지 안 길(path), 창고 앞마당(apron)
export interface Paving {
  x0: number
  x1: number
  z0: number
  z1: number
  kind: 'alley' | 'path' | 'apron'
}

export interface CityPlan {
  roads: Road[]
  blocks: Block[]
  paving: Paving[]
  bldgs: Bldg[]
  trees: { x: number; z: number; s: number; cone: boolean }[]
  parked: { x: number; z: number; rot: number; color: string }[]
  // 주행 차로: 시작점에서 방향으로 len 만큼
  lanes: { x: number; z: number; dx: number; dz: number; len: number }[]
  lights: { x: number; z: number; rot: number }[] // 가로등 (rot = 팔 방향)
  signals: { x: number; z: number }[] // 교차로 신호등
  bounds: { x0: number; x1: number; z0: number; z1: number }
}

const SIDEWALK = 2.6
const MAIN_Z0 = 30.4
const MAIN_Z1 = 43.2

const APT_COLORS = ['#F4F2EC', '#EEF0F2', '#F3EEE4', '#E9EDF1', '#F6F4EF']
const APT_ACCENTS = ['#2F62E8', '#2B9A64', '#1499AE', '#6F4BC9', '#E08A2E', '#46536B']
// 유리 띠 텍스처에 곱해지는 색이라 밝게 둔다 (진하면 멀리서 무거운 파랑 덩어리가 된다)
const OFFICE_COLORS = ['#E3E9EF', '#DCE6E3', '#E6E8EC', '#D6E0EA', '#ECEFF2', '#DFE4DC']
const MIXED_COLORS = ['#E9E2D6', '#DCD6CC', '#E6E8EA', '#D9CFC2', '#EDE6DA', '#CFD6DC']
const AWNINGS = ['#1499AE', '#2B9A64', '#2F62E8', '#E7D7A8', '#6F4BC9', '#F2F2EE', '#46536B']
const WAREHOUSE = ['#E4E7EB', '#D7DCE2', '#E9E6DF', '#CED6DE']
const WAREHOUSE_ROOF = ['#7F8C9C', '#8E9AA6', '#6D8B7B', '#7C8796', '#A0A8B2']
const ROOF = ['#7C8590', '#8B939C', '#6E7781', '#9AA2AB']
export const CITY_CARS = ['#F4F5F7', '#24272C', '#B8BEC6', '#2F62E8', '#7C8590', '#F4F5F7', '#2B9A64', '#46536B', '#24272C', '#D8DCE1']

const cache = new Map<string, CityPlan>()

export function cityPlan(site: Site): CityPlan {
  const hit = cache.get(site.cfg.id)
  if (hit) return hit
  const plan = build(site)
  cache.set(site.cfg.id, plan)
  return plan
}

function build(site: Site): CityPlan {
  const Lg = site.layout
  const C = Lg.campus
  const r = new Rng(site.cfg.seed * 31 + 7)
  const X0 = C.x0 - 300
  const X1 = C.x1 + 300
  const Z0 = C.z0 - 290
  const Z1 = MAIN_Z1 + 270

  // ── 도로: 캠퍼스를 감싸는 대로에서 바깥으로 블록 폭을 조금씩 달리해 반복 ──
  const avenues: number[] = []
  for (let x = C.x0 - 14; x > X0 + 20; x -= r.range(68, 92)) avenues.push(x)
  for (let x = C.x1 + 14; x < X1 - 20; x += r.range(68, 92)) avenues.push(x)
  avenues.sort((a, b) => a - b)
  const streets: number[] = []
  for (let z = C.z0 - 14; z > Z0 + 20; z -= r.range(62, 84)) streets.push(z)
  for (let z = MAIN_Z1 + 18; z < Z1 - 20; z += r.range(64, 82)) streets.push(z)
  streets.sort((a, b) => a - b)
  const roads: Road[] = [
    ...avenues.map((x, i) => ({ axis: 'z' as const, at: x, from: Z0, to: Z1, w: i % 2 === 0 ? 12 : 10, major: i % 2 === 0 })),
    ...streets.map((z) => ({ axis: 'x' as const, at: z, from: X0, to: X1, w: 10, major: false })),
  ]
  const half = (x: number) => (roads.find((rd) => rd.axis === 'z' && rd.at === x)?.w ?? 0) / 2
  const halfZ = (z: number) => (roads.find((rd) => rd.axis === 'x' && rd.at === z)?.w ?? 0) / 2

  // ── 블록: 도로 사이 칸. 동서 방향은 주 도로(트럭 도로)도 경계로 쓴다 ──
  const xs = [X0, ...avenues, X1]
  const zLines: { z: number; hw: number }[] = [{ z: Z0, hw: 0 }, ...streets.filter((z) => z < MAIN_Z0).map((z) => ({ z, hw: halfZ(z) })), { z: (MAIN_Z0 + MAIN_Z1) / 2, hw: (MAIN_Z1 - MAIN_Z0) / 2 }, ...streets.filter((z) => z > MAIN_Z1).map((z) => ({ z, hw: halfZ(z) })), { z: Z1, hw: 0 }]
  const blocks: Block[] = []
  const campusX0 = C.x0 - 14
  const campusX1 = C.x1 + 14
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zLines.length - 1; j++) {
      const ax = xs[i]
      const bx = xs[i + 1]
      const x0 = ax + (i === 0 ? 0 : half(ax) + SIDEWALK)
      const x1 = bx - (i + 1 === xs.length - 1 ? 0 : half(bx) + SIDEWALK)
      const z0 = zLines[j].z + (j === 0 ? 0 : zLines[j].hw + SIDEWALK)
      const z1 = zLines[j + 1].z - (j + 1 === zLines.length - 1 ? 0 : zLines[j + 1].hw + SIDEWALK)
      if (x1 - x0 < 16 || z1 - z0 < 16) continue
      // 캠퍼스 자리
      if (ax >= campusX0 - 1 && bx <= campusX1 + 1 && z0 >= C.z0 - 20 && z1 <= MAIN_Z0 + 1) continue
      const cx = (x0 + x1) / 2
      const cz = (z0 + z1) / 2
      const near = Math.max(x0 - C.x1, C.x0 - x1, z0 - MAIN_Z1, C.z0 - z1) < 40
      let zone: Zone
      if (cz > MAIN_Z1) zone = r.chance(0.12) ? 'park' : 'industrial'
      else if (r.chance(0.13)) zone = 'park'
      else if (r.chance(0.08)) zone = 'parking'
      else if (near || Math.abs(cx - (C.x0 + C.x1) / 2) < 120) zone = r.chance(0.75) ? 'commercial' : 'residential'
      else zone = r.chance(0.7) ? 'residential' : 'commercial'
      blocks.push({ x0, x1, z0, z1, zone, near })
    }

  const bldgs: Bldg[] = []
  const trees: CityPlan['trees'] = []
  const parked: CityPlan['parked'] = []
  const paving: Paving[] = []
  // 카메라는 남동쪽(+x, +z) 위에서 내려다본다 → 카메라 쪽 가까운 블록은 낮게
  const camSide = (b: Block) => b.x0 > C.x1 && b.z1 > C.z0 + 20
  for (const b of blocks) {
    const w = b.x1 - b.x0
    const d = b.z1 - b.z0
    if (b.zone === 'park') {
      const n = Math.floor((w * d) / 140)
      for (let k = 0; k < n; k++) trees.push({ x: r.range(b.x0 + 3, b.x1 - 3), z: r.range(b.z0 + 3, b.z1 - 3), s: r.range(0.9, 1.5), cone: r.chance(0.3) })
      continue
    }
    if (b.zone === 'parking') {
      for (let z = b.z0 + 4; z < b.z1 - 3; z += 6.5)
        for (let x = b.x0 + 3; x < b.x1 - 3; x += 2.8) if (r.chance(0.6)) parked.push({ x, z, rot: 0, color: r.pick(CITY_CARS) })
      continue
    }
    if (b.zone === 'industrial') {
      // 물류창고 1~3동 + 작은 사무동
      const n = w > 110 ? 3 : w > 60 ? 2 : 1
      const lotW = w / n
      for (let k = 0; k < n; k++) {
        const lx0 = b.x0 + k * lotW
        const sw = r.range(5, 9)
        const bw = lotW - sw * 2
        const bd = Math.min(d - 18, r.range(38, 70))
        if (bw < 12 || bd < 12) continue
        const bz = b.z0 + 6 + bd / 2 + r.range(0, Math.max(0, d - 18 - bd))
        // 하역문 앞마당은 남쪽 도로까지 이어진다
        paving.push({ x0: lx0 + sw - 2, x1: lx0 + lotW - sw + 2, z0: bz + bd / 2, z1: b.z1, kind: 'apron' })
        bldgs.push({ x: lx0 + lotW / 2, z: bz, w: bw, d: bd, h: r.range(9, 14), rot: 0, facade: 'plain', color: r.pick(WAREHOUSE), roof: r.pick(WAREHOUSE_ROOF), docks: true })
        if (r.chance(0.6)) bldgs.push({ x: lx0 + sw + 5, z: b.z0 + 5, w: 10, d: 7, h: r.range(7, 11), rot: 0, facade: 'ribbon', color: r.pick(OFFICE_COLORS), roof: r.pick(ROOF) })
        // 앞마당 트럭 주차
        for (let t = 0; t < r.int(0, 4); t++) parked.push({ x: lx0 + sw + 4 + t * 5, z: bz + bd / 2 + 6, rot: Math.PI / 2, color: r.pick(['#F4F5F7', '#2F62E8', '#2B9A64', '#46536B']) })
      }
      continue
    }
    if (b.zone === 'residential') {
      // 아파트 단지: 동서로 긴 판상형 동을 남북으로 줄지어, 사이에 조경
      const low = camSide(b)
      const slabD = 13
      const gap = r.range(26, 36)
      // 단지 안 길: 한쪽 가장자리 세로길 + 동마다 남쪽 앞길(주차)
      const west = r.chance(0.5)
      paving.push({ x0: west ? b.x0 + 1 : b.x1 - 4.5, x1: west ? b.x0 + 4.5 : b.x1 - 1, z0: b.z0, z1: b.z1, kind: 'path' })
      let z = b.z0 + 8 + slabD / 2
      while (z + slabD / 2 < b.z1 - 6) {
        let x = b.x0 + 6
        while (x < b.x1 - 20) {
          const sw = Math.min(r.range(36, 58), b.x1 - 6 - x)
          if (sw < 18) break
          const floors = low ? r.int(5, 8) : b.near ? r.int(8, 13) : r.int(13, 25)
          bldgs.push({ x: x + sw / 2, z: z + r.range(-2, 2), w: sw, d: slabD, h: floors * 2.9, rot: r.chance(0.2) ? r.range(-0.12, 0.12) : 0, facade: 'punch', color: r.pick(APT_COLORS), roof: '#8B939C', accent: r.pick(APT_ACCENTS) })
          x += sw + r.range(10, 18)
        }
        const pz0 = z + slabD / 2 + 5.5
        if (pz0 + 4 < b.z1 - 1) {
          paving.push({ x0: b.x0 + 1, x1: b.x1 - 1, z0: pz0, z1: pz0 + 4, kind: 'path' })
          for (let px = b.x0 + 8; px < b.x1 - 8; px += 5) if (r.chance(0.35)) parked.push({ x: px, z: pz0 + 3, rot: Math.PI / 2, color: r.pick(CITY_CARS) })
        }
        for (let tx = b.x0 + 6; tx < b.x1 - 6; tx += r.range(7, 12)) trees.push({ x: tx, z: z + slabD / 2 + gap / 2 + r.range(-3, 3), s: r.range(0.8, 1.2), cone: r.chance(0.2) })
        z += slabD + gap
      }
      continue
    }
    // 상업: 긴 변을 따라 필지를 나누고, 사무동(유리 띠) 또는 상가 건물(1층 상점)
    const alongX = w >= d
    const len = alongX ? w : d
    const short = alongX ? d : w
    // 블록이 두꺼우면 가운데로 뒷골목을 내고 건물은 양쪽 도로를 본다
    const alley = short >= 44
    const maxDepth = alley ? (short - 6) / 2 : short
    if (alley) {
      const cx = (b.x0 + b.x1) / 2
      const cz = (b.z0 + b.z1) / 2
      paving.push(alongX ? { x0: b.x0, x1: b.x1, z0: cz - 2.5, z1: cz + 2.5, kind: 'alley' } : { x0: cx - 2.5, x1: cx + 2.5, z0: b.z0, z1: b.z1, kind: 'alley' })
    }
    let p = 0
    const low = camSide(b)
    while (p < len - 12) {
      const lot = Math.min(r.range(18, 38), len - p)
      if (lot < 12) break
      const depth = Math.min(maxDepth, r.range(16, 34))
      const set = r.range(2, 5)
      const office = r.chance(0.45)
      const floors = low ? r.int(2, 5) : b.near ? (office ? r.int(4, 8) : r.int(3, 6)) : office ? r.int(6, 16) : r.int(3, 8)
      const fw = lot - set * 2
      const fd = depth - set * 2
      // 블록 양쪽 도로를 보도록 앞뒤로 번갈아 배치
      const front = r.chance(0.5)
      const cxL = alongX ? b.x0 + p + lot / 2 : front ? b.x0 + depth / 2 : b.x1 - depth / 2
      const czL = alongX ? (front ? b.z0 + depth / 2 : b.z1 - depth / 2) : b.z0 + p + lot / 2
      bldgs.push({
        x: cxL,
        z: czL,
        w: alongX ? fw : fd,
        d: alongX ? fd : fw,
        h: floors * (office ? 3.6 : 3.2),
        rot: r.chance(0.12) ? r.range(-0.15, 0.15) : 0,
        facade: office ? 'ribbon' : 'punch',
        color: office ? r.pick(OFFICE_COLORS) : r.pick(MIXED_COLORS),
        roof: r.pick(ROOF),
        shop: office ? undefined : r.pick(AWNINGS),
      })
      // 반대편 빈 자리에 주차·나무
      const ex = alongX ? cxL : front ? b.x1 - 6 : b.x0 + 6
      const ez = alongX ? (front ? b.z1 - 6 : b.z0 + 6) : czL
      if (r.chance(0.5)) parked.push({ x: ex, z: ez, rot: alongX ? 0 : Math.PI / 2, color: r.pick(CITY_CARS) })
      else trees.push({ x: ex, z: ez, s: r.range(0.8, 1.2), cone: false })
      // 가끔 필지 사이로 도로와 뒷골목을 잇는 샛길
      if (alley && r.chance(0.25) && p + lot + 6 < len - 12) {
        const a = (alongX ? b.x0 : b.z0) + p + lot + 0.5
        paving.push(alongX ? { x0: a, x1: a + 5, z0: b.z0, z1: b.z1, kind: 'alley' } : { x0: b.x0, x1: b.x1, z0: a, z1: a + 5, kind: 'alley' })
        p += lot + 6
      } else p += lot + r.range(0, 4)
    }
  }

  // ── 가로수·가로등·신호등·주행 차로 ──
  const lights: CityPlan['lights'] = []
  const signals: CityPlan['signals'] = []
  const lanes: CityPlan['lanes'] = []
  const crosses = (rd: Road) => (rd.axis === 'z' ? streets.concat([(MAIN_Z0 + MAIN_Z1) / 2]) : avenues)
  const inCampus = (x: number, z: number) => x > C.x0 - 8 && x < C.x1 + 8 && z > C.z0 - 8 && z < MAIN_Z1 + 6
  for (const rd of roads) {
    const off = rd.w / 2 + SIDEWALK - 0.9
    const xs2 = crosses(rd)
    const nearCross = (t: number) => xs2.some((c) => Math.abs(c - t) < 10)
    let k = 0
    for (let t = rd.from + 6; t < rd.to - 6; t += 11, k++) {
      if (nearCross(t)) continue
      for (const s of [-1, 1]) {
        const x = rd.axis === 'z' ? rd.at + s * off : t
        const z = rd.axis === 'z' ? t : rd.at + s * off
        if (inCampus(x, z)) continue
        if (k % 3 === 1 && s === 1) lights.push({ x, z, rot: rd.axis === 'z' ? (s > 0 ? -Math.PI / 2 : Math.PI / 2) : s > 0 ? Math.PI : 0 })
        else trees.push({ x, z, s: r.range(0.7, 0.95), cone: false })
      }
    }
    // 양방향 차로 (한 차로씩)
    const lo = rd.w / 4
    if (rd.axis === 'z') {
      lanes.push({ x: rd.at + lo, z: rd.from, dx: 0, dz: 1, len: rd.to - rd.from })
      lanes.push({ x: rd.at - lo, z: rd.to, dx: 0, dz: -1, len: rd.to - rd.from })
    } else {
      lanes.push({ x: rd.from, z: rd.at - lo, dx: 1, dz: 0, len: rd.to - rd.from })
      lanes.push({ x: rd.to, z: rd.at + lo, dx: -1, dz: 0, len: rd.to - rd.from })
    }
  }
  for (const x of avenues)
    for (const z of [...streets, (MAIN_Z0 + MAIN_Z1) / 2]) {
      const hw = half(x) + SIDEWALK - 0.6
      const hz = (z === (MAIN_Z0 + MAIN_Z1) / 2 ? (MAIN_Z1 - MAIN_Z0) / 2 : halfZ(z)) + SIDEWALK - 0.6
      signals.push({ x: x - hw, z: z - hz }, { x: x + hw, z: z + hz })
    }

  return { roads, blocks, paving, bldgs, trees, parked, lanes, lights, signals, bounds: { x0: X0, x1: X1, z0: Z0, z1: Z1 } }
}
