// 시공간 예약표 — 바닥을 격자로 나누고, 차량마다 각 칸을 쓰는 시간 구간을 예약한다.
// 운행을 시작하기 전에 운행 전체(외곽 + 여유)가 지나갈 칸·시간이 다른 차의 예약과 겹치지 않는
// 가장 이른 출발 시각을 찾는다. 기다림은 언제나 정차 자리에서 일어나므로 통로 위 교착이 생기지 않는다.
import type { Pose } from './path'

export interface TripCells {
  cells: Int32Array // 칸 번호
  a: Float64Array // 칸을 처음 쓰는 상대 시각
  b: Float64Array // 마지막으로 쓰는 상대 시각
  endCells: number[] // 도착 뒤 계속 머무는 칸
  dur: number // 운행 시간 (도착 상대 시각)
}

// 칸마다 [시작, 끝, 소유 차량 번호]를 이어 붙인 숫자 배열
type Ivs = number[]

export class Reserve {
  readonly g: number
  readonly x0: number
  readonly z0: number
  readonly nx: number
  readonly nz: number
  private cells: (Ivs | undefined)[]
  // 운행 칸 계산용 임시 배열
  private tmin: Float64Array
  private tmax: Float64Array
  private touched: number[] = []
  private open = new Map<number, number[]>() // 차량별 머무는 예약이 있는 칸
  readonly tau: number
  version = 0 // 예약이 바뀔 때마다 증가 (실패한 예약은 바뀐 뒤에만 다시 시도)

  constructor(x0: number, z0: number, x1: number, z1: number, g = 0.5, tau = 2) {
    this.g = g
    this.x0 = x0
    this.z0 = z0
    this.nx = Math.ceil((x1 - x0) / g)
    this.nz = Math.ceil((z1 - z0) / g)
    this.cells = new Array(this.nx * this.nz)
    this.tmin = new Float64Array(this.nx * this.nz).fill(Infinity)
    this.tmax = new Float64Array(this.nx * this.nz).fill(-Infinity)
    this.tau = tau
  }

  private px = new Float64Array(4)
  private pz = new Float64Array(4)
  // 회전 사각형(중심 cx,cz, 전방 ux,uz, 반길이 hl, 반폭 hw)이 덮는 칸에 시각 t를 기록한다 (행 단위 스캔라인)
  private stamp(cx: number, cz: number, ux: number, uz: number, hl: number, hw: number, t: number) {
    const rx = -uz
    const rz = ux
    const px = this.px
    const pz = this.pz
    px[0] = cx + ux * hl + rx * hw
    px[1] = cx + ux * hl - rx * hw
    px[2] = cx - ux * hl - rx * hw
    px[3] = cx - ux * hl + rx * hw
    pz[0] = cz + uz * hl + rz * hw
    pz[1] = cz + uz * hl - rz * hw
    pz[2] = cz - uz * hl - rz * hw
    pz[3] = cz - uz * hl + rz * hw
    const zmin = Math.min(pz[0], pz[1], pz[2], pz[3])
    const zmax = Math.max(pz[0], pz[1], pz[2], pz[3])
    const g = this.g
    const r0 = Math.max(0, Math.floor((zmin - this.z0) / g))
    const r1 = Math.min(this.nz - 1, Math.floor((zmax - this.z0) / g))
    for (let r = r0; r <= r1; r++) {
      const za = this.z0 + r * g
      const zb = za + g
      let xl = Infinity
      let xh = -Infinity
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) & 3
        const ax = px[i]
        const az = pz[i]
        const bx = px[j]
        const bz = pz[j]
        if (az >= za && az <= zb) {
          if (ax < xl) xl = ax
          if (ax > xh) xh = ax
        }
        // 변이 행 경계와 만나는 점
        if ((az - za) * (bz - za) < 0) {
          const x = ax + ((bx - ax) * (za - az)) / (bz - az)
          if (x < xl) xl = x
          if (x > xh) xh = x
        }
        if ((az - zb) * (bz - zb) < 0) {
          const x = ax + ((bx - ax) * (zb - az)) / (bz - az)
          if (x < xl) xl = x
          if (x > xh) xh = x
        }
      }
      if (xl > xh) continue
      const c0 = Math.max(0, Math.floor((xl - this.x0) / g))
      const c1 = Math.min(this.nx - 1, Math.floor((xh - this.x0) / g))
      const base = r * this.nx
      for (let c = c0; c <= c1; c++) {
        const k = base + c
        if (this.tmin[k] === Infinity) this.touched.push(k)
        if (t < this.tmin[k]) this.tmin[k] = t
        if (t > this.tmax[k]) this.tmax[k] = t
      }
    }
  }

  // 1초 간격 자세 목록(0 = 출발 시각) → 운행이 쓰는 칸과 상대 시간. off = 기준점 → 외곽 중심(전방 +)
  trip(poses: Pose[], hl: number, hw: number, pad: number, sub = 1, off = 0): TripCells {
    const H = hl + pad
    const W = hw + pad
    if (off) poses = poses.map((p) => ({ x: p.x + Math.sin(p.heading) * off, z: p.z + Math.cos(p.heading) * off, heading: p.heading }))
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]
      const q = poses[i + 1]
      const n = q ? sub : 1
      for (let k = 0; k < n; k++) {
        const f = k / sub
        const x = q ? p.x + (q.x - p.x) * f : p.x
        const z = q ? p.z + (q.z - p.z) * f : p.z
        let dh = q ? q.heading - p.heading : 0
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        const h = p.heading + dh * f
        this.stamp(x, z, Math.sin(h), Math.cos(h), H, W, i + f)
      }
    }
    const n = this.touched.length
    const cells = new Int32Array(n)
    const a = new Float64Array(n)
    const b = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const k = this.touched[i]
      cells[i] = k
      a[i] = this.tmin[k]
      b[i] = this.tmax[k]
      this.tmin[k] = Infinity
      this.tmax[k] = -Infinity
    }
    this.touched.length = 0
    const last = poses[poses.length - 1]
    this.stamp(last.x, last.z, Math.sin(last.heading), Math.cos(last.heading), H, W, 0)
    const endCells = [...this.touched]
    for (const k of this.touched) {
      this.tmin[k] = Infinity
      this.tmax[k] = -Infinity
    }
    this.touched.length = 0
    return { cells, a, b, endCells, dur: poses.length - 1 }
  }

  // 서 있는 자리(들)가 덮는 칸
  spot(ps: Pose[], hl: number, hw: number, pad: number, off = 0): number[] {
    for (const p of ps) this.stamp(p.x + Math.sin(p.heading) * off, p.z + Math.cos(p.heading) * off, Math.sin(p.heading), Math.cos(p.heading), hl + pad, hw + pad, 0)
    const out = [...this.touched]
    for (const k of this.touched) {
      this.tmin[k] = Infinity
      this.tmax[k] = -Infinity
    }
    this.touched.length = 0
    return out
  }

  private lo: number[] = []
  private hi: number[] = []
  // 다른 차의 예약과 겹치지 않는 가장 이른 출발 시각 (없으면 null). blockers에 막은 차 번호를 모은다
  earliest(tc: TripCells, now: number, owner: number, horizon: number, blockers?: Set<number>, openEnd = true): number | null {
    const tau = this.tau
    this.lastBlockers = []
    const lo = this.lo
    const hi = this.hi
    lo.length = 0
    hi.length = 0
    const limit = now + horizon
    let blocked = false
    for (let i = 0; i < tc.cells.length; i++) {
      const list = this.cells[tc.cells[i]]
      if (!list) continue
      const ai = tc.a[i]
      const bi = tc.b[i]
      for (let j = 0; j < list.length; j += 3) {
        const ia = list[j]
        const ib = list[j + 1]
        const io = list[j + 2]
        if (io === owner || ib < now - tau) continue
        const l = ia - bi - tau
        if (l >= limit) continue
        const h = ib - ai + tau
        if (h <= now) continue
        if (h === Infinity && l <= now) {
          // 지금 머물고 있는 차가 길을 막는다: 그 차가 떠나기 전에는 못 간다
          if (blockers) blockers.add(io)
          this.lastBlockers = [io]
          blocked = true
          if (!blockers) return null
          continue
        }
        lo.push(l)
        hi.push(h)
      }
    }
    // 도착 뒤 머무는 칸: 그 뒤의 다른 예약이 모두 끝난 다음에 도착해야 한다
    for (const k of openEnd ? tc.endCells : []) {
      const list = this.cells[k]
      if (!list) continue
      for (let j = 0; j < list.length; j += 3) {
        const ib = list[j + 1]
        const io = list[j + 2]
        if (io === owner || ib < now - tau) continue
        const h = ib - tc.dur + tau
        if (h <= now) continue
        if (h === Infinity) {
          if (blockers) blockers.add(io)
          this.lastBlockers = [io]
          blocked = true
          if (!blockers) return null
          continue
        }
        lo.push(-Infinity)
        hi.push(h)
      }
    }
    if (blocked) return null
    // 금지 구간들의 합집합을 피해 가장 이른 t (고정점 반복)
    let t = now
    for (let pass = 0; pass < 64; pass++) {
      let moved = false
      for (let i = 0; i < lo.length; i++) {
        if (lo[i] < t && hi[i] > t) {
          t = hi[i]
          moved = true
        }
      }
      if (!moved || t > limit) break
    }
    if (t > limit || !Number.isFinite(t)) return null
    return Math.ceil(t)
  }

  commit(tc: TripCells, t0: number, owner: number, openEnd = true) {
    this.version++
    for (let i = 0; i < tc.cells.length; i++) this.add(tc.cells[i], t0 + tc.a[i], t0 + tc.b[i], owner)
    if (openEnd) this.hold(tc.endCells, t0 + tc.dur, owner)
  }

  // [a, b] 동안 칸들이 비어 있으면 null, 아니면 겹치는 다른 예약 중 가장 늦게 끝나는 시각
  busyUntil(cells: number[], a: number, b: number, owner: number): number | null {
    let out: number | null = null
    for (const k of cells) {
      const list = this.cells[k]
      if (!list) continue
      for (let j = 0; j < list.length; j += 3) {
        if (list[j + 2] === owner) continue
        if (list[j] < b + this.tau && list[j + 1] > a - this.tau) out = Math.max(out ?? -Infinity, list[j + 1])
      }
    }
    return out
  }

  range(cells: number[], a: number, b: number, owner: number) {
    this.version++
    for (const k of cells) this.add(k, a, b, owner)
  }

  hold(cells: number[], t: number, owner: number) {
    for (const k of cells) this.add(k, t, Infinity, owner)
    const list = this.open.get(owner)
    if (list) list.push(...cells)
    else this.open.set(owner, [...cells])
  }

  private clock = -Infinity
  private add(k: number, a: number, b: number, o: number) {
    let list = this.cells[k]
    if (!list) list = this.cells[k] = []
    else if (list.length >= 12) {
      // 지난 예약은 새 예약을 넣을 때 그 칸에서만 정리한다
      let w = 0
      for (let i = 0; i < list.length; i += 3)
        if (list[i + 1] >= this.clock - 5) {
          list[w] = list[i]
          list[w + 1] = list[i + 1]
          list[w + 2] = list[i + 2]
          w += 3
        }
      list.length = w
    }
    list.push(a, b, o)
  }

  // 이 차의 열린(머무는) 예약을 t에서 닫는다
  close(owner: number, t: number) {
    this.version++
    this.openVer.set(owner, (this.openVer.get(owner) ?? 0) + 1)
    const ks = this.open.get(owner)
    if (!ks) return
    for (const k of ks) {
      const list = this.cells[k]
      if (!list) continue
      for (let j = 0; j < list.length; j += 3) if (list[j + 2] === owner && list[j + 1] === Infinity) list[j + 1] = Math.max(list[j], t)
    }
    this.open.delete(owner)
  }

  // 이 차의 예약 중 t 이후 부분을 지운다
  drop(owner: number, t: number) {
    this.version++
    for (let k = 0; k < this.cells.length; k++) {
      const list = this.cells[k]
      if (!list) continue
      for (let i = list.length - 3; i >= 0; i -= 3) {
        if (list[i + 2] !== owner) continue
        if (list[i] >= t) list.splice(i, 3)
        else if (list[i + 1] > t) list[i + 1] = t
      }
    }
  }

  prune(now: number) {
    this.clock = now
  }

  // 지금 머무는 예약의 소유자별 변경 횟수 (그 차가 떠나야 풀리는 대기는 이것이 바뀔 때만 다시 본다)
  openVer = new Map<number, number>()
  lastBlockers: number[] = []
}
