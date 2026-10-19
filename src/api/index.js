import { crearApiNube } from './nube.js'
import { crearApiDemo } from './demo.js'

// Si la app tiene datos de Supabase usa la nube; si no, el modo de prueba.
// Con ?prueba en la dirección se fuerza el modo de prueba.
const url = import.meta.env.VITE_SUPABASE_URL
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY
const forzarPrueba = new URLSearchParams(location.search).has('prueba')

export const api = url && llave && !forzarPrueba ? crearApiNube(url, llave) : crearApiDemo()
