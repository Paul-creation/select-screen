-- "알아서 골라줘" 운영진 추천(select screen's pick) — 서버(서비스 키)만 읽는다. 추천 데이터는 SQL 에디터에서 넣는다
-- players: 이 인원일 때 보여 준다. moods: app/lib/aiPick/moods.ts의 키 (비어 있으면 모든 분위기)
create table if not exists public.staff_picks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  players int[] not null,
  moods text[] not null default '{}',
  blurb text not null,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  priority int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists staff_picks_game_idx on public.staff_picks (game_id);

alter table public.staff_picks enable row level security;
revoke all on public.staff_picks from anon, authenticated;

alter table public.ai_pick_log add column if not exists staff_pick_id uuid;

notify pgrst, 'reload schema';
