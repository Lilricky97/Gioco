-- ============================================================
--  PIPPEGHI 24/7 – INSTALLAZIONE COMPLETA (copia tutto, incolla nel SQL Editor di Supabase, Run)
--  = schema.sql + storage.sql + progetto.sql. Si può rieseguire senza problemi (non cancella niente).
-- ============================================================

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
alter table members add column if not exists avatar text;   -- foto utente (percorso nello spazio foto: avatar/<uuid>.jpg)

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

-- Secret Santa: aggiunte (sorteggio n°, blocchi PIN, lettere finte, chi ha guardato, ritardatari, regalo preso, anno prima)
alter table ss_events add column if not exists draw_no int not null default 0;
alter table ss_events add column if not exists prev_event uuid;
alter table ss_events add column if not exists admin_fail int not null default 0;
alter table ss_events add column if not exists admin_lock timestamptz;
alter table ss_people add column if not exists code text;
alter table ss_people add column if not exists pending boolean not null default false;
alter table ss_people add column if not exists seen_draw int not null default 0;
alter table ss_people add column if not exists seen_at timestamptz;
alter table ss_people add column if not exists changed_at timestamptz;
alter table ss_people add column if not exists bought boolean not null default false;
alter table ss_people add column if not exists pin_fail int not null default 0;
alter table ss_people add column if not exists pin_lock timestamptz;
update ss_events set draw_no = 1 where status = 'drawn' and draw_no = 0;

create table if not exists group_couples (       -- coppie del gruppo: escluse in automatico da ogni Secret Santa
  a text not null, b text not null,
  primary key (a, b)
);

create table if not exists ss_log (              -- diario del Secret Santa (visibile a tutti)
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references ss_events(id) on delete cascade,
  at timestamptz not null default now(),
  msg text not null
);

create table if not exists ss_questions (        -- domande anonime di chi regala al suo destinatario
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references ss_events(id) on delete cascade,
  giver uuid not null references ss_people(id) on delete cascade,
  receiver uuid not null references ss_people(id) on delete cascade,
  question text not null,
  answer text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists events (             -- calendario: cene, feste, serate
  id uuid primary key default gen_random_uuid(),
  author text not null,
  title text not null,
  place text not null default '',
  body text not null default '',
  day date,                                      -- null = data ancora da votare ("scegliamo la data insieme")
  ora time,                                      -- facoltativa
  cover text,                                    -- foto di copertina: eventi/<uuid>.jpg
  created_at timestamptz not null default now()
);

create table if not exists event_rsvp (         -- Ci sono / Forse / Non ci sono
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  ans text not null check (ans in ('si', 'forse', 'no')),
  created_at timestamptz not null default now(),
  primary key (event_id, name)
);
create unique index if not exists event_rsvp_nome on event_rsvp(event_id, lower(name));

create table if not exists event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists event_dates (        -- date proposte (votazione)
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  pos int not null,
  day date not null,
  ora time
);

create table if not exists event_date_votes (
  date_id uuid not null references event_dates(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (date_id, name)
);

create table if not exists push_subs (          -- telefoni che vogliono le notifiche
  endpoint text primary key,                     -- indirizzo di notifica dato dal telefono (Apple/Google/Mozilla)
  name text not null,
  p256dh text not null,
  auth text not null,
  kinds text[] not null default '{storie,post,eventi}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notif_queue (        -- "cassetta delle lettere" delle notifiche da mandare
  id bigint generated always as identity primary key,
  kind text not null,                            -- storie / post / eventi
  author text not null default '',               -- chi l'ha fatto (non riceve la sua notifica)
  title text not null,
  body text not null default '',
  url text not null default '',                  -- dove porta il tocco, es. #post/<id>
  event_id uuid,                                 -- promemoria: chi ha detto "Non ci sono" non lo riceve
  created_at timestamptz not null default now(),
  sent_at timestamptz
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
alter table group_couples enable row level security;
alter table ss_log       enable row level security;
alter table ss_questions enable row level security;
alter table events           enable row level security;
alter table event_rsvp       enable row level security;
alter table event_comments   enable row level security;
alter table event_dates      enable row level security;
alter table event_date_votes enable row level security;
alter table push_subs        enable row level security;
alter table notif_queue      enable row level security;
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
      'online', coalesce(last_seen > now() - interval '150 seconds', false) and not banned, 'banned', banned, 'avatar', avatar) order by last_seen desc nulls last, lower(name)) from members), '[]'::json);
end $$;

-- foto utente: { "Nome": "avatar/<uuid>.jpg", ... } (per la schermata "Chi sei?")
create or replace function avatars_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_object_agg(name, avatar) from members where avatar is not null and not banned), '{}'::json);
end $$;

-- mette (o toglie, con p_path null) la foto utente
create or replace function member_avatar(p_pw text, p_name text, p_path text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30);
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if p_path is not null and p_path !~ '^avatar/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then raise exception 'FOTO_NON_VALIDA'; end if;
  if exists (select 1 from members where lower(name) = lower(n) and banned) then raise exception 'SEI_STATO_RIMOSSO'; end if;
  update members set avatar = p_path where lower(name) = lower(n);
  if not found then insert into members(name, avatar) values (n, p_path); end if;
  return json_build_object('ok', true, 'avatar', p_path);
end $$;

-- PIN amministratore con blocco (5 errori → 15 minuti): null se giusto, altrimenti il codice d'errore
create or replace function _admin_try(p_admin text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare f int; l timestamptz;
begin
  if not exists (select 1 from app_config where k = 'admin') then return 'ADMIN_NON_IMPOSTATO'; end if;
  select v::timestamptz into l from app_config where k = 'admin_lock';
  if l is not null and l > now() then return 'PIN_BLOCCATO'; end if;
  if _admin_ok(p_admin) then delete from app_config where k = 'admin_fail'; return null; end if;
  f := coalesce((select v::int from app_config where k = 'admin_fail'), 0) + 1;
  if f >= 5 then
    insert into app_config(k, v) values ('admin_lock', (now() + interval '15 minutes')::text) on conflict (k) do update set v = excluded.v;
    delete from app_config where k = 'admin_fail';
    return 'PIN_BLOCCATO';
  end if;
  insert into app_config(k, v) values ('admin_fail', f::text) on conflict (k) do update set v = excluded.v;
  return 'PIN_ADMIN_ERRATO';
end $$;

-- amministratore: controlla il PIN (set = esiste un PIN, ok = è giusto, err = sbagliato/bloccato)
create or replace function admin_check(p_pw text, p_admin text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare e text;
begin
  perform _need(p_pw);
  e := _admin_try(p_admin);
  return json_build_object('set', e is distinct from 'ADMIN_NON_IMPOSTATO', 'ok', e is null, 'err', e);
end $$;

-- rimuove (p_ban = true) o riammette (false) una persona; i suoi post restano
drop function if exists member_kick(text, text, text, boolean);
create or replace function member_kick(p_pw text, p_admin text, p_name text, p_ban boolean) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare e text;
begin
  perform _need(p_pw);
  e := _admin_try(p_admin); if e is not null then return json_build_object('err', e); end if;
  update members set banned = coalesce(p_ban, true) where lower(name) = lower(_clean(p_name, 30));
  if not found then raise exception 'NOME_NON_TROVATO'; end if;
  return json_build_object('ok', true);
end $$;

-- coppie del gruppo: le vede chiunque è entrato, le cambia solo l'amministratore.
-- Ogni Secret Santa le esclude in automatico (non si pescano a vicenda)
create or replace function couples_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(json_build_array(a, b) order by lower(a), lower(b)) from group_couples), '[]'::json);
end $$;

create or replace function couples_set(p_pw text, p_admin text, p_pairs json) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare e text; it json; x text; y text;
begin
  perform _need(p_pw);
  e := _admin_try(p_admin); if e is not null then return json_build_object('err', e); end if;
  delete from group_couples where true;   -- "where true": Supabase blocca le DELETE senza WHERE
  for it in select * from json_array_elements(coalesce(p_pairs, '[]'::json)) loop
    x := _clean(it->>0, 30); y := _clean(it->>1, 30);
    if x <> '' and y <> '' and lower(x) <> lower(y) and not exists (select 1 from group_couples
         where (lower(a) = lower(x) and lower(b) = lower(y)) or (lower(a) = lower(y) and lower(b) = lower(x))) then
      insert into group_couples(a, b) values (case when lower(x) <= lower(y) then x else y end, case when lower(x) <= lower(y) then y else x end);
    end if;
  end loop;
  return json_build_object('ok', true);
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
-- Regola d'oro: tutto a caso come dal cappello, ognuno fa UN regalo e ne riceve UNO,
-- nessuno pesca se stesso, le coppie (del gruppo e dell'evento) non si pescano a vicenda.
-- Le funzioni che controllano un PIN restituiscono {"err": ...} invece di "lanciare" l'errore:
-- così il conteggio dei tentativi sbagliati resta salvato (dopo 5 errori: blocco di 15 minuti).

-- funzioni che cambiano il tipo di risultato: si tolgono le versioni vecchie
drop function if exists ss_create(text, text, text, text, text, text);
drop function if exists ss_join(text, uuid, text, text, text);
drop function if exists ss_leave(text, uuid, text, text);
drop function if exists ss_kick(text, uuid, text, text);
drop function if exists ss_set_excl(text, uuid, text, json);
drop function if exists ss_draw(text, uuid, text);
drop function if exists ss_admin_check(text, uuid, text);
drop function if exists ss_reset_pin(text, uuid, text, text, text);
drop function if exists ss_undo(text, uuid, text);
drop function if exists ss_event_del(text, uuid, text);

-- numeri casuali "veri" (crittografici, pgcrypto): mescola 1..n senza sbilanciamenti
create or replace function _rnd(k int) returns int
language plpgsql volatile set search_path = public, extensions as $$
declare b bytea; x bigint; lim bigint;
begin
  if k <= 1 then return 0; end if;
  lim := 4294967296 - (4294967296 % k);
  loop
    b := extensions.gen_random_bytes(4);
    x := (get_byte(b,0)::bigint << 24) | (get_byte(b,1)::bigint << 16) | (get_byte(b,2)::bigint << 8) | get_byte(b,3)::bigint;
    exit when x < lim;
  end loop;
  return (x % k)::int;
end $$;

create or replace function _shuffle(n int) returns int[]
language plpgsql volatile set search_path = public, extensions as $$
declare a int[]; b bytea; i int; j int; t int; x bigint;
begin
  if n < 1 then return '{}'; end if;
  a := array(select generate_series(1, n));
  b := extensions.gen_random_bytes(4 * n);
  for i in reverse n..2 loop
    x := (get_byte(b,4*i-4)::bigint << 24) | (get_byte(b,4*i-3)::bigint << 16) | (get_byte(b,4*i-2)::bigint << 8) | get_byte(b,4*i-1)::bigint;
    if x < 4294967296 - (4294967296 % i) then j := (x % i)::int + 1; else j := _rnd(i) + 1; end if;
    t := a[i]; a[i] := a[j]; a[j] := t;
  end loop;
  return a;
end $$;

-- lettera finta n° k (0 → A, 25 → Z, 26 → AA, 27 → AB …)
create or replace function _ss_code(k int) returns text
language sql immutable as $$
  select case when k < 26 then chr(65 + k) else chr(65 + k / 26 - 1) || chr(65 + k % 26) end
$$;

create or replace function _ss_log(p_event uuid, p_msg text) returns void
language sql security definer set search_path = public, extensions as $$
  insert into ss_log(event_id, msg) values (p_event, left(p_msg, 300));
$$;

-- chi NON può regalare a chi: matrice n×n "appiattita" (riga = chi regala, colonna = chi riceve)
-- vietati: se stesso, coppie del gruppo, esclusioni dell'evento (in tutte e due le direzioni)
-- e, se con_prev, gli stessi abbinamenti del Secret Santa dell'anno prima (solo in quella direzione)
create or replace function _ss_vietati(p_event uuid, nms text[], con_prev boolean) returns boolean[]
language plpgsql stable security definer set search_path = public, extensions as $$
declare n int := coalesce(array_length(nms, 1), 0); m boolean[]; ln text[]; i int; ia int; ib int; r record; pe uuid;
begin
  if n = 0 then return '{}'; end if;
  m := array_fill(false, array[n * n]);
  ln := array(select lower(x) from unnest(nms) with ordinality as u(x, k) order by k);
  for i in 1..n loop m[(i - 1) * n + i] := true; end loop;
  for r in select lower(a) as a, lower(b) as b from group_couples
           union select lower(a), lower(b) from ss_excl where event_id = p_event loop
    ia := array_position(ln, r.a); ib := array_position(ln, r.b);
    if ia is not null and ib is not null then m[(ia - 1) * n + ib] := true; m[(ib - 1) * n + ia] := true; end if;
  end loop;
  if con_prev then
    select prev_event into pe from ss_events where id = p_event;
    if pe is not null then
      for r in select lower(g.name) as a, lower(rc.name) as b from ss_pairs s
               join ss_people g on g.id = s.giver join ss_people rc on rc.id = s.receiver where s.event_id = pe loop
        ia := array_position(ln, r.a); ib := array_position(ln, r.b);
        if ia is not null and ib is not null then m[(ia - 1) * n + ib] := true; end if;
      end loop;
    end if;
  end if;
  return m;
end $$;

-- esiste almeno un sorteggio valido? (abbinamento completo tra chi regala e chi riceve, percorsi aumentanti)
-- restituisce {"ok":true,"p":[...]} con un abbinamento valido (in ordine casuale), oppure {"ok":false,"chi":[indici]}
-- dove "chi" sono le persone che insieme hanno troppe esclusioni
create or replace function _ss_match(n int, m boolean[]) returns json
language plpgsql volatile set search_path = public, extensions as $$
declare ml int[]; mr int[]; par int[]; vis boolean[]; q int[]; ordg int[]; ordr int[];
  s int; si int; head int; u int; v int; k int; x int; y int; libero int; chi int[];
begin
  ml := array_fill(0, array[n]); mr := array_fill(0, array[n]);
  ordg := _shuffle(n); ordr := _shuffle(n);
  for si in 1..n loop
    s := ordg[si];
    par := array_fill(0, array[n]); vis := array_fill(false, array[n]);
    q := array[s]; vis[s] := true; head := 1; libero := 0;
    while head <= array_length(q, 1) and libero = 0 loop
      u := q[head]; head := head + 1;
      for k in 1..n loop
        v := ordr[k];
        if not m[(u - 1) * n + v] and par[v] = 0 then
          par[v] := u;
          if mr[v] = 0 then libero := v; exit; end if;
          if not vis[mr[v]] then vis[mr[v]] := true; q := q || mr[v]; end if;
        end if;
      end loop;
    end loop;
    if libero = 0 then
      chi := array(select i from generate_series(1, n) i where vis[i]);
      return json_build_object('ok', false, 'chi', chi);
    end if;
    v := libero;
    loop
      x := par[v]; y := ml[x];
      ml[x] := v; mr[v] := x;
      exit when x = s;
      v := y;
    end loop;
  end loop;
  return json_build_object('ok', true, 'p', ml);
end $$;

-- il cappello: ripesca tutto finché nessuno ha pescato se stesso o qualcuno di vietato.
-- Ogni sorteggio valido ha la stessa probabilità. Se dopo 3000 volte non esce (casi rarissimi,
-- con tantissime esclusioni) usa l'abbinamento valido trovato da _ss_match.
create or replace function _ss_cappello(n int, m boolean[], riserva int[]) returns int[]
language plpgsql volatile set search_path = public, extensions as $$
declare p int[]; ok boolean; t int; i int;
begin
  for t in 1..3000 loop
    p := _shuffle(n); ok := true;
    for i in 1..n loop
      if m[(i - 1) * n + p[i]] then ok := false; exit; end if;
    end loop;
    if ok then return p; end if;
  end loop;
  return riserva;
end $$;

-- nuove lettere finte, mescolate a caso (non seguono l'ordine di iscrizione)
create or replace function _ss_lettere(p_event uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare ids uuid[]; c int[]; i int;
begin
  update ss_people set code = null where event_id = p_event;
  select array_agg(id order by id) into ids from ss_people where event_id = p_event and not pending
    and id in (select giver from ss_pairs where event_id = p_event);
  if ids is null then return; end if;
  c := _shuffle(array_length(ids, 1));
  for i in 1..array_length(ids, 1) loop
    update ss_people set code = _ss_code(c[i] - 1) where id = ids[i];
  end loop;
end $$;

-- Secret Santa già sorteggiati col sistema vecchio: assegna le lettere finte
do $$ declare e uuid; begin
  for e in select distinct s.event_id from ss_pairs s join ss_people p on p.id = s.giver where p.code is null loop
    perform _ss_lettere(e);
  end loop;
end $$;

-- PIN personale con blocco: {"id":...} se giusto, {"err":"PIN_ERRATO"|"PIN_BLOCCATO"} se no
create or replace function _ss_pin(p_event uuid, p_name text, p_pin text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare me ss_people%rowtype;
begin
  select * into me from ss_people where event_id = p_event and lower(name) = lower(_clean(p_name, 30)) for update;
  if not found then return json_build_object('err', 'PIN_ERRATO'); end if;
  if me.pin_lock is not null and me.pin_lock > now() then return json_build_object('err', 'PIN_BLOCCATO'); end if;
  if me.pin <> extensions.crypt(coalesce(p_pin, ''), me.pin) then
    if me.pin_fail + 1 >= 5 then
      update ss_people set pin_fail = 0, pin_lock = now() + interval '15 minutes' where id = me.id;
      return json_build_object('err', 'PIN_BLOCCATO');
    end if;
    update ss_people set pin_fail = pin_fail + 1 where id = me.id;
    return json_build_object('err', 'PIN_ERRATO');
  end if;
  if me.pin_fail > 0 then update ss_people set pin_fail = 0 where id = me.id; end if;
  return json_build_object('id', me.id, 'name', me.name);
end $$;

-- PIN organizzatore con blocco: null se giusto, altrimenti il codice d'errore
create or replace function _ss_adm(p_event uuid, p_admin_pin text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype;
begin
  select * into ev from ss_events where id = p_event;
  if not found then return 'EVENTO_NON_TROVATO'; end if;
  if ev.admin_lock is not null and ev.admin_lock > now() then return 'PIN_BLOCCATO'; end if;
  if ev.admin_pin <> extensions.crypt(coalesce(p_admin_pin, ''), ev.admin_pin) then
    if ev.admin_fail + 1 >= 5 then
      update ss_events set admin_fail = 0, admin_lock = now() + interval '15 minutes' where id = p_event;
      return 'PIN_BLOCCATO';
    end if;
    update ss_events set admin_fail = admin_fail + 1 where id = p_event;
    return 'PIN_ORGANIZZATORE_ERRATO';
  end if;
  if ev.admin_fail > 0 then update ss_events set admin_fail = 0 where id = p_event; end if;
  return null;
end $$;

create or replace function ss_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(x order by x.created_at desc) from (
    select e.id, e.name, e.budget, e.gift_date, e.organizer, e.status, e.drawn_at, e.created_at, e.draw_no, e.prev_event,
      (select p.name from ss_events p where p.id = e.prev_event) as prev_name,
      coalesce((select json_agg(p.name order by lower(p.name)) from ss_people p where p.event_id = e.id and not p.pending), '[]'::json) as people,
      coalesce((select json_agg(p.name order by p.created_at) from ss_people p where p.event_id = e.id and p.pending), '[]'::json) as pending,
      coalesce((select json_agg(json_build_array(x.a, x.b)) from ss_excl x where x.event_id = e.id), '[]'::json) as excl,
      coalesce((select json_agg(json_build_object('at', l.at, 'msg', l.msg) order by l.at desc)
        from (select at, msg from ss_log where event_id = e.id order by at desc limit 30) l), '[]'::json) as log
    from ss_events e) x), '[]'::json);
end $$;

create or replace function ss_create(p_pw text, p_name text, p_budget text, p_date text, p_organizer text, p_admin_pin text, p_prev uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; pn text;
begin
  perform _need(p_pw);
  if _clean(p_name, 80) = '' then raise exception 'NOME_VUOTO'; end if;
  if coalesce(p_admin_pin, '') !~ '^[0-9]{4,8}$' then raise exception 'PIN_NON_VALIDO'; end if;
  if p_prev is not null then
    select name into pn from ss_events where id = p_prev and status = 'drawn';
    if pn is null then raise exception 'EVENTO_NON_TROVATO'; end if;
  end if;
  insert into ss_events(name, budget, gift_date, organizer, admin_pin, prev_event)
  values (_clean(p_name, 80), _clean(p_budget, 40), _clean(p_date, 40), _clean(p_organizer, 30),
          extensions.crypt(p_admin_pin, extensions.gen_salt('bf')), p_prev)
  returning id into new_id;
  if p_prev is not null then
    insert into ss_excl(event_id, a, b) select new_id, a, b from ss_excl where event_id = p_prev on conflict do nothing;
    perform _ss_log(new_id, 'Creato da ' || _clean(p_organizer, 30) || ' come seguito di «' || pn || '»: nessuno ripescherà la stessa persona dell''anno prima');
  else
    perform _ss_log(new_id, 'Creato da ' || _clean(p_organizer, 30));
  end if;
  return new_id;
end $$;

-- iscrizione: nome + PIN personale (se il nome c'è già serve lo stesso PIN: così si aggiorna la letterina).
-- Dopo il sorteggio ci si può solo "mettere in attesa": poi l'organizzatore fa entrare (ss_admit)
create or replace function ss_join(p_pw text, p_event uuid, p_name text, p_pin text, p_wish text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30); ev ss_events%rowtype; ex ss_people%rowtype; r json;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  if not found then raise exception 'EVENTO_NON_TROVATO'; end if;
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,8}$' then raise exception 'PIN_NON_VALIDO'; end if;
  select * into ex from ss_people where event_id = p_event and lower(name) = lower(n);
  if found then
    r := _ss_pin(p_event, n, p_pin);
    if r->>'err' = 'PIN_ERRATO' then return json_build_object('err', 'NOME_GIA_PRESO'); end if;
    if r->>'err' is not null then return r; end if;
    update ss_people set wish = _clean(p_wish, 1000) where id = ex.id;
    return json_build_object('ok', true, 'me', ex.name, 'pending', ex.pending);
  end if;
  insert into ss_people(event_id, name, pin, wish, pending)
  values (p_event, n, extensions.crypt(p_pin, extensions.gen_salt('bf')), _clean(p_wish, 1000), ev.status <> 'open');
  if ev.status <> 'open' then perform _ss_log(p_event, n || ' chiede di entrare dopo il sorteggio'); end if;
  return json_build_object('ok', true, 'me', n, 'pending', ev.status <> 'open');
end $$;

-- chi si ritira da solo: prima del sorteggio (o se è ancora in attesa). Dopo, lo toglie l'organizzatore
create or replace function ss_leave(p_pw text, p_event uuid, p_name text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype; me ss_people%rowtype; r json;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  if not found then raise exception 'EVENTO_NON_TROVATO'; end if;
  r := _ss_pin(p_event, p_name, p_pin);
  if r->>'err' is not null then return r; end if;
  select * into me from ss_people where id = (r->>'id')::uuid;
  if ev.status <> 'open' and not me.pending then return json_build_object('err', 'CHIEDI_ORGANIZZATORE'); end if;
  delete from ss_excl where event_id = p_event and (lower(a) = lower(me.name) or lower(b) = lower(me.name));
  delete from ss_people where id = me.id;
  if me.pending then perform _ss_log(p_event, me.name || ' ha ritirato la richiesta di entrare'); end if;
  return json_build_object('ok', true);
end $$;

-- i miei dati (senza abbinamento): per entrare col PIN e per la letterina
create or replace function ss_me(p_pw text, p_event uuid, p_name text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare me ss_people%rowtype; r json; st text;
begin
  perform _need(p_pw);
  r := _ss_pin(p_event, p_name, p_pin);
  if r->>'err' is not null then return r; end if;
  select * into me from ss_people where id = (r->>'id')::uuid;
  select status into st from ss_events where id = p_event;
  return json_build_object('me', me.name, 'my_wish', me.wish, 'pending', me.pending, 'bought', me.bought,
    'drawn', st = 'drawn' and exists (select 1 from ss_pairs where event_id = p_event and giver = me.id));
end $$;

-- ognuno vede SOLO a chi fa il regalo (con nome + PIN); segna "ha guardato"
create or replace function ss_reveal(p_pw text, p_event uuid, p_name text, p_pin text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare me ss_people%rowtype; rec ss_people%rowtype; ev ss_events%rowtype; r json; rifatto boolean; cambiato boolean;
begin
  perform _need(p_pw);
  r := _ss_pin(p_event, p_name, p_pin);
  if r->>'err' is not null then return r; end if;
  select * into me from ss_people where id = (r->>'id')::uuid;
  select * into ev from ss_events where id = p_event;
  select rc.* into rec from ss_pairs s join ss_people rc on rc.id = s.receiver where s.event_id = p_event and s.giver = me.id;
  if not found then
    return json_build_object('drawn', false, 'me', me.name, 'my_wish', me.wish, 'pending', me.pending, 'bought', me.bought);
  end if;
  rifatto := me.seen_draw > 0 and me.seen_draw < ev.draw_no;
  cambiato := me.changed_at is not null and me.seen_at is not null and me.changed_at > me.seen_at and not rifatto;
  update ss_people set seen_draw = ev.draw_no, seen_at = now() where id = me.id;
  return json_build_object('drawn', true, 'me', me.name, 'to', rec.name, 'wish', rec.wish, 'my_wish', me.wish,
    'bought', me.bought, 'draw_no', ev.draw_no, 'rifatto', rifatto, 'cambiato', cambiato);
end $$;

-- organizzatore: esclusioni speciali di questo evento (le coppie del gruppo valgono già in automatico)
create or replace function ss_set_excl(p_pw text, p_event uuid, p_admin_pin text, p_pairs json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype; it json; e text;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  if ev.status <> 'open' then raise exception 'SORTEGGIO_GIA_FATTO'; end if;
  delete from ss_excl where event_id = p_event;
  for it in select * from json_array_elements(coalesce(p_pairs, '[]'::json)) loop
    if (it->>0) is not null and (it->>1) is not null and lower(it->>0) <> lower(it->>1) then
      insert into ss_excl(event_id, a, b) values (p_event, least(it->>0, it->>1), greatest(it->>0, it->>1)) on conflict do nothing;
    end if;
  end loop;
  return json_build_object('ok', true);
end $$;

-- IL SORTEGGIO
create or replace function ss_draw(p_pw text, p_event uuid, p_admin_pin text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype; e text; ids uuid[]; nms text[]; n int; m boolean[]; res json; p int[]; i int;
  rilassato boolean := false; chi text;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  if ev.status <> 'open' then raise exception 'SORTEGGIO_GIA_FATTO'; end if;
  update ss_people set pending = false where event_id = p_event and pending;
  select array_agg(id order by id), array_agg(name order by id) into ids, nms from ss_people where event_id = p_event;
  n := coalesce(array_length(ids, 1), 0);
  if n < 3 then raise exception 'SERVONO_ALMENO_3'; end if;
  m := _ss_vietati(p_event, nms, true);
  res := _ss_match(n, m);
  if not (res->>'ok')::boolean and ev.prev_event is not null then
    m := _ss_vietati(p_event, nms, false); rilassato := true;
    res := _ss_match(n, m);
  end if;
  if not (res->>'ok')::boolean then
    select string_agg(nms[x::int], ', ' order by lower(nms[x::int])) into chi from json_array_elements_text(res->'chi') as u(x);
    return json_build_object('err', 'ESCLUSIONI_IMPOSSIBILI', 'chi', chi);
  end if;
  p := _ss_cappello(n, m, array(select x::int from json_array_elements_text(res->'p') with ordinality as u(x, k) order by k));
  delete from ss_questions where event_id = p_event;
  delete from ss_pairs where event_id = p_event;
  for i in 1..n loop
    insert into ss_pairs(event_id, giver, receiver) values (p_event, ids[i], ids[p[i]]);
  end loop;
  update ss_people set changed_at = null, bought = false where event_id = p_event;
  update ss_events set status = 'drawn', drawn_at = now(), draw_no = draw_no + 1 where id = p_event;
  perform _ss_lettere(p_event);
  perform _ss_log(p_event, 'Sorteggio n° ' || (ev.draw_no + 1) || ' fatto (' || n || ' persone)'
    || case when rilassato then ': non è stato possibile evitare tutti gli abbinamenti dell''anno prima' else '' end);
  return json_build_object('ok', true, 'n', n, 'rilassato', rilassato);
end $$;

-- annulla il sorteggio (per rifarlo): finisce nel diario
create or replace function ss_undo(p_pw text, p_event uuid, p_admin_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype; e text;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  delete from ss_questions where event_id = p_event;
  delete from ss_pairs where event_id = p_event;
  update ss_people set code = null, pending = false, changed_at = null where event_id = p_event;
  update ss_events set status = 'open', drawn_at = null where id = p_event;
  if ev.status = 'drawn' then perform _ss_log(p_event, ev.organizer || ' ha annullato il sorteggio n° ' || ev.draw_no); end if;
  return json_build_object('ok', true);
end $$;

-- un ritardatario entra dopo il sorteggio: si sceglie a caso un "biglietto" A→B (meglio se A non ha ancora guardato)
-- e diventa A→Nuovo→B. Cambia l'abbinamento di UNA sola persona (A)
create or replace function ss_admit(p_pw text, p_event uuid, p_admin_pin text, p_name text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype; e text; nu ss_people%rowtype; ids uuid[]; nms text[]; n int; m boolean[]; ni int;
  cand uuid[]; scelto uuid; ricevente uuid; giro int; con_prev boolean;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  select * into nu from ss_people where event_id = p_event and lower(name) = lower(_clean(p_name, 30)) and pending;
  if not found then raise exception 'NOME_NON_TROVATO'; end if;
  if ev.status <> 'drawn' then update ss_people set pending = false where id = nu.id; return json_build_object('ok', true); end if;
  select array_agg(id order by id), array_agg(name order by id) into ids, nms
    from ss_people where event_id = p_event and (not pending or id = nu.id);
  n := array_length(ids, 1); ni := array_position(ids, nu.id);
  for giro in 1..2 loop
    con_prev := giro = 1;
    m := _ss_vietati(p_event, nms, con_prev);
    -- prima chi non ha ancora guardato, poi tutti
    select array_agg(s.giver) into cand from ss_pairs s join ss_people g on g.id = s.giver
      where s.event_id = p_event and g.seen_draw < ev.draw_no
        and not m[(array_position(ids, s.giver) - 1) * n + ni] and not m[(ni - 1) * n + array_position(ids, s.receiver)];
    if cand is null then
      select array_agg(s.giver) into cand from ss_pairs s
        where s.event_id = p_event
          and not m[(array_position(ids, s.giver) - 1) * n + ni] and not m[(ni - 1) * n + array_position(ids, s.receiver)];
    end if;
    exit when cand is not null;
  end loop;
  if cand is null then return json_build_object('err', 'RITARDATARIO_IMPOSSIBILE'); end if;
  scelto := cand[_rnd(array_length(cand, 1)) + 1];
  select receiver into ricevente from ss_pairs where event_id = p_event and giver = scelto;
  update ss_pairs set receiver = nu.id where event_id = p_event and giver = scelto;
  insert into ss_pairs(event_id, giver, receiver) values (p_event, nu.id, ricevente);
  update ss_people set pending = false where id = nu.id;
  update ss_people set changed_at = now(), bought = false where id = scelto;
  delete from ss_questions where event_id = p_event and giver = scelto;
  perform _ss_lettere(p_event);
  perform _ss_log(p_event, nu.name || ' è entrato dopo il sorteggio: è cambiato l''abbinamento di 1 persona');
  return json_build_object('ok', true, 'cambiati', 1);
end $$;

-- l'organizzatore toglie qualcuno. Prima del sorteggio (o se in attesa): via e basta.
-- Dopo: chi regalava a lui regala a chi riceveva da lui (1 persona cambia); se non si può, si scambiano 2 biglietti
create or replace function ss_kick(p_pw text, p_event uuid, p_admin_pin text, p_name text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype; e text; x ss_people%rowtype; pg uuid; qr uuid; ids uuid[]; nms text[]; n int; m boolean[];
  c uuid; d uuid; giro int; cambiati int := 0; r record; trovato boolean := false;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  select * into x from ss_people where event_id = p_event and lower(name) = lower(_clean(p_name, 30));
  if not found then raise exception 'NOME_NON_TROVATO'; end if;
  if ev.status = 'drawn' and not x.pending then
    if (select count(*) from ss_people where event_id = p_event and not pending) <= 3 then raise exception 'SERVONO_ALMENO_3'; end if;
    select giver into pg from ss_pairs where event_id = p_event and receiver = x.id;   -- chi regalava a X
    select receiver into qr from ss_pairs where event_id = p_event and giver = x.id;   -- a chi regalava X
    delete from ss_pairs where event_id = p_event and (giver = x.id or receiver = x.id);
    select array_agg(id order by id), array_agg(name order by id) into ids, nms
      from ss_people where event_id = p_event and not pending and id <> x.id;
    n := array_length(ids, 1);
    for giro in 1..2 loop
      m := _ss_vietati(p_event, nms, giro = 1);
      -- 1) pg regala a qr (cambia solo pg)
      if pg <> qr and not m[(array_position(ids, pg) - 1) * n + array_position(ids, qr)] then
        insert into ss_pairs(event_id, giver, receiver) values (p_event, pg, qr);
        update ss_people set changed_at = now(), bought = false where id = pg;
        delete from ss_questions where event_id = p_event and giver = pg;
        cambiati := 1; trovato := true; exit;
      end if;
      -- 2) scambio con un altro biglietto c→d: pg→d e c→qr (cambiano pg e c)
      for r in select s.giver as c, s.receiver as d from ss_pairs s where s.event_id = p_event order by _rnd(1000000) loop
        if r.c <> pg and r.d <> pg and r.c <> qr and r.d <> qr
           and not m[(array_position(ids, pg) - 1) * n + array_position(ids, r.d)]
           and not m[(array_position(ids, r.c) - 1) * n + array_position(ids, qr)] then
          update ss_pairs set receiver = qr where event_id = p_event and giver = r.c;
          insert into ss_pairs(event_id, giver, receiver) values (p_event, pg, r.d);
          update ss_people set changed_at = now(), bought = false where id in (pg, r.c);
          delete from ss_questions where event_id = p_event and giver in (pg, r.c);
          cambiati := 2; trovato := true; exit;
        end if;
      end loop;
      exit when trovato;
    end loop;
    if not trovato then raise exception 'RITIRO_IMPOSSIBILE'; end if;
  end if;
  delete from ss_excl where event_id = p_event and (lower(a) = lower(x.name) or lower(b) = lower(x.name));
  delete from ss_people where id = x.id;
  if ev.status = 'drawn' then perform _ss_lettere(p_event); end if;
  perform _ss_log(p_event, ev.organizer || ' ha tolto ' || x.name
    || case when cambiati = 1 then ': è cambiato l''abbinamento di 1 persona'
            when cambiati = 2 then ': è cambiato l''abbinamento di 2 persone' else '' end);
  return json_build_object('ok', true, 'cambiati', cambiati);
end $$;

-- controlla il PIN dell'organizzatore (per sbloccare l'area organizzatore)
create or replace function ss_admin_check(p_pw text, p_event uuid, p_admin_pin text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare e text;
begin
  perform _need(p_pw);
  e := _ss_adm(p_event, p_admin_pin);
  if e is not null then return json_build_object('err', e); end if;
  return json_build_object('ok', true);
end $$;

-- chi ha dimenticato il PIN: l'organizzatore gliene imposta uno nuovo (finisce nel diario)
create or replace function ss_reset_pin(p_pw text, p_event uuid, p_admin_pin text, p_name text, p_new_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare ev ss_events%rowtype; e text; nm text;
begin
  perform _need(p_pw);
  select * into ev from ss_events where id = p_event for update;
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  if coalesce(p_new_pin, '') !~ '^[0-9]{4,8}$' then raise exception 'PIN_NON_VALIDO'; end if;
  update ss_people set pin = extensions.crypt(p_new_pin, extensions.gen_salt('bf')), pin_fail = 0, pin_lock = null
   where event_id = p_event and lower(name) = lower(_clean(p_name, 30)) returning name into nm;
  if nm is null then raise exception 'NOME_NON_TROVATO'; end if;
  perform _ss_log(p_event, ev.organizer || ' ha dato un nuovo PIN a ' || nm);
  return json_build_object('ok', true);
end $$;

create or replace function ss_event_del(p_pw text, p_event uuid, p_admin_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare e text;
begin
  perform _need(p_pw);
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  delete from ss_events where id = p_event;
  return json_build_object('ok', true);
end $$;

-- per l'organizzatore: chi ha già guardato e chi ha preso il regalo (MAI gli abbinamenti)
create or replace function ss_status(p_pw text, p_event uuid, p_admin_pin text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare e text; dn int;
begin
  perform _need(p_pw);
  e := _ss_adm(p_event, p_admin_pin); if e is not null then return json_build_object('err', e); end if;
  select draw_no into dn from ss_events where id = p_event;
  return json_build_object('people', coalesce((select json_agg(json_build_object('name', name, 'pending', pending,
      'seen', not pending and seen_draw = dn and dn > 0, 'bought', bought) order by lower(name))
    from ss_people where event_id = p_event), '[]'::json));
end $$;

-- verifica pubblica: controlla che il sorteggio rispetti la regola d'oro SENZA rivelare le coppie
create or replace function ss_check(p_pw text, p_event uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare n int; np int; self int; givers int; receivers int; fuori int; vietate int; ids uuid[]; nms text[]; m boolean[]; r record;
begin
  perform _need(p_pw);
  select array_agg(id order by id), array_agg(name order by id) into ids, nms from ss_people where event_id = p_event and not pending;
  n := coalesce(array_length(ids, 1), 0);
  select count(*), count(*) filter (where giver = receiver), count(distinct giver), count(distinct receiver)
    into np, self, givers, receivers from ss_pairs where event_id = p_event;
  select count(*) into fuori from ss_pairs where event_id = p_event and not (giver = any(coalesce(ids, '{}')) and receiver = any(coalesce(ids, '{}')));
  vietate := 0;
  if n > 0 then
    m := _ss_vietati(p_event, nms, false);
    for r in select giver, receiver from ss_pairs where event_id = p_event loop
      if r.giver = any(ids) and r.receiver = any(ids) and r.giver <> r.receiver
         and m[(array_position(ids, r.giver) - 1) * n + array_position(ids, r.receiver)] then vietate := vietate + 1; end if;
    end loop;
  end if;
  return json_build_object('people', n, 'pairs', np, 'self', self, 'givers', givers, 'receivers', receivers,
    'excluded_pairs', vietate, 'ok', n > 0 and np = n and self = 0 and givers = n and receivers = n and fuori = 0 and vietate = 0);
end $$;

-- tabella di verifica con le lettere finte: si apre solo dopo il sorteggio; nessuno sa quale lettera è chi
create or replace function ss_tabella(p_pw text, p_event uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare st text;
begin
  perform _need(p_pw);
  select status into st from ss_events where id = p_event;
  if st is null then raise exception 'EVENTO_NON_TROVATO'; end if;
  if st <> 'drawn' then return json_build_object('aperta', false); end if;
  return json_build_object('aperta', true, 'check', ss_check(p_pw, p_event),
    'righe', coalesce((select json_agg(json_build_object('da', g.code, 'a', rc.code) order by length(g.code), g.code)
      from ss_pairs s join ss_people g on g.id = s.giver join ss_people rc on rc.id = s.receiver where s.event_id = p_event), '[]'::json));
end $$;

-- regalo preso ✓
create or replace function ss_bought(p_pw text, p_event uuid, p_name text, p_pin text, p_val boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare r json;
begin
  perform _need(p_pw);
  r := _ss_pin(p_event, p_name, p_pin);
  if r->>'err' is not null then return r; end if;
  update ss_people set bought = coalesce(p_val, true) where id = (r->>'id')::uuid;
  return json_build_object('ok', true);
end $$;

-- domande anonime: chi regala chiede al suo destinatario; il destinatario non sa mai chi chiede
create or replace function ss_ask(p_pw text, p_event uuid, p_name text, p_pin text, p_question text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare r json; me uuid; rc uuid; qt text := _clean(p_question, 500);
begin
  perform _need(p_pw);
  r := _ss_pin(p_event, p_name, p_pin);
  if r->>'err' is not null then return r; end if;
  me := (r->>'id')::uuid;
  select receiver into rc from ss_pairs where event_id = p_event and giver = me;
  if rc is null then return json_build_object('err', 'SORTEGGIO_NON_FATTO'); end if;
  if qt = '' then return json_build_object('err', 'POST_VUOTO'); end if;
  if (select count(*) from ss_questions where event_id = p_event and giver = me) >= 30 then return json_build_object('err', 'TROPPE_DOMANDE'); end if;
  insert into ss_questions(event_id, giver, receiver, question) values (p_event, me, rc, qt);
  return json_build_object('ok', true);
end $$;

create or replace function ss_inbox(p_pw text, p_event uuid, p_name text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare r json; me uuid; rc uuid;
begin
  perform _need(p_pw);
  r := _ss_pin(p_event, p_name, p_pin);
  if r->>'err' is not null then return r; end if;
  me := (r->>'id')::uuid;
  select receiver into rc from ss_pairs where event_id = p_event and giver = me;
  return json_build_object(
    'per_me', coalesce((select json_agg(json_build_object('id', q.id, 'question', q.question, 'answer', q.answer,
        'created_at', q.created_at, 'answered_at', q.answered_at) order by q.created_at)
      from ss_questions q where q.event_id = p_event and q.receiver = me
        and exists (select 1 from ss_pairs s where s.event_id = p_event and s.giver = q.giver and s.receiver = me)), '[]'::json),
    'mie', coalesce((select json_agg(json_build_object('id', q.id, 'question', q.question, 'answer', q.answer,
        'created_at', q.created_at, 'answered_at', q.answered_at) order by q.created_at)
      from ss_questions q where q.event_id = p_event and q.giver = me and q.receiver = rc), '[]'::json));
end $$;

create or replace function ss_answer(p_pw text, p_event uuid, p_name text, p_pin text, p_question uuid, p_answer text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare r json; a text := _clean(p_answer, 500);
begin
  perform _need(p_pw);
  r := _ss_pin(p_event, p_name, p_pin);
  if r->>'err' is not null then return r; end if;
  if a = '' then return json_build_object('err', 'POST_VUOTO'); end if;
  update ss_questions set answer = a, answered_at = now() where id = p_question and event_id = p_event and receiver = (r->>'id')::uuid;
  if not found then return json_build_object('err', 'DOMANDA_NON_TROVATA'); end if;
  return json_build_object('ok', true);
end $$;

-- ---------- CALENDARIO EVENTI ----------
-- giorno + ora "locali" (senza fuso orario): il gruppo è in Italia
create or replace function _event_json(p_id uuid, p_full boolean) returns json
language sql stable security definer set search_path = public, extensions as $$
  select json_build_object('id', e.id, 'author', e.author, 'title', e.title, 'place', e.place,
    'day', e.day, 'ora', to_char(e.ora, 'HH24:MI'), 'cover', e.cover, 'created_at', e.created_at, 'voting', e.day is null,
    'rsvp', json_build_object(
      'si',    coalesce((select json_agg(r.name order by r.created_at) from event_rsvp r where r.event_id = e.id and r.ans = 'si'), '[]'::json),
      'forse', coalesce((select json_agg(r.name order by r.created_at) from event_rsvp r where r.event_id = e.id and r.ans = 'forse'), '[]'::json),
      'no',    coalesce((select json_agg(r.name order by r.created_at) from event_rsvp r where r.event_id = e.id and r.ans = 'no'), '[]'::json)),
    'n_comments', (select count(*) from event_comments c where c.event_id = e.id),
    'dates', case when e.day is null then coalesce((select json_agg(json_build_object('id', d.id, 'day', d.day, 'ora', to_char(d.ora, 'HH24:MI'),
        'voters', coalesce((select json_agg(v.name order by v.created_at) from event_date_votes v where v.date_id = d.id), '[]'::json)) order by d.pos)
      from event_dates d where d.event_id = e.id), '[]'::json) else '[]'::json end,
    'body', case when p_full then e.body else left(e.body, 140) end,
    'comments', case when p_full then coalesce((select json_agg(json_build_object('id', c.id, 'author', c.author, 'body', c.body, 'created_at', c.created_at) order by c.created_at)
      from event_comments c where c.event_id = e.id), '[]'::json) else null end)
  from events e where e.id = p_id;
$$;

create or replace function _event_cover_ok(p text) returns boolean
language sql immutable as $$ select p is null or p ~ '^eventi/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' $$;

create or replace function _event_day_ok(d date) returns boolean
language sql stable as $$ select d between current_date - 366 and current_date + 3653 $$;

create or replace function events_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(_event_json(x.id, false) order by x.day nulls first, x.ora nulls first, x.created_at)
    from (select id, day, ora, created_at from events where day is null or day >= current_date - 366 order by day desc nulls first limit 500) x), '[]'::json);
end $$;

create or replace function event_get(p_pw text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare r json;
begin
  perform _need(p_pw);
  r := _event_json(p_id, true);
  if r is null then raise exception 'EVENTO_SPARITO'; end if;
  return r;
end $$;

-- p_dates = null → data decisa (p_day obbligatorio); altrimenti 2–5 date proposte [{"day":"2026-12-20","ora":"20:30"}, ...]
create or replace function event_add(p_pw text, p_author text, p_title text, p_place text, p_body text,
  p_day date, p_ora time, p_cover text, p_dates json) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; t text := _clean(p_title, 80); a text := _clean(p_author, 30); n int; giorni date[]; ore time[];
begin
  perform _need(p_pw);
  if a = '' then raise exception 'NOME_VUOTO'; end if;
  if t = '' then raise exception 'TITOLO_VUOTO'; end if;
  if not _event_cover_ok(p_cover) then raise exception 'FOTO_NON_VALIDA'; end if;
  if p_dates is not null and json_typeof(p_dates) = 'array' and json_array_length(p_dates) > 0 then
    begin
      select array_agg(z.day order by z.day, z.ora nulls first), array_agg(z.ora order by z.day, z.ora nulls first) into giorni, ore
      from (select distinct (d->>'day')::date as day, nullif(d->>'ora', '')::time as ora
            from json_array_elements(p_dates) d where coalesce(d->>'day', '') <> '') z;
    exception when others then raise exception 'DATA_NON_VALIDA';
    end;
    n := coalesce(array_length(giorni, 1), 0);
    if n < 2 then raise exception 'SERVONO_2_DATE'; end if;
    if n > 5 then raise exception 'TROPPE_DATE'; end if;
    for i in 1..n loop if not _event_day_ok(giorni[i]) then raise exception 'DATA_NON_VALIDA'; end if; end loop;
    insert into events(author, title, place, body, cover) values (a, t, _clean(p_place, 120), _clean(p_body, 2000), p_cover) returning id into new_id;
    for i in 1..n loop insert into event_dates(event_id, pos, day, ora) values (new_id, i, giorni[i], ore[i]); end loop;
  else
    if p_day is null then raise exception 'DATA_VUOTA'; end if;
    if not _event_day_ok(p_day) then raise exception 'DATA_NON_VALIDA'; end if;
    insert into events(author, title, place, body, day, ora, cover) values (a, t, _clean(p_place, 120), _clean(p_body, 2000), p_day, p_ora, p_cover) returning id into new_id;
  end if;
  return new_id;
end $$;

-- solo chi l'ha creato. Giorno e ora si cambiano solo se la data è già decisa (altrimenti si usa "Fissa questa data")
create or replace function event_edit(p_pw text, p_id uuid, p_author text, p_title text, p_place text, p_body text,
  p_day date, p_ora time, p_cover text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare e events%rowtype; t text := _clean(p_title, 80);
begin
  perform _need(p_pw);
  select * into e from events where id = p_id for update;
  if not found then raise exception 'EVENTO_SPARITO'; end if;
  if lower(e.author) <> lower(_clean(p_author, 30)) then raise exception 'NON_AUTORIZZATO'; end if;
  if t = '' then raise exception 'TITOLO_VUOTO'; end if;
  if not _event_cover_ok(p_cover) then raise exception 'FOTO_NON_VALIDA'; end if;
  if e.day is not null then
    if p_day is null then raise exception 'DATA_VUOTA'; end if;
    if not _event_day_ok(p_day) then raise exception 'DATA_NON_VALIDA'; end if;
    update events set day = p_day, ora = p_ora where id = p_id;
  end if;
  update events set title = t, place = _clean(p_place, 120), body = _clean(p_body, 2000), cover = p_cover where id = p_id;
  return _event_json(p_id, true);
end $$;

-- chi l'ha creato, oppure l'amministratore col PIN (errori del PIN restituiti, non lanciati: il blocco dopo 5 errori resta)
create or replace function event_del(p_pw text, p_id uuid, p_author text, p_admin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare e events%rowtype; x text;
begin
  perform _need(p_pw);
  select * into e from events where id = p_id;
  if not found then return json_build_object('ok', true); end if;
  if lower(e.author) <> lower(_clean(p_author, 30)) then
    if coalesce(p_admin, '') = '' then raise exception 'NON_AUTORIZZATO'; end if;
    x := _admin_try(p_admin);
    if x is not null then return json_build_object('err', x); end if;
  end if;
  delete from events where id = p_id;
  return json_build_object('ok', true);
end $$;

-- risposta: 'si' / 'forse' / 'no', oppure null per toglierla
create or replace function event_rsvp(p_pw text, p_id uuid, p_name text, p_ans text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30); a text := nullif(_clean(p_ans, 10), '');
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if not exists (select 1 from events where id = p_id) then raise exception 'EVENTO_SPARITO'; end if;
  if a is not null and a not in ('si', 'forse', 'no') then raise exception 'RISPOSTA_NON_VALIDA'; end if;
  delete from event_rsvp where event_id = p_id and lower(name) = lower(n);
  if a is not null then insert into event_rsvp(event_id, name, ans) values (p_id, n, a); end if;
  return _event_json(p_id, false)->'rsvp';
end $$;

create or replace function event_comment_add(p_pw text, p_id uuid, p_author text, p_body text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; b text := _clean(p_body, 1000); a text := _clean(p_author, 30);
begin
  perform _need(p_pw);
  if b = '' then raise exception 'POST_VUOTO'; end if;
  if a = '' then raise exception 'NOME_VUOTO'; end if;
  if not exists (select 1 from events where id = p_id) then raise exception 'EVENTO_SPARITO'; end if;
  insert into event_comments(event_id, author, body) values (p_id, a, b) returning id into new_id;
  return new_id;
end $$;

create or replace function event_comment_del(p_pw text, p_id uuid, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from event_comments where id = p_id and lower(author) = lower(_clean(p_author, 30));
end $$;

-- tocco su una data proposta: metti o togli il voto (si possono scegliere più date). Restituisce le date aggiornate
create or replace function event_date_vote(p_pw text, p_date uuid, p_name text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30); ev uuid;
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  select d.event_id into ev from event_dates d where d.id = p_date;
  if not found then raise exception 'EVENTO_SPARITO'; end if;
  if exists (select 1 from events where id = ev and day is not null) then raise exception 'VOTAZIONE_CHIUSA'; end if;
  if exists (select 1 from event_date_votes where date_id = p_date and lower(name) = lower(n)) then
    delete from event_date_votes where date_id = p_date and lower(name) = lower(n);
  else
    insert into event_date_votes(date_id, event_id, name) values (p_date, ev, n) on conflict do nothing;
  end if;
  return _event_json(ev, false)->'dates';
end $$;

-- chi l'ha creato sceglie la data vincente: l'evento diventa "con data" e la votazione si chiude
create or replace function event_fix_date(p_pw text, p_id uuid, p_author text, p_date uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare e events%rowtype; d event_dates%rowtype;
begin
  perform _need(p_pw);
  select * into e from events where id = p_id for update;
  if not found then raise exception 'EVENTO_SPARITO'; end if;
  if lower(e.author) <> lower(_clean(p_author, 30)) then raise exception 'NON_AUTORIZZATO'; end if;
  if e.day is not null then raise exception 'VOTAZIONE_CHIUSA'; end if;
  select * into d from event_dates where id = p_date and event_id = p_id;
  if not found then raise exception 'EVENTO_SPARITO'; end if;
  update events set day = d.day, ora = d.ora where id = p_id;
  return _event_json(p_id, true);
end $$;

-- ---------- NOTIFICHE SUL TELEFONO ----------
-- Storie, post ed eventi mettono una notifica in notif_queue; il database sveglia la funzione "notifica"
-- di Supabase (se è installata) passando SOLO il numero: la funzione legge da qui il testo e i destinatari.
create or replace function _data_it(d date, o time) returns text
language sql immutable as $$
  select (array['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'])[extract(dow from d)::int + 1] || ' ' ||
    extract(day from d)::int || ' ' || (array['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'])[extract(month from d)::int] ||
    coalesce(' ore ' || to_char(o, 'HH24:MI'), '')
$$;

create or replace function _notifica(p_kind text, p_author text, p_title text, p_body text, p_url text, p_event uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from notif_queue where created_at < now() - interval '30 days';
  insert into notif_queue(kind, author, title, body, url, event_id)
  values (p_kind, coalesce(p_author, ''), left(p_title, 80), left(coalesce(p_body, ''), 160), coalesce(p_url, ''), p_event);
end $$;

-- appena entra una notifica: sveglia la funzione di Supabase (pg_net). Se non c'è, non succede niente
create or replace function _notif_sveglia() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_key text;
begin
  select v into v_url from app_config where k = 'notif_url';
  select v into v_key from app_config where k = 'notif_key';
  if v_url is null or to_regproc('net.http_post') is null then return new; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using v_url, jsonb_build_object('id', new.id), jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_key, ''));
  return new;
exception when others then return new;          -- una notifica non deve mai bloccare un post
end $$;
drop trigger if exists notif_sveglia on notif_queue;
create trigger notif_sveglia after insert on notif_queue for each row execute function _notif_sveglia();

create or replace function _notif_storia() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _notifica('storie', new.author, '📸 ' || new.author, coalesce(nullif(new.caption, ''), 'ha pubblicato una storia'), '#storie', null);
  return new;
exception when others then return new;
end $$;
drop trigger if exists notif_storia on stories;
create trigger notif_storia after insert on stories for each row execute function _notif_storia();

create or replace function _notif_post() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if left(new.body, 2) like '📅%' then return new; end if;   -- gli annunci degli eventi hanno già la loro notifica
  perform _notifica('post', new.author, '💬 ' || new.author,
    coalesce(nullif(regexp_replace(left(new.body, 150), '\s+', ' ', 'g'), ''), case when cardinality(new.photos) > 1 then 'ha pubblicato delle foto' else 'ha pubblicato una foto' end),
    '#post/' || new.id, null);
  return new;
exception when others then return new;
end $$;
drop trigger if exists notif_post on posts;
create trigger notif_post after insert on posts for each row execute function _notif_post();

create or replace function _notif_evento() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.day is null then
      perform _notifica('eventi', new.author, '📅 ' || new.title, new.author || ' propone un evento: vota la data!', '#calendario/' || new.id, new.id);
    else
      perform _notifica('eventi', new.author, '📅 ' || new.title, 'Nuovo evento di ' || new.author || ': ' || _data_it(new.day, new.ora) || coalesce(' · ' || nullif(new.place, ''), ''), '#calendario/' || new.id, new.id);
    end if;
  elsif old.day is null and new.day is not null then
    perform _notifica('eventi', new.author, '📅 Data fissata: ' || new.title, _data_it(new.day, new.ora) || coalesce(' · ' || nullif(new.place, ''), ''), '#calendario/' || new.id, new.id);
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists notif_evento on events;
create trigger notif_evento after insert or update of day on events for each row execute function _notif_evento();

-- promemoria il giorno prima (lo lancia pg_cron ogni sera, se attivo). Si può chiamare più volte: non manda doppioni
create or replace function _notif_promemoria() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare e record; n int := 0; dom date := (now() at time zone 'Europe/Rome')::date + 1;
begin
  for e in select * from events where day = dom loop
    if not exists (select 1 from notif_queue q where q.event_id = e.id and q.title like '⏰%' and q.created_at > now() - interval '20 hours') then
      perform _notifica('eventi', '', '⏰ Domani: ' || e.title, coalesce('ore ' || to_char(e.ora, 'HH24:MI'), 'Domani') || coalesce(' · ' || nullif(e.place, ''), ''), '#calendario/' || e.id, e.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- chiave pubblica per iscriversi (la crea la funzione "notifica" la prima volta)
create or replace function push_key(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return json_build_object('pub', (select v from app_config where k = 'vapid_pub'));
end $$;

create or replace function push_subscribe(p_pw text, p_name text, p_endpoint text, p_p256dh text, p_auth text, p_kinds text[]) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30); ks text[];
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  if exists (select 1 from members where lower(name) = lower(n) and banned) then raise exception 'SEI_STATO_RIMOSSO'; end if;
  if coalesce(p_endpoint, '') !~ '^https://\S+$' or length(p_endpoint) not between 20 and 1000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_=-]{40,200}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_=-]{8,100}$' then
    raise exception 'NOTIFICHE_NON_VALIDE';
  end if;
  select coalesce(array_agg(distinct x), '{}') into ks from unnest(coalesce(p_kinds, '{}')) x where x in ('storie', 'post', 'eventi');
  insert into push_subs(endpoint, name, p256dh, auth, kinds) values (p_endpoint, n, p_p256dh, p_auth, ks)
  on conflict (endpoint) do update set name = excluded.name, p256dh = excluded.p256dh, auth = excluded.auth, kinds = excluded.kinds, updated_at = now();
  return json_build_object('ok', true, 'kinds', ks);
end $$;

create or replace function push_unsubscribe(p_pw text, p_endpoint text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  delete from push_subs where endpoint = p_endpoint;
  return json_build_object('ok', true);
end $$;

-- ===== solo per la funzione "notifica" di Supabase (chiave service_role), mai per il sito =====
-- prende la notifica UNA volta sola e dice a chi mandarla: tutti quelli che l'hanno chiesta, tranne chi l'ha fatta,
-- chi è stato rimosso e (per i promemoria) chi ha detto "Non ci sono"
create or replace function notif_claim(p_id bigint) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare q notif_queue%rowtype;
begin
  update notif_queue set sent_at = now() where id = p_id and sent_at is null returning * into q;
  if not found then return null; end if;
  return json_build_object('title', q.title, 'body', q.body, 'url', q.url, 'tag', q.kind || '-' || coalesce(q.event_id::text, q.id::text),
    'subs', coalesce((select json_agg(json_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) from push_subs s
      where q.kind = any(s.kinds) and lower(s.name) <> lower(q.author)
        and not exists (select 1 from members m where lower(m.name) = lower(s.name) and m.banned)
        and not (q.title like '⏰%' and exists (select 1 from event_rsvp r where r.event_id = q.event_id and lower(r.name) = lower(s.name) and r.ans = 'no'))), '[]'::json));
end $$;

create or replace function push_gone(p_endpoint text) returns void
language sql security definer set search_path = public, extensions as $$ delete from push_subs where endpoint = p_endpoint $$;

create or replace function vapid_get() returns json
language sql stable security definer set search_path = public, extensions as $$
  select json_build_object('pub', (select v from app_config where k = 'vapid_pub'), 'priv', (select v from app_config where k = 'vapid_priv'))
$$;

-- la prima chiave salvata vince (se due telefoni la chiedono insieme, restano quelle del primo)
create or replace function vapid_set(p_pub text, p_priv text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from app_config where k = 'vapid_pub') then
    insert into app_config(k, v) values ('vapid_pub', p_pub), ('vapid_priv', p_priv) on conflict (k) do nothing;
  end if;
  return vapid_get();
end $$;

-- ---------- permessi ----------
revoke all on all tables in schema public from anon, authenticated;
grant execute on function check_pw, members_list, member_add, presenza, avatars_list, member_avatar, admin_check, member_kick, couples_list, couples_set, stories_list, story_add, story_seen, story_del, story_comments, story_comment_add, story_comment_del, feed, post_add, post_del, post_like, post_vote, post_thread,
  reply_add, reply_del, albums_list, album_create,
  album_photos, photo_add, photo_del, album_del, photo_comments, photo_comment_add, photo_comment_del, photo_vote,
  polls_list, poll_create, poll_vote, poll_close, poll_del, ss_list, ss_create, ss_join, ss_leave, ss_kick, ss_set_excl,
  ss_draw, ss_undo, ss_event_del, ss_reveal, ss_check, ss_admin_check, ss_reset_pin,
  ss_me, ss_admit, ss_status, ss_tabella, ss_bought, ss_ask, ss_inbox, ss_answer,
  events_list, event_get, event_add, event_edit, event_del, event_rsvp, event_comment_add, event_comment_del,
  event_date_vote, event_fix_date, push_key, push_subscribe, push_unsubscribe to anon, authenticated;
drop function if exists _ss_admin(uuid, text);
revoke execute on function _ok, _need, _poll_json, _admin_ok, _admin_try, _rnd, _shuffle, _ss_code, _ss_log, _ss_vietati,
  _ss_match, _ss_cappello, _ss_lettere, _ss_pin, _ss_adm, _event_json, _event_cover_ok, _event_day_ok,
  _data_it, _notifica, _notif_sveglia, _notif_storia, _notif_post, _notif_evento, _notif_promemoria from anon, authenticated;
revoke execute on function _ok, _need, _poll_json, _admin_ok, _admin_try, _rnd, _shuffle, _ss_code, _ss_log, _ss_vietati,
  _ss_match, _ss_cappello, _ss_lettere, _ss_pin, _ss_adm, _event_json, _event_cover_ok, _event_day_ok,
  _data_it, _notifica, _notif_sveglia, _notif_storia, _notif_post, _notif_evento, _notif_promemoria from public;
-- le funzioni della "postina" delle notifiche: solo per la funzione di Supabase (service_role), mai per il sito
revoke execute on function notif_claim, push_gone, vapid_get, vapid_set from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function notif_claim, push_gone, vapid_get, vapid_set to service_role;
  end if;
end $$;

-- ---------- spazio per le foto ----------
-- spazio per le foto (pubbliche solo con l'indirizzo esatto, impossibile da indovinare)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "covo upload foto" on storage.objects;
create policy "covo upload foto" on storage.objects for insert to anon, authenticated with check (bucket_id = 'foto');

-- ============================================================
--  PIPPEGHI 24/7 – impostazioni di QUESTO progetto Supabase (notifiche sul telefono)
--  Indirizzo della funzione delle notifiche (su Supabase si chiama "clever-endpoint") e chiave PUBBLICA (anon, la stessa che c'è nel sito).
--  Nessun segreto qui: le chiavi delle notifiche le crea la funzione da sola e restano nel database.
-- ============================================================
insert into app_config(k, v) values
  ('notif_url', 'https://hiypieuddqkwefifiqqc.supabase.co/functions/v1/clever-endpoint'),
  ('notif_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeXBpZXVkZHFrd2VmaWZpcXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MDAyODgsImV4cCI6MjExMDI3NjI4OH0.AErX76Ioe3c4ja6owNQwdAWjwl49gdA4giHI0AdMmIs')
on conflict (k) do update set v = excluded.v;

-- pg_net: serve al database per "svegliare" la funzione delle notifiche
do $$ begin
  create extension if not exists pg_net;
exception when others then raise notice 'pg_net non disponibile: %', sqlerrm;
end $$;

-- pg_cron: promemoria "Domani: ..." ogni sera alle 18 (19 con l'ora legale). Se non c'è, il resto funziona lo stesso
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('pippeghi-promemoria', '0 17 * * *', 'select public._notif_promemoria()');
exception when others then raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;
