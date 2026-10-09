import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import * as L from '../sim/layout'
import type { Site } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'

const LIGHT = { free: P.ok, reserved: P.ok, occupied: P.crit, maintenance: P.warn } as const

export function Docks({ site }: { site: Site }) {
  useUi((s) => s.tick)
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([])

  useFrame(() => {
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
      {site.docks.map((d, i) => {
        const st = site.dockState(d)
        const tr = d.truckId ? site.trucks.get(d.truckId) : undefined
        const ship = tr ? site.shipOf(tr) : undefined
        const pct = ship && tr && tr.phase === 'docked' ? Math.round((tr.moved / ship.pallets) * 100) : null
        const sel = { kind: 'dock' as const, id: d.id }
        return (
          <group key={d.id}>
            <mesh position={[d.x + 1.4, 5.05, L.WALL.z1 + 0.2]}>
              <boxGeometry args={[0.5, 0.28, 0.12]} />
              <meshBasicMaterial ref={(m) => void (mats.current[i] = m)} color={LIGHT[st]} />
            </mesh>
            <mesh
              position={[d.x, 2.3, L.WALL.z1]}
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
            <Html position={[d.x, 6.3, L.WALL.z1]} center zIndexRange={[12, 0]}>
              <button type="button" className={`dock-tag dock-tag--${st}`} onClick={() => select(sel)}>
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
