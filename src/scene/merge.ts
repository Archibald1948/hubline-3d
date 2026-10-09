// 여러 박스/원통을 정점 색으로 칠해 하나의 지오메트리로 합친다 (드로우콜 절감)
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface Part {
  geo: THREE.BufferGeometry
  pos: [number, number, number]
  rot?: [number, number, number]
  color: string
}

const cache = new Map<string, THREE.BufferGeometry>()
const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const one = new THREE.Vector3(1, 1, 1)
const v = new THREE.Vector3()
const c = new THREE.Color()

export function merged(key: string, build: () => Part[]): THREE.BufferGeometry {
  const hit = cache.get(key)
  if (hit) return hit
  const geos = build().map((p) => {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()) as THREE.BufferGeometry
    g.deleteAttribute('uv')
    const r = p.rot ?? [0, 0, 0]
    g.applyMatrix4(m4.compose(v.set(...p.pos), q.setFromEuler(e.set(r[0], r[1], r[2])), one))
    c.set(p.color)
    const n = g.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return g
  })
  const out = mergeGeometries(geos, false)!
  out.computeBoundingSphere()
  cache.set(key, out)
  return out
}

export const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 })
export const vcMatMatte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
export const cyl = (r: number, h: number, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg)
