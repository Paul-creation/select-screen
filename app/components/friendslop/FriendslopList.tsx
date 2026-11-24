'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PosterCard from '../home/mn/PosterCard';
import MyPcChip from '../home/mn/MyPcChip';
import { useMyPc } from '../pcspec/useMyPc';
import { toUserPc } from '../../lib/myPc';
import { runsOnMyPc } from '../../lib/specJudge';
import { getPriceInfo } from '../../lib/price';
import { fitsPeople, type PeopleN } from '../../lib/peopleFit';

// /friendslop 컨트롤 줄 + 그리드 — 필터·정렬·더 보기는 전부 여기(브라우저)서, 상태는 주소 쿼리로 (?players=4&free=1&sale=1&u10k=1&mypc=1&sort=price)
// 인원 탭은 메인 "N인 추천"과 같은 fitsPeople. 처음 12개, "더 보기"는 12개씩
const STEP = 12;
const TABS: { n: PeopleN | null; label: string }[] = [{ n: null, label: '전체' }, { n: 2, label: '2인' }, { n: 3, label: '3인' }, { n: 4, label: '4인' }, { n: 5, label: '5인 이상' }];
const SORTS = [{ key: 'pop', label: '인기순' }, { key: 'price', label: '가격 낮은 순' }, { key: 'sale', label: '할인율 순' }, { key: 'new', label: '최신순' }] as const;
type SortKey = (typeof SORTS)[number]['key'];
const U10K = 10000;

/* eslint-disable @typescript-eslint/no-explicit-any -- 게임 카드 칸은 목록(gameIndex)과 같은 느슨한 모양 */
const priceOf = (g: any) => (g.is_free ? 0 : getPriceInfo(g)?.final ?? Infinity);
const discountOf = (g: any) => getPriceInfo(g)?.discount ?? 0;
const SORT_FN: Record<SortKey, (a: any, b: any) => number> = {
  pop: (a, b) => (a.heat_rank ?? Infinity) - (b.heat_rank ?? Infinity),
  price: (a, b) => priceOf(a) - priceOf(b),
  sale: (a, b) => discountOf(b) - discountOf(a),
  new: (a, b) => String(b.release_date ?? '').localeCompare(String(a.release_date ?? '')),
};

export default function FriendslopList({ games }: { games: any[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { pc, ready } = useMyPc();
  const [shown, setShown] = useState(STEP);

  const playersParam = Number(sp.get('players'));
  const players = ([2, 3, 4, 5] as number[]).includes(playersParam) ? (playersParam as PeopleN) : null;
  const free = sp.get('free') === '1';
  const u10k = sp.get('u10k') === '1';
  const sale = sp.get('sale') === '1';
  const myPcOn = sp.get('mypc') === '1';
  const sortParam = sp.get('sort');
  const sort: SortKey = SORTS.some((s) => s.key === sortParam) ? (sortParam as SortKey) : 'pop';
  const myPcActive = ready && !!pc && myPcOn;

  const set = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null) q.delete(k); else q.set(k, v); }
    const s = q.toString();
    router.replace(s ? `/friendslop?${s}` : '/friendslop', { scroll: false });
  };
  const toggle = (k: string, on: boolean) => set({ [k]: on ? null : '1' });

  const list = useMemo(() => {
    const user = myPcActive && pc ? toUserPc(pc) : null;
    return games
      .filter((g) => (!players || fitsPeople(g, players)) && (!free || !!g.is_free) && (!u10k || priceOf(g) <= U10K) && (!sale || discountOf(g) > 0) && (!user || runsOnMyPc(user, g)))
      .sort(SORT_FN[sort]);
  }, [games, players, free, u10k, sale, sort, myPcActive, pc]);

  // 조건이 바뀌면 처음 12개부터
  const key = sp.toString();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 조건(주소)이 바뀔 때 목록 길이를 되돌리는 동기화
    setShown(STEP);
  }, [key]);

  const rest = Math.max(0, list.length - shown);
  return (
    <section aria-label="우당탕 협동 게임 목록">
      <div className="fs-controls">
        <div className="mn-tabs" role="group" aria-label="인원">
          {TABS.map((t) => (
            <button key={t.label} type="button" className="mn-tab" aria-pressed={players === t.n} onClick={() => set({ players: t.n ? String(t.n) : null })}>{t.label}</button>
          ))}
        </div>
        <span className="mn-vsep" aria-hidden="true" />
        <div className="mn-chips" role="group" aria-label="거르기">
          <button type="button" className="mn-chip" aria-pressed={free} onClick={() => toggle('free', free)}>무료</button>
          <button type="button" className="mn-chip" aria-pressed={u10k} onClick={() => toggle('u10k', u10k)}>만 원 이하</button>
          <button type="button" className="mn-chip" aria-pressed={sale} onClick={() => toggle('sale', sale)}>할인 중</button>
          <MyPcChip on={myPcOn} onToggle={() => toggle('mypc', myPcOn)} />
        </div>
        <label className="fs-sort">
          <span className="sr-only">정렬</span>
          <select value={sort} onChange={(e) => set({ sort: e.target.value === 'pop' ? null : e.target.value })} aria-label="정렬">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <p className="fs-count" role="status">{games.length}개 중 {list.length}개</p>

      {list.length === 0 ? (
        <div className="fs-empty">
          <p>조건에 맞는 게임이 없어요</p>
          <button type="button" className="fs-btn is-ghost" onClick={() => router.replace('/friendslop', { scroll: false })}>필터 초기화</button>
        </div>
      ) : (
        <>
          <ul className="mn-grid fs-grid">
            {list.slice(0, shown).map((g, i) => <li key={g.id}><PosterCard game={g} eager={i < 6} /></li>)}
          </ul>
          {rest > 0 && (
            <div className="fs-more">
              <button type="button" className="fs-more-btn" onClick={() => setShown((n) => n + STEP)}>더 보기 · {rest}개 남음</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
