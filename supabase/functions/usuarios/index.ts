// Alta de personas, cambio de PIN y activar/desactivar. Solo el administrador.
// Si todavía no hay nadie registrado, permite crear el primer administrador una sola vez,
// y solo con el código de alta (secreto PRIMER_ADMIN_CODIGO) que va en el enlace de instalación.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// La contraseña real es el PIN con un prefijo fijo (Supabase pide mínimo 6 caracteres)
export const claveDesdePin = (pin: string) => `BIPA-${pin}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })
    const body = await req.json()

    const { count } = await admin.from('perfiles').select('id', { count: 'exact', head: true })
    const primerUso = (count ?? 0) === 0

    if (!primerUso) {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
      const { data: quien } = await admin.auth.getUser(token)
      if (!quien?.user) return responder({ error: 'Inicia sesión de nuevo' }, 401)
      const { data: perfil } = await admin.from('perfiles').select('rol, activo').eq('id', quien.user.id).single()
      if (!perfil || perfil.rol !== 'admin' || !perfil.activo) return responder({ error: 'Solo el administrador puede hacer esto' }, 403)
    }

    if (primerUso) {
      const codigo = Deno.env.get('PRIMER_ADMIN_CODIGO')
      if (!codigo || body.codigo !== codigo) return responder({ error: 'Abra el enlace de instalación que le enviaron' }, 403)
    }

    const pinValido = (p: unknown) => typeof p === 'string' && /^\d{6}$/.test(p)

    if (body.accion === 'crear') {
      const nombre = String(body.nombre || '').trim()
      const rol = primerUso ? 'admin' : body.rol
      if (!nombre) return responder({ error: 'Falta el nombre' }, 400)
      if (!['comercial', 'planta', 'admin'].includes(rol)) return responder({ error: 'Rol no válido' }, 400)
      if (!pinValido(body.pin)) return responder({ error: 'El PIN debe tener 6 números' }, 400)
      const correo = `u-${crypto.randomUUID().slice(0, 12)}@bipa-despacho.app`
      const { data, error } = await admin.auth.admin.createUser({
        email: correo, password: claveDesdePin(body.pin), email_confirm: true,
      })
      if (error) return responder({ error: error.message }, 400)
      let e2 = null
      if (primerUso) {
        // Con candado en la base: si dos personas lo intentan a la vez, solo una queda como administrador
        const { data: quedo, error } = await admin.rpc('_primer_admin', { p_id: data.user.id, p_nombre: nombre })
        e2 = error ?? (quedo ? null : { message: 'Ya hay un administrador registrado' })
      } else {
        ;({ error: e2 } = await admin.from('perfiles').insert({ id: data.user.id, nombre, rol }))
      }
      if (e2) {
        await admin.auth.admin.deleteUser(data.user.id)
        return responder({ error: e2.message }, 400)
      }
      return responder({ ok: true })
    }

    if (primerUso) return responder({ error: 'Primero crea el administrador' }, 400)

    if (body.accion === 'pin') {
      if (!pinValido(body.pin)) return responder({ error: 'El PIN debe tener 6 números' }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: claveDesdePin(body.pin) })
      if (error) return responder({ error: error.message }, 400)
      return responder({ ok: true })
    }

    if (body.accion === 'activo') {
      const { error } = await admin.from('perfiles').update({ activo: !!body.activo }).eq('id', body.id)
      if (error) return responder({ error: error.message }, 400)
      return responder({ ok: true })
    }

    return responder({ error: 'Acción desconocida' }, 400)
  } catch (e) {
    return responder({ error: String(e?.message || e) }, 500)
  }
})
