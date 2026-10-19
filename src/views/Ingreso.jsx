import { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import Ayuda from '../components/Ayuda.jsx'


export default function Ingreso({ alEntrar }) {
  const [personas, setPersonas] = useState(null)
  const [elegida, setElegida] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [primero, setPrimero] = useState({ pin: '', repetir: '' })

  useEffect(() => {
    api.listaIngreso().then(setPersonas).catch((e) => setError(e.message))
  }, [])

  const entrar = async (clave) => {
    setOcupado(true)
    setError('')
    try {
      alEntrar(await api.entrar(elegida.correo, clave))
    } catch (e) {
      setError(e.message)
      setPin('')
    } finally {
      setOcupado(false)
    }
  }

  // Primer uso: todavía no hay nadie, se crea el administrador y entra de una vez
  const crearAdministrador = async () => {
    if (primero.pin !== primero.repetir) { setError('Los dos PIN no son iguales'); return }
    setOcupado(true)
    setError('')
    try {
      const codigo = new URLSearchParams(location.search).get('alta') || ''
      await api.usuarios({ accion: 'crear', nombre: 'Administración', rol: 'admin', pin: primero.pin, codigo })
      history.replaceState(null, '', location.pathname)
      const lista = await api.listaIngreso()
      const yo = lista.find((p) => p.rol === 'admin')
      alEntrar(await api.entrar(yo.correo, primero.pin))
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }
  const entrarPlanta = async () => {
    setOcupado(true)
    setError('')
    try { alEntrar(await api.entrarPlanta()) } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  const soloNumeros = (v) => v.replace(/\D/g, '').slice(0, 6)

  const tecla = (d) => {
    if (ocupado) return
    const nuevo = (pin + d).slice(0, 6)
    setPin(nuevo)
    if (nuevo.length === 6) entrar(nuevo)
  }

  return (
    <div className="ingreso">
      <div className="ingreso-caja">
        <img src="logo-bipa.png" alt="BIPA, buenas ideas puestas en acción" className="ingreso-logo" />
        <h1>Despacho <Ayuda titulo="Cómo entrar"><b>Planta</b> entra con un toque, solo en las tablets que la administración autorizó. <b>Facturación</b> y <b>Administración</b> piden su PIN de 6 números.</Ayuda></h1>
        {api.modo === 'demo' && <p className="nota">Modo de prueba · el PIN de todos es 123456</p>}
        {!elegida ? (
          <>
            {personas && personas.length === 0 && (
              <form className="primer-admin" onSubmit={(e) => { e.preventDefault(); crearAdministrador() }}>
                <p><b>Crear administrador</b></p>
                <p className="nota">Elija el PIN de 6 números de la administración. Después pone el PIN de Facturación desde «Accesos».</p>
                <div className="campos">
                  <label>PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={primero.pin} onChange={(e) => setPrimero({ ...primero, pin: soloNumeros(e.target.value) })} /></label>
                  <label>Repetir PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={primero.repetir} onChange={(e) => setPrimero({ ...primero, repetir: soloNumeros(e.target.value) })} /></label>
                </div>
                <button className="btn verde" disabled={ocupado || primero.pin.length !== 6 || primero.repetir.length !== 6}>Crear administrador</button>
              </form>
            )}
            <div className="ingreso-personas">
              {personas?.length > 0 && (
                <button className="persona" onClick={entrarPlanta} disabled={ocupado}>
                  <span className="inicial">P</span>
                  <span><b>Planta</b><small>Entra con un toque</small></span>
                </button>
              )}
              {personas?.map((p) => (
                <button key={p.correo} className="persona" onClick={() => { setElegida(p); setError('') }}>
                  <span className="inicial">{p.nombre.slice(0, 1)}</span>
                  <span><b>{p.nombre}</b><small>Con PIN</small></span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p><b>{elegida.nombre}</b>: escriba el PIN.</p>
            <div className="pin-puntos" aria-label={`${pin.length} de 6 números`}>
              {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={i < pin.length ? 'lleno' : ''} />)}
            </div>
            <div className="teclado">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => tecla(d)}>{d}</button>)}
              <button className="suave" onClick={() => { setElegida(null); setPin('') }}>Volver</button>
              <button onClick={() => tecla('0')}>0</button>
              <button className="suave" onClick={() => setPin(pin.slice(0, -1))} aria-label="Borrar">⌫</button>
            </div>
          </>
        )}
        {ocupado && <p className="nota">Entrando…</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
