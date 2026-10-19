import { useEffect, useState } from 'react'
import { api } from '../api/index.js'

const ROLES = { planta: 'Planta', comercial: 'Comercial', admin: 'Administración' }

export default function Ingreso({ alEntrar }) {
  const [personas, setPersonas] = useState(null)
  const [elegida, setElegida] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [primero, setPrimero] = useState({ nombre: '', pin: '', repetir: '' })

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
      await api.usuarios({ accion: 'crear', nombre: primero.nombre.trim(), rol: 'admin', pin: primero.pin, codigo })
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
        <img src="icono-192.png" alt="" className="ingreso-logo" />
        <h1>BIPA Despacho</h1>
        {api.modo === 'demo' && <p className="nota">Modo de prueba · el PIN de todos es 123456</p>}
        {!elegida ? (
          <>
            {personas?.length !== 0 && api.modo !== 'demo' && <p className="nota">Este equipo no está conectado. Planta y facturación entran solas una vez que el administrador conecta el equipo.</p>}
            {personas?.length !== 0 && <p>{api.modo === 'demo' ? '¿Quién eres?' : 'Administración'}</p>}
            {!personas && !error && <p className="nota">Cargando…</p>}
            {personas && personas.length === 0 && (
              <form className="primer-admin" onSubmit={(e) => { e.preventDefault(); crearAdministrador() }}>
                <p><b>Crear administrador</b></p>
                <p className="nota">Todavía no hay nadie registrado. Escriba su nombre y elija su PIN de 6 números. Después agrega a los demás desde «Personas».</p>
                <div className="campos">
                  <label className="ancho">Nombre<input value={primero.nombre} autoComplete="off" onChange={(e) => setPrimero({ ...primero, nombre: e.target.value })} /></label>
                  <label>PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={primero.pin} onChange={(e) => setPrimero({ ...primero, pin: soloNumeros(e.target.value) })} /></label>
                  <label>Repetir PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={primero.repetir} onChange={(e) => setPrimero({ ...primero, repetir: soloNumeros(e.target.value) })} /></label>
                </div>
                <button className="btn verde" disabled={ocupado || !primero.nombre.trim() || primero.pin.length !== 6 || primero.repetir.length !== 6}>Crear administrador</button>
              </form>
            )}
            <div className="ingreso-personas">
              {personas?.map((p) => (
                <button key={p.correo} className="persona" onClick={() => { setElegida(p); setError('') }}>
                  <span className="inicial">{p.nombre.slice(0, 1)}</span>
                  <span><b>{p.nombre}</b><small>{ROLES[p.rol]}</small></span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>Hola, <b>{elegida.nombre.split(' ')[0]}</b>. Escribe tu PIN.</p>
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
