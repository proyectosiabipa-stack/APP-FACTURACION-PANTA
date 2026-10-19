import { api } from './api/index.js'

// PDF guardados en el equipo: se bajan una vez y después abren al instante (también tras recargar la página)
const CAJA = 'bipa-pdf-v1'
const memoria = new Map()
const enCurso = new Map()

async function desdeCaja(ruta) {
  try {
    const r = await (await caches.open(CAJA)).match(ruta)
    return r ? new Uint8Array(await r.arrayBuffer()) : null
  } catch { return null }
}

async function bajar(ruta) {
  const r = await fetch(await api.urlArchivo(ruta))
  if (!r.ok) throw new Error('No se pudo bajar el PDF')
  const datos = new Uint8Array(await r.arrayBuffer())
  try { await (await caches.open(CAJA)).put(ruta, new Response(datos, { headers: { 'Content-Type': 'application/pdf' } })) } catch { /* sin espacio: queda en memoria */ }
  return datos
}

// Devuelve una copia de los bytes del PDF (pdf.js se queda con la que recibe)
export async function obtenerPdf(ruta) {
  if (!memoria.has(ruta)) {
    if (!enCurso.has(ruta)) {
      enCurso.set(ruta, (async () => (await desdeCaja(ruta)) || bajar(ruta))()
        .then((d) => { memoria.set(ruta, d); return d })
        .finally(() => enCurso.delete(ruta)))
    }
    await enCurso.get(ruta)
  }
  return memoria.get(ruta).slice()
}

// Baja en segundo plano los PDF de los pedidos abiertos y borra los que ya no hacen falta
export function precargar(rutas) {
  const vivas = new Set(rutas.filter(Boolean))
  for (const r of vivas) obtenerPdf(r).catch(() => {})
  caches.open(CAJA).then(async (c) => {
    for (const req of await c.keys()) {
      const ruta = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
      if (![...vivas].some((v) => req.url.endsWith(encodeURI(v)) || ruta.endsWith(v))) c.delete(req)
    }
  }).catch(() => {})
}
