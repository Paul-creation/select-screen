'use client';

import MyPcLink from '../../pcspec/MyPcLink';
import { useMyPc } from '../../pcspec/useMyPc';

// "내 PC OK" 칩 — 메인 "N인 추천"(PeopleChips)과 /friendslop가 같이 쓴다
// 사양을 저장해 뒀으면 거르는 토글, 없으면 /my-pc(사양 등록)로 가는 링크. 사양은 이 브라우저(localStorage)에만 있어서 읽기 전에는 같은 글자의 보이지 않는 칩으로 자리를 잡는다
export default function MyPcChip({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { pc, ready } = useMyPc();
  if (!ready) return <span className="mn-chip" style={{ visibility: 'hidden' }} aria-hidden="true">내 PC OK</span>;
  if (pc) return <button type="button" className="mn-chip" aria-pressed={on} onClick={onToggle}>내 PC OK</button>;
  return <MyPcLink className="mn-chip">내 PC OK</MyPcLink>;
}
