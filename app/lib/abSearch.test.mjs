// 실행: npm test (Node 내장 테스트, .ts를 바로 불러온다)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuery, queryToParams, queryHref, legacyHomeToFind, matchesQuery, badgesFor, groupTotal, fitsPlayers, fitsRange, countFitting, countMatching,
  NO_TAGS, EMPTY_QUERY, summaryParts, sortGames, sortOf, isEmptyQuery, playersRange, rangeToPlayers, matchesTrend, byTrendScore,
} from './abSearch.ts';

const kw = (g, k) => g.name.toLowerCase().includes(k.toLowerCase());
const G = [
  { id: 'a', name: 'Alpha', min_players: 1, max_players: 4, has_online_coop: true, themes: ['Horror'], is_free: true, entry_barrier: '낮음', heat_rank: 2 },
  { id: 'b', name: 'Beta', min_players: 2, max_players: 2, has_local_coop: true, price_final: 15000, lowest_price: 9000, entry_barrier: '높음', no_korean: true, heat_rank: 1 },
  { id: 'c', name: 'Gamma', has_pvp: true, price_final: 8000, price_discount: 20, korean_support: '자막' },
];
const ids = (q, games = G) => games.filter((g) => matchesQuery(g, q, NO_TAGS, kw)).map((g) => g.id);
const P = (s) => parseQuery(new URLSearchParams(s));

test('주소 ↔ 조건', () => {
  const q = P('n=4&how=coop&g=horror,zzz&o=free,ko,bad&kw=abc');
  assert.deepEqual(q, { ...EMPTY_QUERY, n: 4, how: 'coop', genres: ['horror'], kw: 'abc', opts: ['free', 'ko'] });
  assert.equal(queryToParams(q), 'n=4&how=coop&g=horror&kw=abc&o=free%2Cko');
  assert.deepEqual(P('n=0&how=x'), EMPTY_QUERY);
});

test('필터 전부 주소로 왕복', () => {
  const s = 'n=2&how=coop&g=horror&o=sale&fs=1&trend=new%2Crising&mypc=1&mode=online%2Clocal&net=crossplay&duo=1&story=1&price=5000-20000&demo=1&low=1&barrier=low%2Cmid&rev=1&tv=1&act=drive&actu=1&tags=1663&ex=9&sort=price&view=card';
  const q = P(s);
  assert.equal(queryToParams(q), s);
  assert.equal(queryHref(EMPTY_QUERY), '/find');
});

test('인원: 점은 n, 범위는 players, 0~16은 필터 없음', () => {
  assert.deepEqual(playersRange(P('n=2')), [2, 2]);
  assert.deepEqual(playersRange(P('players=2-4')), [2, 4]);
  assert.deepEqual(playersRange(P('players=5-16')), [5, 16]);
  assert.deepEqual(playersRange(P('players=0-16')), [0, 16]);
  assert.equal(queryToParams(P('players=2-2')), 'n=2');
  assert.equal(queryToParams(P('players=3-4')), 'players=3-4');
  assert.deepEqual(rangeToPlayers([0, 16]), { n: null, nTo: null });
  assert.deepEqual(rangeToPlayers([3, 3]), { n: 3, nTo: null });
  assert.deepEqual(rangeToPlayers([0, 4]), { n: null, nTo: 4 });
  assert.equal(summaryParts(P('n=1')).who, '혼자');
  assert.equal(summaryParts(P('n=2')).who, '2명');
  assert.equal(summaryParts(P('n=6')).who, '6명 이상');
  assert.equal(summaryParts(P('players=2-4')).who, '2~4명');
  assert.equal(summaryParts(P('players=5-16')).who, '5명 이상');
  assert.equal(summaryParts(P('players=0-4')).who, '4명 이하');
});

test('인원: 비어 있으면 통과, 범위 밖이면 제외', () => {
  assert.equal(fitsPlayers(G[2], 8), true);
  assert.equal(fitsPlayers(G[1], 4), false);
  assert.equal(fitsPlayers(G[0], 1), true);
  assert.equal(countFitting(G, 4), 2);
  assert.equal(fitsRange(G[1], [3, 4]), false);
  assert.equal(fitsRange(G[1], [1, 2]), true);
  assert.equal(fitsRange(G[0], [5, 16]), false);
  assert.equal(fitsRange(G[2], [5, 16]), true);
});

test('옛 /?players=… 주소 → /find 새 형식', () => {
  const to = (s) => legacyHomeToFind(new URLSearchParams(s));
  assert.equal(to('players=4-4'), '/find?n=4');
  assert.equal(to('players=5-16&mypc=1&trend=new,rising'), '/find?players=5-16&trend=new%2Crising&mypc=1');
  assert.equal(to('r=1'), '/find');
  assert.equal(to('sale=1&sort=discount'), '/find?o=sale&sort=discount');
  assert.equal(to('price=0-0'), '/find?o=free');
  assert.equal(to('free=1'), '/find?o=free');
  assert.equal(to('price=5000-20000&demo=1&fs=1'), '/find?fs=1&price=5000-20000&demo=1');
  assert.equal(to('q=좀비&cat=협동'), `/find?how=coop&kw=${encodeURIComponent('좀비')}`);
  assert.equal(to('cat=혼자'), '/find?solo=1');
  assert.equal(to('barrier=low&net=crossplay,dedicated&story=1&solo=1'), '/find?net=crossplay%2Cdedicated&solo=1&story=1&barrier=low');
  assert.equal(to('p=3-4인'), '/find?players=3-4');
  assert.equal(to('tags=1663,협동&match=any&ex=12'), `/find?tags=1663%2C${encodeURIComponent('협동')}&match=any&ex=12`);
  assert.equal(to('ai=1'), null); // 필터가 아닌 쿼리
  assert.equal(to(''), null);
});

test('조건이 없으면 전부, 기본 정렬은 뜨는 순(인기순)', () => {
  assert.deepEqual(ids(EMPTY_QUERY), ['a', 'b', 'c']);
  assert.equal(sortOf(EMPTY_QUERY), 'hot');
  assert.deepEqual(sortGames(G, EMPTY_QUERY, NO_TAGS).map((g) => g.id), ['b', 'a', 'c']);
  assert.ok(isEmptyQuery({ ...EMPTY_QUERY, sort: 'price', view: 'card' }));
});

test('정렬 기본값: 누구랑·어떻게·뭐 할까 중 하나라도 있으면 잘 맞는 순', () => {
  assert.equal(sortOf({ ...EMPTY_QUERY, n: 2 }), 'fit');
  assert.equal(sortOf({ ...EMPTY_QUERY, nTo: 4 }), 'fit');
  assert.equal(sortOf({ ...EMPTY_QUERY, how: 'pvp' }), 'fit');
  assert.equal(sortOf({ ...EMPTY_QUERY, genres: ['horror'] }), 'fit');
  assert.equal(sortOf({ ...EMPTY_QUERY, kw: '좀비' }), 'fit');
  assert.equal(sortOf({ ...EMPTY_QUERY, opts: ['free'], trend: ['new'] }), 'hot');
  assert.equal(sortOf({ ...EMPTY_QUERY, n: 2, sort: 'recent' }), 'recent');
});

test('정렬: 할인 큰 순 · 낮은 가격순 · 잘 맞는 순', () => {
  assert.deepEqual(sortGames(G, { ...EMPTY_QUERY, sort: 'discount' }, NO_TAGS).map((g) => g.id), ['c', 'b', 'a']);
  assert.deepEqual(sortGames(G, { ...EMPTY_QUERY, sort: 'price' }, NO_TAGS).map((g) => g.id), ['a', 'c', 'b']);
  assert.deepEqual(sortGames(G, { ...EMPTY_QUERY, sort: 'recent' }, NO_TAGS).map((g) => g.id), ['a', 'b', 'c']);
  // 4명·협동: a(4인 온라인 협동 ✓ + 무료 + 쉬움)가 위, b(최대 2인 ⚠)가 아래
  const fit = sortGames(G, { ...EMPTY_QUERY, n: 4, how: 'coop' }, NO_TAGS).map((g) => g.id);
  assert.equal(fit[0], 'a');
  assert.equal(fit[fit.length - 1], 'b');
});

test('무료 조건: 가격 값이 있는 유료 게임은 제외, 비어 있으면 통과', () => {
  assert.deepEqual(ids({ ...EMPTY_QUERY, opts: ['free'] }), ['a']);
});

test('지금 뜨는 게임: 신작·인기 급상승·다시 뜨는 중·출시 예정', () => {
  const g = (trend_badge, extra = {}) => ({ id: trend_badge || 'x', trend_badge, ...extra });
  assert.equal(matchesTrend(g('new'), ['new']), true);
  assert.equal(matchesTrend(g('rising_old'), ['rising']), true);
  assert.equal(matchesTrend(g('rising_recent'), ['rising']), true);
  assert.equal(matchesTrend(g('rising_recent'), ['back']), false);
  assert.equal(matchesTrend(g('rising_old'), ['back']), true);
  assert.equal(matchesTrend(g(null, { release_status: 'coming_soon' }), ['soon']), true);
  assert.equal(matchesTrend(g('new'), ['soon']), false);
  assert.equal(matchesTrend(g('new'), ['rising', 'new']), true); // 합집합
  assert.equal(matchesTrend(g(null), []), true);
  assert.deepEqual([{ id: 1, trend_score: 1 }, { id: 2, trend_score: 5 }, { id: 3 }].sort(byTrendScore).map((x) => x.id), [2, 1, 3]);
});

test('같이 하는 방식 · 네트워크 · 최대 인원 · 가격 범위 · 기타 필터', () => {
  const g = [
    { id: 'o', name: 'o', has_online_coop: true, multiplayer_host: '전용 서버', has_crossplay: true, max_players: 4, price_final: 12000, entry_barrier: '낮음', review_summary: '매우 긍정적', streamers: ['x'] },
    { id: 'l', name: 'l', has_local_coop: true, max_players: 2, price_final: 3000, review_summary: '대체로 긍정적' },
    { id: 'p', name: 'p', has_pvp: true, multiplayer_host: 'P2P', max_players: 8, is_free: true, demo_appid: '1', release_status: 'coming_soon' },
    { id: 's', name: 's', max_players: 1, solo_mode: 'story', price_final: 30000, lowest_price: 30000, price_discount: 10 },
  ];
  const f = (patch) => ids({ ...EMPTY_QUERY, ...patch }, g);
  assert.deepEqual(f({ mode: ['online'] }), ['o']);
  assert.deepEqual(f({ mode: ['online', 'local'] }), []);
  assert.deepEqual(f({ mode: ['pvp'] }), ['p']);
  assert.deepEqual(f({ net: ['crossplay'] }), ['o']);
  assert.deepEqual(f({ net: ['dedicated'] }), ['o']);
  assert.deepEqual(f({ net: ['p2p'] }), ['p']);
  assert.deepEqual(f({ net: ['dedicated', 'p2p'] }), ['o', 'p']); // 고른 것 중 하나
  assert.deepEqual(f({ size: 'solo' }), ['s']);
  assert.deepEqual(f({ size: 'duo' }), ['l']);
  assert.deepEqual(f({ size: 'large' }), ['p']);
  assert.deepEqual(f({ story: true }), ['s']);
  assert.deepEqual(f({ price: [0, 1] }), ['l', 'p']);
  assert.deepEqual(f({ price: [2, 10] }), ['o', 's']);
  assert.deepEqual(f({ demo: true }), ['p']);
  assert.deepEqual(f({ low: true }), ['s']);
  assert.deepEqual(f({ barrier: ['낮음'] }), ['o']);
  assert.deepEqual(f({ rev: true }), ['o']);
  assert.deepEqual(f({ tv: true }), ['o']);
  assert.deepEqual(f({ trend: ['soon'] }), ['p']);
});

test('근거 배지와 합계', () => {
  const q = { ...EMPTY_QUERY, n: 4, how: 'coop', opts: ['ko'] };
  const b = badgesFor(G[0], q, NO_TAGS).map((x) => x.text);
  assert.ok(b.includes('4인 온라인 협동') && b.includes('무료') && b.includes('처음 해도 쉬움'));
  const w = badgesFor(G[1], q, NO_TAGS);
  assert.ok(w.some((x) => !x.ok && x.text === '한국어 지원 없음'));
  assert.ok(w.some((x) => !x.ok && x.text === '진입장벽 높음'));
  assert.equal(groupTotal(G[0], 4), '무료');
  assert.equal(groupTotal(G[1], 4), '4명 다 사면 ₩36,000 (역대 최저가 기준)');
  assert.equal(groupTotal(G[1], 1), null);
  const t = badgesFor({ id: 't', trend_badge: 'new', has_local_coop: true, fs: true }, { ...EMPTY_QUERY, trend: ['new'], mode: ['local'], opts: ['fs'] }, NO_TAGS).map((x) => x.text);
  assert.deepEqual(t, ['신작', '같은 화면', '우당탕 협동']);
});

test('접힌 검색창 글자', () => {
  assert.deepEqual(summaryParts({ ...EMPTY_QUERY, n: 4, how: 'coop', genres: ['horror'] }), { who: '4명', how: '같이 깨기', what: '공포' });
});

test('장르 모두/하나라도: 주소에 gm이 없으면 all', () => {
  assert.equal(P('g=horror,puzzle').gm, 'all');
  assert.equal(P('g=horror,puzzle&gm=all').gm, 'all');
  assert.equal(P('g=horror,puzzle&gm=any').gm, 'any');
  assert.equal(P('g=horror,puzzle&gm=zzz').gm, 'all');
  assert.equal(queryToParams(P('g=horror,puzzle&gm=any')), 'g=horror%2Cpuzzle&gm=any');
  assert.equal(queryToParams(P('g=horror,puzzle')), 'g=horror%2Cpuzzle');
});

test('장르 모두/하나라도: 모두는 전부 가진 게임만, 하나라도는 합집합', () => {
  const games = [
    { id: 'h', name: 'H', themes: ['Horror'] },
    { id: 'p', name: 'P', genres: ['Puzzle'] },
    { id: 'hp', name: 'HP', themes: ['Horror'], genres: ['Puzzle'] },
  ];
  const base = { ...EMPTY_QUERY, genres: ['horror', 'puzzle'] };
  assert.deepEqual(ids(base, games), ['hp']);
  assert.deepEqual(ids({ ...base, gm: 'any' }, games).sort(), ['h', 'hp', 'p']);
  assert.equal(countMatching(games, base, NO_TAGS, kw), 1);
  assert.equal(countMatching(games, { ...base, gm: 'any' }, NO_TAGS, kw), 3);
});

test('칸 글자: 여럿이면 "공포 외 1개"', () => {
  assert.equal(summaryParts({ ...EMPTY_QUERY, genres: ['horror', 'cook'] }).what, '공포 외 1개');
  assert.equal(summaryParts({ ...EMPTY_QUERY, genres: ['horror'], kw: '좀비' }).what, '공포 외 1개');
  assert.equal(summaryParts({ ...EMPTY_QUERY, kw: '좀비' }).what, '좀비');
});
