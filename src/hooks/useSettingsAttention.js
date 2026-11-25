import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ACTION_STATES = new Set(['pending', 'failed', 'incomplete', 'requires_action', 'overdue', 'pendiente', 'fallido', 'incompleto', 'requiere_accion', 'vencido'])
const STORAGE_PREFIX = 'finanzas:settings-attention-reviewed:v1:'

async function readJson(url) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) return null
  return response.json()
}

function rowsWithActionState(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const status = String(row.status || row.estado || '').toLowerCase().replace(/[á]/g, 'a')
    return ACTION_STATES.has(status)
  }).length
}

function attentionRows(rows, today, includeOverdue = false) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const status = String(row.status || row.estado || '').toLowerCase().replace(/[á]/g, 'a')
    if (ACTION_STATES.has(status)) return true
    if (!includeOverdue) return false
    const dueOn = String(row.dueOn || row.due_on || '').slice(0, 10)
    const outstanding = Number(row.outstandingAmount ?? row.outstanding_amount ?? 0)
    return dueOn && dueOn <= today && outstanding > 0 &&
      !['settled', 'written_off', 'cancelled', 'paid', 'completed'].includes(status)
  }).length
}

function readReviewed(userId) {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveReviewed(userId, values) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(values))
  } catch {
    // La app sigue funcionando aunque el almacenamiento local no esté disponible.
  }
}

export function useSettingsAttention() {
  const [counts, setCounts] = useState({})
  const [reviewedCounts, setReviewedCounts] = useState({})
  const [userId, setUserId] = useState(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
    const [authResult, captureData, incomeResult, debtRows, commitmentRows, paymentRows, installmentRows, budgetRows, rulesData] = await Promise.all([
      supabase.auth.getUser(),
      readJson('/api/gastos?resource=notification-captures').catch(() => null),
      supabase.from('notification_income_candidates').select('id', { count: 'exact', head: true }).eq('status', 'needs_review'),
      readJson('/api/deudas').catch(() => null),
      readJson('/api/compromisos').catch(() => null),
      readJson('/api/pagos-fijos').catch(() => null),
      readJson('/api/compras-cuotas').catch(() => null),
      readJson('/api/presupuestos').catch(() => null),
      readJson('/api/gastos?resource=merchant-rules').catch(() => null),
    ])

    const nextUserId = authResult?.data?.user?.id || 'local'
    const events = Array.isArray(captureData?.events) ? captureData.events : []
    const purchaseKeys = new Set(events
      .filter((event) => ['needs_review', 'paired'].includes(String(event.status || '').toLowerCase()))
      .map((event) => event.pairKey || event.pair_key || event.id)
      .filter(Boolean))
    const pendingIncome = Number(incomeResult?.count || 0)

    const rules = Array.isArray(rulesData?.rules) ? rulesData.rules : []
    const incompleteRules = rules.filter((rule) =>
      !String(rule.merchantName || rule.merchant_name || '').trim() ||
      !String(rule.category || '').trim()
    ).length

    const fixedPaymentActions = rowsWithActionState(paymentRows)
    const installmentActions = rowsWithActionState(installmentRows)
    const budgetActions = rowsWithActionState(budgetRows)

    const nextCounts = {
      'Compras pendientes': purchaseKeys.size + pendingIncome,
      Automatizaciones: incompleteRules,
      'Deudas y reposiciones': attentionRows(debtRows, today, true) + attentionRows(commitmentRows, today, true),
      'Gestión financiera': fixedPaymentActions + installmentActions + budgetActions,
    }

    setUserId((current) => current === nextUserId ? current : nextUserId)
    setReviewedCounts((current) => {
      const base = userId === nextUserId ? current : readReviewed(nextUserId)
      const adjusted = { ...base }
      let changed = userId !== nextUserId
      Object.entries(nextCounts).forEach(([page, count]) => {
        if (Number(adjusted[page] || 0) > count) {
          adjusted[page] = count
          changed = true
        }
      })
      if (changed) saveReviewed(nextUserId, adjusted)
      return adjusted
    })
    setCounts(nextCounts)
    setReady(true)
  }, [userId])

  const markViewed = useCallback((page) => {
    if (!ready || !userId || !Object.prototype.hasOwnProperty.call(counts, page)) return
    setReviewedCounts((current) => {
      const next = { ...current, [page]: Number(counts[page] || 0) }
      saveReviewed(userId, next)
      return next
    })
  }, [counts, ready, userId])

  useEffect(() => {
    let active = true
    const run = () => { if (active) void refresh() }
    run()
    window.addEventListener('focus', run)
    window.addEventListener('finanzas:attention-refresh', run)
    const onVisibility = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      window.removeEventListener('focus', run)
      window.removeEventListener('finanzas:attention-refresh', run)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  const visibleCounts = Object.fromEntries(Object.entries(counts).map(([page, count]) => [
    page,
    Math.max(0, Number(count || 0) - Number(reviewedCounts[page] || 0)),
  ]))
  const total = Object.values(visibleCounts).reduce((sum, value) => sum + Number(value || 0), 0)
  return { counts: visibleCounts, total, refresh, markViewed, ready }
}
