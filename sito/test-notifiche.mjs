// ============================================================
//  TEST DELLE NOTIFICHE SUL TELEFONO (senza Supabase e senza telefoni veri)
//  Uso (dalla cartella sito/):  npm i @electric-sql/pglite web-push deno  e poi  node test-notifiche.mjs
//  - un finto Supabase (il VERO schema.sql in PGlite, chiamato come service_role)
//  - un finto "server delle notifiche" (come quelli di Apple/Google) che riceve i messaggi cifrati
//  - la VERA funzione notifiche/notifica.ts fatta girare con Deno, come su Supabase
//  - sw.js (il service worker) provato con un finto telefono
// ============================================================
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import http from 'node:http'
import https from 'node:https'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ece = require('http_ece')

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('❌', m) } else console.log('✅', m) }
const DIR = new URL('.', import.meta.url).pathname
const SVC = 'chiave-service-role-finta', PW = 'prova'
const attesa = ms => new Promise(r => setTimeout(r, ms))

// ---------- finto Supabase: solo le funzioni riservate, eseguite col ruolo service_role ----------
const db = await PGlite.create({ extensions: { pgcrypto } })
await db.exec('create role anon; create role authenticated; create role service_role;')
await db.exec(fs.readFileSync(DIR + 'schema.sql', 'utf8'))
await db.exec(`create or replace function _io(p_name text) returns void language sql as $$ select $$`)   // qui si provano le notifiche, non l'accesso personale (provato in test-database)
await db.query(`insert into app_config(k,v) values ('pw', extensions.crypt($1, extensions.gen_salt('bf')))`, [PW])
const one = async (sql, p = []) => Object.values((await db.query(sql, p)).rows[0])[0]
const RISERVATE = { vapid_get: [], vapid_set: ['p_pub', 'p_priv'], notif_claim: ['p_id'], push_gone: ['p_endpoint'] }
let chiamateDb = []
const supa = http.createServer(async (req, res) => {
  const parti = []; for await (const c of req) parti.push(c)
  const fn = (req.url.match(/^\/rest\/v1\/rpc\/(\w+)$/) || [])[1], args = JSON.parse(Buffer.concat(parti).toString() || '{}')
  chiamateDb.push(fn)
  if (req.headers.authorization !== 'Bearer ' + SVC || req.headers.apikey !== SVC) { res.writeHead(401); return res.end('{"message":"chiave sbagliata"}') }
  if (!RISERVATE[fn]) { res.writeHead(404); return res.end('{}') }
  try {
    await db.exec('set role service_role')
    const r = await db.query(`select ${fn}(${RISERVATE[fn].map((a, i) => `${a} => $${i + 1}`).join(', ')}) as r`, RISERVATE[fn].map(a => args[a]))
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.rows[0].r))
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ message: e.message })) }
  finally { await db.exec('reset role') }
}).listen(0)
const URL_DB = `http://localhost:${supa.address().port}`

// ---------- finto server delle notifiche (HTTPS con certificato fatto al momento) ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-push-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', tmp + '/k.pem', '-out', tmp + '/c.pem', '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' })
const ricevute = []
const push = https.createServer({ key: fs.readFileSync(tmp + '/k.pem'), cert: fs.readFileSync(tmp + '/c.pem') }, async (req, res) => {
  const parti = []; for await (const c of req) parti.push(c)
  ricevute.push({ url: req.url, headers: req.headers, body: Buffer.concat(parti) })
  if (req.url.includes('sparito')) { res.writeHead(410); return res.end('Gone') }
  res.writeHead(201); res.end()
}).listen(0)
const PUSH = `https://localhost:${push.address().port}`

// telefoni finti: ognuno ha le sue chiavi, come un browser vero
const telefono = (nome, quale) => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys()
  const auth = crypto.randomBytes(16)
  return { nome, ecdh, auth, endpoint: `${PUSH}/push/${quale}`, p256dh: ecdh.getPublicKey('base64url'), authB64: auth.toString('base64url') }
}
const tel = [telefono('Ricky', 'ricky-1234567'), telefono('Giulia', 'giulia-1234567'), telefono('Luca', 'sparito-1234567'), telefono('Marco', 'marco-1234567')]
for (const t of tel) await db.query('select push_subscribe($1,$2,$3,$4,$5,$6)', [PW, t.nome, t.endpoint, t.p256dh, t.authB64, t.nome === 'Ricky' ? ['eventi'] : ['storie', 'post', 'eventi']])

// ---------- la vera funzione, con Deno ----------
const deno = path.join(DIR, 'node_modules', '.bin', 'deno')
const PORTA = 8000
const envDeno = { ...process.env, DENO_DIR: path.join(DIR, 'node_modules', '.deno-cache'), DENO_NO_UPDATE_CHECK: '1' }
execFileSync(deno, ['cache', DIR + 'notifiche/notifica.ts'], { env: envDeno, stdio: 'inherit' })   // scarica la libreria (prima di accettare il certificato finto)
// la funzione deve fidarsi del certificato del finto server (in più ai certificati che usava già)
fs.writeFileSync(tmp + '/ca.pem', (process.env.DENO_CERT ? fs.readFileSync(process.env.DENO_CERT, 'utf8') + '\n' : '') + fs.readFileSync(tmp + '/c.pem', 'utf8'))
const proc = spawn(deno, ['run', '--cached-only', '-A', DIR + 'notifiche/notifica.ts'], {
  env: { ...envDeno, SUPABASE_URL: URL_DB, SUPABASE_SERVICE_ROLE_KEY: SVC, DENO_CERT: tmp + '/ca.pem', NODE_EXTRA_CA_CERTS: tmp + '/c.pem' },
  stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; proc.stdout.on('data', d => { log += d }); proc.stderr.on('data', d => { log += d })
const chiama = async corpo => {
  const r = await fetch(`http://localhost:${PORTA}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  return { stato: r.status, cors: r.headers.get('access-control-allow-origin'), dati: await r.json() }
}
let pronta = false
for (let i = 0; i < 240 && !pronta; i++) { try { await fetch(`http://localhost:${PORTA}/`, { method: 'OPTIONS' }); pronta = true } catch (e) { await attesa(500) } }
if (!pronta) { console.log(log); proc.kill(); process.exit(1) }
ok(true, 'la funzione notifica.ts parte con Deno (come su Supabase)')

try {
  // 1) chiavi create la prima volta, poi sempre le stesse
  const a = await chiama({}), b = await chiama({})
  const pubDb = await one(`select v from app_config where k='vapid_pub'`)
  ok(a.stato === 200 && a.cors === '*' && a.dati.pub && a.dati.pub === b.dati.pub && a.dati.pub === pubDb, 'chiavi delle notifiche create una volta sola e salvate nel database')
  ok(!JSON.stringify(a.dati).includes(await one(`select v from app_config where k='vapid_priv'`)), 'la chiave segreta non esce mai dalla funzione')

  // 2) Marco pubblica un post → arriva a Giulia (Luca ha cambiato telefono, Ricky vuole solo gli eventi)
  const postId = await one('select post_add($1,$2,$3,$4)', [PW, 'Marco', 'Stasera calcetto? ⚽', []])
  const nId = await one(`select max(id) from notif_queue`)
  ricevute.length = 0
  const r1 = await chiama({ id: nId })
  ok(r1.dati.ok && r1.dati.inviate === 1 && r1.dati.tolte === 1, `post di Marco: 1 inviata, 1 telefono sparito tolto (${JSON.stringify(r1.dati)})`)
  ok((await one('select count(*)::int from push_subs where endpoint like $1', ['%sparito%'])) === 0, 'il telefono sparito (410) è tolto dal database')
  const g = ricevute.find(x => x.url.includes('giulia')), t = tel[1]
  ok(!!g && !ricevute.some(x => x.url.includes('ricky') || x.url.includes('marco')), 'a Marco non arriva la sua notifica, a Ricky (solo eventi) nemmeno')
  ok(g && g.headers['content-encoding'] === 'aes128gcm' && +g.headers.ttl === 86400, 'messaggio cifrato (aes128gcm), valido 24 ore')
  const chiaro = JSON.parse(ece.decrypt(g.body, { version: 'aes128gcm', privateKey: t.ecdh, authSecret: t.auth }).toString())
  ok(chiaro.title === '💬 Marco' && chiaro.body === 'Stasera calcetto? ⚽' && chiaro.url === '#post/' + postId, 'il telefono di Giulia lo decifra: "💬 Marco – Stasera calcetto? ⚽" → apre il post')
  // firma VAPID: chi manda, per chi, e firmata con la chiave giusta
  const [, jwt, k] = g.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/)
  const [h64, p64, s64] = jwt.split('.'), dati = JSON.parse(Buffer.from(p64, 'base64url'))
  const pubRaw = Buffer.from(k, 'base64url'), pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pubRaw.subarray(1, 33).toString('base64url'), y: pubRaw.subarray(33).toString('base64url') }, format: 'jwk' })
  const firmaOk = crypto.verify('sha256', Buffer.from(h64 + '.' + p64), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s64, 'base64url'))
  ok(k === pubDb && firmaOk && dati.aud === PUSH && dati.sub === 'https://lilricky97.github.io/Gioco/sito/' && dati.exp > Date.now() / 1000, 'firma VAPID valida (chiave giusta, destinatario e mittente giusti)')

  // 3) la stessa notifica non parte due volte
  ricevute.length = 0
  const r2 = await chiama({ id: nId })
  ok(r2.dati.gia === true && ricevute.length === 0, 'chiamata di nuovo con lo stesso numero: non manda doppioni')

  // 4) un evento: arriva anche a Ricky
  ricevute.length = 0
  await one('select event_add($1,$2,$3,$4,$5,$6,$7,$8,$9)', [PW, 'Giulia', 'Cena', 'Da Giulia', '', new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), '20:30', null, null])
  const r3 = await chiama({ id: await one(`select max(id) from notif_queue`) })
  const perRicky = ricevute.find(x => x.url.includes('ricky'))
  const ev = perRicky && JSON.parse(ece.decrypt(perRicky.body, { version: 'aes128gcm', privateKey: tel[0].ecdh, authSecret: tel[0].auth }).toString())
  ok(r3.dati.inviate === 2 && ev && ev.title === '📅 Cena' && ev.body.includes('ore 20:30 · Da Giulia') && ev.url.startsWith('#calendario/'), 'evento di Giulia: arriva a Ricky e Marco ("📅 Cena")')

  // 5) chiamate strane
  const r4 = await chiama({ id: 999999 })
  ok(r4.dati.gia === true, 'numero inesistente: nessun invio')
  ok(chiamateDb.every(f => f in RISERVATE), 'la funzione usa solo le funzioni riservate del database')
} finally {
  proc.kill(); supa.close(); push.close()
  if (fails) console.log('--- log della funzione ---\n' + log.replace(/\x1b\[[0-9;]*m/g, '').slice(-3000))
}

// ---------- sw.js (il service worker) con un finto telefono ----------
const ascolta = {}, mostrate = [], aperte = [], navigate = [], focus = []
let finestre = []
const self = {
  addEventListener: (t, f) => { ascolta[t] = f },
  skipWaiting: () => {},
  registration: { scope: 'https://lilricky97.github.io/Gioco/sito/', showNotification: async (t, o) => { mostrate.push({ t, o }) } },
  clients: { claim: async () => {}, matchAll: async () => finestre, openWindow: async u => { aperte.push(u) } }
}
vm.runInNewContext(fs.readFileSync(DIR + 'sw.js', 'utf8'), { self, console })
const evento = extra => { const p = []; return Object.assign({ waitUntil: x => p.push(x), fine: () => Promise.all(p) }, extra) }
let e = evento({ data: { json: () => ({ title: '📸 Giulia', body: 'Al mare!', url: '#storie', tag: 'storie-1' }) } })
ascolta.push(e); await e.fine()
ok(mostrate[0].t === '📸 Giulia' && mostrate[0].o.body === 'Al mare!' && mostrate[0].o.icon === 'icone/app-192.png' && mostrate[0].o.data.url === 'https://lilricky97.github.io/Gioco/sito/#storie', 'sw.js: mostra la notifica con titolo, testo e icona dell\'app')
e = evento({ data: { json: () => { throw new Error('non json') }, text: () => 'ciao' } }); ascolta.push(e); await e.fine()
ok(mostrate[1].t === 'Pippeghi 24/7' && mostrate[1].o.body === 'ciao', 'sw.js: messaggio strano → notifica col nome del sito')
let chiusa = false
e = evento({ notification: { close: () => { chiusa = true }, data: { url: 'https://lilricky97.github.io/Gioco/sito/#post/42' } } })
ascolta.notificationclick(e); await e.fine()
ok(chiusa && aperte[0] === 'https://lilricky97.github.io/Gioco/sito/#post/42', 'sw.js: tocco con il sito chiuso → lo apre sul post')
finestre = [{ url: 'https://altro.sito/', focus: async () => {} }, { url: 'https://lilricky97.github.io/Gioco/sito/#novita', focus: async () => { focus.push(1) }, navigate: async u => { navigate.push(u) } }]
e = evento({ notification: { close: () => {}, data: { url: 'https://lilricky97.github.io/Gioco/sito/#calendario/9' } } })
ascolta.notificationclick(e); await e.fine()
ok(focus.length === 1 && navigate[0] === 'https://lilricky97.github.io/Gioco/sito/#calendario/9' && aperte.length === 1, 'sw.js: tocco con il sito già aperto → lo porta davanti sull\'evento')
ok(!/addEventListener\(['"]fetch/.test(fs.readFileSync(DIR + 'sw.js', 'utf8')), 'sw.js non mette niente in cache (gli aggiornamenti arrivano sempre)')
const man = JSON.parse(fs.readFileSync(DIR + 'manifest.json', 'utf8'))
ok(man.display === 'standalone' && man.icons.every(i => fs.existsSync(DIR + i.src)), 'manifest.json: app a tutto schermo, le icone esistono')

console.log(fails ? `\n${fails} TEST FALLITI` : '\nTUTTI I TEST OK')
process.exit(fails ? 1 : 0)
