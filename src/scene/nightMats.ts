// 낮/밤에 따라 Lighting이 매 프레임 갱신하는 공유 재질
import * as THREE from 'three'
import { P } from './palette'

function poolTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export const nightMats = {
  window: new THREE.MeshStandardMaterial({ color: P.glassWall, roughness: 0.25, metalness: 0.2, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 }),
  lampHead: new THREE.MeshBasicMaterial({ color: '#d8d8d4' }),
  pool: new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  interior: new THREE.MeshBasicMaterial({ map: null, color: '#fff4dc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
}
nightMats.interior.map = nightMats.pool.map
