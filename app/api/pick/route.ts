import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getIp, ipHash } from '../../lib/aiGuard';
import { getGameIndex } from '../../lib/gameIndex';
import { selectGames } from '../../lib/visibleGames';
import { readAllPages } from '../../lib/paged';
import { getOwnedAppids, getSessionUserId } from '../../lib/user';
import { loadTagTree, type TagTree, displayTags } from '../../lib/tagTree';
import { makeAbCtx, makeKwMatcher } from '../../lib/abCtx';
import { badgesFor } from '../../lib/abSearch';
import { gameName } from '../../lib/gameName';
import { parsePickInput } from '../../lib/aiPick/moods';
import { pickCacheKey, CACHE_HOURS } from '../../lib/aiPick/cacheKey';
import { inputToQuery, rankCandidates } from '../../lib/aiPick/candidates';
import { gameLine, SYSTEM_PROMPT, userPrompt } from '../../lib/aiPick/prompt';
import { AI_TIMEOUT_MS, choosePicks, pickWindow } from '../../lib/aiPick/validate';

// "알아서 골라줘" — DB가 후보를 거르고(/find와 같은 판정·점수), AI(Haiku)는 그중 3개를 골라 이유만 쓴다. 검증에 실패하면 점수 상위 3개 + 기본 문구(fallback)
// ANTHROPIC_API_KEY는 서버에서만 읽고 코드·로그·오류 메시지 어디에도 내보내지 않는다. 프롬프트 전문·IP 원문은 저장하지 않는다
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = 'claude-haiku-5-5'; // 생각(thinking)은 끈다 — 켜 두면 max_tokens 400을 생각에 다 써서 답이 비는 일이 있다
const LIMIT_ANON = 10; // 시간당
const LIMIT_USER = 30;
const LIMIT_MESSAGE = '잠깐 쉬었다가 다시 눌러주세요';
const DATA_TTL_MS = 10 * 60 * 1000;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 게임 목록·태그 나무·추천에서 빼는 게임(메인 노출 제외) — 서버 메모리에 10분
type Loaded = { games: any[]; tree: TagTree | null; blocked: Set<string> }; // eslint-disable-line @typescript-eslint/no-explicit-any
let loaded: { at: number; data: Loaded } | null = null;
let loading: Promise<Loaded> | null = null;
async function loadData(): Promise<Loaded> {
  if (loaded && Date.now() - loaded.at < DATA_TTL_MS) return loaded.data;
  if (!loading) {
    loading = (async () => {
      const [games, tree, excluded] = await Promise.all([
        getGameIndex(),
        loadTagTree().catch(() => null),
        readAllPages((from, to) => selectGames('id').eq('home_excluded', true).order('id').range(from, to)),
      ]);
      const data = { games, tree, blocked: new Set<string>(((excluded.data as { id: string }[] | null) || []).map((r) => r.id)) };
      loaded = { at: Date.now(), data };
      return data;
    })().finally(() => { loading = null; });
  }
  return loading;
}

type Card = {
  id: string; name: string; steam_appid: string | number | null; cover_image_url: string | null; card_image_url: string | null;
  price_final: number | null; price_discount: number | null; price_original: number | null; is_free: boolean; price_type: string | null;
  reason: string; badges: string[];
};
type Payload = { picks: Card[]; fallback: boolean; ownedExcluded: boolean; widened: boolean };

const res = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const started = Date.now();
  let bodyJson: unknown = null;
  try { bodyJson = await req.json(); } catch { /* 빈 본문은 빈 입력으로 */ }
  const input = parsePickInput(bodyJson);
  const userId = getSessionUserId(req);
  const key = pickCacheKey(input, userId);

  const log = async (p: { candidates: number; ids: string[]; fallback: boolean; cached: boolean; widened: boolean }) => {
    const { data, error } = await db.from('ai_pick_log').insert({
      n: input.n, how: input.how, genres: input.g, mood: input.mood, exclude_count: input.excludeIds.length,
      candidate_count: p.candidates, picked_ids: p.ids, fallback: p.fallback, cached: p.cached, widened: p.widened,
      logged_in: !!userId, took_ms: Date.now() - started,
    }).select('id').single();
    if (error) console.error('알아서 골라줘 로그 저장 실패:', error.message);
    return (data?.id as string | undefined) ?? null;
  };

  // 1) 캐시 — 횟수에 세지 않는다
  const { data: hit } = await db.from('ai_pick_cache').select('result').eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (hit?.result) {
    const cached = hit.result as Payload;
    const logId = await log({ candidates: 0, ids: cached.picks.map((p) => p.id), fallback: cached.fallback, cached: true, widened: cached.widened });
    return res({ ...cached, logId, cached: true });
  }

  // 2) 횟수 제한 — IP 해시 기준 시간당. 로그인 전 10회·후 30회
  const ip = ipHash(getIp(req.headers));
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: rateErr } = await db.from('ai_pick_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', ip).like('scope', 'pick%').gte('created_at', since);
  if (rateErr) console.error('알아서 골라줘 횟수 조회 실패:', rateErr.message);
  if ((count ?? 0) >= (userId ? LIMIT_USER : LIMIT_ANON)) return res({ error: LIMIT_MESSAGE }, 429);
  const { error: rateInsErr } = await db.from('ai_pick_rate').insert({ ip_hash: ip, scope: userId ? 'pick-user' : 'pick-anon' });
  if (rateInsErr) console.error('알아서 골라줘 횟수 기록 실패:', rateInsErr.message);

  // 3) 후보 — 로그인했으면 Steam 보유 게임(저장된 공개 목록)을 뺀다. 내 PC 사양은 브라우저에만 있어 서버는 모른다 (개인정보처리방침)
  let data: Loaded;
  try { data = await loadData(); } catch (e) {
    console.error('알아서 골라줘 게임 목록 조회 실패:', (e as Error).message);
    return res({ error: '게임 목록을 불러오지 못했어요. 잠시 뒤에 다시 눌러주세요' }, 500);
  }
  const owned = userId ? await getOwnedAppids(userId).catch(() => null) : null;
  const ctx = makeAbCtx(data.tree);
  const env = { tree: data.tree, ctx, kw: makeKwMatcher(data.tree), myPc: null, owned: owned ? (a: number | null | undefined) => (a == null ? false : owned.has(Number(a))) : null };
  const exclude = new Set(input.excludeIds);
  const { ranked } = rankCandidates(data.games, input, env, data.blocked, exclude);
  const byId = new Map(ranked.map((g) => [g.id, g]));
  const win = pickWindow(ranked.map((g) => g.id), exclude);
  const candidates = win.ids.map((id) => byId.get(id)!);

  // 4) AI — 후보 중 3개 고르기. 8초 안에 못 받거나 검증에 실패하면 fallback
  const lines = candidates.map((g) => gameLine(g, displayTags(data.tree, g, 6), gameName(g)));
  const callAi = async (signal: AbortSignal) => {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
      const msg = await client.messages.create(
        { model: MODEL, max_tokens: 400, thinking: { type: 'disabled' }, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt(input, lines) }] },
        { signal, timeout: AI_TIMEOUT_MS },
      );
      const block = msg.content.find((b) => b.type === 'text');
      return block && 'text' in block ? block.text : null;
    } catch (e) {
      console.error('알아서 골라줘 AI 호출 실패:', (e as { status?: number })?.status ?? (e as Error)?.name); // 키가 들어갈 수 있는 메시지는 남기지 않는다
      return null;
    }
  };
  const chosen = await choosePicks(callAi, candidates, input.n, AI_TIMEOUT_MS);
  if (chosen.fallback) console.warn('알아서 골라줘 fallback:', chosen.why); // 이유 종류만 남긴다 (응답 내용·프롬프트는 남기지 않음)

  // 5) 응답 — 가격·이미지·✓ 조건은 DB 값에서
  const q = inputToQuery(input);
  const picks: Card[] = chosen.picks.map((p) => {
    const g = byId.get(p.id)!;
    return {
      id: g.id, name: gameName(g), steam_appid: g.steam_appid ?? null, cover_image_url: g.cover_image_url ?? null, card_image_url: g.card_image_url ?? null,
      price_final: g.price_final ?? null, price_discount: g.price_discount ?? null, price_original: g.price_original ?? null,
      is_free: g.is_free === true, price_type: g.price_type ?? null,
      reason: p.reason, badges: badgesFor(g, q, ctx, 4).filter((b) => b.ok).map((b) => b.text),
    };
  });
  const payload: Payload = { picks, fallback: chosen.fallback, ownedExcluded: !!owned, widened: win.widened };

  const logId = await log({ candidates: candidates.length, ids: picks.map((p) => p.id), fallback: chosen.fallback, cached: false, widened: win.widened });
  if (picks.length) {
    const { error } = await db.from('ai_pick_cache').upsert({ key, result: payload, expires_at: new Date(Date.now() + CACHE_HOURS * 3600 * 1000).toISOString() });
    if (error) console.error('알아서 골라줘 캐시 저장 실패:', error.message);
  }
  return res({ ...payload, logId, cached: false });
}
