import type { ReactNode } from 'react'
import * as L from '../sim/layout'
import { type Bay, type Dock, type Forklift, type Sel, type Shipment, type Site, type Truck } from '../sim/engine'
import { useUi, world } from '../store'
import { truckAlert } from '../scene/Trucks'
import { DIR_LABEL, DOCK_STATE_LABEL, flStateLabel, fmtClock, fmtDur, modelName, shipStatusLabel, truckPhaseLabel } from './labels'

function Link({ sel, children }: { sel: Sel; children: ReactNode }) {
  const select = useUi((s) => s.select)
  return (
    <button type="button" className="link" onClick={() => select(sel)}>
      {children}
    </button>
  )
}

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Progress({ value, max, tone }: { value: number; max: number; tone?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={`progress${tone ? ` progress--${tone}` : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

function DirBadge({ dir }: { dir: 'in' | 'out' }) {
  return <span className={`dir dir--${dir}`}>{DIR_LABEL[dir]}</span>
}

function Head({ kicker, title, sub, onClose }: { kicker: ReactNode; title: ReactNode; sub?: ReactNode; onClose: () => void }) {
  return (
    <div className="insp-head">
      <div className="insp-kicker">{kicker}</div>
      <h2 className="insp-title">{title}</h2>
      {sub && <p className="insp-sub">{sub}</p>}
      <button type="button" className="icon-btn insp-close" onClick={onClose} aria-label="선택 해제">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

function slotText(s: Shipment) {
  return `${fmtClock(s.winStart)}–${fmtClock(s.winEnd)}`
}

function estFinish(site: Site, tr: Truck, s: Shipment, t: number): number | null {
  if (tr.phase !== 'docked') return null
  if (tr.sealAt != null) return tr.sealAt
  const rem = s.pallets - tr.moved
  const active = Math.max(1, site.forklifts.filter((f) => f.task?.truckId === tr.id).length)
  return t + (rem * 300) / active + 150
}

function ShipmentBody({ site, s }: { site: Site; s: Shipment }) {
  const t = world.time
  const tr = site.trucks.get(s.truckId)
  const lateEta = s.status !== 'done' && t >= s.etaKnownAt && s.arrivedAt == null && s.eta > s.winEnd
  const lateNow = s.onTime === false || (s.dir === 'out' && s.doneAt == null && t > s.due)
  const fin = tr ? estFinish(site, tr, s, t) : null
  return (
    <>
      <div className="pills">
        <span className={`pill${s.status === 'docked' ? ' pill--ink' : ''}`}>{tr && s.status !== 'done' && s.status !== 'planned' ? truckPhaseLabel(site, tr) : shipStatusLabel(s)}</span>
        {lateNow && <span className="pill pill--crit">기한 초과</span>}
        {!lateNow && lateEta && <span className="pill pill--warn">지연 예상</span>}
        {s.onTime === true && <span className="pill pill--ok">정시</span>}
        {s.urgent && <span className="pill pill--crit">긴급</span>}
        {tr && tr.brokenUntil != null && t < tr.brokenUntil && <span className="pill pill--crit">차량 고장 · {fmtClock(tr.brokenUntil)} 수리 예정</span>}
      </div>
      {(s.status === 'docked' || s.status === 'done') && (
        <div className="prog-block">
          <div className="prog-row">
            <span>{s.dir === 'in' ? '하역' : '상차'} 진행</span>
            <strong>
              {s.status === 'done' ? s.pallets : tr?.moved ?? 0} / {s.pallets} PLT
            </strong>
          </div>
          <Progress value={s.status === 'done' ? s.pallets : tr?.moved ?? 0} max={s.pallets} />
          {fin != null && <p className="muted small">예상 완료 {fmtClock(fin)}</p>}
        </div>
      )}
      <KV
        rows={[
          [s.dir === 'in' ? '출발지' : '배송지', s.partner],
          ['운송사', s.carrier],
          ['예약 슬롯', slotText(s)],
          [s.dir === 'in' ? '도착 기한' : '출차 마감', fmtClock(s.due)],
          [
            s.arrivedAt != null ? '게이트 도착' : '도착 예정',
            s.arrivedAt != null ? (
              fmtClock(s.arrivedAt)
            ) : t >= s.etaKnownAt ? (
              <span className={lateEta ? 'tone-crit' : ''}>{fmtClock(s.eta)} (GPS)</span>
            ) : (
              <span className="muted">GPS 연동 전</span>
            ),
          ],
          ['야드 대기', s.arrivedAt != null ? fmtDur((s.dockedAt ?? (s.status === 'done' ? s.arrivedAt : t)) - s.arrivedAt) : '—'],
          ['도크', s.dockId ? <Link sel={{ kind: 'dock', id: s.dockId }}>{s.dockId}</Link> : '미배정'],
          ['차량', tr ? <Link sel={{ kind: 'truck', id: tr.id }}>{`${tr.plate} · ${modelName(tr)}`}</Link> : '출차 완료'],
          ['완료', s.doneAt != null ? fmtClock(s.doneAt) : '—'],
        ]}
      />
      <h4 className="insp-sec">적재 품목</h4>
      <table className="lines">
        <thead>
          <tr>
            <th>로케이션</th>
            <th>품목</th>
            <th className="num">수량</th>
          </tr>
        </thead>
        <tbody>
          {s.lines.map((l, i) => {
            const b = site.bays[l.bay]
            return (
              <tr key={i}>
                <td>
                  <Link sel={{ kind: 'bay', id: String(b.idx) }}>{b.code}</Link>
                </td>
                <td className="ellip">{b.name}</td>
                <td className="num">
                  {l.done}/{l.qty}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

function TruckView({ site, tr, onClose }: { site: Site; tr: Truck; onClose: () => void }) {
  const s = site.shipOf(tr)
  const follow = useUi((x) => x.follow)
  const setFollow = useUi((x) => x.setFollow)
  const alert = truckAlert(site, tr, world.time)
  const inScene = tr.phase !== 'enroute' && tr.phase !== 'gone'
  return (
    <>
      <Head
        kicker={
          <>
            <DirBadge dir={s.dir} /> <Link sel={{ kind: 'shipment', id: s.id }}>{s.id}</Link>
          </>
        }
        title={tr.plate}
        sub={`${modelName(tr)} · ${s.carrier}`}
        onClose={onClose}
      />
      {alert === 'wait' && <p className="note note--warn">야드 대기 15분 초과</p>}
      <ShipmentBody site={site} s={s} />
      {inScene && (
        <label className="toggle">
          <input id="follow-toggle" type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          <span>카메라로 따라가기</span>
        </label>
      )}
    </>
  )
}

function ShipmentView({ site, s, onClose }: { site: Site; s: Shipment; onClose: () => void }) {
  return (
    <>
      <Head kicker={<DirBadge dir={s.dir} />} title={s.id} sub={`${s.pallets} PLT · ${s.lines.length}개 품목`} onClose={onClose} />
      <ShipmentBody site={site} s={s} />
    </>
  )
}

function ForkliftView({ site, f, onClose }: { site: Site; f: Forklift; onClose: () => void }) {
  const follow = useUi((x) => x.follow)
  const setFollow = useUi((x) => x.setFollow)
  const task = f.task
  const bat = f.battery
  return (
    <>
      <Head kicker="지게차" title={f.id} sub={`운전원 ${f.operator} · 전동 카운터밸런스 2.5t`} onClose={onClose} />
      {f.state === 'down' && f.downUntil != null && <p className="note note--crit">유압 계통 이상 · 정비 완료 예정 {fmtClock(f.downUntil)}</p>}
      <div className="pills">
        <span className={`pill${f.state === 'idle' ? '' : f.state === 'down' ? ' pill--crit' : ' pill--ink'}`}>{flStateLabel(f)}</span>
        {f.carrying && <span className="pill">팔레트 적재</span>}
      </div>
      <div className="prog-block">
        <div className="prog-row">
          <span>배터리</span>
          <strong className={bat < 25 ? 'tone-crit' : bat < 45 ? 'tone-warn' : ''}>{bat.toFixed(0)}%</strong>
        </div>
        <Progress value={bat} max={100} tone={bat < 25 ? 'crit' : bat < 45 ? 'warn' : 'ok'} />
        {f.state === 'charging' && <p className="muted small">완충까지 약 {fmtDur(((96 - bat) / 1.25) * 60)}</p>}
      </div>
      <KV
        rows={[
          ['현재 작업', task ? <Link sel={{ kind: 'shipment', id: task.shipId }}>{task.shipId}</Link> : '—'],
          ['구간', task ? (task.dir === 'in' ? `${task.dockId} → ${site.bays[task.bay].code}` : `${site.bays[task.bay].code} → ${task.dockId}`) : '—'],
          ['로케이션', task ? <Link sel={{ kind: 'bay', id: String(task.bay) }}>{`${site.bays[task.bay].code} · ${site.bays[task.bay].name}`}</Link> : '—'],
          ['오늘 처리', `${f.pallets} PLT`],
          ['주행 거리', `${(f.distance / 1000).toFixed(2)} km`],
        ]}
      />
      <label className="toggle">
        <input id="follow-toggle" type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        <span>카메라로 따라가기</span>
      </label>
    </>
  )
}

function DockView({ site, d, onClose }: { site: Site; d: Dock; onClose: () => void }) {
  const st = site.dockState(d)
  const tr = d.truckId ? site.trucks.get(d.truckId) : undefined
  const s = tr ? site.shipOf(tr) : undefined
  const crews = site.forklifts.filter((f) => f.task?.dockId === d.id)
  const util = site.elapsed ? (d.busySec / site.elapsed) * 100 : 0
  return (
    <>
      <Head kicker="도크" title={d.id} sub={`남측 ${d.idx + 1}번 게이트 · 레벨러 2.7m`} onClose={onClose} />
      <div className="pills">
        <span className={`pill pill--${st === 'free' ? 'ok' : st === 'maintenance' ? 'warn' : st === 'occupied' ? 'ink' : ''}`}>{DOCK_STATE_LABEL[st]}</span>
        {d.maintPending && <span className="pill pill--warn">작업 후 점검 예정</span>}
      </div>
      {tr && s && (
        <div className="sub-card">
          <div className="sub-card-row">
            <DirBadge dir={s.dir} />
            <Link sel={{ kind: 'truck', id: tr.id }}>{tr.plate}</Link>
            <span className="muted">{truckPhaseLabel(site, tr)}</span>
          </div>
          {tr.phase === 'docked' && (
            <>
              <Progress value={tr.moved} max={s.pallets} />
              <p className="muted small">
                {tr.moved} / {s.pallets} PLT · 지게차 {crews.length}대 투입
              </p>
            </>
          )}
        </div>
      )}
      <KV
        rows={[
          ['오늘 회전', `${d.turns}회`],
          ['처리 팔레트', `${d.pallets} PLT`],
          ['평균 작업시간', d.turns ? fmtDur(d.serviceSum / d.turns) : '—'],
          ['가동률', `${util.toFixed(0)}%`],
          ['점검 종료', d.maintUntil != null ? fmtClock(d.maintUntil) : '—'],
        ]}
      />
      {crews.length > 0 && (
        <>
          <h4 className="insp-sec">투입 지게차</h4>
          <ul className="mini-list">
            {crews.map((f) => (
              <li key={f.id}>
                <Link sel={{ kind: 'forklift', id: f.id }}>{f.id}</Link>
                <span className="muted">{flStateLabel(f)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="btn" onClick={() => site.toggleMaintenance(d.id, world.time)}>
        {d.maintUntil != null ? '점검 해제하고 운영 재개' : d.maintPending ? '점검 예약 취소' : '점검 모드로 전환'}
      </button>
    </>
  )
}

function BayView({ site, b, onClose }: { site: Site; b: Bay; onClose: () => void }) {
  const st = site.bayStatus(b)
  const related = site.shipments.filter((s) => s.status !== 'done' && s.lines.some((l) => l.bay === b.idx && l.done < l.qty))
  const row = site.layout.rows[b.row]
  return (
    <>
      <Head kicker={`로케이션 · ${row.letter}열 ${b.bay + 1}번 베이`} title={b.code} sub={b.name} onClose={onClose} />
      <div className="pills">
        <span className={`pill pill--${st === 'out' ? 'crit' : st === 'low' ? 'warn' : st === 'full' ? 'ink' : 'ok'}`}>
          {st === 'out' ? '품절' : st === 'low' ? '재고 부족' : st === 'full' ? '만재' : '정상'}
        </span>
        <span className="pill">SKU {b.sku}</span>
      </div>
      <div className="bay-viz">
        <div className="slots" aria-label={`${b.stock}/${L.BAY_CAP} 팔레트`}>
          {Array.from({ length: L.BAY_CAP }, (_, i) => {
            const lv = L.LEVELS - 1 - Math.floor(i / 2)
            const slot = lv * 2 + (i % 2)
            return <i key={i} className={slot < b.stock ? 'on' : ''} />
          })}
        </div>
        <div>
          <p className="kpi-num">
            {b.stock}
            <small> / {L.BAY_CAP} PLT</small>
          </p>
          <p className="muted small">4단 × 2열 선반</p>
          <p className="small">
            입고 예정 <strong>+{b.resIn}</strong> · 출고 예정 <strong>−{b.resOut}</strong>
          </p>
        </div>
      </div>
      <KV
        rows={[
          ['예상 재고', `${b.stock + b.resIn - b.resOut} PLT`],
          ['마지막 변동', b.lastMove != null ? fmtClock(b.lastMove) : '—'],
          ['보관 조건', site.cfg.catalog === 'cold' ? '냉장·냉동 (−18~5℃)' : '상온'],
        ]}
      />
      {related.length > 0 && (
        <>
          <h4 className="insp-sec">연결된 입출고</h4>
          <ul className="mini-list">
            {related.slice(0, 8).map((s) => {
              const l = s.lines.find((x) => x.bay === b.idx)!
              return (
                <li key={s.id}>
                  <DirBadge dir={s.dir} />
                  <Link sel={{ kind: 'shipment', id: s.id }}>{s.id}</Link>
                  <span className="muted">
                    {l.done}/{l.qty} · {fmtClock(s.winStart)}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

function Overview({ site }: { site: Site }) {
  const t = world.time
  const select = useUi((s) => s.select)
  const yard = [...site.trucks.values()].filter((tr) => tr.phase === 'arriving' || tr.phase === 'queued' || tr.phase === 'docking')
  return (
    <>
      <div className="insp-head insp-head--plain">
        <div className="insp-kicker">사이트 현황</div>
        <h2 className="insp-title">{site.cfg.name}</h2>
        <p className="insp-sub">3D 화면에서 트럭·도크·지게차·랙을 눌러 실시간 상태를 확인하세요.</p>
      </div>

      <h4 className="insp-sec">도크</h4>
      <div className="dock-grid">
        {site.docks.map((d) => {
          const st = site.dockState(d)
          const tr = d.truckId ? site.trucks.get(d.truckId) : undefined
          const s = tr ? site.shipOf(tr) : undefined
          const pct = tr && s && tr.phase === 'docked' ? (tr.moved / s.pallets) * 100 : 0
          return (
            <button key={d.id} type="button" className={`dock-chip dock-chip--${st}`} onClick={() => select({ kind: 'dock', id: d.id })}>
              <span className="dock-chip-id">{d.id}</span>
              <span className="dock-chip-st">{s ? DIR_LABEL[s.dir] : DOCK_STATE_LABEL[st]}</span>
              <i style={{ width: `${pct}%` }} />
            </button>
          )
        })}
      </div>

      <h4 className="insp-sec">
        야드 차량 <span className="muted">{yard.length}대</span>
      </h4>
      {yard.length ? (
        <ul className="mini-list">
          {yard.map((tr) => {
            const s = site.shipOf(tr)
            return (
              <li key={tr.id}>
                <DirBadge dir={s.dir} />
                <Link sel={{ kind: 'truck', id: tr.id }}>{tr.plate}</Link>
                <span className="muted">
                  {truckPhaseLabel(site, tr)}
                  {tr.phase === 'queued' ? ` · ${fmtDur(site.dwellSoFar(tr, t))}` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted small">대기 중인 차량이 없습니다.</p>
      )}

      <h4 className="insp-sec">지게차</h4>
      <ul className="fl-list">
        {site.forklifts.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => select({ kind: 'forklift', id: f.id })}>
              <span className="fl-id">{f.id}</span>
              <span className="fl-st">{flStateLabel(f)}</span>
              <span className={`fl-bat${f.battery < 25 ? ' is-low' : ''}`}>
                <i style={{ width: `${f.battery}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h4 className="insp-sec">전체 사이트</h4>
      <div className="table-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th>사이트</th>
              <th className="num">정시율</th>
              <th className="num">도크</th>
              <th className="num">대기</th>
              <th className="num">품절</th>
            </tr>
          </thead>
          <tbody>
            {world.sites.map((s) => {
              const k = s.kpis(t)
              return (
                <tr key={s.cfg.id} className={s === site ? 'is-on' : ''}>
                  <td>{s.cfg.short}</td>
                  <td className="num">{k.onTimePct.toFixed(0)}%</td>
                  <td className="num">
                    {k.occupied}/{k.opDocks}
                  </td>
                  <td className="num">{k.yardCount}</td>
                  <td className={`num${k.out ? ' tone-crit' : ''}`}>{k.out}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Inspector() {
  useUi((s) => s.tick)
  const sel = useUi((s) => s.sel)
  const select = useUi((s) => s.select)
  const siteId = useUi((s) => s.siteId)
  const site = world.site(siteId)
  const close = () => select(null, false)

  let body: ReactNode = <Overview site={site} />
  if (sel) {
    if (sel.kind === 'truck') {
      const tr = site.trucks.get(sel.id)
      body = tr ? <TruckView site={site} tr={tr} onClose={close} /> : <Gone onClose={close} />
    } else if (sel.kind === 'shipment') {
      const s = site.shipById.get(sel.id)
      body = s ? <ShipmentView site={site} s={s} onClose={close} /> : <Gone onClose={close} />
    } else if (sel.kind === 'forklift') {
      const f = site.forklifts.find((x) => x.id === sel.id)
      body = f ? <ForkliftView site={site} f={f} onClose={close} /> : <Gone onClose={close} />
    } else if (sel.kind === 'dock') {
      const d = site.docks.find((x) => x.id === sel.id)
      body = d ? <DockView site={site} d={d} onClose={close} /> : <Gone onClose={close} />
    } else if (sel.kind === 'bay') {
      const b = site.bays[Number(sel.id)]
      body = b ? <BayView site={site} b={b} onClose={close} /> : <Gone onClose={close} />
    }
  }
  return <aside className="insp">{body}</aside>
}

function Gone({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Head kicker="선택 항목" title="기록 보관됨" onClose={onClose} />
      <p className="muted">이 항목은 출차가 끝나 현장 목록에서 빠졌습니다. 타임라인에서 다른 건을 선택하세요.</p>
    </>
  )
}
