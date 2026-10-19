import { useEffect, useState } from 'react'
import Ayuda from './Ayuda.jsx'
import { activarAvisos, estadoAvisos, renovarAvisos } from '../avisos.js'

const TEXTOS = {
  activos: 'Este equipo recibe avisos con sonido aunque la app esté cerrada. Si no suenan, revise que el volumen y los avisos de Chrome estén encendidos.',
  apagados: 'Toque «Activar avisos» y luego «Permitir». Desde ese momento este equipo suena con cada pedido que le toca, aunque la app esté cerrada.',
  bloqueados: 'Los avisos están bloqueados en este navegador. Toque el candado junto a la dirección, busque «Notificaciones» y elija «Permitir».',
  iphone: 'En iPhone, primero toque Compartir y «Agregar a pantalla de inicio». Abra la app desde ese ícono y aquí aparecerá «Activar avisos».',
  no: 'Este navegador no puede recibir avisos. Use Chrome en Android o en la PC.',
}

export default function BotonAvisos() {
  const [estado, setEstado] = useState(estadoAvisos)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => { renovarAvisos() }, [])

  const activar = async () => {
    setOcupado(true)
    try { setEstado(await activarAvisos()) } catch { setEstado(estadoAvisos()) }
    setOcupado(false)
  }

  return (
    <span className="avisos">
      {estado === 'apagados' && (
        <button className="btn btn-avisos" onClick={activar} disabled={ocupado}>
          <Campana /> {ocupado ? 'Activando…' : 'Activar avisos'}
        </button>
      )}
      {estado === 'activos' && <span className="avisos-ok"><Campana /> Avisos activos</span>}
      {['bloqueados', 'iphone', 'no'].includes(estado) && <span className="avisos-no"><Campana /> Sin avisos</span>}
      <Ayuda titulo="Avisos">{TEXTOS[estado]}</Ayuda>
    </span>
  )
}

const Campana = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)
