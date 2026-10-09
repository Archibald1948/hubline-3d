import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TRUCK_MODELS, type Dir, type Site, type Truck, type TruckModelId } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { damp, lerpAngle } from './util'
import { box, cyl, merged, vcMat, type Part } from './merge'

export function truckAlert(site: Site, tr: Truck, t: number): 'broken' | 'late' | 'wait' | null {
  const s = site.shipOf(tr)
  if (tr.brokenUntil != null && t < tr.brokenUntil) return 'broken'
  if (tr.phase === 'departing') return null
  if (s.dir === 'in' && s.arrivedAt != null && s.arrivedAt > s.due) return 'late'
  if (s.dir === 'out' && s.doneAt == null && t > s.due) return 'late'
  if ((tr.phase === 'queued' || tr.phase === 'arriving') && site.dwellSoFar(tr, t) > 15 * 60) return 'wait'
  return null
}

// 트럭 한 대 = 정점 색 지오메트리 1개 (원점 = 적재함 후면, 전방 +z)
function truckGeometry(model: TruckModelId, dir: Dir): THREE.BufferGeometry {
  return merged(`truck-${model}-${dir}`, () => {
    const m = TRUCK_MODELS[model]
    const len = m.len
    const body = m.body
    const parts: Part[] = [
      { geo: box(2.46, 2.6, body), pos: [0, 2.55, body / 2 + 0.1], color: P.trailer },
      { geo: box(2.0, 0.34, len - 0.3), pos: [0, 0.95, len / 2], color: P.chassis },
      { geo: box(2.44, 2.3, 2.3), pos: [0, 2.2, len - 1.15], color: P.ink },
      { geo: box(2.16, 0.9, 0.04), pos: [0, 2.62, len + 0.01], color: P.glass },
      { geo: box(0.08, 0.5, 0.06), pos: [-1.32, 2.5, len - 0.25], color: P.ink },
      { geo: box(0.08, 0.5, 0.06), pos: [1.32, 2.5, len - 0.25], color: P.ink },
      { geo: box(0.32, 0.14, 0.04), pos: [-0.95, 1.45, 0.06], color: '#C8302B' },
      { geo: box(0.32, 0.14, 0.04), pos: [0.95, 1.45, 0.06], color: '#C8302B' },
      { geo: box(2.3, 0.18, 0.05), pos: [0, 1.0, len + 0.01], color: '#2A2A2A' },
    ]
    if (dir === 'out') parts.push({ geo: box(0.9, 0.03, body * 0.92), pos: [0, 3.865, body / 2 + 0.1], color: P.ink })
    if (m.reefer) parts.push({ geo: box(1.7, 1.0, 0.42), pos: [0, 3.3, body + 0.32], color: '#C9C9C5' })
    const axles = len > 11 ? [1.3, 2.5, 3.7] : [1.3, 2.4]
    for (const z of [...axles, len - 1.45])
      for (const x of [-1.06, 1.06]) parts.push({ geo: cyl(0.5, 0.36, 14), pos: [x, 0.5, z], rot: [0, 0, Math.PI / 2], color: P.tire })
    return parts
  })
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

const beaconGeo = new THREE.SphereGeometry(0.24, 12, 10)

function TruckMesh({ site, truck }: { site: Site; truck: Truck }) {
  const ref = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.Mesh>(null)
  const beaconMat = useRef<THREE.MeshBasicMaterial>(null)
  const head = useRef<number | null>(null)
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)
  const ship = site.shipOf(truck)
  const len = TRUCK_MODELS[truck.model].len

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
      <mesh geometry={truckGeometry(truck.model, ship.dir)} material={vcMat} castShadow receiveShadow />
      <mesh ref={beacon} geometry={beaconGeo} position={[0, 3.52, len - 1.3]} visible={false}>
        <meshBasicMaterial ref={beaconMat} color={P.crit} />
      </mesh>
    </group>
  )
}
