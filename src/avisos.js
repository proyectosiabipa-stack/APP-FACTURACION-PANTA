// Avisos que suenan aunque la app esté cerrada (teléfono, tablet o PC).
// Cada equipo se anota una vez; desde ahí la nube le manda los avisos que le tocan.
import { api } from './api/index.js'

const PUBLICA = import.meta.env.VITE_VAPID_PUBLICA

const aBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}
const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

// 'activos' | 'apagados' | 'bloqueados' | 'iphone' (falta ponerla en la pantalla de inicio) | 'no'
export function estadoAvisos() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return esIphone() && !instalada() ? 'iphone' : 'no'
  }
  if (Notification.permission === 'denied') return 'bloqueados'
  return Notification.permission === 'granted' ? 'activos' : 'apagados'
}

async function anotar() {
  const reg = await navigator.serviceWorker.ready
  if (api.modo === 'demo') return reg
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(PUBLICA) })
  const { endpoint, keys } = sub.toJSON()
  await api.rpc('guardar_suscripcion', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
  return reg
}

// Al tocar «Activar avisos»: pide permiso, anota el equipo y manda un aviso de prueba
export async function activarAvisos() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return estadoAvisos()
  const reg = await anotar()
  reg.showNotification('Avisos activados', { body: 'Así sonará cada aviso de BIPA Despacho.', icon: 'icono-192.png', tag: 'prueba' }).catch(() => {})
  return 'activos'
}

// Al entrar: si el equipo ya dio permiso, se vuelve a anotar en silencio (por si cambió de cuenta)
export async function renovarAvisos() {
  try { if (estadoAvisos() === 'activos') await anotar() } catch { /* se intenta en la próxima entrada */ }
}

// Al salir: este equipo deja de recibir avisos de esa cuenta
export async function quitarAvisos() {
  try {
    const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription()
    if (sub && api.modo !== 'demo') await api.rpc('quitar_suscripcion', { p_endpoint: sub.endpoint })
  } catch { /* sin conexión: la nube lo limpia sola */ }
}

// ¿Este equipo ya recibe avisos desde la nube? (para no repetir el aviso local)
export async function recibeDeLaNube() {
  try { return !!(await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription()) } catch { return false }
}
