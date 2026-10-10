import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import * as L from '../sim/layout'
import type { Site } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { shell } from './Building'

const LIGHT = { free: P.ok, reserved: P.ok, occupied: P.crit, maintenance: P.warn } as const
// 라벨끼리 화면에서 겹치면 이 순서로 남긴다 (예외가 먼저)
const RANK = { maintenance: 3, occupied: 2, reserved: 1, free: 0 } as const
const TAG_Y = 6.3
const v = new THREE.Vector3()

export function Docks({ site }: { site: Site }) {
  useUi((s) => s.tick)
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const lights = useRef<THREE.Group>(null)
  const tags = useRef<(HTMLButtonElement | null)[]>([])
  const frame = useRef(0)

  // 먼 시점에서 도크 라벨이 서로 덮이지 않도록, 화면 위치를 투영해 겹치는 라벨은 중요도 낮은 쪽을 숨긴다
  useFrame(({ camera, size }) => {
    if (frame.current++ % 4) return
    const ui = useUi.getState()
    const items = site.docks.map((d, i) => {
      v.set(d.x, TAG_Y, L.DOCK_WALL_Z).project(camera)
      const el = tags.current[i]
      const focus = (ui.sel?.kind === 'dock' && ui.sel.id === d.id) || (ui.hover?.kind === 'dock' && ui.hover.id === d.id)
      return {
        el,
        x: (v.x * 0.5 + 0.5) * size.width,
        y: (-v.y * 0.5 + 0.5) * size.height,
        w: (el?.offsetWidth ?? 40) + 4,
        h: (el?.offsetHeight ?? 20) + 2,
        rank: (focus ? 10 : 0) + RANK[site.dockState(d)],
        depth: v.z,
      }
    })
    const placed: { x: number; y: number; w: number; h: number }[] = []
    for (const it of [...items].sort((a, b) => b.rank - a.rank || a.depth - b.depth)) {
      const hit = placed.some((p) => Math.abs(p.x - it.x) * 2 < p.w + it.w && Math.abs(p.y - it.y) * 2 < p.h + it.h)
      if (!hit) placed.push(it)
      const el = it.el
      if (!el) continue
      const show = !hit
      const want = show ? '1' : '0'
      if (el.dataset.shown === want) continue
      el.dataset.shown = want
      el.style.transition = 'opacity 160ms ease-out'
      el.style.opacity = show ? '1' : '0'
      el.style.pointerEvents = show ? '' : 'none'
      el.tabIndex = show ? 0 : -1
      el.setAttribute('aria-hidden', show ? 'false' : 'true')
    }
  })

  useFrame(() => {
    // 신호등은 벽에 붙어 있어 단면 보기에서 벽과 함께 내려간다
    if (lights.current) lights.current.position.y = -shell.sink
    const blink = Math.floor(world.time / 2) % 2 === 0
    site.docks.forEach((d, i) => {
      const m = mats.current[i]
      if (!m) return
      const st = site.dockState(d)
      m.color.set(st === 'reserved' && !blink ? '#2c2c2c' : LIGHT[st])
    })
  })

  return (
    <group>
      <group ref={lights}>
        {site.docks.map((d, i) => (
          <mesh key={d.id} position={[d.x + 1.1, 5.95, L.DOCK_WALL_Z + 0.2]}>
            <boxGeometry args={[0.5, 0.28, 0.12]} />
            <meshBasicMaterial ref={(m) => void (mats.current[i] = m)} color={LIGHT[site.dockState(d)]} />
          </mesh>
        ))}
      </group>
      {site.docks.map((d, i) => {
        const st = site.dockState(d)
        const tr = d.truckId ? site.trucks.get(d.truckId) : undefined
        const ship = tr ? site.shipOf(tr) : undefined
        const pct = ship && tr && tr.phase === 'docked' ? Math.round((tr.moved / ship.pallets) * 100) : null
        const sel = { kind: 'dock' as const, id: d.id }
        return (
          <group key={d.id}>
            <mesh
              position={[d.x, 2.3, L.DOCK_WALL_Z]}
              onClick={(e) => {
                e.stopPropagation()
                select(sel)
              }}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHover(sel)
              }}
              onPointerOut={() => setHover(null)}
            >
              <boxGeometry args={[3.8, 4.8, 1.4]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh
              position={[d.x, 0.03, 10.65]}
              rotation-x={-Math.PI / 2}
              onClick={(e) => {
                e.stopPropagation()
                select(sel)
              }}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHover(sel)
              }}
              onPointerOut={() => setHover(null)}
            >
              <planeGeometry args={[3.9, 3.9]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Html position={[d.x, TAG_Y, L.DOCK_WALL_Z]} center zIndexRange={[12, 0]}>
              <button ref={(el) => void (tags.current[i] = el)} type="button" className={`dock-tag dock-tag--${st}`} onClick={() => select(sel)}>
                <span>{d.id}</span>
                {pct != null && <em>{pct}%</em>}
                {st === 'maintenance' && <em>점검</em>}
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
