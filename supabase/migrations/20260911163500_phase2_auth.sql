create extension if not exists pgcrypto;

create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  address text not null check (address ~ '^0x[a-f0-9]{40}$'),
  chain_id bigint not null check (chain_id > 0),
  origin text not null,
  message text not null,
  nonce_hash text not null unique check (length(nonce_hash) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists auth_challenges_lookup_idx
  on public.auth_challenges (id, expires_at, consumed_at);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  address text not null check (address ~ '^0x[a-f0-9]{40}$'),
  chain_id bigint not null check (chain_id > 0),
  origin text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists auth_sessions_address_idx
  on public.auth_sessions (address, expires_at desc);
create index if not exists auth_sessions_active_idx
  on public.auth_sessions (token_hash, expires_at)
  where revoked_at is null;

create table if not exists public.auth_rate_limits (
  bucket text primary key check (length(bucket) = 64),
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 0 check (hit_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.auth_challenges enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.auth_rate_limits enable row level security;

-- No public policies are intentionally created. These tables are server-only and
-- are accessed with the service_role key, which bypasses RLS.

create or replace function public.auth_consume_challenge(p_challenge_id uuid)
returns table(consumed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.auth_challenges
     set consumed_at = now()
   where id = p_challenge_id
     and consumed_at is null
     and expires_at > now();

  get diagnostics affected = row_count;
  return query select affected = 1;
end;
$$;

create or replace function public.auth_consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  current_window timestamptz;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'rate limit parameters must be positive';
  end if;

  insert into public.auth_rate_limits(bucket, window_started_at, hit_count, updated_at)
  values (p_bucket, now(), 1, now())
  on conflict (bucket) do update
    set window_started_at = case
          when public.auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
            then now()
          else public.auth_rate_limits.window_started_at
        end,
        hit_count = case
          when public.auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
            then 1
          else public.auth_rate_limits.hit_count + 1
        end,
        updated_at = now()
  returning hit_count, window_started_at into current_count, current_window;

  return query select current_count <= p_limit;
end;
$$;

revoke all on public.auth_challenges from anon, authenticated;
revoke all on public.auth_sessions from anon, authenticated;
revoke all on public.auth_rate_limits from anon, authenticated;
revoke all on function public.auth_consume_challenge(uuid) from public, anon, authenticated;
revoke all on function public.auth_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.auth_consume_challenge(uuid) to service_role;
grant execute on function public.auth_consume_rate_limit(text, integer, integer) to service_role;
