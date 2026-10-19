import { useEffect, useRef, useState } from 'react'
import { obtenerPdf } from '../archivos.js'

// Muestra todas las páginas de un PDF ajustadas al ancho, con botones para acercar
export default function PdfView({ ruta }) {
  const caja = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [estado, setEstado] = useState('cargando')

  useEffect(() => {
    let vivo = true
    const cont = caja.current
    cont.innerHTML = ''
    setEstado('cargando')
    ;(async () => {
      try {
        // El lector de PDF se carga solo la primera vez que hace falta
        const [{ abrirPdf }, datos] = await Promise.all([import('../pdf.js'), obtenerPdf(ruta)])
        const doc = await abrirPdf(datos)
        const ancho = cont.clientWidth - 2
        for (let i = 1; i <= doc.numPages && vivo; i++) {
          const pagina = await doc.getPage(i)
          const base = pagina.getViewport({ scale: 1 })
          const escala = (ancho / base.width) * zoom
          const vista = pagina.getViewport({ scale: escala * (window.devicePixelRatio || 1) })
          const lienzo = document.createElement('canvas')
          lienzo.width = vista.width
          lienzo.height = vista.height
          lienzo.style.width = `${base.width * escala}px`
          lienzo.className = 'pdf-pagina'
          if (!vivo) return
          cont.appendChild(lienzo)
          await pagina.render({ canvasContext: lienzo.getContext('2d'), viewport: vista }).promise
        }
        if (vivo) setEstado('listo')
      } catch {
        if (vivo) setEstado('error')
      }
    })()
    return () => { vivo = false }
  }, [ruta, zoom])

  return (
    <div className="pdf">
      <div className="pdf-zoom">
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Alejar">−</button>
        <span>{Math.round(zoom * 100)} %</span>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Acercar">+</button>
      </div>
      {estado === 'cargando' && <p className="nota pdf-aviso">Abriendo el PDF…</p>}
      {estado === 'error' && <p className="error pdf-aviso">No se pudo abrir el PDF. Revisa la conexión.</p>}
      <div className="pdf-paginas" ref={caja} />
    </div>
  )
}
