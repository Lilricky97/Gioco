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
- Nome del sito: **"Pippeghi 24/7"** (insegna al neon: "Pippeghi" rosa, "24/7" verde menta). Lo stile neon gli piace.
- Barra in basso: icone disegnate (SVG a linee, verde menta con alone quando attive), **niente emoji** (Ricky le trovava poco professionali). Etichette: Novità, Foto, Gioco, Santa, Sanremo.
- **Novità in stile X/Twitter**: post con ❤️ mi piace e 💬 risposte, #hashtag cliccabili, "🔥 Di tendenza" = hashtag più usati negli ultimi 30 giorni (a destra su computer, riga scorrevole in alto sul telefono). Ricky deve ancora dire come vuole le altre sezioni e i colori: chiedere/proporre.
- Database: **Supabase** (account di Ricky, organizzazione "Pippeghi 24/7", progetto "Lilricky97's Project", ref `hiypieuddqkwefifiqqc` → URL `https://hiypieuddqkwefifiqqc.supabase.co`, regione eu-west).
- `sito/installa.sql` = `schema.sql` + `storage.sql` in un file solo (da rigenerare se cambiano), per un unico copia-incolla dal telefono.
- Accesso: **una password unica del gruppo**, poi ognuno sceglie il proprio nome. (Ricky deve ancora dire quale password.)

Stato:
- ✅ `sito/schema.sql` – tabelle + funzioni RPC. Tutte le tabelle hanno RLS senza policy: si passa solo dalle funzioni `security definer` che controllano la password (`app_config.k='pw'`, hash bcrypt). Si può rieseguire più volte senza problemi.
  Secret Santa: iscrizione con nome + PIN personale, letterina, esclusioni (coppie), sorteggio a **catena unica**, ognuno vede solo il proprio abbinamento (`ss_reveal` con PIN), `ss_check` verifica il sorteggio senza rivelare le coppie, `ss_admin_check` (sblocca area organizzatore), `ss_reset_pin` (l'organizzatore dà un PIN nuovo a chi l'ha dimenticato, senza vedere gli abbinamenti). Nomi non sensibili a maiuscole/minuscole.
- ✅ `sito/storage.sql` – bucket `foto` pubblico (percorsi casuali), upload consentito alla chiave pubblica.
- ✅ `sito/index.html` – il sito (pagina unica, niente librerie). In cima: `SUPA_URL`, `SUPA_KEY`, `NOME`, `GIOCO_URL`.
  **Modalità prova**: con `SUPA_URL`/`SUPA_KEY` vuoti il sito funziona con dati finti in memoria (password `prova`, PIN organizzatore del Secret Santa di prova `0000`, striscia gialla "MODALITÀ PROVA"); stesse regole del database vero (funzione `creaDemo()`). Serve a far vedere il sito a Ricky prima di collegare Supabase.
  **Gioco**: Senza Filtro si gioca DENTRO il sito (`#gioco/gioca` = iframe a tutto schermo con `GIOCO_URL`, il link degli amici). "‹ Sito" lo nasconde senza chiuderlo (bottone "🃏 Partita in corso" per rientrare, tasto indietro del telefono = torna al sito), "✕" lo chiude davvero. Resta anche "Apri in una pagina a parte".
  Rotte: `#novita`, `#tag/<hashtag>`, `#post/<id>` (risposte), `#foto`, `#foto/<album>`, `#gioco`, `#gioco/gioca`, `#santa`, `#santa/<evento>`, `#fanta`. Navigazione con `data-go` (niente `href="#..."`, htmlpreview li riscrive).
  Foto: ridimensionate a 1600px JPEG + miniatura 640px (`<uuid>_t.jpg`), cartelle `novita/` e `album/<id>/`. Dati salvati nel telefono con prefisso `pip_` in localStorage (`pipdemo_` in modalità prova).
- ✅ Test (tutti verdi):
  - `cd sito && npm i @electric-sql/pglite && node test-database.mjs` – database.
  - `node prova-locale.mjs` (finto Supabase su http://localhost:8787 col vero schema.sql in PGlite, password `prova`; `LAG=300` = rete lenta) e poi `node test-sito.mjs` – 6 telefoni finti con Playwright (103 controlli, compresa la modalità prova aperta come file): novità con foto, mi piace, risposte, hashtag e tendenze, cartelle, Secret Santa completo (iscrizioni, nome rubato, esclusioni, sorteggio, altro telefono, PIN dimenticato, letterina aggiornata, annulla e rifai). Riavvia `prova-locale.mjs` prima di ogni giro (i dati sono in memoria).
- ⏳ Da fare:
  1. Ricky esegue `schema.sql` e `storage.sql` nel SQL Editor del progetto Supabase, poi imposta la password del gruppo (la scrive lui, non io):
     `insert into app_config(k,v) values ('pw', extensions.crypt('PASSWORD', extensions.gen_salt('bf'))) on conflict (k) do update set v = excluded.v;`
  2. Ricky mi dà **Project URL** e **chiave pubblica** (publishable/anon) da Project Settings → API → li metto in `SUPA_URL` / `SUPA_KEY`.
  3. Test dal vivo (soprattutto Secret Santa con più persone) e pubblicazione: link `https://htmlpreview.github.io/?https://github.com/Lilricky97/Gioco/blob/main/sito/index.html` (serve il permesso di Ricky per mettere il sito su `main`) oppure GitHub Pages se Ricky lo attiva.
- Anteprima attuale (modalità prova) per Ricky: `https://htmlpreview.github.io/?https://github.com/Lilricky97/Gioco/blob/claude/admiring-brown-om0cj1/sito/index.html`

Mai inserire tu password o chiavi segrete: i login li fa Ricky. La chiave pubblica di Supabase può stare nel codice; la password del database e la service key no.
