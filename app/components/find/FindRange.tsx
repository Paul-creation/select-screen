'use client';

import type { Range } from '../../lib/abSearch';

// 구간 슬라이더 — 눈금 번호(0~max)로 동작. 브라우저 기본 range 두 개를 겹쳐서 터치·마우스 끌기와 키보드 화살표를 그대로 쓴다 (모양은 find.css .fd-range-*)
// minHigh: 오른쪽 손잡이 최솟값 (인원은 1명 이상)
export default function FindRange({ value, max, minHigh = 0, label, onChange, lowName, highName }: {
  value: Range; max: number; minHigh?: number; label: (i: number) => string; onChange: (r: Range) => void; lowName: string; highName: string;
}) {
  const [lo, hi] = value;
  // 두 손잡이가 겹쳤을 때 끝 쪽에 붙어 있으면 왼쪽 손잡이를 위로 (오른쪽 끝에서 왼쪽 손잡이를 꺼낼 수 있게)
  const lowOnTop = lo === hi && lo > max / 2;
  return (
    <div className="fd-range">
      <div className="fd-range-slider">
        <div className="fd-range-track" aria-hidden="true">
          <div className="fd-range-fill" style={{ left: `${(lo / max) * 100}%`, width: `${((hi - lo) / max) * 100}%` }} />
        </div>
        <input type="range" min={0} max={max} step={1} value={lo} aria-label={lowName} aria-valuetext={label(lo)} style={{ zIndex: lowOnTop ? 3 : 2 }}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} />
        <input type="range" min={0} max={max} step={1} value={hi} aria-label={highName} aria-valuetext={label(hi)} style={{ zIndex: lowOnTop ? 2 : 3 }}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo, minHigh)])} />
      </div>
      <div className="fd-range-ends" aria-hidden="true"><span>{label(0)}</span><span>{label(max)}</span></div>
    </div>
  );
}
