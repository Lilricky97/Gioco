import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'fs'
const db = await PGlite.create({ extensions: { pgcrypto } })
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema storage; create table storage.objects(id serial, bucket_id text, name text, created_at timestamptz default now());`)   // finto spazio foto
await db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url),'utf8'))
await db.exec(`insert into app_config(k,v) values ('pw', extensions.crypt('cocorico', extensions.gen_salt('bf')))`)
const q = async (sql, p=[]) => (await db.query(sql, p)).rows
const one = async (sql,p)=> Object.values((await q(sql,p))[0])[0]
const PW='cocorico'
// I test "di sempre" agiscono direttamente a nome di tante persone: per loro il controllo del PIN personale (_io) è spento.
// Il blocco "ACCESSO PERSONALE" più sotto lo riaccende (quello vero di schema.sql) e lo prova sul serio.
const SCHEMA = fs.readFileSync(new URL('./schema.sql', import.meta.url),'utf8')
const IO_VERO = SCHEMA.match(/create or replace function _io\(p_name text\)[\s\S]*?end \$\$;/)[0]
await db.exec(`create or replace function _io(p_name text) returns void language sql as $$ select $$`)
// Supabase (pg_safeupdate) rifiuta DELETE e UPDATE senza WHERE: qui non si vede, quindi controllo il testo
{
  const sch = fs.readFileSync(new URL('./schema.sql', import.meta.url),'utf8').replace(/--[^\n]*/g, '')
  const senza = [...sch.matchAll(/\b(delete\s+from|update)\s+[a-z_.]+[^;]*;/gi)].map(m => m[0])
    .filter(st => !/\bwhere\b/i.test(st) && !/\bupdate\s+of\b/i.test(st) && !/^update\s+set\b/i.test(st) && !/^update\s+or\s+delete\s+on\b/i.test(st))   // i trigger "after insert or update or delete on ..." non sono comandi
  if (senza.length) console.log('❌ DELETE/UPDATE senza WHERE (Supabase li blocca):', senza.map(x => x.replace(/\s+/g, ' ').slice(0, 60)))
  else console.log('✅ nessuna DELETE/UPDATE senza WHERE (Supabase le bloccherebbe)')
}
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('❌',m)} else console.log('✅',m) }
// errore: sia quello "lanciato" dal database sia quello restituito come {"err": ...}
const err = async (sql,p)=>{ try{ const r = await q(sql,p); const v = r[0] && Object.values(r[0])[0]; return v && typeof v==='object' && v.err ? v.err : null }catch(e){ return e.message } }
// password
ok(await one('select check_pw($1)',[PW])===true,'password giusta')
ok(await one('select check_pw($1)',['sbagliata'])===false,'password sbagliata rifiutata')
ok((await err('select feed($1)',['x']))?.includes('PASSWORD_ERRATA'),'feed senza password bloccato')
// novità e album
await q('select member_add($1,$2)',[PW,'Ricky'])
await q('select post_add($1,$2,$3,$4)',[PW,'Ricky','Ciao a tutti',[]])
ok((await one('select feed($1)',[PW])).length===1,'novità salvata')
// chi è online
let pr = await one('select presenza($1,$2)',[PW,'Ricky'])
ok(pr.find(x=>x.name==='Ricky').online===true,'Ricky bussa: risulta online')
await q("update members set last_seen = now() - interval '10 minutes' where name='Ricky'")
pr = await one('select presenza($1,$2)',[PW,''])
ok(pr.find(x=>x.name==='Ricky').online===false && pr.find(x=>x.name==='Ricky').last_seen,'dopo 10 minuti senza bussare: non più online, ma si sa quando è stato visto')
await one('select presenza($1,$2)',[PW,'ricky'])
ok((await one('select presenza($1,$2)',[PW,''])).filter(x=>x.name.toLowerCase()==='ricky').length===1,'"ricky" minuscolo non crea un doppione')
ok((await err('select presenza($1,$2)',['x','Ricky']))?.includes('PASSWORD_ERRATA'),'presenze protette dalla password')
// amministratore: rimuovere (kick) e riammettere
await q('select member_add($1,$2)',[PW,'Luca'])
ok((await one('select admin_check($1,$2)',[PW,'4321'])).set===false,'PIN amministratore non ancora impostato')
ok((await err('select member_kick($1,$2,$3,$4)',[PW,'4321','Luca',true]))?.includes('ADMIN_NON_IMPOSTATO'),'senza PIN amministratore nessuno può rimuovere')
await db.exec(`insert into app_config(k,v) values ('admin', extensions.crypt('4321', extensions.gen_salt('bf')))`)
ok((await one('select admin_check($1,$2)',[PW,'4321'])).ok===true && (await one('select admin_check($1,$2)',[PW,'0000'])).ok===false,'PIN amministratore giusto/sbagliato riconosciuto')
ok((await err('select member_kick($1,$2,$3,$4)',[PW,'0000','Luca',true]))?.includes('PIN_ADMIN_ERRATO'),'con il PIN sbagliato non si rimuove nessuno')
await q('select member_kick($1,$2,$3,$4)',[PW,'4321','luca',true])
ok((await err('select presenza($1,$2)',[PW,'Luca']))?.includes('SEI_STATO_RIMOSSO'),'Luca rimosso: il suo telefono lo scopre al primo "bussare"')
ok(!(await one('select members_list($1)',[PW])).includes('Luca'),'Luca sparisce dai nomi da scegliere')
ok((await err('select member_add($1,$2)',[PW,'LUCA']))?.includes('NOME_BLOCCATO'),'non può rientrare con lo stesso nome')
ok((await one('select presenza($1,$2)',[PW,''])).find(x=>x.name==='Luca').banned===true,'l\'amministratore lo vede tra i rimossi')
await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Luca',false])
ok((await one('select presenza($1,$2)',[PW,'Luca'])).find(x=>x.name==='Luca').online===true,'riammesso: Luca può rientrare')
ok((await err('select member_kick($1,$2,$3,$4)',[PW,'4321','Nessuno',true]))?.includes('NOME_NON_TROVATO'),'nome inesistente segnalato')
// foto utente
const AV = 'avatar/0b5c6a3e-1f2d-4c3b-9a8e-7d6c5b4a3f21.jpg'
ok((await one('select member_avatar($1,$2,$3)',[PW,'ricky',AV])).ok===true,'Ricky mette la foto utente ("ricky" minuscolo va bene)')
ok((await one('select presenza($1,$2)',[PW,''])).find(x=>x.name==='Ricky').avatar===AV,'la foto arriva a tutti insieme a "chi è online"')
ok((await one('select avatars_list($1)',[PW])).Ricky===AV,'e nella schermata "Chi sei?"')
ok((await one('select presenza($1,$2)',[PW,''])).filter(x=>x.name.toLowerCase()==='ricky').length===1,'la foto non crea un doppione del nome')
for (const brutto of ['https://sito-cattivo.com/x.jpg','avatar/../novita/x.jpg','novita/0b5c6a3e-1f2d-4c3b-9a8e-7d6c5b4a3f21.jpg','avatar/0b5c6a3e-1f2d-4c3b-9a8e-7d6c5b4a3f21.png',"avatar/x'.jpg"])
  ok((await err('select member_avatar($1,$2,$3)',[PW,'Ricky',brutto]))?.includes('FOTO_NON_VALIDA'),'percorso non valido rifiutato: '+brutto)
ok((await one('select avatars_list($1)',[PW])).Ricky===AV,'dopo i tentativi sbagliati la foto è ancora quella giusta')
ok((await err('select member_avatar($1,$2,$3)',['x','Ricky',AV]))?.includes('PASSWORD_ERRATA'),'foto utente protetta dalla password')
ok((await err('select avatars_list($1)',['x']))?.includes('PASSWORD_ERRATA'),'elenco delle foto protetto dalla password')
await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Luca',true])
ok((await err('select member_avatar($1,$2,$3)',[PW,'Luca',AV]))?.includes('SEI_STATO_RIMOSSO'),'chi è rimosso non può mettere la foto')
await q('select member_avatar($1,$2,$3)',[PW,'Marco','avatar/1b5c6a3e-1f2d-4c3b-9a8e-7d6c5b4a3f21.jpg'])
await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Marco',true])
ok(!('Marco' in (await one('select avatars_list($1)',[PW]))),'la foto di chi è rimosso non compare in "Chi sei?"')
await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Marco',false]); await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Luca',false])
await q('select member_avatar($1,$2,$3)',[PW,'Ricky',null])
ok(!('Ricky' in (await one('select avatars_list($1)',[PW]))) && (await one('select presenza($1,$2)',[PW,''])).find(x=>x.name==='Ricky').avatar===null,'Ricky toglie la foto')
await q('select member_avatar($1,$2,$3)',[PW,'Ricky',AV])
// storie 24 ore
const s1 = await one('select story_add($1,$2,$3,$4)',[PW,'Ricky','storie/a.jpg','Buongiorno!'])
const s2 = await one('select story_add($1,$2,$3,$4)',[PW,'Giulia','storie/b.jpg',''])
await q('select story_seen($1,$2,$3)',[PW,s1,'Marco']); await q('select story_seen($1,$2,$3)',[PW,s1,'Marco']); await q('select story_seen($1,$2,$3)',[PW,s1,'Ricky'])
let sl = await one('select stories_list($1,$2)',[PW,'Ricky'])
ok(sl.length===2 && JSON.stringify(sl.find(x=>x.id===s1).views)==='["Marco"]','Ricky vede chi ha visto la sua storia (Marco, una volta sola, lui stesso no)')
ok(sl.find(x=>x.id===s2).views===null,'Ricky non vede chi ha visto la storia di Giulia')
await q("update stories set created_at = now() - interval '25 hours' where id=$1",[s2])
ok((await one('select stories_list($1,$2)',[PW,'Ricky'])).length===1,'dopo 24 ore la storia sparisce')
await q('select story_add($1,$2,$3,$4)',[PW,'Luca','storie/c.jpg',''])
ok((await q('select count(*)::int n from stories where id=$1',[s2]))[0].n===0,'le storie scadute vengono pulite dal database')
await q('select story_comment_add($1,$2,$3,$4)',[PW,s1,'Marco','Bellissima! #buongiorno'])
const sc2 = await one('select story_comment_add($1,$2,$3,$4)',[PW,s1,'Giulia','😍'])
ok((await one('select stories_list($1,$2)',[PW,'Luca'])).find(x=>x.id===s1).comments==2,'la storia ha 2 commenti (lo vedono tutti)')
ok((await err('select story_comment_add($1,$2,$3,$4)',[PW,s1,'Luca',' ']))?.includes('POST_VUOTO'),'commento vuoto alla storia bloccato')
ok((await err('select story_comment_add($1,$2,$3,$4)',[PW,s2,'Luca','tardi']))?.includes('STORIA_SCADUTA'),'non si commenta una storia scaduta')
await q('select story_comment_del($1,$2,$3)',[PW,sc2,'Marco']); ok((await one('select story_comments($1,$2)',[PW,s1])).length===2,'Marco non cancella il commento di Giulia')
await q('select story_comment_del($1,$2,$3)',[PW,sc2,'Giulia']); ok((await one('select story_comments($1,$2)',[PW,s1])).length===1,'Giulia cancella il suo')
// ❤️ alle storie
ok((await one('select story_like($1,$2,$3,$4)',[PW,s1,'Marco',true])).likes==1,'Marco mette ❤️ alla storia di Ricky')
await q('select story_like($1,$2,$3,$4)',[PW,s1,'marco',true])
ok((await one('select story_like($1,$2,$3,$4)',[PW,s1,'Luca',true])).likes==2,'anche Luca (Marco conta una volta sola, anche scritto "marco")')
ok((await one('select story_like($1,$2,$3,$4)',[PW,s1,'Ricky',true])).likes==2,'Ricky non può mettere ❤️ alla sua storia')
sl = await one('select stories_list($1,$2)',[PW,'Ricky'])
ok(JSON.stringify(sl.find(x=>x.id===s1).likers)==='["marco","Luca"]' && sl.find(x=>x.id===s1).likes==2,'Ricky vede chi ha messo ❤️')
sl = await one('select stories_list($1,$2)',[PW,'Marco'])
ok(sl.find(x=>x.id===s1).liked===true && sl.find(x=>x.id===s1).likers===null && sl.find(x=>x.id===s1).vista===true,'Marco: il suo ❤️ è acceso, la storia risulta già vista (vale su tutti i suoi telefoni), la lista dei ❤️ non la vede')
ok((await one('select stories_list($1,$2)',[PW,'Luca'])).find(x=>x.id===s1).vista===false,'per Luca la storia non è ancora vista')
ok((await one('select story_like($1,$2,$3,$4)',[PW,s1,'Marco',false])).liked===false,'Marco toglie il ❤️')
ok((await err('select story_like($1,$2,$3,$4)',[PW,s2,'Marco',true]))?.includes('STORIA_SCADUTA'),'niente ❤️ a una storia scaduta')
ok((await err('select story_like($1,$2,$3,$4)',['x',s1,'Marco',true]))?.includes('PASSWORD_ERRATA'),'❤️ protetto dalla password')
await q('select story_del($1,$2,$3)',[PW,s1,'Marco']); ok((await one('select stories_list($1,$2)',[PW,''])).some(x=>x.id===s1),'Marco non può cancellare la storia di Ricky')
await q('select story_del($1,$2,$3)',[PW,s1,'Ricky']); ok(!(await one('select stories_list($1,$2)',[PW,''])).some(x=>x.id===s1),'Ricky cancella la sua storia')
// mi piace e risposte (stile X)
const pid = (await one('select feed($1)',[PW]))[0].id
ok(await one('select post_like($1,$2,$3)',[PW,pid,'Marco'])===true,'Marco mette mi piace')
ok(await one('select post_like($1,$2,$3)',[PW,pid,'Giulia'])===true,'Giulia mette mi piace')
ok(await one('select post_like($1,$2,$3)',[PW,pid,'marco'])===false,'Marco lo toglie (anche scritto minuscolo)')
ok(await one('select post_vote($1,$2,$3,$4)',[PW,pid,'Luca',-1])===-1,'post: Luca mette non mi piace')
ok(await one('select post_vote($1,$2,$3,$4)',[PW,pid,'Giulia',1])===0,'post: Giulia ritocca mi piace e lo toglie')
ok(await one('select post_vote($1,$2,$3,$4)',[PW,pid,'Giulia',1])===1,'post: Giulia lo rimette')
await q('select reply_add($1,$2,$3,$4)',[PW,pid,'Sara','Bellissimo! #capodanno'])
const rid = await one('select reply_add($1,$2,$3,$4)',[PW,pid,'Luca','Ci sto'])
ok((await err('select reply_add($1,$2,$3,$4)',[PW,pid,'Luca','   ']))?.includes('POST_VUOTO'),'risposta vuota bloccata')
let fp = (await one('select feed($1)',[PW]))[0]
ok(JSON.stringify(fp.likes)==='["Giulia"]' && JSON.stringify(fp.dislikes)==='["Luca"]' && fp.replies==2,'il feed mostra 1 mi piace, 1 non mi piace e 2 risposte')
await q('select reply_del($1,$2,$3)',[PW,rid,'Sara'])
ok((await one('select post_thread($1,$2)',[PW,pid])).length===2,'Sara non può cancellare la risposta di Luca')
await q('select reply_del($1,$2,$3)',[PW,rid,'Luca'])
const th = await one('select post_thread($1,$2)',[PW,pid]); ok(th.length===1 && th[0].author==='Sara','Luca cancella la sua risposta')
ok((await err('select post_thread($1,$2)',['x',pid]))?.includes('PASSWORD_ERRATA'),'risposte protette dalla password')
await q('select post_del($1,$2,$3)',[PW,pid,'Ricky'])
ok((await q('select count(*)::int n from post_likes'))[0].n===0 && (await q('select count(*)::int n from post_replies'))[0].n===0,'cancellando il post spariscono mi piace e risposte')
const al = await one('select album_create($1,$2,$3)',[PW,'Cocoricò','Ricky'])
await q('select photo_add($1,$2,$3,$4)',[PW,al,'a/b.jpg','Ricky'])
const albs = await one('select albums_list($1)',[PW]); ok(albs[0].n==1 && albs[0].cover==='a/b.jpg','album con foto e copertina')
// commenti alle foto
const fid = (await one('select album_photos($1,$2)',[PW,al]))[0].id
await q('select photo_comment_add($1,$2,$3,$4)',[PW,fid,'Marco','Che foto! #capodanno'])
const cid = await one('select photo_comment_add($1,$2,$3,$4)',[PW,fid,'Giulia','Bellissima'])
ok((await err('select photo_comment_add($1,$2,$3,$4)',[PW,fid,'Giulia','  ']))?.includes('POST_VUOTO'),'commento vuoto bloccato')
ok((await one('select album_photos($1,$2)',[PW,al]))[0].comments==2,'la foto ha 2 commenti')
await q('select photo_comment_del($1,$2,$3)',[PW,cid,'Marco']); ok((await one('select photo_comments($1,$2)',[PW,fid])).length===2,'Marco non può cancellare il commento di Giulia')
await q('select photo_comment_del($1,$2,$3)',[PW,cid,'Giulia']); const cl = await one('select photo_comments($1,$2)',[PW,fid]); ok(cl.length===1 && cl[0].author==='Marco','Giulia cancella il suo commento')
ok((await err('select photo_comments($1,$2)',['x',fid]))?.includes('PASSWORD_ERRATA'),'commenti protetti dalla password')
// mi piace / non mi piace sulle foto
ok(await one('select photo_vote($1,$2,$3,$4)',[PW,fid,'Marco',1])===1,'foto: Marco mette mi piace')
ok(await one('select photo_vote($1,$2,$3,$4)',[PW,fid,'Sara',-1])===-1,'foto: Sara mette non mi piace')
ok(await one('select photo_vote($1,$2,$3,$4)',[PW,fid,'marco',-1])===-1,'foto: Marco cambia idea (non mi piace)')
let fv = (await one('select album_photos($1,$2)',[PW,al]))[0]
ok(fv.likes.length===0 && fv.dislikes.length===2,'foto: 0 mi piace, 2 non mi piace')
ok(await one('select photo_vote($1,$2,$3,$4)',[PW,fid,'Sara',-1])===0,'foto: Sara ritocca e toglie il voto')
ok((await err('select photo_vote($1,$2,$3,$4)',[PW,fid,'Sara',5]))?.includes('VOTO_NON_VALIDO'),'voto strano rifiutato')
// sondaggi stile WhatsApp
ok((await err('select poll_create($1,$2,$3,$4,$5)',[PW,'Ricky','  ',['a','b'],false]))?.includes('DOMANDA_VUOTA'),'sondaggio senza domanda bloccato')
ok((await err('select poll_create($1,$2,$3,$4,$5)',[PW,'Ricky','Dove?',['Roma','roma ',' '],false]))?.includes('SERVONO_2_RISPOSTE'),'servono 2 risposte diverse (doppioni e vuote non contano)')
const pl = await one('select poll_create($1,$2,$3,$4,$5)',[PW,'Ricky','Dove andiamo a Capodanno?',['Casa di Anna','Montagna','Mare'],false])
let P = (await one('select polls_list($1)',[PW])).find(x=>x.id===pl)
ok(P.options.length===3 && P.options[0].label==='Casa di Anna' && !P.multi,'sondaggio creato con 3 risposte nell\'ordine giusto')
const [o1,o2] = P.options.map(o=>o.id)
await q('select poll_vote($1,$2,$3,$4)',[PW,pl,o1,'Marco']); await q('select poll_vote($1,$2,$3,$4)',[PW,pl,o1,'Giulia'])
P = await one('select poll_vote($1,$2,$3,$4)',[PW,pl,o2,'marco'])
ok(JSON.stringify(P.options.map(o=>o.voters))==='[["Giulia"],["marco"],[]]','risposta unica: Marco cambia voto e il vecchio sparisce')
P = await one('select poll_vote($1,$2,$3,$4)',[PW,pl,o2,'Marco'])
ok(P.options[1].voters.length===0,'ritoccare la stessa risposta toglie il voto')
ok((await err('select poll_vote($1,$2,$3,$4)',[PW,pl,o1,'']))?.includes('NOME_VUOTO'),'voto senza nome bloccato')
const pm = await one('select poll_create($1,$2,$3,$4,$5)',[PW,'Giulia','Che giorni siete liberi?',['Ven','Sab','Dom'],true])
const PM = (await one('select polls_list($1)',[PW])).find(x=>x.id===pm)
await q('select poll_vote($1,$2,$3,$4)',[PW,pm,PM.options[0].id,'Luca']); const PM2 = await one('select poll_vote($1,$2,$3,$4)',[PW,pm,PM.options[2].id,'Luca'])
ok(PM2.multi && PM2.options[0].voters[0]==='Luca' && PM2.options[2].voters[0]==='Luca','più risposte: Luca sceglie venerdì e domenica')
const altro = (await one('select poll_create($1,$2,$3,$4,$5)',[PW,'Sara','Altro?',['x','y'],false]))
ok((await err('select poll_vote($1,$2,$3,$4)',[PW,pl,(await one('select polls_list($1)',[PW])).find(x=>x.id===altro).options[0].id,'Luca']))?.includes('SONDAGGIO_NON_TROVATO'),'non si vota con una risposta di un altro sondaggio')
await q('select poll_close($1,$2,$3,$4)',[PW,pl,'Marco',true]); ok(!(await one('select polls_list($1)',[PW])).find(x=>x.id===pl).closed,'solo chi l\'ha creato può chiuderlo')
await q('select poll_close($1,$2,$3,$4)',[PW,pl,'Ricky',true])
ok((await err('select poll_vote($1,$2,$3,$4)',[PW,pl,o1,'Luca']))?.includes('SONDAGGIO_CHIUSO'),'sondaggio chiuso: niente più voti')
await q('select poll_del($1,$2,$3)',[PW,pl,'Giulia']); ok((await one('select polls_list($1)',[PW])).some(x=>x.id===pl),'Giulia non può eliminare il sondaggio di Ricky')
await q('select poll_del($1,$2,$3)',[PW,pl,'Ricky']); ok(!(await one('select polls_list($1)',[PW])).some(x=>x.id===pl) && (await q('select count(*)::int n from poll_votes where poll_id=$1',[pl]))[0].n===0,'Ricky lo elimina (con i voti)')
ok((await err('select polls_list($1)',['x']))?.includes('PASSWORD_ERRATA'),'sondaggi protetti dalla password')
// SECRET SANTA — regola d'oro: tutto a caso, ognuno fa UN regalo e ne riceve UNO, nessuno a se stesso, coppie escluse
const names=['Ricky','Marco','Giulia','Sara','Luca','Anna','Paolo','Elena','Gianni','Chiara','Fede']
const pinDi = n => String(1000+names.indexOf(n))
const ev = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)',[PW,'Natale 2026','30€','20/12','Ricky','1234',null])
for(const n of names){ const r = await one('select ss_join($1,$2,$3,$4,$5)',[PW,ev,n,pinDi(n),'Vorrei '+n]); if(!r.ok) console.log(r) }
ok((await err('select ss_join($1,$2,$3,$4,$5)',[PW,ev,'Marco','9999','x']))==='NOME_GIA_PRESO','nome già preso con PIN diverso bloccato')
ok((await err('select ss_draw($1,$2,$3)',[PW,ev,'0000']))==='PIN_ORGANIZZATORE_ERRATO','sorteggio con PIN organizzatore sbagliato bloccato')
ok((await err('select ss_tabella($1,$2)',[PW,ev]))===null && (await one('select ss_tabella($1,$2)',[PW,ev])).aperta===false,'verifica con le lettere chiusa prima del sorteggio')
// coppie del gruppo (le mette l'amministratore) + esclusioni speciali dell'evento
ok((await err('select couples_set($1,$2,$3)',[PW,'0000',JSON.stringify([['Ricky','Giulia']])]))==='PIN_ADMIN_ERRATO','coppie del gruppo: serve il PIN amministratore')
await q('select couples_set($1,$2,$3)',[PW,'4321',JSON.stringify([['Ricky','Giulia'],['giulia','RICKY'],['Elena','Elena']])])
ok(JSON.stringify(await one('select couples_list($1)',[PW]))==='[["Giulia","Ricky"]]','coppie del gruppo salvate (doppioni e "se stesso" ignorati)')
await q('select ss_set_excl($1,$2,$3,$4)',[PW,ev,'1234',JSON.stringify([['Marco','Sara'],['Luca','Anna']])])
const vietate = ['Giulia,Ricky','Marco,Sara','Anna,Luca']
// 300 sorteggi
let bad=0, reciproci=0; const seen=new Set()
for(let t=0;t<300;t++){
  await q('select ss_undo($1,$2,$3)',[PW,ev,'1234'])
  const d = await one('select ss_draw($1,$2,$3)',[PW,ev,'1234']); if(!d.ok){ bad++; console.log(d) }
  const c = await one('select ss_check($1,$2)',[PW,ev]); if(!c.ok){bad++; console.log(c)}
  const pairs = await q(`select g.name gn, r.name rn from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1`,[ev])
  const dai = new Set(pairs.map(p=>p.gn)), ricevono = new Set(pairs.map(p=>p.rn))
  if(pairs.length!==names.length || dai.size!==names.length || ricevono.size!==names.length) bad++
  for(const p of pairs){ if(vietate.includes([p.gn,p.rn].sort().join())) bad++; if(p.gn===p.rn) bad++ }
  const m = Object.fromEntries(pairs.map(p=>[p.gn,p.rn])); if(pairs.some(p=>m[p.rn]===p.gn)) reciproci++
  seen.add(pairs.map(p=>p.gn+'>'+p.rn).sort().join('|'))
}
ok(bad===0,'300 sorteggi: ognuno fa 1 regalo e ne riceve 1, nessuno a se stesso, coppie rispettate')
ok(seen.size>290,'sorteggi diversi tra loro ('+seen.size+'/300)')
ok(reciproci>0,'come col cappello vero, a volte due si pescano a vicenda ('+reciproci+' volte su 300)')
// privacy
ok((await err('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Marco','0000']))==='PIN_ERRATO','PIN sbagliato non rivela niente')
const rv = await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Marco',pinDi('Marco')]); ok(rv.drawn && rv.to && rv.to!=='Marco' && rv.wish.startsWith('Vorrei'),'Marco vede solo il suo: '+rv.to+' ('+rv.wish+')')
const lst = JSON.stringify(await one('select ss_list($1)',[PW])); ok(!lst.includes('"to"') && !lst.includes('receiver') && !lst.includes('"code"'),'la lista pubblica non contiene coppie né lettere')
// tabella di verifica con lettere finte
const tb = await one('select ss_tabella($1,$2)',[PW,ev])
const da = tb.righe.map(r=>r.da), aa = tb.righe.map(r=>r.a)
ok(tb.aperta && tb.righe.length===11 && new Set(da).size===11 && new Set(aa).size===11 && tb.righe.every(r=>r.da!==r.a) && tb.check.ok,'tabella con lettere: ognuna una volta a sinistra e una a destra')
ok(JSON.stringify(da)===JSON.stringify(['A','B','C','D','E','F','G','H','I','J','K']),'righe in ordine alfabetico (A…K)')
ok(!JSON.stringify(tb).includes('Marco') && !JSON.stringify(tb).includes('Ricky'),'nella tabella nessun nome vero')
// chi ha guardato (solo organizzatore)
ok((await err('select ss_status($1,$2,$3)',[PW,ev,'9999']))==='PIN_ORGANIZZATORE_ERRATO','"chi ha guardato": solo con PIN organizzatore')
let stt = await one('select ss_status($1,$2,$3)',[PW,ev,'1234'])
ok(stt.people.find(p=>p.name==='Marco').seen===true && stt.people.find(p=>p.name==='Sara').seen===false,'l\'organizzatore vede che Marco ha guardato e Sara no')
ok(!JSON.stringify(stt).includes('"to"') && !JSON.stringify(stt).includes('code'),'…senza vedere abbinamenti né lettere')
// letterina aggiornata dopo il sorteggio
await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev,'Marco',pinDi('Marco'),'Nuovo desiderio'])
const santaOfMarco = (await q(`select g.name from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1 and r.name='Marco'`,[ev]))[0].name
const rs = await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,santaOfMarco,pinDi(santaOfMarco)]); ok(rs.to==='Marco'&&rs.wish==='Nuovo desiderio','la letterina aggiornata arriva a chi fa il regalo')
// regalo preso
await q('select ss_bought($1,$2,$3,$4,$5)',[PW,ev,santaOfMarco,pinDi(santaOfMarco),true])
ok((await one('select ss_status($1,$2,$3)',[PW,ev,'1234'])).people.find(p=>p.name===santaOfMarco).bought===true,'regalo preso ✓ visibile all\'organizzatore')
// domande anonime
ok((await one('select ss_ask($1,$2,$3,$4,$5)',[PW,ev,santaOfMarco,pinDi(santaOfMarco),'Che taglia porti?'])).ok===true,'domanda anonima inviata')
let ib = await one('select ss_inbox($1,$2,$3,$4)',[PW,ev,'Marco',pinDi('Marco')])
ok(ib.per_me.length===1 && ib.per_me[0].question==='Che taglia porti?' && !JSON.stringify(ib).includes(santaOfMarco),'Marco riceve la domanda senza sapere chi l\'ha fatta')
const estraneo = names.find(n=>n!=='Marco' && n!==santaOfMarco)
ok((await err('select ss_answer($1,$2,$3,$4,$5,$6)',[PW,ev,estraneo,pinDi(estraneo),ib.per_me[0].id,'M']))==='DOMANDA_NON_TROVATA','un altro non può rispondere al posto di Marco')
await q('select ss_answer($1,$2,$3,$4,$5,$6)',[PW,ev,'Marco',pinDi('Marco'),ib.per_me[0].id,'Una M'])
ib = await one('select ss_inbox($1,$2,$3,$4)',[PW,ev,santaOfMarco,pinDi(santaOfMarco)])
ok(ib.mie.length===1 && ib.mie[0].answer==='Una M','chi ha chiesto vede la risposta')
// blocco dei PIN dopo 5 errori
for(let i=0;i<4;i++) await err('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Sara','0000'])
ok((await err('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Sara','0001']))==='PIN_BLOCCATO','5 PIN sbagliati: Sara è bloccata')
ok((await err('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Sara',pinDi('Sara')]))==='PIN_BLOCCATO','…anche col PIN giusto, per 15 minuti')
await q('select ss_reset_pin($1,$2,$3,$4,$5)',[PW,ev,'1234','sara','4321'])
ok((await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Sara','4321'])).drawn===true,'l\'organizzatore le dà un PIN nuovo e si sblocca')
ok((await one('select ss_list($1)',[PW])).find(e=>e.id===ev).log.some(l=>l.msg.includes('nuovo PIN a Sara')),'il "Nuovo PIN" finisce nel diario (niente sbirciate di nascosto)')
const ev9 = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)',[PW,'Blocco','','','Ricky','1234',null])
for(let i=0;i<5;i++) await err('select ss_admin_check($1,$2,$3)',[PW,ev9,'0000'])
ok((await err('select ss_admin_check($1,$2,$3)',[PW,ev9,'1234']))==='PIN_BLOCCATO','5 PIN organizzatore sbagliati: area organizzatore bloccata')
// ritardatario dopo il sorteggio: aspetta, poi entra e cambia UNA sola persona
const prima = Object.fromEntries((await q(`select g.name gn, r.name rn from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1`,[ev])).map(p=>[p.gn,p.rn]))
const jn = await one('select ss_join($1,$2,$3,$4,$5)',[PW,ev,'Nuovo','5555','x']); ok(jn.ok && jn.pending===true,'dopo il sorteggio chi arriva resta "in attesa"')
ok((await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Nuovo','5555'])).drawn===false,'chi è in attesa non ha ancora un abbinamento')
ok((await one('select ss_admit($1,$2,$3,$4)',[PW,ev,'1234','Nuovo'])).ok,'l\'organizzatore lo fa entrare')
const dopo = Object.fromEntries((await q(`select g.name gn, r.name rn from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1`,[ev])).map(p=>[p.gn,p.rn]))
const cambiati = names.filter(n=>prima[n]!==dopo[n])
ok(cambiati.length===1 && (await one('select ss_check($1,$2)',[PW,ev])).ok && dopo['Nuovo'] && Object.values(dopo).includes('Nuovo'),'ritardatario: cambia l\'abbinamento di 1 sola persona ('+cambiati[0]+') e la regola d\'oro resta')
const avvisato = await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,cambiati[0],pinDi(cambiati[0])])
ok(avvisato.to==='Nuovo','chi è cambiato ora fa il regalo al nuovo arrivato')
ok((await one('select ss_tabella($1,$2)',[PW,ev])).righe.length===12,'la tabella con le lettere ora ha 12 righe')
// chi si ritira dopo il sorteggio
const k = await one('select ss_kick($1,$2,$3,$4)',[PW,ev,'1234','Paolo'])
ok(k.ok && k.cambiati>=1 && k.cambiati<=2 && (await one('select ss_check($1,$2)',[PW,ev])).ok,'Paolo si ritira: cambiano solo '+k.cambiati+' abbinamenti e la regola d\'oro resta')
// sorteggio rifatto: chi aveva guardato viene avvisato
await q('select ss_undo($1,$2,$3)',[PW,ev,'1234']); await q('select ss_draw($1,$2,$3)',[PW,ev,'1234'])
ok((await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Marco',pinDi('Marco')])).rifatto===true,'sorteggio rifatto: Marco viene avvisato di riguardare')
ok((await one('select ss_list($1)',[PW])).find(e=>e.id===ev).log.some(l=>l.msg.includes('annullato il sorteggio')),'"annulla sorteggio" finisce nel diario')
ok((await one('select ss_inbox($1,$2,$3,$4)',[PW,ev,'Marco',pinDi('Marco')])).per_me.length===0,'con un sorteggio nuovo le domande vecchie spariscono')
// esclusioni impossibili: dice chi è il problema
const ev2 = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)',[PW,'Prova','','','Ricky','1234',null])
for(const n of ['A','B','C']) await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev2,n,'1111',''])
await q('select ss_set_excl($1,$2,$3,$4)',[PW,ev2,'1234',JSON.stringify([['A','B']])])
const imp = await one('select ss_draw($1,$2,$3)',[PW,ev2,'1234'])
ok(imp.err==='ESCLUSIONI_IMPOSSIBILI' && /A|B|C/.test(imp.chi),'esclusioni impossibili segnalate con i nomi ('+imp.chi+')')
// l'anno dopo: nessuno ripesca la stessa persona
const evN = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)',[PW,'Natale 2027','','','Ricky','1234',ev])
for(const n of names.filter(n=>n!=='Paolo')) await q('select ss_join($1,$2,$3,$4,$5)',[PW,evN,n,pinDi(n),''])
await q('select ss_join($1,$2,$3,$4,$5)',[PW,evN,'Nuovo','5555',''])
const anno1 = Object.fromEntries((await q(`select g.name gn, r.name rn from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1`,[ev])).map(p=>[p.gn,p.rn]))
let ripetuti = 0
for(let t=0;t<40;t++){
  await q('select ss_undo($1,$2,$3)',[PW,evN,'1234']); const d = await one('select ss_draw($1,$2,$3)',[PW,evN,'1234'])
  if(d.rilassato) ripetuti += 100
  for(const p of await q(`select g.name gn, r.name rn from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1`,[evN])) if(anno1[p.gn]===p.rn) ripetuti++
}
ok(ripetuti===0,'"Rifai per il prossimo anno": in 40 sorteggi nessuno ripesca la stessa persona dell\'anno prima')
ok((await one('select ss_list($1)',[PW])).find(e=>e.id===evN).excl.length===2,'le esclusioni speciali vengono copiate nel nuovo anno')
// nomi con maiuscole diverse = stessa persona; uscita prima del sorteggio
const ev3 = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)',[PW,'Maiuscole','','','Ricky','1234',null])
await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev3,'Giulia','1111','a'])
ok((await err('select ss_join($1,$2,$3,$4,$5)',[PW,ev3,'giulia','2222','b']))==='NOME_GIA_PRESO','"giulia" non può rubare il posto a "Giulia"')
await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev3,'Luca','3333',''])
await q('select ss_set_excl($1,$2,$3,$4)',[PW,ev3,'1234',JSON.stringify([['Giulia','Luca']])])
await q('select ss_kick($1,$2,$3,$4)',[PW,ev3,'1234','LUCA'])
const l3 = (await one('select ss_list($1)',[PW])).find(e=>e.id===ev3)
ok(l3.people.length===1 && l3.excl.length===0,'tolto Luca: sparisce anche dalle esclusioni')
await q('select ss_leave($1,$2,$3,$4)',[PW,ev3,'giulia','1111'])
ok((await one('select ss_list($1)',[PW])).find(e=>e.id===ev3).people.length===0,'Giulia esce col suo PIN')
ok((await err('select ss_leave($1,$2,$3,$4)',[PW,ev,'Marco',pinDi('Marco')]))==='CHIEDI_ORGANIZZATORE','dopo il sorteggio per uscire bisogna chiedere all\'organizzatore')
// FOTO DA CANCELLARE: storie dopo 24 ore, foto dei post dopo 7 giorni (tranne i post in evidenza); il resto resta
{
  const pFisso = await one('select post_add($1,$2,$3,$4)',[PW,'Ricky','Post in evidenza con foto',['novita/fisso.jpg']])
  const pVecchio = await one('select post_add($1,$2,$3,$4)',[PW,'Marco','Foto vecchia',['novita/vecchio.jpg']])
  await q(`update posts set created_at = now() - interval '8 days' where id = any($1)`,[[pFisso, pVecchio]])
  await q('select post_pin($1,$2,$3,$4)',[PW,pFisso,'4321',true])
  await q(`insert into storage.objects(bucket_id, name, created_at) values
    ('foto','storie/vecchia.jpg', now() - interval '25 hours'), ('foto','storie/vecchia_t.jpg', now() - interval '25 hours'),
    ('foto','storie/nuova.jpg', now() - interval '2 hours'),
    ('foto','novita/vecchio.jpg', now() - interval '8 days'), ('foto','novita/vecchio_t.jpg', now() - interval '8 days'),
    ('foto','novita/fisso.jpg', now() - interval '8 days'), ('foto','novita/fisso_t.jpg', now() - interval '8 days'),
    ('foto','novita/recente.jpg', now() - interval '6 days'),
    ('foto','album/x/foto.jpg', now() - interval '30 days'), ('foto','avatar/io.jpg', now() - interval '30 days'),
    ('foto','eventi/cena.jpg', now() - interval '30 days'), ('altro','storie/z.jpg', now() - interval '3 days')`)
  const scad = await one('select foto_scadute($1)',[PW])
  ok(JSON.stringify(scad.slice().sort())===JSON.stringify(['novita/vecchio.jpg','novita/vecchio_t.jpg','storie/vecchia.jpg','storie/vecchia_t.jpg']),
    'da cancellare: storie con più di 24 ore e foto dei post con più di 7 giorni (non quelle in evidenza, recenti, cartelle, foto utente, eventi)')
  ok((await err('select foto_scadute($1)',['x']))==='PASSWORD_ERRATA','elenco protetto dalla password')
  const f = await one('select feed($1)',[PW]), fv = f.find(p=>p.id===pVecchio), ff = f.find(p=>p.id===pFisso)
  ok(fv.photos.length===0 && fv.foto_scadute===true && ff.photos[0]==='novita/fisso.jpg' && ff.foto_scadute===false,'nelle Novità: post di più di 7 giorni senza foto ("foto scadute"), quello in evidenza le tiene')
  await q('select post_pin($1,$2,$3,$4)',[PW,pFisso,'4321',false])
  ok((await one('select foto_scadute($1)',[PW])).includes('novita/fisso.jpg'),'tolto dall\'evidenza, anche le sue foto vecchie si cancellano')
  const storageSql = fs.readFileSync(new URL('./storage.sql', import.meta.url),'utf8')
  const pol = [...storageSql.matchAll(/create policy "[^"]+" on storage\.objects for (\w+) to anon, authenticated\s+(?:using|with check) \(([^;]*)\);/g)]
  ok(pol.length===3 && pol.filter(m=>m[1]==='select'||m[1]==='delete').every(m=>m[2].includes('public.foto_cancellabile(name, created_at)')) && pol.find(m=>m[1]==='insert'),
    'lo spazio foto lascia vedere e cancellare alla chiave pubblica SOLO le foto scadute (stessa regola)')
  await q('delete from storage.objects where true'); await q('delete from posts where id = any($1)',[[pFisso, pVecchio]])
}

// POST IN EVIDENZA (sezione con la puntina, max 5, solo amministratore)
{
  const ids = []
  for (const t of ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei']) ids.push(await one('select post_add($1,$2,$3,$4)',[PW,'Marco','Fissami '+t,[]]))
  ok((await err('select post_pin($1,$2,$3,$4)',[PW,ids[0],'0000',true]))==='PIN_ADMIN_ERRATO','senza PIN amministratore giusto non si fissa niente')
  for (const id of ids.slice(0,5)) ok((await one('select post_pin($1,$2,$3,$4)',[PW,id,'4321',true])).ok===true,'post fissato')
  ok((await err('select post_pin($1,$2,$3,$4)',[PW,ids[5],'4321',true]))==='TROPPI_FISSATI','il sesto no: al massimo 5 post in evidenza')
  ok((await one('select post_pin($1,$2,$3,$4)',[PW,ids[0],'4321',true])).ok===true,'rifissare uno già fissato va bene (resta uno dei 5)')
  let f = await one('select feed($1)',[PW])
  ok(f.filter(p=>p.pinned_at).length===5 && f.find(p=>p.id===ids[5]).pinned_at===null,'il feed dice quali sono fissati')
  await q('select post_pin($1,$2,$3,$4)',[PW,ids[1],'4321',false])
  ok((await one('select post_pin($1,$2,$3,$4)',[PW,ids[5],'4321',true])).ok===true,'tolto uno, se ne può fissare un altro')
  // un post fissato resta nel feed anche se è vecchissimo (oltre i 150 più recenti)
  await q(`update posts set created_at = now() - interval '2 years' where id = $1`,[ids[0]])
  for (let i = 0; i < 151; i++) await q('select post_add($1,$2,$3,$4)',[PW,'Luca','riempitivo '+i,[]])
  f = await one('select feed($1)',[PW])
  ok(f.some(p=>p.id===ids[0] && p.pinned_at) && !f.some(p=>p.id===ids[1]),'il post fissato vecchio resta visibile, quello non fissato esce dai 150')
  ok((await err('select post_pin($1,$2,$3,$4)',[PW,'00000000-0000-0000-0000-000000000000','4321',true]))==='POST_NON_TROVATO','post inesistente segnalato')
  ok((await err('select post_pin($1,$2,$3,$4)',['x',ids[0],'4321',false]))==='PASSWORD_ERRATA','protetto dalla password')
  for (const id of ids) await q('select post_pin($1,$2,$3,$4)',[PW,id,'4321',false])
  await q(`delete from posts where body like 'riempitivo %' or body like 'Fissami %'`)
}

// CALENDARIO EVENTI
const giorno = k => { const d = new Date(Date.now() + k * 864e5); return d.toISOString().slice(0, 10) }
const COV = 'eventi/0b5c6a3e-1f2d-4c3b-9a8e-7d6c5b4a3f21.jpg'
const cena = await one('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Ricky','Cena da Marco','Casa di Marco','Porto io il vino #cena',giorno(3),'20:30',COV,null])
let listaEv = await one('select events_list($1)',[PW]), c1 = listaEv.find(e=>e.id===cena)
ok(c1 && c1.day===giorno(3) && c1.ora==='20:30' && c1.cover===COV && c1.voting===false && c1.place==='Casa di Marco','evento con giorno, ora, luogo e copertina')
ok((await err('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Ricky','  ','','',giorno(3),null,null,null]))==='TITOLO_VUOTO','senza titolo: rifiutato')
ok((await err('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Ricky','Festa','','',null,null,null,null]))==='DATA_VUOTA','senza data (e senza date da votare): rifiutato')
ok((await err('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Ricky','Festa','','',giorno(9000),null,null,null]))==='DATA_NON_VALIDA','data assurda (tra 25 anni): rifiutata')
for (const brutto of ['https://x.com/a.jpg','eventi/../novita/x.jpg','avatar/0b5c6a3e-1f2d-4c3b-9a8e-7d6c5b4a3f21.jpg'])
  ok((await err('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Ricky','Festa','','',giorno(3),null,brutto,null]))==='FOTO_NON_VALIDA','copertina non valida rifiutata: '+brutto)
ok((await err('select events_list($1)',['x']))==='PASSWORD_ERRATA' && (await err('select event_get($1,$2)',['x',cena]))==='PASSWORD_ERRATA','calendario protetto dalla password')
// chi viene
await q('select event_rsvp($1,$2,$3,$4)',[PW,cena,'Marco','si']); await q('select event_rsvp($1,$2,$3,$4)',[PW,cena,'Giulia','forse'])
let rsv = await one('select event_rsvp($1,$2,$3,$4)',[PW,cena,'marco','no'])
ok(rsv.no.length===1 && rsv.si.length===0 && rsv.forse[0]==='Giulia','una sola risposta a testa ("marco" cambia idea: da "Ci sono" a "Non ci sono")')
rsv = await one('select event_rsvp($1,$2,$3,$4)',[PW,cena,'Marco','si']); await q('select event_rsvp($1,$2,$3,$4)',[PW,cena,'Giulia',null])
rsv = (await one('select event_get($1,$2)',[PW,cena])).rsvp
ok(rsv.si.length===1 && rsv.forse.length===0 && rsv.no.length===0,'Giulia toglie la sua risposta')
ok((await err('select event_rsvp($1,$2,$3,$4)',[PW,cena,'Luca','boh']))==='RISPOSTA_NON_VALIDA','risposta strana rifiutata')
// commenti
const cm1 = await one('select event_comment_add($1,$2,$3,$4)',[PW,cena,'Marco','Chi passa a prendermi?'])
await q('select event_comment_add($1,$2,$3,$4)',[PW,cena,'Giulia','Io!'])
await q('select event_comment_del($1,$2,$3)',[PW,cm1,'Giulia'])
let fullEv = await one('select event_get($1,$2)',[PW,cena])
ok(fullEv.comments.length===2 && fullEv.n_comments===2 && fullEv.body==='Porto io il vino #cena','commenti: Giulia non può cancellare quello di Marco')
await q('select event_comment_del($1,$2,$3)',[PW,cm1,'marco'])
ok((await one('select event_get($1,$2)',[PW,cena])).comments.length===1,'Marco cancella il suo commento')
// modifica ed eliminazione
ok((await err('select event_edit($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,cena,'Marco','Mia!','','',giorno(4),null,null]))==='NON_AUTORIZZATO','solo chi l\'ha creato può modificarlo')
fullEv = await one('select event_edit($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,cena,'ricky','Cena da Marco 🍝','Casa di Marco','Porto io il vino',giorno(4),'21:00',COV])
ok(fullEv.title==='Cena da Marco 🍝' && fullEv.day===giorno(4) && fullEv.ora==='21:00','Ricky sposta la cena al giorno dopo alle 21')
ok((await err('select event_del($1,$2,$3,$4)',[PW,cena,'Marco','']))==='NON_AUTORIZZATO','Marco non può eliminare l\'evento di Ricky')
ok((await err('select event_del($1,$2,$3,$4)',[PW,cena,'Marco','0000']))==='PIN_ADMIN_ERRATO','con il PIN amministratore sbagliato no')
// scegliamo la data insieme
const DATE_P = [{day:giorno(10),ora:'20:00'},{day:giorno(11),ora:''},{day:giorno(12),ora:'21:30'},{day:giorno(10),ora:'20:00'}]
const pizza = await one('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Giulia','Pizzata','','',null,null,null,JSON.stringify(DATE_P)])
let pz = await one('select event_get($1,$2)',[PW,pizza])
ok(pz.voting===true && pz.day===null && pz.dates.length===3 && pz.dates[0].ora==='20:00' && pz.dates[1].ora===null,'votazione con 3 date (il doppione è tolto, l\'ora è facoltativa)')
ok((await err('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Giulia','X','','',null,null,null,JSON.stringify([{day:giorno(5)}])]))==='SERVONO_2_DATE','con 1 sola data proposta: rifiutato')
ok((await err('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Giulia','X','','',null,null,null,JSON.stringify([1,2,3,4,5,6].map(k=>({day:giorno(k)})))]))==='TROPPE_DATE','con 6 date: rifiutato')
ok((await err('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Giulia','X','','',null,null,null,JSON.stringify([{day:'ciao'},{day:giorno(5)}])]))==='DATA_NON_VALIDA','data scritta male: rifiutata')
await q('select event_date_vote($1,$2,$3)',[PW,pz.dates[0].id,'Marco']); await q('select event_date_vote($1,$2,$3)',[PW,pz.dates[2].id,'Marco'])
await q('select event_date_vote($1,$2,$3)',[PW,pz.dates[2].id,'Luca'])
let dts = await one('select event_date_vote($1,$2,$3)',[PW,pz.dates[0].id,'marco'])
ok(dts[0].voters.length===0 && dts[2].voters.length===2,'più date a testa, e un secondo tocco toglie il voto')
ok((await err('select event_fix_date($1,$2,$3,$4)',[PW,pizza,'Marco',pz.dates[2].id]))==='NON_AUTORIZZATO','solo chi organizza fissa la data')
pz = await one('select event_fix_date($1,$2,$3,$4)',[PW,pizza,'Giulia',pz.dates[2].id])
ok(pz.voting===false && pz.day===giorno(12) && pz.ora==='21:30','Giulia fissa la data più votata')
ok((await err('select event_date_vote($1,$2,$3)',[PW,(await q('select id from event_dates where event_id=$1',[pizza]))[0].id,'Sara']))==='VOTAZIONE_CHIUSA','dopo, la votazione è chiusa')
listaEv = await one('select events_list($1)',[PW])
ok(listaEv.length===2 && listaEv[0].id===cena && listaEv[1].id===pizza,'elenco in ordine di data')
// elimina: l'amministratore col PIN giusto, e Giulia la sua
ok((await one('select event_del($1,$2,$3,$4)',[PW,cena,'Marco','4321'])).ok===true,'l\'amministratore elimina un evento col PIN')
await q('select event_del($1,$2,$3,$4)',[PW,pizza,'Giulia',''])
ok((await one('select events_list($1)',[PW])).length===0 && (await q('select count(*)::int n from event_dates'))[0].n===0,'eliminati, con risposte, commenti e date')
for (const t of ['events','event_rsvp','event_comments','event_dates','event_date_votes']) {
  let negato = false; try { await db.exec(`set role anon; select * from ${t};`) } catch (e) { negato = /permission/.test(e.message) } finally { await db.exec('reset role') }
  ok(negato, `tabella ${t} chiusa alla chiave pubblica`)
}

// COPPIE DEL GRUPPO con nomi scritti in modo diverso (emoji, maiuscole, spazi): valgono lo stesso
{
  await q('select couples_set($1,$2,$3)',[PW,'4321',JSON.stringify([['Bea💕','Cava 🐴'],['Fra 💗','Nico']])])
  const evc = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)',[PW,'Natale emoji','','','Ricky','1234',null])
  for (const [n, pin] of [['Bea','1111'],['cava','2222'],['Fra💗','3333'],['NICO','4444'],['Ema','5555'],['Ricky','6666']]) await q('select ss_join($1,$2,$3,$4,$5)',[PW,evc,n,pin,''])
  let violazioni = 0, giri = 0
  for (let t = 0; t < 200; t++) {
    if (t) await q('select ss_undo($1,$2,$3)',[PW,evc,'1234'])
    const d = await one('select ss_draw($1,$2,$3)',[PW,evc,'1234']); if (!d.ok) continue; giri++
    for (const r of await q(`select g.name gn, r.name rn from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1`,[evc]))
      if ([['Bea','cava'],['cava','Bea'],['Fra💗','NICO'],['NICO','Fra💗']].some(([x,y]) => r.gn===x && r.rn===y)) violazioni++
  }
  ok(giri===200 && violazioni===0, `coppie del gruppo "Bea💕 ↔ Cava 🐴" e "Fra 💗 ↔ Nico" rispettate anche se iscritti come "Bea", "cava", "Fra💗", "NICO" (${giri} sorteggi)`)
  ok((await one('select ss_check($1,$2)',[PW,evc])).ok===true,'la verifica conferma: sorteggio regolare')
  // un sorteggio fatto "a mano" con una coppia insieme viene segnalato dalla verifica
  const ids = Object.fromEntries((await q('select id, name from ss_people where event_id=$1',[evc])).map(r=>[r.name,r.id]))
  await q('delete from ss_pairs where event_id=$1',[evc])
  const giro = ['Bea','cava','Fra💗','NICO','Ema','Ricky']
  for (let i = 0; i < giro.length; i++) await q('insert into ss_pairs(event_id, giver, receiver) values ($1,$2,$3)',[evc, ids[giro[i]], ids[giro[(i+1)%giro.length]]])
  const ck = await one('select ss_check($1,$2)',[PW,evc])
  ok(ck.ok===false && ck.excluded_pairs===2,'se una coppia si pesca, la verifica lo scopre (2 abbinamenti vietati)')
  await q('select ss_event_del($1,$2,$3)',[PW,evc,'1234'])
  await q('select couples_set($1,$2,$3)',[PW,'4321','[]'])
}

// NOTIFICHE SUL TELEFONO
{
const comeRuolo = async (ruolo, sql, p = []) => { await db.exec(`set role ${ruolo}`); try { return await one(sql, p) } finally { await db.exec('reset role') } }
const claim = id => comeRuolo('service_role', 'select notif_claim($1)', [id])
const negato = async (ruolo, sql) => { try { await comeRuolo(ruolo, sql); return false } catch (e) { return /permission/.test(e.message) } }
await q('delete from notif_queue')
await q('select story_add($1,$2,$3,$4)',[PW,'Giulia','storie/x.jpg','Al mare!'])
const postN = await one('select post_add($1,$2,$3,$4)',[PW,'Marco','Stasera   calcetto?\nChi c\'è',[]])
await q('select post_add($1,$2,$3,$4)',[PW,'Ricky','📅 Nuovo evento: «X» #evento',[]])
const domaniRoma = await one(`select ((now() at time zone 'Europe/Rome')::date + 1)::text`)
const evN = await one('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Sara','Cena','Da Sara','',domaniRoma,'20:00',null,null])
const evV = await one('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Luca','Gita','','',null,null,null,JSON.stringify([{day:giorno(5)},{day:giorno(6)}])])
await q('select event_fix_date($1,$2,$3,$4)',[PW,evV,'Luca',(await one('select event_get($1,$2)',[PW,evV])).dates[1].id])
let coda = await q('select * from notif_queue order by id')
ok(coda.length===5,'5 notifiche in coda: storia, post, evento, votazione, data fissata (l\'annuncio "📅" non fa doppione)')
ok(coda[0].kind==='storie' && coda[0].author==='Giulia' && coda[0].url==='#storie' && coda[0].body==='Al mare!' && coda[0].title==='📸 Giulia','storia: "📸 Giulia – Al mare!" → apre le storie')
ok(coda[1].kind==='post' && coda[1].url==='#post/'+postN && coda[1].body==='Stasera calcetto? Chi c\'è' && coda[1].title==='💬 Marco','post: testo su una riga → apre il post')
ok(coda[2].kind==='eventi' && coda[2].title==='📅 Cena' && coda[2].body.startsWith('Nuovo evento di Sara: ') && coda[2].body.endsWith(' ore 20:00 · Da Sara') && coda[2].url==='#calendario/'+evN,'evento: giorno in italiano, ora e luogo → apre l\'evento')
ok(coda[3].body.includes('vota la data') && coda[4].title==='📅 Data fissata: Gita','votazione della data e "Data fissata"')
// iscrizioni dei telefoni
const EP = n => `https://fcm.googleapis.com/fcm/send/telefono-${n}-abcdefgh`, P256 = 'B' + 'Aa'.repeat(43), AUTH = 'abcdefghijklmnopqrstuv'
ok((await one('select push_subscribe($1,$2,$3,$4,$5,$6)',[PW,'Ricky',EP(1),P256,AUTH,['storie','post','eventi','hack']])).kinds.length===3,'iscrizione: tipi strani scartati')
await q('select push_subscribe($1,$2,$3,$4,$5,$6)',[PW,'Marco',EP(2),P256,AUTH,['eventi']])
await q('select push_subscribe($1,$2,$3,$4,$5,$6)',[PW,'Giulia',EP(3),P256,AUTH,['storie','post','eventi']])
await q('select push_subscribe($1,$2,$3,$4,$5,$6)',[PW,'Luca',EP(4),P256,AUTH,['storie','post','eventi']])
await q('select push_subscribe($1,$2,$3,$4,$5,$6)',[PW,'Sara',EP(4),P256,AUTH,['storie','post','eventi']])
ok((await q('select name from push_subs where endpoint=$1',[EP(4)]))[0].name==='Sara' && (await q('select count(*)::int n from push_subs'))[0].n===4,'stesso telefono con un altro nome: aggiornato, niente doppioni')
for (const [ep, p, a, m] of [['http://x.com/abcdefghijkl',P256,AUTH,'indirizzo non https'],[EP(9),'chiave con spazi '.repeat(4),AUTH,'chiave strana'],[EP(9),P256,'',' senza auth']])
  ok((await err('select push_subscribe($1,$2,$3,$4,$5,$6)',[PW,'Ricky',ep,p,a,['post']]))==='NOTIFICHE_NON_VALIDE','iscrizione rifiutata: '+m)
ok((await err('select push_subscribe($1,$2,$3,$4,$5,$6)',['x','Ricky',EP(9),P256,AUTH,['post']]))==='PASSWORD_ERRATA','iscrizione protetta dalla password')
// a chi arriva
const dest = r => (r ? r.subs.map(s => s.endpoint).sort() : null)
ok(JSON.stringify(dest(await claim(coda[0].id)))===JSON.stringify([EP(1),EP(4)]),'storia di Giulia: arriva a Ricky e Sara (non a Giulia, non a Marco che vuole solo gli eventi)')
ok((await claim(coda[0].id))===null,'la stessa notifica si manda una volta sola')
ok(JSON.stringify(dest(await claim(coda[1].id)))===JSON.stringify([EP(1),EP(3),EP(4)]),'post di Marco: a Ricky, Giulia e Sara')
await q('select member_add($1,$2)',[PW,'Giulia']); await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Giulia',true])
const c2 = await claim(coda[2].id)
ok(JSON.stringify(dest(c2))===JSON.stringify([EP(1),EP(2)]) && c2.title==='📅 Cena' && c2.url==='#calendario/'+evN,'evento di Sara: a Ricky e Marco (Giulia è stata rimossa)')
ok((await err('select push_subscribe($1,$2,$3,$4,$5,$6)',[PW,'Giulia',EP(3),P256,AUTH,['post']]))==='SEI_STATO_RIMOSSO','chi è rimosso non può iscriversi')
await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Giulia',false])
// promemoria il giorno prima
await q('select event_rsvp($1,$2,$3,$4)',[PW,evN,'Marco','no'])
ok((await one('select _notif_promemoria()'))===1 && (await one('select _notif_promemoria()'))===0,'promemoria per la cena di domani, una volta sola')
const prom = (await q(`select * from notif_queue where title like '⏰%'`))[0], cp = await claim(prom.id)
ok(prom.title==='⏰ Domani: Cena' && prom.body==='ore 20:00 · Da Sara' && JSON.stringify(dest(cp))===JSON.stringify([EP(1),EP(3),EP(4)]),'promemoria "⏰ Domani: Cena": non a Marco, che ha detto "Non ci sono"')
// commenti alle storie: notifiche personali (arrivano anche a chi non ha scelto le "storie")
const stM = await one('select story_add($1,$2,$3,$4)',[PW,'Marco','storie/m.jpg',''])
const n0 = (await q('select max(id)::int m from notif_queue'))[0].m
await q('select story_comment_add($1,$2,$3,$4)',[PW,stM,'Sara','Che bella!'])
await q('select story_comment_add($1,$2,$3,$4)',[PW,stM,'Giulia','Wow'])
await q('select story_comment_add($1,$2,$3,$4)',[PW,stM,'Marco','Grazie   a tutti'])
const cq = await q('select * from notif_queue where id > $1 order by id',[n0])
ok(cq.length===4,'3 commenti alla storia di Marco → 4 notifiche personali')
ok(cq[0].title==='💬 Sara ha commentato la tua storia' && cq[0].body==='Che bella!' && cq[0].url==='#storie/'+stM && JSON.stringify(dest(await claim(cq[0].id)))===JSON.stringify([EP(2)]),'Sara commenta: arriva solo a Marco (anche se lui ha scelto solo gli eventi), il tocco apre quella storia')
ok(cq[1].title==='💬 Giulia ha commentato la tua storia' && JSON.stringify(dest(await claim(cq[1].id)))===JSON.stringify([EP(2)]) && cq[2].title==='💬 Giulia sulla storia di Marco' && JSON.stringify(dest(await claim(cq[2].id)))===JSON.stringify([EP(4)]),'Giulia commenta: a Marco ("la tua storia") e a Sara, che aveva già commentato')
ok(cq[3].title==='💬 Marco ha risposto nella sua storia' && cq[3].body==='Grazie a tutti' && JSON.stringify(dest(await claim(cq[3].id)))===JSON.stringify([EP(3),EP(4)]),'Marco risponde: a Giulia e Sara, non a se stesso')
// chiavi e permessi
ok((await comeRuolo('service_role','select vapid_set($1,$2)',['PUB1','PRIV1'])).pub==='PUB1' && (await comeRuolo('service_role','select vapid_set($1,$2)',['PUB2','PRIV2'])).pub==='PUB1','chiavi delle notifiche create una volta sola')
ok((await comeRuolo('anon','select push_key($1)',[PW])).pub==='PUB1','il sito legge solo la chiave pubblica')
for (const f of ['select notif_claim(1)','select vapid_get()',"select vapid_set('a','b')","select push_gone('x')","select _notif_promemoria()","select _notifica('post','a','b','c','d',null)"])
  ok(await negato('anon',f),'vietato alla chiave pubblica: '+f.slice(7,27))
for (const t of ['push_subs','notif_queue']) ok(await negato('anon',`select * from ${t}`),`tabella ${t} chiusa alla chiave pubblica`)
// con l'indirizzo della funzione impostato ma senza pg_net (come in questa prova): i post si pubblicano lo stesso
await q(`insert into app_config(k,v) values ('notif_url','https://esempio.supabase.co/functions/v1/notifica'),('notif_key','x')`)
const prima = (await q('select count(*)::int n from notif_queue'))[0].n
await q('select post_add($1,$2,$3,$4)',[PW,'Anna','Ciao!',[]])
ok((await q('select count(*)::int n from notif_queue'))[0].n===prima+1,'senza pg_net il post si pubblica e la notifica resta in coda')
await q('select push_unsubscribe($1,$2)',[PW,EP(1)]); await comeRuolo('service_role','select push_gone($1)',[EP(2)])
ok((await q('select count(*)::int n from push_subs'))[0].n===2,'disiscrizione dal telefono e telefoni spariti tolti')
await q(`delete from app_config where k in ('notif_url','notif_key','vapid_pub','vapid_priv')`)
}

// CAMPANELLA: ognuno vede solo le interazioni degli altri con le sue cose
{
  const att = async n => (await one('select attivita_list($1,$2)',[PW,n])).items
  const nuove = n => one('select attivita_nuove($1,$2)',[PW,n])
  await q('delete from attivita')
  const pR = await one('select post_add($1,$2,$3,$4)',[PW,'Ricky','Chi viene\n al mare?',[]])
  await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Ricky',1])
  await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Marco',1])
  await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Luca',-1])
  const rp = await one('select reply_add($1,$2,$3,$4)',[PW,pR,'Giulia','Io!   ci sono'])
  let a = await att('ricky')
  ok(a.length===2 && a[0].tipo==='risposta' && a[0].chi==='Giulia' && a[0].testo==='Io! ci sono' && a[0].cosa==='Chi viene al mare?' && a[0].url==='#post/'+pR && a[1].tipo==='like' && a[1].chi==='Marco',
    'campanella di Ricky: Giulia ha risposto, Marco ha messo mi piace (il suo mi piace e i 👎 no)')
  ok(await nuove('Ricky')===2 && await nuove('RICKY')===2,'2 attività nuove per Ricky (maiuscole non contano)')
  ok((await att('Marco')).length===0 && await nuove('Marco')===0,'Marco non vede le attività di Ricky')
  await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Marco',1]); await q('select reply_del($1,$2,$3)',[PW,rp,'Giulia'])
  ok((await att('Ricky')).length===0,'mi piace tolto e risposta cancellata: spariscono anche dalla campanella')
  await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Marco',1]); await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Marco',-1])
  ok((await att('Ricky')).length===0,'mi piace cambiato in 👎: sparisce')
  for (let i = 0; i < 3; i++) await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Marco',1])
  ok((await att('Ricky')).length===1,'mi piace messo e tolto più volte: una sola attività')
  await q('select attivita_viste($1,$2,$3)',[PW,'Ricky',(await att('Ricky'))[0].created_at])
  ok(await nuove('Ricky')===0 && (await one('select attivita_list($1,$2)',[PW,'ricky'])).viste!==null,'Ricky apre la campanella: niente più attività nuove (vale su tutti i suoi telefoni)')
  await q('select attivita_viste($1,$2,$3)',[PW,'Ricky','2000-01-01']); ok(await nuove('Ricky')===0,'"viste" non torna mai indietro')
  // storie, foto, eventi, sondaggi
  const st = await one('select story_add($1,$2,$3,$4)',[PW,'Ricky','storie/z.jpg','Tramonto'])
  await q('select story_like($1,$2,$3,$4)',[PW,st,'Sara',true])
  await q('select story_comment_add($1,$2,$3,$4)',[PW,st,'Marco','Che colori'])
  await q('select story_comment_add($1,$2,$3,$4)',[PW,st,'Sara','Bellissimo'])
  const alb = await one('select album_create($1,$2,$3)',[PW,'Montagna','Giulia'])
  await q('select photo_add($1,$2,$3,$4)',[PW,alb,'album/x/r.jpg','Ricky'])
  const fR = (await one('select album_photos($1,$2)',[PW,alb]))[0].id
  await q('select photo_vote($1,$2,$3,$4)',[PW,fR,'Luca',1]); await q('select photo_comment_add($1,$2,$3,$4)',[PW,fR,'Luca','Che panorama'])
  const ev = await one('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Ricky','Pizzata','','',giorno(4),null,null,null])
  await q('select event_rsvp($1,$2,$3,$4)',[PW,ev,'Marco','si']); await q('select event_rsvp($1,$2,$3,$4)',[PW,ev,'Marco','forse'])
  await q('select event_comment_add($1,$2,$3,$4)',[PW,ev,'Giulia','Porto le birre'])
  const sp = await one('select poll_create($1,$2,$3,$4,$5)',[PW,'Ricky','Quando?',['Ven','Sab'],true])
  const [v1, v2] = (await one('select polls_list($1)',[PW])).find(x=>x.id===sp).options.map(o=>o.id)
  await q('select poll_vote($1,$2,$3,$4)',[PW,sp,v1,'Sara']); await q('select poll_vote($1,$2,$3,$4)',[PW,sp,v2,'Sara'])
  a = await att('Ricky')
  const tipi = a.map(x => x.tipo + ':' + x.chi).sort().join()
  ok(tipi === ['commento_evento:Giulia','commento_foto:Luca','commento_storia:Marco','commento_storia:Sara','cuore:Sara','evento_forse:Marco','like:Marco','like_foto:Luca','voto:Sara'].join(),
    'campanella di Ricky: ❤️ e commenti alla storia, 👍 e commento alla foto, "forse" e commento all\'evento, voto al sondaggio (una volta sola anche con 2 risposte) → '+tipi)
  ok(a.find(x=>x.tipo==='commento_foto').cosa==='Montagna' && a.find(x=>x.tipo==='commento_foto').url==='#foto/'+alb && a.find(x=>x.tipo==='evento_forse').cosa==='Pizzata' && a.find(x=>x.tipo==='voto').url==='#sondaggi' && a.find(x=>x.tipo==='cuore').url==='#storie/'+st,
    'ogni attività dice su cosa ("Montagna", "Pizzata"…) e dove porta il tocco')
  ok(await nuove('Ricky')===8,'8 attività nuove (il mi piace di Marco l\'aveva già visto): la campanella si illumina')
  const aM = await att('Marco')
  ok(aM.length===1 && aM[0].tipo==='commento_storia_altri' && aM[0].chi==='Sara' && aM[0].cosa==='Ricky','Marco: Sara ha commentato la storia di Ricky dove aveva commentato anche lui')
  await q('select poll_vote($1,$2,$3,$4)',[PW,sp,v1,'Sara'])
  ok((await att('Ricky')).some(x=>x.tipo==='voto'),'Sara toglie una delle 2 risposte: il voto resta')
  await q('select poll_vote($1,$2,$3,$4)',[PW,sp,v2,'Sara'])
  ok(!(await att('Ricky')).some(x=>x.tipo==='voto'),'Sara toglie anche l\'altra: il voto sparisce')
  await q('select story_del($1,$2,$3)',[PW,st,'Ricky'])
  ok(!(await att('Ricky')).some(x=>x.url==='#storie/'+st) && (await att('Marco')).length===0,'storia cancellata: spariscono le sue attività (per tutti)')
  await q(`update attivita set created_at = now() - interval '8 days' where true`)
  ok((await att('Ricky')).length===0 && await nuove('Ricky')===0,'dopo 7 giorni non si vedono più…')
  await q('select post_vote($1,$2,$3,$4)',[PW,pR,'Anna',1])
  ok((await q('select count(*)::int n from attivita'))[0].n===1,'…e alla prossima attività vengono cancellate dal database')
  ok((await err('select attivita_list($1,$2)',['x','Ricky']))==='PASSWORD_ERRATA' && (await err('select attivita_viste($1,$2,$3)',['x','Ricky',null]))==='PASSWORD_ERRATA','campanella protetta dalla password')
  for (const t of ['attivita','attivita_lette']) { await db.exec('set role anon'); let no = false; try { await db.query(`select * from ${t}`) } catch (e) { no = /permission/.test(e.message) } finally { await db.exec('reset role') } ok(no, `tabella ${t} chiusa alla chiave pubblica`) }
}

// ❤️ AI COMMENTI (storie, risposte ai post, foto, eventi) + campanella
{
  const att = async n => (await one('select attivita_list($1,$2)',[PW,n])).items
  const cuore = (tipo, id, n, si = true) => one('select comment_like($1,$2,$3,$4,$5)',[PW,tipo,id,n,si])
  await q('delete from attivita')
  // risposta a un post
  const p = await one('select post_add($1,$2,$3,$4)',[PW,'Ricky','Stasera calcetto?',[]])
  const r = await one('select reply_add($1,$2,$3,$4)',[PW,p,'Marco','Io ci sono!'])
  ok(JSON.stringify((await cuore('post',r,'Luca')).likes)==='["Luca"]','Luca mette ❤️ alla risposta di Marco')
  await cuore('post',r,'luca'); await cuore('post',r,'Sara')
  let th = await one('select post_thread($1,$2)',[PW,p])
  ok(JSON.stringify(th[0].likes)==='["Luca","Sara"]','la risposta mostra chi ha messo ❤️ (Luca conta una volta sola, anche scritto "luca")')
  let aM = await att('Marco')
  ok(aM.length===2 && aM.every(x=>x.tipo==='cuore_risposta') && aM[0].cosa==='Stasera calcetto?' && aM[0].testo==='Io ci sono!' && aM[0].url==='#post/'+p,
    'campanella di Marco: ❤️ di Luca e Sara al suo commento, con il post, il commento e dove porta il tocco')
  ok(!(await att('Ricky')).some(x=>x.tipo==='cuore_risposta'),'Ricky (autore del post) non riceve i ❤️ ai commenti degli altri')
  ok(JSON.stringify((await cuore('post',r,'Sara',false)).likes)==='["Luca"]' && (await att('Marco')).length===1,'Sara toglie il ❤️: sparisce anche dalla campanella di Marco')
  await cuore('post',r,'Marco')
  ok((await att('Marco')).length===1 && (await one('select post_thread($1,$2)',[PW,p]))[0].likes.length===2,'Marco può mettere ❤️ al suo commento, ma non si avvisa da solo')
  // commento a una storia
  const st = await one('select story_add($1,$2,$3,$4)',[PW,'Anna','storie/c.jpg',''])
  const sc = await one('select story_comment_add($1,$2,$3,$4)',[PW,st,'Giulia','Stupenda'])
  await cuore('storia',sc,'Anna')
  ok((await one('select story_comments($1,$2)',[PW,st]))[0].likes[0]==='Anna','❤️ al commento di una storia')
  let aG = await att('Giulia')
  ok(aG.length===1 && aG[0].tipo==='cuore_commento_storia' && aG[0].cosa==='Anna' && aG[0].url==='#storie/'+st,'campanella di Giulia: Anna ha messo ❤️ al suo commento alla storia di Anna')
  // commento a una foto
  const alb = await one('select album_create($1,$2,$3)',[PW,'Cena','Giulia'])
  await q('select photo_add($1,$2,$3,$4)',[PW,alb,'album/x/c.jpg','Ricky'])
  const f = (await one('select album_photos($1,$2)',[PW,alb]))[0].id
  const fc = await one('select photo_comment_add($1,$2,$3,$4)',[PW,f,'Luca','Che fame'])
  await cuore('foto',fc,'Ricky')
  ok((await one('select photo_comments($1,$2)',[PW,f]))[0].likes[0]==='Ricky' && (await att('Luca')).some(x=>x.tipo==='cuore_commento_foto' && x.cosa==='Cena' && x.url==='#foto/'+alb),'❤️ al commento di una foto (campanella di Luca: in “Cena”)')
  // commento a un evento
  const ev = await one('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)',[PW,'Ricky','Bowling','','',giorno(3),null,null,null])
  const ec = await one('select event_comment_add($1,$2,$3,$4)',[PW,ev,'Sara','Porto le scarpe'])
  await cuore('evento',ec,'Marco')
  ok((await one('select event_get($1,$2)',[PW,ev])).comments[0].likes[0]==='Marco' && (await att('Sara')).some(x=>x.tipo==='cuore_commento_evento' && x.cosa==='Bowling' && x.url==='#calendario/'+ev),'❤️ al commento di un evento (campanella di Sara: in “Bowling”)')
  // commento cancellato / storia scaduta / errori
  await q('select reply_del($1,$2,$3)',[PW,r,'Marco'])
  ok((await att('Marco')).length===0 && (await q('select count(*)::int n from comment_likes where reply = $1',[r]))[0].n===0,'commento cancellato: spariscono i suoi ❤️ e le attività')
  ok((await err('select comment_like($1,$2,$3,$4,$5)',[PW,'post',r,'Luca',true]))==='COMMENTO_SPARITO','❤️ a un commento cancellato: "commento sparito"')
  await q(`update stories set created_at = now() - interval '25 hours' where id = $1`,[st])
  ok((await err('select comment_like($1,$2,$3,$4,$5)',[PW,'storia',sc,'Luca',true]))==='COMMENTO_SPARITO','niente ❤️ ai commenti di una storia scaduta')
  ok((await err('select comment_like($1,$2,$3,$4,$5)',[PW,'boh',fc,'Luca',true]))==='TIPO_NON_VALIDO' && (await err('select comment_like($1,$2,$3,$4,$5)',[PW,'post',fc,'Luca',true]))==='COMMENTO_SPARITO','tipo sbagliato o commento di un altro tipo: rifiutato')
  ok((await err('select comment_like($1,$2,$3,$4,$5)',['x','foto',fc,'Luca',true]))==='PASSWORD_ERRATA','❤️ ai commenti protetti dalla password')
  await q('select story_del($1,$2,$3)',[PW,st,'Anna'])
  ok((await att('Giulia')).length===0,'storia eliminata: spariscono anche i ❤️ ai suoi commenti')
  await db.exec('set role anon'); let no = false; try { await db.query('select * from comment_likes') } catch (e) { no = /permission/.test(e.message) } finally { await db.exec('reset role') }
  ok(no,'tabella comment_likes chiusa alla chiave pubblica')
}

// CALENDARIO DELL'AVVENTO: un tentativo per casella, 5-4-3-2-1 punti, pari merito = chi ha iniziato prima
{
  const oggi = d => q(`create or replace function _avvento_oggi() returns date language sql stable as $$ select '${d}'::date $$`)
  const inizia = (g, n) => one('select avvento_inizia($1,$2,$3)',[PW,g,n])
  const gioca = (g, n, p) => one('select avvento_gioca($1,$2,$3,$4)',[PW,g,n,p])
  const classifica = () => one('select avvento_classifica($1)',[PW])
  await oggi('2026-11-20')
  ok((await inizia(1,'Giulia')).err==='CASELLA_CHIUSA','il 20 novembre la casella 1 è chiusa anche per il database')
  await oggi('2026-12-03')
  ok((await inizia(4,'Giulia')).err==='CASELLA_CHIUSA' && (await inizia(3,'Giulia')).ok===true,'il 3 dicembre: la 4 è chiusa, la 3 si gioca')
  await q('delete from avvento_punti where true')
  ok((await inizia(1,'Giulia')).ok===true && (await inizia(1,'giulia')).err==='GIA_GIOCATO','un solo tentativo per casella (anche scrivendo il nome diverso)')
  ok((await err('select avvento_gioca($1,$2,$3,$4)',[PW,1,'Giulia',151]))==='PUNTEGGIO_NON_VALIDO','risultato impossibile (più di 15 scatti al secondo) rifiutato')
  ok((await gioca(1,'Giulia',40)).ok===true && (await gioca(1,'Giulia',45)).err==='GIA_GIOCATO','risultato salvato una volta sola')
  ok((await gioca(1,'Paolo',30)).err==='TEMPO_SCADUTO','risultato senza aver iniziato: rifiutato')
  for (const [n, p] of [['Marco',52],['Sara',40],['Luca',30],['Anna',25],['Paolo',20],['Fede',0]]) { await inizia(1,n); await gioca(1,n,p) }
  await inizia(1,'Elena')   // inizia e chiude a metà
  await q(`update avvento_punti set created_at = now() - interval '1 hour' where name = 'Giulia'`)
  let c = await classifica(), g1 = c.giorni.filter(x=>x.giorno===1)
  ok(g1.map(x=>`${x.name}:${x.punteggio}:${x.punti}`).join()==='Marco:52:5,Giulia:40:4,Sara:40:3,Luca:30:2,Anna:25:1,Paolo:20:0',
    'casella 1: Marco 5 punti, Giulia 4 (pari con Sara ma ha giocato prima), Sara 3, Luca 2, Anna 1, Paolo 0; chi ha fatto 0 o non ha finito non è in classifica')
  ok((await inizia(1,'Elena')).err==='GIA_GIOCATO','Elena aveva chiuso a metà: non può riprovare')
  await inizia(2,'Luca'); await q(`update avvento_punti set created_at = now() - interval '5 minutes' where giorno = 2`)
  ok((await gioca(2,'Luca',10)).err==='TEMPO_SCADUTO','risultato arrivato troppo tardi (più di 3 minuti): rifiutato')
  await inizia(2,'Sara'); await gioca(2,'Sara',9)
  c = await classifica()
  ok(c.totale.find(x=>x.name==='Sara').punti===8 && c.totale.find(x=>x.name==='Sara').giochi===2,
    'totale dei punti su più caselle (Sara: 3 + 5 = 8)')
  ok(c.totale.map(x=>x.name+':'+x.punti).join()==='Sara:8,Marco:5,Giulia:4,Luca:2,Anna:1,Paolo:0','classifica generale ordinata per punti')
  // l'amministratore non partecipa
  await inizia(1,'Ricky'); await gioca(1,'Ricky',99)
  ok((await classifica()).giorni.some(x=>x.name==='Ricky'),'(prima dell\'esclusione Ricky risultava primo)')
  ok((await one('select avvento_fuori($1,$2,$3)',[PW,'4321','Ricky'])).ok===true,'l\'amministratore col suo PIN si toglie dalla classifica')
  c = await classifica()
  ok(!c.giorni.some(x=>x.name==='Ricky') && !c.totale.some(x=>x.name==='Ricky') && c.giorni.find(x=>x.giorno===1&&x.pos===1).name==='Marco','Ricky sparisce dalla classifica, Marco torna primo')
  ok((await inizia(3,'RICKY')).err==='FUORI_CLASSIFICA','Ricky non può più giocare per la classifica (solo in prova)')
  await oggi('2026-12-20')
  ok((await inizia(5,'Anna')).err==='AVVENTO_FINITO','dopo il 19 dicembre non si gioca più')
  ok((await err('select avvento_classifica($1)',['x']))==='PASSWORD_ERRATA' && (await err('select avvento_inizia($1,$2,$3)',['x',1,'Anna']))==='PASSWORD_ERRATA','avvento protetto dalla password')
  for (const t of ['avvento_punti','avvento_fuori']) { await db.exec('set role anon'); let no = false; try { await db.query(`select * from ${t}`) } catch (e) { no = /permission/.test(e.message) } finally { await db.exec('reset role') } ok(no, `tabella ${t} chiusa alla chiave pubblica`) }
}

// ACCESSO PERSONALE: ognuno entra col suo PIN, e il database controlla CHI fa ogni azione
{
  // ogni funzione che agisce a nome di qualcuno controlla l'identità (controllo sul testo di schema.sql)
  const AZIONI = ['member_add','presenza','member_avatar','stories_list','story_like','story_add','story_seen','story_comment_add','story_comment_del','story_del','post_add','post_del','post_like','post_vote','reply_add','reply_del','album_create','photo_add','photo_comment_add','photo_vote','photo_comment_del','poll_create','poll_vote','poll_close','poll_del','ss_create','ss_join','ss_leave','ss_me','ss_reveal','ss_bought','ss_ask','ss_inbox','ss_answer','event_add','event_edit','event_del','event_rsvp','event_comment_add','event_comment_del','event_date_vote','event_fix_date','push_subscribe','avvento_inizia','avvento_gioca','avvento_fuori','attivita_list','attivita_nuove','attivita_viste','comment_like']
  const senzaIo = AZIONI.filter(f => { const m = SCHEMA.match(new RegExp('create or replace function ' + f + '\\([\\s\\S]*?end \\$\\$;')); return !m || !/perform _io\(p_(name|author|organizer)\)/.test(m[0]) })
  ok(senzaIo.length === 0, `tutte le ${AZIONI.length} funzioni che agiscono a nome di qualcuno controllano chi sei` + (senzaIo.length ? ': mancano ' + senzaIo : ''))
  await db.exec(IO_VERO)   // da qui il controllo è quello vero
  const W = tok => PW + String.fromCharCode(31) + (tok || '')
  const accedi = (n, pin) => one('select accedi($1,$2,$3)',[PW,n,pin])
  ok((await one('select accesso_info($1,$2)',[PW,'Zoe'])).esiste===false,'Zoe non c\'è ancora')
  ok((await accedi('Zoe','12')).err==='PIN_FORMATO' && (await accedi('Zoe','1234567')).err==='PIN_FORMATO' && (await accedi('Zoe','12a4')).err==='PIN_FORMATO','PIN: solo da 4 a 6 cifre')
  const z1 = await accedi('Zoe','2580')
  ok(z1.ok===true && z1.nuovo===true && /^[0-9a-f]{48}$/.test(z1.token),'Zoe entra la prima volta: sceglie il PIN, il telefono riceve il suo codice')
  ok((await one('select accesso_info($1,$2)',[PW,'zoe'])).pin===true,'ora Zoe ha il suo PIN')
  ok((await q('select count(*)::int n from sessioni where hash = $1',[z1.token])).at(0).n===0 && (await q('select pin_hash from members where name=$1',['Zoe']))[0].pin_hash.startsWith('$2'),'nel database non ci sono né il PIN né il codice in chiaro')
  ok((await accedi('zoe','1111')).err==='PIN_PERSONALE_ERRATO','PIN sbagliato: non entra')
  const z2 = await accedi('ZOE','2580'); ok(z2.ok===true && z2.nuovo===false && z2.name==='Zoe','PIN giusto: entra (anche scritto "ZOE")')
  // azioni: senza codice, con quello giusto, con quello di un altro
  ok((await err('select post_add($1,$2,$3,$4)',[PW,'Zoe','Ciao',[]]))==='ACCEDI','senza essere entrati col PIN non si pubblica niente')
  const pz = await one('select post_add($1,$2,$3,$4)',[W(z1.token),'Zoe','Ciao da Zoe',[]])
  ok(!!pz,'Zoe col suo telefono pubblica')
  ok((await err('select post_add($1,$2,$3,$4)',[W(z1.token),'Marco','Sono Marco (finto)',[]]))==='NON_SEI_TU','Zoe NON può pubblicare a nome di Marco')
  ok((await err('select post_vote($1,$2,$3,$4)',[W(z1.token),pz,'Luca',1]))==='NON_SEI_TU','…né mettere mi piace a nome di Luca')
  ok((await err('select attivita_list($1,$2)',[W(z1.token),'Ricky']))==='NON_SEI_TU','…né leggere la campanella di Ricky')
  ok((await err('select post_add($1,$2,$3,$4)',[W('codiceinventato'),'Zoe','x',[]]))==='ACCEDI','con un codice inventato non si fa niente')
  ok(Array.isArray(await one('select feed($1)',[PW])),'le cose da leggere (le Novità) bastano la password del gruppo')
  // 5 PIN sbagliati → 15 minuti di blocco
  for (let i = 0; i < 4; i++) await accedi('Zoe','0000')
  ok((await accedi('Zoe','0000')).err==='PIN_PERSONALE_BLOCCATO' && (await accedi('Zoe','2580')).err==='PIN_PERSONALE_BLOCCATO','5 PIN sbagliati: bloccato per 15 minuti (anche col PIN giusto)')
  await q(`update members set pin_lock = now() - interval '1 minute' where name = 'Zoe'`)
  ok((await accedi('Zoe','2580')).ok===true,'passati i 15 minuti col PIN giusto rientra')
  // esci
  const z3 = await accedi('Zoe','2580'); await q('select esci($1)',[W(z3.token)])
  ok((await err('select post_add($1,$2,$3,$4)',[W(z3.token),'Zoe','x',[]]))==='ACCEDI' && !!(await one('select post_add($1,$2,$3,$4)',[W(z1.token),'Zoe','dall\'altro telefono',[]])),'"Esci" chiude solo quel telefono')
  // l'amministratore azzera il PIN
  ok((await one('select member_pin_reset($1,$2,$3)',[PW,'0000','Zoe'])).err==='PIN_ADMIN_ERRATO','azzerare un PIN: serve il PIN amministratore')
  ok((await one('select member_pin_reset($1,$2,$3)',[PW,'4321','Zoe'])).ok===true,'l\'amministratore azzera il PIN di Zoe')
  ok((await err('select post_add($1,$2,$3,$4)',[W(z1.token),'Zoe','x',[]]))==='ACCEDI' && (await one('select accesso_info($1,$2)',[PW,'Zoe'])).pin===false,'tutti i telefoni di Zoe escono, al prossimo ingresso sceglie un PIN nuovo')
  const z4 = await accedi('Zoe','9876'); ok(z4.ok===true && z4.nuovo===true,'Zoe sceglie il PIN nuovo')
  // chi viene rimosso esce da tutti i telefoni
  await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Zoe',true])
  ok((await err('select post_add($1,$2,$3,$4)',[W(z4.token),'Zoe','x',[]]))==='SEI_STATO_RIMOSSO' && (await accedi('Zoe','9876')).err==='NOME_BLOCCATO','Zoe rimossa: il suo telefono esce subito ("sei stato rimosso") e non può rientrare')
  await q('select member_kick($1,$2,$3,$4)',[PW,'4321','Zoe',false])
  // il Secret Santa: anche col PIN del Secret Santa giusto, a nome di un altro no
  const ok2 = await accedi('Zoe','9876')
  ok((await err('select ss_reveal($1,$2,$3,$4)',[W(ok2.token),'00000000-0000-0000-0000-000000000000','Marco','1111']))==='NON_SEI_TU','Secret Santa: nessuno può guardare il sorteggio a nome di un altro')
  ok(await (async () => { await db.exec('set role anon'); try { await db.query('select * from sessioni'); return false } catch (e) { return /permission/.test(e.message) } finally { await db.exec('reset role') } })(),'tabella sessioni chiusa alla chiave pubblica')
  await db.exec(`create or replace function _io(p_name text) returns void language sql as $$ select $$`)   // per il resto dei test
}

// blocco del PIN amministratore (alla fine: blocca tutto per 15 minuti)
for(let i=0;i<5;i++) await err('select member_kick($1,$2,$3,$4)',[PW,'0000','Luca',true])
ok((await err('select member_kick($1,$2,$3,$4)',[PW,'4321','Luca',true]))==='PIN_BLOCCATO','5 PIN amministratore sbagliati: blocco di 15 minuti')
console.log(fails? `\n${fails} TEST FALLITI` : '\nTUTTI I TEST OK')
