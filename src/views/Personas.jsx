import { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import Ayuda from '../components/Ayuda.jsx'

// Tres accesos fijos, sin nombres de personas: Planta (sin PIN, solo equipos autorizados),
// Facturación (PIN) y Administración (PIN)
export default function Personas() {
  const [lista, setLista] = useState([])
  const [pinFact, setPinFact] = useState('')
  const [pinAdmin, setPinAdmin] = useState('')
  const [autorizada, setAutorizada] = useState(api.plantaAutorizada())
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = () => api.perfiles().then(setLista).catch((e) => setError(e.message))
  useEffect(() => { cargar() }, [])

  const hacer = async (accion, ok) => {
    setError(''); setMsg(''); setOcupado(true)
    try { await accion(); setMsg(ok); cargar(); return true } catch (e) { setError(e.message); return false } finally { setOcupado(false) }
  }

  const fact = lista.find((p) => p.rol === 'comercial' && !p.equipo)
  const yo = api.perfil

  return (
    <div className="personas">
      <h2>Accesos</h2>

      <section className="acceso">
        <h3>Planta <Ayuda titulo="Planta">Entra sin PIN, pero solo en las tablets que usted autorice aquí. Si pierde una, toque «Quitar todas las tablets» y autorice de nuevo las que siguen en uso.</Ayuda></h3>
        <p className="nota">Entra con un toque, sin PIN, pero solo en los equipos que usted autorice. Abra la app aquí, en la tablet de planta, y toque el botón una sola vez.</p>
        <div className="acciones">
          {autorizada
            ? <span className="ok">Este equipo ya está autorizado para Planta.</span>
            : <button className="btn verde" disabled={ocupado} onClick={() => hacer(async () => { await api.autorizarPlanta(); setAutorizada(true) }, 'Listo. Toque «Salir» y luego «Planta».')}>Autorizar este equipo para Planta</button>}
          <button className="btn" disabled={ocupado} onClick={() => confirm('Todas las tablets de Planta quedarán fuera y tendrá que autorizar de nuevo las que sigan en uso. ¿Seguir?') &&
            hacer(() => api.usuarios({ accion: 'quitar_planta' }), 'Listo. Ninguna tablet entra a Planta hasta que la autorice de nuevo.')}>Quitar todas las tablets</button>
        </div>
      </section>

      <section className="acceso">
        <h3>Facturación <Ayuda titulo="Facturación">Entra con este PIN de 6 números en la computadora de Facturación. Puede cambiarlo cuando quiera; «Desactivar» le quita la entrada.</Ayuda></h3>
        <p className="nota">{fact ? 'Entra con PIN. Aquí puede cambiarlo.' : 'Todavía no tiene PIN. Elija uno de 6 números para que Facturación pueda entrar.'}</p>
        <div className="acciones">
          <input aria-label="PIN de Facturación" inputMode="numeric" maxLength={6} placeholder="6 números" value={pinFact} onChange={(e) => setPinFact(e.target.value.replace(/\D/g, ''))} />
          <button className="btn verde" disabled={ocupado || pinFact.length !== 6}
            onClick={async () => (await hacer(() => api.usuarios({ accion: 'facturacion', pin: pinFact }), 'PIN de Facturación guardado.')) && setPinFact('')}>Guardar PIN</button>
          {fact && <button className="btn" disabled={ocupado} onClick={() => hacer(() => api.usuarios({ accion: 'activo', id: fact.id, activo: !fact.activo }), fact.activo ? 'Facturación ya no puede entrar.' : 'Facturación puede entrar de nuevo.')}>{fact.activo ? 'Desactivar' : 'Activar'}</button>}
        </div>
      </section>

      <section className="acceso">
        <h3>Administración <Ayuda titulo="Administración">Solo usted. Ve todo: Facturación, Planta y estos accesos.</Ayuda></h3>
        <p className="nota">Solo usted. Puede cambiar su PIN.</p>
        <div className="acciones">
          <input aria-label="PIN nuevo de Administración" inputMode="numeric" maxLength={6} placeholder="6 números" value={pinAdmin} onChange={(e) => setPinAdmin(e.target.value.replace(/\D/g, ''))} />
          <button className="btn verde" disabled={ocupado || pinAdmin.length !== 6 || !yo}
            onClick={async () => (await hacer(() => api.usuarios({ accion: 'pin', id: yo.id, pin: pinAdmin }), 'Su PIN fue cambiado.')) && setPinAdmin('')}>Cambiar PIN</button>
        </div>
      </section>

      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
