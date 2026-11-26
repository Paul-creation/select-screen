// "알아서 골라줘" AI 응답 검증·대체 문구·후보 창 — 다른 파일을 import하지 않아 테스트(validate.test.mjs)가 .ts를 바로 불러온다
// 원칙: AI는 후보 중 3개를 골라 이유만 쓴다. 하나라도 어긋나면 다시 묻지 않고 점수 상위 3개 + 대체 문구(fallback)로 내보낸다

export const PICK_COUNT = 3;
export const REASON_MAX = 40;
export const WINDOW = 30;
export type Pick = { id: string; reason: string };

// 후보 창 — 점수 순으로 줄 세운 id에서 이미 보여 준 것을 빼고 상위 30개. 그 창에서 3개도 못 남으면 31~60위, 61~90위… 로 넓힌다
// min: AI가 골라야 하는 개수 (운영진 추천이 1번 자리를 차지하면 2개)
export function pickWindow(rankedIds: string[], excludeIds: Iterable<string>, size = WINDOW, min = PICK_COUNT): { ids: string[]; widened: boolean } {
  const ex = new Set(excludeIds);
  for (let start = 0; start < rankedIds.length; start += size) {
    const ids = rankedIds.slice(start, start + size).filter((id) => !ex.has(id));
    if (ids.length >= min) return { ids, widened: start > 0 };
  }
  // 전부 훑어도 min개가 안 되면 남은 것 전부 (그래도 모자라면 호출한 쪽이 있는 만큼만 보여 준다)
  return { ids: rankedIds.filter((id) => !ex.has(id)), widened: rankedIds.length > size };
}

// 응답 글자에서 JSON 한 덩어리를 꺼낸다 — 코드 블록·앞뒤 설명이 붙어 와도 첫 { 부터 짝이 맞는 } 까지. 못 읽으면 null
export function parseAiJson(text: string | null | undefined): unknown {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

// 검증 — 정확히 3개, 전부 후보 안, 중복 없음, 이유가 비어 있지 않고 40자 이내. 하나라도 틀리면 null
export function validatePicks(parsed: unknown, candidateIds: ReadonlySet<string>, count = PICK_COUNT): Pick[] | null {
  const picks = (parsed as { picks?: unknown } | null)?.picks;
  if (!Array.isArray(picks) || picks.length !== count) return null;
  const seen = new Set<string>();
  const out: Pick[] = [];
  for (const p of picks) {
    const id = (p as { id?: unknown })?.id;
    const reason = (p as { reason?: unknown })?.reason;
    if (typeof id !== 'string' || !candidateIds.has(id) || seen.has(id)) return null;
    if (typeof reason !== 'string') return null;
    const r = reason.trim().replace(/\s+/g, ' ');
    if (!r || [...r].length > REASON_MAX) return null;
    seen.add(id);
    out.push({ id, reason: r });
  }
  return out;
}

// 대체 문구 — DB 값으로 확인되는 사실만 (인원·협동 여부). 40자를 넘기지 않는다
type FactGame = { max_players?: number | null; party_max?: number | null; has_online_coop?: boolean | null; has_local_coop?: boolean | null; has_pvp?: boolean | null; is_free?: boolean | null };
export function fallbackReason(g: FactGame, n: number | null): string {
  const max = g.party_max ?? g.max_players ?? null;
  if (n === 1) return '혼자서도 할 수 있어요';
  if (n && n >= 2 && max != null && max >= n) {
    if (g.has_online_coop) return `${n}명이 온라인 협동으로 할 수 있어요`;
    if (g.has_pvp) return `${n}명이 친구끼리 붙을 수 있어요`;
    if (g.has_local_coop) return `${n}명이 한 화면에서 같이 해요`;
    return `${n}명이 같이 할 수 있어요`;
  }
  if (g.has_online_coop) return '온라인 협동으로 같이 할 수 있어요';
  return '조건에 잘 맞는 순으로 골랐어요';
}

export function fallbackPicks<T extends FactGame & { id: string }>(ranked: T[], n: number | null, count = PICK_COUNT): Pick[] {
  return ranked.slice(0, count).map((g) => ({ id: g.id, reason: fallbackReason(g, n) }));
}

export const AI_TIMEOUT_MS = 8000;

// AI 호출 → 검증 → 실패하면 점수 상위 count개 + 대체 문구. 다시 묻지 않는다. 타임아웃·예외·빈 응답·검증 실패는 모두 fallback
// callAi: 응답 글자를 돌려주는 함수(테스트에서는 mock). 넘긴 signal이 abort되면 그만두어야 한다
export async function choosePicks<T extends FactGame & { id: string }>(
  callAi: (signal: AbortSignal, count: number) => Promise<string | null>,
  candidates: T[], // 점수 순 후보 (AI에게 준 것과 같은 목록)
  n: number | null,
  timeoutMs = AI_TIMEOUT_MS,
  count = PICK_COUNT, // 고를 개수
): Promise<{ picks: Pick[]; fallback: boolean; why?: 'few' | 'empty' | 'invalid' | 'error' }> {
  const fallback = (why: 'few' | 'empty' | 'invalid' | 'error') => ({ picks: fallbackPicks(candidates, n, count), fallback: true as const, why });
  if (candidates.length < count) return fallback('few'); // 개수를 못 채우면 AI를 부르지 않는다
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const text = await Promise.race([
      callAi(ctrl.signal, count),
      new Promise<null>((resolve) => { timer = setTimeout(() => { ctrl.abort(); resolve(null); }, timeoutMs); }),
    ]);
    if (!text) return fallback('empty'); // 타임아웃·호출 실패·빈 응답
    const picks = validatePicks(parseAiJson(text), new Set(candidates.map((c) => c.id)), count);
    return picks ? { picks, fallback: false } : fallback('invalid');
  } catch {
    return fallback('error');
  } finally {
    clearTimeout(timer);
  }
}
