// Helpers shared by the Watchlist, Collection and Add Figure screens.

export const CONDITIONS = [
  { id: 'ALL', label: 'All' },
  { id: '1000', label: 'New' },
  { id: '1500', label: 'New other' },
  { id: '3000', label: 'Used' },
  { id: '4000', label: 'Very Good' },
  { id: '5000', label: 'Good' },
  { id: '6000', label: 'Acceptable' },
]

export function conditionLabel(id) {
  return CONDITIONS.find((condition) => condition.id === id)?.label || 'All'
}

export function money(value, currency = 'USD') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Number(value))
}

export async function readJson(response) {
  if (response.status === 204) return {}
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return data
}

export async function sendJson(url, method, body) {
  return readJson(
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

export const BRANDS = ['', 'Mattel', 'Jazwares', 'Hasbro', 'LJN']

export function brandLabel(brand) {
  return brand || 'Any'
}

// Whole dollars for big display numbers.
export function wholeMoney(value, currency = 'USD') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    Math.round(Number(value)),
  )
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// Dates the server stores as UTC midnight read best in UTC so they don't slip a day.
export function shortDate(value, withYear = false) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

export function sortedSnapshots(figure) {
  return [...(figure?.snapshots || [])].sort((a, b) => new Date(a.date) - new Date(b.date))
}

export function latestSnapshot(figure) {
  return sortedSnapshots(figure).at(-1) || null
}

// Median price movement over the last `days`, from a figure's snapshots.
export function priceMove(snapshots, days = 30) {
  const priced = snapshots.filter((s) => s.medianPrice > 0)
  if (priced.length === 0) return null
  const last = priced.at(-1)
  const cutoff = new Date(last.date).getTime() - days * 86400000
  const first = priced.find((s) => new Date(s.date).getTime() >= cutoff) || priced[0]
  const change = last.medianPrice - first.medianPrice
  const percent = first.medianPrice ? (change / first.medianPrice) * 100 : 0
  return { first, last, change, percent, points: priced.slice(-14).map((s) => s.medianPrice) }
}

export function direction(value) {
  if (value == null || Math.abs(value) < 0.05) return 'flat'
  return value > 0 ? 'up' : 'down'
}

export function signedPercent(percent) {
  const dir = direction(percent)
  const arrow = dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : ''
  return `${arrow}${Math.abs(percent).toFixed(1)}%`
}

export function signedMoney(value) {
  const dir = direction(value)
  const arrow = dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : ''
  return `${arrow}${money(Math.abs(value))}`
}

export function ebaySearchUrl(keywords, condition) {
  const params = new URLSearchParams({ _nkw: keywords || '', _sacat: '246', LH_BIN: '1' })
  if (condition && condition !== 'ALL') params.set('LH_ItemCondition', condition)
  return `https://www.ebay.com/sch/i.html?${params}`
}

export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Theme: 'system' follows the device; 'light' and 'dark' are stored.
const THEME_COLORS = { light: '#F6F1E8', dark: '#141210' }

export function storedThemeMode() {
  try {
    const stored = localStorage.getItem('theme')
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(mode) {
  try {
    if (mode === 'system') localStorage.removeItem('theme')
    else localStorage.setItem('theme', mode)
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  const theme = resolveTheme(mode)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

// Search defaults chosen on the Account tab. Kept in this browser only.
export function searchDefaults() {
  try {
    const saved = JSON.parse(localStorage.getItem('searchDefaults') || '{}')
    return { brand: saved.brand ?? 'Mattel', condition: saved.condition || 'ALL' }
  } catch {
    return { brand: 'Mattel', condition: 'ALL' }
  }
}

export function saveSearchDefaults(defaults) {
  try {
    localStorage.setItem('searchDefaults', JSON.stringify(defaults))
  } catch {
    // Ignore storage errors.
  }
}
