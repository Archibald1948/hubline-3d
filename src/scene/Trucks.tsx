import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TRUCK_MODELS, type Site, type Truck } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { damp, lerpAngle } from './util'

export function truckAlert(site: Site, tr: Truck, t: number): 'broken' | 'late' | 'wait' | null {
  const s = site.shipOf(tr)
  if (tr.brokenUntil != null && t < tr.brokenUntil) return 'broken'
  if (tr.phase === 'departing') return null
  if (s.dir === 'in' && s.arrivedAt != null && s.arrivedAt > s.due) return 'late'
  if (s.dir === 'out' && s.doneAt == null && t > s.due) return 'late'
  if ((tr.phase === 'queued' || tr.phase === 'arriving') && site.dwellSoFar(tr, t) > 15 * 60) return 'wait'
  return null
}

export function Trucks({ site }: { site: Site }) {
  useUi((s) => s.tick)
  const list = [...site.trucks.values()].filter((t) => t.phase !== 'enroute' && t.phase !== 'gone')
  return (
    <group>
      {list.map((t) => (
        <TruckMesh key={t.id} site={site} truck={t} />
      ))}
    </group>
  )
}

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.5, z]} rotation-z={Math.PI / 2} castShadow>
      <cylinderGeometry args={[0.5, 0.5, 0.36, 18]} />
      <meshStandardMaterial color={P.tire} roughness={0.8} />
    </mesh>
  )
}

function TruckMesh({ site, truck }: { site: Site; truck: Truck }) {
  const ref = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.Mesh>(null)
  const beaconMat = useRef<THREE.MeshBasicMaterial>(null)
  const head = useRef<number | null>(null)
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)
  const m = TRUCK_MODELS[truck.model]
  const ship = site.shipOf(truck)
  const len = m.len
  const body = m.body

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const p = site.truckPose(truck, world.time)
    g.position.set(p.x, 0, p.z)
    head.current = head.current == null ? p.heading : lerpAngle(head.current, p.heading, damp(dt, 12))
    g.rotation.y = head.current
    const alert = truckAlert(site, truck, world.time)
    if (beacon.current && beaconMat.current) {
      beacon.current.visible = !!alert && Math.floor(performance.now() / (alert === 'broken' ? 200 : 420)) % 2 === 0
      beaconMat.current.color.set(alert === 'late' || alert === 'broken' ? P.crit : P.warn)
    }
  })

  const sel = { kind: 'truck' as const, id: truck.id }
  const rearAxles = len > 11 ? [1.3, 2.5, 3.7] : [1.3, 2.4]

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
      {/* 적재함 */}
      <mesh position={[0, 2.55, body / 2 + 0.1]} castShadow receiveShadow>
        <boxGeometry args={[2.46, 2.6, body]} />
        <meshStandardMaterial color={P.trailer} roughness={0.6} />
      </mesh>
      {ship.dir === 'out' && (
        <mesh position={[0, 3.865, body / 2 + 0.1]}>
          <boxGeometry args={[0.9, 0.03, body * 0.92]} />
          <meshStandardMaterial color={P.ink} roughness={0.6} />
        </mesh>
      )}
      {m.reefer && (
        <mesh position={[0, 3.3, body + 0.32]} castShadow>
          <boxGeometry args={[1.7, 1.0, 0.42]} />
          <meshStandardMaterial color="#D4D4D0" roughness={0.6} />
        </mesh>
      )}
      {/* 후미등 */}
      <mesh position={[-0.95, 1.45, 0.06]}>
        <boxGeometry args={[0.32, 0.14, 0.04]} />
        <meshBasicMaterial color="#C8302B" />
      </mesh>
      <mesh position={[0.95, 1.45, 0.06]}>
        <boxGeometry args={[0.32, 0.14, 0.04]} />
        <meshBasicMaterial color="#C8302B" />
      </mesh>
      {/* 섀시 */}
      <mesh position={[0, 0.95, len / 2]} castShadow>
        <boxGeometry args={[2.0, 0.34, len - 0.3]} />
        <meshStandardMaterial color={P.chassis} roughness={0.8} />
      </mesh>
      {/* 캡 */}
      <mesh position={[0, 2.2, len - 1.15]} castShadow receiveShadow>
        <boxGeometry args={[2.44, 2.3, 2.3]} />
        <meshStandardMaterial color={P.ink} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2.62, len - 0.0]}>
        <boxGeometry args={[2.16, 0.9, 0.04]} />
        <meshStandardMaterial color={P.glass} roughness={0.2} metalness={0.3} />
      </mesh>
      <mesh ref={beacon} position={[0, 3.52, len - 1.3]} visible={false}>
        <sphereGeometry args={[0.24, 12, 10]} />
        <meshBasicMaterial ref={beaconMat} color={P.crit} />
      </mesh>
      {rearAxles.map((z) => (
        <group key={z}>
          <Wheel x={-1.06} z={z} />
          <Wheel x={1.06} z={z} />
        </group>
      ))}
      <Wheel x={-1.06} z={len - 1.45} />
      <Wheel x={1.06} z={len - 1.45} />
    </group>
  )
}
