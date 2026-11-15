// ============================================================
//  PIPPEGHI 24/7 – funzione "notifica" (Supabase Edge Function)
//  Va incollata UNA volta su Supabase: Edge Functions → Deploy a new function → Via Editor,
//  nome: notifica. Non serve impostare niente altro.
//
//  Come lavora:
//  - il database la chiama con {"id": numero} ogni volta che c'è una notifica nuova
//    (storia, post, evento): lei chiede al database testo e destinatari (notif_claim, una volta sola)
//    e la manda a tutti i telefoni iscritti;
//  - chiamata con {} (dal sito, quando qualcuno attiva le notifiche) crea le chiavi la prima volta
//    e restituisce la chiave pubblica.
//  Le chiavi segrete delle notifiche (VAPID) le crea lei e restano nel database: non passano da nessuna parte.
//  Usa solo le variabili che Supabase dà già a ogni funzione (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// ============================================================
import webpush from 'npm:web-push@3.6.7'

const URL_DB = Deno.env.get('SUPABASE_URL') ?? ''
const CHIAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SITO = Deno.env.get('SITO_URL') ?? 'https://lilricky97.github.io/Gioco/sito/'   // "chi manda" le notifiche (richiesto da Apple)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const risposta = (dati: unknown, stato = 200) =>
  new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } })

// funzioni del database riservate alla chiave service_role
async function rpc(fn: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${URL_DB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${t}`)
  return t ? JSON.parse(t) : null
}

// chiavi delle notifiche: create la prima volta, poi sempre le stesse
async function chiavi(): Promise<{ pub: string; priv: string }> {
  let k = await rpc('vapid_get')
  if (!k?.pub || !k?.priv) {
    const nuove = webpush.generateVAPIDKeys()
    k = await rpc('vapid_set', { p_pub: nuove.publicKey, p_priv: nuove.privateKey })   // se un'altra chiamata è arrivata prima, vince la sua
  }
  return k
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const dati = await req.json().catch(() => ({}))
    const k = await chiavi()
    if (!dati?.id) return risposta({ ok: true, pub: k.pub })

    const n = await rpc('notif_claim', { p_id: dati.id })   // null = già mandata
    if (!n) return risposta({ ok: true, gia: true })
    webpush.setVapidDetails(SITO, k.pub, k.priv)
    const testo = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag })
    let inviate = 0, tolte = 0, errori = 0
    await Promise.all((n.subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, testo, { TTL: 86400, urgency: 'normal' })
        inviate++
      } catch (e) {
        const stato = (e as { statusCode?: number }).statusCode
        if (stato === 404 || stato === 410) { tolte++; await rpc('push_gone', { p_endpoint: s.endpoint }).catch(() => {}) }   // telefono che non esiste più
        else { errori++; console.error('notifica non partita:', stato ?? '', String(e).slice(0, 300)) }   // si legge nei log di Supabase
      }
    }))
    return risposta({ ok: true, inviate, tolte, errori })
  } catch (e) {
    return risposta({ ok: false, err: String(e) }, 500)
  }
})
