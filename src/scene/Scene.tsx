import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useUi, world } from '../store'
import { Ground } from './Ground'
import { Racks } from './Racks'
import { Docks } from './Docks'
import { Trucks } from './Trucks'
import { Forklifts } from './Forklifts'
import { Surroundings } from './Surroundings'
import { Lighting, YardLights } from './Lighting'
import { HeatLayer } from './Heat'
import { SelectionLayer, selAnchor } from './Selection'
import { P } from './palette'

const CAM_POS = new THREE.Vector3(50, 56, 80)
const CAM_TARGET = new THREE.Vector3(3, 0, 6)

function SimDriver() {
  useFrame((_, dt) => world.advance(dt), -1)
  return null
}

function CameraRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const camera = useThree((s) => s.camera)
  const siteId = useUi((s) => s.siteId)
  const nonce = useUi((s) => s.focusNonce)
  const anim = useRef<{ from: THREE.Vector3; t: number } | null>(null)

  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const far = aspect < 0.8 ? 1.75 : aspect < 1.3 ? 1.3 : 1

  useEffect(() => {
    if (!controls) return
    camera.position.copy(CAM_POS).sub(CAM_TARGET).multiplyScalar(far).add(CAM_TARGET)
    controls.target.copy(CAM_TARGET)
    controls.update()
    anim.current = null
    // 화면 비율이 바뀔 때마다 리셋하지 않도록 far는 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, controls, camera])

  useEffect(() => {
    if (!controls || !nonce) return
    anim.current = { from: controls.target.clone(), t: 0 }
  }, [nonce, controls])

  useFrame((_, dt) => {
    if (!controls) return
    const { sel, follow } = useUi.getState()
    const site = world.site(useUi.getState().siteId)
    const a = sel ? selAnchor(site, sel, world.time) : null
    let desired: THREE.Vector3 | null = null
    if (anim.current && a) {
      const k = anim.current
      k.t = Math.min(1, k.t + dt / 0.9)
      const e = k.t < 0.5 ? 4 * k.t ** 3 : 1 - (-2 * k.t + 2) ** 3 / 2
      desired = k.from.clone().lerp(new THREE.Vector3(a.x, 0, a.z), e)
      if (k.t >= 1) anim.current = null
    } else if (follow && a && sel && (sel.kind === 'truck' || sel.kind === 'forklift' || sel.kind === 'shipment')) {
      desired = new THREE.Vector3(a.x, 0, a.z)
    } else {
      anim.current = null
    }
    if (desired) {
      const delta = desired.sub(controls.target)
      controls.target.add(delta)
      camera.position.add(delta)
      controls.update()
    }
  })
  return null
}

export function Scene() {
  const siteId = useUi((s) => s.siteId)
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)
  const site = world.site(siteId)
  const hover = useUi((s) => s.hover)
  const viewMode = useUi((s) => s.viewMode)

  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
  }, [hover])

  return (
    <Canvas
      shadows
      flat
      dpr={[1, 1.75]}
      camera={{ position: CAM_POS.toArray(), fov: 30, near: 1, far: 900 }}
      onPointerMissed={(e) => {
        if (e.type === 'click') select(null, false)
      }}
      onPointerLeave={() => setHover(null)}
    >
      <color attach="background" args={[P.bg]} />
      <fog attach="fog" args={[P.bg, 200, 460]} />
      <SimDriver />
      <Lighting />
      <group key={siteId}>
        <Ground site={site} />
        <Surroundings />
        <YardLights site={site} />
        {viewMode === 'traffic' && <HeatLayer site={site} />}
        <Racks site={site} />
        <Docks site={site} />
        <Trucks site={site} />
        <Forklifts site={site} />
        <SelectionLayer site={site} />
      </group>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={22} maxDistance={280} maxPolarAngle={1.32} target={CAM_TARGET.toArray()} />
      <CameraRig />
    </Canvas>
  )
}
