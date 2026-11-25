import { after, NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getIp, ipHash, checkGlobalAiCap, recordAiCall } from '../../lib/aiGuard';
import { getOwnedAppids, getSessionUserId } from '../../lib/user';
import { loadTagTree, displayTags } from '../../lib/tagTree';
import { makeAbCtx, makeKwMatcher } from '../../lib/abCtx';
import { badgesFor } from '../../lib/abSearch';
import { gameName } from '../../lib/gameName';
import { parsePickInput } from '../../lib/aiPick/moods';
import { pickCacheKey, CACHE_HOURS } from '../../lib/aiPick/cacheKey';
import { inputToQuery, rankCandidates } from '../../lib/aiPick/candidates';
import { gameLine, SYSTEM_PROMPT, userPrompt } from '../../lib/aiPick/prompt';
import { BATCH, loadGames, poolIds } from '../../lib/aiPick/loadCandidates';
import { AI_TIMEOUT_MS, WINDOW, choosePicks, pickWindow } from '../../lib/aiPick/validate';

// "알아서 골라줘" — DB가 후보를 거르고(/find와 같은 판정·점수), AI(Haiku)는 그중 3개를 골라 이유만 쓴다. 검증에 실패하면 점수 상위 3개 + 기본 문구(fallback)
// ANTHROPIC_API_KEY는 서버에서만 읽고 코드·로그·오류 메시지 어디에도 내보내지 않는다. 프롬프트 전문·IP 원문은 저장하지 않는다
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = 'claude-haiku-5-5'; // 생각(thinking)은 끈다 — 켜 두면 max_tokens 400을 생각에 다 써서 답이 비는 일이 있다
const LIMIT_ANON = 10; // 시간당
const LIMIT_USER = 30;
const LIMIT_MESSAGE = '잠깐 쉬었다가 다시 눌러주세요';
const MAX_BATCHES = 8; // 후보를 60개씩 최대 480개까지만 읽는다

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

  // 응답을 보낸 뒤에 저장하는 것(로그·캐시·횟수 기록)은 after()로 — 응답 시간에 넣지 않는다. 로그 id는 미리 만들어 응답에 싣는다
  const logId = randomUUID();
  const saveLog = (p: { candidates: number; ids: string[]; fallback: boolean; cached: boolean; widened: boolean }) => after(async () => {
    const { error } = await db.from('ai_pick_log').insert({
      id: logId, n: input.n, how: input.how, genres: input.g, mood: input.mood, exclude_count: input.excludeIds.length,
      candidate_count: p.candidates, picked_ids: p.ids, fallback: p.fallback, cached: p.cached, widened: p.widened,
      logged_in: !!userId, took_ms: Date.now() - started,
    });
    if (error) console.error('알아서 골라줘 로그 저장 실패:', error.message);
  });

  // 서로 기다릴 필요 없는 것은 한꺼번에 시작한다: 캐시 조회 · 시간당 횟수 · 사이트 전체 상한 · 후보 읽기
  const ip = ipHash(getIp(req.headers));
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const exclude = new Set(input.excludeIds);
  const cacheP = Promise.resolve(db.from('ai_pick_cache').select('result').eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle());
  const rateP = Promise.resolve(db.from('ai_pick_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', ip).like('scope', 'pick%').gte('created_at', since));
  const capP = checkGlobalAiCap().catch(() => true);
  // 후보 — 조건으로 DB에서 먼저 걸러 인기순 상위부터 60개씩만 읽는다 (전체 목록을 읽지 않음). 로그인했으면 Steam 보유 게임(저장된 공개 목록)을 뺀다
  // 내 PC 사양은 브라우저에만 있어 서버는 모른다 (개인정보처리방침)
  const dataP = (async () => {
    const [tree, owned] = await Promise.all([loadTagTree().catch(() => null), userId ? getOwnedAppids(userId).catch(() => null) : Promise.resolve(null)]);
    const ctx = makeAbCtx(tree);
    const env = { tree, ctx, kw: makeKwMatcher(tree), myPc: null, owned: owned ? (a: number | null | undefined) => (a == null ? false : owned.has(Number(a))) : null };
    let ranked: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const loaded: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const seen = new Set<string>();
    const fill = async (ids: string[]) => {
      for (let i = 0; i < MAX_BATCHES * BATCH && i < ids.length; i += BATCH) {
        const part = ids.slice(i, i + BATCH).filter((id) => !seen.has(id));
        part.forEach((id) => seen.add(id));
        loaded.push(...(await loadGames(part)));
        ranked = rankCandidates(loaded, input, env, new Set(), exclude).ranked;
        if (ranked.filter((g) => !exclude.has(g.id)).length >= WINDOW) return;
      }
    };
    await fill(await poolIds(input, tree));
    if (rankCandidates(loaded, input, env, new Set(), exclude).moodRelaxed) await fill(await poolIds(input, tree, false)); // 분위기에 맞는 게임이 모자라면 분위기를 풀고 채운다
    return { tree, owned, ctx, ranked };
  })();
  dataP.catch(() => {}); // 캐시·횟수 제한으로 먼저 끝나는 경우의 처리되지 않은 오류 방지

  // 1) 캐시 — 횟수에 세지 않는다
  const { data: hit } = await cacheP;
  if (hit?.result) {
    const cached = hit.result as Payload;
    saveLog({ candidates: 0, ids: cached.picks.map((p) => p.id), fallback: cached.fallback, cached: true, widened: cached.widened });
    return res({ ...cached, logId, cached: true });
  }

  // 2) 횟수 제한 — IP 해시 기준 시간당. 로그인 전 10회·후 30회
  const { count, error: rateErr } = await rateP;
  if (rateErr) console.error('알아서 골라줘 횟수 조회 실패:', rateErr.message);
  if ((count ?? 0) >= (userId ? LIMIT_USER : LIMIT_ANON)) return res({ error: LIMIT_MESSAGE }, 429);
  after(async () => {
    const { error } = await db.from('ai_pick_rate').insert({ ip_hash: ip, scope: userId ? 'pick-user' : 'pick-anon' });
    if (error) console.error('알아서 골라줘 횟수 기록 실패:', error.message);
  });

  // 3) 후보 읽기 끝나기를 기다린다
  let data: Awaited<typeof dataP>;
  try { data = await dataP; } catch (e) {
    console.error('알아서 골라줘 후보 조회 실패:', (e as Error).message);
    return res({ error: '게임 목록을 불러오지 못했어요. 잠시 뒤에 다시 눌러주세요' }, 500);
  }
  const { tree, owned, ctx, ranked } = data;
  const byId = new Map(ranked.map((g) => [g.id, g]));
  const win = pickWindow(ranked.map((g) => g.id), exclude);
  const candidates = win.ids.map((id) => byId.get(id)!);

  // 4) AI — 후보 중 3개 고르기. 8초 안에 못 받거나 검증에 실패하면 fallback
  const lines = candidates.map((g) => gameLine(g, displayTags(tree, g, 6), gameName(g)));
  let overCap = false;
  const callAi = async (signal: AbortSignal) => {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    // 사이트 전체 하루 상한(aiGuard, 300회) — 넘으면 AI를 부르지 않고 fallback. 캐시에서 나간 응답은 여기까지 오지 않아 세지 않는다
    if (!(await capP)) { overCap = true; return null; }
    after(() => recordAiCall(req.headers, 'pick'));
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
  if (chosen.fallback) console.warn('알아서 골라줘 fallback:', overCap ? 'daily-cap' : chosen.why); // 이유 종류만 남긴다 (응답 내용·프롬프트는 남기지 않음)

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

  saveLog({ candidates: candidates.length, ids: picks.map((p) => p.id), fallback: chosen.fallback, cached: false, widened: win.widened });
  if (picks.length && !chosen.fallback) { // 대체 결과(fallback)는 캐시하지 않는다 — 다음 요청이 다시 AI를 시도하게
    after(async () => {
      const { error } = await db.from('ai_pick_cache').upsert({ key, result: payload, expires_at: new Date(Date.now() + CACHE_HOURS * 3600 * 1000).toISOString() });
      if (error) console.error('알아서 골라줘 캐시 저장 실패:', error.message);
    });
  }
  return res({ ...payload, logId, cached: false });
}
