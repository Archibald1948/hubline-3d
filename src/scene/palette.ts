// 3D 월드 팔레트: 밝은 낮 풍경의 미니어처 톤 (UI 패널은 흑백 유지, 상태색은 UI와 같음)
export const P = {
  // 하늘·땅
  bg: '#CFE3F4',
  ground: '#A9CF86',
  lawn: '#B4D68F',
  road: '#4B5059',
  yard: '#5A606A',
  apron: '#666C75',
  paving: '#D4D7DB',
  sidewalk: '#DAD6CC',
  curb: '#C3C7CC',
  lane: '#F4F4EF',
  laneYellow: '#F2C230',
  // 건물
  slab: '#E3E6EA',
  wall: '#3E68CF',
  plinth: '#9AA2AD',
  trim: '#22357A',
  roof: '#7C8796',
  roofDeck: '#A4ADB9',
  skylight: '#CFE0F6',
  glassWall: '#8DB3DC',
  door: '#D5DAE1',
  shelter: '#2A2E35',
  frame: '#2B2F36',
  hazard: '#F2C230',
  // 랙·화물
  rack: '#2E57B8',
  beam: '#F07A2B',
  pallet: '#B98552',
  goodsA: '#D8AE78',
  goodsB: '#BF8D57',
  // 장비·차량
  forklift: '#F4B41A',
  counterweight: '#3A3D43',
  mast: '#30343A',
  ink: '#1E2228',
  trailer: '#F4F5F7',
  chassis: '#2B2E33',
  tire: '#1C1D20',
  rim: '#B8BEC6',
  glass: '#2E4A6B',
  headlight: '#FFF3CF',
  vest: '#F08A24',
  shirt: '#2F4E86',
  // 조경
  tree: '#7DBB5B',
  trunk: '#7E5A40',
  fence: '#3E6B4A',
  neighbor: '#E2E7EE',
  neighborRoof: '#A7B3C4',
  skin: '#E8C4A0',
  // 상태 (UI와 동일)
  zone: '#C9CED6',
  zoneLine: '#9AA3AE',
  ok: '#16A34A',
  warn: '#E59500',
  crit: '#E5322D',
  hover: '#5B6573',
  pin: '#2F62E8',
} as const

// 운송사별 캡 색 (가상 운송사). 빨강·호박색은 장면에서 경보 전용이라 쓰지 않는다
export const CARRIER_COLORS: Record<string, string> = {
  가온운송: '#2F62E8',
  누리로지텍: '#46536B',
  바른화물: '#2B9A64',
  새솔물류: '#C8D2DE',
  다온익스프레스: '#6F4BC9',
  한결트랜스: '#1499AE',
  온길로지스: '#6E8B3D',
}

export const CONTAINER_COLORS = ['#4B5D7A', '#2E8F5E', '#2F5FD0', '#B9C2CC', '#1A93A8', '#7F8691', '#7A5AA8']
export const TREE_COLORS = ['#7DBB5B', '#6AAE4E', '#94C96A', '#5E9F45', '#87C063', '#73B356']
export const CONE_COLORS = ['#3F7F4A', '#4E8C55', '#5A9960', '#467F52']
export const SHRUB_COLORS = ['#5E9F4A', '#6DAE52', '#4F8F45', '#7DB85C']
export const CAR_COLORS = ['#D9443A', '#2F62E8', '#F4F5F7', '#B8BEC6', '#24272C', '#E8B923', '#2B9A64', '#7C8590', '#F4F5F7', '#24272C']

// 문자열 → 0..1 (같은 차량은 늘 같은 색)
export function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}
