'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadTagTree, type TagTree } from './tagTree';
import { createIndexStore } from './indexStore';

// 메인 검색·필터용 전체 게임 목록과 태그 나무를 첫 화면 뒤에 받아 온다
// - 게임: /api/games/list (1시간 캐시, 태그는 번호만)
// - 태그 나무·이름: app/lib/tag-search-dict.json (별도 조각으로 받아 첫 화면 JS에 싣지 않음)
// 받은 목록은 새로고침 전까지 탭 안에 기억 → 상세에서 "목록으로" 돌아오면 다시 받지 않고 바로 결과를 그린다
// 8초 타임아웃·재시도 규칙은 lib/indexStore
const store = createIndexStore<any, TagTree>({
  fetchGames: async (signal) => {
    const r = await fetch('/api/games/list', { signal });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  },
  loadTree: loadTagTree,
});

// enabled=false면 받지 않는다 (헤더 이름 검색처럼 입력할 때 처음 받는 곳)
export function useGameIndex({ enabled = true }: { enabled?: boolean } = {}) {
  const [data, setData] = useState(store.peek);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const complete = !!data?.tree;

  useEffect(() => {
    if (complete || !enabled) return;
    let alive = true;
    store.load()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [complete, attempt, enabled]);

  const retry = useCallback(() => { setError(false); setAttempt((n) => n + 1); }, []);
  return { games: data?.games ?? null, tree: data?.tree ?? null, error, retry };
}

export type GameIndex = ReturnType<typeof useGameIndex>;
