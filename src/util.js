export const ESTADOS = {
  por_revisar: { texto: 'Por revisar', color: 'azul' },
  en_revision: { texto: 'Revisando en depósito', color: 'azul' },
  en_espera: { texto: 'En espera', color: 'ambar' },
  disponible: { texto: 'Para facturar', color: 'verde' },
  documento_listo: { texto: 'Documento listo', color: 'verde' },
  impreso: { texto: 'Impreso', color: 'verde' },
  despachado: { texto: 'Despachado', color: 'gris' },
  anulado: { texto: 'Anulado', color: 'gris' },
}

export function hace(iso) {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function hora(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' }) : ''
}

export function duracion(desde, hasta) {
  if (!desde || !hasta) return ''
  const min = Math.round((new Date(hasta) - new Date(desde)) / 60000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export function esHoy(iso) {
  return iso && new Date(iso).toDateString() === new Date().toDateString()
}

// Sonido corto de aviso (dos tonos)
let ctx
export function sonar(tipo = 'nuevo') {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)()
    const notas = tipo === 'alerta' ? [660, 440, 660] : [660, 880]
    notas.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      o.type = 'sine'
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.18)
      o.stop(ctx.currentTime + i * 0.18 + 0.17)
    })
  } catch { /* sin audio en este equipo */ }
}
export function activarSonido() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); ctx.resume() } catch { /* sin audio */ }
}

export async function pedirPermisoAvisos() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
  } catch { /* el navegador no permite avisos */ }
}

export async function aviso(titulo, cuerpo) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) reg.showNotification(titulo, { body: cuerpo, icon: 'icono-192.png', tag: titulo })
    else new Notification(titulo, { body: cuerpo })
  } catch { /* sin avisos */ }
}

// Mantener la pantalla de la tablet encendida mientras la app está abierta
export async function mantenerPantalla() {
  let candado = null
  const pedir = async () => {
    try { if (document.visibilityState === 'visible') candado = await navigator.wakeLock?.request('screen') } catch { /* no soportado */ }
  }
  document.addEventListener('visibilitychange', pedir)
  await pedir()
  return () => { document.removeEventListener('visibilitychange', pedir); candado?.release?.() }
}
