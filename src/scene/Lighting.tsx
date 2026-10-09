// 시뮬레이션 시각에 연동되는 낮·밤 조명 + 가로등/벽등
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import * as L from '../sim/layout'
import type { Site } from '../sim/engine'
import { useUi, world } from '../store'
import { P } from './palette'
import { nightMats } from './nightMats'

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function daylight(t: number): number {
  const h = (((t % 86400) + 86400) % 86400) / 3600
  return sstep(5.4, 7.0, h) * (1 - sstep(18.2, 19.8, h))
}

const C = {
  bgDay: new THREE.Color(P.bg),
  bgNight: new THREE.Color('#1c2027'),
  skyDay: new THREE.Color('#ffffff'),
  skyNight: new THREE.Color('#8ea3c8'),
  gndDay: new THREE.Color('#c9c9c4'),
  gndNight: new THREE.Color('#262a31'),
  sunDay: new THREE.Color('#ffffff'),
  sunDusk: new THREE.Color('#ffd2a6'),
  moon: new THREE.Color('#b4c6e6'),
  lampOff: new THREE.Color('#d8d8d4'),
  lampOn: new THREE.Color('#fff1d0'),
}

export function Lighting() {
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  const tmp = useMemo(() => new THREE.Color(), [])
  const dayRef = useRef(-1)

  useFrame(() => {
    const mode = useUi.getState().lightMode
    const day = mode === 'day' ? 1 : daylight(world.time)
    const h = (((world.time % 86400) + 86400) % 86400) / 3600
    if (scene.background instanceof THREE.Color) scene.background.copy(C.bgNight).lerp(C.bgDay, day)
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(C.bgNight).lerp(C.bgDay, day)
    if (hemi.current) {
      hemi.current.intensity = 0.55 + 1.15 * day
      hemi.current.color.copy(C.skyNight).lerp(C.skyDay, day)
      hemi.current.groundColor.copy(C.gndNight).lerp(C.gndDay, day)
    }
    if (sun.current) {
      const s = sun.current
      if (day > 0.02 && mode === 'auto') {
        const th = Math.max(0.2, Math.min(Math.PI - 0.2, ((h - 6) / 12) * Math.PI))
        s.position.set(Math.cos(th) * 90, 28 + Math.sin(th) * 70, 52)
        const dusk = 1 - Math.sin(th)
        tmp.copy(C.sunDay).lerp(C.sunDusk, dusk * 0.8)
        s.color.copy(C.moon).lerp(tmp, day)
      } else if (mode === 'day') {
        s.position.set(42, 86, 52)
        s.color.copy(C.sunDay)
      } else {
        s.position.set(-46, 74, 38)
        s.color.copy(C.moon)
      }
      s.intensity = 0.38 + 1.72 * day
    }
    const night = 1 - day
    if (Math.abs(night - dayRef.current) > 0.002) {
      dayRef.current = night
      nightMats.window.emissiveIntensity = night * 1.1
      nightMats.lampHead.color.copy(C.lampOff).lerp(C.lampOn, night)
      nightMats.pool.opacity = night * 0.55
      nightMats.interior.opacity = night * 0.16
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#c9c9c4', 1.7]} />
      <directionalLight
        ref={sun}
        castShadow
        position={[42, 86, 52]}
        intensity={2.1}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  )
}

export function YardLights({ site }: { site: Site }) {
  const road = useMemo(() => {
    const xs: number[] = []
    for (let x = -100; x <= 120; x += 22) xs.push(x)
    return xs
  }, [])
  return (
    <group>
      {/* 도크 위 벽등 + 앞마당 빛 */}
      {site.docks.map((d) => (
        <group key={d.id}>
          <mesh position={[d.x - 1.1, 6.0, L.WALL.z1 + 0.35]} material={nightMats.lampHead}>
            <boxGeometry args={[0.7, 0.18, 0.5]} />
          </mesh>
          <mesh position={[d.x, 0.035, L.WALL.z1 + 6]} rotation-x={-Math.PI / 2} material={nightMats.pool} renderOrder={1}>
            <planeGeometry args={[11, 13]} />
          </mesh>
        </group>
      ))}
      {/* 진입로 가로등 */}
      {road.map((x) => (
        <group key={x} position={[x, 0, 43.4]}>
          <mesh position={[0, 4.5, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 9, 8]} />
            <meshStandardMaterial color={P.frame} />
          </mesh>
          <mesh position={[0, 9.0, -1.3]} castShadow>
            <boxGeometry args={[0.18, 0.14, 2.8]} />
            <meshStandardMaterial color={P.frame} />
          </mesh>
          <mesh position={[0, 8.88, -2.5]} material={nightMats.lampHead}>
            <boxGeometry args={[0.6, 0.12, 0.9]} />
          </mesh>
          <mesh position={[0, 0.03, -5]} rotation-x={-Math.PI / 2} material={nightMats.pool} renderOrder={1}>
            <planeGeometry args={[19, 17]} />
          </mesh>
        </group>
      ))}
      {/* 창고 내부 고천장 조명 (바닥 빛 번짐) */}
      {[-18, -6, 6, 18].map((x) =>
        [-16, -6, 4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.025, z]} rotation-x={-Math.PI / 2} material={nightMats.interior} renderOrder={1}>
            <planeGeometry args={[16, 13]} />
          </mesh>
        )),
      )}
    </group>
  )
}
