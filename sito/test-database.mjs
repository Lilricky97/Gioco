import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'fs'
const db = await PGlite.create({ extensions: { pgcrypto } })
await db.exec(`create role anon; create role authenticated;`)
await db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url),'utf8'))
await db.exec(`insert into app_config(k,v) values ('pw', extensions.crypt('cocorico', extensions.gen_salt('bf')))`)
const q = async (sql, p=[]) => (await db.query(sql, p)).rows
const one = async (sql,p)=> Object.values((await q(sql,p))[0])[0]
const PW='cocorico'
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

// blocco del PIN amministratore (alla fine: blocca tutto per 15 minuti)
for(let i=0;i<5;i++) await err('select member_kick($1,$2,$3,$4)',[PW,'0000','Luca',true])
ok((await err('select member_kick($1,$2,$3,$4)',[PW,'4321','Luca',true]))==='PIN_BLOCCATO','5 PIN amministratore sbagliati: blocco di 15 minuti')
console.log(fails? `\n${fails} TEST FALLITI` : '\nTUTTI I TEST OK')
