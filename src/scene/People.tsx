// 작업자: 몸통·머리·클릭 영역을 각각 InstancedMesh 하나로 그린다 (사이트당 드로우콜 3개)
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Role, Site } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { damp, lerpAngle } from './util'
import { box, merged } from './merge'

export const ROLE_COLOR: Record<Role, string> = {
  checker: '#E6B422',
  picker: '#EE7F2D',
  lead: '#1F1F1F',
  office: '#8B9099',
  guard: '#2F4C7D',
}

const bodyGeo = (() => {
  const g = new THREE.CapsuleGeometry(0.22, 0.5, 4, 10)
  g.translate(0, 0.95, 0)
  return g
})()
const legsGeo = merged('person-legs', () => [
  { geo: box(0.14, 0.5, 0.16), pos: [-0.1, 0.25, 0], color: '#2C2F36' },
  { geo: box(0.14, 0.5, 0.16), pos: [0.1, 0.25, 0], color: '#2C2F36' },
])
const headGeo = merged('person-head', () => {
  const head = new THREE.SphereGeometry(0.15, 12, 10)
  const hat = new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  return [
    { geo: head, pos: [0, 1.57, 0], color: P.skin },
    { geo: hat, pos: [0, 1.61, 0], color: '#F4F4F2' },
  ]
})
const hitGeo = (() => {
  const g = new THREE.CylinderGeometry(0.75, 0.75, 2.2, 8)
  g.translate(0, 1.1, 0)
  return g
})()

const tmp = new THREE.Object3D()
const col = new THREE.Color()

export function People({ site }: { site: Site }) {
  const n = site.workers.length
  const body = useRef<THREE.InstancedMesh>(null)
  const legs = useRef<THREE.InstancedMesh>(null)
  const head = useRef<THREE.InstancedMesh>(null)
  const hit = useRef<THREE.InstancedMesh>(null)
  const heading = useMemo(() => new Float32Array(n).fill(NaN), [n])
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)

  useLayoutEffect(() => {
    site.workers.forEach((w, i) => body.current!.setColorAt(i, col.set(ROLE_COLOR[w.role])))
    if (body.current!.instanceColor) body.current!.instanceColor.needsUpdate = true
  }, [site])

  useFrame((_, dt) => {
    const t = world.time
    const now = performance.now() / 1000
    site.workers.forEach((w, i) => {
      const p = site.workerPose(w, t)
      const moving = site.workerMoving(w, t)
      heading[i] = Number.isNaN(heading[i]) ? p.heading : lerpAngle(heading[i], p.heading, damp(dt, 10))
      const s = w.visible ? 1 : 0
      const bob = moving ? Math.abs(Math.sin(now * 9 + i)) * 0.06 : 0
      tmp.position.set(p.x, bob, p.z)
      tmp.rotation.set(0, heading[i], 0)
      tmp.scale.setScalar(s)
      tmp.updateMatrix()
      body.current!.setMatrixAt(i, tmp.matrix)
      head.current!.setMatrixAt(i, tmp.matrix)
      hit.current!.setMatrixAt(i, tmp.matrix)
      tmp.position.y = 0
      tmp.scale.set(s, s * (moving ? 0.9 + Math.abs(Math.sin(now * 9 + i)) * 0.1 : 1), s)
      tmp.updateMatrix()
      legs.current!.setMatrixAt(i, tmp.matrix)
    })
    for (const m of [body, head, hit, legs]) {
      m.current!.instanceMatrix.needsUpdate = true
      m.current!.computeBoundingSphere()
    }
  })

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (e.instanceId == null) return null
    const w = site.workers[e.instanceId]
    return w && w.visible ? { kind: 'worker' as const, id: w.id } : null
  }

  return (
    <group>
      <instancedMesh ref={body} args={[bodyGeo, undefined, n]} castShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[legsGeo, undefined, n]} castShadow frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={head} args={[headGeo, undefined, n]} castShadow frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={hit}
        args={[hitGeo, undefined, n]}
        frustumCulled={false}
        onClick={(e) => {
          const s = pick(e)
          if (!s) return
          e.stopPropagation()
          select(s)
        }}
        onPointerMove={(e) => {
          const s = pick(e)
          if (!s) return
          e.stopPropagation()
          setHover(s)
        }}
        onPointerOut={() => setHover(null)}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
