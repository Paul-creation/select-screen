// "알아서 골라줘" 캐시 키 — 정규화한 조건 + 이미 보여 준 게임 + 운영진 추천 id + (로그인했으면) 사용자 id의 해시. node 내장 모듈만 쓴다 (cacheKey.test.mjs)
import { createHash } from 'crypto';

export const CACHE_HOURS = 6;
const VERSION = 'v1'; // 프롬프트·점수 규칙을 바꾸면 올려서 옛 캐시를 건너뛴다

type KeyInput = { n: number | null; how: string | null; g: string[]; mood: string | null; excludeIds: string[] };

// 같은 뜻이면 같은 키 — 장르·제외 목록은 정렬·중복 제거, 모르는 칸은 null. 사용자 id는 해시에만 섞고 원문은 남지 않는다
export function pickCacheKey(i: KeyInput, userId: string | null, staffPickId: string | null = null): string {
  const norm = {
    v: VERSION,
    n: i.n ?? null,
    how: i.how ?? null,
    g: [...new Set(i.g)].sort(),
    mood: i.mood ?? null,
    ex: [...new Set(i.excludeIds.map((x) => x.toLowerCase()))].sort(),
    sp: staffPickId ? staffPickId.toLowerCase() : 'none',
    u: userId ? userId.toLowerCase() : null,
  };
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}
