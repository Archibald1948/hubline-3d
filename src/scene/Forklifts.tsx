import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Forklift, Site } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { damp, lerpAngle } from './util'
import { box, cyl, merged, vcMat, vcMatMatte } from './merge'

// 지게차 = 차체(고정) + 내측 마스트 + 캐리지 + 적재물, 각각 병합 지오메트리 1개
const staticGeo = () =>
  merged('fl-static', () => [
    { geo: box(1.16, 0.82, 1.7), pos: [0, 0.66, -0.2], color: P.ink },
    { geo: box(1.16, 0.7, 0.42), pos: [0, 0.62, -1.08], color: '#2E2E2E' },
    ...[-0.5, 0.5].flatMap((x) => [-0.75, 0.32].map((z) => ({ geo: box(0.06, 1.3, 0.06), pos: [x, 1.68, z] as [number, number, number], color: P.ink }))),
    { geo: box(1.12, 0.06, 1.18), pos: [0, 2.34, -0.22], color: P.ink },
    { geo: box(0.5, 0.42, 0.45), pos: [0, 1.22, -0.45], color: '#3A3A3A' },
    { geo: box(0.09, 2.5, 0.12), pos: [-0.38, 1.3, 0.72], color: '#383838' },
    { geo: box(0.09, 2.5, 0.12), pos: [0.38, 1.3, 0.72], color: '#383838' },
    ...[
      [-0.55, 0.42],
      [0.55, 0.42],
      [-0.55, -0.85],
      [0.55, -0.85],
    ].map(([x, z]) => ({ geo: cyl(0.28, 0.22, 12), pos: [x, 0.28, z] as [number, number, number], rot: [0, 0, Math.PI / 2] as [number, number, number], color: P.tire })),
  ])
const innerGeo = () =>
  merged('fl-inner', () => [
    { geo: box(0.08, 2.4, 0.08), pos: [-0.3, 1.4, 0.8], color: '#555555' },
    { geo: box(0.08, 2.4, 0.08), pos: [0.3, 1.4, 0.8], color: '#555555' },
  ])
const carriageGeo = () =>
  merged('fl-carriage', () => [
    { geo: box(0.96, 0.56, 0.06), pos: [0, 0.3, 0.86], color: '#383838' },
    { geo: box(0.12, 0.05, 1.12), pos: [-0.27, 0.02, 1.42], color: '#555555' },
    { geo: box(0.12, 0.05, 1.12), pos: [0.27, 0.02, 1.42], color: '#555555' },
  ])
const loadGeo = () =>
  merged('fl-load', () => [
    { geo: box(1.08, 0.14, 1.04), pos: [0, 0.12, 1.46], color: P.pallet },
    { geo: box(1.0, 1.08, 0.98), pos: [0, 0.74, 1.46], color: P.goodsA },
  ])
const lampGeo = new THREE.SphereGeometry(0.12, 10, 8)
// 모델은 뒷바퀴 쪽 -1.3 ~ 포크 끝 +2.0 → 외곽 중심이 원점에 오도록 민다
const FL_ORIGIN_Z = -0.35
const hitGeo = new THREE.BoxGeometry(1.8, 2.6, 3.4)
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })

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
  const carriage = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)
  const load = useRef<THREE.Mesh>(null)
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
    if (load.current) {
      load.current.position.y = fy.y
      load.current.visible = fy.carrying
    }
    if (inner.current) inner.current.position.y = Math.max(0, fy.y - 1.7)
    if (lamp.current && lampMat.current) {
      const moving = f.state === 'toPick' || f.state === 'toDrop' || f.state === 'toCharge' || f.state === 'toPark' || f.state === 'toDock'
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
      {/* 시뮬레이션 기준점 = 차체+포크 외곽(1.2 × 3.3)의 중심 */}
      <group position={[0, 0, FL_ORIGIN_Z]}>
        <mesh geometry={staticGeo()} material={vcMat} castShadow receiveShadow />
        <mesh ref={inner} geometry={innerGeo()} material={vcMat} castShadow />
        <mesh ref={carriage} geometry={carriageGeo()} material={vcMat} castShadow />
        <mesh ref={load} geometry={loadGeo()} material={vcMatMatte} castShadow visible={false} />
        <mesh ref={lamp} geometry={lampGeo} position={[0, 2.46, -0.62]}>
          <meshBasicMaterial ref={lampMat} color={P.warn} />
        </mesh>
        <mesh geometry={hitGeo} material={hitMat} position={[0, 1.2, 0.2]} />
      </group>
    </group>
  )
}
