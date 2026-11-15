-- ============================================================
--  PIPPEGHI 24/7 – impostazioni di QUESTO progetto Supabase (notifiche sul telefono)
--  Indirizzo della funzione "notifica" e chiave PUBBLICA (anon, la stessa che c'è nel sito).
--  Nessun segreto qui: le chiavi delle notifiche le crea la funzione da sola e restano nel database.
-- ============================================================
insert into app_config(k, v) values
  ('notif_url', 'https://hiypieuddqkwefifiqqc.supabase.co/functions/v1/notifica'),
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
