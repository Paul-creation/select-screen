'use client';

import MyPcChip from './MyPcChip';
import { usePeople, type ChipKey } from '../PeopleContext';
import FriendslopChip from '../../FriendslopChip';

// "N인 추천 게임" 머리의 필터 칩 — 켜면 아래 카드를 실제로 거른다 (PeopleSection이 chips를 읽는다). 켜진 칩은 --ink 배경 + 어두운 글씨 (괄호 없음)
// - 내 PC로 돌아가는 게임: 사양을 저장해 뒀으면 인원별 추천을 거르는 토글, 없으면 /my-pc(사양 등록)로 가는 링크
// - 무료 / 출시 전 데모 / 지금 할인 중 / 우당탕 협동: 카드의 값(무료 여부·데모 있는 출시 예정·할인율·fs)으로 거른다
const CHIPS: { key: Exclude<ChipKey, 'fs'>; label: string }[] = [
  { key: 'free', label: '무료' },
  { key: 'demo', label: '데모' },
  { key: 'sale', label: '할인 중' },
];

export default function PeopleChips() {
  const { myPcOn, setMyPcOn, chips, toggleChip } = usePeople();
  return (
    <div className="mn-chips" role="group" aria-label="추천 게임 거르기">
      <MyPcChip on={myPcOn} onToggle={() => setMyPcOn(!myPcOn)} />
      {CHIPS.map((c) => (
        <button key={c.key} type="button" className="mn-chip" aria-pressed={chips[c.key]} onClick={() => toggleChip(c.key)}>{c.label}</button>
      ))}
      {/* 우당탕 협동 — 마우스를 올리거나 길게 누르면 설명(lib/friendslop). 카드의 fs 칸(서버가 판정)으로 거른다 */}
      <FriendslopChip className="mn-chip" pressed={chips.fs} onToggle={() => toggleChip('fs')} />
    </div>
  );
}
