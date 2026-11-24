// 우당탕 협동 게임 전체 읽기 (서버 전용) — 메인 "N인 추천" 칩(peopleRecs)과 /friendslop 페이지가 같이 쓴다
// 판정은 lib/friendslop의 isFriendslop(수동 지정 games.friendslop 우선) 그대로. 읽는 범위는 온라인 협동 게임 — 수동 true인데 온라인 협동이 아닌 게임은 빠진다(지금 수동 지정은 모두 온라인 협동 게임)
// 수동 지정 칸이 아직 없으면 오류를 무시하고 자동 기준만. 못 읽으면 예외(호출하는 쪽이 처리)
import { selectHomeGames } from './visibleGames';
import { readAllPages } from './paged';
import { getPriceInfo } from './price';
import { isFriendslop } from './friendslop';

export type FsGame = { id: string; min_players: number | null; max_players: number | null; party_max: number | null; heat_rank: number | null };

export async function getFriendslopGames(): Promise<FsGame[]> {
  const [{ data: list, error }, { data: manual }] = await Promise.all([
    readAllPages((from, to) => selectHomeGames('id, min_players, max_players, party_max, heat_rank, has_online_coop, is_free, lowest_price, tags, activities_confirmed, price_history(price, discount_percent, checked_at)')
      .eq('has_online_coop', true).gte('price_history.price', 100)
      .order('id').order('checked_at', { referencedTable: 'price_history', ascending: false }).limit(1, { referencedTable: 'price_history' }).range(from, to)),
    readAllPages((from, to) => selectHomeGames('id, friendslop').not('friendslop', 'is', null).order('id').range(from, to)),
  ]);
  if (error || !list) throw new Error(`우당탕 협동 목록 조회 실패: ${error?.message}`);
  const manualById = new Map((manual || []).map((r: { id: string; friendslop: boolean | null }) => [r.id, r.friendslop]));
  return (list as unknown as (FsGame & Record<string, unknown>)[])
    .filter((g) => isFriendslop({ ...g, friendslop: manualById.get(g.id) ?? null, price: getPriceInfo(g)?.final ?? null } as Parameters<typeof isFriendslop>[0]))
    .map(({ id, min_players, max_players, party_max, heat_rank }) => ({ id, min_players, max_players, party_max, heat_rank }));
}
