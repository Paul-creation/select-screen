'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import PosterImage from './mn/PosterImage';
import { prefetchOnce } from '../GameLink';
import { useGameIndex } from '../../lib/useGameIndex';
import { matchRank } from '../../lib/searchMatch';
import { gameName } from '../../lib/gameName';
import { playersText } from '../../lib/players';
import { barrierLabel } from '../../lib/cardInfo';
import { getPriceInfo, PRICE_TYPE_LABEL } from '../../lib/price';
import { isComingSoon, comingSoonLabel } from '../../lib/release';
import './header-search.css';

// 헤더 게임 이름 검색 (MainOutV2 시안) — 네비 아래 줄 오른쪽 280px 입력 + 미리보기 드롭다운(최대 5개). 게임 상세로 바로 가는 용도만 (/find?q 없음, "전체 결과 보기" 없음)
// 전체 게임 목록은 처음 입력창을 누르거나 "/"를 눌렀을 때 받는다 (메인은 이미 받아 둔 것을 같이 씀). 이름은 영문·한글·별명(searchMatch) 모두 맞춘다
// /find에서는 숨김. 휴대폰(767px 이하)은 CSS로 숨김
const MAX = 5;
type G = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- 게임 칸은 목록(gameIndex)과 같은 느슨한 모양

function Name({ name, q }: { name: string; q: string }) {
  const at = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{name}</>;
  return <>{name.slice(0, at)}<b>{name.slice(at, at + q.length)}</b>{name.slice(at + q.length)}</>;
}

function priceOf(g: G): { sale: string; text: string } {
  if (isComingSoon(g)) return { sale: '', text: comingSoonLabel(g) ?? '' };
  if (g.is_free) return { sale: '', text: '무료' };
  if (PRICE_TYPE_LABEL[g.price_type]) return { sale: '', text: PRICE_TYPE_LABEL[g.price_type] };
  const p = getPriceInfo(g);
  if (!p) return { sale: '', text: '' };
  return { sale: p.discount > 0 ? `-${p.discount}%` : '', text: p.formattedFinal };
}

export default function HeaderSearch() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { games, error, retry } = useGameIndex({ enabled: armed });
  const query = q.trim();

  const results = useMemo(() => {
    if (!query || !games) return [];
    return games
      .map((g: G) => ({ g, r: matchRank(g, query) }))
      .filter((x: { r: number }) => x.r >= 0)
      .sort((a: { g: G; r: number }, b: { g: G; r: number }) => a.r - b.r || (a.g.heat_rank ?? Infinity) - (b.g.heat_rank ?? Infinity))
      .slice(0, MAX)
      .map((x: { g: G }) => x.g);
  }, [games, query]);

  // "/"로 입력창 포커스 (다른 입력 중이 아닐 때)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  if (path === '/find' || path?.startsWith('/find/')) return null;

  const go = (g: G) => { setOpen(false); router.push(`/games/${g.id}`); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setSel((s) => (s + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setSel((s) => (s - 1 + results.length) % results.length); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing && open) { e.preventDefault(); go(results[Math.min(sel, results.length - 1)]); }
  };

  const show = open && query.length > 0;
  return (
    <div className="hs-row">
      <span className="hs-wrap" ref={wrap}>
        <label className="hs-box" role="search">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            ref={input}
            type="search"
            role="combobox"
            value={q}
            placeholder="게임 이름 검색"
            aria-label="게임 이름으로 검색"
            aria-controls="hs-list"
            aria-expanded={show}
            aria-autocomplete="list"
            aria-activedescendant={show && results.length ? `hs-opt-${Math.min(sel, results.length - 1)}` : undefined}
            autoComplete="off"
            onFocus={() => { setArmed(true); setOpen(true); }}
            onChange={(e) => { setArmed(true); setOpen(true); setSel(0); setQ(e.target.value); }}
            onKeyDown={onKeyDown}
          />
          <kbd aria-hidden="true">/</kbd>
        </label>
        {show && (
          <div className="hs-drop" id="hs-list" role="listbox" aria-label="게임 검색 미리보기">
            {!games && error ? (
              <p className="hs-none" role="alert">검색을 불러오지 못했어요 · <button type="button" className="hs-retry" onClick={() => { retry(); input.current?.focus(); }}>다시 시도</button></p>
            ) : !games ? (
              <p className="hs-none">게임 목록을 불러오는 중이에요</p>
            ) : results.length > 0 ? (
              <div className="hs-list">
                {results.map((g: G, i: number) => {
                  const pr = priceOf(g);
                  const meta = [playersText(g), barrierLabel(g) ? `진입장벽 ${barrierLabel(g)}` : ''].filter(Boolean).join(' · ');
                  return (
                    <Link
                      key={g.id}
                      id={`hs-opt-${i}`}
                      href={`/games/${g.id}`}
                      prefetch={false}
                      role="option"
                      aria-selected={i === Math.min(sel, results.length - 1)}
                      className="hs-opt"
                      onMouseEnter={() => { setSel(i); prefetchOnce(router, `/games/${g.id}`); }}
                      onClick={() => setOpen(false)}
                    >
                      <span className="hs-thumb" aria-hidden="true"><PosterImage cover={{ vertical: g.cover_vertical_url ?? null, appid: g.steam_appid ?? null, wide: g.card_image_url || g.cover_image_url || null }} /></span>
                      <span className="hs-text">
                        <span className="hs-name"><Name name={gameName(g)} q={query} /></span>
                        {meta && <span className="hs-meta">{meta}</span>}
                      </span>
                      {pr.sale && <span className="hs-sale">{pr.sale}</span>}
                      {pr.text && <span className="hs-price">{pr.text}</span>}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="hs-none">‘{query}’ 이름의 게임을 못 찾았어요</p>
            )}
            <div className="hs-foot"><span>게임을 고르면 상세 페이지로 바로 가요</span><span>↑↓ 이동 · Enter 열기</span></div>
          </div>
        )}
      </span>
    </div>
  );
}
