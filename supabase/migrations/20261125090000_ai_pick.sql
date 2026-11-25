create table if not exists public.ai_pick_cache (
  key text primary key,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_pick_cache_expires_idx on public.ai_pick_cache (expires_at);

create table if not exists public.ai_pick_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  n int,
  how text,
  genres text[] not null default '{}',
  mood text,
  exclude_count int not null default 0,
  candidate_count int not null default 0,
  picked_ids text[] not null default '{}',
  fallback boolean not null default false,
  cached boolean not null default false,
  widened boolean not null default false,
  logged_in boolean not null default false,
  took_ms int
);
create index if not exists ai_pick_log_created_idx on public.ai_pick_log (created_at desc);

create table if not exists public.ai_pick_feedback (
  id uuid primary key default gen_random_uuid(),
  log_id uuid references public.ai_pick_log(id) on delete set null,
  game_ids text[] not null default '{}',
  vote text not null check (vote in ('up', 'down')),
  created_at timestamptz not null default now()
);
create index if not exists ai_pick_feedback_log_idx on public.ai_pick_feedback (log_id);

create table if not exists public.ai_pick_rate (
  id bigint generated always as identity primary key,
  ip_hash text,
  scope text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_pick_rate_ip_idx on public.ai_pick_rate (ip_hash, created_at desc);

alter table public.ai_pick_cache enable row level security;
alter table public.ai_pick_log enable row level security;
alter table public.ai_pick_feedback enable row level security;
alter table public.ai_pick_rate enable row level security;
revoke all on public.ai_pick_cache, public.ai_pick_log, public.ai_pick_feedback, public.ai_pick_rate from anon, authenticated;

notify pgrst, 'reload schema';
