// 물류 캠퍼스 운영 시뮬레이션 — 1초(시뮬레이션) 고정 스텝, 사이트별 독립 상태
import { Rng } from './rng'
import { Path, motion, motionEnd, poseOn, rounded, type Motion, type Pose, type Vec2 } from './path'
import { FloorGrid } from './grid'
import { lerpPose, makeMover, obbAt, obbOverlap, obbRect, stepMover, type Leg, type Mover, type OBB, type Rect, type StepEnv } from './mover'
import * as L from './layout'
import { CARRIERS, CATALOGS, DESTS, GIVEN, ORIGINS, PLATE_CHARS, PLATE_REGIONS, SURNAMES, type CatalogId } from './catalog'

export const TRUCK_MODELS = {
  t25: { name: '25톤 윙바디', cap: 26, body: 9.8, len: 12.6, reefer: false },
  t11: { name: '11톤 윙바디', cap: 16, body: 7.6, len: 10.2, reefer: false },
  t5: { name: '5톤 카고', cap: 10, body: 5.6, len: 8.0, reefer: false },
  r5: { name: '5톤 냉동탑차', cap: 8, body: 5.6, len: 8.0, reefer: true },
  r11: { name: '11톤 냉동윙', cap: 14, body: 7.6, len: 10.2, reefer: true },
} as const
export type TruckModelId = keyof typeof TRUCK_MODELS

export type Role = 'checker' | 'picker' | 'lead' | 'office' | 'guard'
export const ROLE_LABEL: Record<Role, string> = { checker: '검수원', picker: '피커', lead: '현장 관리자', office: '사무직', guard: '경비원' }

export interface SiteConfig {
  id: string
  name: string
  short: string
  code: string
  layout: L.LayoutSpec
  forklifts: number
  inPerHr: number
  outPerHr: number
  models: TruckModelId[]
  catalog: CatalogId
  crew: Record<Role, number>
  seed: number
}

export const SITE_CONFIGS: SiteConfig[] = [
  {
    id: 'pt',
    name: '평택 메가허브',
    short: '평택',
    code: 'PT',
    layout: { sections: 4, rows: 12, docks: 16, chargers: 6 },
    forklifts: 24,
    inPerHr: 7,
    outPerHr: 8,
    models: ['t25', 't25', 't11', 't5'],
    catalog: 'general',
    crew: { checker: 8, picker: 14, lead: 3, office: 8, guard: 2 },
    seed: 11,
  },
  {
    id: 'ic',
    name: '이천 콜드체인센터',
    short: '이천',
    code: 'IC',
    layout: { sections: 2, rows: 8, docks: 5, chargers: 4 },
    forklifts: 10,
    inPerHr: 4,
    outPerHr: 4.5,
    models: ['r5', 'r11', 'r5'],
    catalog: 'cold',
    crew: { checker: 4, picker: 7, lead: 2, office: 5, guard: 1 },
    seed: 23,
  },
  {
    id: 'gh',
    name: '김해 남부물류센터',
    short: '김해',
    code: 'GH',
    layout: { sections: 3, rows: 10, docks: 11, chargers: 6 },
    forklifts: 16,
    inPerHr: 5,
    outPerHr: 5.5,
    models: ['t25', 't11', 't11', 't5'],
    catalog: 'south',
    crew: { checker: 6, picker: 10, lead: 2, office: 6, guard: 2 },
    seed: 37,
  },
]

const TRUCK_SPEED = 0.6
const TRUCK_REVERSE = 0.2
const FL_SPEED = 0.66
const WALK_SPEED = 0.26
const PICK_T = 32
const DROP_T = 42
const SEAL_T = 150
const PLAN_AHEAD = 4 * 3600
const ETA_REVEAL = 3600
const SLOT = 1800
const LOW_STOCK = 2
const BATTERY_LOW = 25

export type Dir = 'in' | 'out'
export type Level = 'info' | 'warn' | 'crit'
export type SelKind = 'truck' | 'dock' | 'forklift' | 'bay' | 'shipment' | 'worker' | 'facility'
export interface Sel {
  kind: SelKind
  id: string
}

export interface Bay {
  idx: number
  code: string
  row: number
  bay: number
  x: number
  z: number
  sku: string
  name: string
  stock: number
  resIn: number
  resOut: number
  lastMove: number | null
  shade: number
}

export interface Line {
  bay: number
  qty: number
  done: number
  flight: number
}

export type ShipStatus = 'planned' | 'enroute' | 'yard' | 'docked' | 'done'
export interface Shipment {
  id: string
  dir: Dir
  carrier: string
  partner: string
  winStart: number
  winEnd: number
  due: number
  eta: number
  etaKnownAt: number
  lines: Line[]
  pallets: number
  truckId: string
  dockId: string | null
  status: ShipStatus
  arrivedAt: number | null
  dockedAt: number | null
  doneAt: number | null
  onTime: boolean | null
  urgent: boolean
}

export type TruckPhase = 'enroute' | 'arriving' | 'queued' | 'docking' | 'docked' | 'departing' | 'gone'
export interface Truck {
  id: string
  plate: string
  model: TruckModelId
  shipmentId: string
  phase: TruckPhase
  mv: Mover
  dockId: string | null
  spawnAt: number
  lane: number
  moved: number
  sealAt: number | null
  departAt: number | null
  brokenUntil: number | null
}

export interface Dock {
  id: string
  idx: number
  x: number
  truckId: string | null
  maintUntil: number | null
  maintPending: boolean
  turns: number
  pallets: number
  busySec: number
  serviceSum: number
}
export type DockState = 'free' | 'reserved' | 'occupied' | 'maintenance'

export type FlState = 'idle' | 'toPark' | 'toPick' | 'picking' | 'toDrop' | 'dropping' | 'toCharge' | 'charging' | 'down'
export interface FlTask {
  truckId: string
  shipId: string
  dockId: string
  line: number
  dir: Dir
  bay: number
  pick: L.Loc
  drop: L.Loc
  lane: number
}
export interface Forklift {
  id: string
  operator: string
  state: FlState
  mv: Mover
  battery: number
  task: FlTask | null
  carrying: boolean
  opStart: number
  until: number
  opY: number
  midDone: boolean
  pallets: number
  distance: number
  chargerIdx: number | null
  downUntil: number | null
  parkKey: string | null
  parkLoc: L.Loc | null
  parked: boolean
  target: L.Loc | null
  resumeAt: number | null
  lastFix: number
  dockZone: string | null
}

export interface Worker {
  id: string
  name: string
  role: Role
  plan: Motion | null
  pose: Pose
  until: number
  activity: string
  place: string
  visible: boolean
  dockId: string | null
  distance: number
  breakSlot: number
  next: { activity: string; place: string; stay: number; visible: boolean; heading: number | null; dockId: string | null } | null
  alt: boolean
}

export type ScenarioKind = 'urgent' | 'surge' | 'forkliftDown' | 'truckDown'
export interface ScenarioResult {
  ok: boolean
  text: string
  ref: Sel | null
}

export interface GateLog {
  t: number
  plate: string
  truckId: string
  kind: 'in' | 'out'
}

export interface SimEvent {
  id: number
  t: number
  level: Level
  text: string
  ref: Sel | null
}

let eventSeq = 0

// 휴게 시간 (시 단위, 반 시간씩 두 조로 나눔)
const BREAKS = [
  [12, 12.5],
  [18, 18.5],
  [0, 0.5],
]
function breakFor(t: number, slot: number): number | null {
  const h = (((t % 86400) + 86400) % 86400) / 3600
  for (const [a] of BREAKS) {
    const s = a + slot * 0.5
    if (h >= s && h < s + 0.5) return t + (s + 0.5 - h) * 3600
  }
  return null
}

export class Site {
  readonly cfg: SiteConfig
  readonly layout: L.Layout
  private rng: Rng
  bays: Bay[] = []
  docks: Dock[] = []
  forklifts: Forklift[] = []
  workers: Worker[] = []
  trucks = new Map<string, Truck>()
  shipments: Shipment[] = []
  shipById = new Map<string, Shipment>()
  lanes: string[][]
  roadWait: string[] = []
  zones = new Map<string, { owner: string; rects: Rect[]; active: boolean }>()
  private truckObbs = new Map<string, OBB>()
  private flZoneOwner = new Map<string, string>() // 도크 작업 구역 → 이동 중인 지게차
  backoffs = 0
  detours = 0
  private grid: FloorGrid
  private boxes: { r: Rect; owner: string | null }[] = []
  private flObbs = new Map<string, OBB>()
  events: SimEvent[] = []
  gateLog: GateLog[] = []
  stats = {
    done: 0,
    onTime: 0,
    palletsIn: 0,
    palletsOut: 0,
    dwellSum: 0,
    dwellN: 0,
    gateIn: 0,
    gateOut: 0,
    hourly: new Map<number, { ok: number; n: number }>(),
  }
  stockVersion = 0
  elapsed = 0
  parked: boolean[] = []
  heat: Float32Array
  heatMax = 1
  heatScale = 1
  heatVersion = 0
  private nextPlan: number
  private nextMaint: number
  private seqIn = 0
  private seqOut = 0
  private truckSeq = 0
  private queueAlert = false

  constructor(cfg: SiteConfig, t0: number) {
    this.cfg = cfg
    this.rng = new Rng(cfg.seed)
    this.layout = L.makeLayout(cfg.layout)
    const Lg = this.layout
    this.heat = new Float32Array(Lg.heat.w * Lg.heat.h)
    this.lanes = Lg.holding.laneZ.map(() => [])
    this.grid = new FloorGrid(Lg, 0.75)
    // 교차로 박스: 교차 통로 × (랙 통로, 메인 통로)
    const gaps: [number, number][] = [[Lg.wall.x0 + 0.2, Lg.sectionX0[0]]]
    for (let i = 0; i < Lg.sectionX0.length - 1; i++) gaps.push([Lg.sectionX0[i] + L.SECTION_W, Lg.sectionX0[i + 1]])
    gaps.push([Lg.sectionX0[Lg.sectionX0.length - 1] + L.SECTION_W, Lg.wall.x1 - 0.2])
    for (const [gx0, gx1] of gaps) for (const z of [...Lg.aisles, Lg.corridorZ]) this.boxes.push({ r: { x0: gx0, x1: gx1, z0: z - 1.6, z1: z + 1.6 }, owner: null })
    const cat = CATALOGS[cfg.catalog]
    for (const row of Lg.rows) {
      for (let b = 0; b < Lg.baysPerRow; b++) {
        const idx = this.bays.length
        const r = this.rng.next()
        this.bays.push({
          idx,
          code: `${row.letter}-${String(b + 1).padStart(2, '0')}`,
          row: row.idx,
          bay: b,
          x: L.bayX(Lg, b),
          z: row.z,
          sku: `${cfg.code}${(40000 + ((idx * 7919 + cfg.seed * 131) % 59999)).toString().padStart(5, '0')}`,
          name: cat[(idx * 5 + row.idx * 3) % cat.length],
          stock: r < 0.07 ? this.rng.int(0, 1) : r < 0.2 ? 2 : this.rng.int(3, 8),
          resIn: 0,
          resOut: 0,
          lastMove: null,
          shade: this.rng.range(0, 1),
        })
      }
    }
    Lg.dockXs.forEach((x, i) =>
      this.docks.push({ id: `D${String(i + 1).padStart(2, '0')}`, idx: i, x, truckId: null, maintUntil: null, maintPending: false, turns: 0, pallets: 0, busySec: 0, serviceSum: 0 }),
    )
    const names = this.makeNames(cfg.forklifts + Object.values(cfg.crew).reduce((a, b) => a + b, 0))
    for (let i = 0; i < cfg.forklifts; i++) {
      const x = Lg.wall.x0 + 8 + ((Lg.width - 16) * i) / Math.max(1, cfg.forklifts - 1)
      this.forklifts.push({
        id: `FL-${String(i + 1).padStart(2, '0')}`,
        operator: names.pop()!,
        state: 'idle',
        mv: makeMover(`FL-${String(i + 1).padStart(2, '0')}`, { x, z: Lg.corridorZ + 4.4, heading: Math.PI }, 3.3, 1.2, 0.37, 0.45, 0.22),
        battery: this.rng.range(38, 100),
        task: null,
        carrying: false,
        opStart: 0,
        until: 0,
        opY: 0,
        midDone: false,
        pallets: 0,
        distance: 0,
        chargerIdx: null,
        downUntil: null,
        parkKey: null,
        parkLoc: null,
        parked: false,
        target: null,
        resumeAt: null,
        lastFix: -1e9,
        dockZone: null,
      })
    }
    let wi = 0
    for (const role of ['checker', 'picker', 'lead', 'office', 'guard'] as Role[]) {
      for (let i = 0; i < cfg.crew[role]; i++) {
        const start = this.workerHome(role)
        this.workers.push({
          id: `W${String(++wi).padStart(2, '0')}`,
          name: names.pop()!,
          role,
          plan: null,
          pose: { x: start.x + this.rng.range(-1, 1), z: start.z + this.rng.range(-1, 1), heading: 0 },
          until: t0,
          activity: '근무 준비',
          place: '',
          visible: role !== 'office',
          dockId: null,
          distance: 0,
          breakSlot: i % 2,
          next: null,
          alt: this.rng.chance(0.5),
        })
      }
    }
    const pk = Lg.facilities.parking
    const pr = new Rng(cfg.seed + 5)
    this.parked = Array.from({ length: 2 * Math.floor((pk.w - 2) / 2.7) }, () => pr.chance(0.78))
    this.nextPlan = Math.ceil((t0 + 1200) / SLOT) * SLOT
    this.nextMaint = t0 + this.rng.range(1.5, 3) * 3600
  }

  private makeNames(n: number): string[] {
    const set = new Set<string>()
    let guard = 0
    while (set.size < n && guard++ < 5000) set.add(this.rng.pick(SURNAMES) + this.rng.pick(GIVEN))
    return [...set]
  }

  private workerHome(role: Role): Vec2 {
    const Lg = this.layout
    if (role === 'office') return Lg.officeDoor
    if (role === 'guard') return Lg.guardPost
    return { x: this.rng.range(Lg.wall.x0 + 6, Lg.wall.x1 - 6), z: this.rng.range(Lg.corridorZ + 1, 8) }
  }

  // ───────── 조회 헬퍼 ─────────
  dockState(d: Dock): DockState {
    if (d.maintUntil != null) return 'maintenance'
    if (!d.truckId) return 'free'
    const tr = this.trucks.get(d.truckId)
    return tr && tr.phase === 'docked' ? 'occupied' : 'reserved'
  }
  shipOf(tr: Truck): Shipment {
    return this.shipById.get(tr.shipmentId)!
  }
  // 렌더용: 직전 스텝과 현재 스텝 자세를 시간 비율로 보간
  truckPose(tr: Truck, t: number): Pose {
    return lerpPose(tr.mv.prev, tr.mv.pose, t - Math.floor(t))
  }
  forkliftPose(f: Forklift, t: number): Pose {
    return lerpPose(f.mv.prev, f.mv.pose, t - Math.floor(t))
  }
  workerPose(w: Worker, t: number): Pose {
    return w.plan ? poseOn(w.plan, t, w.pose.heading) : w.pose
  }
  workerMoving(w: Worker, t: number): boolean {
    return !!w.plan && t < motionEnd(w.plan)
  }
  forkY(f: Forklift, t: number): { y: number; carrying: boolean } {
    if (f.state === 'picking' || f.state === 'dropping') {
      const u = Math.max(0, Math.min(1, (t - f.opStart) / (f.until - f.opStart)))
      const s = (v: number) => v * v * (3 - 2 * v)
      const y = u < 0.5 ? 0.14 + (f.opY - 0.14) * s(u * 2) : f.opY + (0.14 - f.opY) * s((u - 0.5) * 2)
      const carrying = f.state === 'picking' ? u >= 0.5 : u < 0.5
      return { y, carrying }
    }
    return { y: f.carrying ? 0.32 : 0.14, carrying: f.carrying }
  }
  bayStatus(b: Bay): 'out' | 'low' | 'ok' | 'full' {
    if (b.stock <= 0) return 'out'
    if (b.stock <= LOW_STOCK) return 'low'
    if (b.stock >= L.BAY_CAP) return 'full'
    return 'ok'
  }
  dwellSoFar(tr: Truck, t: number): number {
    const s = this.shipOf(tr)
    if (s.arrivedAt == null) return 0
    return (s.dockedAt ?? t) - s.arrivedAt
  }
  yardTrucks(): Truck[] {
    return [...this.roadWait, ...this.lanes.flat()].map((id) => this.trucks.get(id)!)
  }

  private log(t: number, level: Level, text: string, ref: Sel | null = null) {
    this.events.unshift({ id: ++eventSeq, t, level, text, ref })
    if (this.events.length > 90) this.events.length = 90
  }
  private gate(t: number, tr: Truck, kind: 'in' | 'out') {
    if (kind === 'in') this.stats.gateIn++
    else this.stats.gateOut++
    this.gateLog.unshift({ t, plate: tr.plate, truckId: tr.id, kind })
    if (this.gateLog.length > 40) this.gateLog.length = 40
  }

  // ───────── 출입고 계획 ─────────
  private plan(t: number) {
    while (this.nextPlan < t + PLAN_AHEAD) {
      const ws = this.nextPlan
      for (const dir of ['in', 'out'] as Dir[]) {
        const rate = (dir === 'in' ? this.cfg.inPerHr : this.cfg.outPerHr) / 2
        const n = Math.floor(rate) + (this.rng.chance(rate - Math.floor(rate)) ? 1 : 0)
        for (let i = 0; i < n; i++) this.createShipment(dir, ws)
      }
      this.nextPlan += SLOT
    }
  }

  private pickLines(dir: Dir, target: number): Line[] {
    const lines: Line[] = []
    let remaining = target
    if (dir === 'out') {
      const cands = this.rng.shuffle(this.bays.filter((b) => b.stock - b.resOut > 0))
      for (const b of cands) {
        if (remaining <= 0 || lines.length >= 5) break
        const q = Math.min(b.stock - b.resOut, remaining, this.rng.int(2, 6))
        if (q <= 0) continue
        b.resOut += q
        lines.push({ bay: b.idx, qty: q, done: 0, flight: 0 })
        remaining -= q
      }
    } else {
      const cands = this.bays
        .filter((b) => L.BAY_CAP - b.stock - b.resIn > 0)
        .map((b) => ({ b, k: b.stock + b.resIn - b.resOut + this.rng.next() * 1.5 }))
        .sort((a, c) => a.k - c.k)
      for (const { b } of cands) {
        if (remaining <= 0 || lines.length >= 5) break
        const q = Math.min(L.BAY_CAP - b.stock - b.resIn, remaining, this.rng.int(3, 7))
        if (q <= 0) continue
        b.resIn += q
        lines.push({ bay: b.idx, qty: q, done: 0, flight: 0 })
        remaining -= q
      }
    }
    return lines
  }

  private createShipment(dir: Dir, ws: number, opts: { eta?: number; urgent?: boolean; due?: number } = {}): Shipment | null {
    const modelId = this.rng.pick(this.cfg.models)
    const model = TRUCK_MODELS[modelId]
    const target = Math.max(2, Math.round(model.cap * (dir === 'in' ? this.rng.range(0.78, 1) : this.rng.range(0.55, 0.95))))
    const lines = this.pickLines(dir, target)
    const pallets = lines.reduce((s, l) => s + l.qty, 0)
    if (!pallets) return null
    const r = this.rng.next()
    const delay = r < 0.76 ? 0 : r < 0.91 ? this.rng.range(600, 1800) : this.rng.range(1800, 4500)
    const eta = opts.eta ?? ws + this.rng.range(-420, 1560) + delay
    const seq = dir === 'in' ? ++this.seqIn : ++this.seqOut
    const id = `${dir === 'in' ? 'IB' : 'OB'}-${this.cfg.code}${String(seq).padStart(4, '0')}`
    const truckId = `T${this.cfg.code}${++this.truckSeq}`
    const ship: Shipment = {
      id,
      dir,
      carrier: this.rng.pick(CARRIERS),
      partner: this.rng.pick(dir === 'in' ? ORIGINS[this.cfg.catalog] : DESTS[this.cfg.catalog]),
      winStart: ws,
      winEnd: ws + SLOT,
      due: opts.due ?? (dir === 'in' ? ws + SLOT : ws + SLOT + 2700),
      eta,
      etaKnownAt: eta - ETA_REVEAL,
      lines,
      pallets,
      truckId,
      dockId: null,
      status: 'planned',
      arrivedAt: null,
      dockedAt: null,
      doneAt: null,
      onTime: null,
      urgent: !!opts.urgent,
    }
    const Lg = this.layout
    const approach = (Lg.spawnX - Lg.gateX) / TRUCK_SPEED + 20
    const truck: Truck = {
      id: truckId,
      plate: `${this.rng.pick(PLATE_REGIONS)}${this.rng.int(80, 99)}${this.rng.pick(PLATE_CHARS)}${this.rng.int(1000, 9999)}`,
      model: modelId,
      shipmentId: id,
      phase: 'enroute',
      mv: makeMover(truckId, { x: Lg.spawnX, z: L.LANE_IN, heading: -Math.PI / 2 }, model.len, 2.6, model.len / 2, 2.2, 0.12),
      dockId: null,
      spawnAt: eta - approach,
      lane: -1,
      moved: 0,
      sealAt: null,
      departAt: null,
      brokenUntil: null,
    }
    this.shipments.push(ship)
    this.shipById.set(id, ship)
    this.trucks.set(truckId, truck)
    return ship
  }

  // ───────── 트럭: 게이트 → 대기장 레인 → 도크 ─────────
  // 트럭은 물리 이동(mover)으로 움직인다. 줄서기는 앞차 감지로 자연스럽게 생기고,
  // 후진 접안·출차는 구역을 예약해 겹치는 기동이 동시에 일어나지 않게 한다.
  private leg(points: Vec2[], opts: { reverse?: boolean; zone?: string | null; smooth?: boolean; r?: number; vmax?: number } = {}): Leg {
    const path = opts.smooth ? new Path(points, true) : new Path(rounded(points, opts.r ?? 8))
    return { path, vmax: opts.vmax ?? TRUCK_SPEED, reverse: !!opts.reverse, zone: opts.zone ?? null, ghost: !!opts.zone }
  }

  private spawn(tr: Truck, _t: number) {
    const Lg = this.layout
    tr.phase = 'arriving'
    const start = { x: Lg.spawnX, z: L.LANE_IN }
    tr.mv.pose = { ...start, heading: -Math.PI / 2 }
    tr.mv.prev = { ...tr.mv.pose }
    tr.mv.s = 0
    tr.mv.v = TRUCK_SPEED
    const lane = this.freeLane(this.shipOf(tr).urgent)
    if (lane >= 0) this.assignLane(tr, lane)
    else {
      tr.lane = -1
      this.roadWait.push(tr.id)
      tr.mv.legs = [this.leg([start, { x: Lg.holding.entryX + 16, z: L.LANE_IN }])]
    }
  }

  private freeLane(_urgent: boolean): number {
    const per = this.layout.holding.perLane
    let best = -1
    for (let i = 0; i < this.lanes.length; i++) {
      if (this.lanes[i].length >= per) continue
      if (best < 0 || this.lanes[i].length < this.lanes[best].length) best = i
    }
    return best
  }

  private assignLane(tr: Truck, lane: number) {
    const H = this.layout.holding
    this.lanes[lane].push(tr.id)
    tr.lane = lane
    const p = tr.mv.pose
    const lz = H.laneZ[lane]
    const pts: Vec2[] = [p]
    if (p.x > H.entryX) pts.push({ x: H.entryX, z: L.LANE_IN })
    pts.push({ x: H.eastX + 7, z: lz }, { x: H.x0, z: lz })
    tr.mv.legs = [this.leg(pts, { r: 9 })]
    tr.mv.s = 0
  }

  private zoneOverlaps(rects: Rect[], self: string): boolean {
    for (const z of this.zones.values()) {
      if (z.owner === self) continue
      for (const a of z.rects) for (const b of rects) if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) return true
    }
    return false
  }
  private reserveZone(owner: string, rects: Rect[], active: boolean): boolean {
    if (this.zoneOverlaps(rects, owner)) return false
    this.zones.set(owner, { owner, rects, active })
    return true
  }
  private zoneClear(owner: string): boolean {
    const z = this.zones.get(owner)
    if (!z) return false
    if (!z.active) {
      const me = this.truckObbs.get(owner)
      if (me && z.rects.some((r) => obbRect(me, r))) z.active = true
      else return false
    }
    for (const tr of this.trucks.values()) {
      if (tr.id === owner || tr.phase === 'enroute' || tr.phase === 'gone' || tr.phase === 'docked') continue
      const o = this.truckObbs.get(tr.id)
      if (o && z.rects.some((r) => obbRect(o, r))) return false
    }
    return true
  }

  private onTruckLegsDone(tr: Truck, t: number) {
    const ship = this.shipOf(tr)
    if (tr.phase === 'docking') {
      tr.phase = 'docked'
      this.zones.delete(tr.id)
      ship.dockedAt = t
      ship.status = 'docked'
      if (ship.arrivedAt != null) {
        this.stats.dwellSum += t - ship.arrivedAt
        this.stats.dwellN++
      }
    } else if (tr.phase === 'departing') {
      tr.phase = 'gone'
      this.zones.delete(tr.id)
      this.gate(t, tr, 'out')
    }
  }

  private stepTrucks(t: number) {
    const Lg = this.layout
    // 도로 대기 차량 → 빈 레인
    while (this.roadWait.length) {
      const lane = this.freeLane(false)
      if (lane < 0) break
      const tr = this.trucks.get(this.roadWait.shift()!)!
      this.assignLane(tr, lane)
    }
    this.truckObbs.clear()
    const active: Truck[] = []
    for (const tr of this.trucks.values()) {
      if (tr.phase === 'enroute' || tr.phase === 'gone') continue
      tr.mv.prev = tr.mv.pose
      this.truckObbs.set(tr.id, obbAt(tr.mv, tr.mv.pose))
      active.push(tr)
    }
    const movers = new Map(active.map((x) => [x.id, x.mv]))
    const env: StepEnv = {
      t,
      obbs: this.truckObbs,
      zones: [...this.zones.values()],
      canStartZone: (m) => this.zoneClear(m.id),
      movers,
    }
    for (const tr of active) {
      if (!tr.mv.legs.length) continue
      const done = stepMover(tr.mv, env)
      if (done && !tr.mv.legs.length) this.onTruckLegsDone(tr, t)
      const own = this.zones.get(tr.id)
      if (own && !own.active) {
        const o = this.truckObbs.get(tr.id)!
        if (own.rects.some((r) => obbRect(o, r))) own.active = true
      }
      const ship = this.shipOf(tr)
      if (tr.phase === 'arriving') {
        if (ship.arrivedAt == null && tr.mv.pose.x < Lg.gateX) {
          ship.arrivedAt = t
          ship.status = 'yard'
          this.gate(t, tr, 'in')
          if (ship.dir === 'in') ship.onTime = t <= ship.due
          if (t > ship.winEnd) {
            this.log(t, 'warn', `${ship.id} 슬롯 초과 도착 +${Math.round((t - ship.winEnd) / 60)}분 · ${ship.carrier}`, { kind: 'truck', id: tr.id })
          }
        }
        if (tr.lane >= 0 && tr.mv.pose.z < L.LANE_IN - 4) tr.phase = 'queued'
      }
      // 출차 구역은 차체가 완전히 빠져나가면 반납
      if (tr.phase === 'departing' && this.zones.has(tr.id) && tr.mv.legs.length <= 1) {
        const z = this.zones.get(tr.id)!
        const o = this.truckObbs.get(tr.id)!
        if (!z.rects.some((r) => obbRect(o, r))) this.zones.delete(tr.id)
      }
    }
  }

  private assignDocks(t: number) {
    void t
    for (let guard = 0; guard < 6; guard++) {
      const free = this.docks.filter((d) => !d.truckId && d.maintUntil == null && !d.maintPending)
      if (!free.length) return
      const heads = this.lanes
        .map((q, lane) => ({ lane, tr: q.length ? this.trucks.get(q[0])! : null }))
        .filter((h): h is { lane: number; tr: Truck } => !!h.tr && h.tr.phase === 'queued')
      if (!heads.length) return
      heads.sort((a, b) => Number(this.shipOf(b.tr).urgent) - Number(this.shipOf(a.tr).urgent) || (this.shipOf(a.tr).arrivedAt ?? 0) - (this.shipOf(b.tr).arrivedAt ?? 0))
      const { lane, tr } = heads[0]
      const len = TRUCK_MODELS[tr.model].len
      free.sort((a, b) => a.turns - b.turns || b.x - a.x)
      const dock = free.find((d) => this.reserveZone(tr.id, L.reverseZone(d.x, len), false))
      if (!dock) return
      this.lanes[lane].shift()
      dock.truckId = tr.id
      tr.dockId = dock.id
      const ship = this.shipOf(tr)
      ship.dockId = dock.id
      tr.phase = 'docking'
      const p0 = tr.mv.pose
      const a = { x: dock.x - 13, z: L.LANE_IN }
      const H = this.layout.holding
      const approach = this.leg([p0, { x: H.x0 - 9, z: p0.z }, { x: H.x0 - 28, z: L.LANE_IN }, a], { r: 8 })
      const curve = this.leg(
        [a, { x: dock.x - 6.6, z: L.LANE_IN - 1.1 }, { x: dock.x - 1.7, z: L.LANE_IN - 4.6 }, { x: dock.x, z: L.LANE_IN - 9.5 }, { x: dock.x, z: L.DOCKED_Z + 2.5 }, { x: dock.x, z: L.DOCKED_Z }],
        { smooth: true, reverse: true, zone: tr.id, vmax: TRUCK_REVERSE },
      )
      tr.mv.legs = [approach, curve]
      tr.mv.s = 0
    }
  }

  private depart(tr: Truck, t: number): boolean {
    const Lg = this.layout
    const dock = this.docks.find((d) => d.id === tr.dockId)!
    if (!this.reserveZone(tr.id, L.departZone(dock.x), true)) return false
    const ship = this.shipOf(tr)
    dock.truckId = null
    dock.turns++
    if (ship.dockedAt != null) dock.serviceSum += t - ship.dockedAt
    ship.doneAt = t
    ship.status = 'done'
    if (ship.dir === 'out') ship.onTime = t <= ship.due
    this.stats.done++
    if (ship.onTime) this.stats.onTime++
    const hk = Math.floor(t / 3600)
    const h = this.stats.hourly.get(hk) ?? { ok: 0, n: 0 }
    h.n++
    if (ship.onTime) h.ok++
    this.stats.hourly.set(hk, h)
    this.log(t, 'info', `${dock.id} ${ship.dir === 'in' ? '입고 하역' : '출고 상차'} 완료 · ${ship.pallets} PLT · ${ship.carrier}`, { kind: 'shipment', id: ship.id })
    if (ship.dir === 'out' && !ship.onTime) {
      this.log(t, 'warn', `${ship.id} 출차 마감 초과 +${Math.round((t - ship.due) / 60)}분 → ${ship.partner}`, { kind: 'shipment', id: ship.id })
    }
    tr.phase = 'departing'
    tr.departAt = t
    tr.dockId = null
    const curve = this.leg(
      [
        { x: dock.x, z: L.DOCKED_Z },
        { x: dock.x, z: L.DOCKED_Z + 5 },
        { x: dock.x, z: 23 },
        { x: dock.x - 2.6, z: 29.5 },
        { x: dock.x - 8.5, z: 34.6 },
        { x: dock.x - 17, z: L.LANE_OUT },
        { x: dock.x - 34, z: L.LANE_OUT },
      ],
      { smooth: true, zone: tr.id },
    )
    const road = this.leg([{ x: dock.x - 34, z: L.LANE_OUT }, { x: Lg.exitX, z: L.LANE_OUT }])
    tr.mv.legs = [curve, road]
    tr.mv.s = 0
    if (dock.maintPending) {
      dock.maintPending = false
      this.startMaint(dock, t, this.rng.range(40, 80) * 60)
    }
    return true
  }

  // ───────── 도크 점검 ─────────
  private startMaint(d: Dock, t: number, dur: number) {
    d.maintUntil = t + dur
    this.log(t, 'warn', `${d.id} 도크 레벨러 점검 시작 · 약 ${Math.round(dur / 60)}분`, { kind: 'dock', id: d.id })
  }
  toggleMaintenance(dockId: string, t: number) {
    const d = this.docks.find((x) => x.id === dockId)
    if (!d) return
    if (d.maintUntil != null) {
      d.maintUntil = null
      this.log(t, 'info', `${d.id} 점검 해제 · 운영 재개 (수동)`, { kind: 'dock', id: d.id })
    } else if (d.maintPending) {
      d.maintPending = false
    } else if (!d.truckId) {
      this.startMaint(d, t, 3600)
    } else {
      d.maintPending = true
      this.log(t, 'info', `${d.id} 현재 작업 종료 후 점검 예정`, { kind: 'dock', id: d.id })
    }
  }

  // ───────── 지게차 ─────────
  // 통로에서는 우측통행, 앞에 다른 지게차가 있으면 멈춘다. 일이 없으면 벽 쪽 주차 칸으로 빠진다.
  // 도크 앞 구역 안에 있으면 그 도크 id
  // 앞쪽 작업 베이(도크 열·주차·충전) 안인지: 이 영역은 열 단위로 직진 진입·후진 진출
  private dockAtPoint(p: Vec2): boolean {
    return p.z > L.dockApproachZ(this.layout) + 0.6
  }
  private flGo(f: Forklift, to: L.Loc) {
    const Lg = this.layout
    const legs: Leg[] = []
    let from: Vec2 = f.mv.pose
    const az = L.dockApproachZ(Lg)
    const fromDock = this.dockAtPoint(from)
    if (fromDock) {
      // 도크 열에서는 후진으로 똑바로 빠져나온다
      const out = { x: from.x, z: az }
      legs.push({ path: new Path([from, out]), vmax: 0.4, reverse: true, zone: null })
      from = out
    }
    const toDock = this.dockAtPoint(to)
    const mid = toDock ? { x: to.x, z: az } : to
    const raw = L.route(from, mid, Lg)
    const pts = L.keepRight(raw, 0.8, { straightFirst: !!fromDock, straightLast: !!toDock })
    const main = new Path(pts)
    if (main.length > 0.05) legs.push({ path: main, vmax: FL_SPEED, reverse: false, zone: null })
    if (toDock) legs.push({ path: new Path([mid, to]), vmax: 0.45, reverse: false, zone: null })
    const total = legs.reduce((a, l) => a + l.path.length, 0)
    f.distance += total
    f.battery = Math.max(0, f.battery - total * 0.0075)
    f.mv.legs = legs
    f.mv.s = 0
    f.target = to
    f.resumeAt = null
  }
  // 교착 해소 1순위: 다른 지게차를 장애물로 본 A* 우회 경로
  private detour(f: Forklift): boolean {
    const Lg = this.layout
    const tgt = f.target
    if (!tgt || this.dockAtPoint(f.mv.pose)) return false
    const others = this.forklifts.filter((x) => x !== f).map((x) => obbAt(x.mv, x.mv.pose))
    this.grid.markObstacles(others, 0.75)
    const toDock = this.dockAtPoint(tgt)
    const az = L.dockApproachZ(Lg)
    const goal = toDock ? { x: tgt.x, z: az } : tgt
    const pts = this.grid.plan(f.mv.pose, goal)
    if (!pts || pts.length < 2) return false
    const legs: Leg[] = [{ path: new Path(pts), vmax: FL_SPEED * 0.8, reverse: false, zone: null }]
    if (toDock) legs.push({ path: new Path([goal, tgt]), vmax: 0.45, reverse: false, zone: null })
    f.mv.legs = legs
    f.mv.s = 0
    f.mv.waitFrom = null
    f.resumeAt = null
    this.detours++
    return true
  }

  // 교착 해소 2순위: 뒤로 2.5m 물러난 뒤 잠시 기다렸다 다시 경로를 잡는다
  private backOff(f: Forklift, t: number): boolean {
    const Lg = this.layout
    const p = f.mv.pose
    const leg = f.mv.legs[0]
    if (!leg || leg.zone || !f.target) return false
    const tip = leg.path.sample(f.mv.s + 0.5)
    const n = Math.hypot(tip.dx, tip.dz) || 1
    const back = { x: p.x - (tip.dx / n) * 2.6, z: p.z - (tip.dz / n) * 2.6 }
    if (!L.isInside(Lg, back) || back.z > L.dockZoneZ0(Lg) - 0.5 || p.z > L.dockZoneZ0(Lg) - 0.5) return false
    for (const r of Lg.rows) {
      for (const sx of Lg.sectionX0) if (back.x > sx - 1 && back.x < sx + L.SECTION_W + 1 && Math.abs(back.z - r.z) < 1.5) return false
    }
    const probe = obbAt(f.mv, { ...back, heading: p.heading })
    for (const o of this.flObbs.values()) if (o.id !== f.id && obbOverlap(probe, o)) return false
    f.mv.legs = [{ path: new Path([p, back]), vmax: 0.45, reverse: true, zone: null }]
    f.mv.s = 0
    f.resumeAt = t + 3
    this.backoffs++
    return true
  }
  private arriveAt(f: Forklift, loc: L.Loc) {
    f.mv.pose = { x: loc.x, z: loc.z, heading: loc.heading }
    f.mv.legs = []
    this.flObbs.set(f.id, obbAt(f.mv, f.mv.pose))
  }
  private releasePark(f: Forklift) {
    f.parkKey = null
    f.parkLoc = null
    f.parked = false
  }
  private opHeight(f: Forklift, kind: 'pick' | 'drop'): number {
    const task = f.task!
    const atBay = (kind === 'pick' && task.dir === 'out') || (kind === 'drop' && task.dir === 'in')
    if (!atBay) return 1.05
    const b = this.bays[task.bay]
    const slot = kind === 'drop' ? Math.min(L.BAY_CAP - 1, b.stock) : Math.max(0, b.stock - 1)
    return L.slotY(slot) + 0.14
  }
  private stockChanged(b: Bay, t: number, prev: number) {
    b.lastMove = t
    this.stockVersion++
    if (b.stock === 0 && prev > 0) this.log(t, 'crit', `${b.code} 품절 · ${b.name}`, { kind: 'bay', id: String(b.idx) })
    else if (b.stock === LOW_STOCK && prev > LOW_STOCK) this.log(t, 'warn', `${b.code} 재고 부족 (${b.stock} PLT) · ${b.name}`, { kind: 'bay', id: String(b.idx) })
  }

  // 박스에 들어가려면: 박스가 비어 있고(또는 내가 소유), 박스를 빠져나간 자리도 비어 있어야 한다
  private boxGate(m: Mover, leg: Leg, ds: number, fut: OBB, cur: OBB): string | null {
    for (const b of this.boxes) {
      if (!obbRect(fut, b.r) || obbRect(cur, b.r)) continue
      if (b.owner && b.owner !== m.id) return `box:${b.owner}`
      for (const o of this.flObbs.values()) if (o.id !== m.id && obbRect(o, b.r)) return o.id
      // 출구 확인: 경로를 따라 박스를 완전히 벗어나는 지점까지 가 보고, 그 자리가 비었는지
      let s = m.s + ds
      let out: OBB | null = null
      for (let k = 0; k < 40 && s <= leg.path.length; k++, s += 0.5) {
        const o = obbAt(m, legPose(leg, s, m.pose.heading))
        if (!obbRect(o, b.r)) {
          out = obbAt(m, legPose(leg, Math.min(leg.path.length, s + 0.6), m.pose.heading))
          break
        }
      }
      if (out) for (const o of this.flObbs.values()) if (o.id !== m.id && obbOverlap(out, o)) return o.id
      b.owner = m.id
    }
    return null
  }

  private stepForklifts(t: number) {
    this.flObbs.clear()
    for (const f of this.forklifts) {
      f.mv.prev = f.mv.pose
      this.flObbs.set(f.id, obbAt(f.mv, f.mv.pose))
    }
    for (const b of this.boxes) {
      if (!b.owner) continue
      const o = this.flObbs.get(b.owner)
      if (!o || !obbRect(o, b.r)) b.owner = null
    }
    const env: StepEnv = {
      t,
      obbs: this.flObbs,
      zones: [],
      canStartZone: (m, zone) => {
        const owner = this.flZoneOwner.get(zone)
        if (owner && owner !== m.id) return false
        this.flZoneOwner.set(zone, m.id)
        return true
      },
      movers: new Map(this.forklifts.map((f) => [f.id, f.mv])),
      gate: (m, leg, ds, fut, cur) => this.boxGate(m, leg, ds, fut, cur),
    }
    const byId = new Map(this.forklifts.map((f) => [f.id, f]))
    for (const f of this.forklifts) {
      if (f.mv.legs.length) {
        const zone = f.mv.legs[0].zone
        const done = stepMover(f.mv, env)
        if (done && zone && this.flZoneOwner.get(zone) === f.id) this.flZoneOwner.delete(zone)
      }
      if (!f.mv.legs.length && f.resumeAt != null) {
        if (t >= f.resumeAt && f.target) this.flGo(f, f.target)
        continue
      }
      if (f.mv.waitFrom != null && t - f.mv.waitFrom >= 3 && (t & 3) === 0 && t - f.lastFix > 15) {
        // 대기 그래프 따라가기: 나에게 돌아오면 순환 교착 → 한 대를 물러나게
        const cyc: Forklift[] = [f]
        let cur = f.mv.blocker ? byId.get(f.mv.blocker) : undefined
        while (cur && cur !== f && cyc.length < 12 && !cyc.includes(cur)) {
          cyc.push(cur)
          cur = cur.mv.blocker ? byId.get(cur.mv.blocker) : undefined
        }
        if (cur === f) {
          const order = [...cyc].sort((a, b) => (a.id < b.id ? 1 : -1))
          for (const c of cyc) c.lastFix = t
          for (const c of order) if (this.backOff(c, t)) break
        } else if (t - f.mv.waitFrom >= 90) {
          // 순환은 아니지만 오래 막힘 → 우회 경로 시도
          f.lastFix = t
          this.detour(f)
        }
      }
      const arrived = !f.mv.legs.length
      switch (f.state) {
        case 'idle':
          f.battery = Math.max(0, f.battery - 0.0012)
          break
        case 'toPark':
          if (arrived) {
            this.arriveAt(f, f.parkLoc ?? f.mv.pose)
            f.state = 'idle'
            f.parked = true
          }
          break
        case 'toPick':
          if (arrived) {
            this.arriveAt(f, f.task!.pick)
            f.state = 'picking'
            f.opStart = t
            f.until = t + PICK_T
            f.opY = this.opHeight(f, 'pick')
            f.midDone = false
          }
          break
        case 'picking':
          if (!f.midDone && t >= (f.opStart + f.until) / 2) {
            f.midDone = true
            f.carrying = true
            const task = f.task!
            if (task.dir === 'out') {
              const b = this.bays[task.bay]
              const prev = b.stock
              b.stock = Math.max(0, b.stock - 1)
              b.resOut = Math.max(0, b.resOut - 1)
              this.stockChanged(b, t, prev)
            }
          }
          if (t >= f.until) {
            f.state = 'toDrop'
            this.flGo(f, f.task!.drop)
          }
          break
        case 'toDrop':
          if (arrived) {
            this.arriveAt(f, f.task!.drop)
            f.state = 'dropping'
            f.opStart = t
            f.until = t + DROP_T
            f.opY = this.opHeight(f, 'drop')
            f.midDone = false
          }
          break
        case 'dropping':
          if (!f.midDone && t >= (f.opStart + f.until) / 2) {
            f.midDone = true
            f.carrying = false
            const task = f.task!
            if (task.dir === 'in') {
              const b = this.bays[task.bay]
              const prev = b.stock
              b.stock = Math.min(L.BAY_CAP, b.stock + 1)
              b.resIn = Math.max(0, b.resIn - 1)
              this.stockChanged(b, t, prev)
            }
          }
          if (t >= f.until) this.finishDrop(f)
          break
        case 'down':
          if (f.downUntil != null && t >= f.downUntil) {
            f.downUntil = null
            f.state = 'idle'
            this.log(t, 'info', `${f.id} 정비 완료 · 작업 복귀`, { kind: 'forklift', id: f.id })
          }
          break
        case 'toCharge':
          if (arrived) {
            this.arriveAt(f, this.layout.chargers[f.chargerIdx ?? 0])
            f.state = 'charging'
          }
          break
        case 'charging':
          f.battery = Math.min(100, f.battery + 1.25 / 60)
          if (f.battery >= 96) {
            f.state = 'idle'
            f.chargerIdx = null
          }
          break
      }
    }
  }

  private finishDrop(f: Forklift) {
    const task = f.task!
    const ship = this.shipById.get(task.shipId)!
    const line = ship.lines[task.line]
    line.done++
    line.flight--
    const tr = this.trucks.get(task.truckId)
    if (tr) tr.moved++
    const dock = this.docks.find((d) => d.id === task.dockId)
    if (dock) dock.pallets++
    f.pallets++
    f.battery = Math.max(0, f.battery - 0.35)
    if (task.dir === 'in') this.stats.palletsIn++
    else this.stats.palletsOut++
    f.task = null
    f.carrying = false
    f.state = 'idle'
    f.parked = false
  }

  // 작업 중 고장: 들고 있던 팔레트를 원위치로 되돌리고 라인을 재배정 대상으로 돌린다
  private abortTask(f: Forklift, t: number) {
    const task = f.task
    if (!task) return
    if (f.state === 'dropping' && f.midDone) {
      this.finishDrop(f)
      return
    }
    if (task.dir === 'out' && f.carrying) {
      const b = this.bays[task.bay]
      const prev = b.stock
      b.stock = Math.min(L.BAY_CAP, b.stock + 1)
      b.resOut++
      this.stockChanged(b, t, prev)
    }
    const ship = this.shipById.get(task.shipId)!
    ship.lines[task.line].flight--
    f.task = null
    f.carrying = false
  }

  private dispatch(t: number) {
    const Lg = this.layout
    for (const f of this.forklifts) {
      if ((f.state !== 'idle' && f.state !== 'toPark') || f.battery >= BATTERY_LOW) continue
      const used = new Set(this.forklifts.map((x) => x.chargerIdx).filter((x) => x != null))
      let ci: number | null = null
      let best = Infinity
      Lg.chargers.forEach((c, i) => {
        if (used.has(i)) return
        const d = Math.abs(c.x - f.mv.pose.x) + Math.abs(c.z - f.mv.pose.z)
        if (d < best) {
          best = d
          ci = i
        }
      })
      if (ci == null) continue
      this.releasePark(f)
      f.chargerIdx = ci
      f.state = 'toCharge'
      this.flGo(f, Lg.chargers[ci])
      this.log(t, 'info', `${f.id} 배터리 ${Math.round(f.battery)}% · 충전소 이동`, { kind: 'forklift', id: f.id })
    }
    const avail = this.forklifts.filter((f) => (f.state === 'idle' || f.state === 'toPark') && f.battery >= BATTERY_LOW)
    const docked = [...this.trucks.values()]
      .filter((tr) => tr.phase === 'docked' && tr.sealAt == null)
      .sort((a, b) => Number(this.shipOf(b).urgent) - Number(this.shipOf(a).urgent) || (this.shipOf(a).dockedAt ?? 0) - (this.shipOf(b).dockedAt ?? 0))
    for (const tr of docked) {
      if (!avail.length) break
      const ship = this.shipOf(tr)
      const dock = this.docks.find((d) => d.id === tr.dockId)!
      const max = 2
      let active = this.forklifts.filter((f) => f.task?.truckId === tr.id).length
      while (active < max && avail.length) {
        const li = ship.lines.findIndex((l) => l.qty - l.done - l.flight > 0)
        if (li < 0) break
        avail.sort((a, b) => Math.abs(a.mv.pose.x - dock.x) + Math.abs(a.mv.pose.z - L.DOCK_LOC_Z) - (Math.abs(b.mv.pose.x - dock.x) + Math.abs(b.mv.pose.z - L.DOCK_LOC_Z)))
        const f = avail.shift()!
        this.releasePark(f)
        const line = ship.lines[li]
        line.flight++
        const bay = this.bays[line.bay]
        const row = Lg.rows[bay.row]
        const used = new Set<number>()
        for (const x of this.forklifts) {
          if (x === f) continue
          if (x.task?.dockId === dock.id) used.add(x.task.lane)
          const p = x.mv.pose
          if (p.z > L.dockZoneZ0(Lg) - 0.3 && Math.abs(p.x - dock.x) < 1.9) used.add(p.x < dock.x ? -0.8 : 0.8)
        }
        const lane = [-0.8, 0.8].find((l) => !used.has(l))
        if (lane == null) {
          avail.unshift(f)
          line.flight--
          break
        }
        const dockLoc: L.Loc = { x: dock.x + lane, z: L.DOCK_LOC_Z, heading: 0 }
        const bayLoc: L.Loc = { x: bay.x, z: row.aisleZ, heading: row.facing }
        f.task = {
          truckId: tr.id,
          shipId: ship.id,
          dockId: dock.id,
          line: li,
          dir: ship.dir,
          bay: bay.idx,
          pick: ship.dir === 'in' ? dockLoc : bayLoc,
          drop: ship.dir === 'in' ? bayLoc : dockLoc,
          lane,
        }
        f.state = 'toPick'
        this.flGo(f, f.task.pick)
        active++
      }
    }
    // 남는 지게차는 대기 베이로: 앞쪽 양 끝 주차 칸, 모자라면 트럭 없는 도크의 지게차 열
    for (const f of this.forklifts) {
      if (f.state !== 'idle' || f.parked || f.parkKey != null) continue
      const spot = this.pickParking(f)
      if (!spot) continue
      f.parkKey = spot.key
      f.parkLoc = spot.loc
      f.state = 'toPark'
      this.flGo(f, spot.loc)
    }
  }

  private pickParking(f: Forklift, preferBay = false): { key: string; loc: L.Loc } | null {
    const Lg = this.layout
    const taken = new Set(this.forklifts.filter((x) => x !== f).map((x) => x.parkKey).filter((x) => x != null))
    const occupied = (loc: L.Loc) => this.forklifts.some((x) => x !== f && Math.abs(x.mv.pose.x - loc.x) < 1.3 && Math.abs(x.mv.pose.z - loc.z) < 2.5)
    const cands: { key: string; loc: L.Loc }[] = Lg.flPark.map((loc, i) => ({ key: `P${i}`, loc }))
    if (!preferBay)
      for (const d of this.docks) {
        if (d.truckId || d.maintUntil != null) continue
        for (const lane of [-0.8, 0.8]) cands.push({ key: `${d.id}:${lane}`, loc: { x: d.x + lane, z: L.DOCK_LOC_Z, heading: 0 } })
      }
    let best: { key: string; loc: L.Loc } | null = null
    let bd = Infinity
    for (const c of cands) {
      if (taken.has(c.key) || occupied(c.loc)) continue
      if (c.key.startsWith('D') && this.forklifts.some((x) => x.task && x.task.dockId === c.key.split(':')[0])) continue
      const d = Math.abs(c.loc.x - f.mv.pose.x) + Math.abs(c.loc.z - f.mv.pose.z) + (c.key.startsWith('P') ? 0 : 12)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    return best
  }

  // ───────── 작업자 ─────────
  private walkTo(w: Worker, to: Vec2, t: number, next: NonNullable<Worker['next']>, walkLabel: string) {
    const from = this.workerPose(w, t)
    w.pose = from
    const path = new Path(L.walkRoute(from, to, this.layout))
    w.distance += path.length
    w.plan = path.length > 0.3 ? motion(path, t, WALK_SPEED, false, 'linear') : null
    w.next = next
    w.visible = true
    w.activity = walkLabel
    w.place = next.place
    w.dockId = null
    if (!w.plan) this.arriveWorker(w, t)
  }
  private arriveWorker(w: Worker, t: number) {
    const n = w.next
    w.plan = null
    if (!n) return
    w.activity = n.activity
    w.place = n.place
    w.until = t + n.stay
    w.visible = n.visible
    w.dockId = n.dockId
    if (n.heading != null) w.pose = { ...w.pose, heading: n.heading }
    w.next = null
  }

  private stepWorkers(t: number) {
    const Lg = this.layout
    const checkers = this.workers.filter((w) => w.role === 'checker')
    for (const w of this.workers) {
      if (w.plan) {
        if (t < motionEnd(w.plan)) continue
        w.pose = poseOn(w.plan, motionEnd(w.plan), w.pose.heading)
        this.arriveWorker(w, t)
      }
      const breakEnd = w.role === 'guard' ? null : breakFor(t, w.breakSlot)
      if (breakEnd != null && w.activity !== '휴게 중' && !w.next?.activity.startsWith('휴게')) {
        this.walkTo(w, { x: Lg.officeDoor.x + this.rng.range(-0.6, 0.6), z: Lg.officeDoor.z + this.rng.range(-0.6, 0.6) }, t, { activity: '휴게 중', place: '사무동 휴게실', stay: breakEnd - t, visible: false, heading: null, dockId: null }, '휴게실로 이동')
        continue
      }
      if (w.role === 'checker' && w.dockId && t < w.until) {
        const d = this.docks.find((x) => x.id === w.dockId)
        if (!d || this.dockState(d) !== 'occupied') w.until = t
      }
      if (t < w.until) continue
      this.decideWorker(w, t, checkers)
    }
  }

  private decideWorker(w: Worker, t: number, checkers: Worker[]) {
    const Lg = this.layout
    const r = this.rng
    switch (w.role) {
      case 'checker': {
        const k = checkers.indexOf(w)
        const mine = this.docks.filter((d) => d.idx % checkers.length === k)
        const busy = mine.find((d) => this.dockState(d) === 'occupied' && !this.workers.some((o) => o !== w && o.dockId === d.id && o.role === 'checker'))
        if (busy) {
          this.walkTo(w, { x: busy.x + 2.3, z: 9.8 }, t, { activity: `검수 중 · ${busy.id}`, place: `${busy.id} 도크`, stay: 1e9, visible: true, heading: 0, dockId: busy.id }, `${busy.id}로 이동`)
        } else {
          const d = r.pick(mine.length ? mine : this.docks)
          this.walkTo(w, { x: d.x + r.range(-1.5, 1.5), z: r.range(Lg.corridorZ + 2, 8) }, t, { activity: '입차 대기', place: `${d.id} 인근`, stay: r.range(40, 100), visible: true, heading: 0, dockId: null }, '이동 중')
        }
        break
      }
      case 'picker': {
        w.alt = !w.alt
        if (w.alt) {
          const b = r.pick(this.bays)
          const row = Lg.rows[b.row]
          const z = row.aisleZ + (row.z > row.aisleZ ? 1.0 : -1.0)
          this.walkTo(w, { x: b.x + r.range(-0.8, 0.8), z }, t, { activity: `피킹 · ${b.code}`, place: `${row.letter}열 통로`, stay: r.range(80, 180), visible: true, heading: row.z > row.aisleZ ? 0 : Math.PI, dockId: null }, `${b.code}로 이동`)
        } else {
          const d = r.pick(this.docks)
          this.walkTo(w, { x: d.x + r.range(-1.4, 1.4), z: r.range(9.2, 12.2) }, t, { activity: '출고 분류·랩핑', place: `${d.id} 스테이징`, stay: r.range(60, 140), visible: true, heading: r.range(-3, 3), dockId: null }, '스테이징으로 이동')
        }
        break
      }
      case 'lead': {
        const roll = r.next()
        if (roll < 0.18) {
          this.walkTo(w, Lg.officeDoor, t, { activity: '운영 회의', place: '사무동', stay: r.range(600, 1300), visible: false, heading: null, dockId: null }, '사무동으로 이동')
        } else {
          const d = r.pick(this.docks)
          this.walkTo(w, { x: d.x + r.range(-2, 2), z: r.range(6, 8.5) }, t, { activity: '현장 순회', place: `${d.id} 앞`, stay: r.range(40, 90), visible: true, heading: 0, dockId: null }, '현장 순회')
        }
        break
      }
      case 'office': {
        const inside = !w.visible
        if (inside && r.chance(0.3)) {
          const d = r.pick(this.docks.slice(0, Math.ceil(this.docks.length / 2)))
          this.walkTo(w, { x: d.x + r.range(-1, 1), z: 7.5 }, t, { activity: `서류 전달 · ${d.id}`, place: `${d.id} 앞`, stay: r.range(50, 110), visible: true, heading: 0, dockId: null }, '현장으로 이동')
        } else {
          this.walkTo(w, Lg.officeDoor, t, { activity: '사무 업무', place: '사무동', stay: r.range(900, 2400), visible: false, heading: null, dockId: null }, '사무동으로 복귀')
        }
        break
      }
      case 'guard': {
        const g = Lg.guardPost
        if (r.chance(0.3)) {
          this.walkTo(w, { x: Lg.gateX + 1.5, z: L.LANE_IN - 2.4 }, t, { activity: '차량 확인', place: '정문 차단기', stay: r.range(30, 70), visible: true, heading: 0, dockId: null }, '차단기로 이동')
        } else {
          this.walkTo(w, { x: g.x + r.range(-0.6, 0.6), z: g.z + 1.9 }, t, { activity: '출입 관리', place: '정문 경비실', stay: r.range(240, 600), visible: true, heading: Math.PI / 2, dockId: null }, '경비실로 이동')
        }
        break
      }
    }
  }

  // ───────── 메인 스텝 ─────────
  step(t: number) {
    this.elapsed++
    this.plan(t)

    if (t % 5 === 0)
    for (const s of this.shipments) {
      if (s.status === 'planned' && t >= s.etaKnownAt) {
        s.status = 'enroute'
        if (s.eta > s.winEnd + 300) {
          this.log(t, 'warn', `${s.id} 도착 지연 예상 +${Math.round((s.eta - s.winEnd) / 60)}분 · ${s.carrier}`, { kind: 'shipment', id: s.id })
        }
      }
    }

    for (const tr of this.trucks.values()) {
      if (tr.phase === 'enroute') {
        if (t >= tr.spawnAt) {
          const sx = this.layout.spawnX
          const busy = [...this.trucks.values()].some((o) => o !== tr && o.phase !== 'enroute' && o.phase !== 'gone' && Math.abs(o.mv.pose.z - L.LANE_IN) < 3 && o.mv.pose.x > sx - 26)
          if (busy) tr.spawnAt = t + 3
          else this.spawn(tr, t)
        }
        continue
      }
      if (tr.phase === 'docked') {
        const ship = this.shipOf(tr)
        if (tr.sealAt == null && tr.moved >= ship.pallets) tr.sealAt = t + SEAL_T
        if (tr.brokenUntil != null && t >= tr.brokenUntil) {
          tr.brokenUntil = null
          this.log(t, 'info', `${tr.plate} 긴급 정비 완료 · 출차 가능`, { kind: 'truck', id: tr.id })
        }
        if (tr.sealAt != null && t >= tr.sealAt && tr.brokenUntil == null) this.depart(tr, t)
      }
    }

    this.stepTrucks(t)
    this.assignDocks(t)
    this.stepForklifts(t)
    if ((t & 1) === 1) this.dispatch(t)
    if ((t & 1) === 0) this.stepWorkers(t)
    if ((t & 1) === 0) this.recordHeat(t)

    if (t >= this.nextMaint) {
      this.nextMaint = t + this.rng.range(2.5, 5) * 3600
      const d = this.rng.pick(this.docks)
      if (d.maintUntil == null && !d.maintPending) {
        if (!d.truckId) this.startMaint(d, t, this.rng.range(40, 80) * 60)
        else d.maintPending = true
      }
    }
    for (const d of this.docks) {
      if (d.maintUntil != null && t >= d.maintUntil) {
        d.maintUntil = null
        this.log(t, 'info', `${d.id} 점검 완료 · 운영 재개`, { kind: 'dock', id: d.id })
      }
      if (d.truckId && this.trucks.get(d.truckId)?.phase === 'docked') d.busySec++
    }

    const waiting = this.lanes.reduce((s, q) => s + q.length, 0) + this.roadWait.length
    if (waiting >= 8 && !this.queueAlert) {
      this.queueAlert = true
      this.log(t, 'warn', `트럭 대기장 ${waiting}대 · 도크 배정 지연`, { kind: 'facility', id: 'lot' })
    } else if (waiting <= 4) this.queueAlert = false

    if (t % 600 === 0) this.prune(t)
  }

  // 실제 값 = heat[i] * heatScale. 감쇠는 스케일만 줄여 O(1)로 처리
  private recordHeat(_t: number) {
    const G = this.layout.heat
    const decay = 0.99981 // 반감기 약 2시간
    const h = this.heat
    this.heatScale *= decay
    this.heatMax *= decay
    if (this.heatScale < 1e-6) {
      for (let i = 0; i < h.length; i++) h[i] *= this.heatScale
      this.heatScale = 1
    }
    const inv = 1 / this.heatScale
    for (const f of this.forklifts) {
      if (f.mv.v <= 0) continue
      const p = f.mv.pose
      const cx = Math.floor((p.x - G.x0) / G.cell)
      const cz = Math.floor((p.z - G.z0) / G.cell)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx
          const z = cz + dz
          if (x < 0 || z < 0 || x >= G.w || z >= G.h) continue
          const w = dx === 0 && dz === 0 ? 1 : dx === 0 || dz === 0 ? 0.5 : 0.25
          const i = z * G.w + x
          h[i] += w * inv
          const eff = h[i] * this.heatScale
          if (eff > this.heatMax) this.heatMax = eff
        }
    }
    this.heatVersion++
  }

  // ───────── 이벤트 시나리오 ─────────
  triggerScenario(kind: ScenarioKind, t: number): ScenarioResult {
    switch (kind) {
      case 'urgent': {
        const ws = Math.floor(t / 60) * 60
        const s = this.createShipment('out', ws, { eta: t + 240, urgent: true, due: t + 55 * 60 })
        if (!s) return { ok: false, text: '출고할 재고가 부족해 긴급 출고를 만들지 못했습니다.', ref: null }
        s.etaKnownAt = t
        s.status = 'enroute'
        this.log(t, 'crit', `긴급 출고 ${s.id} 접수 · ${s.pallets} PLT → ${s.partner} · 마감 ${Math.round((s.due - t) / 60)}분`, { kind: 'shipment', id: s.id })
        return { ok: true, text: `긴급 출고 ${s.id} 접수 — 도크·지게차 우선 배정`, ref: { kind: 'shipment', id: s.id } }
      }
      case 'surge': {
        const ws = Math.floor(t / SLOT) * SLOT
        const made: Shipment[] = []
        for (let i = 0; i < 6; i++) {
          const s = this.createShipment('in', ws, { eta: t + 200 + i * 40 })
          if (s) {
            s.etaKnownAt = t
            s.status = 'enroute'
            made.push(s)
          }
        }
        if (!made.length) return { ok: false, text: '랙에 빈 공간이 없어 입고를 만들지 못했습니다.', ref: null }
        this.log(t, 'warn', `입고 트럭 ${made.length}대 동시 도착 예정 · 예약 외 물량`, { kind: 'facility', id: 'lot' })
        return { ok: true, text: `예약 외 입고 트럭 ${made.length}대가 몰려옵니다`, ref: { kind: 'facility', id: 'gate' } }
      }
      case 'forkliftDown': {
        const busy = this.forklifts.filter((f) => f.state !== 'down' && f.task)
        const pool = busy.length ? busy : this.forklifts.filter((f) => f.state !== 'down')
        if (!pool.length) return { ok: false, text: '정지시킬 지게차가 없습니다.', ref: null }
        const f = this.rng.pick(pool)
        this.abortTask(f, t)
        f.chargerIdx = null
        this.releasePark(f)
        // 비상 정지 후 가장 가까운 정비(주차) 위치로 서행 이동
        const spot = this.pickParking(f, true) ?? this.pickParking(f)
        if (spot) {
          f.parkKey = spot.key
          f.parkLoc = spot.loc
          this.flGo(f, spot.loc)
          for (const l of f.mv.legs) l.vmax = Math.min(l.vmax, 0.3)
        }
        f.state = 'down'
        const dur = this.rng.range(35, 50) * 60
        f.downUntil = t + dur
        this.log(t, 'crit', `${f.id} 유압 계통 이상 · 작업 중단 (정비 약 ${Math.round(dur / 60)}분)`, { kind: 'forklift', id: f.id })
        return { ok: true, text: `${f.id} 고장 — 맡던 팔레트는 다른 지게차로 재배정`, ref: { kind: 'forklift', id: f.id } }
      }
      case 'truckDown': {
        const cands = [...this.trucks.values()].filter((tr) => tr.phase === 'docked' && tr.brokenUntil == null)
        if (!cands.length) return { ok: false, text: '도크에 붙어 있는 차량이 없습니다.', ref: null }
        const tr = this.rng.pick(cands)
        const dur = this.rng.range(30, 45) * 60
        tr.brokenUntil = t + dur
        this.log(t, 'crit', `${tr.plate} 시동 불능 · ${tr.dockId} 점유 연장 (약 ${Math.round(dur / 60)}분)`, { kind: 'truck', id: tr.id })
        return { ok: true, text: `${tr.plate} 고장 — ${tr.dockId} 도크가 묶입니다`, ref: { kind: 'truck', id: tr.id } }
      }
    }
  }

  private prune(t: number) {
    for (const [id, tr] of this.trucks) {
      if (tr.phase === 'gone' && (tr.departAt ?? 0) < t - 600) this.trucks.delete(id)
    }
    const keep = t - 10 * 3600
    if (this.shipments.length && this.shipments[0].winEnd < keep) {
      this.shipments = this.shipments.filter((s) => s.status !== 'done' || (s.doneAt ?? 0) >= keep)
      this.shipById = new Map(this.shipments.map((s) => [s.id, s]))
    }
  }

  // 검증용: 서로 겹친 차체 쌍 수 (도크에 붙은 트럭끼리는 물리적으로 떨어져 있으므로 포함해도 0이어야 한다)
  overlaps(): { trucks: number; forklifts: number; pairs: string[] } {
    const pairs: string[] = []
    const tr = [...this.trucks.values()].filter((x) => x.phase !== 'enroute' && x.phase !== 'gone')
    let a = 0
    for (let i = 0; i < tr.length; i++)
      for (let j = i + 1; j < tr.length; j++) {
        const A = obbAt(tr[i].mv, tr[i].mv.pose)
        const B = obbAt(tr[j].mv, tr[j].mv.pose)
        if (Math.abs(A.cx - B.cx) > 20 || Math.abs(A.cz - B.cz) > 20) continue
        if (obbOverlap({ ...A, hl: A.hl - 0.05, hw: A.hw - 0.05 }, { ...B, hl: B.hl - 0.05, hw: B.hw - 0.05 })) {
          a++
          if (pairs.length < 6) pairs.push(`${tr[i].id}(${tr[i].phase})×${tr[j].id}(${tr[j].phase})`)
        }
      }
    let b = 0
    const fl = this.forklifts
    for (let i = 0; i < fl.length; i++)
      for (let j = i + 1; j < fl.length; j++) {
        const A = obbAt(fl[i].mv, fl[i].mv.pose)
        const B = obbAt(fl[j].mv, fl[j].mv.pose)
        if (Math.abs(A.cx - B.cx) > 6 || Math.abs(A.cz - B.cz) > 6) continue
        if (obbOverlap({ ...A, hl: A.hl - 0.05, hw: A.hw - 0.05 }, { ...B, hl: B.hl - 0.05, hw: B.hw - 0.05 })) {
          b++
          if (pairs.length < 12) pairs.push(`${fl[i].id}(${fl[i].state})×${fl[j].id}(${fl[j].state})`)
        }
      }
    return { trucks: a, forklifts: b, pairs }
  }

  // ───────── KPI ─────────
  kpis(t: number) {
    const opDocks = this.docks.filter((d) => d.maintUntil == null)
    const occupied = this.docks.filter((d) => this.dockState(d) === 'occupied').length
    const yard = this.yardTrucks()
    const waits = yard.map((tr) => this.dwellSoFar(tr, t))
    const out = this.bays.filter((b) => b.stock <= 0).length
    const low = this.bays.filter((b) => b.stock > 0 && b.stock <= LOW_STOCK).length
    const totalStock = this.bays.reduce((s, b) => s + b.stock, 0)
    const active = this.forklifts.filter((f) => f.state !== 'idle' && f.state !== 'toPark' && f.state !== 'charging' && f.state !== 'toCharge' && f.state !== 'down').length
    const down = this.forklifts.filter((f) => f.state === 'down').length
    const onBreak = this.workers.filter((w) => w.activity === '휴게 중').length
    const onFloor = this.workers.filter((w) => w.visible).length
    const hk = Math.floor(t / 3600)
    const hourly: { hour: number; pct: number | null; n: number }[] = []
    for (let h = hk - 7; h <= hk; h++) {
      const v = this.stats.hourly.get(h)
      hourly.push({ hour: h, pct: v && v.n ? (v.ok / v.n) * 100 : null, n: v?.n ?? 0 })
    }
    return {
      onTimePct: this.stats.done ? (this.stats.onTime / this.stats.done) * 100 : 100,
      done: this.stats.done,
      onTime: this.stats.onTime,
      hourly,
      occupied,
      opDocks: opDocks.length,
      totalDocks: this.docks.length,
      utilization: this.elapsed ? (this.docks.reduce((s, d) => s + d.busySec, 0) / (this.docks.length * this.elapsed)) * 100 : 0,
      yardCount: yard.length,
      yardCap: this.layout.holding.laneZ.length * this.layout.holding.perLane,
      avgWaitMin: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length / 60 : 0,
      avgDwellMin: this.stats.dwellN ? this.stats.dwellSum / this.stats.dwellN / 60 : 0,
      palletsIn: this.stats.palletsIn,
      palletsOut: this.stats.palletsOut,
      out,
      low,
      fillPct: (totalStock / (this.bays.length * L.BAY_CAP)) * 100,
      flActive: active,
      flDown: down,
      flTotal: this.forklifts.length,
      avgBattery: this.forklifts.reduce((s, f) => s + f.battery, 0) / this.forklifts.length,
      crew: this.workers.length,
      onFloor,
      onBreak,
    }
  }
}

export type Kpis = ReturnType<Site['kpis']>

// ───────── 월드 ─────────
export class World {
  sites: Site[]
  time: number
  stepTime: number
  speed = 20
  readonly day0: Date

  constructor(now = new Date(), warmupHours = 5) {
    this.day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const nowSec = Math.floor((now.getTime() - this.day0.getTime()) / 1000)
    const t0 = nowSec - warmupHours * 3600
    this.sites = SITE_CONFIGS.map((c) => new Site(c, t0))
    this.time = t0
    this.stepTime = t0
    this.runTo(nowSec)
  }

  runTo(target: number, maxSteps = Infinity) {
    let n = 0
    while (this.stepTime + 1 <= target && n < maxSteps) {
      this.stepTime += 1
      for (const s of this.sites) s.step(this.stepTime)
      n++
    }
    this.time = Math.min(target, this.stepTime + 0.999)
  }

  advance(realDt: number) {
    if (!this.speed) return
    const dt = Math.min(realDt, 0.25) * this.speed
    this.runTo(this.time + dt, 4000)
  }

  site(id: string): Site {
    return this.sites.find((s) => s.cfg.id === id) ?? this.sites[0]
  }
}
