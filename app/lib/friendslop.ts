// "우당탕 협동"(friendslop) 판정 — Lethal Company·R.E.P.O. 같은 싸고 웃긴 3~8인 온라인 협동. 순수 함수라 테스트(friendslop.test.mjs)가 .ts를 바로 불러온다
// 저장·뷰 없이 읽을 때 계산한다(게임 목록 gameIndex·카드·상세가 같은 함수를 씀) — 가격이 매일 바뀌어도 따로 갱신할 게 없다
// 수동 지정(games.friendslop): true = 강제 포함, false = 강제 제외, null = 자동 기준
// 자동 기준(모두 만족):
//   1) has_online_coop
//   2) COALESCE(party_max, max_players)가 3 이상 8 이하
//   3) 무료이거나 최신 원화 가격 ≤ 20,000원 (가격 기록이 없으면 역대 최저가 lowest_price로 대체)
//   4) 활동에 voice_chat이 있거나, (코미디 태그 AND 공포 신호[호러계 태그·horror_scare 활동]) — themes(장르 테마)는 쓰지 않는다
export const FS_MIN_PLAYERS = 3;
export const FS_MAX_PLAYERS = 8;
export const FS_MAX_PRICE = 20000;
export const FS_LABEL = '우당탕 협동';
export const FS_TIP = 'Lethal Company, R.E.P.O. 같은 싸고 웃긴 협동 게임';

const COMEDY_TAGS = new Set(['코미디', 'Dark Comedy', '가족코미디']);
const HORROR_TAGS = new Set(['호러', '서바이벌 호러', '심리 공포']);

export type FriendslopInput = {
  friendslop?: boolean | null;
  has_online_coop?: boolean | null;
  party_max?: number | null;
  max_players?: number | null;
  is_free?: boolean | null;
  price?: number | null; // 최신 원화 가격(할인가). 모르면 null
  lowest_price?: number | null;
  tags?: string[] | null;
  activities_confirmed?: string[] | null;
};

// 메인 "N인 추천"의 우당탕 협동 칩 — 후보(trending 8개)가 아니라 전체에서, 그 인원 탭에 맞고(fits) friendslop인 게임을 인기순(heat_rank 낮은 순, 없으면 맨 뒤)으로 limit개
export const FS_PEOPLE_SHOW = 6;
export function topFriendslop<T extends { id: string; heat_rank?: number | null }>(games: T[], fits: (g: T) => boolean, limit = FS_PEOPLE_SHOW): T[] {
  return games
    .filter(fits)
    .sort((a, b) => (a.heat_rank ?? Infinity) - (b.heat_rank ?? Infinity) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function isFriendslop(g: FriendslopInput): boolean {
  if (g.friendslop === true) return true;
  if (g.friendslop === false) return false;
  if (!g.has_online_coop) return false;
  const players = g.party_max ?? g.max_players ?? 0;
  if (players < FS_MIN_PLAYERS || players > FS_MAX_PLAYERS) return false;
  const price = g.price ?? g.lowest_price ?? null;
  if (!g.is_free && (price == null || price > FS_MAX_PRICE)) return false;
  const acts = g.activities_confirmed ?? [];
  if (acts.includes('voice_chat')) return true;
  const tags = g.tags ?? [];
  const comedy = tags.some((t) => COMEDY_TAGS.has(t));
  const horror = acts.includes('horror_scare') || tags.some((t) => HORROR_TAGS.has(t));
  return comedy && horror;
}
