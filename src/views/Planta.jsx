import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/index.js'
import { usePedidos } from '../usePedidos.js'
import PdfView from '../components/PdfView.jsx'
import Pasos from '../components/Pasos.jsx'
import Ayuda from '../components/Ayuda.jsx'
import { obtenerPdf, precargar } from '../archivos.js'
import { aviso, esHoy, hace, mantenerPantalla, sonar } from '../util.js'

const ATAJOS = ['No hay ', 'Solo hay ', 'Cambiar por ', 'Falta empaque de ']

export default function Planta({ perfil }) {
  const [abierto, setAbierto] = useState(null)
  const [fallo, setFallo] = useState('')
  const [llegada, setLlegada] = useState(null)
  const anunciar = (titulo, p) => { setLlegada({ titulo, cliente: p.cliente, id: p.id }); aviso(titulo, p.cliente) }
  const { pedidos, error, recargar, ajustar } = usePedidos((p, antes) => {
    if (p.estado === 'por_revisar' && (!antes || antes.estado !== 'por_revisar')) {
      sonar(); anunciar(p.respuesta_comercial ? 'Facturación respondió' : 'Llegó una cotización nueva', p)
    }
    if (p.estado === 'documento_listo' && antes?.estado !== 'documento_listo') {
      sonar()
      anunciar(p.tipo_doc === 'nota' ? 'Nota de entrega lista para imprimir' : 'Factura fiscal lista en Facturación', p)
    }
  })
  useEffect(() => { if (!llegada) return; const t = setTimeout(() => setLlegada(null), 10000); return () => clearTimeout(t) }, [llegada])

  useEffect(() => {
    let soltar
    mantenerPantalla().then((f) => { soltar = f })
    return () => soltar?.()
  }, [])

  const grupos = useMemo(() => {
    const l = pedidos || []
    const viejoPrimero = (a, b) => new Date(a.creado_en) - new Date(b.creado_en)
    return {
      revisar: l.filter((p) => ['por_revisar', 'en_revision'].includes(p.estado)).sort(viejoPrimero),
      imprimir: l.filter((p) => ['documento_listo', 'impreso'].includes(p.estado)).sort(viejoPrimero),
      espera: l.filter((p) => p.estado === 'en_espera').sort(viejoPrimero),
      facturar: l.filter((p) => p.estado === 'disponible').sort(viejoPrimero),
      hechos: l.filter((p) => p.estado === 'despachado' && esHoy(p.despachado_en)),
    }
  }, [pedidos])

  // Los PDF de los pedidos abiertos se bajan apenas llegan, para que abran sin esperar
  useEffect(() => {
    if (!pedidos) return
    const activos = pedidos.filter((p) => !['despachado', 'anulado'].includes(p.estado))
    precargar(activos.flatMap((p) => [p.cot_path, p.doc_path]))
  }, [pedidos])
  useEffect(() => { const t = setTimeout(() => import('../pdf.js'), 1500); return () => clearTimeout(t) }, [])

  const actual = abierto && pedidos?.find((p) => p.id === abierto)

  // Cambia en pantalla al instante y la nube se actualiza detrás; si falla, se avisa y se vuelve a cargar
  const rapido = (id, cambios, fn) => {
    ajustar(id, cambios)
    setAbierto(null)
    fn().catch((e) => { setFallo(`No se guardó: ${e.message}. Inténtelo de nuevo.`); recargar() })
  }

  if (actual) return <Detalle pedido={actual} perfil={perfil} rapido={rapido} cerrar={() => { setAbierto(null); recargar() }} />

  return (
    <div className="planta">
      {error && <div className="alerta-conexion">Sin conexión: {error}. Se reintenta solo.</div>}
      {fallo && <div className="alerta-conexion" onClick={() => setFallo('')}>{fallo}</div>}
      {llegada && (
        <button className="llegada" onClick={() => { setAbierto(llegada.id); setLlegada(null) }}>
          <b>{llegada.titulo}</b><span>{llegada.cliente} · toque para abrir</span>
        </button>
      )}
      {!pedidos && <p className="nota">Cargando…</p>}
      {pedidos && (
        <>
          <Grupo titulo="Por revisar en el depósito" vacio="No hay cotizaciones nuevas." lista={grupos.revisar} abrir={setAbierto} perfil={perfil}
            ayuda="Cotizaciones nuevas. Ábrala, revise en el depósito si está todo y toque «Todo disponible» o «Hay novedad»." />
          <Grupo titulo="Para imprimir y despachar" vacio="Nada por imprimir." lista={grupos.imprimir} abrir={setAbierto} perfil={perfil}
            ayuda="Facturación ya mandó el documento. Si es nota de entrega, imprímala. Si es factura fiscal, búsquela en Facturación y toque «Ya la tengo». Al salir el pedido, toque «Pedido despachado»." />
          <Grupo titulo="En espera de Facturación" vacio="Nada en espera." lista={grupos.espera} abrir={setAbierto} perfil={perfil}
            ayuda="Usted avisó una novedad. Facturación la está viendo; suena un aviso cuando responda." />
          <Grupo titulo="Confirmadas, Facturación está facturando" vacio="Nada por facturar." lista={grupos.facturar} abrir={setAbierto} perfil={perfil} suave
            ayuda="Ya confirmó que está todo. Facturación está haciendo la nota o la factura; suena un aviso cuando esté lista." />
          <p className="nota resumen-dia">Despachados hoy: <b>{grupos.hechos.length}</b></p>
        </>
      )}
    </div>
  )
}

function Grupo({ titulo, vacio, lista, abrir, perfil, suave, ayuda }) {
  return (
    <section className={`grupo ${suave ? 'suave' : ''}`}>
      <h2>{titulo}{ayuda && <Ayuda titulo={titulo}>{ayuda}</Ayuda>} <span className="cuenta">{lista.length}</span></h2>
      {lista.length === 0 && <p className="nota">{vacio}</p>}
      <div className="tarjetas">
        {lista.map((p) => <Tarjeta key={p.id} p={p} abrir={abrir} perfil={perfil} />)}
      </div>
    </section>
  )
}

function Tarjeta({ p, abrir, perfil }) {
  let etiqueta, clase
  if (p.estado === 'por_revisar') {
    etiqueta = p.respuesta_comercial ? 'Facturación respondió' : 'Nueva'
    clase = p.respuesta_comercial ? 'ambar' : 'azul'
  } else if (p.estado === 'en_revision') {
    etiqueta = p.tomado_por === perfil.id ? 'La estás revisando' : 'Otra persona la revisa'; clase = 'azul'
  } else if (p.estado === 'en_espera') { etiqueta = 'Esperando a Facturación'; clase = 'ambar' }
  else if (p.estado === 'disponible') { etiqueta = 'Facturando'; clase = 'gris' }
  else if (p.estado === 'documento_listo') {
    etiqueta = p.tipo_doc === 'nota' ? 'Nota lista para imprimir' : 'Factura fiscal: buscar en Facturación'; clase = 'verde'
  } else if (p.estado === 'impreso') { etiqueta = 'Impresa, falta despachar'; clase = 'verde' }

  return (
    <button className={`tarjeta borde-${clase}`} onClick={() => abrir(p.id)}>
      <div className="fila">
        <b className="numero">{p.cliente || 'Sin nombre de cliente'}</b>
        <span className={`etiqueta ${clase}`}>{etiqueta}</span>
      </div>
      <span className="nota">{hace(p.actualizado_en)}</span>
    </button>
  )
}

function Detalle({ pedido: p, perfil, cerrar, rapido }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [novedad, setNovedad] = useState(null)
  const [verDoc, setVerDoc] = useState(['documento_listo', 'impreso'].includes(p.estado) && !!p.doc_path)

  useEffect(() => {
    if (p.estado === 'por_revisar' || (p.estado === 'en_revision' && p.tomado_por === perfil.id)) {
      api.rpc('tomar_pedido', { p_id: p.id }).catch(() => {})
    }
  }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hacer = async (fn, salir = true) => {
    setOcupado(true); setError('')
    try { await fn(); if (salir) cerrar() } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }

  const imprimir = () => hacer(async () => {
    const [{ imprimirPdf }, datos] = await Promise.all([import('../pdf.js'), obtenerPdf(p.doc_path)])
    await imprimirPdf(datos)
    if (p.estado === 'documento_listo') await api.rpc('marcar_impreso', { p_id: p.id })
    else await api.rpc('registrar_reimpresion', { p_id: p.id })
  }, false)

  const revisando = ['por_revisar', 'en_revision', 'en_espera'].includes(p.estado)
  const otro = p.estado === 'en_revision' && p.tomado_por && p.tomado_por !== perfil.id

  return (
    <div className="detalle-planta">
      <div className="detalle-cabeza">
        <button className="btn-volver" onClick={cerrar}>← Volver</button>
        <div>
          <h2>{p.cliente || 'Sin nombre de cliente'}</h2>
          <span className="nota">Cotización</span>
        </div>
      </div>
      <Pasos p={p} />

      {p.respuesta_comercial && revisando && (
        <div className="mensaje ambar"><b>Facturación respondió:</b> {p.respuesta_comercial}{p.nota_planta && <><br /><span className="nota">Tu nota: {p.nota_planta}</span></>}</div>
      )}
      {p.estado === 'en_espera' && (
        <div className="mensaje ambar"><b>Enviaste a Facturación:</b> {p.nota_planta}<br /><span className="nota">Cuando respondan te avisa con un sonido.</span></div>
      )}
      {otro && <div className="mensaje">Otra persona la está revisando. Puedes verla, pero mejor no confirmar dos veces.</div>}
      {p.estado === 'documento_listo' && p.tipo_doc === 'fiscal' && (
        <div className="mensaje verde"><b>Factura fiscal impresa en Facturación.</b> Pásala buscando y luego marca «Ya la tengo».</div>
      )}

      {p.doc_path && (
        <div className="cambiar-pdf">
          <button className={!verDoc ? 'activa' : ''} onClick={() => setVerDoc(false)}>Cotización</button>
          <button className={verDoc ? 'activa' : ''} onClick={() => setVerDoc(true)}>{p.tipo_doc === 'nota' ? 'Nota de entrega' : 'Factura'}</button>
        </div>
      )}
      <PdfView ruta={verDoc && p.doc_path ? p.doc_path : p.cot_path} />

      {error && <p className="error">{error}</p>}

      <div className="barra-acciones">
        {revisando && novedad === null && (
          <>
            <Ayuda titulo="Qué botón tocar"><b>Todo disponible:</b> encontró todo lo de la cotización. <b>Hay novedad:</b> falta algo o hay que cambiar algo; escriba qué y se le avisa a Facturación.</Ayuda>
            <button className="btn grande ambar" disabled={ocupado} onClick={() => setNovedad(p.estado === 'en_espera' ? p.nota_planta : '')}>Hay novedad</button>
            <button className="btn grande verde" disabled={ocupado} onClick={() => rapido(p.id, { estado: 'disponible' }, () => api.rpc('confirmar_disponible', { p_id: p.id }))}>Todo disponible</button>
          </>
        )}
        {novedad !== null && (
          <div className="caja-novedad">
            <label htmlFor="novedad">¿Qué falta o qué hay que cambiar?</label>
            <div className="atajos">{ATAJOS.map((a) => <button key={a} onClick={() => setNovedad((n) => (n ? n + '\n' : '') + a)}>{a.trim()}…</button>)}</div>
            <textarea id="novedad" rows={4} value={novedad} autoFocus onChange={(e) => setNovedad(e.target.value)} placeholder="Ej.: Del B-210 solo hay 6. Se puede cambiar por B-211." />
            <div className="fila-botones">
              <button className="btn" onClick={() => setNovedad(null)}>Cancelar</button>
              <button className="btn ambar" disabled={ocupado || !novedad.trim()} onClick={() => rapido(p.id, { estado: 'en_espera', nota_planta: novedad }, () => api.rpc('reportar_novedad', { p_id: p.id, p_nota: novedad }))}>Enviar a Facturación</button>
            </div>
          </div>
        )}
        {p.estado === 'documento_listo' && p.tipo_doc === 'nota' && (
          <button className="btn grande azul" disabled={ocupado} onClick={imprimir}>Imprimir nota de entrega</button>
        )}
        {p.estado === 'documento_listo' && p.tipo_doc === 'fiscal' && (
          <button className="btn grande azul" disabled={ocupado} onClick={() => hacer(() => api.rpc('marcar_impreso', { p_id: p.id }), false)}>Ya la tengo</button>
        )}
        {p.estado === 'impreso' && p.tipo_doc === 'nota' && p.doc_path && (
          <button className="btn grande" disabled={ocupado} onClick={imprimir}>Reimprimir</button>
        )}
        {['documento_listo', 'impreso'].includes(p.estado) && (
          <button className="btn grande verde" disabled={ocupado} onClick={() => rapido(p.id, { estado: 'despachado', despachado_en: new Date().toISOString() }, () => api.rpc('marcar_despachado', { p_id: p.id }))}>Pedido despachado</button>
        )}
        {p.estado === 'disponible' && <p className="nota">Ya la confirmaste. Facturación la está facturando; te avisa cuando esté lista.</p>}
      </div>
    </div>
  )
}
