import { useEffect, useRef, useState } from 'react'
import type { ScenarioKind } from '../sim/engine'
import { useUi, world, type BuildingMode, type ViewMode } from '../store'
import { daylight } from '../scene/Lighting'

const MODES: [ViewMode, string][] = [
  ['base', '기본'],
  ['stock', '재고'],
  ['traffic', '동선'],
]

const BUILDING: [BuildingMode, string, string][] = [
  ['auto', '자동', '확대하거나 대상을 고르면 지붕을 걷고 벽을 낮춥니다'],
  ['inside', '내부', '항상 지붕을 걷고 안을 보여 줍니다'],
  ['outside', '외관', '항상 지붕과 벽을 보여 줍니다'],
]

const SCENARIOS: { k: ScenarioKind; title: string; desc: string }[] = [
  { k: 'urgent', title: '긴급 출고', desc: '4분 뒤 도착, 55분 내 출차 · 도크·지게차 우선' },
  { k: 'surge', title: '입고 몰림', desc: '예약 외 입고 트럭 4대 동시 도착' },
  { k: 'forkliftDown', title: '지게차 고장', desc: '작업 중인 1대가 35~50분 정지' },
  { k: 'truckDown', title: '트럭 고장', desc: '접안 차량 시동 불능 · 도크 30~45분 점유' },
]

export function StageToolbar() {
  useUi((s) => s.tick)
  const viewMode = useUi((s) => s.viewMode)
  const setViewMode = useUi((s) => s.setViewMode)
  const lightMode = useUi((s) => s.lightMode)
  const setLightMode = useUi((s) => s.setLightMode)
  const buildingMode = useUi((s) => s.buildingMode)
  const setBuildingMode = useUi((s) => s.setBuildingMode)
  const trigger = useUi((s) => s.trigger)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isNight = daylight(world.time) < 0.5

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="stage-bar">
      <div className="seg seg--float" role="tablist" aria-label="보기 모드">
        {MODES.map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={viewMode === m} className={viewMode === m ? 'is-on' : ''} onClick={() => setViewMode(m)}>
            {label}
          </button>
        ))}
      </div>
      <div className="seg seg--float seg--labeled" role="radiogroup" aria-label="건물 보기">
        <span className="seg-label">건물</span>
        {BUILDING.map(([m, label, title]) => (
          <button key={m} type="button" role="radio" aria-checked={buildingMode === m} title={title} className={buildingMode === m ? 'is-on' : ''} onClick={() => setBuildingMode(m)}>
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`chip-btn${lightMode === 'day' ? ' is-on' : ''}`}
        onClick={() => setLightMode(lightMode === 'auto' ? 'day' : 'auto')}
        title={lightMode === 'auto' ? '시뮬레이션 시각에 맞춰 조명이 바뀝니다' : '항상 낮 조명'}
      >
        {lightMode === 'auto' ? (
          isNight ? (
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z" fill="currentColor" />
            </svg>
          ) : (
            <SunIcon />
          )
        ) : (
          <SunIcon />
        )}
        {lightMode === 'auto' ? '조명 · 시각 연동' : '조명 · 낮 고정'}
      </button>
      <div className="menu-wrap" ref={menuRef}>
        <button type="button" className={`chip-btn chip-btn--ink${open ? ' is-open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" fill="currentColor" />
          </svg>
          이벤트 발생
        </button>
        {open && (
          <div className="menu" role="menu">
            <p className="menu-cap">현재 사이트에 상황을 일으켜 KPI 변화를 관찰합니다.</p>
            {SCENARIOS.map((s) => (
              <button
                key={s.k}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  trigger(s.k)
                  setOpen(false)
                }}
              >
                <strong>{s.title}</strong>
                <span>{s.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function ModeLegend() {
  const viewMode = useUi((s) => s.viewMode)
  if (viewMode === 'stock')
    return (
      <div className="mode-legend">
        <strong>재고 수준</strong>
        <span className="lg-row">
          <i style={{ background: 'var(--crit)' }} />
          0–1
          <i style={{ background: 'var(--warn)' }} />2
          <i className="lg-ramp lg-ramp--stock" />
          3 → 8 PLT
        </span>
      </div>
    )
  if (viewMode === 'traffic')
    return (
      <div className="mode-legend">
        <strong>지게차 동선 밀도</strong>
        <span className="lg-row">
          적음
          <i className="lg-ramp lg-ramp--heat" />
          많음
        </span>
        <span className="muted">최근 이동 누적 · 반감기 2시간</span>
      </div>
    )
  return null
}

export function ToastView() {
  const toast = useUi((s) => s.toast)
  const clear = useUi((s) => s.clearToast)
  useEffect(() => {
    if (!toast) return
    const id = toast.id
    const h = window.setTimeout(() => clear(id), 4200)
    return () => window.clearTimeout(h)
  }, [toast, clear])
  if (!toast) return null
  return (
    <div className={`toast${toast.ok ? '' : ' toast--fail'}`} role="status">
      <i />
      {toast.text}
    </div>
  )
}
