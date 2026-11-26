// 실행: npm test (AI·DB 호출은 mock)
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchStaffPick, resolveStaffPick, withStaffFirst } from './staffPick.ts';
import { choosePicks, pickWindow, WINDOW } from './validate.ts';
import { systemPrompt } from './systemPrompt.ts';
import { pickCacheKey } from './cacheKey.ts';
import { parsePickInput } from './moods.ts';

const SID = '99999999-9999-4999-8999-999999999999';
const GID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-12-01T00:00:00Z');
const row = (extra = {}) => ({
  id: SID, game_id: GID, players: [4], moods: ['laugh', 'brain', 'chill', 'any'], blurb: '넷이서 해보니 계속 웃게 돼요.',
  active: true, starts_at: null, ends_at: null, priority: 0, created_at: '2026-11-26T00:00:00Z', ...extra,
});
const cond = { n: 4, mood: 'laugh' };
const match = (extra, c = cond) => matchStaffPick([row(extra)], c, NOW);

test('매칭: 인원', () => {
  assert.ok(match({}));
  assert.equal(match({}, { n: 3, mood: 'laugh' }), null);
  assert.equal(match({ players: null }), null);
  assert.ok(match({ players: [2, 4] }, { n: 2, mood: 'laugh' }));
});

test('매칭: 분위기 — 목록에 있어야 하고, 비어 있으면 모든 분위기(고르지 않음 포함)', () => {
  assert.ok(match({}, { n: 4, mood: 'any' }));
  assert.equal(match({}, { n: 4, mood: 'scary' }), null);
  for (const moods of [[], null]) for (const mood of ['scary', 'compete', null]) assert.ok(match({ moods }, { n: 4, mood }));
});

test('매칭: 인원 없음 + 상관없음(any)·분위기 없음(완전히 빈 입력) → 추천, 인원 없음 + 무서운 거 → 없음, 2명 + any → 없음', async () => {
  const pick = async (body) => (await resolve({ c: { n: undefined, mood: undefined, ...parsePickInput(body) } }))?.row.id ?? null;
  assert.equal(await pick({ mood: 'any' }), SID);
  assert.equal(await pick({ n: null, mood: 'any' }), SID);
  for (const body of [{}, { n: null, mood: null }, { n: null, how: null, g: [], mood: '', excludeIds: [] }]) assert.equal(await pick(body), SID, JSON.stringify(body));
  assert.equal(await pick({ mood: 'scary' }), null);
  assert.equal(await pick({ n: 2, mood: 'any' }), null);
  for (const n of [null, undefined]) {
    assert.ok(match({}, { n, mood: 'any' }));
    assert.ok(match({ players: null }, { n, mood: null }));
    assert.equal(match({ active: false }, { n, mood: 'any' }), null);
  }
});

test('인원 없이 와도 이미 보여 줬거나 갖고 있으면 넣지 않는다', async () => {
  assert.equal(await resolve({ c: { n: null, excludeIds: [GID] } }), null);
  assert.equal(await resolve({ c: { n: null }, owned: new Set([123]) }), null);
});

test('매칭: 분위기를 안 골랐으면 상관없음(any)과 같게', () => {
  for (const mood of [null, undefined]) {
    assert.ok(match({}, { n: 4, mood }));
    assert.equal(match({ moods: ['laugh', 'brain'] }, { n: 4, mood }), null);
  }
});

test('매칭: active·기간', () => {
  assert.equal(match({ active: false }), null);
  assert.ok(match({ starts_at: '2026-11-30T00:00:00Z', ends_at: '2026-12-02T00:00:00Z' }));
  assert.ok(match({ starts_at: '2026-12-01T00:00:00+00:00' }));
  assert.equal(match({ starts_at: '2026-12-01T00:00:01Z' }), null);
  assert.equal(match({ ends_at: '2026-12-01T00:00:00Z' }), null);
  assert.equal(match({ ends_at: '2026-11-30T00:00:00Z' }), null);
});

test('매칭: 여러 개면 priority 높은 것 하나, 같으면 나중에 만든 것. 조건에 안 맞는 것은 priority가 높아도 제외', () => {
  const rows = [row({ id: 'low', priority: 0 }), row({ id: 'high', priority: 5 }), row({ id: 'off', priority: 9, active: false })];
  assert.equal(matchStaffPick(rows, cond, NOW).id, 'high');
  const tie = [row({ id: 'old', created_at: '2026-01-01T00:00:00Z' }), row({ id: 'new', created_at: '2026-11-01T00:00:00Z' })];
  assert.equal(matchStaffPick(tie, cond, NOW).id, 'new');
  assert.equal(matchStaffPick([], cond, NOW), null);
});

const resolve = ({ rows = [row()], c = {}, owned = null, game = { id: GID, steam_appid: '123' } } = {}) =>
  resolveStaffPick({
    cond: { ...cond, excludeIds: [], ...c }, now: NOW,
    loadRows: async () => rows, loadGame: async () => game, loadOwned: async () => owned,
  });

test('넣기: 조건이 맞으면 추천과 게임', async () => {
  const r = await resolve({ owned: new Set([999]) });
  assert.equal(r.row.id, SID);
  assert.equal(r.game.id, GID);
});

test('제외: 이미 보여 준 게임(excludeIds)이면 없음 — 다음 순위로 넘기지 않는다', async () => {
  assert.equal(await resolve({ c: { excludeIds: [GID] } }), null);
  const second = row({ id: 'second', game_id: '22222222-2222-4222-8222-222222222222', priority: -1 });
  assert.equal(await resolve({ rows: [row(), second], c: { excludeIds: [GID] } }), null);
});

test('제외: Steam 라이브러리에 있으면 없음 (appid가 글자여도)', async () => {
  assert.equal(await resolve({ owned: new Set([123]) }), null);
  assert.ok(await resolve({ owned: new Set([123]), game: { id: GID, steam_appid: null } }));
});

test('제외: 게임을 못 읽으면(숨김 등) 없음', async () => {
  assert.equal(await resolve({ game: null }), null);
});

test('인원만 고른 요청 — 분위기 칸이 없거나 null·""이어도 추천이 들어가고 캐시 키가 같다', async () => {
  const keys = new Set();
  for (const body of [{ n: 4 }, { n: 4, mood: null }, { n: 4, mood: '' }, { n: 4, mood: 'any' }]) {
    const input = parsePickInput({ how: null, g: [], excludeIds: [], ...body });
    const r = await resolve({ c: input });
    assert.equal(r?.row.id, SID, JSON.stringify(body));
    keys.add(pickCacheKey(input, null, r.row.id));
  }
  assert.equal(keys.size, 1);
});

const C = Array.from({ length: 10 }, (_, i) => ({ id: `g${i}`, max_players: 4, has_online_coop: true }));
const aiJson = (...ids) => JSON.stringify({ picks: ids.map((id) => ({ id, reason: 'AI 이유' })) });

test('추천이 있으면 AI에 2개만 요청하고, 결과는 [추천, AI 2개] — 추천 문구는 그대로', async () => {
  const asked = [];
  const ai = async (_signal, count) => { asked.push(count); return aiJson('g5', 'g2'); };
  const r = await choosePicks(ai, C, 4, 1000, 2);
  assert.deepEqual(asked, [2]);
  assert.equal(r.fallback, false);
  const picks = withStaffFirst(row(), r.picks);
  assert.deepEqual(picks.map((p) => p.id), [GID, 'g5', 'g2']);
  assert.deepEqual(picks[0], { id: GID, reason: row().blurb, staff: true });
  assert.ok(picks.slice(1).every((p) => !('staff' in p)));
  const prompt = systemPrompt(2);
  assert.ok(prompt.includes('정확히 2개'));
  assert.ok(!prompt.includes('3개'));
  assert.equal(prompt.match(/"id":"\.\.\."/g).length, 2);
});

test('추천이 없으면 AI가 3개', async () => {
  const asked = [];
  const r = await choosePicks(async (_s, count) => { asked.push(count); return aiJson('g1', 'g2', 'g3'); }, C, 4);
  assert.deepEqual(asked, [3]);
  assert.equal(withStaffFirst(null, r.picks).length, 3);
  assert.ok(systemPrompt().includes('정확히 3개'));
  assert.equal(systemPrompt().match(/"id":"\.\.\."/g).length, 3);
});

test('추천이 있는데 AI가 3개를 답하면 fallback', async () => {
  const r = await choosePicks(async () => aiJson('g1', 'g2', 'g3'), C, 4, 1000, 2);
  assert.equal(r.why, 'invalid');
});

test('fallback: 추천은 1번 그대로, 나머지 2개는 점수 상위', async () => {
  const r = await choosePicks(async () => null, C, 4, 1000, 2);
  assert.equal(r.fallback, true);
  assert.deepEqual(withStaffFirst(row(), r.picks).map((p) => p.id), [GID, 'g0', 'g1']);
});

test('후보가 2개면 추천이 있을 때는 AI를 부른다, 1개면 부르지 않는다', async () => {
  let calls = 0;
  const ai = async () => { calls++; return aiJson('g0', 'g1'); };
  assert.equal((await choosePicks(ai, C.slice(0, 2), 4, 1000, 2)).fallback, false);
  assert.equal((await choosePicks(ai, C.slice(0, 1), 4, 1000, 2)).why, 'few');
  assert.equal(calls, 1);
});

test('추천 게임은 AI 후보에서 빠지고, 창에 2개가 남으면 넓히지 않는다', () => {
  const ranked = Array.from({ length: 40 }, (_, i) => `g${i}`);
  const win = pickWindow(ranked, ['g0'], WINDOW, 2);
  assert.ok(!win.ids.includes('g0'));
  assert.equal(win.widened, false);
  assert.deepEqual(pickWindow(ranked, ranked.slice(0, 28), WINDOW, 2), { ids: ['g28', 'g29'], widened: false });
});

test('캐시 키: 추천 id가 다르면 다른 키, 없으면 none', () => {
  const i = { n: 4, how: null, g: [], mood: 'laugh', excludeIds: [] };
  const none = pickCacheKey(i, null);
  assert.equal(pickCacheKey(i, null, null), none);
  const withStaff = pickCacheKey(i, null, SID);
  assert.notEqual(withStaff, none);
  assert.equal(pickCacheKey(i, null, SID.toUpperCase()), withStaff);
  assert.notEqual(pickCacheKey(i, null, GID), withStaff);
});
