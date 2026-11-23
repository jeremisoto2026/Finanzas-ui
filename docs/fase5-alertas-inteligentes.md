# Fase 5 — Alertas inteligentes

## Auditoría

Preview ya tenía preferencias por usuario, historial de notificaciones, suscripciones Web Push, un worker horario y recordatorios Android locales para pagos fijos y cuotas. El worker de recordatorios no estaba desplegado en el proyecto Supabase Preview y el registro privado de configuración push está vacío.

## Implementado en la rama

- Motor puro de reglas para presupuestos al 50 %, 80 % y 100 %, basado únicamente en gastos `posted`, por categoría y mes.
- Claves idempotentes por presupuesto/mes/umbral.
- Detección de cuotas vencidas que siguen en estado `scheduled`.
- Resumen de compromisos próximos, ordenado por vencimiento y configurable entre 1 y 31 días.
- Comparación de saldo libre EUR con compromisos EUR sin convertir divisas. Las reservas EUR se consideran cobertura de compromisos para evitar descontarlas dos veces.
- Preferencias de activación para cada tipo de alerta en la configuración Web Push.
- Worker ampliado para generar alertas y guardar metadatos, reutilizando la tabla y el envío de notificaciones existentes.
- Migración aditiva de preferencias y tipos de notificación.

## Verificación

- CI web: los checks de Node y build Vite han pasado en commits anteriores de la rama; el último worker está pendiente de resultado.
- Migración `fase5_smart_alerts`: aplicada únicamente en Supabase Preview y verificada consultando columnas nuevas.
- Asesores Supabase: no se han encontrado avisos nuevos causados por esta migración. Persisten avisos preexistentes de `private.push_service_config` sin política RLS, `pg_net` en public y ajustes de Auth.
- No se ha desplegado el worker: falta configurar de forma segura `push_service_config` (VAPID y secreto cron) en Preview. La consulta confirmó que no existe configuración privada. No se debe afirmar que las alertas push están activas todavía.
- La ruta Android nativa usa `NativeReminderSettings`; todavía falta integrar las nuevas reglas en la programación local de Android y generar/probar una APK específica.

## Límites de despliegue

Todo el trabajo está aislado en `feat/fase5-alertas-inteligentes`. La migración solo se aplicó a Supabase Preview. Producción no se ha modificado. No se han creado movimientos ni alterado saldos reales.
