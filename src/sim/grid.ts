// 창고 바닥 격자(0.5m) A* — 교착에 빠진 지게차의 우회 경로를 찾는다.
// 정적 장애물(랙·벽)과 다른 지게차 차체를 차폭만큼 부풀려 막고, 비어 있는 칸으로만 간다.
import type { Vec2 } from './path'
import type { OBB } from './mover'
import * as L from './layout'

const CELL = 0.5

export class FloorGrid {
  readonly x0: number
  readonly z0: number
  readonly w: number
  readonly h: number
  private stat: Uint8Array
  private dyn: Uint8Array
  private g: Float32Array
  private came: Int32Array
  private stamp: Uint32Array
  private run = 0

  constructor(Lg: L.Layout, clearance: number) {
    this.x0 = Lg.wall.x0
    this.z0 = Lg.wall.z0
    this.w = Math.ceil(Lg.width / CELL)
    this.h = Math.ceil((Lg.wall.z1 - Lg.wall.z0) / CELL)
    const n = this.w * this.h
    this.stat = new Uint8Array(n)
    this.dyn = new Uint8Array(n)
    this.g = new Float32Array(n)
    this.came = new Int32Array(n)
    this.stamp = new Uint32Array(n)
    const block = (x0: number, x1: number, z0: number, z1: number) => {
      const a = this.cx(x0 - clearance)
      const b = this.cx(x1 + clearance)
      const c = this.cz(z0 - clearance)
      const d = this.cz(z1 + clearance)
      for (let z = Math.max(0, c); z <= Math.min(this.h - 1, d); z++) for (let x = Math.max(0, a); x <= Math.min(this.w - 1, b); x++) this.stat[z * this.w + x] = 1
    }
    for (const r of Lg.rows) for (const sx of Lg.sectionX0) block(sx, sx + L.SECTION_W, r.z - L.ROW_DEPTH / 2, r.z + L.ROW_DEPTH / 2)
    // 벽 테두리
    for (let x = 0; x < this.w; x++) {
      this.stat[x] = 1
      this.stat[(this.h - 1) * this.w + x] = 1
    }
    for (let z = 0; z < this.h; z++) {
      this.stat[z * this.w] = 1
      this.stat[z * this.w + this.w - 1] = 1
    }
  }

  cx(x: number) {
    return Math.floor((x - this.x0) / CELL)
  }
  cz(z: number) {
    return Math.floor((z - this.z0) / CELL)
  }
  private center(i: number): Vec2 {
    return { x: this.x0 + ((i % this.w) + 0.5) * CELL, z: this.z0 + (Math.floor(i / this.w) + 0.5) * CELL }
  }

  // 다른 차체를 부풀려 표시
  markObstacles(obbs: OBB[], inflate: number) {
    this.dyn.fill(0)
    for (const o of obbs) {
      const r = o.hl + inflate
      const a = this.cx(o.cx - r)
      const b = this.cx(o.cx + r)
      const c = this.cz(o.cz - r)
      const d = this.cz(o.cz + r)
      for (let z = Math.max(0, c); z <= Math.min(this.h - 1, d); z++)
        for (let x = Math.max(0, a); x <= Math.min(this.w - 1, b); x++) {
          const p = this.center(z * this.w + x)
          const dx = p.x - o.cx
          const dz = p.z - o.cz
          const along = Math.abs(dx * o.ux + dz * o.uz)
          const side = Math.abs(-dx * o.uz + dz * o.ux)
          if (along <= o.hl + inflate && side <= o.hw + inflate) this.dyn[z * this.w + x] = 1
        }
    }
  }

  private free(i: number) {
    return !this.stat[i] && !this.dyn[i]
  }

  private los(a: number, b: number): boolean {
    let x0 = a % this.w
    let z0 = Math.floor(a / this.w)
    const x1 = b % this.w
    const z1 = Math.floor(b / this.w)
    const dx = Math.abs(x1 - x0)
    const dz = Math.abs(z1 - z0)
    const sx = x0 < x1 ? 1 : -1
    const sz = z0 < z1 ? 1 : -1
    let err = dx - dz
    for (;;) {
      if (!this.free(z0 * this.w + x0)) return false
      if (x0 === x1 && z0 === z1) return true
      const e2 = 2 * err
      if (e2 > -dz) {
        err -= dz
        x0 += sx
      }
      if (e2 < dx) {
        err += dx
        z0 += sz
      }
    }
  }

  // 출발·도착 칸 주변은 자기 차체가 있으므로 반경 내 동적 장애물을 무시
  plan(from: Vec2, to: Vec2, maxNodes = 40000): Vec2[] | null {
    const W = this.w
    const H = this.h
    const s = this.cz(from.z) * W + this.cx(from.x)
    const goal = this.cz(to.z) * W + this.cx(to.x)
    if (s < 0 || goal < 0 || s >= W * H || goal >= W * H) return null
    const clear = (i: number, c: number) => {
      const ix = i % W
      const iz = Math.floor(i / W)
      for (let z = iz - c; z <= iz + c; z++) for (let x = ix - c; x <= ix + c; x++) if (x >= 0 && z >= 0 && x < W && z < H) this.dyn[z * W + x] = 0
    }
    clear(s, 3)
    clear(goal, 2)
    if (this.stat[goal]) return null
    this.run++
    // 이진 힙 (f값, 칸 번호)
    const hf: number[] = []
    const hi: number[] = []
    const push = (fv: number, i: number) => {
      hf.push(fv)
      hi.push(i)
      let k = hf.length - 1
      while (k > 0) {
        const p = (k - 1) >> 1
        if (hf[p] <= hf[k]) break
        ;[hf[p], hf[k]] = [hf[k], hf[p]]
        ;[hi[p], hi[k]] = [hi[k], hi[p]]
        k = p
      }
    }
    const pop = (): number => {
      const top = hi[0]
      const lf = hf.pop()!
      const li = hi.pop()!
      if (hf.length) {
        hf[0] = lf
        hi[0] = li
        let k = 0
        for (;;) {
          const l = 2 * k + 1
          const r = l + 1
          let m = k
          if (l < hf.length && hf[l] < hf[m]) m = l
          if (r < hf.length && hf[r] < hf[m]) m = r
          if (m === k) break
          ;[hf[m], hf[k]] = [hf[k], hf[m]]
          ;[hi[m], hi[k]] = [hi[k], hi[m]]
          k = m
        }
      }
      return top
    }
    this.g[s] = 0
    this.stamp[s] = this.run
    this.came[s] = -1
    const hx = goal % W
    const hz = Math.floor(goal / W)
    const heur = (i: number) => {
      const dx = Math.abs((i % W) - hx)
      const dz = Math.abs(Math.floor(i / W) - hz)
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz)
    }
    push(heur(s), s)
    let expanded = 0
    while (hf.length) {
      const cur = pop()
      if (cur === goal) break
      if (++expanded > maxNodes) return null
      const cxx = cur % W
      const czz = Math.floor(cur / W)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue
          const nx = cxx + dx
          const nz = czz + dz
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue
          const ni = nz * W + nx
          if (!this.free(ni)) continue
          if (dx && dz && (!this.free(czz * W + nx) || !this.free(nz * W + cxx))) continue
          const ng = this.g[cur] + (dx && dz ? 1.414 : 1)
          if (this.stamp[ni] === this.run && ng >= this.g[ni]) continue
          this.stamp[ni] = this.run
          this.g[ni] = ng
          this.came[ni] = cur
          push(ng + heur(ni), ni)
        }
    }
    if (this.stamp[goal] !== this.run) return null
    const cells: number[] = []
    for (let c = goal; c !== -1; c = this.came[c]) cells.push(c)
    cells.reverse()
    // 시야선으로 단순화
    const pts: number[] = [cells[0]]
    let anchor = 0
    for (let i = 2; i < cells.length; i++) {
      if (!this.los(cells[anchor], cells[i])) {
        pts.push(cells[i - 1])
        anchor = i - 1
      }
    }
    pts.push(cells[cells.length - 1])
    const out = pts.map((i) => this.center(i))
    out[0] = { x: from.x, z: from.z }
    out[out.length - 1] = { x: to.x, z: to.z }
    return out
  }
}
