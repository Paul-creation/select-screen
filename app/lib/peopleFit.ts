// 인원 탭(2·3·4·5인 이상)에 맞는 게임인지 — 메인 "N인 추천"과 /friendslop가 같은 규칙을 쓴다 (순수 함수라 브라우저·테스트에서 바로 불러 쓴다)
import { friendsMax } from './playersMatch';

export type PeopleN = 2 | 3 | 4 | 5; // 5는 "5인 이상"
// 인원별 친구끼리 최대 인원 상한 — 대규모 멀티가 소규모 추천에 섞이지 않게
const MAX_CAP: Record<PeopleN, number> = { 2: 4, 3: 6, 4: 8, 5: 16 };

export const fitsPeople = (g: { min_players?: number | null; max_players?: number | null; party_max?: number | null }, n: PeopleN) => {
  if (g.max_players === 1) return false; // 1인 전용
  const max = friendsMax(g);
  if (!max) return false;
  if (max > MAX_CAP[n]) return false;
  return n >= 5 ? max >= 5 : (g.min_players || 1) <= n && max >= n;
};
