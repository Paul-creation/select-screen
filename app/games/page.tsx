import { redirect } from 'next/navigation';
import { legacyHomeToFind } from '../lib/abSearch';

// /games?players=5 · /games?sale=1 같은 주소를 통합 검색(/find)으로 보낸다 — 옛 필터 키는 /find 새 형식으로 바뀐다 (app/lib/abSearch legacyHomeToFind)
export default async function GamesIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ r: '1' });
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && ['q', 'cat', 'tags', 'act', 'actu', 'p', 'players', 'price', 'solo', 'duo', 'large', 'demo', 'fs', 'd', 'free', 'sale', 'cmp'].includes(k)) q.set(k, v);
  }
  redirect(legacyHomeToFind(q) ?? '/find');
}
