import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api/index.js'

// Lista de pedidos siempre al día: tiempo real + respaldo cada minuto.
// alLlegar(pedido, anterior) se llama cuando un pedido cambia de estado (para sonar y avisar).
export function usePedidos(alLlegar) {
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState('')
  const previo = useRef(null)
  const cb = useRef(alLlegar)
  cb.current = alLlegar

  const cargar = useCallback(async () => {
    try {
      const lista = await api.pedidos()
      if (previo.current) {
        for (const p of lista) {
          const antes = previo.current.get(p.id)
          if (!antes || antes.estado !== p.estado || antes.actualizado_en !== p.actualizado_en) cb.current?.(p, antes)
        }
      }
      previo.current = new Map(lista.map((p) => [p.id, p]))
      setPedidos(lista)
      setError('')
    } catch (e) {
      setError(e.message || 'Sin conexión')
    }
  }, [])

  useEffect(() => {
    cargar()
    let t
    const pronto = () => { clearTimeout(t); t = setTimeout(cargar, 250) }
    const quitar = api.suscribir(pronto)
    const cada = setInterval(cargar, 60000)
    const alVolver = () => document.visibilityState === 'visible' && cargar()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', cargar)
    return () => {
      quitar(); clearInterval(cada); clearTimeout(t)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', cargar)
    }
  }, [cargar])

  // Cambio inmediato en pantalla mientras la nube confirma (el tiempo real lo corrige si hiciera falta)
  const ajustar = useCallback((id, cambios) => {
    setPedidos((l) => l && l.map((p) => (p.id === id ? { ...p, ...cambios, actualizado_en: new Date().toISOString() } : p)))
    const antes = previo.current?.get(id)
    if (antes) previo.current.set(id, { ...antes, ...cambios })
  }, [])

  return { pedidos, error, recargar: cargar, ajustar }
}
