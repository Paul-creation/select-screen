// 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCacheKey, CACHE_HOURS } from './cacheKey.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const base = { n: 4, how: 'coop', g: ['horror', 'cook'], mood: 'laugh', excludeIds: [A, B] };

test('같은 뜻이면 같은 키 — 순서·중복·대소문자 무시', () => {
  const k = pickCacheKey(base, null);
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.equal(pickCacheKey({ ...base, g: ['cook', 'horror', 'cook'], excludeIds: [B.toUpperCase(), A, A] }, null), k);
});

test('조건·제외 목록이 다르면 다른 키', () => {
  const k = pickCacheKey(base, null);
  assert.notEqual(pickCacheKey({ ...base, n: 3 }, null), k);
  assert.notEqual(pickCacheKey({ ...base, how: null }, null), k);
  assert.notEqual(pickCacheKey({ ...base, mood: 'scary' }, null), k);
  assert.notEqual(pickCacheKey({ ...base, excludeIds: [A] }, null), k);
});

test('로그인한 사용자는 사용자마다 다른 키, 원문 id는 키에 없다', () => {
  const anon = pickCacheKey(base, null);
  const u1 = pickCacheKey(base, A);
  assert.notEqual(u1, anon);
  assert.notEqual(pickCacheKey(base, B), u1);
  assert.equal(pickCacheKey(base, A.toUpperCase()), u1);
  assert.ok(!u1.includes(A));
});

test('캐시는 6시간', () => assert.equal(CACHE_HOURS, 6));
