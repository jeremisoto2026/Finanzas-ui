const READ_ONLY_DASHBOARD_ROUTES = Object.freeze({
  '/api/cuentas': 'accounts',
  '/api/gastos': 'expenses',
  '/api/ingresos': 'incomes',
  '/api/presupuestos': 'budgets',
  '/api/compras-cuotas': 'installmentPlans',
  '/api/pagos-fijos': 'fixedPayments',
  '/api/deudas': 'debts',
  '/api/compromisos': 'replenishments',
})

export function getReadOnlyFinanceResource(pathname, search = '') {
  if (pathname === '/api/gastos') {
    const query = new URLSearchParams(String(search || '').replace(/^\?/, ''))
    if (query.get('resource') === 'categories') return 'expenseCategories'
  }

  return READ_ONLY_DASHBOARD_ROUTES[pathname] || null
}


export function getAndroidCreateKind(pathname) {
  if (pathname === '/api/gastos') return 'expense'
  if (pathname === '/api/ingresos') return 'income'
  return null
}
