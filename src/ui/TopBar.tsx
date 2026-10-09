import { SPEEDS, useUi, world } from '../store'
import { fmtClock, fmtDate } from './labels'

function tone(pct: number) {
  return pct >= 88 ? 'ok' : pct >= 78 ? 'warn' : 'crit'
}

export function TopBar() {
  useUi((s) => s.tick)
  const siteId = useUi((s) => s.siteId)
  const setSite = useUi((s) => s.setSite)
  const speed = useUi((s) => s.speed)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const setSpeed = useUi((s) => s.setSpeed)
  const t = world.time

  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="1" y="1" width="22" height="22" rx="5" fill="currentColor" />
          <path d="M6 17V8M10 17V8M6 10.5h4M6 14h4M14 17V8M18 17V8M14 10.5h4M14 14h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <div className="brand-text">
          <strong>Hubline</strong>
          <span>창고 관제</span>
        </div>
      </div>

      <nav className="sites" aria-label="사이트 선택">
        {world.sites.map((s) => {
          const k = s.kpis(t)
          return (
            <button key={s.cfg.id} type="button" className={`site-tab${s.cfg.id === siteId ? ' is-on' : ''}`} onClick={() => setSite(s.cfg.id)}>
              <i className={`dot dot--${tone(k.onTimePct)}`} />
              <span className="site-name">{s.cfg.name}</span>
              <span className="site-short">{s.cfg.short}</span>
              <span className="site-kpi">{k.onTimePct.toFixed(0)}%</span>
            </button>
          )
        })}
      </nav>

      <button type="button" className="search-btn" onClick={() => setSearchOpen(true)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>검색</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="clock-group">
        <div className="clock" aria-live="off">
          <span className={`live${speed ? '' : ' is-paused'}`}>{speed ? 'LIVE' : '일시정지'}</span>
          <span className="clock-date">{fmtDate(world.day0, t)}</span>
          <strong className="clock-time">{fmtClock(t, true)}</strong>
        </div>
        <div className="speed" role="group" aria-label="시뮬레이션 속도">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={speed === s ? 'is-on' : ''} onClick={() => setSpeed(s)} title={s ? `실제 1초 = ${s}초` : '일시정지'}>
              {s === 0 ? (
                <svg viewBox="0 0 12 12" width="10" height="10" aria-label="일시정지">
                  <rect x="2" y="1.5" width="2.6" height="9" rx="0.6" fill="currentColor" />
                  <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" fill="currentColor" />
                </svg>
              ) : (
                `${s}×`
              )}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
