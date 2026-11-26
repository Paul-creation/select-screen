// "알아서 골라줘" 후보 — DB가 거른다. /find와 같은 조건 판정(filterGames)과 "잘 맞는 순" 점수(sortGames의 fit)를 그대로 쓰고,
// 분위기는 moods.ts의 규칙으로 한 번 더 거른다. AI는 여기서 나온 후보 중에서만 고른다
import { EMPTY_QUERY, sortGames, type AbCtx, type AbGame, type AbQuery } from '../abSearch';
import { filterGames, type FindEnv } from '../findSearch';
import { MOODS, MOOD_HOW, isMoodFree, type MoodKey, type PickInput } from './moods';
import { PICK_COUNT } from './validate';

// 입력 → /find와 같은 검색 조건. "어떻게"가 비어 있고 분위기가 대전이면 how를 pvp로 (분위기 규칙과 같은 방향)
export function inputToQuery(i: Pick<PickInput, 'n' | 'how' | 'g' | 'mood'>): AbQuery {
  return { ...EMPTY_QUERY, n: i.n, how: i.how ?? (i.mood ? MOOD_HOW[i.mood] ?? null : null), genres: i.g, gm: 'all', sort: 'fit' };
}

// 입력의 인원·방식·장르를 통과하는 게임 — AI 후보와 운영진 추천이 같은 판정을 쓴다
export function filterByInput(games: AbGame[], input: Pick<PickInput, 'n' | 'how' | 'g' | 'mood'>, env: FindEnv): AbGame[] {
  return filterGames(games, inputToQuery(input), env);
}

const hasAny = (list: string[] | null | undefined, want: string[]) => !!list?.some((x) => want.includes(x));

// 분위기에 맞는 게임인가 — 태그·테마·장르·활동 중 하나라도, 또는 우당탕 협동·대전 플래그
export function matchesMood(g: AbGame, mood: MoodKey | null, ctx: AbCtx): boolean {
  if (isMoodFree(mood)) return true;
  const r = MOODS[mood!];
  return (r.fs === true && g.fs === true) || (r.pvp === true && g.has_pvp === true) ||
    hasAny(g.themes, r.themes) || hasAny(g.genres, r.genres) || hasAny(g.activities_confirmed, r.acts) || (r.tags.length > 0 && ctx.hasTag(g, r.tags));
}

export type RankedResult = { ranked: AbGame[]; moodRelaxed: boolean };

// 점수 순으로 줄 세운 전체 후보. 이미 보여 준 게임(exclude)을 빼고도 분위기에 맞는 게임이 3개 미만이면 분위기를 풀고 이어 붙인다(moodRelaxed)
// blocked: 추천에서 빼는 게임 id(메인 노출 제외·출시 예정) — 보유 게임은 env.owned로
export function rankCandidates(games: AbGame[], input: Pick<PickInput, 'n' | 'how' | 'g' | 'mood'>, env: FindEnv, blocked: ReadonlySet<string>, exclude: ReadonlySet<string> = new Set()): RankedResult {
  const q = inputToQuery(input);
  const pool = games.filter((g) => !blocked.has(g.id) && g.release_status !== 'coming_soon');
  const ranked = sortGames(filterByInput(pool, input, env), q, env.ctx); // 같은 점수면 인기순
  const onMood = ranked.filter((g) => matchesMood(g, input.mood, env.ctx));
  if (onMood.filter((g) => !exclude.has(g.id)).length >= PICK_COUNT) return { ranked: onMood, moodRelaxed: false };
  const rest = ranked.filter((g) => !onMood.includes(g));
  return { ranked: [...onMood, ...rest], moodRelaxed: true };
}
