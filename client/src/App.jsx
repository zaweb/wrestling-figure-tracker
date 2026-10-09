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

  useEffect(() => {
    loadTracked()
  }, [])

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

  return (
    <main className="page">
      <header className="header">
        <h1>Wrestling Figure Tracker</h1>
        <p>Search current eBay listings, then save a search to watch its prices.</p>
      </header>

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
                          <CartesianGrid stroke="#e7e0d4" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="minPrice"
                            name="Min"
                            stroke="#1d4e89"
                            dot
                          />
                          <Line
                            type="monotone"
                            dataKey="medianPrice"
                            name="Median"
                            stroke="#c2410c"
                            dot
                          />
                          <Line
                            type="monotone"
                            dataKey="avgPrice"
                            name="Average"
                            stroke="#166534"
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
