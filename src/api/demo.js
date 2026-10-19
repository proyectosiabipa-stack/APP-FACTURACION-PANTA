// Modo de prueba: todo vive en este navegador (sin internet ni base de datos).
// Sirve para mostrar y probar la app antes de conectarla a Supabase.
const CLAVE = 'bipa-despacho-demo'
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CLAVE) : null

const PERSONAS = [
  { id: 'p1', nombre: 'Yohan Briceño', rol: 'planta', correo: 'yohan', activo: true },
  { id: 'p2', nombre: 'Franci Suarez', rol: 'comercial', correo: 'franci', activo: true },
  { id: 'p3', nombre: 'Administrador', rol: 'admin', correo: 'admin', activo: true },
]

function leer() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE))
    if (d && d.pedidos) return d
  } catch { /* sin datos guardados */ }
  return sembrar()
}
function guardar(d) { localStorage.setItem(CLAVE, JSON.stringify(d)) }

function sembrar() {
  const ahora = Date.now()
  const hace = (min) => new Date(ahora - min * 60000).toISOString()
  const d = { seq: 5, eseq: 0, perfiles: PERSONAS, pedidos: [], eventos: [] }
  const base = { tipo_doc: null, doc_numero: null, doc_path: null, tomado_por: null, nota_planta: null, respuesta_comercial: null,
    revisado_en: null, disponible_en: null, documento_en: null, impreso_en: null, despachado_en: null, archivos_borrados: false, creado_por: 'p2' }
  d.pedidos = [
    { ...base, id: 1, numero: '004812', cliente: 'Comercial Ejemplo, C.A.', estado: 'por_revisar', cot_path: 'demo/cotizacion-ejemplo.pdf', creado_en: hace(2) },
    { ...base, id: 2, numero: '004809', cliente: 'Abasto Ejemplo', estado: 'por_revisar', cot_path: 'demo/cotizacion-ejemplo.pdf', creado_en: hace(15) },
    { ...base, id: 3, numero: '004805', cliente: 'Distribuidora Ejemplo', estado: 'en_espera', cot_path: 'demo/cotizacion-ejemplo.pdf', creado_en: hace(48), tomado_por: 'p1', revisado_en: hace(30), nota_planta: 'Del artículo B-210 solo hay 6 de 12. Se puede cambiar por B-211, hay 20.' },
    { ...base, id: 4, numero: '004803', cliente: 'Bodega Ejemplo', estado: 'disponible', cot_path: 'demo/cotizacion-ejemplo.pdf', creado_en: hace(70), tomado_por: 'p1', revisado_en: hace(55), disponible_en: hace(55) },
    { ...base, id: 5, numero: '004801', cliente: 'Mercado Ejemplo', estado: 'documento_listo', cot_path: 'demo/cotizacion-ejemplo.pdf', creado_en: hace(95), tomado_por: 'p1', revisado_en: hace(80), disponible_en: hace(80), tipo_doc: 'nota', doc_numero: '000731', doc_path: 'demo/nota-ejemplo.pdf', documento_en: hace(10) },
  ]
  d.pedidos.forEach((p) => { p.actualizado_en = p.creado_en })
  const ev = (pid, quien, accion, en, detalle = null) => d.eventos.push({ id: ++d.eseq, pedido_id: pid, usuario: quien, nombre: PERSONAS.find((x) => x.id === quien).nombre, accion, detalle, en })
  d.pedidos.forEach((p) => ev(p.id, 'p2', 'Subió la cotización', p.creado_en))
  ev(3, 'p1', 'Reportó una novedad', hace(30), d.pedidos[2].nota_planta)
  ev(4, 'p1', 'Confirmó: todo disponible', hace(55))
  ev(5, 'p1', 'Confirmó: todo disponible', hace(80))
  ev(5, 'p2', 'Envió la nota de entrega a planta', hace(10), '000731')
  guardar(d)
  return d
}

// Archivos subidos en la prueba: IndexedDB
function bd() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(CLAVE, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('archivos')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => mal(r.error)
  })
}
async function guardarArchivo(ruta, blob) {
  const b = await bd()
  await new Promise((ok, mal) => { const t = b.transaction('archivos', 'readwrite'); t.objectStore('archivos').put(blob, ruta); t.oncomplete = ok; t.onerror = () => mal(t.error) })
}
async function leerArchivo(ruta) {
  const b = await bd()
  return new Promise((ok, mal) => { const r = b.transaction('archivos').objectStore('archivos').get(ruta); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error) })
}

export function crearApiDemo() {
  let perfil = null
  const oyentes = new Set()
  const avisar = (p, tipo) => oyentes.forEach((f) => f(p, tipo))
  canal?.addEventListener('message', (e) => avisar(e.data.p, e.data.tipo))

  function cambiar(id, permitidos, fn, accion, detalle = null) {
    const d = leer()
    const p = d.pedidos.find((x) => x.id === id)
    if (!p) throw new Error('La cotización ya no existe')
    if (permitidos && !permitidos.includes(p.estado)) throw new Error(`Esta cotización ya cambió de estado (${p.estado}). Actualiza la pantalla.`)
    fn(p)
    p.actualizado_en = new Date().toISOString()
    if (accion) d.eventos.push({ id: ++d.eseq, pedido_id: id, usuario: perfil.id, nombre: perfil.nombre, accion, detalle, en: p.actualizado_en })
    guardar(d)
    avisar(p, 'UPDATE'); canal?.postMessage({ p, tipo: 'UPDATE' })
  }
  const exigir = (...roles) => {
    if (!perfil || !(roles.includes(perfil.rol) || perfil.rol === 'admin')) throw new Error('No tienes permiso para esta acción')
  }
  const ahora = () => new Date().toISOString()

  const rpcs = {
    crear_pedido({ p_numero, p_cliente, p_cot_path }) {
      exigir('comercial')
      const d = leer()
      const p = { id: ++d.seq, numero: p_numero.trim(), cliente: (p_cliente || '').trim(), estado: 'por_revisar', cot_path: p_cot_path,
        tipo_doc: null, doc_numero: null, doc_path: null, tomado_por: null, nota_planta: null, respuesta_comercial: null, creado_por: perfil.id,
        creado_en: ahora(), actualizado_en: ahora(), revisado_en: null, disponible_en: null, documento_en: null, impreso_en: null, despachado_en: null, archivos_borrados: false }
      d.pedidos.unshift(p)
      d.eventos.push({ id: ++d.eseq, pedido_id: p.id, usuario: perfil.id, nombre: perfil.nombre, accion: 'Subió la cotización', detalle: null, en: ahora() })
      guardar(d)
      avisar(p, 'INSERT'); canal?.postMessage({ p, tipo: 'INSERT' })
      return p.id
    },
    tomar_pedido({ p_id }) {
      exigir('planta')
      const p = leer().pedidos.find((x) => x.id === p_id)
      if (p?.estado === 'en_revision' && p.tomado_por !== perfil.id) return
      cambiar(p_id, ['por_revisar', 'en_revision'], (x) => { x.estado = 'en_revision'; x.tomado_por = perfil.id }, p?.estado === 'por_revisar' ? 'Empezó a revisar en el depósito' : null)
    },
    confirmar_disponible({ p_id }) {
      exigir('planta', 'comercial')
      cambiar(p_id, ['por_revisar', 'en_revision', 'en_espera'], (x) => { x.estado = 'disponible'; x.revisado_en ||= ahora(); x.disponible_en = ahora() },
        perfil.rol === 'comercial' ? 'La pasó a facturar' : 'Confirmó: todo disponible')
    },
    reportar_novedad({ p_id, p_nota }) {
      exigir('planta')
      if (!p_nota?.trim()) throw new Error('Escribe qué falta o qué cambiar')
      cambiar(p_id, ['por_revisar', 'en_revision', 'en_espera'], (x) => { x.estado = 'en_espera'; x.nota_planta = p_nota.trim(); x.respuesta_comercial = null; x.revisado_en ||= ahora() }, 'Reportó una novedad', p_nota.trim())
    },
    responder_novedad({ p_id, p_texto, p_cot_path }) {
      exigir('comercial')
      const t = (p_texto || '').trim() || null
      cambiar(p_id, ['en_espera'], (x) => { x.estado = 'por_revisar'; x.respuesta_comercial = t; if (p_cot_path) x.cot_path = p_cot_path }, p_cot_path ? 'Subió la cotización corregida' : 'Respondió la novedad', t)
    },
    adjuntar_documento({ p_id, p_tipo, p_numero, p_path }) {
      exigir('comercial')
      cambiar(p_id, ['disponible', 'documento_listo'], (x) => { x.estado = 'documento_listo'; x.tipo_doc = p_tipo; x.doc_numero = (p_numero || '').trim() || null; x.doc_path = p_path; x.documento_en = ahora(); x.impreso_en = null },
        p_tipo === 'nota' ? 'Envió la nota de entrega a planta' : 'Imprimió la factura fiscal en Comercial', (p_numero || '').trim() || null)
    },
    marcar_impreso({ p_id }) {
      exigir('planta')
      const p = leer().pedidos.find((x) => x.id === p_id)
      cambiar(p_id, ['documento_listo'], (x) => { x.estado = 'impreso'; x.impreso_en = ahora() }, p?.tipo_doc === 'nota' ? 'Imprimió la nota de entrega en planta' : 'Recibió la factura fiscal')
    },
    registrar_reimpresion({ p_id }) { exigir('planta'); cambiar(p_id, null, () => {}, 'Reimprimió el documento') },
    marcar_despachado({ p_id }) {
      exigir('planta')
      cambiar(p_id, ['documento_listo', 'impreso'], (x) => { x.estado = 'despachado'; x.impreso_en ||= ahora(); x.despachado_en = ahora() }, 'Despachó el pedido')
    },
    anular_pedido({ p_id, p_motivo }) {
      exigir('comercial')
      cambiar(p_id, ['por_revisar', 'en_revision', 'en_espera', 'disponible', 'documento_listo', 'impreso'], (x) => { x.estado = 'anulado' }, 'Anuló la cotización', (p_motivo || '').trim() || null)
    },
    archivos_para_limpiar() { exigir('comercial'); return [] },
  }

  return {
    modo: 'demo',
    async listaIngreso() { return leer().perfiles.filter((p) => p.activo).map(({ nombre, rol, correo }) => ({ nombre, rol, correo })) },
    async entrar(correo, pin) {
      await new Promise((r) => setTimeout(r, 250))
      if (pin !== '123456') throw new Error('PIN incorrecto')
      perfil = leer().perfiles.find((p) => p.correo === correo)
      sessionStorage.setItem(CLAVE + '-sesion', perfil.id)
      return perfil
    },
    async sesionActual() {
      const id = sessionStorage.getItem(CLAVE + '-sesion')
      perfil = leer().perfiles.find((p) => p.id === id) || null
      return perfil
    },
    async salir() { sessionStorage.removeItem(CLAVE + '-sesion'); perfil = null },
    async pedidos() { return leer().pedidos },
    async historial() { return leer().pedidos },
    async eventos(id) { return leer().eventos.filter((e) => e.pedido_id === id) },
    async perfiles() { return leer().perfiles },
    suscribir(f) { oyentes.add(f); return () => oyentes.delete(f) },
    async subirArchivo(archivo) {
      const ruta = `subidos/${crypto.randomUUID()}.pdf`
      await guardarArchivo(ruta, archivo)
      return ruta
    },
    async urlArchivo(ruta) {
      if (ruta.startsWith('demo/')) return new URL(ruta, document.baseURI).href
      const blob = await leerArchivo(ruta)
      if (!blob) throw new Error('No se encontró el archivo')
      return URL.createObjectURL(blob)
    },
    async borrarArchivos() {},
    async rpc(nombre, args) {
      await new Promise((r) => setTimeout(r, 150))
      return rpcs[nombre](args || {})
    },
    async usuarios() { throw new Error('En el modo de prueba no se crean personas') },
    reiniciar() { localStorage.removeItem(CLAVE); sembrar() },
    get perfil() { return perfil },
  }
}
