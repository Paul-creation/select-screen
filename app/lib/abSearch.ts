// /find 하나로 통합된 검색 조건의 순수 규칙 — 다른 파일을 import하지 않아 테스트(abSearch.test.mjs)가 .ts를 바로 불러온다
// 조건은 전부 주소 쿼리로 주고받는다. 요약 바(누구랑·어떻게·뭐 할까)와 왼쪽 "더 좁히기" 필터는 같은 값이다
//   요약 바: n(인원) · players(인원 범위) · how(방식) · g(장르, 쉼표) · gm(장르 모두/하나라도) · kw(직접 입력)
//   칩·필터: o(무료·만 원 이하·지금 할인 중·한국어, 쉼표) · fs · trend · mypc · mode · net · solo|duo|large · story · price · demo · low · barrier · rev · tv · act · actu · tags · match · ex
//   화면: sort · view
// 예전 /?players=…&sale=1 같은 주소도 같은 파서가 읽는다(옛 키는 새 키로 바뀌어 serialize된다) — proxy.ts가 / 의 옛 주소를 308로 /find에 보낼 때 쓴다
// 전부 DB 값으로만 판정하고 AI는 쓰지 않는다. 인원·한국어·무료는 값이 비어 있으면 통과, 나머지는 값이 있어야 통과

export const MAX_N = 16;
export const PRICE_STEP = 5000;
export const PRICE_MAX = 10;
export type Range = [number, number];
export const PLAYERS_ALL: Range = [0, MAX_N];
export const PRICE_ALL: Range = [0, PRICE_MAX];
export const LARGE_MIN = 8; // "8인 이상" 칩 — 최대 인원이 이 값 이상

export type HowKey = 'coop' | 'pvp' | 'party' | 'brain' | 'any';
export const HOWS: { key: HowKey; label: string; desc: string; mark: string }[] = [
  { key: 'coop', label: '같이 깨기', desc: '협동해서 끝까지', mark: '＋' },
  { key: 'pvp', label: '서로 붙기', desc: '친구끼리 대전', mark: '×' },
  { key: 'party', label: '왁자지껄 파티', desc: '짧게 여러 판', mark: '◎' },
  { key: 'brain', label: '머리 맞대기', desc: '퍼즐, 말로 맞추는 게임', mark: '?' },
  { key: 'any', label: '아무거나', desc: '재밌으면 됨', mark: '∗' },
];

// 장르 타일 — 게임이 아래 중 하나라도 가지면 맞는 것으로 본다 (genres·themes는 IGDB 영문 이름, tags는 태그 사전 이름, acts는 활동 키)
export type GenreKey = 'horror' | 'survival' | 'drive' | 'cook' | 'puzzle' | 'scifi' | 'fantasy' | 'racing' | 'sports' | 'rhythm';
type Rule = { genres?: string[]; themes?: string[]; tags?: string[]; acts?: string[] };
export const GENRES: { key: GenreKey; label: string; rule: Rule }[] = [
  { key: 'horror', label: '공포', rule: { themes: ['Horror'], tags: ['horror'], acts: ['horror_scare'] } },
  { key: 'survival', label: '생존·크래프팅', rule: { themes: ['Survival'], tags: ['survival', 'crafting'], acts: ['craft'] } },
  { key: 'drive', label: '운전·여행', rule: { tags: ['driving'], acts: ['drive', 'ride', 'sail', 'fly', 'train'] } },
  { key: 'cook', label: '요리', rule: { tags: ['cooking'], acts: ['cook'] } },
  { key: 'puzzle', label: '퍼즐', rule: { genres: ['Puzzle'], tags: ['puzzle'], acts: ['puzzle'] } },
  { key: 'scifi', label: '우주·SF', rule: { themes: ['Science fiction'], tags: ['space', 'scifi'] } },
  { key: 'fantasy', label: '판타지', rule: { themes: ['Fantasy'], tags: ['fantasy'] } },
  { key: 'racing', label: '레이싱', rule: { genres: ['Racing'], tags: ['racing'] } },
  { key: 'sports', label: '스포츠', rule: { genres: ['Sport'], tags: ['sports'], acts: ['sports'] } },
  { key: 'rhythm', label: '리듬', rule: { genres: ['Music'], tags: ['rhythm'], acts: ['music'] } },
];
export const genreLabel = (k: GenreKey) => GENRES.find((g) => g.key === k)?.label ?? k;

// "어떻게" 중 협동·대전은 플래그로, 파티·머리 맞대기는 규칙으로
export const HOW_RULES: Record<'party' | 'brain', Rule> = {
  party: { themes: ['Party'], tags: ['party', 'minigames'], acts: ['minigame'] },
  brain: { genres: ['Puzzle'], tags: ['puzzle', 'wordgame', 'trivia', 'deduction'], acts: ['puzzle', 'deduction'] },
};

// 자주 쓰는 칩 — 주소는 o=free,u10k,sale,ko (우당탕 협동만 fs=1, lib/friendslop). "쉬운 게임"은 진입장벽 낮음(barrier)과 같은 값이라 칩 자리에서 barrier를 켜고 끈다
export type OptKey = 'free' | 'u10k' | 'sale' | 'ko' | 'fs';
export const OPTS: { key: OptKey; label: string }[] = [
  { key: 'free', label: '무료' },
  { key: 'u10k', label: '만 원 이하' },
  { key: 'sale', label: '지금 할인 중' },
  { key: 'ko', label: '한국어' },
  { key: 'fs', label: '우당탕 협동' },
];
export const U10K = 10000;

// 지금 뜨는 게임 — 매일 판정해 저장한 값(games.trend_badge)과 출시 예정(release_status). 여럿이면 합집합
// 신작 = new / 인기 급상승 = rising_old + rising_recent / 다시 뜨는 중 = rising_old(출시 1년 이상) / 출시 예정 = coming_soon
export type TrendKey = 'new' | 'rising' | 'back' | 'soon';
export const TRENDS: [TrendKey, string][] = [['new', '신작'], ['rising', '인기 급상승'], ['back', '다시 뜨는 중'], ['soon', '출시 예정']];
const TREND_BADGES: Record<Exclude<TrendKey, 'soon'>, string[]> = { new: ['new'], rising: ['rising_old', 'rising_recent'], back: ['rising_old'] };

// 같이 하는 방식 — 고른 것을 모두 만족하는 게임
export type ModeKey = 'online' | 'local' | 'pvp';
export const MODES: [ModeKey, string][] = [['online', '온라인 협동'], ['local', '같은 화면'], ['pvp', '대전·경쟁']];
// 네트워크 — 크로스플레이는 따로 만족해야 하고, 전용 서버·P2P는 고른 것 중 하나 (온라인 협동·대전이 있는 게임만)
export type NetKey = 'crossplay' | 'dedicated' | 'p2p';
export const NETS: [NetKey, string][] = [['crossplay', '크로스플레이'], ['dedicated', '전용 서버'], ['p2p', 'P2P']];
const HOST_OF: Record<string, string> = { dedicated: '전용 서버', p2p: 'P2P' };

// 최대 인원 조건 — 하나만 (1인 전용 · 2인 전용 · 8인 이상)
export type SizeKey = 'solo' | 'duo' | 'large';
export const SIZES: [SizeKey, string][] = [['solo', '1인 전용'], ['duo', '2인 전용'], ['large', '8인 이상']];

// 진입장벽 칩 ↔ 주소 값 (?barrier=low,mid)
export type BarrierKey = '낮음' | '보통' | '높음';
export const BARRIERS: [BarrierKey, string][] = [['낮음', 'low'], ['보통', 'mid'], ['높음', 'high']];

// 정렬 — 기본값은 요약 바 조건(누구랑·어떻게·뭐 할까)이 하나라도 있으면 잘 맞는 순, 없으면 뜨는 순
export type SortKey = 'fit' | 'hot' | 'recent' | 'discount' | 'price';
export const SORTS: [SortKey, string][] = [['fit', '잘 맞는 순'], ['hot', '뜨는 순'], ['recent', '최근 추가순'], ['discount', '할인 큰 순'], ['price', '낮은 가격순']];
export type ViewKey = 'row' | 'card';

export type GenreMode = 'all' | 'any'; // 장르를 여러 개 골랐을 때: all = 고른 장르를 모두 가진 게임, any = 하나라도 가진 게임

export type AbQuery = {
  // ----- 요약 바 -----
  n: number | null;       // 누구랑 — 한 명수(점) 또는 범위의 아래쪽
  nTo: number | null;     // 범위의 위쪽 (점이면 null). 5명 이상은 16
  how: HowKey | null;
  genres: GenreKey[];
  gm: GenreMode;
  kw: string;
  // ----- 칩 · 더 좁히기 -----
  opts: OptKey[];
  trend: TrendKey[];
  mypc: boolean;          // 내 PC로 돌아가는 게임만 (사양이 있을 때만 실제로 걸림)
  mode: ModeKey[];
  net: NetKey[];
  size: SizeKey | null;
  story: boolean;         // 혼자도 충분 (solo_mode = story)
  price: Range;           // 5,000원 단위 눈금
  demo: boolean;          // 데모 있음
  low: boolean;           // 지금이 역대 최저가
  barrier: BarrierKey[];
  rev: boolean;           // Steam 매우 긍정적 이상
  tv: boolean;            // 스트리머가 한 게임
  act: string[];          // 가능한 활동 (고른 활동을 모두 가진 게임)
  actu: boolean;          // 확인 중인 활동도 포함
  tags: string[];         // 분류 — 태그 나무 칸 번호 (예전 주소의 태그 이름도 그대로 둔다)
  tagAny: boolean;        // 고른 분류 중 하나라도 (이벤트 링크 ?match=any)
  ex: string[];           // 빼고 보기 (이용 연령·표현 칸 번호)
  // ----- 화면 -----
  sort: SortKey | null;   // null = 기본값
  view: ViewKey;
};
export const EMPTY_QUERY: AbQuery = {
  n: null, nTo: null, how: null, genres: [], gm: 'all', kw: '',
  opts: [], trend: [], mypc: false, mode: [], net: [], size: null, story: false, price: PRICE_ALL, demo: false, low: false,
  barrier: [], rev: false, tv: false, act: [], actu: false, tags: [], tagAny: false, ex: [],
  sort: null, view: 'row',
};

const isHow = (v: string | null): v is HowKey => !!v && HOWS.some((h) => h.key === v);
const isGenre = (v: string): v is GenreKey => GENRES.some((g) => g.key === v);
const isOpt = (v: string): v is OptKey => OPTS.some((o) => o.key === v);
const isNet = (v: string): v is NetKey => NETS.some(([k]) => k === v);
const isSort = (v: string | null): v is SortKey => SORTS.some(([k]) => k === v);
const uniq = <T,>(a: T[]) => [...new Set(a)];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// "2-7" 또는 "5"(5~5로 해석) → [작은 값, 큰 값]. 잘못된 값이면 null
function pair(v: string | null): [number, number] | null {
  const m = /^(\d+)(?:-(\d+))?$/.exec(v || '');
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] == null ? a : Number(m[2]);
  return a <= b ? [a, b] : [b, a];
}

// 예전 인원 칸 주소(?p=3-4인 등)
const LEGACY_P: Record<string, Range> = { '2인': [2, 2], '3-4인': [3, 4], '5인 이상': [5, MAX_N], '16명 이상': [MAX_N, MAX_N] };

export function parseQuery(sp: { get(k: string): string | null; has?(k: string): boolean }): AbQuery {
  const get = (k: string) => sp.get(k);
  const has = (k: string) => (sp.has ? sp.has(k) : sp.get(k) != null);
  const list = (k: string) => (get(k) || '').split(',').filter(Boolean);

  // 인원: players=2-7(범위) 또는 n=4(한 명수). 예전 p=3-4인도 읽는다
  let lo = 0;
  let hi = MAX_N;
  const pp = has('players') ? pair(get('players')) : null;
  if (pp) { hi = clamp(pp[1], 1, MAX_N); lo = clamp(pp[0], 0, hi); }
  else if (has('n') && Number.isInteger(Number(get('n'))) && Number(get('n')) >= 1) { lo = hi = Math.min(Number(get('n')), MAX_N); }
  else if (LEGACY_P[get('p') || '']) [lo, hi] = LEGACY_P[get('p') || ''];
  let n: number | null = null;
  let nTo: number | null = null;
  if (!(lo <= 0 && hi >= MAX_N)) {
    if (lo === hi) n = lo;
    else { n = lo || null; nTo = hi; }
  }

  // 가격: price=0-30000 (원)
  const pr = has('price') ? pair(get('price')) : null;
  const price: Range = pr ? [clamp(Math.round(pr[0] / PRICE_STEP), 0, PRICE_MAX), clamp(Math.round(pr[1] / PRICE_STEP), 0, PRICE_MAX)] : PRICE_ALL;
  const opts = new Set<OptKey>(list('o').filter(isOpt));
  if (get('fs') === '1') opts.add('fs');
  if (get('sale') === '1') opts.add('sale');
  if (get('free') === '1') opts.add('free');

  const oList = list('o');
  const barrier = uniq([
    ...(get('barrier') || '').split(',').map((x) => BARRIERS.find(([, u]) => u === x)?.[0]).filter((x): x is BarrierKey => !!x),
    ...(oList.includes('easy') ? (['낮음'] as BarrierKey[]) : []), // 예전 "쉬운 게임" 칩
  ]);

  // 예전 분류 칩 cat=협동·대전·혼자
  const how = get('how');
  const cat = get('cat');
  let hw: HowKey | null = isHow(how) ? how : null;
  if (!hw && cat === '협동') hw = 'coop';
  if (!hw && cat === '대전') hw = 'pvp';
  const size: SizeKey | null = get('solo') === '1' || get('p') === '1인' || cat === '혼자' ? 'solo' : get('duo') === '1' ? 'duo' : get('large') === '1' ? 'large' : null;

  const mode = [...list('mode'), ...(oList.includes('local') ? ['local'] : [])]; // 예전 "한 화면에서" 칩 = 같은 화면
  const netList = list('net').filter(isNet);
  const sort = get('sort');

  return {
    n, nTo, how: hw,
    genres: uniq(list('g').filter(isGenre)),
    gm: get('gm') === 'any' ? 'any' : 'all', // 없거나 모르는 값이면 all
    kw: (get('kw') || get('q') || '').trim().slice(0, 40), // 예전 이름 검색 q도 직접 입력으로
    opts: OPTS.map((o) => o.key).filter((k) => opts.has(k)),
    trend: TRENDS.map(([k]) => k).filter((k) => list('trend').includes(k)),
    mypc: get('mypc') === '1',
    mode: MODES.map(([k]) => k).filter((k) => mode.includes(k)),
    net: NETS.map(([k]) => k).filter((k) => netList.includes(k)),
    size,
    story: get('story') === '1',
    price: price[0] === PRICE_ALL[0] && price[1] === PRICE_ALL[1] ? PRICE_ALL : price,
    demo: get('demo') === '1',
    low: get('low') === '1',
    barrier: BARRIERS.map(([k]) => k).filter((k) => barrier.includes(k)),
    rev: get('rev') === '1',
    tv: get('tv') === '1',
    act: uniq(list('act').filter((a) => /^[a-z_]+$/.test(a))),
    actu: get('actu') === '1',
    tags: uniq(list('tags')),
    tagAny: get('match') === 'any',
    ex: uniq(list('ex').filter((t) => /^\d+$/.test(t))),
    sort: isSort(sort) ? sort : null,
    view: get('view') === 'card' ? 'card' : 'row',
  };
}

export function queryToParams(q: AbQuery): string {
  const p = new URLSearchParams();
  if (q.nTo == null) { if (q.n) p.set('n', String(q.n)); }
  else p.set('players', `${q.n ?? 0}-${q.nTo}`);
  if (q.how) p.set('how', q.how);
  if (q.genres.length) p.set('g', q.genres.join(','));
  if (q.genres.length > 1 && q.gm === 'any') p.set('gm', 'any'); // all은 기본값이라 주소에 싣지 않는다
  if (q.kw) p.set('kw', q.kw);
  const normal = q.opts.filter((o) => o !== 'fs');
  if (normal.length) p.set('o', normal.join(','));
  if (q.opts.includes('fs')) p.set('fs', '1');
  if (q.trend.length) p.set('trend', q.trend.join(','));
  if (q.mypc) p.set('mypc', '1');
  if (q.mode.length) p.set('mode', q.mode.join(','));
  if (q.net.length) p.set('net', q.net.join(','));
  if (q.size) p.set(q.size, '1');
  if (q.story) p.set('story', '1');
  if (q.price[0] !== PRICE_ALL[0] || q.price[1] !== PRICE_ALL[1]) p.set('price', `${q.price[0] * PRICE_STEP}-${q.price[1] * PRICE_STEP}`);
  if (q.demo) p.set('demo', '1');
  if (q.low) p.set('low', '1');
  if (q.barrier.length) p.set('barrier', BARRIERS.filter(([k]) => q.barrier.includes(k)).map(([, u]) => u).join(','));
  if (q.rev) p.set('rev', '1');
  if (q.tv) p.set('tv', '1');
  if (q.act.length) p.set('act', q.act.join(','));
  if (q.act.length && q.actu) p.set('actu', '1');
  if (q.tags.length) p.set('tags', q.tags.join(','));
  if (q.tags.length && q.tagAny) p.set('match', 'any');
  if (q.ex.length) p.set('ex', q.ex.join(','));
  if (q.sort) p.set('sort', q.sort);
  if (q.view === 'card') p.set('view', 'card');
  return p.toString();
}

export const queryHref = (q: AbQuery) => {
  const s = queryToParams(q);
  return s ? `/find?${s}` : '/find';
};

// 옛 메인 검색 주소(/?players=… 같은 필터 쿼리)를 /find 새 형식으로 — 필터 키가 하나도 없으면 null
// (/?ai=1 처럼 필터가 아닌 쿼리는 그대로 두므로 null)
const LEGACY_KEYS = ['r', 'q', 'cat', 'tags', 'act', 'actu', 'ex', 'barrier', 'story', 'net', 'p', 'd', 'free', 'sale', 'cmp', 'players', 'price', 'solo', 'duo', 'large', 'demo', 'fs', 'trend', 'mypc', 'match', 'sort'];
export function legacyHomeToFind(sp: { get(k: string): string | null; has(k: string): boolean }): string | null {
  if (!LEGACY_KEYS.some((k) => sp.has(k))) return null;
  const q = parseQuery(sp);
  // 예전 "무료만"(price=0-0)은 "무료" 칩과 같은 값 — 새 /find의 가격 슬라이더는 무료~무료도 범위로 읽으므로 옛 주소에서만 바꾼다
  if (q.price[0] === 0 && q.price[1] === 0) return queryHref({ ...q, price: PRICE_ALL, opts: OPTS.map((o) => o.key).filter((k) => k === 'free' || q.opts.includes(k)) });
  return queryHref(q);
}

// 요약 바 조건(누구랑·어떻게·뭐 할까)이 하나라도 있나 — 기본 정렬을 가른다
export const hasBarConditions = (q: AbQuery) => q.n != null || q.nTo != null || !!q.how || q.genres.length > 0 || !!q.kw;
export const sortOf = (q: AbQuery): SortKey => q.sort ?? (hasBarConditions(q) ? 'fit' : 'hot');

// 화면 설정(정렬·보기)을 뺀 조건이 하나도 없나
export const isEmptyQuery = (q: AbQuery) => queryToParams({ ...q, sort: null, view: 'row' }) === '';

// 인원 범위 눈금 (0 = 상관없음, 16 = 16명+)
export const playersRange = (q: AbQuery): Range => [q.n ?? 0, q.nTo ?? q.n ?? MAX_N];
export function rangeToPlayers(r: Range): Pick<AbQuery, 'n' | 'nTo'> {
  const [lo, hi] = r;
  if (lo <= 0 && hi >= MAX_N) return { n: null, nTo: null };
  if (lo === hi) return { n: lo, nTo: null };
  return { n: lo || null, nTo: hi };
}

// 인원 글자 — "혼자" · "4명" · "5명 이상" · "2~4명"
export function whoText(q: AbQuery): string {
  const [lo, hi] = playersRange(q);
  if (lo <= 0 && hi >= MAX_N) return '';
  if (q.nTo == null) return lo >= 5 ? `${lo}명 이상` : lo === 1 ? '혼자' : `${lo}명`;
  if (hi >= MAX_N) return `${lo}명 이상`;
  if (lo <= 0) return `${hi}명 이하`;
  return `${lo}~${hi}명`;
}

// 뭐 할까 칸 글자 — 여럿이면 "공포 외 1개" (말줄임 "공포, ..." 안 씀)
function whatText(q: AbQuery) {
  const items = [...q.genres.map(genreLabel), ...(q.kw ? [q.kw] : [])];
  return items.length > 1 ? `${items[0]} 외 ${items.length - 1}개` : (items[0] ?? '');
}

// 요약 바 글자 — "4명 | 같이 깨기 | 공포"
export function summaryParts(q: AbQuery) {
  return {
    who: whoText(q),
    how: q.how ? HOWS.find((h) => h.key === q.how)!.label : '',
    what: whatText(q),
  };
}

// ---------- 게임 판정 ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 게임 칸은 목록(gameIndex)과 같은 느슨한 모양
export type AbGame = any;

// 태그 판정은 브라우저가 태그 나무로 만들어 넘긴다 (이 파일은 나무를 모른다)
export type AbCtx = {
  hasTag: (g: AbGame, names: string[]) => boolean; // 사전 이름(정규화) 중 하나라도 가진 게임
};
export const NO_TAGS: AbCtx = { hasTag: () => false };

const hasAny = (list: string[] | null | undefined, want?: string[]) => !!want?.length && !!list?.some((x) => want.includes(x));

function matchesRule(g: AbGame, r: Rule, ctx: AbCtx) {
  return hasAny(g.genres, r.genres) || hasAny(g.themes, r.themes) || hasAny(g.activities_confirmed, r.acts) || (!!r.tags && ctx.hasTag(g, r.tags));
}

export const matchesGenre = (g: AbGame, key: GenreKey, ctx: AbCtx) => matchesRule(g, GENRES.find((x) => x.key === key)!.rule, ctx);

// 인원: 최대·최소를 모르면 통과. 팀·파티 인원(party_max)이 있으면 그것을 최대로 본다
export function maxOf(g: AbGame): number | null {
  return g.party_max ?? g.max_players ?? null;
}
export function fitsPlayers(g: AbGame, n: number) {
  const max = maxOf(g);
  const min = g.min_players ?? null;
  if (max != null && n > max) return false;
  if (min != null && n < min) return false;
  return true;
}
// 범위 [lo, hi]와 게임의 가능 인원이 겹치면 통과 (0 = 아래 조건 없음, 16 = 위 조건 없음). 점이면 fitsPlayers와 같다
export function fitsRange(g: AbGame, [lo, hi]: Range) {
  if (lo <= 0 && hi >= MAX_N) return true;
  const max = maxOf(g);
  const min = g.min_players ?? null;
  if (lo > 0 && max != null && max < lo) return false;
  if (hi < MAX_N && min != null && min > hi) return false;
  return true;
}

export function matchesHow(g: AbGame, how: HowKey, ctx: AbCtx) {
  if (how === 'any') return true;
  if (how === 'coop') return !!(g.has_online_coop || g.has_local_coop);
  if (how === 'pvp') return !!g.has_pvp;
  return matchesRule(g, HOW_RULES[how], ctx);
}

// 현재 가격(할인 중이면 할인가) — 모르면 null
export function priceNow(g: AbGame): number | null {
  if (g.is_free) return 0;
  if (g.price_type) return null;
  return typeof g.price_final === 'number' ? g.price_final : null;
}
const soon = (g: AbGame) => g.release_status === 'coming_soon';

export function matchesOpt(g: AbGame, o: OptKey) {
  const p = priceNow(g);
  switch (o) {
    case 'free': return !soon(g) && (p == null ? !g.price_type : p === 0);
    case 'u10k': return !soon(g) && (p == null ? !g.price_type : p <= U10K);
    case 'sale': return (g.price_discount ?? 0) > 0;
    case 'ko': return g.no_korean !== true;
    case 'fs': return g.fs === true;
  }
}

export function barrierOf(g: AbGame): string | null {
  if (g.entry_barrier === '낮음' || g.entry_barrier === '보통' || g.entry_barrier === '높음') return g.entry_barrier;
  return ({ 쉬움: '낮음', 보통: '보통', 어려움: '높음' } as Record<string, string>)[g.difficulty] ?? null;
}

export function matchesTrend(g: AbGame, selected: TrendKey[]) {
  if (!selected.length) return true;
  return selected.some((k) => (k === 'soon' ? soon(g) : !!g.trend_badge && TREND_BADGES[k].includes(g.trend_badge)));
}
const hasDemo = (g: AbGame) => soon(g) && !!g.demo_appid;
// 지금이 역대 최저가 — 할인 중이고 현재가가 기록된 최저가 이하 (lib/price getLowestTiming의 'best'와 같은 기준)
export const isLowestNow = (g: AbGame) => {
  const p = priceNow(g);
  return !g.is_free && (g.price_discount ?? 0) > 0 && p != null && p >= 100 && typeof g.lowest_price === 'number' && g.lowest_price >= 100 && p <= g.lowest_price;
};
// Steam 평가가 매우 긍정적 이상 (매우 긍정적 · 압도적으로 긍정적)
export const isVeryPositive = (g: AbGame) => typeof g.review_summary === 'string' && /^(매우 긍정|압도적으로 긍정)/.test(g.review_summary);

// 직접 입력: 게임 이름(영문·한글·별명)이거나 태그 이름이면 맞는 것 — 이름 비교는 searchMatch와 같은 규칙을 호출 쪽이 넘긴다
export type KwMatcher = (g: AbGame, kw: string) => boolean;

// 태그 나무나 내 PC·보유 게임이 필요 없는 조건 전부 (분류·활동·빼고 보기·내 PC·보유 제외는 lib/findSearch가 이어서 판정)
export function matchesQuery(g: AbGame, q: AbQuery, ctx: AbCtx, kw: KwMatcher) {
  if (!fitsRange(g, playersRange(q))) return false;
  if (q.how && q.how !== 'any' && !matchesHow(g, q.how, ctx)) return false;
  if (q.genres.length) {
    const hit = (k: GenreKey) => matchesGenre(g, k, ctx);
    if (!(q.gm === 'any' ? q.genres.some(hit) : q.genres.every(hit))) return false;
  }
  if (q.kw && !kw(g, q.kw)) return false;
  for (const o of q.opts) if (!matchesOpt(g, o)) return false;
  if (!matchesTrend(g, q.trend)) return false;
  if (q.mode.includes('online') && !g.has_online_coop) return false;
  if (q.mode.includes('local') && !g.has_local_coop) return false;
  if (q.mode.includes('pvp') && !g.has_pvp) return false;
  if (q.net.includes('crossplay') && g.has_crossplay !== true) return false;
  const hosts = q.net.filter((k) => HOST_OF[k]).map((k) => HOST_OF[k]);
  if (hosts.length && !((g.has_online_coop === true || g.has_pvp === true) && hosts.includes(g.multiplayer_host))) return false;
  if (q.size === 'solo' && g.max_players !== 1) return false;
  if (q.size === 'duo' && g.max_players !== 2) return false;
  if (q.size === 'large' && !(g.max_players >= LARGE_MIN)) return false;
  if (q.story && g.solo_mode !== 'story') return false;
  if (q.price[0] !== PRICE_ALL[0] || q.price[1] !== PRICE_ALL[1]) {
    const p = priceNow(g);
    if (p == null) return false;
    if (!(p >= q.price[0] * PRICE_STEP && (q.price[1] >= PRICE_MAX || p <= q.price[1] * PRICE_STEP))) return false;
  }
  if (q.demo && !hasDemo(g)) return false;
  if (q.low && !isLowestNow(g)) return false;
  if (q.barrier.length && !q.barrier.includes(barrierOf(g) as BarrierKey)) return false;
  if (q.rev && !isVeryPositive(g)) return false;
  if (q.tv && !(g.streamers?.length > 0)) return false;
  return true;
}

// ---------- 정렬 ----------
// 인기순 (heat_rank 낮을수록 위, 순위 없는 게임은 뒤에 받은 순서대로)
export const byHeat = (a: AbGame, b: AbGame) => (a.heat_rank ?? Infinity) - (b.heat_rank ?? Infinity);
// 뜨는 순 — 판정 점수 높은 순 (점수가 같거나 없으면 인기순)
export const byTrendScore = (a: AbGame, b: AbGame) => (b.trend_score ?? -Infinity) - (a.trend_score ?? -Infinity) || byHeat(a, b);

// 잘 맞는 순 점수 — 고른 조건에 맞는 이유(✓)는 +1, 알아둘 점(⚠)은 -1. 같으면 인기순
export const fitScore = (g: AbGame, q: AbQuery, ctx: AbCtx) => badgesFor(g, q, ctx, 99).reduce((s, b) => s + (b.ok ? 1 : -1), 0);

export function sortGames(list: AbGame[], q: AbQuery, ctx: AbCtx): AbGame[] {
  switch (sortOf(q)) {
    case 'recent': return [...list]; // 목록이 이미 최근 추가순
    case 'discount': return [...list].sort((a, b) => (b.price_discount ?? 0) - (a.price_discount ?? 0) || byHeat(a, b));
    case 'price': return [...list].sort((a, b) => (priceNow(a) ?? Infinity) - (priceNow(b) ?? Infinity) || byHeat(a, b));
    case 'hot': return [...list].sort(byTrendScore);
    case 'fit': {
      const score = new Map(list.map((g) => [g.id, fitScore(g, q, ctx)]));
      return [...list].sort((a, b) => score.get(b.id)! - score.get(a.id)! || byHeat(a, b));
    }
  }
}

// 요약 바 조건에 맞는 게임 수 — 팝오버의 "N개 보기"
export const countMatching = (games: AbGame[], q: AbQuery, ctx: AbCtx, kw: KwMatcher) => games.filter((g) => matchesQuery(g, q, ctx, kw)).length;

// 홈 검색창 패널 아래 "N명이 같이 할 수 있는 게임 N개"
export const countFitting = (games: AbGame[], n: number) => games.filter((g) => fitsPlayers(g, n)).length;

// ---------- 근거 배지 (✓ 맞음 / ⚠ 주의) — 전부 DB 값으로만 ----------
export type Badge = { ok: boolean; text: string };
const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

// limit: 보여 줄 ✓ 개수 (⚠는 최대 3개). 정렬 점수는 99로 전부 센다
export function badgesFor(g: AbGame, q: AbQuery, ctx: AbCtx, limit = 6): Badge[] {
  const ok: Badge[] = [];
  const warn: Badge[] = [];
  const n = q.n != null && q.nTo == null ? q.n : null; // 한 명수일 때만 "N인 …" 이유를 단다
  const max = maxOf(g);
  if (n && n >= 2) {
    if (max != null && max < n) warn.push({ ok: false, text: `최대 ${max}인까지` });
    else if (g.has_online_coop && max != null) ok.push({ ok: true, text: `${n}인 온라인 협동` });
    else if (g.has_pvp && max != null) ok.push({ ok: true, text: `${n}인 대전` });
    else if (max != null) ok.push({ ok: true, text: `${n}인 가능` });
    if (g.has_local_coop && !g.has_online_coop && !(max != null && max < n)) warn.push({ ok: false, text: '온라인 협동 없음 (로컬만)' });
  } else if (n === 1 && (g.solo_mode === 'story' || g.solo_mode === 'possible' || g.solo_playable === true)) {
    ok.push({ ok: true, text: '혼자 가능' });
  }
  if (q.how === 'coop' && !(g.has_online_coop || g.has_local_coop)) warn.push({ ok: false, text: '협동 모드 없음' });
  if (q.how === 'pvp') (g.has_pvp ? ok : warn).push({ ok: !!g.has_pvp, text: g.has_pvp ? '친구끼리 대전' : '대전 모드 없음' });
  if (q.how === 'coop' && n == null && g.has_online_coop) ok.push({ ok: true, text: '온라인 협동' });
  for (const k of q.genres) if (matchesGenre(g, k, ctx)) ok.push({ ok: true, text: genreLabel(k) });
  for (const [k, label] of TRENDS) if (q.trend.includes(k) && matchesTrend(g, [k])) ok.push({ ok: true, text: label });
  for (const [k, label] of MODES) if (q.mode.includes(k)) ok.push({ ok: true, text: label });
  if (q.net.includes('crossplay') && g.has_crossplay) ok.push({ ok: true, text: '크로스플레이' });
  if (q.opts.includes('fs') && g.fs === true) ok.push({ ok: true, text: '우당탕 협동' });
  if (g.no_korean === true) warn.push({ ok: false, text: '한국어 지원 없음' });
  else if (g.korean_support && g.korean_support !== '한국어 없음' && q.opts.includes('ko')) ok.push({ ok: true, text: g.korean_support === '자막+더빙' ? '한국어 자막·더빙' : '한국어 자막' });
  if (q.low && isLowestNow(g)) ok.push({ ok: true, text: '지금 역대 최저가' });
  else if ((g.price_discount ?? 0) > 0) ok.push({ ok: true, text: `지금 ${g.price_discount}% 할인` });
  if (q.demo && hasDemo(g)) ok.push({ ok: true, text: '데모 있음' });
  if (g.is_free) ok.push({ ok: true, text: '무료' });
  else if (q.opts.includes('u10k') && !soon(g) && priceNow(g) != null && priceNow(g)! <= U10K) ok.push({ ok: true, text: '만 원 이하' });
  if (q.rev && isVeryPositive(g)) ok.push({ ok: true, text: 'Steam 평가 매우 긍정적 이상' });
  if (q.tv && g.streamers?.length > 0) ok.push({ ok: true, text: '스트리머가 한 게임' });
  const b = barrierOf(g);
  if (b === '낮음') ok.push({ ok: true, text: '처음 해도 쉬움' });
  else if (b === '높음') warn.push({ ok: false, text: '진입장벽 높음' });
  return [...ok.slice(0, limit), ...warn.slice(0, limit >= 99 ? 99 : 3)];
}

// "N명 다 사면 ₩합계" — 역대 최저가(lowest_price) × 인원, 무료면 "무료". 인원이 2명 미만이거나 가격을 모르면 null
export function groupTotal(g: AbGame, n: number | null): string | null {
  if (!n || n < 2) return null;
  if (g.is_free) return '무료';
  if (soon(g) || g.price_type) return null;
  const low = typeof g.lowest_price === 'number' && g.lowest_price >= 100 ? g.lowest_price : null;
  if (low != null) return `${n}명 다 사면 ${won(low * n)} (역대 최저가 기준)`;
  const now = priceNow(g);
  return now != null ? `${n}명 다 사면 ${won(now * n)} (현재가 기준)` : null;
}

// ---------- 상황 타일 6개 ----------
export const SITUATIONS: { key: string; title: string; desc: string; query: AbQuery }[] = [
  { key: 'duo-night', title: '둘이서 밤샘', desc: '둘이 끝까지 같이 깨는 협동', query: { ...EMPTY_QUERY, n: 2, how: 'coop' } },
  { key: 'four-coop', title: '4명 첫 협동', desc: '넷이 처음 같이 해 보는 판', query: { ...EMPTY_QUERY, n: 4, how: 'coop', barrier: ['낮음'] } },
  { key: 'newbie', title: '게임 안 하는 친구랑', desc: '진입장벽 낮은 게임만', query: { ...EMPTY_QUERY, barrier: ['낮음'], opts: ['ko'] } },
  { key: 'free-now', title: '무료로 바로', desc: '결제 없이 지금 시작', query: { ...EMPTY_QUERY, n: 2, opts: ['free'] } },
  { key: 'scream', title: '비명 지르는 공포', desc: '같이 하면 더 무서운 판', query: { ...EMPTY_QUERY, n: 3, how: 'coop', genres: ['horror'] } },
  { key: 'sale-party', title: '오늘 할인 파티게임', desc: '할인 중인 왁자지껄', query: { ...EMPTY_QUERY, n: 4, how: 'party', opts: ['sale'] } },
];
