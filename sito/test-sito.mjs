// ============================================================
//  TEST DEL SITO "dal vivo" con più telefoni finti (Playwright).
//  Prima avvia il finto Supabase:   node prova-locale.mjs
//  poi:                             node test-sito.mjs
//  Le schermate finiscono in ./schermate/ (SHOTS=cartella per cambiarla)
// ============================================================
import { createRequire } from 'node:module'
import fs from 'node:fs'
const { chromium, devices } = createRequire(import.meta.url)('playwright')

const BASE = process.env.BASE || 'http://localhost:8787'
const SHOTS = process.env.SHOTS || new URL('./schermate/', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })
let fails = 0
const ok = (c, m) => { if (!c) { fails++; console.log('❌', m) } else console.log('✅', m) }
const browser = await chromium.launch()
const phone = devices['iPhone 13']
const errori = []

async function telefono(nome) {
  const ctx = await browser.newContext({ ...phone })
  const page = await ctx.newPage()
  page.on('pageerror', e => errori.push(`${nome}: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|autofocusing/.test(m.text())) errori.push(`${nome}: ${m.text()}`) })
  page.nome = nome
  return page
}
const shot = (page, f) => page.screenshot({ path: SHOTS + f + '.png' })
const toastText = async page => (await page.locator('.toast').last().textContent({ timeout: 8000 })).trim()
async function apriAdm(page) {
  await page.waitForSelector('#ss-adm')
  if (!await page.evaluate(() => document.querySelector('#ss-adm').open)) await page.click('#ss-adm summary')
}
async function entra(page, nome, pw = 'prova') {
  await page.goto(BASE + '/')
  await page.fill('#g-in', pw)
  await page.click('#g-pw [type=submit]')
  await page.waitForSelector('#g-who h2')
  const chip = page.locator(`#g-who [data-n="${nome}"]`)
  if (await chip.count()) await chip.click()
  else { await page.fill('#g-name input', nome); await page.click('#g-name button') }
  await page.waitForSelector('.tabs')
}
// immagini di prova (foto grandi, colorate)
async function immagini(page, n, w = 3000, h = 2000) {
  const out = []
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate(([i, w, h]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, `hsl(${i * 70},90%,55%)`); g.addColorStop(1, `hsl(${i * 70 + 140},90%,35%)`)
      x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = `bold ${h / 4}px sans-serif`; x.fillText('FOTO ' + (i + 1), w / 10, h / 1.7)
      return c.toDataURL('image/jpeg', .9).split(',')[1]
    }, [i, w, h])
    out.push({ name: `foto${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') })
  }
  return out
}

// ---------------- INGRESSO ----------------
const ricky = await telefono('Ricky')
await ricky.goto(BASE + '/')
await shot(ricky, '01-password')
await ricky.fill('#g-in', 'sbagliata'); await ricky.click('#g-pw [type=submit]')
await ricky.waitForSelector('#g-pw .err:not([hidden])')
ok((await ricky.textContent('#g-pw .err:not([hidden])')).includes('sbagliata'), 'password sbagliata: messaggio chiaro')
await ricky.fill('#g-in', 'prova'); await ricky.click('#g-pw [type=submit]')
await ricky.waitForSelector('#g-who h2')
await ricky.fill('#g-name input', 'Ricky'); await ricky.click('#g-name button')
await ricky.waitForSelector('.tabs')
ok(await ricky.locator('.me b').textContent() === 'Ricky', 'entrato come Ricky')
await ricky.waitForSelector('#feed .empty'); await shot(ricky, '02-novita-vuota')

// ---------------- NOVITÀ ----------------
await ricky.fill('#np-text', 'Ciao a tutti! Il sito è online 🎉 #Pippeghi\nGuardate qui https://example.com/prova?x=1&y=2#ancora')
await ricky.setInputFiles('#np-file', await immagini(ricky, 2))
ok(await ricky.locator('#np-prev img').count() === 2, 'anteprima delle 2 foto prima di pubblicare')
await ricky.click('#np-go')
ok((await toastText(ricky)).includes('Pubblicato'), 'novità pubblicata')
await ricky.waitForSelector('#feed .tw .pics img')
ok(await ricky.locator('#feed .tw').count() === 1 && await ricky.locator('#feed .tw .pics .pic').count() === 2, 'la novità ha 2 foto')
ok(await ricky.locator('#feed .tw .tw-t a[href="https://example.com/prova?x=1&y=2#ancora"]').count() === 1, 'il link nel testo è cliccabile')
ok(await ricky.locator('#feed .tw .tw-t a.htag').textContent() === '#Pippeghi' && await ricky.locator('#feed .tw .tw-t a.htag').count() === 1, '#Pippeghi cliccabile (e #ancora dentro il link no)')
ok((await ricky.textContent('#trends-m')).includes('#pippeghi1'), 'tendenze: #pippeghi con 1 post')
ok(await ricky.inputValue('#np-text') === '' && await ricky.locator('#np-prev img').count() === 0, 'riquadro svuotato dopo la pubblicazione')
const stato1 = await (await fetch(BASE + '/__prova/stato')).json()
ok(stato1.files.filter(f => f.startsWith('novita/')).length === 4, 'caricate 2 foto + 2 miniature')
await ricky.waitForFunction(() => [...document.querySelectorAll('#feed img')].every(i => i.complete && i.naturalWidth > 0))
await shot(ricky, '03-novita-post')
await ricky.click('#feed .pic >> nth=0')
await ricky.waitForSelector('.lb-img')
await ricky.waitForFunction(() => document.querySelector('.lb-img').naturalWidth > 0)
const dim = await ricky.evaluate(() => [document.querySelector('.lb-img').naturalWidth, document.querySelector('.lb-img').naturalHeight])
ok(dim[0] === 1600 && dim[1] === 1067, 'foto ridimensionata a 1600px (era 3000x2000): ' + dim)
ok((await ricky.textContent('.lb-n')) === '1 / 2', 'visore: 1 / 2')
await ricky.click('.lb-next'); ok((await ricky.textContent('.lb-n')) === '2 / 2', 'visore: freccia avanti')
await shot(ricky, '04-visore')
await ricky.click('.lb-x'); ok(await ricky.locator('.lb').count() === 0, 'visore chiuso')

// un secondo amico vede la novità
const marco = await telefono('Marco')
await entra(marco, 'Marco')
await marco.waitForSelector('#feed .tw')
ok((await marco.textContent('#feed .tw .tw-h b')) === 'Ricky', 'Marco vede la novità di Ricky')
// mi piace, risposte e #hashtag
await marco.click('#feed [data-like]')
await marco.waitForFunction(() => document.querySelector('#feed [data-like]').classList.contains('on'))
ok((await marco.textContent('#feed [data-like] span')) === '1', 'Marco mette mi piace: 1')
await marco.fill('#np-text', 'Post senza hashtag'); await marco.click('#np-go'); await marco.waitForFunction(() => document.querySelectorAll('#feed .tw').length === 2)
await marco.click('#feed .tw:nth-child(2) .tw-t')
await marco.waitForSelector('#rp-text')
ok((await marco.textContent('#likers')).includes('Piace a Marco'), 'nel post si vede a chi piace')
await marco.fill('#rp-text', 'Grande! #pippeghi #capodanno'); await marco.click('#rp-form button')
await marco.waitForSelector('#replies .tw.reply')
ok((await marco.textContent('#replies .tw-t')) === 'Grande! #pippeghi #capodanno' && await marco.locator('#replies a.htag').count() === 2, 'risposta inviata, con hashtag cliccabili')
await shot(marco, '03b-risposte')
await marco.click('#pb'); await marco.waitForSelector('#feed .tw')
ok((await marco.textContent('#feed .tw:nth-child(2) [data-rep] span')) === '1', 'nel feed: 💬 1')
await marco.click('#trends-m .chip.tr'); await marco.waitForSelector('.tag-head')
ok(marco.url().endsWith('#tag/pippeghi') && await marco.locator('#feed .tw').count() === 1, 'tocco #pippeghi: solo i post con quell\'hashtag')
await marco.click('.tag-head [data-go]'); await marco.waitForFunction(() => document.querySelectorAll('#feed .tw').length === 2)
await ricky.reload(); await ricky.waitForSelector('#feed .tw')
ok((await ricky.textContent('#feed .tw:nth-child(2) [data-like] span')) === '1' && !(await ricky.locator('#feed .tw:nth-child(2) [data-like].on').count()), 'Ricky vede 1 mi piace (non suo)')
await ricky.setViewportSize({ width: 1280, height: 860 }); await shot(ricky, '03c-computer'); await ricky.setViewportSize(phone.viewport)
ok(await marco.locator('#feed .tw:nth-child(2) [data-del]').count() === 0 && await marco.locator('#feed .tw:nth-child(1) [data-del]').count() === 1, 'Marco può eliminare solo il suo post, non quello di Ricky')
// Marco entra la seconda volta con il chip del nome (non crea un doppione "marco")
const marco2 = await telefono('Marco-2')
await marco2.goto(BASE + '/'); await marco2.fill('#g-in', 'prova'); await marco2.click('#g-pw [type=submit]')
await marco2.waitForSelector('#g-who [data-n="Marco"]')
await marco2.fill('#g-name input', 'marco'); await marco2.click('#g-name button'); await marco2.waitForSelector('.tabs')
ok((await marco2.textContent('.me b')) === 'Marco', '"marco" minuscolo diventa il Marco già esistente')
await marco2.close()

// ---------------- FOTO ----------------
await ricky.click('[data-tab=foto]')
await ricky.waitForSelector('#albums .empty')
await ricky.click('#al-new'); await ricky.fill('.sheet input[name=n]', 'Capodanno 2026'); await ricky.click('.sheet [type=submit]')
await ricky.waitForSelector('#al-grid .empty')
ok((await ricky.textContent('#al-head h1')) === 'Capodanno 2026', 'cartella creata e aperta')
await ricky.setInputFiles('#al-file', await immagini(ricky, 4, 1200, 1800))
await ricky.waitForFunction(() => document.querySelectorAll('#al-grid .pic').length === 4, null, { timeout: 30000 })
ok(true, '4 foto caricate nella cartella')
await ricky.waitForFunction(() => [...document.querySelectorAll('#al-grid img')].every(i => i.complete && i.naturalWidth > 0))
await shot(ricky, '05-cartella')
await ricky.click('#al-grid .pic >> nth=1'); await ricky.waitForSelector('.lb-del')
ok((await ricky.textContent('.lb-cap')).startsWith('Ricky'), 'visore mostra chi ha caricato la foto')
await ricky.click('.lb-del'); await ricky.click('.sheet [data-ok]')
await ricky.waitForFunction(() => document.querySelectorAll('#al-grid .pic').length === 3)
ok(true, 'foto eliminata: ne restano 3')
await ricky.click('.back')
await ricky.waitForSelector('#albums .album')
ok((await ricky.textContent('#albums .album .n')).startsWith('3 foto'), 'elenco cartelle: 3 foto, con copertina')
await shot(ricky, '06-cartelle')
// cartella vuota si può eliminare
await ricky.click('#al-new'); await ricky.fill('.sheet input[name=n]', 'Da buttare'); await ricky.click('.sheet [type=submit]')
await ricky.waitForSelector('#al-del'); await ricky.click('#al-del'); await ricky.click('.sheet [data-ok]')
await ricky.waitForSelector('#albums .album')
ok(await ricky.locator('#albums .album').count() === 1, 'cartella vuota eliminata')

// ---------------- SECRET SANTA ----------------
await ricky.click('[data-tab=santa]')
await ricky.waitForSelector('#ss-list .empty')
await ricky.click('#ss-new')
await ricky.fill('.sheet input[name=b]', '30 €'); await ricky.fill('.sheet input[name=d]', 'cena del 20 dicembre')
await ricky.fill('.sheet input[name=p1]', '1234'); await ricky.fill('.sheet input[name=p2]', '1235')
await ricky.click('.sheet [type=submit]')
ok((await ricky.textContent('.sheet .err')).includes('non coincidono'), 'PIN organizzatore ripetuto male: bloccato')
await ricky.fill('.sheet input[name=p2]', '1234'); await ricky.click('.sheet [type=submit]')
await ricky.waitForSelector('#ss-join')
const evId = ricky.url().split('#santa/')[1]
ok(/^[0-9a-f-]{36}$/.test(evId), 'Secret Santa creato')
ok(await ricky.locator('#adm-body [data-x=draw]').isDisabled(), 'area organizzatore già sbloccata, sorteggio disattivato (meno di 3)')
await shot(ricky, '07-santa-nuovo')

const amici = { Ricky: { page: ricky, pin: '1111' }, Marco: { page: marco, pin: '2222' } }
for (const n of ['Giulia', 'Sara', 'Luca', 'Anna']) { amici[n] = { page: await telefono(n), pin: String(3000 + Object.keys(amici).length * 111) }; await entra(amici[n].page, n) }
for (const [n, a] of Object.entries(amici)) {
  const p = a.page
  await p.goto(BASE + '/#santa/' + evId); await p.waitForSelector('#ss-join')
  ok((await p.inputValue('#ss-join [name=nm]')) === n, `${n}: nome già compilato`)
  if (n === 'Giulia') {   // tentativo di rubare il nome di Marco
    await p.fill('#ss-join [name=nm]', 'marco'); await p.fill('#ss-join [name=pin]', '9876'); await p.click('#ss-join [type=submit]')
    await p.waitForSelector('#ss-join .err:not([hidden])')
    ok((await p.textContent('#ss-join .err')).includes('già qualcuno'), 'Giulia non può iscriversi come "marco"')
    await p.fill('#ss-join [name=nm]', 'Giulia')
  }
  if (n === 'Sara') { await p.fill('#ss-join [name=pin]', '12'); await p.click('#ss-join [type=submit]'); ok((await p.textContent('#ss-join .err')).includes('4 a 8'), 'PIN troppo corto: bloccato') }
  await p.fill('#ss-join [name=pin]', a.pin)
  await p.fill('#ss-join [name=wish]', `Letterina di ${n}: vorrei una cosa bella`)
  await p.click('#ss-join [type=submit]')
  await p.waitForSelector('#ss-me [data-a=wish]')
  ok((await p.textContent('#ss-me h3')).includes(n), `${n} iscritto`)
}
await ricky.reload(); await ricky.waitForSelector('#ss-me [data-a=wish]')
ok(await ricky.locator('#ev .chips .chip').count() === 6, '6 partecipanti nella lista')
await shot(amici.Anna.page, '08-santa-iscritto')

// Sara esce e rientra
const sara = amici.Sara.page
await sara.click('#ss-me [data-a=leave]'); await sara.click('.sheet [data-ok]')
await sara.waitForSelector('#ss-join'); ok(await sara.locator('#ev .chips .chip').count() === 5, 'Sara è uscita')
await sara.fill('#ss-join [name=pin]', amici.Sara.pin); await sara.fill('#ss-join [name=wish]', 'Letterina di Sara: vorrei una cosa bella'); await sara.click('#ss-join [type=submit]')
await sara.waitForSelector('#ss-me [data-a=wish]')

// un non-organizzatore non entra nell'area organizzatore
await marco.reload(); await marco.waitForSelector('#ss-me')
await marco.click('#ss-adm summary'); await marco.fill('#adm-in [name=p]', '0000'); await marco.click('#adm-in button')
await marco.waitForSelector('#adm-body .err:not([hidden])')
ok((await marco.textContent('#adm-body .err')).includes('organizzatore sbagliato'), 'Marco col PIN sbagliato non sblocca l\'area organizzatore')

// esclusioni (coppie) e sorteggio
await ricky.reload(); await apriAdm(ricky); await ricky.waitForSelector('#adm-body [data-x=draw]')
const escl = [['Ricky', 'Giulia'], ['Marco', 'Sara']]
for (const [a, b] of escl) {
  await ricky.selectOption('#ex-a', a); await ricky.selectOption('#ex-b', b); await ricky.click('[data-x=addex]')
  await ricky.waitForFunction(([a, b]) => [...document.querySelectorAll('.excl span')].some(s => s.textContent.includes(a) && s.textContent.includes(b)), [a, b])
}
ok(await ricky.locator('.excl').count() === 2, '2 esclusioni salvate')
await ricky.selectOption('#ex-a', 'Luca'); await ricky.selectOption('#ex-b', 'Luca'); await ricky.click('[data-x=addex]')
ok((await toastText(ricky)).includes('due persone diverse'), 'esclusione con se stesso bloccata')
await shot(ricky, '09-organizzatore')
// Giulia guarda prima del sorteggio
await amici.Giulia.page.reload(); await amici.Giulia.page.waitForSelector('#ss-me')
ok((await amici.Giulia.page.textContent('#ss-me')).includes('torna qui'), 'prima del sorteggio: "torna qui"')

await ricky.click('[data-x=draw]'); await ricky.click('.sheet [data-ok]')
await ricky.waitForSelector('#ss-me [data-a=reveal]')
ok((await ricky.textContent('#ev .pill')).includes('Sorteggio fatto'), 'sorteggio fatto')

async function scopri(p) {
  await p.reload(); await p.waitForSelector('#ss-me [data-a=reveal]')
  await p.click('#ss-me [data-a=reveal]')
  await p.waitForSelector('.rv-name', { timeout: 8000 })
  return { to: (await p.textContent('.rv-name')).trim(), wish: (await p.textContent('.letter p')).trim() }
}
const abb = {}
for (const [n, a] of Object.entries(amici)) {
  const r = await scopri(a.page); abb[n] = r.to
  ok(r.wish === `Letterina di ${r.to}: vorrei una cosa bella`, `${n} fa il regalo a ${r.to} e vede la SUA letterina`)
}
await amici.Luca.page.waitForTimeout(1400); await shot(amici.Luca.page, '10-scoperto')
const nomi = Object.keys(amici)
ok(nomi.every(n => abb[n] !== n), 'nessuno ha pescato se stesso')
ok(new Set(Object.values(abb)).size === nomi.length, 'ognuno riceve un solo regalo')
ok(escl.every(([a, b]) => abb[a] !== b && abb[b] !== a), 'esclusioni rispettate (Ricky↔Giulia, Marco↔Sara)')
let giro = 0, x = 'Ricky'; do { x = abb[x]; giro++ } while (x !== 'Ricky' && giro < 20)
ok(giro === nomi.length, 'un unico giro che passa da tutti')
// la verifica pubblica
await marco.click('#ss-check'); await marco.waitForSelector('#ss-check-out .h')
ok((await marco.textContent('#ss-check-out .h')).includes('regolare'), 'verifica pubblica: sorteggio regolare')
await shot(marco, '11-verifica')

// dopo il sorteggio non si entra più
const nuovo = await telefono('Paolo'); await entra(nuovo, 'Paolo')
await nuovo.goto(BASE + '/#santa/' + evId); await nuovo.waitForSelector('#ss-me [data-a=login]')
ok(await nuovo.locator('#ss-join').count() === 0, 'dopo il sorteggio niente modulo di iscrizione')

// Anna da un ALTRO telefono (senza PIN salvato)
const anna2 = await telefono('Anna-2'); await entra(anna2, 'Anna')
await anna2.goto(BASE + '/#santa/' + evId); await anna2.waitForSelector('#ss-me [data-a=login]')
await anna2.click('#ss-me [data-a=login]')
ok((await anna2.inputValue('.sheet select')) === 'Anna', 'il suo nome è già scelto')
await anna2.fill('.sheet [name=p]', '0000'); await anna2.click('.sheet [type=submit]')
await anna2.waitForSelector('.sheet .err:not([hidden])'); ok((await anna2.textContent('.sheet .err')).includes('PIN sbagliato'), 'PIN sbagliato: non rivela niente')
await anna2.fill('.sheet [name=p]', amici.Anna.pin); await anna2.click('.sheet [type=submit]')
await anna2.waitForSelector('.rv-name')
ok((await anna2.textContent('.rv-name')).trim() === abb.Anna, 'Anna dall\'altro telefono vede lo stesso abbinamento')
await shot(anna2, '12-altro-telefono')

// Luca dimentica il PIN: l'organizzatore gliene dà uno nuovo
await ricky.reload(); await apriAdm(ricky); await ricky.waitForSelector('#adm-body [data-x=reset]')
await ricky.click('[data-x=reset][data-n=Luca]'); await ricky.fill('.sheet [name=p]', '9999'); await ricky.click('.sheet [type=submit]')
await ricky.waitForSelector('.sheet h3:text("PIN cambiato")')
ok((await ricky.textContent('.sheet:has(h3:text("PIN cambiato"))')).includes('9999'), 'organizzatore: nuovo PIN per Luca mostrato')
ok(!(await ricky.textContent('.sheet:has(h3:text("PIN cambiato"))')).includes(abb.Luca), '…senza rivelare a chi fa il regalo Luca')
const luca = amici.Luca.page
await luca.reload(); await luca.waitForSelector('#ss-me [data-a=reveal]'); await luca.click('#ss-me [data-a=reveal]')
ok((await toastText(luca)).includes('PIN è cambiato'), 'Luca col vecchio PIN salvato: avviso "PIN cambiato"')
await luca.waitForSelector('#ss-me [data-a=login]'); await luca.click('#ss-me [data-a=login]')
await luca.selectOption('.sheet select', 'Luca'); await luca.fill('.sheet [name=p]', '9999'); await luca.click('.sheet [type=submit]')
await luca.waitForSelector('.rv-name'); ok((await luca.textContent('.rv-name')).trim() === abb.Luca, 'Luca col nuovo PIN vede lo stesso abbinamento')

// Marco cambia letterina dopo il sorteggio: il suo Babbo la vede aggiornata
await marco.reload(); await marco.waitForSelector('#ss-me [data-a=wish]'); await marco.click('#ss-me [data-a=wish]')
await marco.waitForSelector('.sheet textarea')
ok((await marco.inputValue('.sheet textarea')) === 'Letterina di Marco: vorrei una cosa bella', 'letterina attuale precaricata')
await marco.fill('.sheet textarea', 'Ho cambiato idea: calzini con le renne 🦌'); await marco.click('.sheet [type=submit]')
ok((await toastText(marco)).includes('salvata'), 'letterina salvata')
const santaDiMarco = nomi.find(n => abb[n] === 'Marco')
const r2 = await scopri(amici[santaDiMarco].page)
ok(r2.to === 'Marco' && r2.wish.includes('renne'), `${santaDiMarco} vede la letterina nuova di Marco`)

// annulla e rifai il sorteggio: nessuno vede il vecchio abbinamento
await ricky.reload(); await apriAdm(ricky); await ricky.waitForSelector('[data-x=undo]')
await ricky.click('[data-x=undo]'); await ricky.click('.sheet [data-ok]')
await ricky.waitForSelector('[data-x=draw]')
const g = amici.Giulia.page
await g.reload(); await g.waitForSelector('#ss-me'); ok((await g.textContent('#ss-me')).includes('torna qui'), 'sorteggio annullato: Giulia torna in attesa')
await ricky.click('[data-x=draw]'); await ricky.click('.sheet [data-ok]'); await ricky.waitForSelector('#ss-me [data-a=reveal]')
const abb2 = {}
for (const [n, a] of Object.entries(amici)) {
  if (n === 'Luca') a.page = luca
  abb2[n] = (await scopri(a.page)).to
}
let giro2 = 0; x = 'Ricky'; do { x = abb2[x]; giro2++ } while (x !== 'Ricky' && giro2 < 20)
ok(giro2 === nomi.length && nomi.every(n => abb2[n] !== n) && escl.every(([a, b]) => abb2[a] !== b && abb2[b] !== a), 'secondo sorteggio valido')

// ---------------- ALTRE SEZIONI ----------------
await ricky.click('[data-tab=gioco]'); await ricky.waitForSelector('.game')
ok((await ricky.getAttribute('.game a.btn', 'href')).includes('blob/68a1fb1/index.html'), 'Gioco: link a Senza Filtro')
await shot(ricky, '13-gioco')
// Senza Filtro dentro il sito
await ricky.click('#gl-open'); await ricky.waitForSelector('#gl:not([hidden]) iframe')
ok(ricky.url().endsWith('#gioco/gioca'), 'Gioco: si apre dentro il sito')
let giocoOk = false
try { await ricky.frameLocator('#gl-f').locator('body').waitFor({ timeout: 20000 }); await ricky.waitForFunction(() => true); giocoOk = true } catch (e) {}
const titoloGioco = await ricky.frame({ url: /htmlpreview/ })?.title().catch(() => '')
ok(giocoOk && /Senza Filtro/.test(titoloGioco || ''), 'Gioco: Senza Filtro caricato (' + titoloGioco + ')')
await ricky.waitForTimeout(1500); await shot(ricky, '13b-gioco-dentro')
await ricky.evaluate(() => { document.querySelector('#gl-f').dataset.segno = 'stesso' })
await ricky.click('#gl-min'); await ricky.waitForSelector('#gl-pill')
ok(await ricky.locator('#gl').isHidden() && ricky.url().endsWith('#gioco'), '‹ Sito: torno al sito, il gioco resta aperto dietro')
await ricky.click('[data-tab=novita]'); await ricky.waitForSelector('#feed')
ok(await ricky.locator('#gl-pill').isVisible(), 'il bottone "Partita in corso" si vede anche nelle Novità')
await ricky.click('#gl-pill'); await ricky.waitForSelector('#gl:not([hidden])')
ok(await ricky.evaluate(() => document.querySelector('#gl-f').dataset.segno) === 'stesso', 'rientro nella STESSA partita (non ricaricata)')
await ricky.goBack(); await ricky.waitForSelector('#gl', { state: 'hidden' })
ok(ricky.url().endsWith('#novita'), 'tasto indietro del telefono: torna dove ero')
await ricky.click('#gl-pill'); await ricky.click('#gl-x'); await ricky.click('.sheet [data-ok]')
await ricky.waitForFunction(() => !document.querySelector('#gl') && !document.querySelector('#gl-pill'))
ok(true, '✕: gioco chiuso davvero')
await ricky.click('[data-tab=fanta]'); await ricky.waitForSelector('.soon'); await shot(ricky, '14-fanta')
await ricky.click('[data-tab=santa]'); await ricky.waitForSelector('#ss-list .ss-item'); await shot(ricky, '15-santa-lista')
// elimina il post e prova "cambia nome"
await ricky.click('[data-tab=novita]'); await ricky.waitForSelector('#feed [data-del]')
await ricky.click('#feed [data-del]'); await ricky.click('.sheet [data-ok]'); await ricky.waitForFunction(() => document.querySelectorAll('#feed .tw').length === 1)
ok(!(await ricky.textContent('#trends-m')).includes('pippeghi'), 'post eliminato: sparisce anche dalle tendenze')
await ricky.click('#me-btn'); await shot(ricky, '16-profilo'); await ricky.click('.sheet [data-a=esci]')
await ricky.waitForSelector('#g-pw'); ok(true, 'esci: torna alla password')

// password cambiata mentre si è dentro → torna alla password
await marco.evaluate(() => localStorage.setItem('pip_pw', JSON.stringify('vecchia')))
await marco.goto(BASE + '/#novita'); await marco.reload(); await marco.waitForSelector('#g-pw .err')
ok((await marco.textContent('#g-pw .err')).includes('cambiata'), 'password cambiata: richiesta di nuovo')

// ---------------- MODALITÀ PROVA (sito senza database) ----------------
const pr = await telefono('Prova')
await pr.goto(BASE + '/prova')
ok((await pr.textContent('.demo-note')).includes('prova'), 'prova: avviso con la password di prova')
await pr.fill('#g-in', 'LaMiaPasswordVera'); await pr.click('#g-pw [type=submit]'); await pr.waitForSelector('#g-pw .err:not([hidden])')
ok((await pr.textContent('#g-pw .err:not([hidden])')).includes('modalità prova'), 'prova: con un\'altra password spiega che per ora è "prova"')
await pr.click('#g-eye'); ok(await pr.getAttribute('#g-in', 'type') === 'text', 'occhio: mostra la password')
await pr.fill('#g-in', 'Prova '); await pr.click('#g-pw [type=submit]'); await pr.waitForSelector('#g-who'); ok(true, 'prova: "Prova " con maiuscola e spazio va bene')
await pr.evaluate(() => localStorage.clear()); await pr.reload()
await shot(pr, '20-prova-ingresso')
await pr.fill('#g-in', 'prova'); await pr.click('#g-pw [type=submit]'); await pr.waitForSelector('#g-who [data-n=Marco]')
await pr.fill('#g-name input', 'Ricky'); await pr.click('#g-name button'); await pr.waitForSelector('#feed .tw')
ok(await pr.locator('.demo-bar').count() === 1 && await pr.locator('#feed .tw').count() === 5, 'prova: 5 post di esempio e striscia "modalità prova"')
ok((await pr.textContent('#trends-m')).includes('#capodanno2') && (await pr.textContent('#trends-m')).includes('#mare2'), 'prova: tendenze #capodanno e #mare')
await pr.waitForFunction(() => [...document.querySelectorAll('#feed img')].every(i => i.complete && i.naturalWidth > 0))
await shot(pr, '21-prova-novita')
await pr.click('#feed [data-like]'); await pr.waitForFunction(() => document.querySelector('#feed [data-like]').classList.contains('on'))
ok((await pr.textContent('#feed [data-like] span')) === '3', 'prova: mi piace (2 → 3)')
await pr.setInputFiles('#np-file', await immagini(pr, 1)); await pr.fill('#np-text', 'Foto di prova #test'); await pr.click('#np-go')
await pr.waitForFunction(() => document.querySelectorAll('#feed .tw').length === 6)
await pr.waitForFunction(() => document.querySelector('#feed .tw .pics img').naturalWidth > 0)
ok(true, 'prova: post con foto caricato e visibile')
await pr.click('[data-tab=foto]'); await pr.waitForSelector('#albums .album'); await pr.click('#albums .album')
await pr.waitForFunction(() => document.querySelectorAll('#al-grid .pic').length === 5); ok(true, 'prova: cartella con 5 foto finte')
await pr.click('[data-tab=santa]'); await pr.waitForSelector('.ss-item'); await pr.click('.ss-item'); await pr.waitForSelector('#ss-join')
await pr.fill('#ss-join [name=pin]', '5555'); await pr.click('#ss-join [type=submit]'); await pr.waitForSelector('#ss-me [data-a=wish]')
await apriAdm(pr); ok((await pr.textContent('#adm-body')).includes('0000'), 'prova: suggerito il PIN organizzatore 0000')
await pr.fill('#adm-in [name=p]', '0000'); await pr.click('#adm-in button'); await pr.waitForSelector('[data-x=draw]')
await pr.click('[data-x=draw]'); await pr.click('.sheet [data-ok]'); await pr.waitForSelector('#ss-me [data-a=reveal]')
await pr.click('#ss-me [data-a=reveal]'); await pr.waitForSelector('.rv-name')
const dTo = (await pr.textContent('.rv-name')).trim()
ok(['Marco', 'Giulia', 'Sara', 'Luca'].includes(dTo), 'prova: sorteggio fatto, Ricky fa il regalo a ' + dTo)
await pr.click('#ss-check'); await pr.waitForSelector('#ss-check-out .h'); ok((await pr.textContent('#ss-check-out .h')).includes('regolare'), 'prova: verifica sorteggio ok')
for (const w of [320, 1280]) { await pr.setViewportSize({ width: w, height: w === 320 ? 640 : 860 }); await pr.click('[data-tab=novita]'); await pr.waitForSelector('#feed .tw'); ok(!(await pr.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `prova: niente scorrimento laterale a ${w}px`); await shot(pr, '22-prova-' + w) }

ok(errori.length === 0, 'nessun errore JavaScript' + (errori.length ? ': ' + errori.join(' | ') : ''))
await browser.close()
console.log(fails ? `\n${fails} TEST FALLITI` : '\nTUTTI I TEST OK')
process.exit(fails ? 1 : 0)
