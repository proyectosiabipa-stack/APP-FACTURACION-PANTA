// Conexión real: Supabase (base de datos, archivos y tiempo real)
import { createClient } from '@supabase/supabase-js'

export function crearApiNube(url, llave) {
  const sb = createClient(url, llave, { auth: { persistSession: true, storageKey: 'bipa-despacho-sesion' } })
  let perfil = null

  const fallo = (error) => {
    if (error) throw new Error(error.message || 'Algo falló, intenta de nuevo')
  }

  async function cargarPerfil() {
    const { data: s } = await sb.auth.getSession()
    if (!s.session) return null
    const { data, error } = await sb.from('perfiles').select('*').eq('id', s.session.user.id).maybeSingle()
    if (error || !data || !data.activo) return null
    perfil = data
    return data
  }

  return {
    modo: 'nube',
    async listaIngreso() {
      const { data, error } = await sb.rpc('lista_ingreso')
      fallo(error)
      return data
    },
    async entrar(correo, pin) {
      const { error } = await sb.auth.signInWithPassword({ email: correo, password: `BIPA-${pin}` })
      if (error) throw new Error(error.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'PIN incorrecto')
      const p = await cargarPerfil()
      if (!p) { await sb.auth.signOut(); throw new Error('Tu usuario está desactivado') }
      return p
    },
    // El administrador conecta este equipo a la cuenta de un área; desde ahí entra solo, sin PIN
    async conectarEquipo(rol) {
      const cuenta = await this.usuarios({ accion: 'equipo', rol })
      await sb.auth.signOut({ scope: 'local' })
      const { error } = await sb.auth.signInWithPassword({ email: cuenta.correo, password: cuenta.clave })
      fallo(error)
      return cargarPerfil()
    },
    sesionActual: cargarPerfil,
    // Solo este equipo: los demás equipos de la misma área siguen conectados
    async salir() { await sb.auth.signOut({ scope: 'local' }); perfil = null },
    async pedidos() {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString()
      const { data, error } = await sb.from('pedidos').select('*')
        .or(`estado.not.in.(despachado,anulado),actualizado_en.gte."${desde}"`)
        .order('creado_en', { ascending: false }).limit(500)
      fallo(error)
      return data
    },
    async historial(desdeIso, hastaIso) {
      const { data, error } = await sb.from('pedidos').select('*')
        .gte('creado_en', desdeIso).lte('creado_en', hastaIso).order('creado_en').limit(5000)
      fallo(error)
      return data
    },
    async eventos(pedidoId) {
      const { data, error } = await sb.from('eventos').select('*').eq('pedido_id', pedidoId).order('en')
      fallo(error)
      return data
    },
    async perfiles() {
      const { data, error } = await sb.from('perfiles').select('*').order('nombre')
      fallo(error)
      return data
    },
    suscribir(alCambiar) {
      const canal = sb.channel('despacho')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (c) => alCambiar(c.new?.id ? c.new : c.old, c.eventType))
        .subscribe()
      return () => sb.removeChannel(canal)
    },
    async subirArchivo(archivo) {
      const ruta = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.pdf`
      const { error } = await sb.storage.from('documentos').upload(ruta, archivo, { contentType: 'application/pdf' })
      fallo(error)
      return ruta
    },
    async urlArchivo(ruta) {
      const { data, error } = await sb.storage.from('documentos').createSignedUrl(ruta, 3600)
      fallo(error)
      return data.signedUrl
    },
    async borrarArchivos(rutas) {
      if (!rutas.length) return
      const { error } = await sb.storage.from('documentos').remove(rutas)
      fallo(error)
    },
    async rpc(nombre, args) {
      const { data, error } = await sb.rpc(nombre, args)
      fallo(error)
      return data
    },
    async usuarios(datos) {
      const { data, error } = await sb.functions.invoke('usuarios', { body: datos })
      if (error) {
        let msg = error.message
        try { msg = (await error.context.json()).error || msg } catch { /* respuesta sin cuerpo */ }
        throw new Error(msg)
      }
      return data
    },
    get perfil() { return perfil },
  }
}
