// "알아서 골라줘" 입력의 정해진 선택지와 분위기 → 태그 매핑 — 다른 파일을 import하지 않아 테스트(moods.test.mjs)가 .ts를 바로 불러온다
// 사용자가 보내는 값은 전부 여기 있는 선택지만 받는다 (자유 텍스트는 서버에도 AI 프롬프트에도 들어가지 않음)
// 태그 이름은 app/lib/tag-search-dict.json의 정규화한 이름(소문자·공백 없음), themes·genres는 IGDB 영문 이름, acts는 활동 키

export const MOOD_KEYS = ['laugh', 'scary', 'brain', 'compete', 'chill', 'any'] as const;
export type MoodKey = (typeof MOOD_KEYS)[number];
export const HOW_KEYS = ['coop', 'pvp', 'party', 'brain', 'any'] as const;
export type PickHow = (typeof HOW_KEYS)[number];
export const GENRE_KEYS = ['horror', 'survival', 'drive', 'cook', 'puzzle', 'scifi', 'fantasy', 'racing', 'sports', 'rhythm'] as const;
export type PickGenre = (typeof GENRE_KEYS)[number];

export const MAX_PICK_N = 5; // 5는 "5명 이상"
export const MAX_EXCLUDE = 50;

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

// 요청 본문 → 입력. 정해진 키·선택지만 받고, 하나라도 벗어나면 null(= 400). 버리고 계속 진행하지 않는다. 빈 객체({})는 정상(조건 없음)
// null·undefined는 "고르지 않음"으로 받는다 — 화면이 고르지 않은 칸을 null로 보낸다
// 분위기는 칸이 없거나 null·""이면 상관없음(any)으로 통일한다 — 운영진 추천 매칭·캐시 키·로그가 같은 값을 본다
const KEYS = ['n', 'how', 'g', 'mood', 'excludeIds'] as const;
export function parsePickInput(body: unknown): PickInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  if (Object.keys(o).some((k) => !(KEYS as readonly string[]).includes(k))) return null;
  const nil = (v: unknown) => v === undefined || v === null;

  if (!nil(o.n) && !(typeof o.n === 'number' && Number.isInteger(o.n) && o.n >= 1 && o.n <= MAX_PICK_N)) return null;
  if (!nil(o.how) && !has(HOW_KEYS, o.how)) return null;
  const noMood = nil(o.mood) || o.mood === '';
  if (!noMood && !has(MOOD_KEYS, o.mood)) return null;
  if (!nil(o.g) && (!Array.isArray(o.g) || o.g.length > GENRE_KEYS.length || !o.g.every((x) => has(GENRE_KEYS, x)))) return null;
  if (!nil(o.excludeIds) && (!Array.isArray(o.excludeIds) || o.excludeIds.length > MAX_EXCLUDE || !o.excludeIds.every((x) => typeof x === 'string' && UUID.test(x)))) return null;

  return {
    n: nil(o.n) ? null : (o.n as number),
    how: nil(o.how) ? null : (o.how as PickHow),
    g: nil(o.g) ? [] : [...new Set(o.g as PickGenre[])].sort(),
    mood: noMood ? 'any' : (o.mood as MoodKey),
    excludeIds: nil(o.excludeIds) ? [] : [...new Set((o.excludeIds as string[]).map((x) => x.toLowerCase()))],
  };
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
