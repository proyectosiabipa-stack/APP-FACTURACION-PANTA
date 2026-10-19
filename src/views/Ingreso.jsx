import { useEffect, useState } from 'react'
import { api } from '../api/index.js'

const ROLES = { planta: 'Planta', comercial: 'Comercial', admin: 'Administración' }

export default function Ingreso({ alEntrar }) {
  const [personas, setPersonas] = useState(null)
  const [elegida, setElegida] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

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
            <p>¿Quién eres?</p>
            {!personas && !error && <p className="nota">Cargando…</p>}
            {personas && personas.length === 0 && <p className="nota">Todavía no hay personas registradas.</p>}
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
