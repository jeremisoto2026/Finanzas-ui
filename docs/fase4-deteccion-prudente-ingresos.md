# Fase 4 — Detección prudente de ingresos

## Alcance de esta primera entrega

Se incorpora un clasificador Android aislado que diferencia tres resultados:

- `AUTO_INCOME`: la notificación expresa claramente una entrada de dinero y contiene un único importe monetario. Es una candidatura de alta confianza, no una orden de contabilización por sí sola.
- `NEEDS_REVIEW`: la notificación parece describir una entrada, pero requiere confirmar origen, titularidad o importe.
- `IGNORE`: no hay señal explícita de ingreso, es un aviso informativo, una operación fallida o un traspaso entre cuentas propias.

## Reglas de prudencia

1. Una transferencia recibida genérica siempre queda pendiente de revisión.
2. Una transferencia entre cuentas propias se descarta como ingreso.
3. Una notificación con varios importes no permite extraer uno por inferencia.
4. Un aviso de saldo, límite, OTP, publicidad o una operación fallida no genera ingreso.
5. No se crea ni modifica ninguna transacción con este clasificador.
6. Los importes se convierten a céntimos y se exige un único importe inequívoco.

## Siguiente integración necesaria

Antes de activar la contabilización automática se debe integrar la clasificación en el almacenamiento local y el contrato de sincronización, añadir un tipo de evento de ingreso a la bandeja de revisión, filtrar categorías por dirección `income` y comprobar que la cuenta de destino está vinculada inequívocamente. La sincronización debe conservar idempotencia y RLS.

## Seguridad / entorno

- Trabajo aislado en `feat/fase4-deteccion-prudente-ingresos`.
- Objetivo de integración: rama Preview `feat/finanzas-cuentas-dinamicas-edicion`.
- No se aplican migraciones ni escrituras a Supabase Production.
- Esta entrega no activa todavía ingresos automáticos en usuarios reales.
