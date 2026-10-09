// 캠퍼스 미니맵 — 위에서 본 배치도. 누르면 그 지점으로 카메라 이동
import { useEffect, useRef } from 'react'
import { useUi, world } from '../store'
import { camState } from '../scene/Scene'
import { ROLE_COLOR } from '../scene/People'
import { selAnchor } from '../scene/Selection'
import * as L from '../sim/layout'

const W = 232

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const siteId = useUi((s) => s.siteId)
  const flyTo = useUi((s) => s.flyTo)
  const site = world.site(siteId)
  const C = site.layout.campus
  const bx0 = C.x0 - 4
  const bx1 = C.x1 + 4
  const bz0 = C.z0 - 4
  const bz1 = 48
  const k = W / (bx1 - bx0)
  const H = Math.round((bz1 - bz0) * k)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = W * dpr
    cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    const X = (x: number) => (x - bx0) * k
    const Z = (z: number) => (z - bz0) * k
    const Lg = site.layout
    let raf = 0
    let last = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 120) return
      last = now
      const t = world.time
      g.clearRect(0, 0, W, H)
      g.fillStyle = '#E4E4E0'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#D6D6D2'
      g.fillRect(X(C.x0), Z(C.z0), (C.x1 - C.x0) * k, (30.4 - C.z0) * k)
      g.fillStyle = '#B9B9B4'
      g.fillRect(0, Z(30.4), W, (43.2 - 30.4) * k)
      g.fillStyle = '#C7C7C2'
      g.fillRect(X(Lg.wall.x0 - 4), Z(13), (Lg.holding.eastX + 12 - Lg.wall.x0 + 4) * k, (30.4 - 13) * k)
      // 건물·랙
      g.fillStyle = '#FAFAF8'
      g.fillRect(X(Lg.wall.x0), Z(Lg.wall.z0), Lg.width * k, Lg.depth * k)
      g.strokeStyle = '#1C1C1C'
      g.lineWidth = 1
      g.strokeRect(X(Lg.wall.x0) + 0.5, Z(Lg.wall.z0) + 0.5, Lg.width * k - 1, Lg.depth * k - 1)
      g.fillStyle = '#BDB6AA'
      for (const r of Lg.rows) for (const sx of Lg.sectionX0) g.fillRect(X(sx), Z(r.z - 0.6), L.SECTION_W * k, Math.max(1, 1.2 * k))
      // 시설
      g.fillStyle = '#FFFFFF'
      for (const f of [Lg.facilities.office, Lg.facilities.shop]) {
        g.fillRect(X(f.x - f.w / 2), Z(f.z - f.d / 2), f.w * k, f.d * k)
        g.strokeRect(X(f.x - f.w / 2) + 0.5, Z(f.z - f.d / 2) + 0.5, f.w * k - 1, f.d * k - 1)
      }
      // 도크
      for (const d of site.docks) {
        const st = site.dockState(d)
        g.fillStyle = st === 'occupied' ? '#0B0B0B' : st === 'maintenance' ? '#B26B00' : st === 'reserved' ? '#85857F' : '#138A4A'
        g.fillRect(X(d.x - 1.2), Z(12.2), 2.4 * k + 0.5, 2)
      }
      // 트럭
      g.fillStyle = '#0B0B0B'
      for (const tr of site.trucks.values()) {
        if (tr.phase === 'enroute' || tr.phase === 'gone') continue
        const p = site.truckPose(tr, t)
        const len = 11
        const cx = p.x + (Math.sin(p.heading) * len) / 2
        const cz = p.z + (Math.cos(p.heading) * len) / 2
        g.save()
        g.translate(X(cx), Z(cz))
        g.rotate(-p.heading)
        g.fillRect((-2.5 * k) / 2, (-len * k) / 2, Math.max(2, 2.5 * k), len * k)
        g.restore()
      }
      // 지게차·사람
      for (const f of site.forklifts) {
        const p = site.forkliftPose(f, t)
        g.fillStyle = f.state === 'down' ? '#D22F2A' : '#E5940A'
        g.fillRect(X(p.x) - 1.5, Z(p.z) - 1.5, 3, 3)
      }
      for (const w of site.workers) {
        if (!w.visible) continue
        const p = site.workerPose(w, t)
        g.fillStyle = ROLE_COLOR[w.role]
        g.beginPath()
        g.arc(X(p.x), Z(p.z), 1.3, 0, Math.PI * 2)
        g.fill()
      }
      // 선택 항목
      const sel = useUi.getState().sel
      const a = sel ? selAnchor(site, sel, t) : null
      if (a) {
        g.strokeStyle = '#0B0B0B'
        g.lineWidth = 1.5
        g.beginPath()
        g.arc(X(a.x), Z(a.z), Math.max(4, a.r * k), 0, Math.PI * 2)
        g.stroke()
      }
      // 카메라 시야
      const r = Math.max(6, camState.dist * 0.42 * k)
      g.strokeStyle = 'rgba(11,11,11,0.75)'
      g.fillStyle = 'rgba(11,11,11,0.07)'
      g.lineWidth = 1
      g.beginPath()
      g.arc(X(camState.tx), Z(camState.tz), r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.beginPath()
      g.moveTo(X(camState.tx), Z(camState.tz))
      const dx = camState.px - camState.tx
      const dz = camState.pz - camState.tz
      const n = Math.hypot(dx, dz) || 1
      g.lineTo(X(camState.tx) + (dx / n) * r, Z(camState.tz) + (dz / n) * r)
      g.stroke()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [site, H, k, bx0, bz0, C])

  return (
    <div className="minimap">
      <div className="minimap-head">
        <strong>캠퍼스 배치도</strong>
        <span>눌러서 이동</span>
      </div>
      <canvas
        ref={ref}
        style={{ width: W, height: H }}
        aria-label="캠퍼스 미니맵"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          flyTo(bx0 + (e.clientX - r.left) / k, bz0 + (e.clientY - r.top) / k)
        }}
      />
    </div>
  )
}
