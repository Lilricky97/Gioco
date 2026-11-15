// ============================================================
//  PIPPEGHI 24/7 – "service worker": serve solo a ricevere le notifiche sul telefono.
//  Niente cache: il sito si aggiorna sempre come prima.
// ============================================================
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// arriva una notifica: { title, body, url: "#post/<id>", tag }
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (x) { d = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Pippeghi 24/7', {
    body: d.body || '',
    icon: 'icone/app-192.png',
    badge: 'icone/favicon-64.png',
    tag: d.tag || undefined,
    data: { url: self.registration.scope + (d.url || '') }
  }))
})

// tocco sulla notifica: apre il sito nel punto giusto (o porta davanti quello già aperto)
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope
  e.waitUntil((async () => {
    const aperti = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of aperti) {
      if (!c.url.startsWith(self.registration.scope)) continue
      await c.focus()
      if (c.navigate) { try { return await c.navigate(url) } catch (x) {} }
      return c.postMessage({ vai: url })
    }
    return self.clients.openWindow(url)
  })())
})
