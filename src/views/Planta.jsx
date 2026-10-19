import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/index.js'
import { usePedidos } from '../usePedidos.js'
import PdfView from '../components/PdfView.jsx'
import { imprimirPdf } from '../pdf.js'
import { aviso, esHoy, hace, mantenerPantalla, sonar } from '../util.js'

const ATAJOS = ['No hay ', 'Solo hay ', 'Cambiar por ', 'Falta empaque de ']

export default function Planta({ perfil }) {
  const [abierto, setAbierto] = useState(null)
  const { pedidos, error, recargar } = usePedidos((p, antes) => {
    if (p.estado === 'por_revisar' && (!antes || antes.estado !== 'por_revisar')) {
      sonar(); aviso('Cotización nueva', p.cliente)
    }
    if (p.estado === 'documento_listo' && antes?.estado !== 'documento_listo') {
      sonar()
      aviso(p.tipo_doc === 'nota' ? 'Nota de entrega lista para imprimir' : 'Factura fiscal lista en Comercial', p.cliente)
    }
  })

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

  const actual = abierto && pedidos?.find((p) => p.id === abierto)

  if (actual) return <Detalle pedido={actual} perfil={perfil} cerrar={() => { setAbierto(null); recargar() }} />

  return (
    <div className="planta">
      {error && <div className="alerta-conexion">Sin conexión: {error}. Se reintenta solo.</div>}
      {!pedidos && <p className="nota">Cargando…</p>}
      {pedidos && (
        <>
          <Grupo titulo="Por revisar en el depósito" vacio="No hay cotizaciones nuevas." lista={grupos.revisar} abrir={setAbierto} perfil={perfil} />
          <Grupo titulo="Para imprimir y despachar" vacio="Nada por imprimir." lista={grupos.imprimir} abrir={setAbierto} perfil={perfil} />
          <Grupo titulo="En espera de Comercial" vacio="Nada en espera." lista={grupos.espera} abrir={setAbierto} perfil={perfil} />
          <Grupo titulo="Confirmadas, Comercial está facturando" vacio="Nada por facturar." lista={grupos.facturar} abrir={setAbierto} perfil={perfil} suave />
          <p className="nota resumen-dia">Despachados hoy: <b>{grupos.hechos.length}</b></p>
        </>
      )}
    </div>
  )
}

function Grupo({ titulo, vacio, lista, abrir, perfil, suave }) {
  return (
    <section className={`grupo ${suave ? 'suave' : ''}`}>
      <h2>{titulo} <span className="cuenta">{lista.length}</span></h2>
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
    etiqueta = p.respuesta_comercial ? 'Comercial respondió' : 'Nueva'
    clase = p.respuesta_comercial ? 'ambar' : 'azul'
  } else if (p.estado === 'en_revision') {
    etiqueta = p.tomado_por === perfil.id ? 'La estás revisando' : 'Otra persona la revisa'; clase = 'azul'
  } else if (p.estado === 'en_espera') { etiqueta = 'Esperando a Comercial'; clase = 'ambar' }
  else if (p.estado === 'disponible') { etiqueta = 'Facturando'; clase = 'gris' }
  else if (p.estado === 'documento_listo') {
    etiqueta = p.tipo_doc === 'nota' ? 'Nota lista para imprimir' : 'Factura fiscal: buscar en Comercial'; clase = 'verde'
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

function Detalle({ pedido: p, perfil, cerrar }) {
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
    await imprimirPdf(await api.urlArchivo(p.doc_path))
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

      {p.respuesta_comercial && revisando && (
        <div className="mensaje ambar"><b>Comercial respondió:</b> {p.respuesta_comercial}{p.nota_planta && <><br /><span className="nota">Tu nota: {p.nota_planta}</span></>}</div>
      )}
      {p.estado === 'en_espera' && (
        <div className="mensaje ambar"><b>Enviaste a Comercial:</b> {p.nota_planta}<br /><span className="nota">Cuando respondan te avisa con un sonido.</span></div>
      )}
      {otro && <div className="mensaje">Otra persona la está revisando. Puedes verla, pero mejor no confirmar dos veces.</div>}
      {p.estado === 'documento_listo' && p.tipo_doc === 'fiscal' && (
        <div className="mensaje verde"><b>Factura fiscal impresa en Comercial.</b> Pásala buscando y luego marca «Ya la tengo».</div>
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
        {revisando && !novedad && (
          <>
            <button className="btn grande ambar" disabled={ocupado} onClick={() => setNovedad(p.estado === 'en_espera' ? p.nota_planta : '')}>Hay novedad</button>
            <button className="btn grande verde" disabled={ocupado} onClick={() => hacer(() => api.rpc('confirmar_disponible', { p_id: p.id }))}>Todo disponible</button>
          </>
        )}
        {novedad !== null && (
          <div className="caja-novedad">
            <label htmlFor="novedad">¿Qué falta o qué hay que cambiar?</label>
            <div className="atajos">{ATAJOS.map((a) => <button key={a} onClick={() => setNovedad((n) => (n ? n + '\n' : '') + a)}>{a.trim()}…</button>)}</div>
            <textarea id="novedad" rows={4} value={novedad} autoFocus onChange={(e) => setNovedad(e.target.value)} placeholder="Ej.: Del B-210 solo hay 6. Se puede cambiar por B-211." />
            <div className="fila-botones">
              <button className="btn" onClick={() => setNovedad(null)}>Cancelar</button>
              <button className="btn ambar" disabled={ocupado || !novedad.trim()} onClick={() => hacer(() => api.rpc('reportar_novedad', { p_id: p.id, p_nota: novedad }))}>Enviar a Comercial</button>
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
          <button className="btn grande verde" disabled={ocupado} onClick={() => hacer(() => api.rpc('marcar_despachado', { p_id: p.id }))}>Pedido despachado</button>
        )}
        {p.estado === 'disponible' && <p className="nota">Ya la confirmaste. Comercial la está facturando; te avisa cuando esté lista.</p>}
      </div>
    </div>
  )
}
