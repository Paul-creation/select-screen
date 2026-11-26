// 운영진 추천(select screen's pick, staff_picks 표) — 조건이 맞으면 결과 1번 자리에 고정한다. AI는 이 게임을 보지도 문구를 바꾸지도 않는다
// 다른 파일을 import하지 않아 테스트(staffPick.test.mjs)가 .ts를 바로 불러온다. 표·게임 읽기는 부르는 쪽(/api/pick)이 넘긴다

export type StaffPickRow = {
  id: string; game_id: string; players: number[] | null; moods: string[] | null; blurb: string;
  active: boolean; starts_at: string | null; ends_at: string | null; priority: number | null; created_at?: string | null;
};
type Cond = { n: number | null; mood: string | null };

const time = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);

function matches(r: StaffPickRow, c: Cond, now: number): boolean {
  if (r.active !== true || c.n == null || !r.players?.includes(c.n)) return false;
  if (r.moods?.length && !(c.mood != null && r.moods.includes(c.mood))) return false;
  if (r.starts_at && !(time(r.starts_at) <= now)) return false;
  if (r.ends_at && !(now < time(r.ends_at))) return false;
  return true;
}

// 조건에 맞는 것 중 priority가 가장 높은 하나 (같으면 나중에 만든 것)
export function matchStaffPick(rows: StaffPickRow[], cond: Cond, now: Date): StaffPickRow | null {
  const ok = rows.filter((r) => matches(r, cond, now.getTime()));
  ok.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (time(b.created_at) || 0) - (time(a.created_at) || 0));
  return ok[0] ?? null;
}

type Game = { id: string; steam_appid?: string | number | null };

// 이번 응답에 넣을 운영진 추천 — 없으면 null. 맞는 것 하나를 먼저 정한 뒤, 그 게임을 이미 보여 줬거나(excludeIds) Steam에 갖고 있으면 넣지 않는다
// (다음 순위로 넘기지 않는다 — "다시 골라줘"를 누르면 AI 추천만 나온다). 게임을 못 읽으면(숨김 등)도 넣지 않는다
export async function resolveStaffPick<G extends Game>(o: {
  cond: Cond & { excludeIds: string[] };
  now: Date;
  loadRows: () => Promise<StaffPickRow[]>;
  loadGame: (id: string) => Promise<G | null>;
  loadOwned: () => Promise<ReadonlySet<number> | null>;
}): Promise<{ row: StaffPickRow; game: G } | null> {
  if (o.cond.n == null) return null;
  const row = matchStaffPick(await o.loadRows(), o.cond, o.now);
  if (!row || o.cond.excludeIds.includes(row.game_id.toLowerCase())) return null;
  const [game, owned] = await Promise.all([o.loadGame(row.game_id), o.loadOwned()]);
  if (!game) return null;
  if (game.steam_appid != null && owned?.has(Number(game.steam_appid))) return null;
  return { row, game };
}

// 결과 순서 — 운영진 추천이 있으면 1번, 그 뒤에 AI(또는 fallback)가 고른 것. 이유 문구는 표의 blurb 그대로
export function withStaffFirst<P extends { id: string; reason: string }>(staff: StaffPickRow | null, picks: P[]): (P | { id: string; reason: string; staff: true })[] {
  return staff ? [{ id: staff.game_id, reason: staff.blurb, staff: true as const }, ...picks] : picks;
}
