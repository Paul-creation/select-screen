'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { FS_LABEL, FS_TIP } from '../lib/friendslop';

// "우당탕 협동" 필터 칩 — 마우스를 올리거나 키보드 포커스가 오면, 터치에서는 길게(0.5초) 누르면 설명 말풍선이 뜬다. 짧게 누르면 칩이 켜지고 꺼진다
// 길게 눌러 말풍선을 연 손가락을 떼도 칩은 토글되지 않는다. 바깥을 누르거나 Esc, 3초 뒤에 닫힌다
// className은 쓰는 자리의 칩 클래스(mn-chip·chip)를 그대로 넘긴다
const HOLD_MS = 500;
const SHOW_MS = 3000;

export default function FriendslopChip({ pressed, onToggle, className }: { pressed: boolean; onToggle: () => void; className: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const bubble = useRef<HTMLSpanElement>(null);
  const hold = useRef<number>(0);
  const hide = useRef<number>(0);
  const longPressed = useRef(false);

  const close = () => { window.clearTimeout(hold.current); window.clearTimeout(hide.current); setOpen(false); };
  useEffect(() => () => { window.clearTimeout(hold.current); window.clearTimeout(hide.current); }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent) { if (e.key === 'Escape') close(); }
      else if (!(e.target as Element | null)?.closest?.('.mn-fs-wrap')) close();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', away);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', away); };
  }, [open]);
  // 말풍선이 화면 밖으로 나가면 안쪽으로 민다 (375px에서 잘리지 않게)
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b) return;
    b.style.transform = '';
    const r = b.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 16);
    if (over > 0) b.style.transform = `translateX(calc(-50% + ${-over}px))`; // CSS의 가운데 정렬(-50%)에 밀어낼 만큼을 더한다
    else if (r.left < 16) b.style.transform = `translateX(calc(-50% + ${16 - r.left}px))`;
  }, [open]);

  return (
    <span className="mn-fs-wrap">
      <button
        type="button"
        className={className + (pressed && className === 'chip' ? ' on' : '')}
        aria-pressed={pressed}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') close(); }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          longPressed.current = false;
          window.clearTimeout(hold.current);
          hold.current = window.setTimeout(() => {
            longPressed.current = true;
            setOpen(true);
            hide.current = window.setTimeout(() => setOpen(false), SHOW_MS);
          }, HOLD_MS);
        }}
        onPointerUp={() => window.clearTimeout(hold.current)}
        onPointerCancel={() => window.clearTimeout(hold.current)}
        onContextMenu={(e) => { if (longPressed.current) e.preventDefault(); }} // 길게 누를 때 뜨는 브라우저 메뉴 막기
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setOpen(true); }}
        onBlur={close}
        onClick={() => { if (longPressed.current) { longPressed.current = false; return; } onToggle(); }}
      >{FS_LABEL}</button>
      {open && <span ref={bubble} id={id} role="tooltip" className="mn-fs-tip">{FS_TIP}</span>}
    </span>
  );
}
