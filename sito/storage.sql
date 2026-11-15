-- spazio per le foto (pubbliche solo con l'indirizzo esatto, impossibile da indovinare)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "covo upload foto" on storage.objects;
create policy "covo upload foto" on storage.objects for insert to anon, authenticated with check (bucket_id = 'foto');
