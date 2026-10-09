import type { DockState, Forklift, Shipment, Site, Truck } from '../sim/engine'
import { TRUCK_MODELS } from '../sim/engine'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export function fmtClock(t: number, sec = false): string {
  const s = Math.floor(((t % 86400) + 86400) % 86400)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  if (!sec) return `${hh}:${mm}`
  return `${hh}:${mm}:${String(s % 60).padStart(2, '0')}`
}

export function fmtDate(day0: Date, t: number): string {
  const d = new Date(day0.getTime() + Math.floor(t / 86400) * 86400000)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`
}

export function fmtDur(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60))
  if (m < 60) return `${m}분`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

export const DIR_LABEL = { in: '입고', out: '출고' } as const

export const DOCK_STATE_LABEL: Record<DockState, string> = {
  free: '사용 가능',
  reserved: '접안 중',
  occupied: '작업 중',
  maintenance: '점검 중',
}

export function truckPhaseLabel(site: Site, tr: Truck): string {
  const s = site.shipOf(tr)
  switch (tr.phase) {
    case 'enroute':
      return '운행 중'
    case 'arriving':
      return '게이트 통과 · 대기장 진입'
    case 'queued':
      return `대기장 ${tr.lane + 1}번 레인`
    case 'docking':
      return '도크 접안 중'
    case 'docked':
      if (tr.sealAt != null) return '봉인·서류 처리'
      return s.dir === 'in' ? '하역 중' : '상차 중'
    case 'departing':
      return '출차'
    case 'gone':
      return '출차 완료'
  }
}

export function shipStatusLabel(s: Shipment): string {
  switch (s.status) {
    case 'planned':
      return '예정'
    case 'enroute':
      return '운행 중'
    case 'yard':
      return '야드'
    case 'docked':
      return s.dir === 'in' ? '하역 중' : '상차 중'
    case 'done':
      return '완료'
  }
}

export function flStateLabel(f: Forklift): string {
  const d = f.task?.dir
  switch (f.state) {
    case 'idle':
      return '대기'
    case 'toPick':
      return d === 'in' ? '도크로 이동' : '랙으로 이동'
    case 'picking':
      return d === 'in' ? '트럭에서 하역' : '랙에서 피킹'
    case 'toDrop':
      return d === 'in' ? '랙으로 운반' : '도크로 운반'
    case 'dropping':
      return d === 'in' ? '랙 적치' : '트럭 상차'
    case 'toCharge':
      return '충전소 이동'
    case 'charging':
      return '충전 중'
    case 'down':
      return '고장 · 정비 중'
  }
}

export const modelName = (tr: Truck) => TRUCK_MODELS[tr.model].name
