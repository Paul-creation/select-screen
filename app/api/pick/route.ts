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
import { filterByInput, inputToQuery, rankCandidates } from '../../lib/aiPick/candidates';
import { gameLine, systemPrompt, userPrompt } from '../../lib/aiPick/prompt';
import { BATCH, loadGames, poolIds } from '../../lib/aiPick/loadCandidates';
import { AI_TIMEOUT_MS, PICK_COUNT, WINDOW, choosePicks, pickWindow } from '../../lib/aiPick/validate';
import { resolveStaffPick, withStaffFirst, type StaffPickRow } from '../../lib/aiPick/staffPick';

// "알아서 골라줘" — DB가 후보를 거르고(/find와 같은 판정·점수), AI(Haiku)는 그중 3개를 골라 이유만 쓴다. 검증에 실패하면 점수 상위 3개 + 기본 문구(fallback)
// 조건이 맞는 운영진 추천(staff_picks)이 있으면 1번 자리에 고정하고 AI는 나머지 2개만 고른다 (staffPick.ts)
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
  reason: string; badges: string[]; staff?: true;
};
type Payload = { picks: Card[]; fallback: boolean; ownedExcluded: boolean; widened: boolean };

const res = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const started = Date.now();
  let bodyJson: unknown = null;
  try { bodyJson = await req.json(); } catch { /* 아래에서 400 */ }
  // 입력 검증은 캐시·횟수 제한·AI 호출보다 먼저 — 400은 횟수에도 하루 상한에도 세지 않고, 어떤 칸이 틀렸는지도 알려주지 않는다
  const input = parsePickInput(bodyJson);
  if (!input) return res({ error: 'bad_input' }, 400);
  const userId = getSessionUserId(req);

  // 응답을 보낸 뒤에 저장하는 것(로그·캐시·횟수 기록)은 after()로 — 응답 시간에 넣지 않는다. 로그 id는 미리 만들어 응답에 싣는다
  const logId = randomUUID();
  const saveLog = (p: { candidates: number; ids: string[]; fallback: boolean; cached: boolean; widened: boolean; staffPickId: string | undefined }) => after(async () => {
    const { error } = await db.from('ai_pick_log').insert({
      id: logId, n: input.n, how: input.how, genres: input.g, mood: input.mood, exclude_count: input.excludeIds.length,
      candidate_count: p.candidates, picked_ids: p.ids, fallback: p.fallback, cached: p.cached, widened: p.widened,
      logged_in: !!userId, took_ms: Date.now() - started,
      ...(p.staffPickId ? { staff_pick_id: p.staffPickId } : {}), // 칸이 아직 없어도(마이그레이션 전) 나머지 로그는 남게
    });
    if (error) console.error('알아서 골라줘 로그 저장 실패:', error.message);
  });

  // 서로 기다릴 필요 없는 것은 한꺼번에 시작한다: 운영진 추천 → 캐시 조회 · 시간당 횟수 · 사이트 전체 상한 · 후보 읽기
  const ip = ipHash(getIp(req.headers));
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const exclude = new Set(input.excludeIds);
  const ownedP = userId ? getOwnedAppids(userId).catch(() => null) : Promise.resolve(null);
  const treeP = loadTagTree().catch(() => null);
  const filterEnv = (tree: Awaited<typeof treeP>) => ({ tree, ctx: makeAbCtx(tree), kw: makeKwMatcher(tree), myPc: null });
  // 운영진 추천 — 캐시 키에 들어가서 캐시보다 먼저 정한다. 읽기에 실패하면 추천 없이 진행
  const staffP = resolveStaffPick({
    cond: input,
    now: new Date(),
    loadRows: async () => {
      const { data, error } = await db.from('staff_picks').select('id, game_id, players, moods, blurb, active, starts_at, ends_at, priority, created_at').eq('active', true);
      if (error) throw new Error(error.message);
      return (data ?? []) as StaffPickRow[];
    },
    loadGame: async (id) => (await loadGames([id]))[0] ?? null,
    loadOwned: () => ownedP,
    passesFilter: async (game) => filterByInput([game], input, { ...filterEnv(await treeP), owned: null }).length > 0, // AI 후보와 같은 판정
  }).catch((e) => { console.error('알아서 골라줘 운영진 추천 조회 실패:', (e as Error).message); return null; });
  const cacheP = staffP.then(async (staff) => {
    const key = pickCacheKey(input, userId, staff?.row.id ?? null);
    const { data } = await db.from('ai_pick_cache').select('result').eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle();
    return { staff, key, hit: data };
  });
  const rateP = Promise.resolve(db.from('ai_pick_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', ip).like('scope', 'pick%').gte('created_at', since));
  const capP = checkGlobalAiCap().catch(() => true);
  // 후보 — 조건으로 DB에서 먼저 걸러 인기순 상위부터 60개씩만 읽는다 (전체 목록을 읽지 않음). 로그인했으면 Steam 보유 게임(저장된 공개 목록)을 뺀다
  // 내 PC 사양은 브라우저에만 있어 서버는 모른다 (개인정보처리방침)
  const dataP = (async () => {
    const [tree, owned] = await Promise.all([treeP, ownedP]);
    const env = { ...filterEnv(tree), owned: owned ? (a: number | null | undefined) => (a == null ? false : owned.has(Number(a))) : null };
    const { ctx } = env;
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
  const { staff, key, hit } = await cacheP;
  if (hit?.result) {
    const stored = hit.result as Payload;
    // 운영진 추천 문구를 고치면 캐시에 남은 옛 문구 대신 바로 새 문구로
    const cached = staff ? { ...stored, picks: stored.picks.map((p) => (p.staff ? { ...p, reason: staff.row.blurb } : p)) } : stored;
    saveLog({ candidates: 0, ids: cached.picks.map((p) => p.id), fallback: cached.fallback, cached: true, widened: cached.widened, staffPickId: staff?.row.id });
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
  const aiCount = staff ? PICK_COUNT - 1 : PICK_COUNT; // 운영진 추천이 한 자리를 차지한다
  const win = pickWindow(ranked.map((g) => g.id), staff ? [...exclude, staff.game.id] : exclude, WINDOW, aiCount); // 추천한 게임은 AI 후보에서 뺀다
  const candidates = win.ids.map((id) => byId.get(id)!);

  // 4) AI — 후보 중 3개(운영진 추천이 있으면 2개) 고르기. 8초 안에 못 받거나 검증에 실패하면 fallback
  const lines = candidates.map((g) => gameLine(g, displayTags(tree, g, 6), gameName(g)));
  let overCap = false;
  const callAi = async (signal: AbortSignal, count: number) => {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    // 사이트 전체 하루 상한(aiGuard, 300회) — 넘으면 AI를 부르지 않고 fallback. 캐시에서 나간 응답은 여기까지 오지 않아 세지 않는다
    if (!(await capP)) { overCap = true; return null; }
    after(() => recordAiCall(req.headers, 'pick'));
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
      const msg = await client.messages.create(
        { model: MODEL, max_tokens: 400, thinking: { type: 'disabled' }, system: systemPrompt(count), messages: [{ role: 'user', content: userPrompt(input, lines) }] },
        { signal, timeout: AI_TIMEOUT_MS },
      );
      const block = msg.content.find((b) => b.type === 'text');
      return block && 'text' in block ? block.text : null;
    } catch (e) {
      console.error('알아서 골라줘 AI 호출 실패:', (e as { status?: number })?.status ?? (e as Error)?.name); // 키가 들어갈 수 있는 메시지는 남기지 않는다
      return null;
    }
  };
  const chosen = await choosePicks(callAi, candidates, input.n, AI_TIMEOUT_MS, aiCount);
  if (chosen.fallback) console.warn('알아서 골라줘 fallback:', overCap ? 'daily-cap' : chosen.why); // 이유 종류만 남긴다 (응답 내용·프롬프트는 남기지 않음)

  // 5) 응답 — 가격·이미지·✓ 조건은 DB 값에서
  const q = inputToQuery(input);
  const picks: Card[] = withStaffFirst(staff?.row ?? null, chosen.picks).map((p) => {
    const isStaff = 'staff' in p;
    const g = isStaff ? staff!.game : byId.get(p.id)!;
    return {
      id: g.id, name: gameName(g), steam_appid: g.steam_appid ?? null, cover_image_url: g.cover_image_url ?? null, card_image_url: g.card_image_url ?? null,
      price_final: g.price_final ?? null, price_discount: g.price_discount ?? null, price_original: g.price_original ?? null,
      is_free: g.is_free === true, price_type: g.price_type ?? null,
      reason: p.reason, badges: badgesFor(g, q, ctx, 4).filter((b) => b.ok).map((b) => b.text),
      ...(isStaff ? { staff: true as const } : {}),
    };
  });
  const payload: Payload = { picks, fallback: chosen.fallback, ownedExcluded: !!owned, widened: win.widened };

  saveLog({ candidates: candidates.length, ids: picks.map((p) => p.id), fallback: chosen.fallback, cached: false, widened: win.widened, staffPickId: staff?.row.id });
  if (picks.length && !chosen.fallback) { // 대체 결과(fallback)는 캐시하지 않는다 — 다음 요청이 다시 AI를 시도하게
    after(async () => {
      const { error } = await db.from('ai_pick_cache').upsert({ key, result: payload, expires_at: new Date(Date.now() + CACHE_HOURS * 3600 * 1000).toISOString() });
      if (error) console.error('알아서 골라줘 캐시 저장 실패:', error.message);
    });
  }
  return res({ ...payload, logId, cached: false });
}
