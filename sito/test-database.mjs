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
const err = async (sql,p)=>{ try{ await q(sql,p); return null }catch(e){ return e.message } }
// password
ok(await one('select check_pw($1)',[PW])===true,'password giusta')
ok(await one('select check_pw($1)',['sbagliata'])===false,'password sbagliata rifiutata')
ok((await err('select feed($1)',['x']))?.includes('PASSWORD_ERRATA'),'feed senza password bloccato')
// novità e album
await q('select member_add($1,$2)',[PW,'Ricky'])
await q('select post_add($1,$2,$3,$4)',[PW,'Ricky','Ciao a tutti',[]])
ok((await one('select feed($1)',[PW])).length===1,'novità salvata')
// mi piace e risposte (stile X)
const pid = (await one('select feed($1)',[PW]))[0].id
ok(await one('select post_like($1,$2,$3)',[PW,pid,'Marco'])===true,'Marco mette mi piace')
ok(await one('select post_like($1,$2,$3)',[PW,pid,'Giulia'])===true,'Giulia mette mi piace')
ok(await one('select post_like($1,$2,$3)',[PW,pid,'marco'])===false,'Marco lo toglie (anche scritto minuscolo)')
await q('select reply_add($1,$2,$3,$4)',[PW,pid,'Sara','Bellissimo! #capodanno'])
const rid = await one('select reply_add($1,$2,$3,$4)',[PW,pid,'Luca','Ci sto'])
ok((await err('select reply_add($1,$2,$3,$4)',[PW,pid,'Luca','   ']))?.includes('POST_VUOTO'),'risposta vuota bloccata')
let fp = (await one('select feed($1)',[PW]))[0]
ok(JSON.stringify(fp.likes)==='["Giulia"]' && fp.replies==2,'il feed mostra 1 mi piace e 2 risposte')
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
// SECRET SANTA
const names=['Ricky','Marco','Giulia','Sara','Luca','Anna','Paolo','Elena','Gianni','Chiara','Fede']
const ev = await one('select ss_create($1,$2,$3,$4,$5,$6)',[PW,'Natale 2026','30€','20/12','Ricky','1234'])
for(const [i,n] of names.entries()) await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev,n,String(1000+i),'Vorrei '+n])
ok((await err('select ss_join($1,$2,$3,$4,$5)',[PW,ev,'Marco','9999','x']))?.includes('NOME_GIA_PRESO'),'nome già preso con PIN diverso bloccato')
ok((await err('select ss_draw($1,$2,$3)',[PW,ev,'0000']))?.includes('PIN_ORGANIZZATORE_ERRATO'),'sorteggio con PIN organizzatore sbagliato bloccato')
await q('select ss_set_excl($1,$2,$3,$4)',[PW,ev,'1234',JSON.stringify([['Ricky','Giulia'],['Marco','Sara'],['Luca','Anna']])])
// 300 sorteggi di prova
let bad=0; const seen=new Set()
for(let t=0;t<300;t++){
  await q('select ss_undo($1,$2,$3)',[PW,ev,'1234'])
  await q('select ss_draw($1,$2,$3)',[PW,ev,'1234'])
  const c = await one('select ss_check($1,$2)',[PW,ev]); if(!c.ok){bad++; console.log(c)}
  const pairs = await q(`select g.name gn, r.name rn from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1`,[ev])
  for(const p of pairs){ const k=[p.gn,p.rn].sort().join(); if(['Giulia,Ricky','Marco,Sara','Anna,Luca'].includes(k)) bad++; if(p.gn===p.rn) bad++ }
  seen.add(pairs.map(p=>p.gn+'>'+p.rn).sort().join('|'))
}
ok(bad===0,'300 sorteggi: nessuno a se stesso, nessuna coppia esclusa, catena unica')
ok(seen.size>250,'sorteggi diversi tra loro ('+seen.size+'/300)')
// privacy
ok((await err('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Marco','0000']))?.includes('PIN_ERRATO'),'PIN sbagliato non rivela niente')
const rv = await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Marco','1001']); ok(rv.drawn && rv.to && rv.to!=='Marco' && rv.wish.startsWith('Vorrei'),'Marco vede solo il suo: '+rv.to+' ('+rv.wish+')')
const lst = JSON.stringify(await one('select ss_list($1)',[PW])); ok(!lst.includes('"to"') && !lst.includes('receiver'),'la lista pubblica non contiene le coppie')
ok((await err('select ss_join($1,$2,$3,$4,$5)',[PW,ev,'Nuovo','5555','x']))?.includes('SORTEGGIO_GIA_FATTO'),'dopo il sorteggio non si entra più')
await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev,'Marco','1001','Nuovo desiderio'])
const santaOfMarco = (await q(`select g.name from ss_pairs s join ss_people g on g.id=s.giver join ss_people r on r.id=s.receiver where s.event_id=$1 and r.name='Marco'`,[ev]))[0].name
const rs = await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,santaOfMarco,String(1000+names.indexOf(santaOfMarco))]); ok(rs.to==='Marco'&&rs.wish==='Nuovo desiderio','la letterina aggiornata arriva a chi fa il regalo')
// esclusioni impossibili
const ev2 = await one('select ss_create($1,$2,$3,$4,$5,$6)',[PW,'Prova','','','Ricky','1234'])
for(const n of ['A','B','C']) await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev2,n,'1111',''])
await q('select ss_set_excl($1,$2,$3,$4)',[PW,ev2,'1234',JSON.stringify([['A','B']])])
ok((await err('select ss_draw($1,$2,$3)',[PW,ev2,'1234']))?.includes('ESCLUSIONI_IMPOSSIBILI'),'esclusioni impossibili segnalate')
ok((await err('select ss_draw($1,$2,$3)',[PW,ev2,'1234']))!==null,'—')
// organizzatore: controllo PIN e nuovo PIN a chi lo dimentica
ok(await one('select ss_admin_check($1,$2,$3)',[PW,ev,'1234'])===true,'PIN organizzatore giusto riconosciuto')
ok(await one('select ss_admin_check($1,$2,$3)',[PW,ev,'9999'])===false,'PIN organizzatore sbagliato rifiutato')
ok((await err('select ss_reset_pin($1,$2,$3,$4,$5)',[PW,ev,'9999','Marco','4321']))?.includes('PIN_ORGANIZZATORE_ERRATO'),'nuovo PIN senza PIN organizzatore bloccato')
await q('select ss_reset_pin($1,$2,$3,$4,$5)',[PW,ev,'1234','marco','4321'])
ok((await err('select ss_reveal($1,$2,$3,$4)',[PW,ev,'Marco','1001']))?.includes('PIN_ERRATO'),'dopo il reset il vecchio PIN non va più')
const rv2 = await one('select ss_reveal($1,$2,$3,$4)',[PW,ev,'MARCO','4321']); ok(rv2.to===rv.to && rv2.me==='Marco','col nuovo PIN (e nome in maiuscolo) vede lo stesso abbinamento')
// nomi con maiuscole diverse = stessa persona
const ev3 = await one('select ss_create($1,$2,$3,$4,$5,$6)',[PW,'Maiuscole','','','Ricky','1234'])
await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev3,'Giulia','1111','a'])
ok((await err('select ss_join($1,$2,$3,$4,$5)',[PW,ev3,'giulia','2222','b']))?.includes('NOME_GIA_PRESO'),'"giulia" non può rubare il posto a "Giulia"')
await q('select ss_join($1,$2,$3,$4,$5)',[PW,ev3,'Luca','3333',''])
await q('select ss_set_excl($1,$2,$3,$4)',[PW,ev3,'1234',JSON.stringify([['Giulia','Luca']])])
await q('select ss_kick($1,$2,$3,$4)',[PW,ev3,'1234','LUCA'])
const l3 = (await one('select ss_list($1)',[PW])).find(e=>e.id===ev3)
ok(l3.people.length===1 && l3.excl.length===0,'tolto Luca: sparisce anche dalle esclusioni')
await q('select ss_leave($1,$2,$3,$4)',[PW,ev3,'giulia','1111'])
ok((await one('select ss_list($1)',[PW])).find(e=>e.id===ev3).people.length===0,'Giulia esce col suo PIN')
console.log(fails? `\n${fails} TEST FALLITI` : '\nTUTTI I TEST OK')
