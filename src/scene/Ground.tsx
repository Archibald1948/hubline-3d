import { useMemo } from 'react'
import { Html } from '@react-three/drei'
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

export function Ground({ site }: { site: Site }) {
  const { layout } = site
  const W = L.WALL
  const dockXs = layout.dockXs

  const dashes = useMemo(() => {
    const out: number[] = []
    for (let x = -170; x < 170; x += 6) out.push(x)
    return out
  }, [])

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
    for (let x = W.x0; x <= W.x1 + 0.01; x += 8) {
      cs.push([x, W.z0])
    }
    for (let z = W.z0 + 7.12; z < W.z1 - 1; z += 7.12) {
      cs.push([W.x0, z])
      cs.push([W.x1, z])
    }
    cs.push([W.x0, W.z1], [W.x1, W.z1])
    return cs
  }, [W.x0, W.x1, W.z0, W.z1])

  const H = 8.6
  const width = W.x1 - W.x0
  const depth = W.z1 - W.z0
  const cz = (W.z0 + W.z1) / 2

  return (
    <group>
      {/* 바닥 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color={P.ground} roughness={1} />
      </mesh>
      <Strip x0={-180} x1={180} z0={W.z1} z1={41.2} c={P.yard} y={-0.02} />
      <Strip x0={W.x0 - 1} x1={W.x1 + 1} z0={W.z1} z1={27.6} c="#D6D6D2" y={-0.012} />

      {/* 차선 */}
      <Strip x0={30} x1={180} z0={28.5} z1={28.7} c={P.lane} />
      <Strip x0={-180} x1={-30} z0={28.5} z1={28.7} c={P.lane} />
      <Strip x0={-180} x1={180} z0={40.9} z1={41.1} c={P.lane} />
      {dashes.map((x) => (
        <Strip key={x} x0={x} x1={x + 3} z0={34.75} z1={34.95} c={P.lane} />
      ))}
      {dockXs.slice(0, -1).map((x, i) => {
        const mx = (x + dockXs[i + 1]) / 2
        return <Strip key={i} x0={mx - 0.07} x1={mx + 0.07} z0={13.4} z1={26.5} c={P.lane} />
      })}

      {/* 게이트 */}
      <Block p={[37.5, 1.3, 26.6]} s={[2.4, 2.6, 2.2]} c={P.wall} cast />
      <Block p={[37.5, 2.68, 26.6]} s={[2.9, 0.16, 2.7]} c={P.frame} cast />
      <Block p={[38.9, 1.05, 31.2]} s={[0.12, 0.12, 6.4]} c={P.frame} cast />
      <Html position={[37.5, 3.6, 26.6]} center zIndexRange={[10, 0]}>
        <div className="tag3d tag3d--ghost">GATE</div>
      </Html>

      {/* 건물 슬래브 */}
      <Block p={[0, -0.06, cz]} s={[width, 0.14, depth]} c={P.slab} rough={0.85} />

      {/* 저층 벽 (컷어웨이 모형) */}
      <Block p={[0, 0.55, W.z0]} s={[width, 1.1, 0.24]} c={P.wall} cast />
      <Block p={[W.x0, 0.55, cz]} s={[0.24, 1.1, depth]} c={P.wall} cast />
      <Block p={[W.x1, 0.55, cz]} s={[0.24, 1.1, depth]} c={P.wall} cast />
      {southWall.map(([a, b], i) => (
        <Block key={i} p={[(a + b) / 2, 0.55, W.z1]} s={[b - a, 1.1, 0.24]} c={P.wall} cast />
      ))}

      {/* 기둥 + 링 빔 (골조 표현) */}
      {columns.map(([x, z], i) => (
        <Block key={i} p={[x, H / 2, z]} s={[0.3, H, 0.3]} c={P.frame} cast />
      ))}
      <Block p={[0, H, W.z0]} s={[width + 0.3, 0.22, 0.22]} c={P.frame} />
      <Block p={[W.x0, H, cz]} s={[0.22, 0.22, depth]} c={P.frame} />
      <Block p={[W.x1, H, cz]} s={[0.22, 0.22, depth]} c={P.frame} />

      {/* 도크 문틀 + 레벨러 + 스테이징 존 */}
      {dockXs.map((x, i) => (
        <group key={i}>
          <Block p={[x - 1.8, 2.3, W.z1]} s={[0.2, 4.6, 0.3]} c={P.frame} cast />
          <Block p={[x + 1.8, 2.3, W.z1]} s={[0.2, 4.6, 0.3]} c={P.frame} cast />
          <Block p={[x, 4.62, W.z1]} s={[3.8, 0.24, 0.3]} c={P.frame} cast />
          <Block p={[x, 0.04, W.z1 - 0.55]} s={[2.7, 0.08, 1.1]} c="#BDBDB8" />
          <Strip x0={x - 1.95} x1={x + 1.95} z0={8.7} z1={12.6} c={P.zone} y={0.008} />
          <Strip x0={x - 1.95} x1={x + 1.95} z0={8.7} z1={8.8} c={P.zoneLine} y={0.012} />
          <Strip x0={x - 1.95} x1={x - 1.85} z0={8.7} z1={12.6} c={P.zoneLine} y={0.012} />
          <Strip x0={x + 1.85} x1={x + 1.95} z0={8.7} z1={12.6} c={P.zoneLine} y={0.012} />
        </group>
      ))}

      {/* 메인 통로 점선 */}
      {Array.from({ length: 19 }, (_, i) => -26 + i * 3).map((x) => (
        <Strip key={x} x0={x} x1={x + 1.6} z0={layout.corridorZ - 0.06} z1={layout.corridorZ + 0.06} c={P.zoneLine} />
      ))}

      {/* 충전 스테이션 */}
      <Strip x0={-27.7} x1={-23.9} z0={layout.chargers[0].z - 1.1} z1={layout.chargers[2].z + 1.1} c={P.zone} y={0.008} />
      {layout.chargers.map((c, i) => (
        <group key={i}>
          <Block p={[-27.45, 0.75, c.z]} s={[0.45, 1.5, 0.9]} c={P.frame} cast />
          <mesh position={[-27.2, 1.25, c.z]}>
            <boxGeometry args={[0.04, 0.12, 0.3]} />
            <meshBasicMaterial color={P.ok} />
          </mesh>
        </group>
      ))}
      <Html position={[-25.8, 2.4, layout.chargers[1].z]} center zIndexRange={[10, 0]}>
        <div className="tag3d tag3d--ghost">충전</div>
      </Html>

      {/* 랙 열 라벨 */}
      {layout.rows.map((r) => (
        <Html key={r.idx} position={[-24.1, L.RACK_H + 0.4, r.z]} center zIndexRange={[10, 0]}>
          <div className="tag3d tag3d--row">{r.letter}</div>
        </Html>
      ))}
    </group>
  )
}
