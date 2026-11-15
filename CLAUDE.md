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
4. **Secret Santa**: rifatto "per bene" (vedi sotto). Regola di Ricky: tutto a caso come il cappello, ognuno fa **un** regalo e ne riceve **uno**, nessuno a se stesso, le coppie non si pescano.
5. **FantaSanremo**: per ora "in arrivo".

Decisioni già prese con Ricky:
- Nome del sito: **"Pippeghi 24/7"**. Lo stile neon gli piace, i font morbidi/tondi **no**: insegna in **Monoton** (rosa, la 5ª lettera è un "tubo difettoso" che sfarfalla), "24/7" in Bebas Neue verde menta che sfarfalla, titoli di sezione in **Bebas Neue** al neon con ronzio, testo in **Archivo**, bottoni maiuscoli squadrati (raggio 6px), card a 8px.
- Il link deve **restare lo stesso** e aggiornarsi da solo (Ricky non vuole rimandarlo agli amici): si continua a pubblicare sullo stesso branch.
- Navigazione: in basso **solo Novità e Storie** (Ricky non vuole una barra affollata); tutte le zone (Novità, Storie, Foto, Sondaggi, Gioco, Secret Santa, Fanta Sanremo) nel **menu ☰** in alto a sinistra = pannello da sinistra con riquadri al neon + profilo (Cambia nome · Esci) + "Chi c'è nel gruppo". Icone disegnate (SVG a linee), **niente emoji** nella navigazione. Array `ZONE` e `BARRA` in index.html.
- **Storie 24 ore** stile Instagram: pagina `#storie` con card verticali ("Crea storia" + una card per persona, anello colorato se nuove), la voce Storie in basso ha il numerino delle persone con storie nuove; "visto da" per l'autore; **commenti alle storie** (spariscono con la storia).
- **Sondaggi** stile WhatsApp (`#sondaggi`): domanda + 2–12 risposte, risposta unica o multipla, si vede chi ha votato, chi l'ha creato può chiuderlo/eliminarlo.
- **Rimuovere (kick) una persona**: solo con il **PIN amministratore** (`app_config k='admin'`, bcrypt, lo imposta Ricky dal SQL Editor come la password). `members.banned`; chi è rimosso esce al primo "bussare" (SEI_STATO_RIMOSSO) e non può rientrare con quel nome (NOME_BLOCCATO); si può riammettere. Per tenerlo fuori del tutto bisogna anche cambiare la password del gruppo. **Chi è online** (bottone verde in alto, "bussa" ogni 45 s) e **chi si è registrato**. **Commenti alle foto** degli album e **👍 Mi piace / 👎 Non mi piace** su post e foto.
- **Foto utente** (richiesta di Ricky, 15/11/2026): `members.avatar` = `avatar/<uuid>.jpg` nel bucket `foto` (quadrato 480×480 ritagliato al centro). `member_avatar` (null = togli; percorso controllato con regex → `FOTO_NON_VALIDA`), `avatars_list` (schermata "Chi sei?"), e `presenza` restituisce anche `avatar`. Nel sito `S.av` (salvato in `pip_av`), `avatar()` mostra la foto ovunque (attributo `data-av`, `aggiornaAvatar()` la aggiorna senza ridisegnare); si cambia toccando la propria foto nel menu ☰ (`apriFoto`). **Popup una volta sola per telefono** a chi non ha la foto: "Da oggi puoi aggiungere la foto utente" (`invitoFoto`, flag `pip_avpop`; nei test lo tolgo con `addInitScript` tranne per Ricky e la modalità prova).
- **Novità in stile X/Twitter**: post con 👍/👎 e 💬 risposte, #hashtag cliccabili, "🔥 Di tendenza" = hashtag più usati negli ultimi 30 giorni (a destra su computer, riga scorrevole in alto sul telefono). Ricky deve ancora dire come vuole le altre sezioni e i colori: chiedere/proporre.
- Database: **Supabase** (account di Ricky, organizzazione "Pippeghi 24/7", progetto "Lilricky97's Project", ref `hiypieuddqkwefifiqqc` → URL `https://hiypieuddqkwefifiqqc.supabase.co`, regione eu-west).
- `sito/installa.sql` = `schema.sql` + `storage.sql` in un file solo (da rigenerare se cambiano), per un unico copia-incolla dal telefono.
- Accesso: **una password unica del gruppo** (impostata da Ricky in Supabase), poi ognuno sceglie il proprio nome.

Stato:
- ✅ `sito/schema.sql` – tabelle + funzioni RPC. Tutte le tabelle hanno RLS senza policy: si passa solo dalle funzioni `security definer` che controllano la password (`app_config.k='pw'`, hash bcrypt). Si può rieseguire più volte senza problemi.
  Secret Santa (rifatto a novembre 2026, spiegazione completa nella sottopagina Notion https://app.notion.com/p/4197b901003f81efb13aff53aecc07e0):
  - Sorteggio **"cappello"** (`_ss_cappello`): permutazione a caso uniforme (Fisher-Yates con `gen_random_bytes`), si ripesca TUTTO finché non c'è nessuna coppia vietata (se stesso, **coppie del gruppo** `group_couples`, esclusioni dell'evento, abbinamenti dell'anno prima se `prev_event`). **Niente "giro unico"**: Ricky non lo vuole. Prima controlla se è possibile con un abbinamento bipartito (`_ss_match`): se impossibile → `ESCLUSIONI_IMPOSSIBILI` + `chi` (le persone che causano il problema). Dopo 3000 tentativi usa il risultato di `_ss_match`.
  - **Lettere finte** (A, B… AA) date a caso con un rimescolamento separato (`_ss_lettere`); `ss_tabella` mostra "A → F" ecc. solo dopo il sorteggio (verifica pubblica, nessuno sa quale lettera è chi). Richiesta di Ricky.
  - PIN: 5 errori → blocco 15 minuti (personale e organizzatore); le funzioni RESTITUISCONO `{"err": ...}` invece di lanciare l'errore (altrimenti il contatore si annulla). Nel sito `errInRisposta()` lo trasforma in errore.
  - Diario `ss_log` (visibile a tutti: sorteggio, rifatto, nuovo PIN, entrate/uscite), "chi ha guardato" + "regalo preso ✓" solo per l'organizzatore (`ss_status`), avviso "sorteggio rifatto/abbinamento cambiato", ritardatari in attesa → `ss_admit` (cambia 1 persona), `ss_kick` dopo il sorteggio cambia 1–2 persone, **domande anonime** (`ss_ask`/`ss_inbox`/`ss_answer`), "Rifai per il prossimo anno", invito WhatsApp + post nelle Novità (#SecretSanta) con link interno.
  - Coppie del gruppo: ☰ → Chi c'è nel gruppo → Area amministratore (PIN amministratore) → Coppie del gruppo (`couples_list`/`couples_set`). I nomi delle coppie stanno solo nel database, mai nel repo.
  - Nomi non sensibili a maiuscole/minuscole. Righe bloccate con `for update` (niente scontri tra telefoni).
- ✅ `sito/storage.sql` – bucket `foto` pubblico (percorsi casuali), upload consentito alla chiave pubblica.
- ✅ `sito/index.html` – il sito (pagina unica, niente librerie). In cima: `SUPA_URL`, `SUPA_KEY`, `NOME`, `GIOCO_URL`.
  **Modalità prova**: con `SUPA_URL`/`SUPA_KEY` vuoti il sito funziona con dati finti in memoria (password `prova`, PIN organizzatore del Secret Santa di prova `0000`, striscia gialla "MODALITÀ PROVA"); stesse regole del database vero (funzione `creaDemo()`). Serve a far vedere il sito a Ricky prima di collegare Supabase.
  **Gioco**: Senza Filtro si gioca DENTRO il sito (`#gioco/gioca` = iframe a tutto schermo con `GIOCO_URL`, il link degli amici). "‹ Sito" lo nasconde senza chiuderlo (bottone "🃏 Partita in corso" per rientrare, tasto indietro del telefono = torna al sito), "✕" lo chiude davvero. Resta anche "Apri in una pagina a parte".
  Rotte: `#novita`, `#tag/<hashtag>`, `#post/<id>` (risposte), `#foto`, `#foto/<album>`, `#gioco`, `#gioco/gioca`, `#santa`, `#santa/<evento>`, `#fanta`. Navigazione con `data-go` (niente `href="#..."`, htmlpreview li riscrive).
  Foto: ridimensionate a 1600px JPEG + miniatura 640px (`<uuid>_t.jpg`), cartelle `novita/` e `album/<id>/`. Dati salvati nel telefono con prefisso `pip_` in localStorage (`pipdemo_` in modalità prova).
- ✅ Test (tutti verdi):
  - `cd sito && npm i @electric-sql/pglite && node test-database.mjs` – database (127 controlli).
  - `node test-sorteggio.mjs` – matematica del sorteggio: regola d'oro su 3000 gruppi, equità (chi-quadro), "impossibile" confrontato con la forza bruta, velocità con 40 persone, lettere a caso.
  - `node prova-locale.mjs` (finto Supabase su http://localhost:8787 col vero schema.sql in PGlite, password `prova`; `LAG=300` = rete lenta) e poi `node test-sito.mjs` – 8 telefoni finti con Playwright (192 controlli, con foto utente e popup; compresa la modalità prova su `/prova`; verde anche con `LAG=250`): novità con foto, mi piace, risposte, hashtag e tendenze, cartelle, Secret Santa completo (coppie del gruppo, esclusioni, sorteggio con annuncio, verifica con lettere, chi ha guardato, regalo preso, domande anonime, ritardatario fatto entrare, altro telefono, PIN dimenticato, letterina aggiornata, annulla e rifai, PIN bloccato dopo 5 errori). Riavvia `prova-locale.mjs` prima di ogni giro (i dati sono in memoria).
- ✅ Supabase collegato: Ricky ha eseguito `installa.sql` (verificato dal vivo: `check_pw` risponde, `feed` senza password → PASSWORD_ERRATA, tabelle negate all'anon, bucket `foto` esiste). In `index.html` ci sono `SUPA_URL` e la chiave **anon** (JWT `eyJ…`, pubblica). La password del gruppo la conosce solo Ricky: io non la so e non devo chiederla.
  Per i test la modalità prova è su `http://localhost:8787/prova` (`prova-locale.mjs` svuota URL e chiave).
- ⏳ Da fare:
  0. ⏳ **Secret Santa nuovo + foto utente**: Ricky deve ricopiare `installa.sql` (nuove funzioni `ss_*`, `couples_*`, `admin_check` che restituisce json, `member_avatar`, `avatars_list`) e poi inserire le coppie del gruppo dal sito. Verifica dal vivo: `couples_list`/`ss_tabella` con password sbagliata → PASSWORD_ERRATA (prima: funzione inesistente). Finché non lo fa, il sito mostra "Il database va aggiornato".
  0b. ✅ Ricky ha ricopiato `installa.sql` con sondaggi, commenti alle storie e kick (verificato dal vivo: le funzioni nuove rispondono PASSWORD_ERRATA senza password) e ha scelto il PIN amministratore (non scriverlo mai nel repo; si verifica solo dal sito, Area amministratore). Se in futuro cambia `schema.sql`: rigenerare `installa.sql` e chiedergli di ricopiarlo.
  - Pagina Notion privata "PIPPEGHI 24/7" con link, istruzioni e righe SQL: https://app.notion.com/p/4197b901003f81d0b40fd06aa054a048 (aggiornarla se cambiano cose importanti).
  - Dopo un aggiornamento il telefono può mostrare la versione vecchia per qualche minuto (cache di GitHub: max-age 300): basta ricaricare.
  1. Ricky prova il sito vero con la sua password (novità, foto, Secret Santa con più persone).
  2. Link definitivo: chiedere a Ricky il permesso di mettere il sito su `main` (link `https://htmlpreview.github.io/?https://github.com/Lilricky97/Gioco/blob/main/sito/index.html`) oppure GitHub Pages se lo attiva.
  3. Sezioni/colori: aspettare le richieste di Ricky. FantaSanremo ancora "in arrivo".
- Link attuale del sito (ora collegato al database vero) per Ricky: `https://htmlpreview.github.io/?https://github.com/Lilricky97/Gioco/blob/claude/admiring-brown-om0cj1/sito/index.html`

Mai inserire tu password o chiavi segrete: i login li fa Ricky. La chiave pubblica di Supabase può stare nel codice; la password del database e la service key no.
