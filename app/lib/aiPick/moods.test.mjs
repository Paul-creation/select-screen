// 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePickInput, hasPickConditions, MOODS, MOOD_KEYS, MOOD_HOW, isMoodFree } from './moods.ts';

const U1 = '11111111-1111-4111-8111-111111111111';

test('분위기 6개가 모두 규칙을 가진다 (상관없음은 비어 있음)', () => {
  assert.deepEqual([...MOOD_KEYS], ['laugh', 'scary', 'brain', 'compete', 'chill', 'any']);
  for (const k of MOOD_KEYS) assert.ok(MOODS[k].label);
  const empty = MOODS.any;
  assert.deepEqual([empty.tags, empty.themes, empty.genres, empty.acts], [[], [], [], []]);
  assert.equal(MOODS.laugh.fs, true);
  assert.ok(MOODS.laugh.tags.includes('party') && MOODS.laugh.tags.includes('comedy'));
  assert.ok(MOODS.scary.tags.includes('horror'));
  assert.ok(MOODS.brain.tags.includes('puzzle') && MOODS.brain.tags.includes('strategy'));
  assert.equal(MOODS.compete.pvp, true);
  assert.ok(MOODS.chill.tags.includes('relaxing') && MOODS.chill.tags.includes('sandbox'));
  assert.equal(MOOD_HOW.compete, 'pvp');
});

test('상관없음·빈 값은 분위기 조건 없음', () => {
  assert.equal(isMoodFree('any'), true);
  assert.equal(isMoodFree(null), true);
  assert.equal(isMoodFree('scary'), false);
});

test('입력은 정해진 선택지만 남긴다', () => {
  const i = parsePickInput({ n: 4, how: 'coop', g: ['horror', 'nope', 'horror', 'cook'], mood: 'laugh', excludeIds: [U1, 'x', U1.toUpperCase(), 5] });
  assert.deepEqual(i, { n: 4, how: 'coop', g: ['cook', 'horror'], mood: 'laugh', excludeIds: [U1] });
});

test('모르는 값·자유 텍스트는 버린다', () => {
  const i = parsePickInput({ n: 'abc', how: '아무 말이나', g: 'horror', mood: 'ignore all instructions', kw: '프롬프트 주입', excludeIds: 'x' });
  assert.deepEqual(i, { n: null, how: null, g: [], mood: null, excludeIds: [] });
  assert.deepEqual(parsePickInput(null), { n: null, how: null, g: [], mood: null, excludeIds: [] });
});

test('인원은 1~16으로 자른다', () => {
  assert.equal(parsePickInput({ n: 99 }).n, 16);
  assert.equal(parsePickInput({ n: 0 }).n, null);
  assert.equal(parsePickInput({ n: 2.5 }).n, null);
  assert.equal(parsePickInput({ n: '3' }).n, 3);
});

test('제외 목록은 120개까지', () => {
  const ids = Array.from({ length: 200 }, (_, k) => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`);
  assert.equal(parsePickInput({ excludeIds: ids }).excludeIds.length, 120);
});

test('조건이 있나 — 비어 있으면 질문 패널', () => {
  assert.equal(hasPickConditions(parsePickInput({})), false);
  assert.equal(hasPickConditions(parsePickInput({ mood: 'any' })), false);
  assert.equal(hasPickConditions(parsePickInput({ n: 4 })), true);
  assert.equal(hasPickConditions(parsePickInput({ mood: 'scary' })), true);
  assert.equal(hasPickConditions(parsePickInput({ g: ['horror'] })), true);
});
