import { create } from 'zustand'
import { World, type Sel, type ScenarioKind } from './sim/engine'

export const world = new World()

export const SPEEDS = [0, 20, 80, 300] as const
export type ViewMode = 'base' | 'stock' | 'traffic'
export type LightMode = 'auto' | 'day'
// 건물: 자동(확대·선택·재고/동선 모드에서 단면) / 내부(항상 단면) / 외관(항상 지붕·벽)
export type BuildingMode = 'auto' | 'inside' | 'outside'
export interface Toast {
  id: number
  text: string
  ok: boolean
  ref: Sel | null
  siteId: string
}
let toastSeq = 0

interface UiState {
  siteId: string
  sel: Sel | null
  hover: Sel | null
  speed: number
  tick: number
  follow: boolean
  focusNonce: number
  viewMode: ViewMode
  lightMode: LightMode
  buildingMode: BuildingMode
  searchOpen: boolean
  toast: Toast | null
  fly: { x: number; z: number; n: number } | null
  flyTo: (x: number, z: number) => void
  setViewMode: (m: ViewMode) => void
  setLightMode: (m: LightMode) => void
  setBuildingMode: (m: BuildingMode) => void
  setSearchOpen: (v: boolean) => void
  trigger: (k: ScenarioKind) => void
  clearToast: (id: number) => void
  setSite: (id: string) => void
  select: (sel: Sel | null, focus?: boolean) => void
  setHover: (sel: Sel | null) => void
  setSpeed: (s: number) => void
  bump: () => void
  setFollow: (v: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  siteId: world.sites[0].cfg.id,
  sel: null,
  hover: null,
  speed: world.speed,
  tick: 0,
  follow: false,
  focusNonce: 0,
  viewMode: 'base',
  lightMode: 'auto',
  buildingMode: 'auto',
  searchOpen: false,
  toast: null,
  fly: null,
  flyTo: (x, z) => set((s) => ({ fly: { x, z, n: (s.fly?.n ?? 0) + 1 } })),
  setViewMode: (viewMode) => set({ viewMode }),
  setLightMode: (lightMode) => set({ lightMode }),
  setBuildingMode: (buildingMode) => set({ buildingMode }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  trigger: (k) =>
    set((s) => {
      const site = world.site(s.siteId)
      const r = site.triggerScenario(k, world.time)
      const toast: Toast = { id: ++toastSeq, text: r.text, ok: r.ok, ref: r.ref, siteId: s.siteId }
      return r.ok && r.ref ? { toast, sel: r.ref, focusNonce: s.focusNonce + 1, follow: false } : { toast }
    }),
  clearToast: (id) => set((s) => (s.toast?.id === id ? { toast: null } : s)),
  setSite: (id) => set({ siteId: id, sel: null, hover: null, follow: false }),
  select: (sel, focus = true) =>
    set((s) => ({ sel, follow: sel && s.sel && sel.kind === s.sel.kind && sel.id === s.sel.id ? s.follow : false, focusNonce: focus ? s.focusNonce + 1 : s.focusNonce })),
  setHover: (hover) => set((s) => (sameSel(s.hover, hover) || (!s.hover && !hover) ? s : { hover })),
  setSpeed: (speed) => {
    world.speed = speed
    set({ speed })
  },
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  setFollow: (follow) => set({ follow }),
}))

export const useSite = () => {
  const id = useUi((s) => s.siteId)
  useUi((s) => s.tick)
  return world.site(id)
}

export const sameSel = (a: Sel | null, b: Sel | null) => !!a && !!b && a.kind === b.kind && a.id === b.id
