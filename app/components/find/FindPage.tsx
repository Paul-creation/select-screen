'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AbSearch from '../home/ab/AbSearch';
import FindFilters from './FindFilters';
import { FindCard, FindRow } from './FindList';
import ShareButton from '../ShareButton';
import Loader from '../status/Loader';
import { useMyPc } from '../pcspec/useMyPc';
import { useOwned } from '../owned/useOwned';
import { useGameIndex } from '../../lib/useGameIndex';
import { makeAbCtx, makeKwMatcher } from '../../lib/abCtx';
import { EMPTY_QUERY, PRICE_ALL, SORTS, parseQuery, queryHref, sortOf, summaryParts, type AbQuery, type SortKey, type ViewKey } from '../../lib/abSearch';
import { appliedChips, filterGames, findGames, type FindEnv } from '../../lib/findSearch';
import { MAX_COMPARE, compareBlockReason } from '../../lib/compareRule';
import { readPick, useComparePick, writePick } from '../../lib/compareStore';
import { gameName } from '../../lib/gameName';
import '../home/ab/ab.css';
import './find.css';

// 통합 /find — 맨 위 조건 요약 바(누구랑·어떻게·뭐 할까 + 다시 찾기) · 왼쪽 "더 좁히기"(자주 쓰는 칩 + 필터 더 보기) · 오른쪽 결과(머리 · 적용된 필터 칩 · 정렬·보기 · 카드)
// 모든 조건은 주소 쿼리 하나(lib/abSearch AbQuery)가 들고 있고, 요약 바와 필터는 같은 값을 본다 — 필터에서 인원을 바꾸면 요약 바 "누구랑"도 바뀐다
// 조건·정렬·보기가 바뀌면 주소만 history.replaceState로 갈아 끼운다(useSearchParams가 따라온다). 필터 펼침·"더 보기" 개수는 주소에 안 싣는다
const PAGE = 24;
export const HIDE_OWNED_KEY = 'jdn_hide_owned'; // 보유 게임 빼고 보기 — 로컬에만 저장하고 주소엔 안 담는다

// 펼친 필터(더 좁히기 아래쪽)에 걸린 조건이 있나 — 그런 주소(인원별 추천 "더 보기" 등)로 들어오면 필터를 펼쳐서 보여 준다
const hasExpandedFilter = (q: AbQuery) =>
  q.trend.length > 0 || q.mypc || q.mode.length > 0 || q.net.length > 0 || !!q.size || q.story || q.price[0] !== PRICE_ALL[0] || q.price[1] !== PRICE_ALL[1] ||
  q.demo || q.low || (q.barrier.length > 0 && !(q.barrier.length === 1 && q.barrier[0] === '낮음')) || q.rev || q.tv || q.act.length > 0 || q.tags.length > 0 || q.ex.length > 0;

// + 비교 — 비교함(lib/compareStore)에 담고 뺀다. 싱글끼리·멀티끼리만, 최대 3개 (lib/compareRule)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useFindCompare(games: any[] | null) {
  const { ids } = useComparePick();
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const say = (m: string) => {
    setNotice(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(''), 2500);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggle = (g: any) => {
    const now = readPick();
    if (now.includes(g.id)) { setNotice(''); writePick(now.filter((id) => id !== g.id), { source: 'find' }); return; }
    if (now.length >= MAX_COMPARE) return say(`최대 ${MAX_COMPARE}개까지 비교할 수 있어요`);
    const list = now.map((id) => games?.find((x) => x.id === id)).filter(Boolean);
    const reason = compareBlockReason(list, g);
    if (reason) return say(reason);
    setNotice('');
    writePick([...now, g.id], { bump: true, meta: [{ id: g.id, name: gameName(g), thumb: g.cover_image_url || g.card_image_url }], source: 'find' });
  };
  return { ids, notice, toggle };
}

export default function FindPage() {
  const sp = useSearchParams();
  const index = useGameIndex();
  const q = useMemo(() => parseQuery(sp), [sp]);
  const ctx = useMemo(() => makeAbCtx(index.tree), [index.tree]);
  const kw = useMemo(() => makeKwMatcher(index.tree), [index.tree]);
  const { pc } = useMyPc();
  const owned = useOwned();
  const compare = useFindCompare(index.games);

  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState(() => hasExpandedFilter(q));

  // 보유 게임 빼고 보기 — 로그인했고 공개 보유 목록이 1개 이상일 때만 칩이 보이고 걸린다. 선택은 localStorage(jdn_hide_owned)에만
  const [hideOwned, setHideOwnedState] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 바깥(localStorage)에서 한 번 읽어 오는 초기화
  useEffect(() => { try { setHideOwnedState(localStorage.getItem(HIDE_OWNED_KEY) === '1'); } catch {} }, []);
  const setHideOwned = useCallback((v: boolean) => {
    setHideOwnedState(v);
    try { if (v) localStorage.setItem(HIDE_OWNED_KEY, '1'); else localStorage.removeItem(HIDE_OWNED_KEY); } catch {}
  }, []);
  const ownedAvailable = owned.ready && owned.visibility === 'public' && owned.count > 0;
  const hideOwnedActive = hideOwned && ownedAvailable;

  const env: FindEnv = useMemo(
    () => ({ tree: index.tree, ctx, kw, myPc: pc, owned: hideOwnedActive ? (a) => (a == null ? false : owned.has(a)) : null }),
    [index.tree, ctx, kw, pc, hideOwnedActive, owned],
  );
  const list = useMemo(() => (index.games ? findGames(index.games, q, env) : null), [index.games, q, env]);

  // 조건이 바뀌면 처음 24개부터 (정렬·보기만 바뀔 땐 그대로)
  const condKey = queryHref({ ...q, sort: null, view: 'row' });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 조건(주소)이 바뀔 때 목록 길이를 되돌리는 동기화
    setShown(PAGE);
  }, [condKey]);

  const go = useCallback((next: AbQuery) => { window.history.replaceState(null, '', queryHref(next)); }, []);
  const clearAll = () => { go({ ...EMPTY_QUERY, sort: q.sort, view: q.view }); setHideOwned(false); };

  const sum = summaryParts(q);
  const eyebrow = [sum.who, sum.how, sum.what, q.trend.length ? '지금 뜨는 게임' : ''].filter(Boolean).join(' · ') || '전체 게임';
  const chips = appliedChips(q, index.tree, hideOwnedActive, () => setHideOwned(false));
  const sort = sortOf(q);
  const countFn = useCallback((next: AbQuery) => (index.games ? filterGames(index.games, next, env).length : null), [index.games, env]);

  const applyFilters = () => {
    document.getElementById('find-h')?.scrollIntoView({ block: 'start' });
    if (window.matchMedia('(max-width: 767px)').matches) setOpen(false);
  };

  return (
    <div className="ab-res mn-wrap fd">
      <AbSearch games={index.games} initial={q} variant="results" onSubmit={go} countFn={countFn} />

      <div className="fd-layout">
        <FindFilters
          q={q} go={go} games={index.games} tree={index.tree} count={list?.length ?? null} loaded={!!index.games}
          open={open} onToggle={() => setOpen((v) => !v)} onApply={applyFilters}
          hideOwned={hideOwnedActive} setHideOwned={setHideOwned} ownedAvailable={ownedAvailable} onClearAll={clearAll}
        />

        <div className="fd-main">
          {!list ? (
            index.error ? (
              <div className="results-empty">
                <p className="results-empty-title">게임 목록을 불러오지 못했어요</p>
                <div className="results-empty-actions"><button type="button" className="btn btn-outline" onClick={index.retry}>다시 시도</button></div>
              </div>
            ) : <Loader />
          ) : (
            <>
              <div className="fd-head">
                <div>
                  <p className="fd-eyebrow">{eyebrow}</p>
                  <h2 id="find-h" className="fd-title">조건에 맞는 게임 <strong>{list.length.toLocaleString('ko-KR')}개</strong></h2>
                </div>
                <ShareButton variant="text" title="게임 검색 결과" text="이 조건으로 찾은 게임들 같이 보자!" />
              </div>

              {chips.length > 0 && (
                <div className="fd-applied" aria-label="적용된 필터">
                  {chips.map((c) => (
                    <button key={c.key} type="button" className="fd-applied-chip" aria-label={`${c.label} 해제`} onClick={() => go(c.clear(q))}>{c.label} <span aria-hidden="true">×</span></button>
                  ))}
                  <button type="button" className="fd-clear" onClick={clearAll}>전체 지우기</button>
                </div>
              )}

              <div className="fd-toolbar">
                <span className="fd-seg" role="group" aria-label="정렬">
                  {SORTS.map(([k, label]) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => go({ ...q, sort: k as SortKey })}>{label}</button>)}
                </span>
                <span className="fd-seg" role="group" aria-label="보기">
                  {([['row', '행'], ['card', '카드']] as [ViewKey, string][]).map(([k, label]) => <button key={k} type="button" aria-pressed={q.view === k} onClick={() => go({ ...q, view: k })}>{label}</button>)}
                </span>
                <span className="fd-toolbar-note" role="status">{compare.notice || `+ 비교로 최대 ${MAX_COMPARE}개까지`}</span>
              </div>

              {list.length === 0 ? (
                <div className="results-empty">
                  <p className="results-empty-title">맞는 게임을 찾지 못했어요</p>
                  <p className="results-empty-summary">조건을 줄이거나 바꿔서 다시 찾아 보세요.</p>
                  <div className="results-empty-actions"><button type="button" className="btn btn-outline" onClick={clearAll}>조건 모두 지우기</button></div>
                </div>
              ) : (
                <>
                  <ul className={q.view === 'card' ? 'fd-grid' : 'fd-list'}>
                    {list.slice(0, shown).map((g, i) => {
                      const props = { g, i, q, ctx, picked: compare.ids.includes(g.id), onCompare: compare.toggle };
                      return q.view === 'card' ? <FindCard key={g.id} {...props} /> : <FindRow key={g.id} {...props} />;
                    })}
                  </ul>
                  <p className="fd-sub">✓ 는 고른 조건에 맞는 이유, ⚠ 는 알아둘 점이에요. 카드에 마우스를 올리면 브래킷이 떠요.</p>
                  {list.length > shown && (
                    <div className="results-more">
                      <button type="button" className="btn btn-outline" onClick={() => setShown((n) => n + PAGE)}>더 보기 ({shown}/{list.length})</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
