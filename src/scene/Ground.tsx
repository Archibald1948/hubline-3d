// 바닥·도로·야드·건물 골조 — 모든 좌표는 사이트 레이아웃에서 계산
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import * as L from '../sim/layout'
import type { Site } from '../sim/engine'
import { P } from './palette'

type V3 = [number, number, number]

function Block({ p, s, c, cast = false, rough = 0.92 }: { p: V3; s: V3; c: string; cast?: boolean; rough?: number }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} />
    </mesh>
  )
}

function Strip({ x0, x1, z0, z1, c, y = 0.012 }: { x0: number; x1: number; z0: number; z1: number; c: string; y?: number }) {
  return (
    <mesh position={[(x0 + x1) / 2, y, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[Math.abs(x1 - x0), Math.abs(z1 - z0)]} />
      <meshStandardMaterial color={c} roughness={1} />
    </mesh>
  )
}

const tmp = new THREE.Object3D()

// 같은 모양의 작은 판(차선 점선 등)을 InstancedMesh 하나로
function Marks({ items, c, y = 0.016 }: { items: { x: number; z: number; w: number; d: number }[]; c: string; y?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    items.forEach((m, i) => {
      tmp.position.set(m.x, y, m.z)
      tmp.rotation.set(-Math.PI / 2, 0, 0)
      tmp.scale.set(m.w, m.d, 1)
      tmp.updateMatrix()
      ref.current!.setMatrixAt(i, tmp.matrix)
    })
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [items, y])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color={c} roughness={1} />
    </instancedMesh>
  )
}

export function Ground({ site }: { site: Site }) {
  const Lg = site.layout
  const W = Lg.wall
  const H = Lg.holding
  const dockXs = Lg.dockXs

  const laneMarks = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number }[] = []
    for (let x = Lg.exitX - 60; x < Lg.spawnX + 60; x += 6) out.push({ x: x + 1.5, z: (L.LANE_IN + L.LANE_OUT) / 2, w: 3, d: 0.18 })
    // 도크 주차 구획선
    for (let i = 0; i < dockXs.length - 1; i++) out.push({ x: (dockXs[i] + dockXs[i + 1]) / 2, z: 20, w: 0.14, d: 13 })
    // 대기장 레인 구분선
    const lx0 = H.x0 - 14
    const lx1 = H.eastX + 8
    for (let i = 0; i <= H.laneZ.length; i++) {
      const z = i === 0 ? H.laneZ[0] - 2.3 : i === H.laneZ.length ? H.laneZ[i - 1] + 2.3 : (H.laneZ[i - 1] + H.laneZ[i]) / 2
      for (let x = lx0; x < lx1; x += 4) out.push({ x: x + 1.2, z, w: 2.4, d: 0.14 })
    }
    // 메인 통로 점선
    for (let x = W.x0 + 3; x < W.x1 - 3; x += 3) out.push({ x: x + 0.8, z: Lg.corridorZ, w: 1.6, d: 0.12 })
    return out
  }, [Lg, H, W, dockXs])

  const edgeMarks = useMemo(
    () => [
      { x: (Lg.exitX - 60 + W.x0 - 6) / 2, z: 30.6, w: W.x0 - 6 - (Lg.exitX - 60), d: 0.2 },
      { x: (H.eastX + 10 + Lg.spawnX + 60) / 2, z: 30.6, w: Lg.spawnX + 60 - (H.eastX + 10), d: 0.2 },
      { x: (Lg.exitX + Lg.spawnX) / 2, z: 42.8, w: Lg.spawnX - Lg.exitX + 120, d: 0.2 },
    ],
    [Lg, H, W],
  )

  const southWall = useMemo(() => {
    const segs: [number, number][] = []
    let x = W.x0
    for (const dx of dockXs) {
      segs.push([x, dx - 1.8])
      x = dx + 1.8
    }
    segs.push([x, W.x1])
    return segs.filter(([a, b]) => b - a > 0.05)
  }, [dockXs, W.x0, W.x1])

  const columns = useMemo(() => {
    const cs: [number, number][] = []
    const nx = Math.round(Lg.width / 8)
    for (let i = 0; i <= nx; i++) cs.push([W.x0 + (Lg.width * i) / nx, W.z0])
    const nz = Math.round(Lg.depth / 8)
    for (let i = 1; i < nz; i++) {
      const z = W.z0 + (Lg.depth * i) / nz
      cs.push([W.x0, z], [W.x1, z])
    }
    cs.push([W.x0, W.z1], [W.x1, W.z1])
    return cs
  }, [Lg, W])

  const trusses = useMemo(() => {
    const out: number[] = []
    const n = Math.round(Lg.depth / 9)
    for (let i = 1; i < n; i++) out.push(W.z0 + (Lg.depth * i) / n)
    return out
  }, [Lg, W])

  const HGT = 9.2
  const cz = (W.z0 + W.z1) / 2

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[2400, 2400]} />
        <meshStandardMaterial color={P.ground} roughness={1} />
      </mesh>
      {/* 캠퍼스 포장면 */}
      <Strip x0={Lg.campus.x0} x1={Lg.campus.x1} z0={Lg.campus.z0} z1={30.4} c={P.paving} y={-0.035} />
      {/* 도로 */}
      <Strip x0={Lg.exitX - 300} x1={Lg.spawnX + 300} z0={30.4} z1={43.2} c={P.road} y={-0.02} />
      {/* 도크 앞마당 + 대기장 */}
      <Strip x0={W.x0 - 4} x1={H.eastX + 12} z0={W.z1} z1={30.4} c={P.yard} y={-0.025} />
      <Strip x0={W.x0 - 1} x1={W.x1 + 1} z0={W.z1} z1={27.6} c={P.apron} y={-0.015} />
      {/* 보행로: 서측 출입구 → 사무동 */}
      <Strip x0={Lg.officeDoor.x - 0.5} x1={Lg.pedOut.x + 0.5} z0={Lg.pedOut.z - 1} z1={Lg.pedOut.z + 1} c="#ECECE9" y={-0.01} />
      <Strip x0={Lg.officeDoor.x - 1} x1={Lg.officeDoor.x + 1} z0={Math.min(Lg.officeDoor.z, Lg.pedOut.z) - 1} z1={Math.max(Lg.officeDoor.z, Lg.pedOut.z) + 1} c="#ECECE9" y={-0.01} />
      <Marks items={laneMarks} c={P.lane} />
      <Marks items={edgeMarks} c={P.lane} y={0.014} />

      {/* 건물 슬래브 + 저층 벽 */}
      <Block p={[0, -0.06, cz]} s={[Lg.width, 0.14, Lg.depth]} c={P.slab} rough={0.85} />
      <Block p={[0, 0.55, W.z0]} s={[Lg.width, 1.1, 0.24]} c={P.wall} cast />
      <Block p={[W.x0, 0.55, (W.z0 + Lg.corridorZ - 1.4) / 2]} s={[0.24, 1.1, Lg.corridorZ - 1.4 - W.z0]} c={P.wall} cast />
      <Block p={[W.x0, 0.55, (Lg.corridorZ + 1.4 + W.z1) / 2]} s={[0.24, 1.1, W.z1 - Lg.corridorZ - 1.4]} c={P.wall} cast />
      <Block p={[W.x1, 0.55, cz]} s={[0.24, 1.1, Lg.depth]} c={P.wall} cast />
      {southWall.map(([a, b], i) => (
        <Block key={i} p={[(a + b) / 2, 0.55, W.z1]} s={[b - a, 1.1, 0.24]} c={P.wall} cast />
      ))}
      {/* 보행자 출입구 문틀 */}
      <Block p={[W.x0, 1.25, Lg.corridorZ - 1.4]} s={[0.3, 2.5, 0.2]} c={P.frame} cast />
      <Block p={[W.x0, 1.25, Lg.corridorZ + 1.4]} s={[0.3, 2.5, 0.2]} c={P.frame} cast />
      <Block p={[W.x0, 2.5, Lg.corridorZ]} s={[0.3, 0.2, 3]} c={P.frame} cast />

      {/* 골조: 기둥 + 링 빔 + 지붕 트러스 */}
      {columns.map(([x, z], i) => (
        <Block key={i} p={[x, HGT / 2, z]} s={[0.34, HGT, 0.34]} c={P.frame} cast />
      ))}
      <Block p={[0, HGT, W.z0]} s={[Lg.width + 0.3, 0.24, 0.24]} c={P.frame} />
      <Block p={[0, HGT, W.z1]} s={[Lg.width + 0.3, 0.24, 0.24]} c={P.frame} />
      <Block p={[W.x0, HGT, cz]} s={[0.24, 0.24, Lg.depth]} c={P.frame} />
      <Block p={[W.x1, HGT, cz]} s={[0.24, 0.24, Lg.depth]} c={P.frame} />
      {trusses.map((z) => (
        <Block key={z} p={[0, HGT + 0.4, z]} s={[Lg.width, 0.12, 0.12]} c="#3A3A3A" />
      ))}

      {/* 도크 문틀 + 레벨러 + 스테이징 존 */}
      {dockXs.map((x, i) => (
        <group key={i}>
          <Block p={[x - 1.8, 2.3, W.z1]} s={[0.2, 4.6, 0.3]} c={P.frame} cast />
          <Block p={[x + 1.8, 2.3, W.z1]} s={[0.2, 4.6, 0.3]} c={P.frame} cast />
          <Block p={[x, 4.62, W.z1]} s={[3.8, 0.24, 0.3]} c={P.frame} cast />
          <Block p={[x, 0.04, W.z1 - 0.55]} s={[2.7, 0.08, 1.1]} c="#BDBDB8" />
          <Strip x0={x - 1.95} x1={x + 1.95} z0={8.7} z1={12.6} c={P.zone} y={0.008} />
        </group>
      ))}

      {/* 충전 스테이션 */}
      {Lg.chargers.map((c, i) => {
        const west = c.x < 0
        const cx = west ? W.x0 + 0.45 : W.x1 - 0.45
        return (
          <group key={i}>
            <Block p={[cx, 0.75, c.z]} s={[0.45, 1.5, 0.9]} c={P.frame} cast />
            <mesh position={[cx + (west ? 0.25 : -0.25), 1.25, c.z]}>
              <boxGeometry args={[0.04, 0.12, 0.3]} />
              <meshBasicMaterial color={P.ok} />
            </mesh>
          </group>
        )
      })}

      {/* 랙 열 라벨 */}
      {Lg.rows.map((r) => (
        <Html key={r.idx} position={[Lg.sectionX0[0] - 1.4, L.RACK_H + 0.4, r.z]} center zIndexRange={[10, 0]}>
          <div className="tag3d tag3d--row">{r.letter}</div>
        </Html>
      ))}
    </group>
  )
}
