// 3D 월드 팔레트 — 밝은 일러스트 톤 (UI 패널은 모노크롬 유지)
export const P = {
  // 하늘·땅
  bg: '#E6EEF8',
  ground: '#BCD99A',
  grass: '#B3D48E',
  grassDark: '#9CC677',
  road: '#535A64',
  yard: '#666D77',
  apron: '#737A84',
  paving: '#D9DDE2',
  sidewalk: '#E7E2D6',
  curb: '#C9CDD2',
  lane: '#F7F7F2',
  laneYellow: '#F2C230',
  // 건물
  slab: '#E7EAEE',
  floorLine: '#F2C230',
  walkway: '#5FAE72',
  wall: '#F5F6F8',
  clad: '#3D67D6',
  cladDark: '#2E55BF',
  trim: '#1F3A86',
  roof: '#4E77E2',
  roofDark: '#3A62CC',
  skylight: '#DCE7FF',
  glassWall: '#9DC2E8',
  door: '#D8DDE5',
  doorRib: '#BCC3CE',
  shelter: '#2B2F36',
  frame: '#1F2329',
  hazard: '#F2C230',
  // 랙·화물
  rack: '#2E57B8',
  beam: '#F07A2B',
  pallet: '#B98552',
  goodsA: '#D6AC76',
  goodsB: '#C2905A',
  crateBlue: '#3D7DD8',
  crateGreen: '#4FA36A',
  wrap: '#E8EEF3',
  // 장비·차량
  forklift: '#F4B41A',
  forkliftDark: '#2B2D31',
  mast: '#3A3E45',
  ink: '#1E2228',
  trailer: '#F7F8FA',
  chassis: '#2B2E33',
  tire: '#1C1D20',
  rim: '#B8BEC6',
  glass: '#2E4A6B',
  chrome: '#C9CED6',
  headlight: '#FFF6D6',
  // 조경
  tree: '#7DBB5B',
  treeCone: '#4E8C55',
  trunk: '#8A6244',
  bush: '#5E9F4A',
  fence: '#3E6B4A',
  neighbor: '#E3E8EF',
  neighborRoof: '#A9B6C9',
  skin: '#E8C4A0',
  // 상태 (UI와 동일)
  zone: '#EEF1F4',
  zoneLine: '#9AA3AE',
  ok: '#16A34A',
  warn: '#E59500',
  crit: '#E5322D',
  hover: '#5B6573',
  pin: '#2F62E8',
} as const

// 운송사별 브랜드 색 (가상)
export const CARRIER_COLORS: Record<string, string> = {
  가온운송: '#2F62E8',
  누리로지텍: '#E2483D',
  바른화물: '#2FA36B',
  새솔물류: '#F08A24',
  다온익스프레스: '#7A4FD6',
  한결트랜스: '#14A3B8',
  온길로지스: '#E0B11B',
}

export const CONTAINER_COLORS = ['#D8473C', '#2E9A63', '#2F62E8', '#EE8A2A', '#1A9DB2', '#8A8F98', '#B83B72']
export const TREE_COLORS = ['#7DBB5B', '#6AAE4E', '#94C96A', '#5E9F45', '#87C063']
export const CONE_COLORS = ['#3F7F4A', '#4E8C55', '#5A9960']
export const CAR_COLORS = ['#E2483D', '#2F62E8', '#F7F8FA', '#B8BEC6', '#24272C', '#F2C230', '#2FA36B', '#7C8590']
