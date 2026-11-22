# Fase 5 — Alertas inteligentes

Auditoría inicial: la infraestructura de avisos ya existe en Preview (preferencias, historial, suscripciones push, worker horario y recordatorios Android de pagos fijos/cuotas). Actualmente solo se generan recordatorios previos y de mismo día para pagos fijos y cuotas.

Pendiente: umbrales de presupuesto 50/80/100 con idempotencia; avisos de cuotas vencidas; saldo libre insuficiente calculado con saldos EUR confirmados menos reservas activas y compromisos próximos sin doble descuento; resumen de próximos compromisos.

Reglas: contar únicamente gastos `posted`; excluir pendientes, anulados, ingresos y transferencias; cuotas vencidas solo si siguen `scheduled` y su fecha es anterior al día local Europe/Madrid; aislamiento estricto por `user_id`; migraciones aditivas y solo Preview.

Estado: auditoría completada; implementación e integración pendientes.