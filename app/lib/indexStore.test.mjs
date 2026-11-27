// 실행: npm test (Node 내장 테스트, .ts를 바로 불러온다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexStore, withTimeout, LOAD_TIMEOUT_MS } from './indexStore.ts';

const GAMES = [{ id: 'a' }];
const TREE = { ok: true };

// 부를 때마다 steps를 하나씩 꺼내 쓰는 가짜 요청
function steps(...list) {
  const fn = (signal) => {
    fn.signals.push(signal);
    return list[Math.min(fn.signals.length, list.length) - 1](signal);
  };
  fn.signals = [];
  return fn;
}
const ok = (value) => () => Promise.resolve(value);
const fail = (message) => () => Promise.reject(new Error(message));
const hang = () => new Promise(() => {});

test('타임아웃은 8초', () => {
  assert.equal(LOAD_TIMEOUT_MS, 8000);
});

test('8초가 되기 전에는 기다리고, 8초에 끊는다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchGames = steps(hang);
  const store = createIndexStore({ fetchGames, loadTree: ok(TREE) });
  let state = 'loading';
  const done = store.load().then(() => { state = 'ok'; }, (e) => { state = e.message; });
  t.mock.timers.tick(7999);
  await Promise.resolve();
  assert.equal(state, 'loading');
  assert.equal(fetchGames.signals[0].aborted, false);
  t.mock.timers.tick(1);
  await done;
  assert.equal(state, 'timeout');
  assert.equal(fetchGames.signals[0].aborted, true);
  assert.equal(store.peek(), null);
});

test('실패: 오류를 넘기고 아무것도 기억하지 않는다', async () => {
  const store = createIndexStore({ fetchGames: steps(fail('500')), loadTree: ok(TREE) });
  await assert.rejects(store.load(), /500/);
  assert.equal(store.peek(), null);
});

test('재시도: 실패한 뒤 다시 부르면 새로 요청해 성공한다', async () => {
  const fetchGames = steps(fail('500'), ok(GAMES));
  const store = createIndexStore({ fetchGames, loadTree: ok(TREE) });
  await assert.rejects(store.load());
  assert.deepEqual(await store.load(), { games: GAMES, tree: TREE });
  assert.equal(fetchGames.signals.length, 2);
});

test('재시도: 타임아웃 뒤에도 새로 요청한다', async () => {
  const fetchGames = steps(hang, ok(GAMES));
  const store = createIndexStore({ fetchGames, loadTree: ok(TREE), timeoutMs: 5 });
  await assert.rejects(store.load(), /timeout/);
  assert.deepEqual((await store.load()).games, GAMES);
  assert.equal(fetchGames.signals.length, 2);
});

test('성공한 목록은 메모리에 두고 다시 요청하지 않는다', async () => {
  const fetchGames = steps(ok(GAMES));
  const store = createIndexStore({ fetchGames, loadTree: ok(TREE) });
  const first = await store.load();
  assert.equal(await store.load(), first);
  assert.equal(store.peek(), first);
  assert.equal(fetchGames.signals.length, 1);
});

test('동시에 불러도 요청은 한 번', async () => {
  const fetchGames = steps(ok(GAMES));
  const store = createIndexStore({ fetchGames, loadTree: ok(TREE) });
  const [a, b] = await Promise.all([store.load(), store.load()]);
  assert.equal(a, b);
  assert.equal(fetchGames.signals.length, 1);
});

test('태그 나무가 실패하거나 멈춰도 목록은 주고, 다음에는 나무만 다시 받는다', async () => {
  for (const broken of [fail('chunk'), hang]) {
    const fetchGames = steps(ok(GAMES));
    const loadTree = steps(broken, broken, ok(TREE));
    const store = createIndexStore({ fetchGames, loadTree, timeoutMs: 5 });
    const first = await store.load();
    assert.deepEqual(first, { games: GAMES, tree: null });
    assert.equal(await store.load(), first);
    assert.deepEqual(await store.load(), { games: GAMES, tree: TREE });
    assert.equal(fetchGames.signals.length, 1);
  }
});

test('withTimeout: 제때 끝나면 값을 그대로 준다', async () => {
  assert.equal(await withTimeout(() => Promise.resolve(1), 1000), 1);
});
