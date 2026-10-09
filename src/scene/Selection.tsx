import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import * as L from '../sim/layout'
import { TRUCK_MODELS, type Sel, type Site } from '../sim/engine'
import { useUi, world } from '../store'
import { DIR_LABEL, DOCK_STATE_LABEL, flStateLabel, truckPhaseLabel } from '../ui/labels'
import { P } from './palette'

export interface Anchor {
  x: number
  z: number
  r: number
  top: number
}

export function selAnchor(site: Site, sel: Sel, t: number): Anchor | null {
  switch (sel.kind) {
    case 'truck': {
      const tr = site.trucks.get(sel.id)
      if (!tr || tr.phase === 'enroute' || tr.phase === 'gone') return null
      const p = site.truckPose(tr, t)
      const len = TRUCK_MODELS[tr.model].len
      return { x: p.x + (Math.sin(p.heading) * len) / 2, z: p.z + (Math.cos(p.heading) * len) / 2, r: len / 2 + 1.4, top: 4.4 }
    }
    case 'shipment': {
      const s = site.shipById.get(sel.id)
      return s ? selAnchor(site, { kind: 'truck', id: s.truckId }, t) : null
    }
    case 'forklift': {
      const f = site.forklifts.find((x) => x.id === sel.id)
      if (!f) return null
      const p = site.forkliftPose(f, t)
      return { x: p.x, z: p.z, r: 2.1, top: 3.0 }
    }
    case 'dock': {
      const d = site.docks.find((x) => x.id === sel.id)
      return d ? { x: d.x, z: 10.9, r: 2.9, top: 0.5 } : null
    }
    case 'bay': {
      const b = site.bays[Number(sel.id)]
      return b ? { x: b.x, z: b.z, r: 2, top: L.RACK_H + 0.5 } : null
    }
  }
}

function Ring({ site, sel, variant }: { site: Site; sel: Sel; variant: 'sel' | 'hover' }) {
  const onTop = sel.kind === 'dock'
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const a = selAnchor(site, sel, world.time)
    m.visible = !!a
    if (!a) return
    const pulse = variant === 'sel' ? 1 + Math.sin(performance.now() / 260) * 0.03 : 1
    m.position.set(a.x, 0.07, a.z)
    m.scale.setScalar(a.r * pulse)
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} renderOrder={onTop ? 10 : 2}>
      <ringGeometry args={[0.9, 1, 72]} />
      <meshBasicMaterial color={variant === 'sel' ? P.ink : P.hover} transparent opacity={variant === 'sel' ? 0.95 : 0.55} depthWrite={false} depthTest={!onTop} />
    </mesh>
  )
}

function BayBox({ site, idx, variant }: { site: Site; idx: number; variant: 'sel' | 'hover' }) {
  const b = site.bays[idx]
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(L.BAY_W + 0.1, L.RACK_H + 0.25, 1.5)), [])
  if (!b) return null
  return (
    <group position={[b.x, (L.RACK_H + 0.25) / 2, b.z]}>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={variant === 'sel' ? P.ink : P.hover} />
      </lineSegments>
      <mesh>
        <boxGeometry args={[L.BAY_W + 0.1, L.RACK_H + 0.25, 1.5]} />
        <meshBasicMaterial color={P.ink} transparent opacity={variant === 'sel' ? 0.1 : 0.05} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Marker({ site, sel, variant }: { site: Site; sel: Sel; variant: 'sel' | 'hover' }) {
  if (sel.kind === 'bay') return <BayBox site={site} idx={Number(sel.id)} variant={variant} />
  return <Ring site={site} sel={sel} variant={variant} />
}

function labelFor(site: Site, sel: Sel): { title: string; sub: string } | null {
  const t = world.time
  switch (sel.kind) {
    case 'truck':
    case 'shipment': {
      const tr = sel.kind === 'truck' ? site.trucks.get(sel.id) : site.trucks.get(site.shipById.get(sel.id)?.truckId ?? '')
      if (!tr || tr.phase === 'enroute' || tr.phase === 'gone') return null
      const s = site.shipOf(tr)
      const prog = tr.phase === 'docked' ? ` · ${tr.moved}/${s.pallets} PLT` : ''
      return { title: tr.plate, sub: `${DIR_LABEL[s.dir]} · ${truckPhaseLabel(site, tr)}${prog}` }
    }
    case 'forklift': {
      const f = site.forklifts.find((x) => x.id === sel.id)
      return f ? { title: f.id, sub: `${flStateLabel(f)} · 배터리 ${Math.round(f.battery)}%` } : null
    }
    case 'dock': {
      const d = site.docks.find((x) => x.id === sel.id)
      return d ? { title: `도크 ${d.id}`, sub: DOCK_STATE_LABEL[site.dockState(d)] } : null
    }
    case 'bay': {
      const b = site.bays[Number(sel.id)]
      return b ? { title: b.code, sub: `${b.name} · ${b.stock}/${L.BAY_CAP} PLT` } : null
    }
  }
  void t
}

function SelLabel({ site, sel }: { site: Site; sel: Sel }) {
  useUi((s) => s.tick)
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const a = selAnchor(site, sel, world.time)
    if (!ref.current) return
    ref.current.visible = !!a
    if (a) ref.current.position.set(a.x, a.top + (sel.kind === 'dock' ? 7.2 : 1.2), a.z)
  })
  const l = labelFor(site, sel)
  if (!l) return null
  return (
    <group ref={ref}>
      <Html center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
        <div className="sel-label">
          <strong>{l.title}</strong>
          <span>{l.sub}</span>
        </div>
      </Html>
    </group>
  )
}

export function SelectionLayer({ site }: { site: Site }) {
  const sel = useUi((s) => s.sel)
  const hover = useUi((s) => s.hover)
  const showHover = hover && !(sel && hover.kind === sel.kind && hover.id === sel.id)
  return (
    <group>
      {showHover && <Marker key={`h-${hover.kind}-${hover.id}`} site={site} sel={hover} variant="hover" />}
      {sel && <Marker key={`s-${sel.kind}-${sel.id}`} site={site} sel={sel} variant="sel" />}
      {sel && sel.kind !== 'dock' && <SelLabel key={`l-${sel.kind}-${sel.id}`} site={site} sel={sel} />}
    </group>
  )
}
