# BIPA Despacho

App para sacar de papel el recorrido de un pedido: Comercial sube la cotización, planta la revisa en el depósito desde la tablet, Comercial factura y planta imprime la nota de entrega y despacha.

- **Comercial (Francis):** arrastra los PDF; ve en tiempo real qué está revisando planta, qué tiene novedad y qué falta por facturar.
- **Planta (operario):** ve el PDF, toca «Todo disponible» o «Hay novedad», imprime la nota de entrega en la impresora wifi de planta y marca el pedido como despachado. Las facturas fiscales las imprime Comercial; planta recibe el aviso para buscarlas.
- **Ingreso:** cada persona toca su nombre y escribe un PIN de 6 números. No hace falta correo.
- **Limpieza:** los PDF se borran solos 15 días después del despacho; el historial (tiempos, novedades, respuestas) se conserva y se descarga en Excel.

## Cómo funciona por dentro

- Página web instalable (React + Vite) publicada en GitHub Pages con cada cambio en `main`.
- Supabase guarda los pedidos, los PDF (carpeta privada) y avisa los cambios en tiempo real.
- `supabase/esquema.sql`: tablas, permisos y las funciones que validan cada paso.
- `supabase/functions/usuarios`: alta de personas, cambio de PIN y desactivar (solo administración).
- Sin datos de Supabase (o con `?prueba` en la dirección) la app abre en **modo de prueba** con ejemplos guardados solo en ese equipo. PIN de prueba: 123456.

## Configuración

`.env.production` lleva la dirección del proyecto de Supabase y su llave pública (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). La llave pública es segura de publicar: los permisos reales están en la base de datos.
