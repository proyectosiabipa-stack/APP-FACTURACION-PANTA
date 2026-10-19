// La app queda guardada en el equipo: abre al instante aunque el wifi esté lento.
// La página principal se pide primero a la red (para recibir siempre la versión nueva) y, si tarda, se usa la guardada.
const APP = 'bipa-app-v4'
const BASE = ['./', './manifest.webmanifest', './icono-192.png', './icono-512.png', './logo-bipa.png', './hoja.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('bipa-app-') && k !== APP).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

const deRed = (req, espera) => new Promise((ok, mal) => {
  const t = espera ? setTimeout(mal, espera) : null
  fetch(req).then((r) => {
    clearTimeout(t)
    if (r.ok) caches.open(APP).then((c) => c.put(req, r.clone()))
    ok(r)
  }, mal)
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  if (req.mode === 'navigate') {
    // Red primero (máximo 2,5 s); si no, la versión guardada
    e.respondWith(deRed(req, 2500).catch(() => caches.match('./').then((r) => r || fetch(req))))
    return
  }
  // Archivos de la app (llevan su versión en el nombre): guardados primero
  e.respondWith(caches.match(req).then((r) => r || deRed(req)))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow('./'))))
})

// Aviso que llega desde la nube: suena y vibra aunque la app esté cerrada
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data.json() } catch { d = { titulo: 'BIPA Despacho', texto: e.data?.text() || '' } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'BIPA Despacho', {
    body: d.texto || '',
    icon: './icono-192.png',
    badge: './icono-192.png',
    tag: d.etiqueta || undefined,
    renotify: !!d.etiqueta,
    vibrate: [200, 100, 200, 100, 300],
    requireInteraction: true,
  }))
})
