import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import * as L from '../sim/layout'
import type { Site } from '../sim/engine'
import { useUi, type ViewMode } from '../store'
import { P } from './palette'

const tmp = new THREE.Object3D()
const col = new THREE.Color()
const goodsA = new THREE.Color(P.goodsA)
const goodsB = new THREE.Color(P.goodsB)
const stockLo = new THREE.Color('#E4DED3')
const stockHi = new THREE.Color('#2E2E2E')
const cWarn = new THREE.Color(P.warn)
const cCrit = new THREE.Color(P.crit)

function goodsColor(mode: ViewMode, stock: number, shade: number, out: THREE.Color) {
  if (mode !== 'stock') return out.copy(goodsA).lerp(goodsB, shade)
  if (stock <= 1) return out.copy(cCrit)
  if (stock === 2) return out.copy(cWarn)
  return out.copy(stockLo).lerp(stockHi, (stock - 3) / (L.BAY_CAP - 3))
}

export function Racks({ site }: { site: Site }) {
  const Lg = site.layout
  const { rows } = Lg
  const bays = site.bays
  const select = useUi((s) => s.select)
  const setHover = useUi((s) => s.setHover)

  const uprights = useMemo(() => {
    const arr: [number, number][] = []
    for (const r of rows)
      for (const sx of Lg.sectionX0)
        for (let i = 0; i <= L.BAYS_PER_SECTION; i++) {
          const x = sx + i * L.BAY_W
          arr.push([x, r.z - 0.56], [x, r.z + 0.56])
        }
    return arr
  }, [rows, Lg])

  const beams = useMemo(() => {
    const arr: [number, number, number][] = []
    for (const b of bays)
      for (let lv = 1; lv <= L.LEVELS; lv++) {
        const y = lv === L.LEVELS ? L.RACK_H - 0.1 : 0.12 + lv * L.LEVEL_H - 0.08
        arr.push([b.x, y, b.z - 0.56], [b.x, y, b.z + 0.56])
      }
    return arr
  }, [bays])

  const upRef = useRef<THREE.InstancedMesh>(null)
  const beamRef = useRef<THREE.InstancedMesh>(null)
  const baseRef = useRef<THREE.InstancedMesh>(null)
  const goodsRef = useRef<THREE.InstancedMesh>(null)
  const markRef = useRef<THREE.InstancedMesh>(null)
  const hitRef = useRef<THREE.InstancedMesh>(null)
  const version = useRef(-1)
  const modeRef = useRef<ViewMode | null>(null)
  const goodsMat = useRef<THREE.MeshStandardMaterial>(null)

  useLayoutEffect(() => {
    const up = upRef.current!
    uprights.forEach(([x, z], i) => {
      tmp.position.set(x, L.RACK_H / 2, z)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      up.setMatrixAt(i, tmp.matrix)
    })
    up.instanceMatrix.needsUpdate = true
    const bm = beamRef.current!
    beams.forEach(([x, y, z], i) => {
      tmp.position.set(x, y, z)
      tmp.updateMatrix()
      bm.setMatrixAt(i, tmp.matrix)
    })
    bm.instanceMatrix.needsUpdate = true
    const hit = hitRef.current!
    bays.forEach((b, i) => {
      tmp.position.set(b.x, L.RACK_H / 2, b.z)
      tmp.updateMatrix()
      hit.setMatrixAt(i, tmp.matrix)
    })
    hit.instanceMatrix.needsUpdate = true
    hit.computeBoundingSphere()
  }, [uprights, beams, bays])

  useFrame(() => {
    const mode = useUi.getState().viewMode
    if (version.current === site.stockVersion && modeRef.current === mode) return
    version.current = site.stockVersion
    if (goodsMat.current && modeRef.current !== mode) {
      goodsMat.current.transparent = mode === 'traffic'
      goodsMat.current.opacity = mode === 'traffic' ? 0.28 : 1
      goodsMat.current.needsUpdate = true
    }
    modeRef.current = mode
    const base = baseRef.current!
    const goods = goodsRef.current!
    const mark = markRef.current!
    for (const b of bays) {
      goodsColor(mode, b.stock, b.shade, col)
      for (let s = 0; s < L.BAY_CAP; s++) {
        const i = b.idx * L.BAY_CAP + s
        const on = s < b.stock
        const x = b.x + L.slotX(s)
        const y = L.slotY(s)
        tmp.position.set(x, y + 0.07, b.z)
        tmp.scale.setScalar(on ? 1 : 0)
        tmp.updateMatrix()
        base.setMatrixAt(i, tmp.matrix)
        tmp.position.set(x, y + 0.14 + 0.55, b.z)
        tmp.updateMatrix()
        goods.setMatrixAt(i, tmp.matrix)
        goods.setColorAt(i, col)
      }
      const st = site.bayStatus(b)
      const row = rows[b.row]
      const dir = row.aisleZ > b.z ? 1 : -1
      tmp.position.set(b.x, 0.03, b.z + dir * 0.92)
      tmp.scale.setScalar(st === 'out' || st === 'low' ? 1 : 0)
      tmp.updateMatrix()
      mark.setMatrixAt(b.idx, tmp.matrix)
      mark.setColorAt(b.idx, col.set(st === 'out' ? P.crit : P.warn))
    }
    base.instanceMatrix.needsUpdate = true
    goods.instanceMatrix.needsUpdate = true
    if (goods.instanceColor) goods.instanceColor.needsUpdate = true
    mark.instanceMatrix.needsUpdate = true
    if (mark.instanceColor) mark.instanceColor.needsUpdate = true
  })

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId == null ? null : { kind: 'bay' as const, id: String(e.instanceId) })

  return (
    <group>
      <instancedMesh ref={upRef} args={[undefined, undefined, uprights.length]} castShadow receiveShadow>
        <boxGeometry args={[0.09, L.RACK_H, 0.09]} />
        <meshStandardMaterial color={P.rack} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={beamRef} args={[undefined, undefined, beams.length]} castShadow>
        <boxGeometry args={[L.BAY_W, 0.11, 0.07]} />
        <meshStandardMaterial color={P.beam} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={baseRef} args={[undefined, undefined, bays.length * L.BAY_CAP]} castShadow receiveShadow>
        <boxGeometry args={[1.12, 0.14, 1.06]} />
        <meshStandardMaterial color={P.pallet} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={goodsRef} args={[undefined, undefined, bays.length * L.BAY_CAP]} castShadow receiveShadow>
        <boxGeometry args={[1.04, 1.1, 1.0]} />
        <meshStandardMaterial ref={goodsMat} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={markRef} args={[undefined, undefined, bays.length]}>
        <boxGeometry args={[L.BAY_W - 0.35, 0.04, 0.34]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh
        ref={hitRef}
        args={[undefined, undefined, bays.length]}
        onClick={(e) => {
          e.stopPropagation()
          select(pick(e))
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          setHover(pick(e))
        }}
        onPointerOut={() => setHover(null)}
      >
        <boxGeometry args={[L.BAY_W - 0.06, L.RACK_H, 1.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
