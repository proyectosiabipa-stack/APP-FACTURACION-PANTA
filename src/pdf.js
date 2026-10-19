// Lectura, dibujo e impresión de PDF con pdf.js
import * as pdfjs from 'pdfjs-dist'
import trabajador from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = trabajador

export async function abrirPdf(fuente) {
  const datos = fuente instanceof Uint8Array ? { data: fuente }
    : fuente instanceof Blob ? { data: new Uint8Array(await fuente.arrayBuffer()) } : { url: fuente }
  return pdfjs.getDocument(datos).promise
}

export async function textoDePdf(archivo) {
  const doc = await abrirPdf(archivo)
  const lineas = []
  for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
    const contenido = await (await doc.getPage(i)).getTextContent()
    let actual = ''
    for (const it of contenido.items) {
      actual += it.str
      if (it.hasEOL) { lineas.push(actual.trim()); actual = '' } else actual += ' '
    }
    if (actual.trim()) lineas.push(actual.trim())
  }
  return lineas.filter(Boolean).join('\n')
}

const NUM = String.raw`(?:n[°ºo]\.?|nro\.?|no\.|n[uú]mero|#)?\s*:?\s*([A-Z]?-?\d{3,})`

// Adivina qué es el documento y sus datos. Francis siempre puede corregirlos antes de guardar.
export function analizarTexto(texto, nombreArchivo = '') {
  const t = texto.replace(/[ \t]+/g, ' ')
  const r = { tipo: null, numero: '', cliente: '', cotizacionRef: '' }
  const nota = t.match(new RegExp(String.raw`nota\s+de\s+entrega\s*` + NUM, 'i'))
  const factura = t.match(new RegExp(String.raw`factura\s*` + NUM, 'i'))
  const cotiz = t.match(new RegExp(String.raw`cotizaci[oó]n\s*` + NUM, 'i'))
  if (nota) { r.tipo = 'nota'; r.numero = nota[1] }
  else if (factura) { r.tipo = 'fiscal'; r.numero = factura[1] }
  else if (cotiz || /cotizaci[oó]n/i.test(t)) { r.tipo = 'cotizacion'; r.numero = cotiz ? cotiz[1] : '' }
  if (r.tipo !== 'cotizacion' && cotiz) r.cotizacionRef = cotiz[1]
  const cli = t.match(/(?:cliente|raz[oó]n\s+social|se[ñn]or(?:es)?)\s*:?\s*([^\n]{3,80})/i)
  if (cli) r.cliente = cli[1].replace(/\s+(rif|c\.?i\.?|fecha|tel[eé]fono)\b.*$/i, '').trim()
  if (!r.numero) {
    const n = nombreArchivo.match(/(\d{4,})/)
    if (n) r.numero = n[1]
  }
  return r
}

// Imprime todas las páginas del PDF usando el diálogo del sistema (en Android aparece la impresora wifi)
export async function imprimirPdf(fuente) {
  const doc = await abrirPdf(fuente)
  const zona = document.getElementById('zona-impresion')
  zona.innerHTML = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i)
    const vista = pagina.getViewport({ scale: 2 })
    const lienzo = document.createElement('canvas')
    lienzo.width = vista.width
    lienzo.height = vista.height
    await pagina.render({ canvasContext: lienzo.getContext('2d'), viewport: vista }).promise
    const img = document.createElement('img')
    img.src = lienzo.toDataURL('image/png')
    zona.appendChild(img)
  }
  await new Promise((r) => setTimeout(r, 300))
  window.print()
}
