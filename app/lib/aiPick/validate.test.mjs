// 실행: npm test (AI 호출은 mock)
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePicks, parseAiJson, fallbackPicks, fallbackReason, pickWindow, choosePicks, REASON_MAX } from './validate.ts';

const mk = (i, extra = {}) => ({ id: `g${i}`, max_players: 4, has_online_coop: true, ...extra });
const C = Array.from({ length: 40 }, (_, i) => mk(i));
const ids = new Set(C.map((g) => g.id));
const ok = (...x) => ({ picks: x.map((id, i) => ({ id, reason: `이유 ${i}` })) });

test('검증 통과: 후보 안 3개·중복 없음·이유 40자 이내', () => {
  const r = validatePicks(ok('g1', 'g2', 'g3'), ids);
  assert.deepEqual(r.map((p) => p.id), ['g1', 'g2', 'g3']);
});

test('검증 실패: 후보에 없는 id', () => assert.equal(validatePicks(ok('g1', 'g2', 'zzz'), ids), null));
test('검증 실패: 중복', () => assert.equal(validatePicks(ok('g1', 'g1', 'g3'), ids), null));
test('검증 실패: 개수가 3개가 아님', () => {
  assert.equal(validatePicks(ok('g1', 'g2'), ids), null);
  assert.equal(validatePicks(ok('g1', 'g2', 'g3', 'g4'), ids), null);
  assert.equal(validatePicks({}, ids), null);
  assert.equal(validatePicks(null, ids), null);
});
test('검증 실패: 이유가 비었거나 40자 초과·문자열이 아님', () => {
  const long = '가'.repeat(REASON_MAX + 1);
  assert.equal(validatePicks({ picks: [{ id: 'g1', reason: long }, { id: 'g2', reason: 'a' }, { id: 'g3', reason: 'b' }] }, ids), null);
  assert.equal(validatePicks({ picks: [{ id: 'g1', reason: ' ' }, { id: 'g2', reason: 'a' }, { id: 'g3', reason: 'b' }] }, ids), null);
  assert.equal(validatePicks({ picks: [{ id: 'g1', reason: 5 }, { id: 'g2', reason: 'a' }, { id: 'g3', reason: 'b' }] }, ids), null);
  const exact = '가'.repeat(REASON_MAX);
  assert.ok(validatePicks({ picks: [{ id: 'g1', reason: exact }, { id: 'g2', reason: 'a' }, { id: 'g3', reason: 'b' }] }, ids));
});

test('JSON 꺼내기: 코드 블록·앞뒤 설명·문자열 속 괄호', () => {
  assert.deepEqual(parseAiJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseAiJson('여기요 {"a":"x}y"} 끝'), { a: 'x}y' });
  assert.equal(parseAiJson('JSON 없음'), null);
  assert.equal(parseAiJson('{"a":'), null);
  assert.equal(parseAiJson(null), null);
});

test('대체 문구는 DB 값으로 확인되는 사실만, 40자 이내', () => {
  assert.equal(fallbackReason(mk(1), 4), '4명이 온라인 협동으로 할 수 있어요');
  assert.equal(fallbackReason(mk(1, { has_online_coop: false, has_pvp: true }), 4), '4명이 친구끼리 붙을 수 있어요');
  assert.equal(fallbackReason(mk(1), 1), '혼자서도 할 수 있어요');
  assert.equal(fallbackReason(mk(1, { max_players: 2 }), 4), '온라인 협동으로 같이 할 수 있어요');
  assert.equal(fallbackReason({}, null), '조건에 잘 맞는 순으로 골랐어요');
  for (const n of [null, 1, 2, 4, 8]) assert.ok([...fallbackReason(mk(1), n)].length <= REASON_MAX);
});

test('fallback은 점수 상위 3개', () => {
  assert.deepEqual(fallbackPicks(C, 4).map((p) => p.id), ['g0', 'g1', 'g2']);
});

test('후보 창: 상위 30개에서 제외분을 빼고, 다 썼으면 31~60위로 넓힌다', () => {
  const ranked = C.map((g) => g.id);
  const a = pickWindow(ranked, []);
  assert.equal(a.ids.length, 30);
  assert.equal(a.widened, false);
  const b = pickWindow(ranked, ['g0', 'g1']);
  assert.equal(b.ids.length, 28);
  assert.ok(!b.ids.includes('g0'));
  const c = pickWindow(ranked, ranked.slice(0, 30));
  assert.equal(c.widened, true);
  assert.deepEqual(c.ids, ranked.slice(30));
});

test('후보가 3개 미만이면 있는 만큼', () => {
  assert.deepEqual(pickWindow(['a', 'b'], []).ids, ['a', 'b']);
  assert.deepEqual(pickWindow(['a', 'b', 'c', 'd'], ['a', 'b']).ids, ['c', 'd']);
});

test('choosePicks: AI가 올바르게 답하면 그대로', async () => {
  const r = await choosePicks(async () => JSON.stringify(ok('g5', 'g2', 'g9')), C.slice(0, 30), 4);
  assert.equal(r.fallback, false);
  assert.deepEqual(r.picks.map((p) => p.id), ['g5', 'g2', 'g9']);
});

test('choosePicks: 후보 밖 id·깨진 JSON·예외·빈 응답은 fallback (다시 묻지 않는다)', async () => {
  let calls = 0;
  const cases = [async () => { calls++; return JSON.stringify(ok('g1', 'g2', 'g99')); }, async () => { calls++; return '죄송해요'; }, async () => { calls++; throw new Error('boom'); }, async () => { calls++; return null; }];
  for (const f of cases) {
    const r = await choosePicks(f, C.slice(0, 30), 4);
    assert.equal(r.fallback, true);
    assert.deepEqual(r.picks.map((p) => p.id), ['g0', 'g1', 'g2']);
  }
  assert.equal(calls, 4);
});

test('choosePicks: 타임아웃이면 fallback이고 signal을 abort한다', async () => {
  let aborted = false;
  const slow = (signal) => new Promise((resolve) => { signal.addEventListener('abort', () => { aborted = true; }); setTimeout(() => resolve(JSON.stringify(ok('g1', 'g2', 'g3'))), 500); });
  const r = await choosePicks(slow, C.slice(0, 30), 4, 30);
  assert.equal(r.fallback, true);
  assert.equal(aborted, true);
});

test('choosePicks: 후보가 3개 미만이면 AI를 부르지 않는다', async () => {
  let called = false;
  const r = await choosePicks(async () => { called = true; return '{}'; }, C.slice(0, 2), 4);
  assert.equal(called, false);
  assert.equal(r.fallback, true);
  assert.equal(r.picks.length, 2);
});
