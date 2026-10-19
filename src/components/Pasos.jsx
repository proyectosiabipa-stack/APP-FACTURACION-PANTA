import { hora } from '../util.js'

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
    <ol className="pasos" aria-label="Pasos del pedido">
      {pasos.map(([texto, en], i) => (
        <li key={texto} className={en ? 'hecho' : i === actual ? 'actual' : ''}>
          <span className="punto">{en ? '✓' : i + 1}</span>
          <span className="paso-texto">{texto}</span>
          <span className="paso-hora">{en ? hora(en) : i === actual ? 'en curso' : ''}</span>
        </li>
      ))}
    </ol>
  )
}
