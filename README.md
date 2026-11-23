# Finanzas-ui

Aplicación web de finanzas personales construida con React 18, Vite 5, Tailwind CSS y funciones de servidor de Vercel.

## Estado actual

- Supabase/PostgreSQL es el almacenamiento principal de la aplicación.
- La autenticación se realiza con Supabase Auth (correo y contraseña).
- Las API de la aplicación validan el JWT del usuario y consultan PostgreSQL con políticas RLS.
- Notion se conserva como fuente histórica temporal para preparar una importación controlada; las páginas originales no se modifican.
- La integración de Vercel se mantiene separada de otros proyectos. Las variables de Supabase se configuran por separado para Preview y Production; las variables VITE_* deben estar presentes en el entorno que se despliega.
- No se importan saldos bancarios ni movimientos de conversaciones sin conciliación. No hay datos financieros personales sembrados en la base nueva.

## Seguridad y fiabilidad

- Las claves usadas en el navegador son únicamente la publishable key de Supabase. Nunca se utiliza la service_role ni una secret key en el frontend.
- Todas las tablas financieras expuestas tienen RLS y políticas de propiedad por auth.uid().
- Cada API protegida exige un token Bearer válido antes de leer o modificar datos.
- Los balances bancarios se calculan a partir de movimientos publicados; compromisos, cuotas futuras, reservas y deudas por cobrar permanecen separados.
- Las importaciones deben preservar el ID de origen y ser idempotentes para evitar duplicados.
- Un error de conexión no se sustituye por datos ficticios.

## Desarrollo

Ejecuta `npm install` y crea `.env.local` a partir de `.env.example` con las credenciales públicas del proyecto Supabase de Preview. No subas `.env.local` al repositorio.

Arranque local:
1. En la carpeta raíz del proyecto ejecuta `npm run dev`.
2. Mantén abierta esa terminal mientras pruebas la web.
3. Abre `http://localhost:5173/` en el mismo ordenador.
4. Para detener el servidor, pulsa `Ctrl+C` en esa terminal.

Vite queda fijado al puerto 5173 (`strictPort`): si el puerto está ocupado, el comando muestra el error en vez de arrancar silenciosamente en otro puerto. Para abrir la web desde un móvil conectado a la misma Wi-Fi, utiliza la IP LAN del ordenador y el puerto 5173; `localhost` en el móvil apunta al propio móvil, no al ordenador.

Si Google OAuth termina en `localhost:5173` y el servidor local no está activo, aparecerá `ERR_CONNECTION_REFUSED`. En ese caso inicia el servidor o vuelve a abrir la dirección Preview. Para permitir OAuth local, añade `http://localhost:5173/**` a la lista de Redirect URLs del proyecto Supabase de Preview. No cambies el callback OAuth autorizado en Google: debe seguir siendo el callback HTTPS de Supabase.

Después valida con `npm test` y `npm run build`.

## Variables de entorno

Cliente web:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Funciones de servidor:
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY

La publishable key está diseñada para clientes públicos; el acceso real a cada fila lo restringen Auth y RLS. Nunca añadas service_role o una secret key a variables con prefijo VITE_.

## Recordatorios automáticos

- La migración `20261117015500_create_notification_system.sql` crea las preferencias de recordatorios, las suscripciones push por dispositivo y el historial de avisos.
- La Edge Function `send-reminders` consulta los pagos fijos activos con `notification_enabled = true` y las cuotas que siguen en estado `scheduled` dentro de planes activos.
- `pg_cron` ejecuta el comprobador cada hora. El envío se realiza a la hora local configurada, por defecto 09:00 en `Europe/Madrid`.
- La clave pública VAPID se expone al navegador únicamente mediante `VITE_WEB_PUSH_PUBLIC_KEY`. La clave privada VAPID y el secreto del cron se guardan en `private.push_service_config`, nunca en variables `VITE_*` ni en el repositorio.
- El navegador registra `public/sw.js` solo después de que el usuario pulse Activar y conceda permiso. En Android se recomienda abrir Finanzas en Chrome y añadirla a la pantalla de inicio.
- El historial es idempotente mediante `notifications.user_id + reminder_key`; un aviso no se crea dos veces para el mismo vencimiento. Las cuotas pagadas/canceladas, los planes inactivos y los pagos fijos pausados/cancelados no generan avisos.

Configuración de Vercel:
- Preview: `VITE_WEB_PUSH_PUBLIC_KEY` (clave pública).
- Production: la misma variable pública, después de validar Preview.
- Nunca configurar ni publicar `VAPID_PRIVATE_KEY`, `CRON_SECRET` o una clave Supabase secreta en el frontend.

La migración y la Edge Function deben validarse primero en una base aislada. No ejecutar esta migración contra la base de datos financiera de producción como prueba.

## Datos históricos de Notion

Las bases originales de Notion se mantienen intactas. La importación debe hacerse con el usuario autenticado y debe guardar el ID original de cada registro en external_source y external_reference. Los saldos de la página resumen de Notion son una instantánea histórica y no deben tratarse como saldo bancario actual.

## Arquitectura de destino

- accounts y transactions: cuentas, ingresos, gastos y transferencias.
- fixed_payments: compromisos recurrentes.
- installment_plans e installments: financiación y estado de cada cuota.
- debts: importes por cobrar o pagar, separados de la liquidez.
- reservations: dinero reservado sin alterar el saldo bancario.
- budgets y monthly_closings: planificación y cierres mensuales.

La rama feat/finance-core-hardening no se integra a main ni se promociona a producción hasta verificar Auth, build, pruebas y la importación.
