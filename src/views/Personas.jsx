import { useEffect, useState } from 'react'
import { api } from '../api/index.js'

const ROLES = { planta: 'Planta (revisa, imprime y despacha)', comercial: 'Comercial (sube y factura)', admin: 'Administración (todo)' }

export default function Personas() {
  const [lista, setLista] = useState([])
  const [nueva, setNueva] = useState({ nombre: '', rol: 'planta', pin: '' })
  const [pinDe, setPinDe] = useState(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const cargar = () => api.perfiles().then(setLista).catch((e) => setError(e.message))
  useEffect(() => { cargar() }, [])

  const hacer = async (datos, ok) => {
    setError(''); setMsg('')
    try { await api.usuarios(datos); setMsg(ok); cargar(); return true } catch (e) { setError(e.message); return false }
  }

  return (
    <div className="personas">
      <h2>Personas</h2>
      <p className="nota">Cada persona entra tocando su nombre y escribiendo su PIN de 6 números. No necesita correo.</p>
      <table className="tabla">
        <thead><tr><th>Nombre</th><th>Qué hace</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id} className={p.activo ? '' : 'inactivo'}>
              <td>{p.nombre}</td>
              <td>{ROLES[p.rol]}</td>
              <td>{p.activo ? 'Activo' : 'Desactivado'}</td>
              <td className="acciones-tabla">
                {pinDe?.id === p.id ? (
                  <>
                    <input aria-label="PIN nuevo" inputMode="numeric" maxLength={6} value={pinDe.pin} onChange={(e) => setPinDe({ ...pinDe, pin: e.target.value.replace(/\D/g, '') })} placeholder="6 números" />
                    <button className="btn verde" disabled={pinDe.pin.length !== 6} onClick={async () => (await hacer({ accion: 'pin', id: p.id, pin: pinDe.pin }, `PIN de ${p.nombre} cambiado.`)) && setPinDe(null)}>Guardar</button>
                    <button className="btn" onClick={() => setPinDe(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="btn-texto" onClick={() => setPinDe({ id: p.id, pin: '' })}>Cambiar PIN</button>
                    <button className="btn-texto" onClick={() => hacer({ accion: 'activo', id: p.id, activo: !p.activo }, p.activo ? `${p.nombre} ya no puede entrar.` : `${p.nombre} puede entrar de nuevo.`)}>{p.activo ? 'Desactivar' : 'Activar'}</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Agregar persona</h3>
      <div className="campos">
        <label>Nombre<input id="nuevo-nombre" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} /></label>
        <label>Qué hace
          <select id="nuevo-rol" value={nueva.rol} onChange={(e) => setNueva({ ...nueva, rol: e.target.value })}>
            {Object.entries(ROLES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label>PIN (6 números)<input id="nuevo-pin" inputMode="numeric" maxLength={6} value={nueva.pin} onChange={(e) => setNueva({ ...nueva, pin: e.target.value.replace(/\D/g, '') })} /></label>
      </div>
      <button className="btn verde" disabled={!nueva.nombre.trim() || nueva.pin.length !== 6}
        onClick={async () => (await hacer({ accion: 'crear', ...nueva }, `${nueva.nombre} ya puede entrar.`)) && setNueva({ nombre: '', rol: 'planta', pin: '' })}>Agregar</button>
      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
