import { useEffect, useState } from 'react'
import { api } from './api/index.js'
import Ingreso from './views/Ingreso.jsx'
import Planta from './views/Planta.jsx'
import Comercial from './views/Comercial.jsx'
import Personas from './views/Personas.jsx'
import { activarSonido, pedirPermisoAvisos } from './util.js'

export default function App() {
  const [perfil, setPerfil] = useState(undefined)
  const [vista, setVista] = useState(null)

  useEffect(() => { api.sesionActual().then((p) => setPerfil(p || null)).catch(() => setPerfil(null)) }, [])

  useEffect(() => {
    if (!perfil) return
    setVista(perfil.rol === 'planta' ? 'planta' : 'comercial')
    const despertar = () => { activarSonido(); pedirPermisoAvisos() }
    window.addEventListener('pointerdown', despertar, { once: true })
    return () => window.removeEventListener('pointerdown', despertar)
  }, [perfil])

  if (perfil === undefined) return <div className="cargando">Cargando…</div>
  if (!perfil) return <Ingreso alEntrar={setPerfil} />

  const salir = async () => { await api.salir(); setPerfil(null) }

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca"><img src="icono-192.png" alt="" /> <span>BIPA Despacho</span></div>
        {perfil.rol === 'admin' && (
          <nav className="pestanas" aria-label="Vistas">
            {[['comercial', 'Facturación'], ['planta', 'Planta'], ['personas', 'Accesos']].map(([v, t]) => (
              <button key={v} className={vista === v ? 'activa' : ''} onClick={() => setVista(v)}>{t}</button>
            ))}
          </nav>
        )}
        <div className="quien">
          <span>{perfil.nombre}</span>
          <button className="btn-texto" onClick={salir}>Salir</button>
        </div>
      </header>
      {api.modo === 'demo' && (
        <div className="franja-prueba">
          Modo de prueba: los datos son de ejemplo y solo viven en este equipo.
          {api.reiniciar && <button className="btn-texto" onClick={() => { api.reiniciar(); location.reload() }}>Reiniciar ejemplo</button>}
        </div>
      )}
      <main className="contenido">
        {vista === 'planta' && <Planta perfil={perfil} />}
        {vista === 'comercial' && <Comercial perfil={perfil} />}
        {vista === 'personas' && <Personas />}
      </main>
      <div id="zona-impresion" aria-hidden="true" />
    </div>
  )
}
