-- spazio per le foto (pubbliche solo con l'indirizzo esatto, impossibile da indovinare)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "covo upload foto" on storage.objects;
create policy "covo upload foto" on storage.objects for insert to anon, authenticated with check (bucket_id = 'foto');
-- foto delle storie scadute (più di 24 ore): il sito le può vedere e CANCELLARE, nient'altro
drop policy if exists "pippeghi storie scadute vedi" on storage.objects;
create policy "pippeghi storie scadute vedi" on storage.objects for select to anon, authenticated
  using (bucket_id = 'foto' and name like 'storie/%' and created_at < now() - interval '24 hours');
drop policy if exists "pippeghi storie scadute cancella" on storage.objects;
create policy "pippeghi storie scadute cancella" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'foto' and name like 'storie/%' and created_at < now() - interval '24 hours');
