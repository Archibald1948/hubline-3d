// 통합 검색 (⌘K / Ctrl+K / '/') — 전 사이트 대상
import { useEffect, useMemo, useRef, useState } from 'react'
import { ROLE_LABEL, type Sel } from '../sim/engine'
import { useUi, world } from '../store'
import { DIR_LABEL, DOCK_STATE_LABEL, flStateLabel, shipStatusLabel, truckPhaseLabel } from './labels'

interface Item {
  siteId: string
  site: string
  sel: Sel
  kind: string
  title: string
  sub: string
  hay: string
  head: string
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\-·_]/g, '')

function buildIndex(): Item[] {
  const out: Item[] = []
  for (const site of world.sites) {
    const base = { siteId: site.cfg.id, site: site.cfg.short }
    const push = (sel: Sel, kind: string, title: string, sub: string, extra = '') =>
      out.push({ ...base, sel, kind, title, sub, hay: norm(`${title} ${sub} ${extra}`), head: norm(title) })
    for (const tr of site.trucks.values()) {
      if (tr.phase === 'gone' || tr.phase === 'enroute') continue
      const s = site.shipOf(tr)
      push({ kind: 'truck', id: tr.id }, '차량', tr.plate, `${DIR_LABEL[s.dir]} · ${truckPhaseLabel(site, tr)} · ${s.id}`, s.carrier)
    }
    for (const s of site.shipments) push({ kind: 'shipment', id: s.id }, s.dir === 'in' ? '입고' : '출고', s.id, `${s.partner} · ${s.carrier} · ${shipStatusLabel(s)}`, s.urgent ? '긴급' : '')
    for (const b of site.bays) push({ kind: 'bay', id: String(b.idx) }, '로케이션', `${b.code} ${b.name}`, `SKU ${b.sku} · ${b.stock}/8 PLT`, b.sku)
    for (const d of site.docks) push({ kind: 'dock', id: d.id }, '도크', `도크 ${d.id}`, DOCK_STATE_LABEL[site.dockState(d)], d.id)
    for (const f of site.forklifts) push({ kind: 'forklift', id: f.id }, '지게차', f.id, `${f.operator} · ${flStateLabel(f)}`, f.operator)
    for (const w of site.workers) push({ kind: 'worker', id: w.id }, '작업자', w.name, `${ROLE_LABEL[w.role]} · ${w.activity}`, ROLE_LABEL[w.role])
    for (const f of Object.values(site.layout.facilities)) push({ kind: 'facility', id: f.id }, '시설', f.name, site.cfg.name, f.id === 'lot' ? '트럭 대기' : f.id === 'gate' ? '게이트 경비실 입차 출차' : '')
  }
  return out
}

export function Search() {
  const open = useUi((s) => s.searchOpen)
  const setOpen = useUi((s) => s.setSearchOpen)
  const siteId = useUi((s) => s.siteId)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const index = useMemo(() => (open ? buildIndex() : []), [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(!useUi.getState().searchOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      requestAnimationFrame(() => input.current?.focus())
    }
  }, [open])

  const results = useMemo(() => {
    const nq = norm(q)
    if (!nq) {
      // 빈 검색어: 현재 사이트의 진행 중 차량·긴급 건
      return index.filter((i) => i.siteId === siteId && (i.sel.kind === 'truck' || (i.sel.kind === 'shipment' && i.hay.includes('긴급')))).slice(0, 12)
    }
    return index
      .map((i) => {
        let score = -1
        if (i.head.startsWith(nq)) score = 3
        else if (i.head.includes(nq)) score = 2
        else if (i.hay.includes(nq)) score = 1
        return { i, score: score < 0 ? -1 : score + (i.siteId === siteId ? 0.5 : 0) }
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.i)
  }, [q, index, siteId])

  useEffect(() => setIdx(0), [q])
  useEffect(() => {
    const el = list.current?.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  if (!open) return null

  const choose = (it: Item) => {
    const st = useUi.getState()
    if (it.siteId !== st.siteId) st.setSite(it.siteId)
    useUi.getState().select(it.sel)
    setOpen(false)
  }

  return (
    <div className="search-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="search" role="dialog" aria-modal="true" aria-label="통합 검색">
        <div className="search-input">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            id="global-search"
            ref={input}
            autoFocus
            value={q}
            placeholder="차량번호, 출입고 ID, SKU, 품목, 도크, 지게차, 작업자, 시설"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIdx((v) => Math.min(results.length - 1, v + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIdx((v) => Math.max(0, v - 1))
              } else if (e.key === 'Enter' && results[idx]) {
                e.preventDefault()
                choose(results[idx])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <p className="search-cap">{q ? `${results.length}건${results.length === 40 ? '+' : ''}` : '야드·도크의 차량과 긴급 건'}</p>
        <ul className="search-list" ref={list} role="listbox">
          {results.map((it, i) => (
            <li key={`${it.siteId}-${it.sel.kind}-${it.sel.id}`} role="option" aria-selected={i === idx}>
              <button type="button" className={i === idx ? 'is-on' : ''} onMouseEnter={() => setIdx(i)} onClick={() => choose(it)}>
                <span className="sr-kind">{it.kind}</span>
                <span className="sr-main">
                  <strong>{it.title}</strong>
                  <span>{it.sub}</span>
                </span>
                <span className={`sr-site${it.siteId === siteId ? ' is-here' : ''}`}>{it.site}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="search-empty">일치하는 항목이 없습니다. 다른 키워드로 검색해 보세요.</li>}
        </ul>
        <div className="search-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 이동
          </span>
          <span>
            <kbd>Enter</kbd> 선택·카메라 이동
          </span>
        </div>
      </div>
    </div>
  )
}
