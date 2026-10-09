// 건축 모형 느낌의 주변 요소: 흰 구형 나무, 사무동, 직원 주차장
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Rng } from '../sim/rng'
import { P } from './palette'
import { nightMats } from './nightMats'

const tmp = new THREE.Object3D()

export function Surroundings() {
  const trees = useMemo(() => {
    const r = new Rng(7)
    const out: { x: number; z: number; s: number }[] = []
    const add = (x: number, z: number) => out.push({ x: x + r.range(-0.8, 0.8), z: z + r.range(-0.8, 0.8), s: r.range(0.75, 1.25) })
    for (let x = -60; x <= 90; x += 6) add(x, -31)
    for (let z = -26; z <= 8; z += 6) {
      add(-38, z)
      add(88, z)
    }
    for (let x = -150; x <= 150; x += 9) if (x < -36 || x > 60) add(x, 47)
    for (let x = -96; x <= -44; x += 8) add(x, 20)
    return out
  }, [])
  const crown = useRef<THREE.InstancedMesh>(null)
  const trunk = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    trees.forEach((t, i) => {
      tmp.position.set(t.x, 2.6 * t.s, t.z)
      tmp.scale.setScalar(t.s)
      tmp.updateMatrix()
      crown.current!.setMatrixAt(i, tmp.matrix)
      tmp.position.set(t.x, 0.9 * t.s, t.z)
      tmp.updateMatrix()
      trunk.current!.setMatrixAt(i, tmp.matrix)
    })
    crown.current!.instanceMatrix.needsUpdate = true
    trunk.current!.instanceMatrix.needsUpdate = true
  }, [trees])

  const cars = useMemo(() => {
    const r = new Rng(3)
    const out: { x: number; z: number; on: boolean; c: string }[] = []
    for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) out.push({ x: 48 + i * 2.6, z: -12 + j * 6.4, on: r.chance(0.72), c: r.pick(['#1b1b1b', '#f6f6f4', '#9a9a95', '#d9d9d5', '#4a4a47']) })
    return out
  }, [])

  return (
    <group>
      <instancedMesh ref={crown} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.6, 1]} />
        <meshStandardMaterial color={P.tree} roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 1.8, 6]} />
        <meshStandardMaterial color={P.trunk} roughness={1} />
      </instancedMesh>

      {/* 사무동 (2층) */}
      <group position={[36, 0, -18]}>
        <mesh position={[0, 0.06, 0]} receiveShadow>
          <boxGeometry args={[14, 0.12, 9]} />
          <meshStandardMaterial color={P.slab} />
        </mesh>
        <mesh position={[0, 3.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[13, 7, 8]} />
          <meshStandardMaterial color={P.wall} roughness={0.85} />
        </mesh>
        {[1.9, 5.3].map((y) => (
          <mesh key={y} position={[0, y, 4.02]} material={nightMats.window}>
            <boxGeometry args={[12, 1.3, 0.05]} />
          </mesh>
        ))}
        {[1.9, 5.3].map((y) => (
          <mesh key={`w${y}`} position={[-6.52, y, 0]} material={nightMats.window}>
            <boxGeometry args={[0.05, 1.3, 6.5]} />
          </mesh>
        ))}
        <mesh position={[0, 7.18, 0]} castShadow>
          <boxGeometry args={[13.4, 0.36, 8.4]} />
          <meshStandardMaterial color={P.frame} />
        </mesh>
      </group>

      {/* 직원 주차장 */}
      <mesh position={[65, -0.015, -8.8]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[42, 15]} />
        <meshStandardMaterial color={P.yard} roughness={1} />
      </mesh>
      {Array.from({ length: 15 }, (_, i) => (
        <group key={i}>
          <mesh position={[46.7 + i * 2.6, 0.0, -12]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.1, 4.4]} />
            <meshBasicMaterial color={P.lane} />
          </mesh>
          <mesh position={[46.7 + i * 2.6, 0.0, -5.6]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.1, 4.4]} />
            <meshBasicMaterial color={P.lane} />
          </mesh>
        </group>
      ))}
      {cars
        .filter((c) => c.on)
        .map((c, i) => (
          <group key={i} position={[c.x, 0, c.z]}>
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[1.75, 0.75, 4.2]} />
              <meshStandardMaterial color={c.c} roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.1, -0.15]} castShadow>
              <boxGeometry args={[1.5, 0.55, 2.2]} />
              <meshStandardMaterial color={c.c === '#1b1b1b' ? '#2c2c2c' : P.glass} roughness={0.3} />
            </mesh>
          </group>
        ))}
    </group>
  )
}
