// ============================================================
//  TEST MATEMATICI DEL SORTEGGIO DEL SECRET SANTA (PGlite, vero schema.sql)
//  Uso: cd sito && node test-sorteggio.mjs
//  Controlla il "cuore" del sorteggio: il cappello (_ss_cappello), il controllo
//  "è possibile?" (_ss_match) e le lettere finte (_ss_lettere).
// ============================================================
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'fs'
const db = await PGlite.create({ extensions: { pgcrypto } })
await db.exec(`create role anon; create role authenticated;`)
await db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
await db.exec(`insert into app_config(k,v) values ('pw', extensions.crypt('x', extensions.gen_salt('bf')))`)
const one = async (sql, p = []) => Object.values((await db.query(sql, p)).rows[0])[0]
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('❌', m) } else console.log('✅', m) }

// matrice "vietati" (riga = chi regala, colonna = chi riceve), come quella del database
const matrice = (n, coppie = [], dirette = []) => {
  const m = Array(n * n).fill(false)
  for (let i = 0; i < n; i++) m[i * n + i] = true
  for (const [a, b] of coppie) { m[a * n + b] = true; m[b * n + a] = true }
  for (const [a, b] of dirette) m[a * n + b] = true
  return m
}
const valido = (n, m, p) => p.length === n && new Set(p).size === n && p.every((r, i) => r >= 1 && r <= n && !m[i * n + r - 1])
const cappello = async (n, m) => { const r = await one('select _ss_match($1,$2)', [n, m]); return r.ok ? one('select _ss_cappello($1,$2,$3)', [n, m, r.p]) : null }
// tutti i sorteggi validi (forza bruta)
function tutti(n, m) {
  const out = [], p = [], usato = Array(n + 1).fill(false)
  const giu = i => {
    if (i === n) { out.push(p.join(',')); return }
    for (let r = 1; r <= n; r++) if (!usato[r] && !m[i * n + r - 1]) { usato[r] = true; p.push(r); giu(i + 1); p.pop(); usato[r] = false }
  }
  giu(0); return out
}
const rnd = k => Math.floor(Math.random() * k)

// 1) REGOLA D'ORO su migliaia di sorteggi (gruppi da 3 a 25, coppie a caso)
let cattivi = 0, fatti = 0
for (let t = 0; t < 3000; t++) {
  const n = 3 + rnd(23), coppie = []
  const persone = [...Array(n).keys()].sort(() => Math.random() - .5)
  for (let i = 0; i + 1 < n && coppie.length < n / 3; i += 2) if (Math.random() < .7) coppie.push([persone[i], persone[i + 1]])
  const m = matrice(n, coppie)
  const p = await cappello(n, m)
  if (p) { fatti++; if (!valido(n, m, p)) cattivi++ }
}
ok(cattivi === 0 && fatti > 2700, `regola d'oro: ${fatti} sorteggi, ognuno fa 1 regalo e ne riceve 1, nessuno a se stesso, coppie rispettate`)

// 2) DAVVERO A CASO: ogni sorteggio valido esce con la stessa frequenza (test del chi-quadro)
async function equita(n, m, volte, nome) {
  const validi = tutti(n, m), conta = Object.fromEntries(validi.map(k => [k, 0]))
  for (let t = 0; t < volte; t++) { const p = await cappello(n, m); conta[p.join(',')]++ }
  const atteso = volte / validi.length
  const chi2 = Object.values(conta).reduce((s, c) => s + (c - atteso) ** 2 / atteso, 0)
  const gdl = validi.length - 1, limite = gdl + 4 * Math.sqrt(2 * gdl)   // molto largo: fallisce solo se c'è un vero squilibrio
  const minimo = Math.min(...Object.values(conta)), massimo = Math.max(...Object.values(conta))
  ok(chi2 < limite && minimo > 0, `${nome}: ${validi.length} combinazioni valide, ${volte} sorteggi, ognuna tra ${minimo} e ${massimo} volte (atteso ${atteso.toFixed(0)}, chi² ${chi2.toFixed(1)} < ${limite.toFixed(1)})`)
}
await equita(5, matrice(5), 8800, 'equità con 5 persone')
await equita(6, matrice(6, [[0, 1], [2, 3]]), 6000, 'equità con 6 persone e 2 coppie')

// 3) "IMPOSSIBILE" SOLO QUANDO È VERO (confronto con la forza bruta, gruppi fino a 8)
let sbagli = 0, impossibili = 0, spiegazioniOk = 0
for (let t = 0; t < 1500; t++) {
  const n = 3 + rnd(6), m = matrice(n)
  const k = rnd(n * n)                                  // tante esclusioni a caso (anche in una sola direzione)
  for (let x = 0; x < k; x++) m[rnd(n) * n + rnd(n)] = true
  const esiste = tutti(n, m).length > 0
  const r = await one('select _ss_match($1,$2)', [n, m])
  if (r.ok !== esiste) sbagli++
  if (r.ok && !valido(n, m, r.p)) sbagli++
  if (!r.ok) {
    impossibili++
    // "chi" è un gruppo di persone che insieme possono regalare a meno persone di quante sono: la prova che è impossibile
    const S = r.chi.map(i => i - 1), N = new Set()
    for (const g of S) for (let j = 0; j < n; j++) if (!m[g * n + j]) N.add(j)
    if (N.size < S.length) spiegazioniOk++
  }
}
ok(sbagli === 0, `1500 casi difficili: il sorteggio dice "impossibile" solo quando non esiste davvero nessuna combinazione`)
ok(impossibili > 50 && spiegazioniOk === impossibili, `nei ${impossibili} casi impossibili indica sempre le persone che causano il problema`)

// 4) VELOCITÀ: 40 persone, 15 coppie, e gli abbinamenti dell'anno prima vietati, con il sorteggio vero (ss_draw)
const ev = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)', ['x', 'Grande', '', '', 'Ricky', '1234', null])
const nomi = Array.from({ length: 40 }, (_, i) => 'P' + (i + 1))
for (const n of nomi) await db.query('select ss_join($1,$2,$3,$4,$5)', ['x', ev, n, '1111', ''])
await db.query('select couples_set($1,$2,$3)', ['x', '', '[]']).catch(() => {})
await db.exec(`insert into group_couples(a,b) select 'P'||i, 'P'||(i+1) from generate_series(1,29,2) i`)
let t0 = Date.now(); const d1 = await one('select ss_draw($1,$2,$3)', ['x', ev, '1234']); const ms1 = Date.now() - t0
const ev2 = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)', ['x', 'Grande 2', '', '', 'Ricky', '1234', ev])
for (const n of nomi) await db.query('select ss_join($1,$2,$3,$4,$5)', ['x', ev2, n, '1111', ''])
t0 = Date.now(); const d2 = await one('select ss_draw($1,$2,$3)', ['x', ev2, '1234']); const ms2 = Date.now() - t0
ok(d1.ok && d2.ok && !d2.rilassato && (await one('select ss_check($1,$2)', ['x', ev2])).ok, `40 persone: sorteggio in ${ms1} ms, l'anno dopo (senza ripetere gli abbinamenti) in ${ms2} ms`)
ok(ms1 < 2500 && ms2 < 2500, 'abbastanza veloce (su Supabase il limite è 3 secondi, e Supabase è più veloce di questa prova)')
const rip = (await db.query(`select count(*)::int n from ss_pairs a join ss_pairs b on a.giver in (select id from ss_people where event_id=$1)
  join ss_people ga on ga.id=a.giver join ss_people ra on ra.id=a.receiver join ss_people gb on gb.id=b.giver join ss_people rb on rb.id=b.receiver
  where a.event_id=$2 and b.event_id=$1 and ga.name=gb.name and ra.name=rb.name`, [ev2, ev])).rows[0].n
ok(rip === 0, 'nessuno ripesca la stessa persona dell\'anno prima')
// impossibile scoperto subito (senza 3000 tentativi a vuoto)
const ev3 = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)', ['x', 'Impossibile', '', '', 'Ricky', '1234', null])
for (const n of ['A', 'B', 'C', 'D']) await db.query('select ss_join($1,$2,$3,$4,$5)', ['x', ev3, n, '1111', ''])
await db.query('select ss_set_excl($1,$2,$3,$4)', ['x', ev3, '1234', JSON.stringify([['A', 'B'], ['A', 'C'], ['A', 'D']])])
t0 = Date.now(); const d3 = await one('select ss_draw($1,$2,$3)', ['x', ev3, '1234']); const ms3 = Date.now() - t0
ok(d3.err === 'ESCLUSIONI_IMPOSSIBILI' && d3.chi === 'A' && ms3 < 1000, `impossibile riconosciuto in ${ms3} ms, colpa di: ${d3.chi}`)

// 5) LETTERE FINTE DAVVERO A CASO (non seguono l'ordine di iscrizione)
const ev4 = await one('select ss_create($1,$2,$3,$4,$5,$6,$7)', ['x', 'Lettere', '', '', 'Ricky', '1234', null])
const sei = ['Primo', 'Secondo', 'Terzo', 'Quarto', 'Quinto', 'Sesto']
for (const n of sei) await db.query('select ss_join($1,$2,$3,$4,$5)', ['x', ev4, n, '1111', ''])
await one('select ss_draw($1,$2,$3)', ['x', ev4, '1234'])
const freq = Object.fromEntries(sei.map(n => [n, {}]))
for (let t = 0; t < 1800; t++) {
  await db.query('select _ss_lettere($1)', [ev4])
  for (const r of (await db.query('select name, code from ss_people where event_id=$1', [ev4])).rows) freq[r.name][r.code] = (freq[r.name][r.code] || 0) + 1
}
const valori = sei.flatMap(n => 'ABCDEF'.split('').map(c => freq[n][c] || 0))
ok(Math.min(...valori) > 220 && Math.max(...valori) < 380, `lettere a caso: in 1800 sorteggi ogni persona prende ogni lettera tra ${Math.min(...valori)} e ${Math.max(...valori)} volte (atteso 300)`)
ok((freq.Primo.A || 0) < 380, 'il primo iscritto non prende più spesso la A')

console.log(fails ? `\n${fails} TEST FALLITI` : '\nTUTTI I TEST OK')
process.exit(fails ? 1 : 0)
