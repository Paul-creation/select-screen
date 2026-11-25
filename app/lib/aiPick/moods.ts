// "알아서 골라줘" 입력의 정해진 선택지와 분위기 → 태그 매핑 — 다른 파일을 import하지 않아 테스트(moods.test.mjs)가 .ts를 바로 불러온다
// 사용자가 보내는 값은 전부 여기 있는 선택지만 받는다 (자유 텍스트는 서버에도 AI 프롬프트에도 들어가지 않음)
// 태그 이름은 app/lib/tag-search-dict.json의 정규화한 이름(소문자·공백 없음), themes·genres는 IGDB 영문 이름, acts는 활동 키

export const MOOD_KEYS = ['laugh', 'scary', 'brain', 'compete', 'chill', 'any'] as const;
export type MoodKey = (typeof MOOD_KEYS)[number];
export const HOW_KEYS = ['coop', 'pvp', 'party', 'brain', 'any'] as const;
export type PickHow = (typeof HOW_KEYS)[number];
export const GENRE_KEYS = ['horror', 'survival', 'drive', 'cook', 'puzzle', 'scifi', 'fantasy', 'racing', 'sports', 'rhythm'] as const;
export type PickGenre = (typeof GENRE_KEYS)[number];

export const MAX_PICK_N = 16;
export const MAX_EXCLUDE = 120;

export type MoodRule = {
  label: string;
  tags: string[];
  themes: string[];
  genres: string[];
  acts: string[];
  fs?: boolean;   // 우당탕 협동으로 판정된 게임도 맞는 것으로
  pvp?: boolean;  // 대전 모드가 있는 게임도 맞는 것으로
};

// 하나라도 맞으면 그 분위기에 맞는 게임. 상관없음은 조건 없음(빈 규칙)
export const MOODS: Record<MoodKey, MoodRule> = {
  laugh: { label: '웃고 떠들기', tags: ['party', 'partygame', 'comedy', 'funny', 'minigames', 'physics'], themes: ['Party', 'Comedy'], genres: [], acts: ['minigame'], fs: true },
  scary: { label: '무서운 거', tags: ['horror', 'psychologicalhorror', 'survivalhorror'], themes: ['Horror'], genres: [], acts: ['horror_scare'] },
  brain: { label: '머리 쓰기', tags: ['puzzle', 'puzzleplatformer', 'strategy', 'turnbasedstrategy', 'tactical', 'wordgame', 'trivia', 'socialdeduction'], themes: [], genres: ['Puzzle', 'Strategy'], acts: ['puzzle', 'deduction'] },
  compete: { label: '경쟁', tags: ['arenashooter', 'battleroyale', 'fighting'], themes: [], genres: ['Fighting'], acts: [], pvp: true },
  chill: { label: '느긋하게', tags: ['relaxing', 'cozy', 'wholesome', 'sandbox', 'farmingsim', 'citybuilder'], themes: [], genres: [], acts: ['craft'] },
  any: { label: '상관없음', tags: [], themes: [], genres: [], acts: [] },
};

export const moodLabel = (m: MoodKey | null | undefined) => (m ? MOODS[m].label : '');
export const isMoodFree = (m: MoodKey | null | undefined) => !m || m === 'any';

// 분위기를 서버 추천용 검색 조건 이름으로 — "어떻게"가 비어 있을 때만 분위기에서 채운다 (고른 값이 우선)
export const MOOD_HOW: Partial<Record<MoodKey, PickHow>> = { compete: 'pvp' };

export type PickInput = {
  n: number | null;
  how: PickHow | null;
  g: PickGenre[];
  mood: MoodKey | null;
  excludeIds: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

// 요청 본문 → 정해진 선택지만 남긴 입력. 모르는 값은 버린다(오류 없이). 내용이 하나도 안 맞아도 빈 입력으로 돌려준다
export function parsePickInput(body: unknown): PickInput {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const rawN = typeof o.n === 'number' ? o.n : typeof o.n === 'string' && /^\d{1,2}$/.test(o.n) ? Number(o.n) : null;
  const n = rawN != null && Number.isInteger(rawN) && rawN >= 1 ? Math.min(rawN, MAX_PICK_N) : null;
  const how = has(HOW_KEYS, o.how) ? o.how : null;
  const g = Array.isArray(o.g) ? [...new Set(o.g.filter((x): x is PickGenre => has(GENRE_KEYS, x)))].sort() : [];
  const mood = has(MOOD_KEYS, o.mood) ? o.mood : null;
  const excludeIds = Array.isArray(o.excludeIds)
    ? [...new Set(o.excludeIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)).map((x) => x.toLowerCase()))].slice(0, MAX_EXCLUDE)
    : [];
  return { n, how, g, mood, excludeIds };
}

// 조건이 하나라도 있나 — 없으면 화면이 질문 패널부터 연다 (직접 입력(kw)은 선택지가 아니라 세지 않는다)
export const hasPickConditions = (i: Pick<PickInput, 'n' | 'how' | 'g' | 'mood'>) => i.n != null || !!i.how || i.g.length > 0 || !isMoodFree(i.mood);

// "비슷한 게임 전체 보기 →"로 /find에 넘길 때 분위기를 /find의 조건으로 바꾸는 표 — /find에는 분위기 칸이 없어서 가장 가까운 조건 하나로
// (웃고 떠들기 = 우당탕 협동 칩, 무서운 거 = 공포 장르, 머리 쓰기 = 머리 맞대기, 경쟁 = 서로 붙기. 느긋하게는 가까운 조건이 없어 비움)
export const MOOD_FIND: Record<MoodKey, { how?: PickHow; genres?: PickGenre[]; fs?: boolean }> = {
  laugh: { fs: true },
  scary: { genres: ['horror'] },
  brain: { how: 'brain' },
  compete: { how: 'pvp' },
  chill: {},
  any: {},
};
