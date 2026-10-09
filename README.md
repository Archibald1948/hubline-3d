# Hubline — 3D 창고 관제

**라이브 데모 → https://archibald1948.github.io/hubline-3d/**

React + React Three Fiber로 만든 3D 창고 관제 앱입니다. Unity 같은 게임 엔진 없이 브라우저에서 돌아갑니다.
트럭·도크·지게차·랙을 클릭하면 실시간 상태가 뜨고, 사이트 3곳이 시뮬레이션으로 동시에 운영됩니다.

![트럭 고장 이벤트를 일으키고 해당 차량을 선택한 화면](docs/hero.webp)

> 모든 데이터는 시드 고정 시뮬레이션이 만든 가상 데이터입니다. 운송사·거래처·차량번호는 실제와 무관합니다.

## 할 수 있는 것

| 기능 | 내용 |
| --- | --- |
| 오브젝트 클릭 | 트럭(진행률·슬롯·기한·적재 품목), 도크(회전·가동률·투입 지게차·점검 전환), 지게차(작업·배터리·주행거리), 랙 칸(재고 8슬롯·입출고 예정) |
| 실시간 시뮬레이션 | 게이트 진입 → 야드 대기 → 도크 배정 → 후진 접안 → 하역/상차 → 출차. 지게차가 팔레트를 옮길 때마다 랙 재고가 실제로 변함 |
| KPI | 정시 처리율(시간대별 스파크라인), 도크 가동, 야드 대기, 처리량, 품절·부족, 지게차 가동·배터리 |
| 입출고 타임라인 | −2h ~ +3h. 예약 슬롯·야드 대기·도크 작업·GPS 도착 예정·지연을 한 줄에 |
| 보기 모드 | 기본 / **재고 히트맵**(랙 색 = 재고 수준) / **동선 히트맵**(지게차 이동 누적, 반감기 2시간) |
| 일·야간 조명 | 시뮬레이션 시각에 맞춰 해 위치·밝기가 바뀌고 밤에는 가로등·벽등·사무동 창이 켜짐 |
| 이벤트 발생 | 긴급 출고 · 입고 몰림 · 지게차 고장 · 트럭 고장 → KPI가 어떻게 흔들리는지 관찰 |
| 통합 검색 | `⌘K` / `Ctrl+K` / `/` — 차량번호·출입고 ID·SKU·품목·도크·지게차·운전원, 전 사이트 대상 |
| 다중 사이트 | 평택 메가허브 · 이천 콜드체인센터 · 김해 남부물류센터 |

| 야간 | 동선 히트맵 | 재고 히트맵 |
| --- | --- | --- |
| ![야간 조명](docs/night.webp) | ![지게차 동선 히트맵](docs/traffic.webp) | ![재고 히트맵](docs/stock.webp) |

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/
npm run build:single # dist-single/index.html 한 파일 (폰트·JS·CSS 인라인)
```

`main` 브랜치에 푸시하면 GitHub Actions가 빌드해 GitHub Pages에 배포합니다 (`.github/workflows/deploy.yml`).

## 구조

```
src/
  sim/              순수 TS 시뮬레이션 (three 의존 없음)
    engine.ts       World → Site × 3, 1초 고정 스텝, 이벤트 시나리오, 동선 그리드
    layout.ts       랙·통로·도크 기하, 지게차 직교 경로
    path.ts         폴리라인/캐트멀롬 경로 + 시간 기반 모션
    catalog.ts      품목·운송사·거래처 (가상)
  scene/            R3F 3D 뷰 — 데이터를 바꾸지 않고 "보는 방식"만 담당
    Racks.tsx       InstancedMesh: 기둥·빔·팔레트 1,000+개·재고 마커·클릭 히트박스
    Trucks.tsx      트럭 (후진 접안·출차·경광등)
    Forklifts.tsx   지게차 + 포크 승강
    Heat.tsx        동선 히트맵 DataTexture
    Lighting.tsx    시각 연동 조명, 가로등
    Selection.tsx   선택/호버 링, 3D 라벨, 카메라 포커스
  ui/               관제 패널 (KPI, 알림, 인스펙터, 타임라인, 검색, 툴바)
  store.ts          zustand: 선택·사이트·속도·보기 모드, 250ms UI 틱
```

### 데이터 모델

`sites → docks / bays(inventory) / trucks / forklifts / shipments`

- **Shipment**: 입고/출고, 30분 예약 슬롯, 기한(입고 = 슬롯 종료, 출고 = 슬롯 종료 + 45분), 품목 라인(로케이션·수량), 긴급 여부
- **Truck**: `enroute → arriving → queued → docking → docked → departing`
- **Forklift**: 도크↔랙 왕복으로 팔레트 1개씩, 배터리 25% 미만이면 충전, 고장 시 들고 있던 팔레트 원위치 후 재배정
- **Bay**: 4단 × 2열 = 8 PLT, 입고/출고 예약 수량을 따로 관리해 재고가 음수가 되지 않음
- **정시 처리율**: 입고는 게이트 도착 ≤ 슬롯 종료, 출고는 출차 ≤ 출차 마감

3D 화면은 이 데이터의 한 가지 표현일 뿐이라 `sim/`은 그대로 두고 `scene/`만 바꿔 다른 시각화로 교체할 수 있습니다.

### 성능 메모

- 랙·팔레트·마커는 전부 `InstancedMesh` (사이트당 드로우콜 수십 개 수준)
- 3D 위치는 `useFrame`에서 시뮬레이션 객체를 직접 읽고, React 리렌더는 UI 패널만 250ms 간격
- 접속 시 지난 5시간을 미리 시뮬레이션 (약 0.25초) — 첫 화면부터 운영 중인 상태
- 동선 히트맵 감쇠는 전역 스케일 하나로 처리해 스텝당 O(지게차 수)

## 폰트

Pretendard Variable을 소스에 쓰인 글자만 남겨 서브셋 (2MB → 약 110KB).
UI 문구를 바꾸면 다시 실행: `./scripts/subset-font.sh` (`pip install fonttools brotli` 필요)

## 기술 스택

React 19 · TypeScript · Vite 6 · three.js r176 · @react-three/fiber 9 · @react-three/drei 10 · zustand 5
