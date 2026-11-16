# Finanzas-ui

Aplicación web de finanzas personales construida con React 18, Vite 5, Tailwind CSS y funciones de servidor de Vercel.

## Estado actual

- Supabase/PostgreSQL es el almacenamiento principal de la aplicación.
- La autenticación se realiza con Supabase Auth (correo y contraseña).
- Las API de la aplicación validan el JWT del usuario y consultan PostgreSQL con políticas RLS.
- Notion se conserva como fuente histórica temporal para preparar una importación controlada; las páginas originales no se modifican.
- La integración de Vercel se mantiene separada de otros proyectos. Las variables de Supabase de esta rama están limitadas a Preview para feat/finance-core-hardening.
- No se importan saldos bancarios ni movimientos de conversaciones sin conciliación. No hay datos financieros personales sembrados en la base nueva.

## Seguridad y fiabilidad

- Las claves usadas en el navegador son únicamente la publishable key de Supabase. Nunca se utiliza la service_role ni una secret key en el frontend.
- Todas las tablas financieras expuestas tienen RLS y políticas de propiedad por auth.uid().
- Cada API protegida exige un token Bearer válido antes de leer o modificar datos.
- Los balances bancarios se calculan a partir de movimientos publicados; compromisos, cuotas futuras, reservas y deudas por cobrar permanecen separados.
- Las importaciones deben preservar el ID de origen y ser idempotentes para evitar duplicados.
- Un error de conexión no se sustituye por datos ficticios.

## Desarrollo

Ejecuta npm install, npm run dev, npm test y npm run build.

Crea un archivo .env.local a partir de .env.example para desarrollo local. No subas .env.local al repositorio.

## Variables de entorno

Cliente web:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Funciones de servidor:
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY

La publishable key está diseñada para clientes públicos; el acceso real a cada fila lo restringen Auth y RLS. Nunca añadas service_role o una secret key a variables con prefijo VITE_.

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
