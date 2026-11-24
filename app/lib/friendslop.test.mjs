// 실행: npm test (Node 내장 테스트, .ts를 바로 불러온다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { isFriendslop } from './friendslop.ts';

// 실제 데이터(2026-11-22 조회)에서 가져온 값
const LETHAL = { has_online_coop: true, party_max: null, max_players: 4, is_free: false, price: 11000, lowest_price: 7150, tags: ['온라인 협동', '호러', '1인칭', '저사양'], activities_confirmed: ['gather', 'decorate', 'explore', 'role_split', 'voice_chat', 'horror_scare'] };
const REPO = { has_online_coop: true, party_max: null, max_players: 6, is_free: false, price: 10700, lowest_price: 6950, tags: ['호러', '온라인 협동', '코미디'], activities_confirmed: ['gather', 'stealth', 'voice_chat', 'horror_scare'] };
const WARNING = { has_online_coop: true, party_max: null, max_players: 4, is_free: false, price: 5330, lowest_price: 4300, tags: ['온라인 협동', '호러', '코미디', '저사양'], activities_confirmed: ['explore', 'voice_chat', 'photo', 'horror_scare'] };
const PEAK = { has_online_coop: true, party_max: null, max_players: 4, is_free: false, price: 8400, lowest_price: 4200, tags: ['등반', '생존', '물리엔진'], activities_confirmed: ['parkour', 'gather'] };
const TERRARIA = { has_online_coop: true, party_max: 16, max_players: 16, is_free: false, price: 11000, tags: ['오픈월드 생존', '샌드박스', '생존'], activities_confirmed: ['craft', 'build'] };
const TF2 = { has_online_coop: true, party_max: 24, max_players: 24, is_free: true, tags: ['히어로슈팅', 'FPS', '슈팅'], activities_confirmed: [] };
const REC_ROOM = { has_online_coop: true, party_max: null, max_players: 4, is_free: true, tags: ['VR', '코미디', '온라인 협동'], activities_confirmed: ['voice_chat', 'horror_scare'] };

test('자동 기준: Lethal Company·R.E.P.O.·Content Warning 포함', () => {
  assert.equal(isFriendslop(LETHAL), true);
  assert.equal(isFriendslop(REPO), true);
  assert.equal(isFriendslop(WARNING), true);
});
test('자동 기준: PEAK는 신호가 없어 빠지고, 수동 true면 포함', () => {
  assert.equal(isFriendslop(PEAK), false);
  assert.equal(isFriendslop({ ...PEAK, friendslop: true }), true);
});
test('Terraria(16인)·Team Fortress 2(24인)는 인원 상한으로, Rec Room은 수동 false로 제외', () => {
  assert.equal(isFriendslop({ ...TERRARIA, activities_confirmed: ['voice_chat'] }), false); // 신호가 있어도 8인 초과
  assert.equal(isFriendslop(TERRARIA), false);
  assert.equal(isFriendslop(TF2), false);
  assert.equal(isFriendslop(REC_ROOM), true); // 자동 기준으로는 걸린다
  assert.equal(isFriendslop({ ...REC_ROOM, friendslop: false }), false); // 수동 false
});
test('수동 지정은 자동 기준보다 우선: true는 온라인 협동이 아니어도 포함, false는 기준을 만족해도 제외', () => {
  assert.equal(isFriendslop({ friendslop: true }), true);
  assert.equal(isFriendslop({ ...LETHAL, friendslop: false }), false);
});
test('인원: party_max가 있으면 그것을, 없으면 max_players를 본다 (3 이상 8 이하)', () => {
  assert.equal(isFriendslop({ ...LETHAL, party_max: 2 }), false);
  assert.equal(isFriendslop({ ...LETHAL, party_max: 3 }), true);
  assert.equal(isFriendslop({ ...LETHAL, party_max: 9, max_players: 4 }), false);
  assert.equal(isFriendslop({ ...LETHAL, max_players: 2 }), false);
  assert.equal(isFriendslop({ ...LETHAL, max_players: 8 }), true);
  assert.equal(isFriendslop({ ...LETHAL, max_players: null }), false);
});
test('가격: 20,000원 이하·무료만, 가격 기록이 없으면 lowest_price로 대체', () => {
  assert.equal(isFriendslop({ ...LETHAL, price: 20000 }), true);
  assert.equal(isFriendslop({ ...LETHAL, price: 20001 }), false);
  assert.equal(isFriendslop({ ...LETHAL, price: 30000, is_free: true }), true);
  assert.equal(isFriendslop({ ...LETHAL, price: null, lowest_price: 7150 }), true);
  assert.equal(isFriendslop({ ...LETHAL, price: null, lowest_price: 25000 }), false);
  assert.equal(isFriendslop({ ...LETHAL, price: null, lowest_price: null }), false);
});
test('신호: voice_chat이거나 (코미디 태그 AND 공포 신호). 한쪽만이면 빠지고 테마는 안 본다', () => {
  const base = { ...LETHAL, activities_confirmed: [], tags: [] };
  assert.equal(isFriendslop({ ...base, activities_confirmed: ['voice_chat'] }), true);
  assert.equal(isFriendslop({ ...base, tags: ['코미디'] }), false);
  assert.equal(isFriendslop({ ...base, tags: ['호러'] }), false);
  assert.equal(isFriendslop({ ...base, tags: ['코미디', '서바이벌 호러'] }), true);
  assert.equal(isFriendslop({ ...base, tags: ['코미디'], activities_confirmed: ['horror_scare'] }), true);
  assert.equal(isFriendslop({ ...base, activities_confirmed: ['horror_scare'] }), false);
  assert.equal(isFriendslop({ ...base, themes: ['Comedy', 'Horror'] }), false);
});

test('topFriendslop: 인기순(heat_rank 낮은 순, 없으면 맨 뒤) 상위 limit개, 조건(fits) 밖은 뺀다', async () => {
  const { topFriendslop } = await import('./friendslop.ts');
  const g = [{ id: 'c', heat_rank: 30 }, { id: 'a', heat_rank: 10 }, { id: 'n', heat_rank: null }, { id: 'b', heat_rank: 20 }, { id: 'x', heat_rank: 1 }];
  assert.deepEqual(topFriendslop(g, (v) => v.id !== 'x', 3).map((v) => v.id), ['a', 'b', 'c']);
  assert.deepEqual(topFriendslop(g, (v) => v.id !== 'x').map((v) => v.id), ['a', 'b', 'c', 'n']); // 6개 미만이면 있는 만큼
  assert.deepEqual(topFriendslop([], () => true), []);
});
