import test from 'node:test';
import assert from 'node:assert/strict';
import { lowestFromHistory } from './lowest-price.mjs';

const row = (price, checked_at) => ({ price, checked_at });

test('기록이 없거나 하루치면 저장하지 않는다', () => {
  assert.equal(lowestFromHistory([]), null);
  assert.equal(lowestFromHistory(undefined), null);
  assert.equal(lowestFromHistory([row(10000, '2026-11-27T01:00:00Z')]), null);
  assert.equal(lowestFromHistory([row(10000, '2026-11-27T01:00:00Z'), row(8000, '2026-11-27T10:00:00Z')]), null);
});
test('이틀 이상이면 가장 싼 기록', () => {
  const low = row(8000, '2026-11-20T01:00:00Z');
  assert.equal(lowestFromHistory([row(10000, '2026-11-27T01:00:00Z'), low]), low);
});
test('날짜는 UTC로 센다', () => {
  assert.equal(lowestFromHistory([row(9000, '2026-11-27T11:00:00Z'), row(8000, '2026-11-27T18:00:00Z')]), null); // 한국 시간으로는 이틀
  assert.ok(lowestFromHistory([row(9000, '2026-11-26T18:00:00+00:00'), row(8000, '2026-11-27T18:00:00+00:00')]));
});
test('100원 미만·날짜 없는 기록은 날짜 수에도 최저가에도 안 센다', () => {
  assert.equal(lowestFromHistory([row(10, '2026-11-20T01:00:00Z'), row(9000, '2026-11-27T01:00:00Z'), row(8000, null)]), null);
});
