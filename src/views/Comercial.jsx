import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/index.js'
import { usePedidos } from '../usePedidos.js'
import PdfView from '../components/PdfView.jsx'
import { analizarTexto, textoDePdf } from '../pdf.js'
import { aviso, duracion, esHoy, hace, hora, sonar } from '../util.js'

const COLUMNAS = [
  { id: 'revisando', titulo: 'Planta revisando', estados: ['por_revisar', 'en_revision'] },
  { id: 'espera', titulo: 'En espera: te necesitan', estados: ['en_espera'] },
  { id: 'facturar', titulo: 'Para facturar', estados: ['disponible'] },
  { id: 'planta', titulo: 'En planta', estados: ['documento_listo', 'impreso'] },
  { id: 'hechos', titulo: 'Despachados hoy', estados: ['despachado'] },
]

export default function Comercial() {
  const [abierto, setAbierto] = useState(null)
  const [porSubir, setPorSubir] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [historial, setHistorial] = useState(false)
  const entrada = useRef(null)

  const { pedidos, error, recargar } = usePedidos((p, antes) => {
    if (!antes) return
    if (p.estado === 'en_espera' && antes.estado !== 'en_espera') {
      sonar('alerta'); aviso(`Novedad: ${p.cliente}`, p.nota_planta || '')
    }
    if (p.estado === 'disponible' && antes.estado !== 'disponible') {
      sonar(); aviso(`${p.cliente}: todo disponible`, 'Lista para facturar')
    }
  })

  // Limpieza automática de PDF viejos (más de 15 días despachados); el historial se queda
  useEffect(() => {
    api.rpc('archivos_para_limpiar').then((filas) => {
      const rutas = (filas || []).flatMap((f) => [f.cot_path, f.doc_path]).filter(Boolean)
      return api.borrarArchivos(rutas)
    }).catch(() => {})
  }, [])

  const columnas = useMemo(() => COLUMNAS.map((c) => ({
    ...c,
    lista: (pedidos || []).filter((p) => c.estados.includes(p.estado) && (c.id !== 'hechos' || esHoy(p.despachado_en)))
      .sort((a, b) => c.id === 'hechos' ? new Date(b.despachado_en) - new Date(a.despachado_en) : new Date(a.creado_en) - new Date(b.creado_en)),
  })), [pedidos])

  const hechosHoy = columnas[4].lista
  const promedio = hechosHoy.length
    ? Math.round(hechosHoy.reduce((s, p) => s + (new Date(p.despachado_en) - new Date(p.creado_en)), 0) / hechosHoy.length / 60000)
    : null

  const recibirArchivos = async (archivos) => {
    const pdfs = [...archivos].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    if (!pdfs.length) return
    const abiertos = (pedidos || []).filter((p) => ['disponible', 'documento_listo'].includes(p.estado))
    const items = await Promise.all(pdfs.map(async (archivo) => {
      let datos = { tipo: 'cotizacion', numero: '', cliente: '', cotizacionRef: '' }
      try { datos = analizarTexto(await textoDePdf(archivo), archivo.name) } catch { /* PDF sin texto: se llena a mano */ }
      let destino = ''
      if (datos.tipo === 'nota' || datos.tipo === 'fiscal') {
        // Los números de Profit no coinciden entre cotización y nota/factura: se une por cliente
        const cli = (datos.cliente || '').trim().toLowerCase()
        const mismos = abiertos.filter((p) => cli && (p.cliente || '').trim().toLowerCase() === cli)
        const igual = (mismos.length === 1 ? mismos[0] : null) || (abiertos.length === 1 ? abiertos[0] : null)
        destino = igual ? String(igual.id) : ''
      }
      return { archivo, tipo: datos.tipo || 'cotizacion', cliente: datos.cliente, destino }
    }))
    setPorSubir(items)
  }

  const soltar = (e) => { e.preventDefault(); setArrastrando(false); recibirArchivos(e.dataTransfer.files) }
  const actual = abierto && pedidos?.find((p) => p.id === abierto)

  return (
    <div className="comercial" onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false) }} onDrop={soltar}>
      {error && <div className="alerta-conexion">Sin conexión: {error}. Se reintenta solo.</div>}

      <div className="barra-comercial">
        <button className={`zona-subir ${arrastrando ? 'encima' : ''}`} onClick={() => entrada.current.click()}>
          <b>Arrastra aquí los PDF</b>
          <span>cotizaciones, notas de entrega o facturas · o toca para elegirlos</span>
        </button>
        <input ref={entrada} type="file" accept="application/pdf" multiple hidden onChange={(e) => { recibirArchivos(e.target.files); e.target.value = '' }} />
        <div className="resumen">
          <div><b>{hechosHoy.length}</b><span>despachados hoy</span></div>
          <div><b>{promedio === null ? '—' : promedio < 60 ? `${promedio} min` : `${Math.floor(promedio / 60)} h ${promedio % 60} min`}</b><span>promedio de cotización a despacho</span></div>
          <button className="btn-texto" onClick={() => setHistorial(true)}>Historial</button>
        </div>
      </div>

      {!pedidos && <p className="nota">Cargando…</p>}
      <div className="tablero">
        {columnas.map((c) => (
          <section key={c.id} className={`columna col-${c.id}`}>
            <h2>{c.titulo} <span className="cuenta">{c.lista.length}</span></h2>
            {c.lista.length === 0 && <p className="nota">Vacío</p>}
            {c.lista.map((p) => (
              <button key={p.id} className={`mini-tarjeta ${p.estado === 'en_espera' ? 'alerta' : ''}`} onClick={() => setAbierto(p.id)}>
                <b>{p.cliente || 'Sin cliente'}</b>
                {p.estado === 'en_espera' && <span className="cita">«{p.nota_planta}»</span>}
                {p.estado === 'en_revision' && <span className="nota">Revisando en el depósito</span>}
                {p.estado === 'por_revisar' && p.respuesta_comercial && <span className="nota">Respondiste; planta la revisa otra vez</span>}
                {['documento_listo', 'impreso'].includes(p.estado) && (
                  <span className="nota">{p.tipo_doc === 'nota' ? 'Nota' : 'Factura'} · {p.estado === 'impreso' ? (p.tipo_doc === 'nota' ? 'impresa' : 'recibida') : (p.tipo_doc === 'nota' ? 'por imprimir' : 'por buscar')}</span>
                )}
                <span className="nota">{c.id === 'hechos' ? `${hora(p.despachado_en)} · ${duracion(p.creado_en, p.despachado_en)}` : hace(p.actualizado_en)}</span>
              </button>
            ))}
          </section>
        ))}
      </div>

      {actual && <Detalle p={actual} cerrar={() => { setAbierto(null); recargar() }} />}
      {porSubir && <Subida items={porSubir} pedidos={pedidos || []} cerrar={() => { setPorSubir(null); recargar() }} />}
      {historial && <Historial cerrar={() => setHistorial(false)} />}
    </div>
  )
}

function Subida({ items: inicial, pedidos, cerrar }) {
  const [items, setItems] = useState(inicial)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const destinos = pedidos.filter((p) => ['disponible', 'documento_listo'].includes(p.estado))
  const cambiar = (i, campo, valor) => setItems((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const faltante = items.find((x) => x.tipo === 'cotizacion' ? !(x.cliente || '').trim() : !x.destino)

  const guardar = async () => {
    setOcupado(true); setError('')
    try {
      for (const [i, x] of items.entries()) {
        if (x.hecho) continue
        const ruta = await api.subirArchivo(x.archivo)
        if (x.tipo === 'cotizacion') await api.rpc('crear_pedido', { p_numero: '', p_cliente: x.cliente, p_cot_path: ruta })
        else await api.rpc('adjuntar_documento', { p_id: Number(x.destino), p_tipo: x.tipo, p_numero: '', p_path: ruta })
        setItems((l) => l.map((y, j) => (j === i ? { ...y, hecho: true } : y)))
      }
      cerrar()
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }

  return (
    <div className="modal-fondo">
      <div className="modal">
        <h2>Revisa antes de enviar</h2>
        <p className="nota">La app leyó cada PDF. Corrige lo que haga falta.</p>
        {items.map((x, i) => (
          <div key={i} className={`subida ${x.hecho ? 'hecho' : ''}`}>
            <div className="subida-archivo">{x.archivo.name}{x.hecho && ' · enviado ✓'}</div>
            <div className="campos">
              <label>Qué es
                <select value={x.tipo} onChange={(e) => cambiar(i, 'tipo', e.target.value)} disabled={x.hecho}>
                  <option value="cotizacion">Cotización nueva</option>
                  <option value="nota">Nota de entrega (se imprime en planta)</option>
                  <option value="fiscal">Factura fiscal (ya impresa aquí)</option>
                </select>
              </label>
              {x.tipo === 'cotizacion' ? (
                <label className="ancho">Cliente
                  <input value={x.cliente} onChange={(e) => cambiar(i, 'cliente', e.target.value)} disabled={x.hecho} />
                </label>
              ) : (
                <label className="ancho">De cuál cotización
                  <select value={x.destino} onChange={(e) => cambiar(i, 'destino', e.target.value)} disabled={x.hecho}>
                    <option value="">Elige la cotización…</option>
                    {destinos.map((p) => <option key={p.id} value={p.id}>{p.cliente || 'Sin cliente'} · subida {hora(p.creado_en)}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        ))}
        {faltante && <p className="nota">{faltante.tipo === 'cotizacion' ? 'Falta el cliente de una cotización.' : 'Elige a qué cotización va cada nota o factura.'}</p>}
        {error && <p className="error">{error}</p>}
        <div className="fila-botones">
          <button className="btn" onClick={cerrar} disabled={ocupado}>Cancelar</button>
          <button className="btn verde" onClick={guardar} disabled={ocupado || !!faltante}>{ocupado ? 'Enviando…' : 'Enviar a planta'}</button>
        </div>
      </div>
    </div>
  )
}

function Detalle({ p, cerrar }) {
  const [eventos, setEventos] = useState([])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [corregida, setCorregida] = useState(null)
  const [fiscal, setFiscal] = useState(null)
  const [anular, setAnular] = useState(null)
  const [verDoc, setVerDoc] = useState(false)
  const nota = useRef(null)

  useEffect(() => { api.eventos(p.id).then(setEventos).catch(() => {}) }, [p.id, p.actualizado_en])

  const hacer = async (fn) => {
    setOcupado(true); setError('')
    try { await fn(); cerrar() } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }

  const responder = () => hacer(async () => {
    const ruta = corregida ? await api.subirArchivo(corregida) : null
    await api.rpc('responder_novedad', { p_id: p.id, p_texto: respuesta, p_cot_path: ruta })
  })

  const subirNota = (archivo) => hacer(async () => {
    const ruta = await api.subirArchivo(archivo)
    await api.rpc('adjuntar_documento', { p_id: p.id, p_tipo: 'nota', p_numero: '', p_path: ruta })
  })

  const enviarFiscal = () => hacer(async () => {
    const ruta = fiscal.archivo ? await api.subirArchivo(fiscal.archivo) : null
    await api.rpc('adjuntar_documento', { p_id: p.id, p_tipo: 'fiscal', p_numero: '', p_path: ruta })
  })

  return (
    <div className="panel-fondo" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <aside className="panel">
        <div className="panel-cabeza">
          <div>
            <h2>{p.cliente || 'Sin cliente'}</h2>
            <span className="nota">Cotización subida {hora(p.creado_en)}</span>
          </div>
          <button className="btn-texto" onClick={cerrar}>Cerrar</button>
        </div>

        {p.estado === 'en_espera' && <div className="mensaje ambar"><b>Planta dice:</b> {p.nota_planta}</div>}
        {error && <p className="error">{error}</p>}

        <div className="acciones-panel">
          {p.estado === 'en_espera' && (
            <div className="caja-novedad">
              <label htmlFor="respuesta">Tu respuesta para planta</label>
              <textarea id="respuesta" rows={3} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Ej.: Sí, cambia por B-211. Ya corregí la cotización." />
              <label className="archivo">
                <input type="file" accept="application/pdf" onChange={(e) => setCorregida(e.target.files[0] || null)} />
                {corregida ? `Cotización corregida: ${corregida.name}` : 'Adjuntar la cotización corregida (opcional)'}
              </label>
              <div className="fila-botones">
                <button className="btn" disabled={ocupado} onClick={() => hacer(() => api.rpc('confirmar_disponible', { p_id: p.id }))}>Pasar a facturar así</button>
                <button className="btn ambar" disabled={ocupado || (!respuesta.trim() && !corregida)} onClick={responder}>Responder a planta</button>
              </div>
            </div>
          )}

          {p.estado === 'disponible' && !fiscal && (
            <div className="fila-botones">
              <button className="btn verde" disabled={ocupado} onClick={() => nota.current.click()}>Subir nota de entrega</button>
              <button className="btn" disabled={ocupado} onClick={() => setFiscal({ archivo: null })}>Ya imprimí la factura fiscal</button>
              <input ref={nota} type="file" accept="application/pdf" hidden onChange={(e) => e.target.files[0] && subirNota(e.target.files[0])} />
            </div>
          )}
          {fiscal && (
            <div className="caja-novedad">
              <label className="archivo">
                <input type="file" accept="application/pdf" onChange={(e) => setFiscal({ ...fiscal, archivo: e.target.files[0] || null })} />
                {fiscal.archivo ? fiscal.archivo.name : 'Adjuntar copia en PDF (opcional)'}
              </label>
              <p className="nota">Planta verá que la factura está lista aquí en Comercial para buscarla.</p>
              <div className="fila-botones">
                <button className="btn" onClick={() => setFiscal(null)}>Cancelar</button>
                <button className="btn verde" disabled={ocupado} onClick={enviarFiscal}>Avisar a planta</button>
              </div>
            </div>
          )}

          {['por_revisar', 'en_revision', 'en_espera', 'disponible', 'documento_listo', 'impreso'].includes(p.estado) && anular === null && (
            <button className="btn-texto peligro" onClick={() => setAnular('')}>Anular esta cotización</button>
          )}
          {anular !== null && (
            <div className="caja-novedad">
              <label htmlFor="motivo">¿Por qué se anula?</label>
              <input id="motivo" value={anular} onChange={(e) => setAnular(e.target.value)} placeholder="Ej.: el cliente canceló" />
              <div className="fila-botones">
                <button className="btn" onClick={() => setAnular(null)}>No anular</button>
                <button className="btn rojo" disabled={ocupado} onClick={() => hacer(() => api.rpc('anular_pedido', { p_id: p.id, p_motivo: anular }))}>Sí, anular</button>
              </div>
            </div>
          )}
        </div>

        {p.doc_path && !p.archivos_borrados && (
          <div className="cambiar-pdf">
            <button className={!verDoc ? 'activa' : ''} onClick={() => setVerDoc(false)}>Cotización</button>
            <button className={verDoc ? 'activa' : ''} onClick={() => setVerDoc(true)}>{p.tipo_doc === 'nota' ? 'Nota de entrega' : 'Factura'}</button>
          </div>
        )}
        {p.archivos_borrados ? <p className="nota">Los PDF de este pedido se borraron a los 15 días; el historial se conserva.</p>
          : <PdfView ruta={verDoc && p.doc_path ? p.doc_path : p.cot_path} />}

        <h3>Recorrido</h3>
        <ol className="recorrido">
          {eventos.map((e) => (
            <li key={e.id}>
              <span className="nota">{hora(e.en)}</span>
              <span><b>{e.nombre}</b> {e.accion.charAt(0).toLowerCase() + e.accion.slice(1)}{e.detalle && <span className="cita"> «{e.detalle}»</span>}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}

function Historial({ cerrar }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [desde, setDesde] = useState(new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(hoy)
  const [error, setError] = useState('')

  const descargar = async () => {
    try {
      const filas = await api.historial(new Date(`${desde}T00:00:00`).toISOString(), new Date(`${hasta}T23:59:59`).toISOString())
      const f = (iso) => (iso ? new Date(iso).toLocaleString('es-VE') : '')
      const enc = ['Cliente', 'Estado', 'Documento', 'Subida', 'Revisada', 'Disponible', 'Documento enviado', 'Impresa', 'Despachada', 'Minutos hasta despacho', 'Novedad de planta', 'Respuesta de Comercial']
      const datos = filas.map((p) => [p.cliente, p.estado, p.tipo_doc === 'nota' ? 'Nota de entrega' : p.tipo_doc === 'fiscal' ? 'Factura fiscal' : '',
        f(p.creado_en), f(p.revisado_en), f(p.disponible_en), f(p.documento_en), f(p.impreso_en), f(p.despachado_en),
        p.despachado_en ? Math.round((new Date(p.despachado_en) - new Date(p.creado_en)) / 60000) : '', p.nota_planta, p.respuesta_comercial])
      const csv = '﻿' + [enc, ...datos].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      a.download = `BIPA Despacho ${desde} a ${hasta}.csv`
      a.click()
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="modal-fondo">
      <div className="modal">
        <h2>Historial</h2>
        <p className="nota">Descarga en Excel todo lo que pasó: tiempos de cada paso, novedades y respuestas.</p>
        <div className="campos">
          <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="fila-botones">
          <button className="btn" onClick={cerrar}>Cerrar</button>
          <button className="btn verde" onClick={descargar}>Descargar Excel</button>
        </div>
      </div>
    </div>
  )
}
