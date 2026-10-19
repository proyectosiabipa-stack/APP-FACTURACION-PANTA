import { useEffect, useRef, useState } from 'react'

// Bombillo de ayuda: al tocarlo muestra una explicación corta; se cierra tocando en cualquier otro lado
export default function Ayuda({ children, titulo = 'Ayuda' }) {
  const [pos, setPos] = useState(null)
  const boton = useRef(null)

  useEffect(() => {
    if (!pos) return
    const cerrar = (e) => { if (!boton.current?.contains(e.target)) setPos(null) }
    const tecla = (e) => e.key === 'Escape' && setPos(null)
    document.addEventListener('pointerdown', cerrar)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('pointerdown', cerrar)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [pos])

  const abrir = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (pos) { setPos(null); return }
    const r = boton.current.getBoundingClientRect()
    const ancho = Math.min(300, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.left + r.width / 2 - ancho / 2, window.innerWidth - ancho - 12))
    const abajo = r.bottom + 180 < window.innerHeight
    setPos({ left, ancho, top: abajo ? r.bottom + 8 : undefined, bottom: abajo ? undefined : window.innerHeight - r.top + 8 })
  }

  return (
    <span className="ayuda" ref={boton}>
      <button type="button" className={`ayuda-boton ${pos ? 'abierta' : ''}`} onClick={abrir} aria-label={titulo} aria-expanded={!!pos}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm-2 18h4a1 1 0 0 1 0 2h-4a1 1 0 0 1 0-2Z" /></svg>
      </button>
      {pos && (
        <span role="tooltip" className="ayuda-globo" style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.ancho }} onPointerDown={(e) => e.stopPropagation()}>
          {children}
        </span>
      )}
    </span>
  )
}
