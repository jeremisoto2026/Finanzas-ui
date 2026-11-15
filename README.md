# Finanzas-ui

Aplicación web de finanzas personales construida con React 18, Vite 5, Tailwind CSS y funciones de servidor de Vercel.

## Estado actual

La aplicación conserva Notion como almacenamiento heredado durante la transición. No se considera sustituido hasta completar y conciliar la migración a PostgreSQL. La rama `main` no recibe estos cambios hasta pasar la revisión y las pruebas.

## Reglas de fiabilidad

- Si una API no puede recuperar datos reales, la interfaz debe mostrar un error y no sustituirlos por cifras de ejemplo.
- Ingresos y gastos usan la fecha explícita del movimiento; `created_time` solo sirve como compatibilidad para registros históricos sin fecha.
- Las consultas de Notion recorren todas las páginas mediante `has_more` y `next_cursor`.
- Los pagos fijos programados son compromisos previstos; no equivalen por sí solos a movimientos bancarios pagados.
- Las cuotas solo se consideran pagadas cuando el historial marca explícitamente `pagada: true`.
- Saldos bancarios, reservas y cantidades que terceros deben devolver son conceptos distintos.

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

## Arquitectura de destino

Supabase/PostgreSQL será el libro principal de movimientos, cuentas, reservas, deudas, presupuestos, cuotas e importaciones. Notion puede seguir usándose para documentación, notas y seguimiento. La migración de datos exige conciliación antes de cambiar el origen de verdad.

## Variables heredadas de Notion

Las credenciales deben configurarse únicamente en entornos del servidor (Vercel), nunca en el código de navegador ni en Git: `NOTION_TOKEN`, `NOTION_INCOME_DB`, `NOTION_EXPENSES_DB`, `NOTION_PAGOS_FIJOS_DATABASE_ID` y `NOTION_COMPRAS_CUOTAS_DATABASE_ID`.
