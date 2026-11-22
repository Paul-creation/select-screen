import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import FriendslopList from '../components/friendslop/FriendslopList';
import { getFriendslopGames } from '../lib/friendslopList';
import { getCardGames } from '../lib/gameIndex';
import { getCardExtras } from '../lib/cardExtras';
import { selectGames } from '../lib/visibleGames';
import '../brand-tokens.css';
import '../mono-page.css';
import '../mono-lists.css';
import '../components/home/mn/mn.css';
import './friendslop.css';

// 우당탕 협동(friendslop) 모음 — 판정은 lib/friendslop의 isFriendslop(수동 지정 우선) 그대로, 서버가 전체(약 30여 개)를 한 번에 읽어 보낸다
// 필터·정렬·더 보기는 브라우저에서(추가 요청 없음), 상태는 주소 쿼리(?players=4&free=1&sort=price)로 남는다
// ISR: 게임 상세와 같은 주기(604800초 = 7일). 가격·할인이 바뀌면 일일 갱신 끝의 revalidate가 /friendslop도 다시 만든다 (api/admin/revalidate)
export const revalidate = 604800;

const LEAD = '잘하는 것보다 같이 망하는 게 더 웃긴 날이 있잖아요. 셋 이상 같이 하고, 한 판이 짧고, 보이스챗으로 소리 지르게 되는 싼 협동 게임만 모았어요.';
export const metadata: Metadata = {
  title: '우당탕 협동 게임 모음',
  description: LEAD,
  alternates: { canonical: '/friendslop' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 게임 카드 칸은 목록(gameIndex)과 같은 느슨한 모양
async function loadGames(): Promise<any[]> {
  const rows = await getFriendslopGames();
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [cards, extras, dates] = await Promise.all([
    getCardGames(ids),
    getCardExtras(ids).catch(() => ({})),
    selectGames('id, release_date').in('id', ids), // 최신순 정렬용
  ]);
  const released = new Map((dates.data || []).map((d: { id: string; release_date: string | null }) => [d.id, d.release_date]));
  // 칩은 태그 번호를 안 쓴다
  return (cards as Record<string, unknown>[]).map(({ tag_ids, ...g }) => { void tag_ids; return { ...g, ...(extras as Record<string, object>)[g.id as string], release_date: released.get(g.id as string) ?? null }; });
}

export default async function FriendslopPage() {
  const games = await loadGames().catch(() => []);
  return (
    <main className="page mn mn-inner fs-page">
      <div className="mn-wrap">
        <header className="fs-intro">
          <p className="fs-label">모음 · {games.length}개</p>
          <h1 className="fs-h1">우당탕 협동</h1>
          <p className="fs-lead">{LEAD}</p>
          <p className="fs-rule">3~8명 온라인 협동 · 2만 원 이하 · 음성 소통이나 웃기고 무서운 요소 · 운영자가 직접 넣고 빼기도 해요</p>
        </header>

        <Suspense fallback={null}>
          <FriendslopList games={games} />
        </Suspense>

        <aside className="fs-suggest">
          <div>
            <p className="fs-suggest-title">빠진 우당탕 협동 게임이 있나요?</p>
            <p className="fs-suggest-sub">알려주면 확인하고 모음에 넣을게요.</p>
          </div>
          <Link href={`/feedback?kind=feature&text=${encodeURIComponent('우당탕 협동 추천: ')}`} className="fs-btn">게임 추천하기</Link>
        </aside>
      </div>
    </main>
  );
}
