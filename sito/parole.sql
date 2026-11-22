-- Le 40 parole più usate nel gruppo (post, risposte, commenti, sondaggi): per scegliere le parole del cruciverba dell'avvento.
-- Solo lettura: mostra parole e numeri, niente messaggi e niente nomi. Si incolla nel SQL Editor di Supabase e si preme Run.
with testi as (
  select body as t from posts union all select body from post_replies
  union all select body from photo_comments union all select body from event_comments
  union all select body from story_comments union all select caption from stories
  union all select question from polls
), parole as (
  select lower(w) as p from testi, regexp_split_to_table(coalesce(t, ''), '[^a-zA-ZàèéìòùÀÈÉÌÒÙ]+') as w
)
select p as parola, count(*) as volte from parole
where length(p) >= 4 and p not in ('sono','come','anche','questo','questa','questi','quello','quella','perché','perche','però','pero','tutti','tutte','tutto','fare','fatto','ancora','sempre','dove','quando','quanto','allora','alla','alle','dalla','dalle','della','delle','degli','dello','nella','nelle','negli','sulla','sulle','molto','oggi','domani','stasera','ciao','grazie','cosa','dopo','prima','loro','siamo','sarà','hanno','avete','abbiamo','essere','fatta','senza','solo','ogni','qualcuno','qualcosa','proprio','dire','detto','vedi','https','http','www','com','foto','evento','sondaggio','album','secretsanta','mappa','medagliere','nuovo','nuova','questa','ragazzi','vuoi','voglio','posso','puoi','fate','facciamo','stato','stata','bene','ecco','così','cosi','meno','altro','altra','altri','poi','tipo','sempre','mai','già','gia','qui','li','là')
group by p having count(*) >= 2
order by volte desc limit 40;
