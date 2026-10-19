import { hora } from '../util.js'
import Ayuda from './Ayuda.jsx'

// Línea de pasos de un pedido: lo hecho en verde con su hora, lo que falta en gris
export default function Pasos({ p }) {
  const pasos = [
    ['Subida', p.creado_en],
    ['Revisada', p.disponible_en],
    ['Facturada', p.documento_en],
    [p.tipo_doc === 'fiscal' ? 'Recibida' : 'Impresa', p.impreso_en],
    ['Despachada', p.despachado_en],
  ]
  const actual = pasos.findIndex(([, en]) => !en)
  return (
    <div className="pasos-caja">
    <span className="pasos-ayuda"><Ayuda titulo="Pasos del pedido">Cada pedido pasa por estos 5 pasos. En verde, lo que ya se hizo y a qué hora; en azul, el paso en que va.</Ayuda></span>
    <ol className="pasos" aria-label="Pasos del pedido">
      {pasos.map(([texto, en], i) => (
        <li key={texto} className={en ? 'hecho' : i === actual ? 'actual' : ''}>
          <span className="punto">{en ? '✓' : i + 1}</span>
          <span className="paso-texto">{texto}</span>
          <span className="paso-hora">{en ? hora(en) : i === actual ? 'en curso' : ''}</span>
        </li>
      ))}
    </ol>
    </div>
  )
}
