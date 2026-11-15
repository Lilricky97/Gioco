-- ============================================================
--  PIPPEGHI 24/7 – database del sito del gruppo (Supabase / Postgres)
--  Tutto passa da funzioni che chiedono la password del gruppo.
--  Le tabelle non sono leggibili direttamente con la chiave pubblica.
-- ============================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- tabelle ----------
create table if not exists app_config (k text primary key, v text not null);

create table if not exists members (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table members add column if not exists last_seen timestamptz;   -- per sapere chi è online
alter table members add column if not exists banned boolean not null default false;   -- rimosso dal gruppo (kick)

create table if not exists stories (            -- foto che spariscono dopo 24 ore
  id uuid primary key default gen_random_uuid(),
  author text not null,
  path text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists story_views (        -- chi ha visto ogni storia
  story_id uuid not null references stories(id) on delete cascade,
  name text not null,
  seen_at timestamptz not null default now(),
  primary key (story_id, name)
);

create table if not exists story_comments (     -- commenti alle storie (spariscono con la storia)
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  body text not null default '',
  photos text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists post_likes (         -- i "mi piace"
  post_id uuid not null references posts(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, name)
);

alter table post_likes add column if not exists val smallint not null default 1;   -- 1 = mi piace, -1 = non mi piace

create table if not exists post_replies (       -- le risposte ai post
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists albums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references albums(id) on delete cascade,
  path text not null,
  author text not null,
  created_at timestamptz not null default now()
);

create table if not exists photo_comments (     -- commenti alle foto degli album
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists photo_votes (        -- mi piace / non mi piace sulle foto
  photo_id uuid not null references photos(id) on delete cascade,
  name text not null,
  val smallint not null,
  created_at timestamptz not null default now(),
  primary key (photo_id, name)
);

create table if not exists polls (              -- sondaggi stile WhatsApp
  id uuid primary key default gen_random_uuid(),
  author text not null,
  question text not null,
  multi boolean not null default false,          -- true = si possono scegliere più risposte
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  pos int not null,
  label text not null
);

create table if not exists poll_votes (
  poll_id uuid not null references polls(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (option_id, name)
);

create table if not exists ss_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  budget text not null default '',
  gift_date text not null default '',
  organizer text not null,
  admin_pin text not null,               -- hash
  status text not null default 'open',   -- open | drawn
  drawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ss_people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references ss_events(id) on delete cascade,
  name text not null,
  pin text not null,                     -- hash
  wish text not null default '',
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create table if not exists ss_excl (           -- coppie che non possono pescarsi
  event_id uuid not null references ss_events(id) on delete cascade,
  a text not null, b text not null,
  primary key (event_id, a, b)
);

create table if not exists ss_pairs (
  event_id uuid not null references ss_events(id) on delete cascade,
  giver uuid not null references ss_people(id) on delete cascade,
  receiver uuid not null references ss_people(id) on delete cascade,
  primary key (event_id, giver)
);

alter table app_config enable row level security;
alter table members   enable row level security;
alter table stories     enable row level security;
alter table story_views enable row level security;
alter table story_comments enable row level security;
alter table posts     enable row level security;
alter table post_likes   enable row level security;
alter table post_replies enable row level security;
alter table albums    enable row level security;
alter table photos    enable row level security;
alter table photo_comments enable row level security;
alter table photo_votes enable row level security;
alter table polls        enable row level security;
alter table poll_options enable row level security;
alter table poll_votes   enable row level security;
alter table ss_events enable row level security;
alter table ss_people enable row level security;
alter table ss_excl   enable row level security;
alter table ss_pairs  enable row level security;
-- nessuna policy: dall'esterno si passa solo dalle funzioni qui sotto

-- ---------- utilità ----------
create or replace function _ok(p_pw text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from app_config where k = 'pw' and v = extensions.crypt(coalesce(p_pw,''), v));
$$;

create or replace function _need(p_pw text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not _ok(p_pw) then raise exception 'PASSWORD_ERRATA'; end if;
end $$;

-- PIN amministratore (app_config k='admin'): lo imposta Ricky dal SQL Editor, come la password
create or replace function _admin_ok(p_admin text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from app_config where k = 'admin' and v = extensions.crypt(coalesce(p_admin,''), v));
$$;

create or replace function _clean(t text, maxlen int) returns text
language sql immutable as $$ select left(btrim(coalesce(t,'')), maxlen) $$;

-- ---------- accesso e membri ----------
create or replace function check_pw(p_pw text) returns boolean
language sql stable security definer set search_path = public, extensions as $$ select _ok(p_pw) $$;

create or replace function members_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(name order by lower(name)) from members where not banned), '[]'::json);
end $$;

create or replace function member_add(p_pw text, p_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30);
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if exists (select 1 from members where lower(name) = lower(n) and banned) then raise exception 'NOME_BLOCCATO'; end if;
  insert into members(name) values (n) on conflict do nothing;
end $$;

-- chi è online: ogni telefono "bussa" ogni 45 secondi; online = visto negli ultimi 150 secondi
create or replace function presenza(p_pw text, p_name text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30);
begin
  perform _need(p_pw);
  if n <> '' then
    if exists (select 1 from members where lower(name) = lower(n) and banned) then raise exception 'SEI_STATO_RIMOSSO'; end if;
    update members set last_seen = now() where lower(name) = lower(n);
    if not found then insert into members(name, last_seen) values (n, now()) on conflict (name) do update set last_seen = now(); end if;
  end if;
  return coalesce((select json_agg(json_build_object('name', name, 'created_at', created_at, 'last_seen', last_seen,
      'online', coalesce(last_seen > now() - interval '150 seconds', false) and not banned, 'banned', banned) order by last_seen desc nulls last, lower(name)) from members), '[]'::json);
end $$;

-- amministratore: controlla il PIN (set = esiste un PIN, ok = è giusto)
create or replace function admin_check(p_pw text, p_admin text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return json_build_object('set', exists (select 1 from app_config where k = 'admin'), 'ok', _admin_ok(p_admin));
end $$;

-- rimuove (p_ban = true) o riammette (false) una persona; i suoi post restano
create or replace function member_kick(p_pw text, p_admin text, p_name text, p_ban boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  if not exists (select 1 from app_config where k = 'admin') then raise exception 'ADMIN_NON_IMPOSTATO'; end if;
  if not _admin_ok(p_admin) then raise exception 'PIN_ADMIN_ERRATO'; end if;
  update members set banned = coalesce(p_ban, true) where lower(name) = lower(_clean(p_name, 30));
  if not found then raise exception 'NOME_NON_TROVATO'; end if;
end $$;

-- ---------- storie (24 ore) ----------
create or replace function stories_list(p_pw text, p_name text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(x order by x.created_at) from (
    select s.id, s.author, s.path, s.caption, s.created_at,
      case when lower(s.author) = lower(coalesce(p_name, '')) then   -- chi l'ha vista: solo per l'autore
        coalesce((select json_agg(v.name order by v.seen_at) from story_views v where v.story_id = s.id), '[]'::json) end as views,
      (select count(*) from story_comments c where c.story_id = s.id) as comments
    from stories s where s.created_at > now() - interval '24 hours') x), '[]'::json);
end $$;

create or replace function story_add(p_pw text, p_author text, p_path text, p_caption text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; pth text := _clean(p_path, 300);
begin
  perform _need(p_pw);
  if pth = '' then raise exception 'POST_VUOTO'; end if;
  delete from stories where created_at < now() - interval '24 hours';   -- pulizia delle scadute
  insert into stories(author, path, caption) values (_clean(p_author, 30), pth, _clean(p_caption, 150)) returning id into new_id;
  return new_id;
end $$;

create or replace function story_seen(p_pw text, p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30);
begin
  perform _need(p_pw);
  if n = '' then return; end if;
  if exists (select 1 from stories where id = p_id and lower(author) <> lower(n)) then
    insert into story_views(story_id, name) values (p_id, n) on conflict do nothing;
  end if;
end $$;

create or replace function story_comments(p_pw text, p_story uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(row_to_json(c) order by c.created_at)
    from (select id, author, body, created_at from story_comments where story_id = p_story) c), '[]'::json);
end $$;

create or replace function story_comment_add(p_pw text, p_story uuid, p_author text, p_body text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; b text := _clean(p_body, 500);
begin
  perform _need(p_pw);
  if b = '' then raise exception 'POST_VUOTO'; end if;
  if not exists (select 1 from stories where id = p_story and created_at > now() - interval '24 hours') then raise exception 'STORIA_SCADUTA'; end if;
  insert into story_comments(story_id, author, body) values (p_story, _clean(p_author, 30), b) returning id into new_id;
  return new_id;
end $$;

create or replace function story_comment_del(p_pw text, p_id uuid, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from story_comments where id = p_id and author = p_author;
end $$;

create or replace function story_del(p_pw text, p_id uuid, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from stories where id = p_id and author = p_author;
end $$;

-- ---------- novità ----------
create or replace function feed(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(row_to_json(p) order by p.created_at desc)
    from (select x.id, x.author, x.body, x.photos, x.created_at,
            coalesce((select json_agg(l.name order by l.created_at) from post_likes l where l.post_id = x.id and l.val = 1), '[]'::json) as likes,
            coalesce((select json_agg(l.name order by l.created_at) from post_likes l where l.post_id = x.id and l.val = -1), '[]'::json) as dislikes,
            (select count(*) from post_replies r where r.post_id = x.id) as replies
          from posts x order by x.created_at desc limit 150) p), '[]'::json);
end $$;

create or replace function post_add(p_pw text, p_author text, p_body text, p_photos text[]) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; b text := _clean(p_body, 4000);
begin
  perform _need(p_pw);
  if b = '' and coalesce(array_length(p_photos,1),0) = 0 then raise exception 'POST_VUOTO'; end if;
  insert into posts(author, body, photos) values (_clean(p_author,30), b, coalesce(p_photos[1:20], '{}')) returning id into new_id;
  return new_id;
end $$;

create or replace function post_del(p_pw text, p_id uuid, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from posts where id = p_id and author = p_author;
end $$;

-- mi piace / non mi piace più (restituisce true se ora piace)
create or replace function post_like(p_pw text, p_id uuid, p_name text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30);
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if not exists (select 1 from posts where id = p_id) then raise exception 'POST_NON_TROVATO'; end if;
  delete from post_likes where post_id = p_id and lower(name) = lower(n) and val = 1;
  if found then return false; end if;
  insert into post_likes(post_id, name, val) values (p_id, n, 1) on conflict (post_id, name) do update set val = 1;
  return true;
end $$;

-- voto su un post: p_val 1 = mi piace, -1 = non mi piace; lo stesso voto di nuovo lo toglie. Restituisce il voto attuale (0 = nessuno)
create or replace function post_vote(p_pw text, p_id uuid, p_name text, p_val int) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30); prima smallint;
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if p_val is null or p_val not in (1, -1) then raise exception 'VOTO_NON_VALIDO'; end if;
  if not exists (select 1 from posts where id = p_id) then raise exception 'POST_NON_TROVATO'; end if;
  select val into prima from post_likes where post_id = p_id and lower(name) = lower(n);
  delete from post_likes where post_id = p_id and lower(name) = lower(n);
  if prima is not distinct from p_val::smallint then return 0; end if;
  insert into post_likes(post_id, name, val) values (p_id, n, p_val) on conflict (post_id, name) do update set val = excluded.val;
  return p_val;
end $$;

create or replace function post_thread(p_pw text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(row_to_json(r) order by r.created_at)
    from (select id, author, body, created_at from post_replies where post_id = p_id) r), '[]'::json);
end $$;

create or replace function reply_add(p_pw text, p_id uuid, p_author text, p_body text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; b text := _clean(p_body, 2000);
begin
  perform _need(p_pw);
  if b = '' then raise exception 'POST_VUOTO'; end if;
  if not exists (select 1 from posts where id = p_id) then raise exception 'POST_NON_TROVATO'; end if;
  insert into post_replies(post_id, author, body) values (p_id, _clean(p_author,30), b) returning id into new_id;
  return new_id;
end $$;

create or replace function reply_del(p_pw text, p_id uuid, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from post_replies where id = p_id and author = p_author;
end $$;

-- ---------- album foto ----------
create or replace function albums_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(x order by x.created_at desc) from (
    select a.id, a.name, a.created_by, a.created_at,
      (select count(*) from photos f where f.album_id = a.id) as n,
      (select f.path from photos f where f.album_id = a.id order by f.created_at desc limit 1) as cover
    from albums a) x), '[]'::json);
end $$;

create or replace function album_create(p_pw text, p_name text, p_author text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; n text := _clean(p_name, 60);
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  insert into albums(name, created_by) values (n, _clean(p_author,30)) returning id into new_id;
  return new_id;
end $$;

create or replace function album_photos(p_pw text, p_album uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(row_to_json(f) order by f.created_at desc)
    from (select x.id, x.path, x.author, x.created_at,
            (select count(*) from photo_comments c where c.photo_id = x.id) as comments,
            coalesce((select json_agg(v.name order by v.created_at) from photo_votes v where v.photo_id = x.id and v.val = 1), '[]'::json) as likes,
            coalesce((select json_agg(v.name order by v.created_at) from photo_votes v where v.photo_id = x.id and v.val = -1), '[]'::json) as dislikes
          from photos x where x.album_id = p_album) f), '[]'::json);
end $$;

create or replace function photo_add(p_pw text, p_album uuid, p_path text, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  insert into photos(album_id, path, author) values (p_album, _clean(p_path,300), _clean(p_author,30));
end $$;

create or replace function photo_comments(p_pw text, p_photo uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(row_to_json(c) order by c.created_at)
    from (select id, author, body, created_at from photo_comments where photo_id = p_photo) c), '[]'::json);
end $$;

create or replace function photo_comment_add(p_pw text, p_photo uuid, p_author text, p_body text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; b text := _clean(p_body, 1000);
begin
  perform _need(p_pw);
  if b = '' then raise exception 'POST_VUOTO'; end if;
  if not exists (select 1 from photos where id = p_photo) then raise exception 'FOTO_NON_TROVATA'; end if;
  insert into photo_comments(photo_id, author, body) values (p_photo, _clean(p_author, 30), b) returning id into new_id;
  return new_id;
end $$;

create or replace function photo_vote(p_pw text, p_photo uuid, p_name text, p_val int) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30); prima smallint;
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if p_val is null or p_val not in (1, -1) then raise exception 'VOTO_NON_VALIDO'; end if;
  if not exists (select 1 from photos where id = p_photo) then raise exception 'FOTO_NON_TROVATA'; end if;
  select val into prima from photo_votes where photo_id = p_photo and lower(name) = lower(n);
  delete from photo_votes where photo_id = p_photo and lower(name) = lower(n);
  if prima is not distinct from p_val::smallint then return 0; end if;
  insert into photo_votes(photo_id, name, val) values (p_photo, n, p_val) on conflict (photo_id, name) do update set val = excluded.val;
  return p_val;
end $$;

create or replace function photo_comment_del(p_pw text, p_id uuid, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from photo_comments where id = p_id and author = p_author;
end $$;

create or replace function photo_del(p_pw text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from photos where id = p_id;
end $$;

create or replace function album_del(p_pw text, p_album uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  if exists (select 1 from photos where album_id = p_album) then raise exception 'ALBUM_NON_VUOTO'; end if;
  delete from albums where id = p_album;
end $$;

-- ---------- SONDAGGI ----------
create or replace function _poll_json(p_id uuid) returns json
language sql stable security definer set search_path = public, extensions as $$
  select json_build_object('id', p.id, 'author', p.author, 'question', p.question, 'multi', p.multi, 'closed', p.closed, 'created_at', p.created_at,
    'options', coalesce((select json_agg(json_build_object('id', o.id, 'label', o.label,
        'voters', coalesce((select json_agg(v.name order by v.created_at) from poll_votes v where v.option_id = o.id), '[]'::json)) order by o.pos)
      from poll_options o where o.poll_id = p.id), '[]'::json))
  from polls p where p.id = p_id;
$$;

create or replace function polls_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(_poll_json(x.id) order by x.created_at desc)
    from (select id, created_at from polls order by created_at desc limit 100) x), '[]'::json);
end $$;

create or replace function poll_create(p_pw text, p_author text, p_question text, p_options text[], p_multi boolean) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; q text := _clean(p_question, 200); opts text[]; o text; i int := 0;
begin
  perform _need(p_pw);
  if q = '' then raise exception 'DOMANDA_VUOTA'; end if;
  select array_agg(t order by k) into opts from (
    select distinct on (lower(_clean(t, 100))) _clean(t, 100) as t, k
    from unnest(coalesce(p_options, '{}')) with ordinality as u(t, k)
    where _clean(t, 100) <> '' order by lower(_clean(t, 100)), k) z;
  if coalesce(array_length(opts, 1), 0) < 2 then raise exception 'SERVONO_2_RISPOSTE'; end if;
  if array_length(opts, 1) > 12 then raise exception 'TROPPE_RISPOSTE'; end if;
  insert into polls(author, question, multi) values (_clean(p_author, 30), q, coalesce(p_multi, false)) returning id into new_id;
  foreach o in array opts loop
    i := i + 1; insert into poll_options(poll_id, pos, label) values (new_id, i, o);
  end loop;
  return new_id;
end $$;

-- tocco su una risposta: la mette o la toglie (con risposta unica, toglie le altre). Restituisce il sondaggio aggiornato
create or replace function poll_vote(p_pw text, p_poll uuid, p_option uuid, p_name text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30); pl polls%rowtype;
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  select * into pl from polls where id = p_poll;
  if not found then raise exception 'SONDAGGIO_NON_TROVATO'; end if;
  if pl.closed then raise exception 'SONDAGGIO_CHIUSO'; end if;
  if not exists (select 1 from poll_options where id = p_option and poll_id = p_poll) then raise exception 'SONDAGGIO_NON_TROVATO'; end if;
  if exists (select 1 from poll_votes where option_id = p_option and lower(name) = lower(n)) then
    delete from poll_votes where option_id = p_option and lower(name) = lower(n);
  else
    if not pl.multi then delete from poll_votes where poll_id = p_poll and lower(name) = lower(n); end if;
    insert into poll_votes(poll_id, option_id, name) values (p_poll, p_option, n) on conflict do nothing;
  end if;
  return _poll_json(p_poll);
end $$;

create or replace function poll_close(p_pw text, p_poll uuid, p_author text, p_closed boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  update polls set closed = coalesce(p_closed, true) where id = p_poll and author = p_author;
end $$;

create or replace function poll_del(p_pw text, p_poll uuid, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from polls where id = p_poll and author = p_author;
end $$;

-- ---------- SECRET SANTA ----------
create or replace function ss_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(x order by x.created_at desc) from (
    select e.id, e.name, e.budget, e.gift_date, e.organizer, e.status, e.drawn_at, e.created_at,
      coalesce((select json_agg(p.name order by lower(p.name)) from ss_people p where p.event_id = e.id), '[]'::json) as people,
      coalesce((select json_agg(json_build_array(x.a, x.b)) from ss_excl x where x.event_id = e.id), '[]'::json) as excl
    from ss_events e) x), '[]'::json);
end $$;

create or replace function ss_create(p_pw text, p_name text, p_budget text, p_date text, p_organizer text, p_admin_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  perform _need(p_pw);
  if _clean(p_name,80) = '' then raise exception 'NOME_VUOTO'; end if;
  if coalesce(p_admin_pin,'') !~ '^[0-9]{4,8}$' then raise exception 'PIN_NON_VALIDO'; end if;
  insert into ss_events(name, budget, gift_date, organizer, admin_pin)
  values (_clean(p_name,80), _clean(p_budget,40), _clean(p_date,40), _clean(p_organizer,30), extensions.crypt(p_admin_pin, extensions.gen_salt('bf')))
  returning id into new_id;
  return new_id;
end $$;

create or replace function _ss_admin(p_event uuid, p_admin_pin text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from ss_events where id = p_event and admin_pin = extensions.crypt(coalesce(p_admin_pin,''), admin_pin)) then
    raise exception 'PIN_ORGANIZZATORE_ERRATO';
  end if;
end $$;

-- iscrizione: nome + PIN personale (se il nome c'è già, serve lo stesso PIN)
create or replace function ss_join(p_pw text, p_event uuid, p_name text, p_pin text, p_wish text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name,30); ex ss_people%rowtype; st text;
begin
  perform _need(p_pw);
  select status into st from ss_events where id = p_event;
  if st is null then raise exception 'EVENTO_NON_TROVATO'; end if;
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if coalesce(p_pin,'') !~ '^[0-9]{4,8}$' then raise exception 'PIN_NON_VALIDO'; end if;
  select * into ex from ss_people where event_id = p_event and lower(name) = lower(n);
  if found then
    if ex.pin <> extensions.crypt(p_pin, ex.pin) then raise exception 'NOME_GIA_PRESO'; end if;
    update ss_people set wish = _clean(p_wish,1000) where id = ex.id;
  else
    if st <> 'open' then raise exception 'SORTEGGIO_GIA_FATTO'; end if;
    insert into ss_people(event_id, name, pin, wish) values (p_event, n, extensions.crypt(p_pin, extensions.gen_salt('bf')), _clean(p_wish,1000));
  end if;
end $$;

create or replace function ss_leave(p_pw text, p_event uuid, p_name text, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare ex ss_people%rowtype;
begin
  perform _need(p_pw);
  if (select status from ss_events where id = p_event) <> 'open' then raise exception 'SORTEGGIO_GIA_FATTO'; end if;
  select * into ex from ss_people where event_id = p_event and lower(name) = lower(_clean(p_name,30));
  if not found or ex.pin <> extensions.crypt(coalesce(p_pin,''), ex.pin) then raise exception 'PIN_ERRATO'; end if;
  delete from ss_people where id = ex.id;
  delete from ss_excl where event_id = p_event and (a = ex.name or b = ex.name);
end $$;

-- l'organizzatore toglie qualcuno (prima del sorteggio)
create or replace function ss_kick(p_pw text, p_event uuid, p_admin_pin text, p_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw); perform _ss_admin(p_event, p_admin_pin);
  if (select status from ss_events where id = p_event) <> 'open' then raise exception 'SORTEGGIO_GIA_FATTO'; end if;
  delete from ss_excl where event_id = p_event
    and (a in (select name from ss_people where event_id = p_event and lower(name) = lower(p_name))
      or b in (select name from ss_people where event_id = p_event and lower(name) = lower(p_name)));
  delete from ss_people where event_id = p_event and lower(name) = lower(p_name);
end $$;

create or replace function ss_set_excl(p_pw text, p_event uuid, p_admin_pin text, p_pairs json) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare it json;
begin
  perform _need(p_pw); perform _ss_admin(p_event, p_admin_pin);
  if (select status from ss_events where id = p_event) <> 'open' then raise exception 'SORTEGGIO_GIA_FATTO'; end if;
  delete from ss_excl where event_id = p_event;
  for it in select * from json_array_elements(coalesce(p_pairs,'[]'::json)) loop
    if (it->>0) is not null and (it->>1) is not null and (it->>0) <> (it->>1) then
      insert into ss_excl(event_id, a, b) values (p_event, least(it->>0, it->>1), greatest(it->>0, it->>1)) on conflict do nothing;
    end if;
  end loop;
end $$;

-- sorteggio: un'unica catena (A→B→C→…→A), nessuno a se stesso, rispetta le esclusioni
create or replace function ss_draw(p_pw text, p_event uuid, p_admin_pin text) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare ids uuid[]; nms text[]; n int; ord int[]; tries int := 0; ok boolean; i int; g int; r int;
begin
  perform _need(p_pw); perform _ss_admin(p_event, p_admin_pin);
  if (select status from ss_events where id = p_event) <> 'open' then raise exception 'SORTEGGIO_GIA_FATTO'; end if;
  select array_agg(id order by id), array_agg(name order by id) into ids, nms from ss_people where event_id = p_event;
  n := coalesce(array_length(ids,1),0);
  if n < 3 then raise exception 'SERVONO_ALMENO_3'; end if;
  loop
    tries := tries + 1;
    select array_agg(x order by random()) into ord from generate_series(1, n) x;
    ok := true;
    for i in 1..n loop
      g := ord[i]; r := ord[(i % n) + 1];
      if exists (select 1 from ss_excl where event_id = p_event and a = least(nms[g], nms[r]) and b = greatest(nms[g], nms[r])) then
        ok := false; exit;
      end if;
    end loop;
    exit when ok;
    if tries >= 20000 then raise exception 'ESCLUSIONI_IMPOSSIBILI'; end if;
  end loop;
  delete from ss_pairs where event_id = p_event;
  for i in 1..n loop
    insert into ss_pairs(event_id, giver, receiver) values (p_event, ids[ord[i]], ids[ord[(i % n) + 1]]);
  end loop;
  update ss_events set status = 'drawn', drawn_at = now() where id = p_event;
  return n;
end $$;

-- controlla il PIN dell'organizzatore (per sbloccare l'area organizzatore)
create or replace function ss_admin_check(p_pw text, p_event uuid, p_admin_pin text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return exists (select 1 from ss_events where id = p_event and admin_pin = extensions.crypt(coalesce(p_admin_pin,''), admin_pin));
end $$;

-- chi ha dimenticato il PIN: l'organizzatore gliene imposta uno nuovo (senza vedere gli abbinamenti)
create or replace function ss_reset_pin(p_pw text, p_event uuid, p_admin_pin text, p_name text, p_new_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw); perform _ss_admin(p_event, p_admin_pin);
  if coalesce(p_new_pin,'') !~ '^[0-9]{4,8}$' then raise exception 'PIN_NON_VALIDO'; end if;
  update ss_people set pin = extensions.crypt(p_new_pin, extensions.gen_salt('bf'))
   where event_id = p_event and lower(name) = lower(_clean(p_name,30));
  if not found then raise exception 'NOME_NON_TROVATO'; end if;
end $$;

-- annulla il sorteggio (per rifarlo)
create or replace function ss_undo(p_pw text, p_event uuid, p_admin_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw); perform _ss_admin(p_event, p_admin_pin);
  delete from ss_pairs where event_id = p_event;
  update ss_events set status = 'open', drawn_at = null where id = p_event;
end $$;

create or replace function ss_event_del(p_pw text, p_event uuid, p_admin_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw); perform _ss_admin(p_event, p_admin_pin);
  delete from ss_events where id = p_event;
end $$;

-- ognuno vede SOLO a chi fa il regalo (con nome + PIN)
create or replace function ss_reveal(p_pw text, p_event uuid, p_name text, p_pin text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare me ss_people%rowtype; rec ss_people%rowtype;
begin
  perform _need(p_pw);
  select * into me from ss_people where event_id = p_event and lower(name) = lower(_clean(p_name,30));
  if not found or me.pin <> extensions.crypt(coalesce(p_pin,''), me.pin) then raise exception 'PIN_ERRATO'; end if;
  select r.* into rec from ss_pairs s join ss_people r on r.id = s.receiver where s.event_id = p_event and s.giver = me.id;
  if not found then return json_build_object('drawn', false, 'me', me.name, 'my_wish', me.wish); end if;
  return json_build_object('drawn', true, 'me', me.name, 'to', rec.name, 'wish', rec.wish, 'my_wish', me.wish);
end $$;

-- verifica pubblica: controlla che il sorteggio sia valido SENZA rivelare le coppie
create or replace function ss_check(p_pw text, p_event uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare n int; np int; self int; dup int; excl int; cyc int; cur uuid; start uuid; steps int := 0;
begin
  perform _need(p_pw);
  select count(*) into n from ss_people where event_id = p_event;
  select count(*) into np from ss_pairs where event_id = p_event;
  select count(*) into self from ss_pairs where event_id = p_event and giver = receiver;
  select count(*) - count(distinct receiver) into dup from ss_pairs where event_id = p_event;
  select count(*) into excl from ss_pairs s join ss_people g on g.id = s.giver join ss_people r on r.id = s.receiver
    join ss_excl x on x.event_id = s.event_id and x.a = least(g.name, r.name) and x.b = greatest(g.name, r.name)
    where s.event_id = p_event;
  select giver into start from ss_pairs where event_id = p_event limit 1;
  cur := start;
  if start is not null then
    loop
      select receiver into cur from ss_pairs where event_id = p_event and giver = cur;
      steps := steps + 1;
      exit when cur = start or steps > n + 1 or cur is null;
    end loop;
  end if;
  return json_build_object('people', n, 'pairs', np, 'self', self, 'dup_receivers', dup, 'excluded_pairs', excl,
    'single_chain', (steps = n and cur = start),
    'ok', (np = n and self = 0 and dup = 0 and excl = 0 and steps = n and cur = start));
end $$;

-- ---------- permessi ----------
revoke all on all tables in schema public from anon, authenticated;
grant execute on function check_pw, members_list, member_add, presenza, admin_check, member_kick, stories_list, story_add, story_seen, story_del, story_comments, story_comment_add, story_comment_del, feed, post_add, post_del, post_like, post_vote, post_thread,
  reply_add, reply_del, albums_list, album_create,
  album_photos, photo_add, photo_del, album_del, photo_comments, photo_comment_add, photo_comment_del, photo_vote,
  polls_list, poll_create, poll_vote, poll_close, poll_del, ss_list, ss_create, ss_join, ss_leave, ss_kick, ss_set_excl,
  ss_draw, ss_undo, ss_event_del, ss_reveal, ss_check, ss_admin_check, ss_reset_pin to anon, authenticated;
revoke execute on function _ok, _need, _ss_admin, _poll_json, _admin_ok from anon, authenticated;
revoke execute on function _ok, _need, _ss_admin, _poll_json, _admin_ok from public;
