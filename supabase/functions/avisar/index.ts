// Avisos que suenan en el teléfono o la PC. La base de datos llama aquí cada vez que un pedido cambia de estado
// (con la clave privada «aviso_secreto»), y esta función manda el aviso a los equipos que deben enterarse.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import webpush from 'npm:web-push@3.6.7'

const PLANTA = ['planta', 'admin']
const FACTURACION = ['comercial', 'admin']

function mensaje(d: any): { para: string[]; titulo: string; texto: string } | null {
  const cliente = d.cliente || 'Sin cliente'
  const doc = d.tipo_doc === 'fiscal' ? 'Factura fiscal' : 'Nota de entrega'
  switch (d.tipo) {
    case 'nueva': return { para: PLANTA, titulo: 'Cotización nueva', texto: `${cliente}. Revise si hay todo.` }
    case 'respuesta': return { para: PLANTA, titulo: 'Facturación respondió', texto: `${cliente}. Revise la respuesta.` }
    case 'en_espera': return { para: FACTURACION, titulo: 'Planta tiene una novedad', texto: d.nota ? `${cliente}: ${d.nota}` : cliente }
    case 'disponible': return { para: FACTURACION, titulo: 'Todo disponible', texto: `${cliente}. Lista para facturar.` }
    case 'documento_listo':
      return d.tipo_doc === 'fiscal'
        ? { para: PLANTA, titulo: 'Factura lista', texto: `${cliente}. Facturación la imprime y la manda.` }
        : { para: PLANTA, titulo: `${doc} lista`, texto: `${cliente}. Imprímala en planta.` }
    case 'despachado': return { para: FACTURACION, titulo: 'Pedido despachado', texto: cliente }
    case 'anulado': return { para: PLANTA, titulo: 'Pedido anulado', texto: `${cliente}. No lo prepare.` }
  }
  return null
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: ajustes } = await admin.from('_ajustes').select('clave, valor')
    .in('clave', ['vapid_publica', 'vapid_privada', 'aviso_secreto'])
  const a = Object.fromEntries((ajustes ?? []).map((f: any) => [f.clave, f.valor]))
  if (!a.aviso_secreto || req.headers.get('x-aviso') !== a.aviso_secreto) return new Response('no', { status: 401 })

  const d = await req.json()
  const m = mensaje(d)
  if (!m) return new Response('sin aviso')

  webpush.setVapidDetails('https://proyectosiabipa-stack.github.io/APP-FACTURACION-PANTA/', a.vapid_publica, a.vapid_privada)
  let q = admin.from('suscripciones').select('endpoint, perfil_id, p256dh, auth').in('rol', m.para)
  if (d.autor) q = q.neq('perfil_id', d.autor) // quien hizo el cambio no necesita aviso
  const { data: subs } = await q

  const carga = JSON.stringify({ titulo: m.titulo, texto: m.texto, etiqueta: `pedido-${d.id}` })
  const vencidas: string[] = []
  await Promise.all((subs ?? []).map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga,
        { TTL: 3600, urgency: 'high' })
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) vencidas.push(s.endpoint)
    }
  }))
  if (vencidas.length) await admin.from('suscripciones').delete().in('endpoint', vencidas)
  return new Response(`enviados ${(subs ?? []).length - vencidas.length}`)
})
