create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  username text unique not null check (char_length(username) between 3 and 24),
  pin_hash text not null,
  avatar text not null default '🪩',
  onboarding_seen boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists player_sessions (
  token uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists episodes (
  slug text primary key,
  week int not null,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'upcoming',
  judges jsonb not null default '["Carrie Ann Inaba","Derek Hough","Bruno Tonioli"]'
);

create table if not exists couples (
  slug text primary key,
  celebrity text not null,
  pro text not null,
  active boolean not null default true
);

create table if not exists episode_couples (
  episode_slug text references episodes(slug) on delete cascade,
  couple_slug text references couples(slug) on delete cascade,
  dance_style text,
  song text,
  lock_at timestamptz,
  primary key (episode_slug,couple_slug)
);

create table if not exists predictions (
  player_id uuid references players(id) on delete cascade,
  episode_slug text references episodes(slug) on delete cascade,
  couple_slug text references couples(slug) on delete cascade,
  judge_scores int[] not null,
  predicted_total int not null,
  locked_at timestamptz not null default now(),
  points int not null default 0,
  primary key (player_id,episode_slug,couple_slug)
);

create table if not exists bonus_picks (
  player_id uuid references players(id) on delete cascade,
  episode_slug text references episodes(slug) on delete cascade,
  highest_slug text references couples(slug),
  eliminated_slug text references couples(slug),
  locked_at timestamptz not null default now(),
  points int not null default 0,
  primary key (player_id,episode_slug)
);

create table if not exists results (
  episode_slug text references episodes(slug) on delete cascade,
  couple_slug text references couples(slug) on delete cascade,
  judge_scores int[] not null,
  total int not null,
  highest boolean not null default false,
  eliminated boolean not null default false,
  source_url text,
  verified_at timestamptz not null default now(),
  primary key (episode_slug,couple_slug)
);

create or replace function register_player(p_first_name text,p_last_name text,p_username text,p_pin text,p_avatar text)
returns jsonb language plpgsql security definer as $$
declare p players; t uuid;
begin
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  insert into players(first_name,last_name,username,pin_hash,avatar)
  values(trim(p_first_name),trim(p_last_name),lower(trim(p_username)),crypt(p_pin,gen_salt('bf')),coalesce(nullif(p_avatar,''),'🪩'))
  returning * into p;
  insert into player_sessions(player_id) values(p.id) returning token into t;
  return jsonb_build_object('token',t,'player',to_jsonb(p)-'pin_hash');
end $$;

create or replace function login_player(p_username text,p_pin text)
returns jsonb language plpgsql security definer as $$
declare p players; t uuid;
begin
  select * into p from players where username=lower(trim(p_username)) and pin_hash=crypt(p_pin,pin_hash);
  if p.id is null then raise exception 'Username or PIN did not match'; end if;
  insert into player_sessions(player_id) values(p.id) returning token into t;
  return jsonb_build_object('token',t,'player',to_jsonb(p)-'pin_hash');
end $$;

alter table players enable row level security;
alter table player_sessions enable row level security;
alter table predictions enable row level security;
alter table bonus_picks enable row level security;
alter table results enable row level security;
alter table episodes enable row level security;
alter table couples enable row level security;
alter table episode_couples enable row level security;

insert into episodes(slug,week,title,starts_at,ends_at,status)
values('week2',2,'Viral Hits Night','2026-09-22 20:00:00-04','2026-09-22 22:00:00-04','upcoming')
on conflict(slug) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at;

insert into couples(slug,celebrity,pro) values
('tatyana','Tatyana Ali','Jan Ravnik'),
('tyler','Tyler Cameron','Sharna Burgess'),
('giada','Giada De Laurentiis','Alan Bersten'),
('jenna','Jenna Dewan','Val Chmerkovskiy'),
('ezra','Ezra Frech','Daniella Karagach'),
('amber','Amber Glenn','Pasha Pashkov'),
('taylor','Taylor Hanson','Britt Stewart'),
('maura','Maura Higgins','Mark Ballas'),
('ciara','Ciara Miller','Brandon Armstrong'),
('jackson','Jackson Olson','Emma Slater'),
('guillermo','Guillermo Rodriguez','Witney Carson'),
('harry','Harry Shum Jr.','Jenna Johnson'),
('julia','Julia Stiles','Ezra Sosa'),
('connorw','Connor Wood','Rylee Arnold')
on conflict(slug) do update set celebrity=excluded.celebrity,pro=excluded.pro;
