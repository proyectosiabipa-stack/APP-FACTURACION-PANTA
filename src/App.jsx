import { useEffect, useState } from 'react'
import { api } from './api/index.js'
import Ingreso from './views/Ingreso.jsx'
import { lazy, Suspense } from 'react'
// Cada pantalla se carga solo cuando se usa
const Planta = lazy(() => import('./views/Planta.jsx'))
const Comercial = lazy(() => import('./views/Comercial.jsx'))
const Personas = lazy(() => import('./views/Personas.jsx'))
import { activarSonido } from './util.js'
import { quitarAvisos } from './avisos.js'
import BotonAvisos from './components/BotonAvisos.jsx'

export default function App() {
  const [perfil, setPerfil] = useState(undefined)
  const [vista, setVista] = useState(null)

  useEffect(() => { api.sesionActual().then((p) => setPerfil(p || null)).catch(() => setPerfil(null)) }, [])

  useEffect(() => {
    if (!perfil) return
    setVista(perfil.rol === 'planta' ? 'planta' : 'comercial')
    const despertar = () => activarSonido()
    window.addEventListener('pointerdown', despertar, { once: true })
    return () => window.removeEventListener('pointerdown', despertar)
  }, [perfil])

  if (perfil === undefined) return <div className="cargando">Cargando…</div>
  if (!perfil) return <Ingreso alEntrar={setPerfil} />

  const salir = async () => { await quitarAvisos(); await api.salir(); setPerfil(null) }

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca"><span className="marca-hoja"><img src="hoja.png" alt="" /></span> <span>BIPA <small>Despacho</small></span></div>
        {perfil.rol === 'admin' && (
          <nav className="pestanas" aria-label="Vistas">
            {[['comercial', 'Facturación'], ['planta', 'Planta'], ['personas', 'Accesos']].map(([v, t]) => (
              <button key={v} className={vista === v ? 'activa' : ''} onClick={() => setVista(v)}>{t}</button>
            ))}
          </nav>
        )}
        <div className="quien">
          <BotonAvisos />
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
        <Suspense fallback={<div className="cargando">Cargando…</div>}>
          {vista === 'planta' && <Planta perfil={perfil} />}
          {vista === 'comercial' && <Comercial perfil={perfil} />}
          {vista === 'personas' && <Personas />}
        </Suspense>
      </main>
      <div id="zona-impresion" aria-hidden="true" />
    </div>
  )
}
