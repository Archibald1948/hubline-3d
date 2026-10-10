import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TRUCK_MODELS, type Dir, type Site, type Truck, type TruckModelId } from '../sim/engine'
import { useUi, world } from '../store'
import { CARRIER_COLORS, CONTAINER_COLORS, hash01, P } from './palette'
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
// 캡은 운송사 색, 적재함은 흰 탑차 또는 컬러 컨테이너 (같은 조합은 지오메트리 공유)
function truckGeometry(model: TruckModelId, dir: Dir, cab: string, box2: string | null): THREE.BufferGeometry {
  return merged(`truck-${model}-${dir}-${cab}-${box2 ?? 'w'}`, () => {
    const m = TRUCK_MODELS[model]
    const len = m.len
    const body = m.body
    const bodyC = box2 ?? P.trailer
    const parts: Part[] = [
      // 적재함 + 하단 띠 + 운송사 색 줄
      { geo: box(2.46, 2.6, body), pos: [0, 2.55, body / 2 + 0.1], color: bodyC },
      { geo: box(2.48, 0.16, body), pos: [0, 1.31, body / 2 + 0.1], color: box2 ? '#2B2E33' : '#C9CED6' },
      // 후면 문 손잡이
      { geo: box(0.05, 2.2, 0.05), pos: [-0.3, 2.5, 0.08], color: '#8C939D' },
      { geo: box(0.05, 2.2, 0.05), pos: [0.3, 2.5, 0.08], color: '#8C939D' },
      { geo: box(2.0, 0.34, len - 0.3), pos: [0, 0.95, len / 2], color: P.chassis },
      // 캡
      { geo: box(2.44, 1.5, 2.3), pos: [0, 1.85, len - 1.15], color: cab },
      { geo: box(2.4, 0.85, 1.9), pos: [0, 3.0, len - 1.35], color: cab },
      { geo: box(2.16, 0.8, 0.04), pos: [0, 2.95, len + 0.01 - 0.4], color: P.glass },
      { geo: box(0.04, 0.6, 1.0), pos: [-1.21, 2.95, len - 1.0], color: P.glass },
      { geo: box(0.04, 0.6, 1.0), pos: [1.21, 2.95, len - 1.0], color: P.glass },
      // 범퍼·그릴·전조등
      { geo: box(2.4, 0.3, 0.12), pos: [0, 1.0, len + 0.02], color: '#2A2D32' },
      { geo: box(1.4, 0.5, 0.04), pos: [0, 1.55, len + 0.02], color: '#3A3E45' },
      { geo: box(0.36, 0.18, 0.04), pos: [-0.9, 1.45, len + 0.03], color: P.headlight },
      { geo: box(0.36, 0.18, 0.04), pos: [0.9, 1.45, len + 0.03], color: P.headlight },
      // 사이드 미러
      { geo: box(0.08, 0.5, 0.06), pos: [-1.32, 2.7, len - 0.3], color: P.ink },
      { geo: box(0.08, 0.5, 0.06), pos: [1.32, 2.7, len - 0.3], color: P.ink },
      // 후미등 + 후면 범퍼(노랑/검정)
      { geo: box(0.32, 0.14, 0.04), pos: [-0.95, 1.45, 0.06], color: '#C8302B' },
      { geo: box(0.32, 0.14, 0.04), pos: [0.95, 1.45, 0.06], color: '#C8302B' },
      { geo: box(2.3, 0.18, 0.05), pos: [0, 1.0, 0.04], color: P.hazard },
    ]
    if (!box2) parts.push({ geo: box(2.48, 0.32, body * 0.86), pos: [0, 3.15, body / 2 + 0.1], color: cab })
    if (dir === 'out') parts.push({ geo: box(0.9, 0.03, body * 0.92), pos: [0, 3.865, body / 2 + 0.1], color: P.ink })
    if (m.reefer) parts.push({ geo: box(1.7, 1.0, 0.42), pos: [0, 3.3, body + 0.32], color: '#D5DAE1' })
    const axles = len > 11 ? [1.3, 2.5, 3.7] : [1.3, 2.4]
    for (const z of [...axles, len - 1.45])
      for (const x of [-1.06, 1.06]) {
        parts.push({ geo: cyl(0.5, 0.36, 14), pos: [x, 0.5, z], rot: [0, 0, Math.PI / 2], color: P.tire })
        parts.push({ geo: cyl(0.24, 0.38, 10), pos: [x, 0.5, z], rot: [0, 0, Math.PI / 2], color: P.rim })
      }
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
  const cab = CARRIER_COLORS[ship.carrier] ?? P.ink
  // 냉동 탑차는 늘 흰색, 나머지 약 1/3은 컬러 컨테이너
  const h = hash01(truck.id)
  const box2 = !TRUCK_MODELS[truck.model].reefer && h < 0.34 ? CONTAINER_COLORS[Math.floor(h * 100) % CONTAINER_COLORS.length] : null

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
      <mesh geometry={truckGeometry(truck.model, ship.dir, cab, box2)} material={vcMat} castShadow receiveShadow />
      <mesh ref={beacon} geometry={beaconGeo} position={[0, 3.62, len - 1.3]} visible={false}>
        <meshBasicMaterial ref={beaconMat} color={P.crit} />
      </mesh>
    </group>
  )
}
