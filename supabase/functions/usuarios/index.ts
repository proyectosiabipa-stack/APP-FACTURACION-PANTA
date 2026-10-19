// Cuentas de la app: Administración y Facturación (con PIN) y Planta (sin PIN). Cambios solo por el administrador.
// Si todavía no hay nadie registrado, permite crear el primer administrador una sola vez,
// y solo con el código de alta (tabla privada _ajustes) que va en el enlace de instalación.
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

// Cuenta de un área sin PIN (Planta): clave larga al azar guardada en _ajustes, nadie la escribe
async function cuentaArea(admin: any, rol: string, nombre: string) {
  const clave = `equipo_${rol}`
  const { data: guardado } = await admin.from('_ajustes').select('valor').eq('clave', clave).maybeSingle()
  if (guardado) {
    const cuenta = JSON.parse(guardado.valor)
    const { data: p } = cuenta.id
      ? await admin.from('perfiles').select('activo').eq('id', cuenta.id).maybeSingle()
      : { data: null }
    if (p && !p.activo) return responder({ error: `${nombre} está desactivada. La administración puede activarla.` }, 403)
    if (p) return responder({ correo: cuenta.correo, clave: cuenta.clave })
  }
  const correo = `equipo-${rol}-${crypto.randomUUID().slice(0, 8)}@bipa-despacho.app`
  const nueva = crypto.randomUUID() + crypto.randomUUID()
  const { data, error } = await admin.auth.admin.createUser({ email: correo, password: nueva, email_confirm: true })
  if (error) return responder({ error: error.message }, 400)
  const { error: e2 } = await admin.from('perfiles').insert({ id: data.user.id, nombre, rol, equipo: true })
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id)
    return responder({ error: e2.message }, 400)
  }
  await admin.from('_ajustes').upsert({ clave, valor: JSON.stringify({ id: data.user.id, correo, clave: nueva }) })
  return responder({ correo, clave: nueva })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })
    const body = await req.json()

    const { count } = await admin.from('perfiles').select('id', { count: 'exact', head: true })
    const primerUso = (count ?? 0) === 0

    // Planta entra con un toque, sin PIN, pero solo desde un equipo que la administración autorizó
    if (body.accion === 'planta') {
      if (primerUso) return responder({ error: 'Primero hay que crear la administración' }, 400)
      const { data: t } = await admin.from('_ajustes').select('valor').eq('clave', 'tokens_planta').maybeSingle()
      const tokens: string[] = t ? JSON.parse(t.valor) : []
      if (typeof body.token !== 'string' || !tokens.includes(body.token)) {
        return responder({ error: 'Este equipo no está autorizado para Planta. La administración lo autoriza una sola vez.' }, 403)
      }
      return cuentaArea(admin, 'planta', 'Planta')
    }

    if (!primerUso) {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
      const { data: quien } = await admin.auth.getUser(token)
      if (!quien?.user) return responder({ error: 'Inicia sesión de nuevo' }, 401)
      const { data: perfil } = await admin.from('perfiles').select('rol, activo').eq('id', quien.user.id).single()
      if (!perfil || perfil.rol !== 'admin' || !perfil.activo) return responder({ error: 'Solo el administrador puede hacer esto' }, 403)
    }

    if (primerUso) {
      // Código de alta: tabla privada _ajustes; si no está, el secreto PRIMER_ADMIN_CODIGO
      const { data: ajuste } = await admin.from('_ajustes').select('valor').eq('clave', 'primer_admin_codigo').maybeSingle()
      const codigo = ajuste?.valor || Deno.env.get('PRIMER_ADMIN_CODIGO')
      if (!codigo || body.codigo !== codigo) return responder({ error: 'Abra el enlace de instalación que le enviaron' }, 403)
    }

    const pinValido = (p: unknown) => typeof p === 'string' && /^\d{6}$/.test(p)

    if (body.accion === 'crear') {
      const nombre = primerUso ? 'Administración' : String(body.nombre || '').trim()
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

    // Autorizar este equipo para Planta: se le da una marca al azar que el equipo guarda
    if (body.accion === 'autorizar_planta') {
      const { data: t } = await admin.from('_ajustes').select('valor').eq('clave', 'tokens_planta').maybeSingle()
      const tokens: string[] = t ? JSON.parse(t.valor) : []
      const token = crypto.randomUUID() + crypto.randomUUID()
      tokens.push(token)
      const { error } = await admin.from('_ajustes').upsert({ clave: 'tokens_planta', valor: JSON.stringify(tokens) })
      if (error) return responder({ error: error.message }, 400)
      return responder({ token })
    }

    // Quitar todos los equipos de Planta (si se pierde una tablet); luego se autorizan de nuevo los que quedan
    if (body.accion === 'quitar_planta') {
      const { error } = await admin.from('_ajustes').upsert({ clave: 'tokens_planta', valor: '[]' })
      if (error) return responder({ error: error.message }, 400)
      // La cuenta vieja de Planta se apaga (las tablets que la tenían abierta quedan fuera) y se hará una nueva
      const { data: g } = await admin.from('_ajustes').select('valor').eq('clave', 'equipo_planta').maybeSingle()
      if (g) {
        await admin.from('perfiles').update({ activo: false }).eq('id', JSON.parse(g.valor).id)
        await admin.from('_ajustes').upsert({ clave: 'equipo_planta', valor: '{}' })
      }
      return responder({ ok: true })
    }

    // Facturación: una sola cuenta con PIN; si ya existe, solo cambia el PIN
    if (body.accion === 'facturacion') {
      if (!pinValido(body.pin)) return responder({ error: 'El PIN debe tener 6 números' }, 400)
      const { data: ya } = await admin.from('perfiles').select('id').eq('rol', 'comercial').eq('nombre', 'Facturación').maybeSingle()
      if (ya) {
        const { error } = await admin.auth.admin.updateUserById(ya.id, { password: claveDesdePin(body.pin) })
        if (error) return responder({ error: error.message }, 400)
        return responder({ ok: true })
      }
      const correo = `facturacion-${crypto.randomUUID().slice(0, 8)}@bipa-despacho.app`
      const { data, error } = await admin.auth.admin.createUser({ email: correo, password: claveDesdePin(body.pin), email_confirm: true })
      if (error) return responder({ error: error.message }, 400)
      const { error: e2 } = await admin.from('perfiles').insert({ id: data.user.id, nombre: 'Facturación', rol: 'comercial' })
      if (e2) {
        await admin.auth.admin.deleteUser(data.user.id)
        return responder({ error: e2.message }, 400)
      }
      return responder({ ok: true })
    }

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
