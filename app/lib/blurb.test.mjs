// 실행: npm test — 결과 카드 게임 소개 한 줄
import test from 'node:test';
import assert from 'node:assert/strict';
import { blurbOf, cleanText, BLURB_MAX } from './blurb.ts';

test('큐레이터 문구가 있으면 그것을 쓴다', () => {
  assert.equal(blurbOf('록스타가 되려면 이렇게까지?', '번역', '설명 한국어'), '록스타가 되려면 이렇게까지?');
});
test('없으면 description_ko, 그다음 한글 description', () => {
  assert.equal(blurbOf(null, '번역된 설명', 'English only'), '번역된 설명');
  assert.equal(blurbOf('  ', null, '한국어 설명이에요'), '한국어 설명이에요');
});
test('영어뿐이거나 비어 있으면 null', () => {
  assert.equal(blurbOf(null, null, 'Fly a steampunk airship'), null);
  assert.equal(blurbOf(null, '', null), null);
  assert.equal(blurbOf(undefined, undefined, undefined), null);
});
test('HTML 태그·엔티티·공백 정리', () => {
  assert.equal(cleanText('<b>친구</b>랑  &amp; 같이\n&quot;해요&quot;<br>&#39;끝&#39;'), '친구랑 & 같이 "해요" \'끝\'');
});
test('너무 길면 자른다', () => {
  const t = blurbOf(null, '가'.repeat(500), null);
  assert.equal(t.length, BLURB_MAX);
  assert.ok(t.endsWith('…'));
});
