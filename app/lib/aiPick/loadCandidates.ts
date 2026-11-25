// "알아서 골라줘" 후보 읽기 — 게임 목록 전체를 읽지 않고, 조건(인원·방식·장르·분위기)으로 DB에서 먼저 걸러 id만 가져온 뒤
// 인기순 상위 60개씩 필요한 만큼만 전체 칸(getGameIndex(ids))으로 읽는다. 정확한 판정·점수는 candidates.ts(/find와 같은 함수)가 그 위에서 한다
// DB 거르기는 "넓게 거르는 것"(정확한 판정의 상위 집합)이라 후보를 잘못 빼지 않는다. 결과는 서버 메모리에 10분
import { supabase } from '../supabase';
import { selectGames } from '../visibleGames';
import { readAllPages } from '../paged';
import { getGameIndex } from '../gameIndex';
import { normalizeSearch } from '../searchMatch';
import type { TagTree } from '../tagTree';
import { GENRES, HOW_RULES } from '../abSearch';
import { MOODS, isMoodFree, MOOD_HOW, type PickInput } from './moods';

const TTL = 10 * 60 * 1000;
export const BATCH = 60;

type Rule = { themes?: string[]; genres?: string[]; acts?: string[]; tags?: string[]; fs?: boolean; pvp?: boolean };
type Row = { id: string; heat_rank: number | null };

const memo = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  const v = await load();
  memo.set(key, { at: Date.now(), v });
  return v;
}

// 태그 이름 → 그 칸과 아래 칸 번호 전부 (상위 칸을 고르면 아래 태그를 가진 게임도 맞는 것 — gameNodes와 같은 뜻)
function tagIdsOf(tree: TagTree | null, names: string[]): number[] {
  if (!tree) return [];
  const out = new Set<number>();
  const walk = (id: number) => { if (out.has(id)) return; out.add(id); for (const c of tree.nodes.get(id)?.children ?? []) walk(c); };
  for (const n of names) { const id = tree.keys.get(normalizeSearch(n)); if (id != null) walk(id); }
  return [...out];
}

const quote = (xs: string[]) => `{${xs.map((x) => `"${x.replace(/"/g, '')}"`).join(',')}}`;

// 규칙 하나에 맞는 게임 id 집합 (넓게) — 칸(테마·장르·활동·수동 우당탕·대전)은 한 번의 or 조건, 태그는 game_tags에서
async function ruleSet(rule: Rule, tree: TagTree | null): Promise<Set<string>> {
  const key = `rule:${JSON.stringify(rule)}`;
  return cached(key, async () => {
    const parts: string[] = [];
    if (rule.themes?.length) parts.push(`themes.ov.${quote(rule.themes)}`);
    if (rule.genres?.length) parts.push(`genres.ov.${quote(rule.genres)}`);
    if (rule.acts?.length) parts.push(`activities_confirmed.ov.${quote(rule.acts)}`);
    if (rule.fs) parts.push('friendslop.eq.true');
    if (rule.pvp) parts.push('has_pvp.eq.true');
    const tagIds = rule.tags?.length ? tagIdsOf(tree, rule.tags) : [];
    const [cols, tagged] = await Promise.all([
      parts.length ? readAllPages((from, to) => selectGames('id').or(parts.join(',')).order('id').range(from, to)) : Promise.resolve({ data: [] as { id: string }[], error: null }),
      tagIds.length ? readAllPages((from, to) => supabase.from('game_tags').select('game_id').in('tag_id', tagIds).order('game_id').range(from, to)) : Promise.resolve({ data: [] as { game_id: string }[], error: null }),
    ]);
    if (cols.error || tagged.error) throw new Error(`후보 거르기 조회 실패: ${(cols.error || tagged.error)?.message}`);
    return new Set<string>([...((cols.data as { id: string }[]) || []).map((r) => r.id), ...((tagged.data as { game_id: string }[]) || []).map((r) => r.game_id)]);
  });
}

// 인원·방식(협동·대전 칸)으로 거른 기본 집합 — 숨김·메인 노출 제외·출시 예정은 여기서 뺀다. 인기순(heat_rank 낮은 순, 없는 게임은 뒤)으로 정렬해 둔다
async function baseRows(n: number | null, how: PickInput['how']): Promise<Row[]> {
  return cached(`base:${n}:${how}`, async () => {
    // 1,000행씩 3쪽을 한꺼번에 — 게임이 1,700개쯤이라 보통 2쪽, 3쪽이 다 차면 이어서 더 읽는다
    const page = (from: number) => {
      let q = selectGames('id, heat_rank').eq('home_excluded', false).neq('release_status', 'coming_soon');
      if (n != null) q = q.or(`min_players.is.null,min_players.lte.${n}`).or(`max_players.is.null,max_players.gte.${n},party_max.gte.${n}`);
      if (how === 'coop') q = q.or('has_online_coop.eq.true,has_local_coop.eq.true');
      if (how === 'pvp') q = q.eq('has_pvp', true);
      return q.order('id').range(from, from + 999);
    };
    const data: Row[] = [];
    for (let from = 0; ; from += 3000) {
      const res = await Promise.all([page(from), page(from + 1000), page(from + 2000)]);
      const failed = res.find((r) => r.error);
      if (failed) throw new Error(`후보 목록 조회 실패: ${failed.error?.message}`);
      for (const r of res) data.push(...((r.data as unknown as Row[]) || []));
      if (res.some((r) => (r.data?.length ?? 0) < 1000)) break;
    }
    return data.sort((a, b) => (a.heat_rank ?? Infinity) - (b.heat_rank ?? Infinity));
  });
}

// 조건에 맞는 게임 id — 인기순. withMood=false면 분위기는 보지 않는다 (분위기에 맞는 게임이 모자랄 때 채우는 용도)
export async function poolIds(input: Pick<PickInput, 'n' | 'how' | 'g' | 'mood'>, tree: TagTree | null, withMood = true): Promise<string[]> {
  const how = input.how ?? (input.mood ? MOOD_HOW[input.mood] ?? null : null);
  const groups: Rule[] = [];
  if (how === 'party' || how === 'brain') groups.push(HOW_RULES[how]);
  for (const k of input.g) groups.push(GENRES.find((x) => x.key === k)!.rule);
  if (withMood && !isMoodFree(input.mood)) groups.push(MOODS[input.mood!]);
  const [rows, sets] = await Promise.all([baseRows(input.n, how), Promise.all(groups.map((r) => ruleSet(r, tree)))]);
  return rows.filter((r) => sets.every((s) => s.has(r.id))).map((r) => r.id);
}

// 게임 칸 읽기 — 한 번 읽은 게임은 10분 동안 서버 메모리에서
const games = new Map<string, { at: number; g: unknown }>();
export async function loadGames(ids: string[]): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = Date.now();
  const need = ids.filter((id) => !(games.get(id) && now - games.get(id)!.at < TTL));
  if (need.length) {
    const rows = await getGameIndex(need);
    for (const g of rows) games.set(g.id as string, { at: now, g });
  }
  return ids.map((id) => games.get(id)?.g).filter(Boolean) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}
