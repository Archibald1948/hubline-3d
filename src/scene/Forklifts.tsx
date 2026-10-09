import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Forklift, Site } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { damp, lerpAngle } from './util'

export function Forklifts({ site }: { site: Site }) {
  return (
    <group>
      {site.forklifts.map((f) => (
        <ForkliftMesh key={f.id} site={site} f={f} />
      ))}
    </group>
  )
}

function ForkliftMesh({ site, f }: { site: Site; f: Forklift }) {
  const ref = useRef<THREE.Group>(null)
  const carriage = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const load = useRef<THREE.Group>(null)
  const lamp = useRef<THREE.Mesh>(null)
  const lampMat = useRef<THREE.MeshBasicMaterial>(null)
  const head = useRef<number | null>(null)
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const t = world.time
    const p = site.forkliftPose(f, t)
    g.position.set(p.x, 0, p.z)
    head.current = head.current == null ? p.heading : lerpAngle(head.current, p.heading, damp(dt, 9))
    g.rotation.y = head.current
    const fy = site.forkY(f, t)
    if (carriage.current) carriage.current.position.y = fy.y
    if (inner.current) inner.current.position.y = Math.max(0, fy.y - 1.7)
    if (load.current) load.current.visible = fy.carrying
    if (lamp.current && lampMat.current) {
      const moving = f.state === 'toPick' || f.state === 'toDrop' || f.state === 'toCharge'
      const low = f.battery < 25
      const down = f.state === 'down'
      lamp.current.visible = down || f.state === 'charging' || low || (moving && Math.floor(performance.now() / 300) % 2 === 0)
      lampMat.current.color.set(down ? P.crit : f.state === 'charging' ? P.ok : low ? P.crit : P.warn)
    }
  })

  const sel = { kind: 'forklift' as const, id: f.id }
  return (
    <group
      ref={ref}
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
      <mesh position={[0, 0.66, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[1.16, 0.82, 1.7]} />
        <meshStandardMaterial color={P.ink} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.62, -1.08]} castShadow>
        <boxGeometry args={[1.16, 0.7, 0.42]} />
        <meshStandardMaterial color="#2E2E2E" roughness={0.6} />
      </mesh>
      {[-0.5, 0.5].map((x) =>
        [-0.75, 0.32].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.68, z]} castShadow>
            <boxGeometry args={[0.06, 1.3, 0.06]} />
            <meshStandardMaterial color={P.ink} />
          </mesh>
        )),
      )}
      <mesh position={[0, 2.34, -0.22]} castShadow>
        <boxGeometry args={[1.12, 0.06, 1.18]} />
        <meshStandardMaterial color={P.ink} />
      </mesh>
      <mesh ref={lamp} position={[0, 2.46, -0.62]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshBasicMaterial ref={lampMat} color={P.warn} />
      </mesh>
      {/* 마스트 */}
      {[-0.38, 0.38].map((x) => (
        <mesh key={x} position={[x, 1.3, 0.72]} castShadow>
          <boxGeometry args={[0.09, 2.5, 0.12]} />
          <meshStandardMaterial color="#383838" />
        </mesh>
      ))}
      <group ref={inner}>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, 1.4, 0.8]} castShadow>
            <boxGeometry args={[0.08, 2.4, 0.08]} />
            <meshStandardMaterial color="#555" />
          </mesh>
        ))}
      </group>
      {/* 캐리지 + 포크 + 적재물 */}
      <group ref={carriage}>
        <mesh position={[0, 0.3, 0.86]} castShadow>
          <boxGeometry args={[0.96, 0.56, 0.06]} />
          <meshStandardMaterial color="#383838" />
        </mesh>
        {[-0.27, 0.27].map((x) => (
          <mesh key={x} position={[x, 0.02, 1.42]} castShadow>
            <boxGeometry args={[0.12, 0.05, 1.12]} />
            <meshStandardMaterial color="#555" />
          </mesh>
        ))}
        <group ref={load} visible={false}>
          <mesh position={[0, 0.12, 1.46]} castShadow>
            <boxGeometry args={[1.08, 0.14, 1.04]} />
            <meshStandardMaterial color={P.pallet} roughness={1} />
          </mesh>
          <mesh position={[0, 0.74, 1.46]} castShadow>
            <boxGeometry args={[1.0, 1.08, 0.98]} />
            <meshStandardMaterial color={P.goodsA} roughness={0.95} />
          </mesh>
        </group>
      </group>
      {[
        [-0.55, 0.42],
        [0.55, 0.42],
        [-0.55, -0.85],
        [0.55, -0.85],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.28, z]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.28, 0.28, 0.22, 14]} />
          <meshStandardMaterial color={P.tire} />
        </mesh>
      ))}
      {/* 클릭 영역 확장 */}
      <mesh position={[0, 1.2, 0.2]}>
        <boxGeometry args={[1.8, 2.6, 3.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
