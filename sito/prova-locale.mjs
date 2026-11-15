// ============================================================
//  PROVA IN LOCALE del sito, senza Supabase.
//  Finge di essere Supabase (funzioni RPC + spazio foto) usando
//  il VERO schema.sql dentro PGlite (Postgres in memoria).
//
//  Uso (dalla cartella sito/):
//    npm i @electric-sql/pglite
//    node prova-locale.mjs            → apri http://localhost:8787
//  Password del gruppo per la prova: "prova" (cambiala con PW=...), PIN amministratore 9999 (ADMIN=...)
//  LAG=300 node prova-locale.mjs      → simula una rete lenta (ms)
// ============================================================
import http from 'node:http'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const DIR = new URL('.', import.meta.url)
const PORT = +(process.env.PORT || 8787)
const PW = process.env.PW || 'prova'
const LAG = +(process.env.LAG || 0)
const KEY = 'sb_publishable_PROVA_LOCALE'

const db = await PGlite.create({ extensions: { pgcrypto } })
await db.exec('create role anon; create role authenticated;')
await db.exec(fs.readFileSync(new URL('schema.sql', DIR), 'utf8'))
await db.query(`insert into app_config(k,v) values ('pw', extensions.crypt($1, extensions.gen_salt('bf')))`, [PW])
await db.query(`insert into app_config(k,v) values ('admin', extensions.crypt($1, extensions.gen_salt('bf')))`, [process.env.ADMIN || '9999'])   // PIN amministratore per la prova

// tipi degli argomenti di ogni funzione pubblica (come fa PostgREST)
const FN = {}
for (const r of (await db.query(`
  select p.proname as name, p.proargnames as args,
         array(select format_type(t, null) from unnest(p.proargtypes) t) as types,
         format_type(p.prorettype, null) as ret
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname !~ '^_'`)).rows) FN[r.name] = r

const files = new Map()   // spazio foto finto: percorso → {type, buf}
const wait = ms => new Promise(r => setTimeout(r, ms))
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}
const readBody = req => new Promise((ok, ko) => {
  const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => ok(Buffer.concat(parts))); req.on('error', ko)
})

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const p = decodeURIComponent(url.pathname)
    if (LAG && p.startsWith('/rest/') || LAG && req.method === 'POST') await wait(LAG)

    // la pagina, collegata a questo finto Supabase
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      const html = fs.readFileSync(new URL('index.html', DIR), 'utf8')
        .replace(/const SUPA_URL = '[^']*'/, `const SUPA_URL = '${url.origin}'`)
        .replace(/const SUPA_KEY = '[^']*'/, `const SUPA_KEY = '${KEY}'`)
      return send(res, 200, html, 'text/html; charset=utf-8')
    }

    // la pagina in modalità prova (senza database), per i test
    if (req.method === 'GET' && p === '/prova') {
      const html = fs.readFileSync(new URL('index.html', DIR), 'utf8')
        .replace(/const SUPA_URL = '[^']*'/, `const SUPA_URL = ''`).replace(/const SUPA_KEY = '[^']*'/, `const SUPA_KEY = ''`)
      return send(res, 200, html, 'text/html; charset=utf-8')
    }

    // funzioni del database
    const rpc = p.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (rpc && req.method === 'POST') {
      if (req.headers.apikey !== KEY) return send(res, 401, JSON.stringify({ message: 'Invalid API key' }))
      const f = FN[rpc[1]]
      if (!f) return send(res, 404, JSON.stringify({ code: 'PGRST202', message: 'Funzione inesistente: ' + rpc[1] }))
      const args = JSON.parse((await readBody(req)).toString() || '{}')
      const missing = f.args.filter(a => !(a in args)), extra = Object.keys(args).filter(a => !f.args.includes(a))
      if (missing.length || extra.length)
        return send(res, 404, JSON.stringify({ code: 'PGRST202', message: `Argomenti sbagliati per ${f.name}: mancano [${missing}] in più [${extra}]` }))
      const vals = [], sql = f.args.map((a, i) => {
        let v = args[a]
        if (f.types[i] === 'json' && v !== null && typeof v !== 'string') v = JSON.stringify(v)
        vals.push(v); return `${a} => $${vals.length}::${f.types[i]}`
      })
      try {
        const r = await db.query(`select ${f.name}(${sql.join(', ')}) as r`, vals)
        if (f.ret === 'void') { res.writeHead(204); return res.end() }
        return send(res, 200, JSON.stringify(r.rows[0].r))
      } catch (e) {
        return send(res, 400, JSON.stringify({ code: e.code || 'P0001', message: e.message, details: null, hint: null }))
      }
    }

    // caricamento foto
    const up = p.match(/^\/storage\/v1\/object\/foto\/(.+)$/)
    if (up && req.method === 'POST') {
      if (req.headers.apikey !== KEY) return send(res, 401, JSON.stringify({ message: 'Invalid API key' }))
      const type = req.headers['content-type'] || ''
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return send(res, 415, JSON.stringify({ statusCode: '415', error: 'invalid_mime_type', message: 'mime type ' + type + ' is not supported' }))
      const buf = await readBody(req)
      if (buf.length > 8388608) return send(res, 413, JSON.stringify({ statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }))
      if (files.has(up[1])) return send(res, 400, JSON.stringify({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }))
      files.set(up[1], { type, buf })
      return send(res, 200, JSON.stringify({ Key: 'foto/' + up[1], Id: crypto.randomUUID() }))
    }
    const pub = p.match(/^\/storage\/v1\/object\/public\/foto\/(.+)$/)
    if (pub && req.method === 'GET') {
      const f = files.get(pub[1])
      if (!f) return send(res, 400, JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }))
      res.writeHead(200, { 'Content-Type': f.type, 'Content-Length': f.buf.length }); return res.end(f.buf)
    }

    // statistiche per i test automatici
    if (p === '/__prova/stato') return send(res, 200, JSON.stringify({ files: [...files.keys()] }))
    send(res, 404, 'non trovato', 'text/plain')
  } catch (e) {
    console.error(e); send(res, 500, JSON.stringify({ message: String(e) }))
  }
}).listen(PORT, () => console.log(`Sito di prova su http://localhost:${PORT}  (password: ${PW})`))
