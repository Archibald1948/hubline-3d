// 지게차 동선 히트맵 — 바닥에 깔리는 DataTexture
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Site } from '../sim/engine'

// 순차 램프: 투명 → 노랑 → 주황 → 빨강
const STOPS: [number, [number, number, number]][] = [
  [0, [255, 214, 102]],
  [0.45, [245, 140, 40]],
  [1, [200, 30, 30]],
]
function ramp(v: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i]
    const [p0, c0] = STOPS[i - 1]
    if (v <= p1) {
      const k = (v - p0) / (p1 - p0)
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

export function HeatLayer({ site }: { site: Site }) {
  const HEAT = site.layout.heat
  const data = useMemo(() => new Uint8Array(HEAT.w * HEAT.h * 4), [HEAT])
  const tex = useMemo(() => {
    const t = new THREE.DataTexture(data, HEAT.w, HEAT.h, THREE.RGBAFormat)
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearFilter
    t.flipY = false
    t.needsUpdate = true
    return t
  }, [data, HEAT])
  useEffect(() => () => tex.dispose(), [tex])
  const last = useRef(-1)
  const lastT = useRef(0)

  useFrame(() => {
    if (site.heatVersion === last.current) return
    const now = performance.now()
    if (now - lastT.current < 200 && last.current !== -1) return
    lastT.current = now
    last.current = site.heatVersion
    const h = site.heat
    const scale = site.heatScale
    const norm = Math.log1p(Math.max(1, site.heatMax))
    for (let i = 0; i < h.length; i++) {
      const v = Math.log1p(h[i] * scale) / norm
      const o = i * 4
      if (v < 0.04) {
        data[o + 3] = 0
        continue
      }
      const [r, g, b] = ramp(v)
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = Math.min(235, 40 + v * 230)
    }
    tex.needsUpdate = true
  })

  const w = HEAT.w * HEAT.cell
  const d = HEAT.h * HEAT.cell
  // DataTexture 행 0 = z0. 평면을 -90° 눕히면 텍스처 v=0이 +z(남쪽)로 가므로 v를 뒤집는다
  return (
    <mesh position={[HEAT.x0 + w / 2, 0.04, HEAT.z0 + d / 2]} rotation-x={-Math.PI / 2} scale={[1, -1, 1]} renderOrder={3}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
