// 물류 캠퍼스 운영 시뮬레이션 — 1초(시뮬레이션) 고정 스텝, 사이트별 독립 상태
import { Rng } from './rng'
import { Path, motion, motionEnd, poseOn, posePlan, rounded, type Motion, type Pose, type Vec2 } from './path'
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
    layout: { sections: 4, rows: 12, docks: 20, chargers: 6 },
    forklifts: 30,
    inPerHr: 8,
    outPerHr: 10,
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
    layout: { sections: 2, rows: 8, docks: 10, chargers: 4 },
    forklifts: 12,
    inPerHr: 5,
    outPerHr: 6,
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
    layout: { sections: 3, rows: 10, docks: 14, chargers: 6 },
    forklifts: 18,
    inPerHr: 5,
    outPerHr: 6.5,
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
  plan: Motion[]
  pose: Pose
  dockId: string | null
  spawnAt: number
  lane: number
  slot: number
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

export type FlState = 'idle' | 'toPick' | 'picking' | 'toDrop' | 'dropping' | 'toCharge' | 'charging' | 'down'
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
  plan: Motion | null
  pose: Pose
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
        plan: null,
        pose: { x, z: Lg.corridorZ + 2.2, heading: Math.PI },
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
  truckPose(tr: Truck, t: number): Pose {
    return posePlan(tr.plan, t, tr.pose)
  }
  forkliftPose(f: Forklift, t: number): Pose {
    return f.plan ? poseOn(f.plan, t, f.pose.heading) : f.pose
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
    return this.lanes.flat().map((id) => this.trucks.get(id)!)
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
    const approach = ((Lg.spawnX - Lg.holding.eastX) / TRUCK_SPEED) * 1.3 + 2
    const truck: Truck = {
      id: truckId,
      plate: `${this.rng.pick(PLATE_REGIONS)}${this.rng.int(80, 99)}${this.rng.pick(PLATE_CHARS)}${this.rng.int(1000, 9999)}`,
      model: modelId,
      shipmentId: id,
      phase: 'enroute',
      plan: [],
      pose: { x: Lg.spawnX, z: L.LANE_IN, heading: -Math.PI / 2 },
      dockId: null,
      spawnAt: eta - approach,
      lane: -1,
      slot: -1,
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
  private spawn(tr: Truck, t: number) {
    const Lg = this.layout
    const H = Lg.holding
    let lane = 0
    for (let i = 1; i < this.lanes.length; i++) if (this.lanes[i].length < this.lanes[lane].length) lane = i
    tr.phase = 'arriving'
    tr.lane = lane
    tr.slot = this.lanes[lane].length
    this.lanes[lane].push(tr.id)
    const target = L.holdingSlot(Lg, lane, tr.slot)
    const start = { x: Lg.spawnX, z: L.LANE_IN }
    tr.pose = { ...start, heading: -Math.PI / 2 }
    const lz = H.laneZ[lane]
    const pts = [start, { x: H.entryX, z: L.LANE_IN }, { x: H.eastX + 6, z: lz }]
    if (target.x < H.eastX + 6) pts.push(target)
    tr.plan = [motion(new Path(rounded(pts, 9)), t, TRUCK_SPEED)]
    this.gate(t, tr, 'in')
  }

  private retargetLane(lane: number, t: number) {
    this.lanes[lane].forEach((id, i) => {
      const tr = this.trucks.get(id)!
      if (tr.phase !== 'queued' || tr.slot === i) return
      tr.slot = i
      const p = this.truckPose(tr, t)
      tr.pose = p
      tr.plan = [motion(new Path([p, L.holdingSlot(this.layout, lane, i)]), t, TRUCK_SPEED)]
    })
  }

  private onTruckPlanDone(tr: Truck, t: number) {
    const ship = this.shipOf(tr)
    switch (tr.phase) {
      case 'arriving': {
        tr.phase = 'queued'
        if (ship.arrivedAt == null) {
          ship.arrivedAt = t
          ship.status = 'yard'
          if (ship.dir === 'in') ship.onTime = t <= ship.due
          if (t > ship.winEnd) {
            const late = Math.round((t - ship.winEnd) / 60)
            this.log(t, 'warn', `${ship.id} 슬롯 초과 도착 +${late}분 · ${ship.carrier}`, { kind: 'truck', id: tr.id })
          }
        }
        this.retargetLane(tr.lane, t)
        break
      }
      case 'docking': {
        tr.phase = 'docked'
        ship.dockedAt = t
        ship.status = 'docked'
        if (ship.arrivedAt != null) {
          this.stats.dwellSum += t - ship.arrivedAt
          this.stats.dwellN++
        }
        break
      }
      case 'departing':
        tr.phase = 'gone'
        this.gate(t, tr, 'out')
        break
      default:
        break
    }
  }

  private assignDocks(t: number) {
    const Lg = this.layout
    for (let guard = 0; guard < 6; guard++) {
      const free = this.docks.filter((d) => !d.truckId && d.maintUntil == null && !d.maintPending)
      if (!free.length) return
      const heads = this.lanes
        .map((q, lane) => ({ lane, tr: q.length ? this.trucks.get(q[0])! : null }))
        .filter((h): h is { lane: number; tr: Truck } => !!h.tr && h.tr.phase === 'queued' && !h.tr.plan.length)
      if (!heads.length) return
      heads.sort((a, b) => Number(this.shipOf(b.tr).urgent) - Number(this.shipOf(a.tr).urgent) || (this.shipOf(a.tr).arrivedAt ?? 0) - (this.shipOf(b.tr).arrivedAt ?? 0))
      const { lane, tr } = heads[0]
      free.sort((a, b) => a.turns - b.turns || b.x - a.x)
      const dock = free[0]
      this.lanes[lane].shift()
      dock.truckId = tr.id
      tr.dockId = dock.id
      tr.slot = -1
      const ship = this.shipOf(tr)
      ship.dockId = dock.id
      tr.phase = 'docking'
      const p0 = this.truckPose(tr, t)
      const a = { x: dock.x - 13, z: L.LANE_IN }
      const out = rounded([p0, { x: p0.x - 9, z: p0.z }, { x: Lg.holding.x0 - 30, z: L.LANE_IN }, a], 8)
      const m1 = motion(new Path(out), t, TRUCK_SPEED)
      const curve = new Path(
        [a, { x: dock.x - 6.6, z: L.LANE_IN - 1.1 }, { x: dock.x - 1.7, z: L.LANE_IN - 4.6 }, { x: dock.x, z: L.LANE_IN - 9.5 }, { x: dock.x, z: L.DOCKED_Z + 2.5 }, { x: dock.x, z: L.DOCKED_Z }],
        true,
      )
      const m2 = motion(curve, motionEnd(m1) + 5, TRUCK_REVERSE, true)
      tr.plan = [m1, m2]
      this.retargetLane(lane, t)
    }
  }

  private depart(tr: Truck, t: number) {
    const Lg = this.layout
    const ship = this.shipOf(tr)
    const dock = this.docks.find((d) => d.id === tr.dockId)!
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
    const curve = new Path(
      [
        { x: dock.x, z: L.DOCKED_Z },
        { x: dock.x, z: L.DOCKED_Z + 5 },
        { x: dock.x, z: 23 },
        { x: dock.x - 2.6, z: 29.5 },
        { x: dock.x - 8.5, z: 34.6 },
        { x: dock.x - 17, z: L.LANE_OUT },
      ],
      true,
    )
    tr.plan = [motion(Path.join(curve, [{ x: Lg.exitX, z: L.LANE_OUT }]), t + 4, TRUCK_SPEED)]
    if (dock.maintPending) {
      dock.maintPending = false
      this.startMaint(dock, t, this.rng.range(40, 80) * 60)
    }
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
  private flMotion(f: Forklift, to: L.Loc, t: number): Motion {
    const path = new Path(L.route(f.pose, to, this.layout))
    f.distance += path.length
    f.battery = Math.max(0, f.battery - path.length * 0.0075)
    return motion(path, t, FL_SPEED)
  }
  private arriveAt(f: Forklift, loc: L.Loc) {
    f.pose = { x: loc.x, z: loc.z, heading: loc.heading }
    f.plan = null
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

  private stepForklifts(t: number) {
    for (const f of this.forklifts) {
      const planDone = !f.plan || t >= motionEnd(f.plan)
      switch (f.state) {
        case 'idle':
          f.battery = Math.max(0, f.battery - 0.0012)
          break
        case 'toPick':
          if (planDone) {
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
            f.plan = this.flMotion(f, f.task!.drop, t)
          }
          break
        case 'toDrop':
          if (planDone) {
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
          if (planDone) {
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
      if (f.state !== 'idle' || f.battery >= BATTERY_LOW) continue
      const used = new Set(this.forklifts.map((x) => x.chargerIdx).filter((x) => x != null))
      let ci: number | null = null
      let best = Infinity
      Lg.chargers.forEach((c, i) => {
        if (used.has(i)) return
        const d = Math.abs(c.x - f.pose.x) + Math.abs(c.z - f.pose.z)
        if (d < best) {
          best = d
          ci = i
        }
      })
      if (ci == null) continue
      f.chargerIdx = ci
      f.state = 'toCharge'
      f.plan = this.flMotion(f, Lg.chargers[ci], t)
      this.log(t, 'info', `${f.id} 배터리 ${Math.round(f.battery)}% · 충전소 이동`, { kind: 'forklift', id: f.id })
    }
    const avail = this.forklifts.filter((f) => f.state === 'idle' && f.battery >= BATTERY_LOW)
    if (!avail.length) return
    const docked = [...this.trucks.values()]
      .filter((tr) => tr.phase === 'docked' && tr.sealAt == null)
      .sort((a, b) => Number(this.shipOf(b).urgent) - Number(this.shipOf(a).urgent) || (this.shipOf(a).dockedAt ?? 0) - (this.shipOf(b).dockedAt ?? 0))
    for (const tr of docked) {
      if (!avail.length) break
      const ship = this.shipOf(tr)
      const dock = this.docks.find((d) => d.id === tr.dockId)!
      const max = ship.urgent ? 4 : ship.pallets >= 16 ? 3 : 2
      let active = this.forklifts.filter((f) => f.task?.truckId === tr.id).length
      while (active < max && avail.length) {
        const li = ship.lines.findIndex((l) => l.qty - l.done - l.flight > 0)
        if (li < 0) break
        avail.sort((a, b) => Math.abs(a.pose.x - dock.x) + Math.abs(a.pose.z - L.DOCK_LOC_Z) - (Math.abs(b.pose.x - dock.x) + Math.abs(b.pose.z - L.DOCK_LOC_Z)))
        const f = avail.shift()!
        const line = ship.lines[li]
        line.flight++
        const bay = this.bays[line.bay]
        const row = Lg.rows[bay.row]
        const used = new Set(this.forklifts.filter((x) => x.task?.truckId === tr.id).map((x) => x.task!.lane))
        const lane = [0, -1.15, 1.15, 0.6].find((l) => !used.has(l)) ?? 0
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
        f.plan = this.flMotion(f, f.task.pick, t)
        active++
      }
    }
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
        if (t >= tr.spawnAt) this.spawn(tr, t)
        continue
      }
      if (tr.plan.length && t >= motionEnd(tr.plan[tr.plan.length - 1])) {
        tr.pose = this.truckPose(tr, t)
        tr.plan = []
        this.onTruckPlanDone(tr, t)
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

    const waiting = this.lanes.reduce((s, q) => s + q.length, 0)
    if (waiting >= 8 && !this.queueAlert) {
      this.queueAlert = true
      this.log(t, 'warn', `트럭 대기장 ${waiting}대 · 도크 배정 지연`, { kind: 'facility', id: 'lot' })
    } else if (waiting <= 4) this.queueAlert = false

    if (t % 600 === 0) this.prune(t)
  }

  // 실제 값 = heat[i] * heatScale. 감쇠는 스케일만 줄여 O(1)로 처리
  private recordHeat(t: number) {
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
      if (!f.plan || t >= motionEnd(f.plan)) continue
      const p = poseOn(f.plan, t, f.pose.heading)
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
        f.pose = this.forkliftPose(f, t)
        this.abortTask(f, t)
        f.plan = null
        f.chargerIdx = null
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

  // ───────── KPI ─────────
  kpis(t: number) {
    const opDocks = this.docks.filter((d) => d.maintUntil == null)
    const occupied = this.docks.filter((d) => this.dockState(d) === 'occupied').length
    const yard = this.yardTrucks()
    const waits = yard.map((tr) => this.dwellSoFar(tr, t))
    const out = this.bays.filter((b) => b.stock <= 0).length
    const low = this.bays.filter((b) => b.stock > 0 && b.stock <= LOW_STOCK).length
    const totalStock = this.bays.reduce((s, b) => s + b.stock, 0)
    const active = this.forklifts.filter((f) => f.state !== 'idle' && f.state !== 'charging' && f.state !== 'toCharge' && f.state !== 'down').length
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
