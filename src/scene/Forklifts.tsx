import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Forklift, Site } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { damp, lerpAngle } from './util'
import { box, cyl, merged, vcMat, vcMatMatte } from './merge'

// 지게차 = 차체(고정, 운전자 포함) + 내측 마스트 + 캐리지 + 적재물, 각각 병합 지오메트리 1개
const sphere = (r: number) => new THREE.SphereGeometry(r, 10, 8)
const staticGeo = () =>
  merged('fl-static-v4', () => [
    // 차체: 노란 하부 + 엔진 덮개 + 앞 대시, 뒤쪽 검은 평형추
    { geo: box(1.16, 0.62, 1.75), pos: [0, 0.6, -0.2], color: P.forklift },
    { geo: box(1.1, 0.34, 0.62), pos: [0, 1.08, -0.78], color: P.forklift },
    { geo: box(1.02, 0.3, 0.24), pos: [0, 1.05, 0.48], color: P.forklift },
    { geo: box(1.2, 0.8, 0.46), pos: [0, 0.74, -1.1], color: P.counterweight },
    // 보호 가드: 기둥 4개 + 지붕 격자
    ...[-0.52, 0.52].flatMap((x) => [-0.95, 0.42].map((z) => ({ geo: box(0.07, 1.36, 0.07), pos: [x, 1.66, z] as [number, number, number], color: P.mast }))),
    { geo: box(1.14, 0.05, 1.46), pos: [0, 2.36, -0.27], color: P.mast },
    ...[-0.6, -0.2, 0.2].map((z) => ({ geo: box(1.1, 0.06, 0.06), pos: [0, 2.4, z] as [number, number, number], color: '#22252A' })),
    // 좌석 + 등받이
    { geo: box(0.52, 0.12, 0.46), pos: [0, 1.0, -0.36], color: '#26292E' },
    { geo: box(0.52, 0.5, 0.1), pos: [0, 1.28, -0.62], color: '#26292E' },
    // 운전자: 다리·몸통(조끼)·팔·머리·안전모
    { geo: box(0.4, 0.16, 0.46), pos: [0, 1.13, -0.16], color: '#2B3442' },
    { geo: box(0.36, 0.42, 0.14), pos: [0, 0.86, 0.06], color: '#2B3442' },
    { geo: box(0.44, 0.52, 0.28), pos: [0, 1.46, -0.44], color: P.vest },
    { geo: box(0.1, 0.1, 0.42), pos: [-0.25, 1.48, -0.18], color: P.shirt },
    { geo: box(0.1, 0.1, 0.42), pos: [0.25, 1.48, -0.18], color: P.shirt },
    { geo: sphere(0.14), pos: [0, 1.86, -0.42], color: P.skin },
    { geo: box(0.3, 0.12, 0.32), pos: [0, 1.99, -0.42], color: '#F7F7F2' },
    // 핸들
    { geo: cyl(0.17, 0.04, 14), pos: [0, 1.38, 0.12], rot: [1.0, 0, 0], color: '#1E2126' },
    { geo: box(0.04, 0.4, 0.04), pos: [0, 1.2, 0.26], rot: [0.5, 0, 0], color: '#1E2126' },
    // 바퀴 + 휠
    ...[
      [-0.55, 0.42],
      [0.55, 0.42],
      [-0.55, -0.85],
      [0.55, -0.85],
    ].flatMap(([x, z]) => [
      { geo: cyl(0.28, 0.22, 12), pos: [x, 0.28, z] as [number, number, number], rot: [0, 0, Math.PI / 2] as [number, number, number], color: P.tire },
      { geo: cyl(0.14, 0.24, 10), pos: [x, 0.28, z] as [number, number, number], rot: [0, 0, Math.PI / 2] as [number, number, number], color: P.rim },
    ]),
    // 외측 마스트
    { geo: box(0.09, 2.5, 0.12), pos: [-0.38, 1.3, 0.72], color: P.mast },
    { geo: box(0.09, 2.5, 0.12), pos: [0.38, 1.3, 0.72], color: P.mast },
    { geo: box(0.86, 0.08, 0.1), pos: [0, 2.5, 0.72], color: P.mast },
  ])
const innerGeo = () =>
  merged('fl-inner', () => [
    { geo: box(0.08, 2.4, 0.08), pos: [-0.3, 1.4, 0.8], color: '#4A4F57' },
    { geo: box(0.08, 2.4, 0.08), pos: [0.3, 1.4, 0.8], color: '#4A4F57' },
  ])
const carriageGeo = () =>
  merged('fl-carriage', () => [
    { geo: box(0.96, 0.56, 0.06), pos: [0, 0.3, 0.86], color: '#2C3036' },
    { geo: box(0.12, 0.05, 1.12), pos: [-0.27, 0.02, 1.42], color: '#6B717A' },
    { geo: box(0.12, 0.05, 1.12), pos: [0.27, 0.02, 1.42], color: '#6B717A' },
  ])
const loadGeo = () =>
  merged('fl-load', () => [
    { geo: box(1.08, 0.14, 1.04), pos: [0, 0.12, 1.46], color: P.pallet },
    { geo: box(1.0, 1.08, 0.98), pos: [0, 0.74, 1.46], color: P.goodsA },
    { geo: box(1.01, 0.06, 0.2), pos: [0, 0.9, 1.46], color: '#E9DCC4' },
  ])
const lampGeo = new THREE.SphereGeometry(0.11, 10, 8)
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
        <mesh ref={lamp} geometry={lampGeo} position={[0, 2.5, -0.9]}>
          <meshBasicMaterial ref={lampMat} color={P.warn} />
        </mesh>
        <mesh geometry={hitGeo} material={hitMat} position={[0, 1.2, 0.2]} />
      </group>
    </group>
  )
}
