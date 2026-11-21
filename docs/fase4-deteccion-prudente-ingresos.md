# Fase 4 — Detección prudente de ingresos

## Integración incorporada en Preview

- Clasificador Android para señales de nómina, abono, reembolso y transferencias entrantes.
- Separación entre compras y candidatos de ingreso en almacenamiento cifrado local.
- Dedupe local y huella idempotente en sincronización autenticada.
- La sincronización envía únicamente importe (si es inequívoco), fecha, app de origen y motivo de revisión. Nunca envía el cuerpo original de la notificación.
- Bandeja remota separada `notification_income_candidates`, con RLS por usuario.
- Pantalla de revisión de ingresos separada de compras, con selección de cuenta y categoría de tipo `income` / `both`.
- Confirmación manual crea una transacción `income` idempotente; descartar solo cambia el estado del candidato.
- Importe ausente o ambiguo: no se permite registrar el candidato.
- Las transferencias entre cuentas propias se excluyen también del parser de gastos.
- La función `notification-capture-sync` está desplegada en Supabase Preview (versión 8).

## Reglas de prudencia

1. Nómina/abono explícito con importe único: candidato de alta confianza, siempre pendiente de confirmación.
2. Transferencia recibida genérica: revisión manual.
3. Transferencia entre cuentas propias: ignorar como ingreso y como gasto.
4. Varios importes o importe ausente: revisión sin cantidad inferida; no se puede contabilizar.
5. Saldo, límite, OTP, publicidad, aviso informativo u operación fallida: ignorar.
6. Los ingresos nunca se contabilizan automáticamente en esta fase.

## Verificación pendiente antes de dar la fase por terminada

- CI web y Android sobre el último commit de la rama.
- Revisar APK Preview generada y probarla en POCO F8 Pro.
- Pruebas reales controladas: nómina/abono, transferencia entrante ambigua, transferencia propia, duplicado, aviso de saldo y operación fallida.
- Confirmar bandeja de revisión, registro manual idempotente, descarte y persistencia de saldos.
- No crear transacciones de prueba ni alterar datos reales para probar. Usar solo un flujo controlado y autorizado.

## Seguridad / entorno

- Rama aislada: `feat/fase4-deteccion-prudente-ingresos`.
- PR draft #5 hacia `feat/finanzas-cuentas-dinamicas-edicion`.
- Migración aplicada solo a Supabase Preview `brkckgaicoqkqdcwwftm`.
- Función Edge desplegada solo en Supabase Preview.
- Production y sus datos permanecen intactos.
