// /find 결과 계산 — 순수 규칙(abSearch.ts)에 태그 나무·가능한 활동·내 PC·보유 게임처럼 다른 파일이 필요한 조건을 이어 붙인다
import { matchesQuery, sortGames, whoText, HOWS, GENRES, OPTS, TRENDS, MODES, NETS, SIZES, PRICE_ALL, type AbCtx, type AbGame, type AbQuery, type KwMatcher } from './abSearch';
import { matchesTags } from './tagMatch';
import { hasTag, FLAG_TAGS, isTreeTag } from './tagSearch';
import { nameToTagId, tagName, type TagTree } from './tagTree';
import { matchesActivities } from './activityFilter';
import { ACTIVITIES, ACTIVITY_TAG_MAP, activityForTag, type ActivityKey } from './activities';
import { runsOnMyPc } from './specJudge';
import { toUserPc, type MyPc } from './myPc';
import { priceLabel } from './rangeFilter';

export type FindEnv = {
  tree: TagTree | null;
  ctx: AbCtx;
  kw: KwMatcher;
  myPc: MyPc | null;                                  // 내 PC 사양 (없으면 "내 PC" 조건은 걸리지 않는다)
  owned: ((appid: number | null | undefined) => boolean) | null; // 보유 게임 빼고 보기가 켜졌을 때만
};

const uniq = <T,>(a: T[]) => [...new Set(a)];

// 분류(tags)는 태그 나무 칸 번호·협동 같은 단어·예전 주소의 태그 이름이 섞여 올 수 있다 — 이름은 번호로 바꾸고, 활동과 같은 뜻의 태그(운전·낚시 등)는 활동 조건으로 옮긴다
export function normalizeTags(q: Pick<AbQuery, 'tags' | 'act'>, tree: TagTree | null) {
  const acts: string[] = [...q.act];
  const tags: string[] = [];
  for (const t of q.tags) {
    const key = isTreeTag(t) || FLAG_TAGS[t] ? t : tree && nameToTagId(tree, t) != null ? String(nameToTagId(tree, t)) : null;
    if (!key) continue; // 모르는 이름은 버린다 (결과 0개 방지)
    const a = activityForTag(key);
    if (a) acts.push(a);
    else tags.push(key);
  }
  return { tags: uniq(tags), acts: uniq(acts).filter((a) => ACTIVITIES.some((x) => x.key === a)) };
}

// 조건에 맞는 게임 (정렬 전)
export function filterGames(games: AbGame[], q: AbQuery, env: FindEnv): AbGame[] {
  const { tags, acts } = normalizeTags(q, env.tree);
  // 같은 뜻의 스팀 태그가 있는 게임도 그 활동이 있는 것으로 본다 (활동 OR 태그)
  const alsoHas = (g: AbGame, k: string) => {
    const t = ACTIVITY_TAG_MAP[k as ActivityKey];
    return !!t && hasTag(g, String(t.tagId), env.tree);
  };
  const user = q.mypc && env.myPc ? toUserPc(env.myPc) : null;
  return games.filter((g) => {
    if (!matchesQuery(g, q, env.ctx, env.kw)) return false;
    if (user && !runsOnMyPc(user, g)) return false;
    if (env.owned?.(g.steam_appid)) return false;
    if (!matchesTags(tags, (t) => hasTag(g, t, env.tree), q.tagAny)) return false;
    if (q.ex.length && q.ex.some((t) => hasTag(g, t, env.tree))) return false;
    if (acts.length && !matchesActivities(g, acts, q.actu, alsoHas)) return false;
    return true;
  });
}

// 조건에 맞는 게임을 고른 정렬로
export const findGames = (games: AbGame[], q: AbQuery, env: FindEnv) => sortGames(filterGames(games, q, env), q, env.ctx);

// ---------- 적용된 필터 칩 (× 누르면 해제) ----------
export type AppliedChip = { key: string; label: string; clear: (q: AbQuery) => AbQuery };

export function appliedChips(q: AbQuery, tree: TagTree | null, hideOwned: boolean, clearOwned: () => void): AppliedChip[] {
  const out: AppliedChip[] = [];
  const who = whoText(q);
  if (who) out.push({ key: 'who', label: who, clear: (x) => ({ ...x, n: null, nTo: null }) });
  if (q.how) out.push({ key: 'how', label: HOWS.find((h) => h.key === q.how)!.label, clear: (x) => ({ ...x, how: null }) });
  for (const k of q.genres) out.push({ key: `g-${k}`, label: GENRES.find((g) => g.key === k)!.label, clear: (x) => ({ ...x, genres: x.genres.filter((v) => v !== k) }) });
  if (q.kw) out.push({ key: 'kw', label: `“${q.kw}”`, clear: (x) => ({ ...x, kw: '' }) });
  for (const k of q.opts) out.push({ key: `o-${k}`, label: OPTS.find((o) => o.key === k)!.label, clear: (x) => ({ ...x, opts: x.opts.filter((v) => v !== k) }) });
  for (const [k, label] of TRENDS) if (q.trend.includes(k)) out.push({ key: `trend-${k}`, label, clear: (x) => ({ ...x, trend: x.trend.filter((v) => v !== k) }) });
  if (q.mypc) out.push({ key: 'mypc', label: '내 PC로 돌아가는 게임만', clear: (x) => ({ ...x, mypc: false }) });
  if (hideOwned) out.push({ key: 'owned', label: '보유 게임 빼고 보기', clear: (x) => { clearOwned(); return x; } });
  for (const [k, label] of MODES) if (q.mode.includes(k)) out.push({ key: `mode-${k}`, label, clear: (x) => ({ ...x, mode: x.mode.filter((v) => v !== k) }) });
  for (const [k, label] of NETS) if (q.net.includes(k)) out.push({ key: `net-${k}`, label, clear: (x) => ({ ...x, net: x.net.filter((v) => v !== k) }) });
  if (q.size) out.push({ key: 'size', label: SIZES.find(([k]) => k === q.size)![1], clear: (x) => ({ ...x, size: null }) });
  if (q.story) out.push({ key: 'story', label: '혼자도 충분', clear: (x) => ({ ...x, story: false }) });
  if (q.price[0] !== PRICE_ALL[0] || q.price[1] !== PRICE_ALL[1]) out.push({ key: 'price', label: `${priceLabel(q.price[0])} ~ ${priceLabel(q.price[1])}`, clear: (x) => ({ ...x, price: PRICE_ALL }) });
  if (q.demo) out.push({ key: 'demo', label: '데모 있음', clear: (x) => ({ ...x, demo: false }) });
  if (q.low) out.push({ key: 'low', label: '역대 최저가', clear: (x) => ({ ...x, low: false }) });
  for (const b of q.barrier) out.push({ key: `barrier-${b}`, label: `진입장벽 ${b}`, clear: (x) => ({ ...x, barrier: x.barrier.filter((v) => v !== b) }) });
  if (q.rev) out.push({ key: 'rev', label: 'Steam 매우 긍정적 이상', clear: (x) => ({ ...x, rev: false }) });
  if (q.tv) out.push({ key: 'tv', label: '스트리머가 한 게임', clear: (x) => ({ ...x, tv: false }) });
  for (const a of q.act) out.push({ key: `act-${a}`, label: ACTIVITIES.find((v) => v.key === a)?.label ?? a, clear: (x) => ({ ...x, act: x.act.filter((v) => v !== a) }) });
  for (const t of q.tags) out.push({ key: `tag-${t}`, label: (isTreeTag(t) ? tagName(tree, Number(t)) : t) || t, clear: (x) => ({ ...x, tags: x.tags.filter((v) => v !== t) }) });
  for (const t of q.ex) out.push({ key: `ex-${t}`, label: `${tagName(tree, Number(t)) || t} 있는 게임 빼기`, clear: (x) => ({ ...x, ex: x.ex.filter((v) => v !== t) }) });
  return out;
}
