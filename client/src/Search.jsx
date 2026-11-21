import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, CloseIcon, EyeIcon, FigureSilhouette, SearchIcon } from './icons.jsx'
import { Chips, Spinner } from './ui.jsx'
import { BRANDS, CONDITIONS, brandLabel, conditionLabel, median, money, readJson, searchDefaults, sendJson, wholeMoney } from './shared.js'

const BRAND_OPTIONS = BRANDS.map((brand) => ({ value: brand, label: brandLabel(brand) }))

function keywordsFor(query, brand) {
  return brand ? `${brand} ${query}` : query
}

export default function Search({ tracked, go, notify, reloadTracked, initialQuery, initialBrand, initialCondition }) {
  const defaults = searchDefaults()
  const [query, setQuery] = useState(initialQuery)
  const [brand, setBrand] = useState(initialBrand ?? defaults.brand)
  const [condition, setCondition] = useState(initialCondition || defaults.condition)
  const [searched, setSearched] = useState(null) // { query, brand, condition }
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [watching, setWatching] = useState(false)
  const inputRef = useRef(null)

  async function run(next = { query, brand, condition }) {
    const q = next.query.trim()
    if (!q) return
    setBusy(true)
    setError('')
    const params = new URLSearchParams({ query: q, condition: next.condition })
    if (next.brand) params.set('brand', next.brand)
    try {
      const data = await readJson(await fetch(`/api/figures/search?${params}`))
      setResults(data.figures || [])
      setTotal(data.total ?? 0)
      setSearched({ ...next, query: q })
    } catch (err) {
      setResults([])
      setTotal(0)
      setSearched(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // A search handed over from a figure's page runs straight away.
  useEffect(() => {
    if (initialQuery) run({ query: initialQuery, brand, condition })
    else inputRef.current?.focus()
    // Run once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeBrand(next) {
    setBrand(next)
    if (searched) run({ query, brand: next, condition })
  }

  function changeCondition(next) {
    setCondition(next)
    if (searched) run({ query, brand, condition: next })
  }

  const keywords = searched ? keywordsFor(searched.query, searched.brand) : ''
  const existing = searched
    ? (tracked || []).find((figure) => figure.searchKeywords === keywords && figure.condition === searched.condition)
    : null

  async function watch() {
    setWatching(true)
    setError('')
    try {
      const created = await sendJson('/api/tracked-figures', 'POST', {
        name: searched.query,
        brand: searched.brand,
        searchKeywords: keywords,
        condition: searched.condition,
      })
      await reloadTracked()
      notify(`Watching ${searched.query}. Prices are checked every night.`)
      go(`#/figure/${created._id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setWatching(false)
    }
  }

  const priced = results.filter((item) => item.price > 0).sort((a, b) => a.price - b.price)
  const unpriced = results.filter((item) => !(item.price > 0))
  const listings = [...priced, ...unpriced]
  const prices = priced.map((item) => item.price)
  const currency = priced[0]?.currency || 'USD'

  return (
    <main className="screen">
      <header className="screen-head">
        <h1 className="poster">Search</h1>
        <form
          className="search-field"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            inputRef.current?.blur()
            run()
          }}
        >
          <SearchIcon size={20} />
          <label className="sr-only" htmlFor="search-input">
            Figure name
          </label>
          <input
            id="search-input"
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            placeholder="Search a wrestler or figure"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
            >
              <CloseIcon size={14} />
            </button>
          )}
          <button type="submit" className="go" disabled={busy || !query.trim()}>
            {busy ? <Spinner /> : 'Search'}
          </button>
        </form>
        <div className="chip-scroll">
          <Chips label="Brand" options={BRAND_OPTIONS} value={brand} onChange={changeBrand} />
        </div>
        <label className="chip select-chip">
          <span>Condition: {conditionLabel(condition)}</span>
          <ChevronDownIcon size={14} />
          <select aria-label="Condition" value={condition} onChange={(event) => changeCondition(event.target.value)}>
            {CONDITIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && <p className="error pad">{error}</p>}

      {!searched && !busy && !error && (
        <div className="empty-card">
          <strong>Find a figure on eBay</strong>
          <p>Type a wrestler's name. Adding the line helps, like “Cody Rhodes Elite 108”. Results are live fixed-price listings.</p>
        </div>
      )}

      {searched && (
        <section className="summary-card" aria-label="Search summary">
          <div className="summary-top">
            <div>
              <span className="summary-sub">
                {total > results.length ? `${results.length} of ${total} listings` : `${total} listings`} for “{keywords}”
              </span>
              <span className="summary-range">
                {prices.length ? `${wholeMoney(Math.min(...prices), currency)} – ${wholeMoney(Math.max(...prices), currency)}` : 'No prices'}
              </span>
            </div>
            {prices.length > 0 && (
              <span className="summary-median">
                Median <strong>{money(median(prices), currency)}</strong>
              </span>
            )}
          </div>
          {existing ? (
            <a className="watch-btn done" href={`#/figure/${existing._id}`}>
              <EyeIcon size={20} />
              On your Watchlist · see prices
            </a>
          ) : (
            <button type="button" className="watch-btn" onClick={watch} disabled={watching}>
              {watching ? <Spinner /> : <EyeIcon size={20} />}
              {watching ? 'Saving and checking prices…' : 'Watch this search · daily price checks'}
            </button>
          )}
        </section>
      )}

      {searched && listings.length > 0 && (
        <>
          <div className="section-head">
            <span>Listings</span>
            <span className="muted">Lowest price first</span>
          </div>
          <ul className="listing-grid">
            {listings.map((item) => (
              <li key={item.id}>
                <a href={item.itemUrl} target="_blank" rel="noreferrer" className="listing-card">
                  <span className="listing-img">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <FigureSilhouette size={56} />}
                  </span>
                  <span className="listing-body">
                    <span className="listing-price">{item.price > 0 ? money(item.price, item.currency || 'USD') : '—'}</span>
                    <span className="listing-title">{item.title}</span>
                    {item.condition && <span className="listing-cond">{item.condition}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {searched && listings.length === 0 && <p className="empty-line">No listings found. Try fewer words or another brand.</p>}
    </main>
  )
}
