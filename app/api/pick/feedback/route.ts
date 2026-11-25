import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getIp, ipHash } from '../../../lib/aiGuard';

// 알아서 골라줘 "좋아요/별로예요" — 지금은 저장만 한다 (다음 추천에는 아직 반영하지 않음)
export const dynamic = 'force-dynamic';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT_PER_HOUR = 30;

export async function POST(req: NextRequest) {
  let b: { logId?: unknown; gameIds?: unknown; vote?: unknown } = {};
  try { b = await req.json(); } catch { /* 아래에서 걸러진다 */ }
  const logId = typeof b.logId === 'string' && UUID.test(b.logId) ? b.logId.toLowerCase() : null;
  const gameIds = Array.isArray(b.gameIds) ? [...new Set(b.gameIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)).map((x) => x.toLowerCase()))].slice(0, 3) : [];
  const vote = b.vote === 'up' || b.vote === 'down' ? b.vote : null;
  if (!logId || !vote || gameIds.length === 0) return NextResponse.json({ error: '잘못된 요청이에요' }, { status: 400 });

  const ip = ipHash(getIp(req.headers));
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db.from('ai_pick_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', ip).eq('scope', 'feedback').gte('created_at', since);
  if ((count ?? 0) >= LIMIT_PER_HOUR) return NextResponse.json({ error: '잠깐 쉬었다가 다시 눌러주세요' }, { status: 429 });
  await db.from('ai_pick_rate').insert({ ip_hash: ip, scope: 'feedback' });

  const { error } = await db.from('ai_pick_feedback').insert({ log_id: logId, game_ids: gameIds, vote });
  if (error) {
    console.error('알아서 골라줘 피드백 저장 실패:', error.message);
    return NextResponse.json({ error: '저장하지 못했어요' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
