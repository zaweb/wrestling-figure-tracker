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
