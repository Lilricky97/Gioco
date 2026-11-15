-- ============================================================
--  PIPPEGHI 24/7 – INSTALLAZIONE COMPLETA (copia tutto, incolla nel SQL Editor di Supabase, Run)
--  = schema.sql + storage.sql. Si può rieseguire senza problemi.
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
alter table posts     enable row level security;
alter table post_likes   enable row level security;
alter table post_replies enable row level security;
alter table albums    enable row level security;
alter table photos    enable row level security;
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

create or replace function _clean(t text, maxlen int) returns text
language sql immutable as $$ select left(btrim(coalesce(t,'')), maxlen) $$;

-- ---------- accesso e membri ----------
create or replace function check_pw(p_pw text) returns boolean
language sql stable security definer set search_path = public, extensions as $$ select _ok(p_pw) $$;

create or replace function members_list(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(name order by lower(name)) from members), '[]'::json);
end $$;

create or replace function member_add(p_pw text, p_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare n text := _clean(p_name, 30);
begin
  perform _need(p_pw);
  if n = '' then raise exception 'NOME_VUOTO'; end if;
  insert into members(name) values (n) on conflict do nothing;
end $$;

-- ---------- novità ----------
create or replace function feed(p_pw text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  return coalesce((select json_agg(row_to_json(p) order by p.created_at desc)
    from (select x.id, x.author, x.body, x.photos, x.created_at,
            coalesce((select json_agg(l.name order by l.created_at) from post_likes l where l.post_id = x.id), '[]'::json) as likes,
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
  delete from post_likes where post_id = p_id and lower(name) = lower(n);
  if found then return false; end if;
  insert into post_likes(post_id, name) values (p_id, n) on conflict do nothing;
  return true;
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
    from (select id, path, author, created_at from photos where album_id = p_album) f), '[]'::json);
end $$;

create or replace function photo_add(p_pw text, p_album uuid, p_path text, p_author text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _need(p_pw);
  insert into photos(album_id, path, author) values (p_album, _clean(p_path,300), _clean(p_author,30));
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
grant execute on function check_pw, members_list, member_add, feed, post_add, post_del, post_like, post_thread,
  reply_add, reply_del, albums_list, album_create,
  album_photos, photo_add, photo_del, album_del, ss_list, ss_create, ss_join, ss_leave, ss_kick, ss_set_excl,
  ss_draw, ss_undo, ss_event_del, ss_reveal, ss_check, ss_admin_check, ss_reset_pin to anon, authenticated;
revoke execute on function _ok, _need, _ss_admin from anon, authenticated;
revoke execute on function _ok, _need, _ss_admin from public;

-- ---------- spazio per le foto ----------
-- spazio per le foto (pubbliche solo con l'indirizzo esatto, impossibile da indovinare)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "covo upload foto" on storage.objects;
create policy "covo upload foto" on storage.objects for insert to anon, authenticated with check (bucket_id = 'foto');
