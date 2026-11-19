const normalizeLabel = (value) => String(value || '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('es-ES')

/**
 * Exact normalized account-name match for automatic linking.
 * Matching ignores case, Unicode presentation differences and repeated spaces.
 */
export function isExactAccountNameMatch(account, sourceLabel = '') {
  const accountName = normalizeLabel(account?.name)
  const appName = normalizeLabel(sourceLabel)
  return Boolean(accountName && appName && accountName === appName)
}

/**
 * Human-readable label for a registered notification source.
 * Explicit labels win; newly registered source keys get a generic label.
 */
export function getBankSourceLabel(sourceApp, labels = {}) {
  const key = String(sourceApp || '').trim()
  if (!key) return 'Banco'
  if (labels[key]) return labels[key]

  return key
    .replace(/[_-]+/g, ' ')
    .replace(/(^|[ ])[a-záéíóúñ]/gi, (part) => part.toLocaleUpperCase('es-ES'))
}

/**
 * Build a concise account option label. The selected bank app already provides
 * context, so its institution name is omitted when it would only repeat it.
 */
export function getAccountOptionLabel(account, sourceLabel = '') {
  const name = String(account?.name || '').trim()
  const institution = String(account?.institution || '').trim()
  if (!name) return institution || 'Cuenta sin nombre'
  if (!institution) return name

  const normalizedName = normalizeLabel(name)
  const normalizedInstitution = normalizeLabel(institution)
  const normalizedSource = normalizeLabel(sourceLabel)

  if (
    normalizedName === normalizedInstitution ||
    (normalizedSource && (normalizedName === normalizedSource || normalizedInstitution === normalizedSource))
  ) {
    return name
  }

  return `${name} · ${institution}`
}

/**
 * Resolve a safe default account for a bank app.
 *
 * Priority:
 * 1. Keep the account already linked to this app, provided it is active.
 * 2. Select one unique exact match by account name or institution.
 * 3. Select the only available active account.
 * 4. Otherwise require an explicit choice; never guess between accounts.
 */
export function getAccountMappingSuggestion(accounts = [], mappings = [], sourceApp = '', sourceLabel = '') {
  const availableAccounts = Array.isArray(accounts) ? accounts : []
  const availableMappings = Array.isArray(mappings) ? mappings : []

  const savedMapping = availableMappings.find((mapping) =>
    mapping?.source_app === sourceApp && mapping?.is_active !== false
  )
  const savedAccount = savedMapping
    ? availableAccounts.find((account) => account?.id === savedMapping.account_id)
    : null

  if (savedAccount) {
    return { accountId: savedAccount.id, reason: 'existing' }
  }

  const sourceKey = normalizeLabel(sourceLabel || sourceApp)
  const nameMatches = sourceKey
    ? availableAccounts.filter((account) => normalizeLabel(account?.name) === sourceKey)
    : []

  if (nameMatches.length === 1) {
    return { accountId: nameMatches[0].id, reason: 'matching', matchType: 'name' }
  }

  if (nameMatches.length > 1) {
    return { accountId: '', reason: 'ambiguous' }
  }

  const institutionMatches = sourceKey
    ? availableAccounts.filter((account) => normalizeLabel(account?.institution) === sourceKey)
    : []

  if (institutionMatches.length === 1) {
    return { accountId: institutionMatches[0].id, reason: 'matching', matchType: 'institution' }
  }

  if (institutionMatches.length > 1) {
    return { accountId: '', reason: 'ambiguous' }
  }

  if (availableAccounts.length === 1) {
    return { accountId: availableAccounts[0].id, reason: 'single' }
  }

  return {
    accountId: '',
    reason: availableAccounts.length > 1 ? 'choose' : 'empty',
  }
}
