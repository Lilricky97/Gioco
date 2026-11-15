# Progetto di Ricky (Lilricky97) – sito del gruppo di amici + gioco Senza Filtro

Rispondi sempre in **italiano**, in modo semplice: Ricky non è un programmatore e usa spesso il telefono.

## Cosa c'è già (funziona, non rompere)

- `index.html` – **Senza Filtro**, party game stile Coco Rido. Un telefono fa da tavolo (trasmesso in TV), gli altri telefoni sono le mani.
  - I telefoni si parlano tramite server MQTT pubblici (emqx, hivemq, mosquitto) – il peer-to-peer non funzionava su 4G/5G.
  - Il telefono invia al tavolo il testo esatto della carta giocata (evita errori se le versioni sono diverse). C'è `const VER` per l'avviso "ricarica la pagina": aumentalo a ogni modifica.
  - Modalità mazzo scelte dalla prima lettera del codice partita: `X` = Solo noi porno, `Q` = black humor, `Z` = tutto insieme, altre = mazzo generale.
  - Carte con nomi dei giocatori: `{G}` `{G2}`, accordi `{o}` `{o2}` `{lo}` `{lui}` `{a}`, prefissi `M:` `F:` (solo maschi/femmine), `MM:` `FF:` (coppia gay/lesbo). I testi sorgente sono in `carte/*.txt` (formato `emoji|testo`).
  - Primo giudice e giro dei giudici casuali; risposte mostrate in ordine casuale, una alla volta.
- **Link che gli amici usano** (non cambiarlo): https://htmlpreview.github.io/?https://github.com/Lilricky97/Gioco/blob/68a1fb1/index.html
  - `68a1fb1` è un **branch** (non un commit): per aggiornare il link senza cambiarlo fai `git push -f origin HEAD:refs/heads/68a1fb1`.
  - La cache di GitHub raw impiega circa 5 minuti ad aggiornarsi. **Non aggiornare mentre stanno giocando** (lo ha chiesto Ricky).
- GitHub Pages **non** è attivo (serve che Ricky lo attivi da Settings → Pages, loggato).

## Cosa stiamo facendo adesso: il sito del gruppo (cartella `sito/`)

Richiesta di Ricky:
1. **Prima pagina / Novità**: chi entra può scrivere novità e allegare foto.
2. **Foto**: cartelle (album) di foto.
3. **Gioco**: sezione con Senza Filtro (link al gioco qui sopra).
4. **Secret Santa**: da testare molto bene.
5. **FantaSanremo**: per ora "in arrivo".

Decisioni già prese con Ricky:
- Database: **Supabase** (account già creato da Ricky con GitHub, progetto "amici", regione Frankfurt).
- Accesso: **una password unica del gruppo**, poi ognuno sceglie il proprio nome. (Ricky deve ancora dire quale password.)

Stato:
- ✅ `sito/schema.sql` – tabelle + funzioni RPC. Tutte le tabelle hanno RLS senza policy: si passa solo dalle funzioni `security definer` che controllano la password (`app_config.k='pw'`, hash bcrypt).
  Secret Santa: iscrizione con nome + PIN personale, letterina, esclusioni (coppie), sorteggio a **catena unica**, ognuno vede solo il proprio abbinamento (`ss_reveal` con PIN), `ss_check` verifica il sorteggio senza rivelare le coppie.
- ✅ `sito/test-database.mjs` – test con PGlite (`npm i @electric-sql/pglite`): 300 sorteggi corretti, privacy PIN ok. Tutti verdi.
- ✅ `sito/storage.sql` – bucket `foto` pubblico (percorsi casuali), upload consentito alla chiave pubblica.
- ⏳ Da fare:
  1. Eseguire `schema.sql` e `storage.sql` nel SQL Editor del progetto Supabase, poi impostare la password:
     `insert into app_config(k,v) values ('pw', extensions.crypt('PASSWORD', extensions.gen_salt('bf'))) on conflict (k) do update set v = excluded.v;`
  2. Prendere **Project URL** e **chiave pubblica** (publishable/anon) da Project Settings → API.
  3. Scrivere `sito/index.html` (pagina unica, niente librerie): chiama le funzioni con `POST {URL}/rest/v1/rpc/<funzione>` header `apikey` (+ `Authorization: Bearer` solo se la chiave è un JWT `eyJ…`); foto ridimensionate a 1600px JPEG e caricate su `{URL}/storage/v1/object/foto/<cartella>/<uuid>.jpg`, mostrate da `{URL}/storage/v1/object/public/foto/...`.
     Sezioni con barra in basso: Novità, Foto, Gioco, Secret Santa, FantaSanremo. Stile: "insegna al neon di Riviera" (blu notte, rosa neon, menta), mobile first.
  4. Testare tutto dal vivo (soprattutto Secret Santa con più persone) e pubblicare: link `https://htmlpreview.github.io/?https://github.com/Lilricky97/Gioco/blob/main/sito/index.html` oppure GitHub Pages se Ricky lo attiva.

Mai inserire tu password o chiavi segrete: i login li fa Ricky. La chiave pubblica di Supabase può stare nel codice; la password del database e la service key no.
