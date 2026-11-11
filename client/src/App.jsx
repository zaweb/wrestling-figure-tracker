import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import Appraise from './Appraise.jsx'

const BRANDS = ['', 'Mattel', 'Jazwares', 'Hasbro', 'LJN']

const CONDITIONS = [
  { id: 'ALL', label: 'All' },
  { id: '1000', label: 'New' },
  { id: '1500', label: 'New other' },
  { id: '3000', label: 'Used' },
  { id: '4000', label: 'Very Good' },
  { id: '5000', label: 'Good' },
  { id: '6000', label: 'Acceptable' },
]

function conditionLabel(id) {
  return CONDITIONS.find((condition) => condition.id === id)?.label || 'All'
}

function money(value, currency = 'USD') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Number(value))
}

function searchKeywordsFor(query, brand) {
  return brand ? `${brand} ${query}` : query
}

function latestSnapshot(figure) {
  if (!figure.snapshots?.length) return null
  return [...figure.snapshots].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  ).at(-1)
}

const THEME_COLORS = { light: '#f4efe6', dark: '#1c1917' }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLORS[theme])
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return data
}

export default function App() {
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('Mattel')
  const [condition, setCondition] = useState('ALL')
  const [figures, setFigures] = useState([])
  const [total, setTotal] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [tracked, setTracked] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [trends, setTrends] = useState(null)
  const [trendError, setTrendError] = useState('')
  const [trackError, setTrackError] = useState('')
  const [tracking, setTracking] = useState(false)
  const [listError, setListError] = useState('')
  const [theme, setTheme] = useState(
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  )

  useEffect(() => {
    if (localStorage.getItem('theme')) return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (localStorage.getItem('theme')) return
      const next = media.matches ? 'dark' : 'light'
      applyTheme(next)
      setTheme(next)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  function onToggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    applyTheme(next)
    setTheme(next)
  }
  const [showCollection, setShowCollection] = useState(false)
  const [showAppraise, setShowAppraise] = useState(false)
  const [access, setAccess] = useState('checking')
  const [account, setAccount] = useState(null)
  const [authMode, setAuthMode] = useState('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  async function confirmAccess() {
    try {
      const response = await fetch('/api/auth/me')
      if (!response.ok) {
        setAccount(null)
        setAccess('locked')
        return
      }
      setAccount(await response.json())
      setAccess('ready')
    } catch {
      setAccount(null)
      setAccess('locked')
    }
  }

  async function onAuth(event) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    const path = authMode === 'create' ? '/api/auth/register' : '/api/auth/login'
    try {
      await readJson(await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      }))
      setAuthPassword('')
      await confirmAccess()
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAccount(null)
    setTracked([])
    setSelectedId(null)
    setFigures([])
    setAccess('locked')
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth') === 'failed') {
      setAuthError('Google sign-in did not finish. Try again.')
    }
    confirmAccess()
  }, [])

  useEffect(() => {
    if (access !== 'ready') return
    loadTracked()
  }, [access])

  useEffect(() => {
    if (!selectedId) {
      setTrends(null)
      return
    }

    let cancelled = false
    setTrendError('')
    fetch(`/api/tracked-figures/${selectedId}/trends`)
      .then((response) => readJson(response))
      .then((data) => {
        if (!cancelled) setTrends(data)
      })
      .catch((error) => {
        if (!cancelled) setTrendError(error.message)
      })

    return () => {
      cancelled = true
    }
  }, [selectedId])

  async function loadTracked(selectId) {
    try {
      const data = await readJson(await fetch('/api/tracked-figures'))
      setTracked(data)
      setListError('')
      setSelectedId((current) => selectId || current || data[0]?._id || null)
    } catch (error) {
      setListError(error.message)
    }
  }

  async function onSearch(event) {
    event.preventDefault()
    setSearching(true)
    setSearchError('')
    const params = new URLSearchParams({ query: query.trim(), condition })
    if (brand) params.set('brand', brand)

    try {
      const data = await readJson(await fetch(`/api/figures/search?${params}`))
      setFigures(data.figures || [])
      setTotal(data.total ?? 0)
    } catch (error) {
      setFigures([])
      setTotal(null)
      setSearchError(error.message)
    } finally {
      setSearching(false)
    }
  }

  async function onTrack() {
    setTracking(true)
    setTrackError('')
    const keywords = searchKeywordsFor(query.trim(), brand)

    try {
      const created = await readJson(
        await fetch('/api/tracked-figures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: query.trim(),
            brand,
            searchKeywords: keywords,
            condition,
          }),
        }),
      )
      await loadTracked(created._id)
    } catch (error) {
      setTrackError(error.message)
    } finally {
      setTracking(false)
    }
  }

  const selected = tracked.find((figure) => figure._id === selectedId) || null
  const snapshot = selected ? latestSnapshot(selected) : null
  const pricedResults = figures.filter((figure) => figure.price > 0)
  const cheapest = pricedResults.length
    ? Math.min(...pricedResults.map((figure) => figure.price))
    : null
  const mostExpensive = pricedResults.length
    ? Math.max(...pricedResults.map((figure) => figure.price))
    : null
  const resultCurrency = pricedResults[0]?.currency || 'USD'

  if (access !== 'ready') {
    return (
      <main className="page">
        <section className="panel">
          <h2>{access === 'checking' ? 'Checking sign-in…' : 'Sign in required'}</h2>
          {access === 'locked' && (
            <>
              <p className="empty">Sign in to see your figures.</p>
              <form className="search-form" onSubmit={onAuth}>
                <label className="grow">
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={authMode === 'create' ? 'new-password' : 'current-password'}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                </label>
                <button type="submit" disabled={authBusy}>
                  {authBusy ? 'Working…' : authMode === 'create' ? 'Create account' : 'Sign in'}
                </button>
              </form>
              <div className="track-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setAuthMode((mode) => (mode === 'create' ? 'signin' : 'create'))
                    setAuthError('')
                  }}
                >
                  {authMode === 'create' ? 'I already have an account' : 'Create an account'}
                </button>
                <a className="google-signin" href="/api/auth/google">
                  <svg viewBox="0 0 18 18" aria-hidden="true">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                  </svg>
                  Sign in with Google
                </a>
              </div>
              {authError && <p className="message">{authError}</p>}
            </>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>Wrestling Figure Tracker</h1>
          <p>Search current eBay listings, then save a search to watch its prices.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={showAppraise ? 'selected' : ''}
            onClick={() => setShowAppraise((open) => !open)}
          >
            Add Figure
          </button>
          <button
            type="button"
            className={showCollection ? 'secondary selected' : 'secondary'}
            onClick={() => setShowCollection((open) => !open)}
          >
            Collection
          </button>
          <button type="button" className="secondary" onClick={onToggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          {account?.email && <span className="account-email">{account.email}</span>}
          <button type="button" className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {showAppraise && (
        <Appraise onClose={() => setShowAppraise(false)} onTracked={(id) => loadTracked(id)} />
      )}

      {showCollection && (
        <section className="panel">
          <h2>Collection</h2>
          <p className="empty">Pictures you save will be kept with your account.</p>
        </section>
      )}

      <section className="panel">
        <h2>Search</h2>
        <form className="search-form" onSubmit={onSearch}>
          <label className="grow">
            Figure
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cody Rhodes"
            />
          </label>
          <label>
            Brand
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              {BRANDS.map((option) => (
                <option key={option || 'any'} value={option}>
                  {option || 'Any'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select value={condition} onChange={(event) => setCondition(event.target.value)}>
              {CONDITIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        <div className="track-row">
          <button
            type="button"
            className="secondary"
            onClick={onTrack}
            disabled={tracking || !query.trim()}
          >
            {tracking ? 'Saving…' : 'Track this search'}
          </button>
        </div>
        {searchError && <p className="message">{searchError}</p>}
        {trackError && <p className="message">{trackError}</p>}
        {total != null && !searchError && (
          <p className="meta">
            {`Showing ${figures.length} of ${total} listings${
              query.trim() ? ` for “${searchKeywordsFor(query.trim(), brand)}”` : ''
            }.`}
          </p>
        )}
        {cheapest != null && (
          <dl className="stats">
            <div>
              <dt>Cheapest</dt>
              <dd>{money(cheapest, resultCurrency)}</dd>
            </div>
            <div>
              <dt>Most expensive</dt>
              <dd>{money(mostExpensive, resultCurrency)}</dd>
            </div>
          </dl>
        )}
        {figures.length > 0 && (
          <ul className="cards">
            {figures.map((figure) => (
              <li className="card" key={figure.id}>
                {figure.imageUrl ? (
                  <img src={figure.imageUrl} alt="" />
                ) : (
                  <div className="placeholder">No image</div>
                )}
                <h3>{figure.title}</h3>
                <p className="price">{money(figure.price, figure.currency || 'USD')}</p>
                {figure.condition && <p className="condition">{figure.condition}</p>}
                {figure.itemUrl && (
                  <a href={figure.itemUrl} target="_blank" rel="noreferrer">
                    View on eBay
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Watchlist</h2>
        {listError && <p className="message">{listError}</p>}
        {tracked.length === 0 && !listError ? (
          <p className="empty">No tracked figures yet. Search for one and save it.</p>
        ) : (
          <div className="watch-layout">
            <ul className="watch-list">
              {tracked.map((figure) => {
                const latest = latestSnapshot(figure)
                return (
                  <li key={figure._id}>
                    <button
                      type="button"
                      className={figure._id === selectedId ? 'selected' : ''}
                      onClick={() => setSelectedId(figure._id)}
                    >
                      <strong>{figure.name}</strong>
                      <span>
                        {figure.brand || 'Any brand'}
                        {latest
                          ? ` · avg ${money(latest.avgPrice)}`
                          : ' · no prices yet'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div>
              {!selected && <p className="empty">Select a figure to see its prices.</p>}
              {selected && (
                <>
                  <h3>
                    {selected.name}
                    {selected.brand ? ` · ${selected.brand}` : ''}
                  </h3>
                  <p className="meta">
                    Search: {selected.searchKeywords} · {conditionLabel(selected.condition)}
                  </p>
                  {snapshot ? (
                    <dl className="stats">
                      <div>
                        <dt>Listings</dt>
                        <dd>{snapshot.listingCount}</dd>
                      </div>
                      <div>
                        <dt>Min</dt>
                        <dd>{money(snapshot.minPrice)}</dd>
                      </div>
                      <div>
                        <dt>Median</dt>
                        <dd>{money(snapshot.medianPrice)}</dd>
                      </div>
                      <div>
                        <dt>Average</dt>
                        <dd>{money(snapshot.avgPrice)}</dd>
                      </div>
                      <div>
                        <dt>Max</dt>
                        <dd>{money(snapshot.maxPrice)}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="empty">No priced listings were found for this search.</p>
                  )}
                  {trendError && <p className="message">{trendError}</p>}
                  {trends?.history?.length > 0 && (
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trends.history}>
                          <CartesianGrid stroke="var(--chart-grid)" />
                          <XAxis dataKey="date" stroke="var(--muted)" tick={{ fill: 'var(--muted)' }} />
                          <YAxis stroke="var(--muted)" tick={{ fill: 'var(--muted)' }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ color: 'var(--text)' }} />
                          <Line
                            type="monotone"
                            dataKey="minPrice"
                            name="Min"
                            stroke="var(--chart-min)"
                            dot
                          />
                          <Line
                            type="monotone"
                            dataKey="medianPrice"
                            name="Median"
                            stroke="var(--chart-median)"
                            dot
                          />
                          <Line
                            type="monotone"
                            dataKey="avgPrice"
                            name="Average"
                            stroke="var(--chart-avg)"
                            dot
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
