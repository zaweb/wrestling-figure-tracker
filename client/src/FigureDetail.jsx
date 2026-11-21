import { useEffect, useState } from 'react'
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BackIcon, ChevronIcon, FigureSilhouette } from './icons.jsx'
import { Delta, Segmented, Spinner } from './ui.jsx'
import {
  conditionLabel,
  direction,
  ebaySearchUrl,
  latestSnapshot,
  money,
  plural,
  readJson,
  sendJson,
  shortDate,
  signedMoney,
} from './shared.js'

const RANGES = [
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
  { value: 365, label: '1Y' },
  { value: 36500, label: 'All' },
]

function rangeWords(days) {
  if (days === 30) return 'in 30 days'
  if (days === 90) return 'in 90 days'
  if (days === 365) return 'in a year'
  return 'since first check'
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="chart-tip">
      <strong>{shortDate(point.date, true)}</strong>
      <span>Median {money(point.medianPrice)}</span>
      <span className="muted">
        {money(point.minPrice)} – {money(point.maxPrice)} · {plural(point.listingCount, 'listing')}
      </span>
    </div>
  )
}

function ListingRange({ snapshot }) {
  const { minPrice: lo, maxPrice: hi, medianPrice, avgPrice } = snapshot
  const span = hi - lo || 1
  const at = (value) => `${Math.min(100, Math.max(0, ((value - lo) / span) * 100))}%`
  return (
    <div className="range-bar" aria-hidden="true">
      <span className="range-mark median" style={{ left: at(medianPrice) }} />
      <span className="range-mark avg" style={{ left: at(avgPrice) }} />
    </div>
  )
}

export default function FigureDetail({ figureId, tracked, back, go, notify, onCollectionChanged }) {
  const figure = tracked?.find((item) => item._id === figureId) || null
  const [days, setDays] = useState(90)
  const [history, setHistory] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [ownedItem, setOwnedItem] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const ownedQuantity = figure?.collection?.quantity || 0

  useEffect(() => {
    let cancelled = false
    setHistoryError('')
    fetch(`/api/tracked-figures/${figureId}/trends?days=${days}`)
      .then(readJson)
      .then((data) => !cancelled && setHistory(data.history || []))
      .catch((err) => !cancelled && setHistoryError(err.message))
    return () => {
      cancelled = true
    }
  }, [figureId, days])

  // The owned copy's details (price paid) come from the Collection.
  useEffect(() => {
    if (!ownedQuantity) {
      setOwnedItem(null)
      return undefined
    }
    let cancelled = false
    fetch('/api/collection')
      .then(readJson)
      .then((data) => !cancelled && setOwnedItem(data.items.find((item) => item.figure._id === figureId) || null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [figureId, ownedQuantity])

  // A current eBay photo for the header. Best effort: the silhouette stays if it fails.
  const keywords = figure?.searchKeywords
  const condition = figure?.condition
  useEffect(() => {
    if (!keywords) return undefined
    let cancelled = false
    const params = new URLSearchParams({ query: keywords, condition: condition || 'ALL' })
    fetch(`/api/figures/search?${params}`)
      .then(readJson)
      .then((data) => {
        const withImage = (data.figures || []).find((item) => item.imageUrl)
        if (!cancelled && withImage) setPhoto(withImage.imageUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [keywords, condition])

  if (!tracked) {
    return (
      <main className="detail loading-screen">
        <Spinner />
      </main>
    )
  }

  if (!figure) {
    return (
      <main className="detail">
        <div className="empty-card">
          <strong>That figure isn't on your Watchlist</strong>
          <a className="btn primary" href="#/">
            Back to Watchlist
          </a>
        </div>
      </main>
    )
  }

  const latest = latestSnapshot(figure)
  const points = (history || []).filter((point) => point.medianPrice > 0)
  const chartData = points.map((point) => ({ ...point, band: [point.minPrice, point.maxPrice] }))
  const first = points[0]
  const last = points.at(-1)
  const change = first && last && points.length > 1 ? last.medianPrice - first.medianPrice : null
  const changePct = change != null && first.medianPrice ? (change / first.medianPrice) * 100 : null
  const sub = [figure.brand || 'Any brand', figure.series, conditionLabel(figure.condition)].filter(Boolean).join(' · ')
  const ebayUrl = ebaySearchUrl(figure.searchKeywords, figure.condition)

  async function addCopy() {
    setAdding(true)
    setAddError('')
    try {
      const data = await sendJson('/api/collection', 'POST', { trackedFigureId: figure._id })
      onCollectionChanged()
      notify(data.created ? `${figure.name} is in your Collection.` : `Added another ${figure.name}.`)
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const paid = ownedItem?.purchasePrice
  const ownedWorth = ownedItem?.value?.median
  const ownedGain = paid != null && ownedWorth != null ? ownedWorth - paid * ownedItem.quantity : null

  return (
    <main className="detail">
      <div className="hero">
        {photo ? <img src={photo} alt="" /> : <FigureSilhouette size={120} />}
        <button type="button" className="float-btn left" aria-label="Back" onClick={back}>
          <BackIcon size={22} />
        </button>
        {photo && <span className="hero-tag">Latest eBay photo</span>}
      </div>

      <div className="detail-body">
        <div>
          <p className="kicker">{sub}</p>
          <h1 className="poster md">{figure.name}</h1>
        </div>

        <div className="price-head">
          <div>
            <span className="eyebrow">Median asking price</span>
            <span className="big-money">{latest ? money(latest.medianPrice) : '—'}</span>
          </div>
          {change != null && (
            <Delta value={change} className="lg">
              {signedMoney(change)} · {Math.abs(changePct).toFixed(1)}% {rangeWords(days)}
            </Delta>
          )}
        </div>

        <section className="card">
          <div className="card-head">
            <span className="card-title">Price history</span>
            <Segmented label="Time range" className="small" options={RANGES} value={days} onChange={setDays} />
          </div>
          {historyError && <p className="error">{historyError}</p>}
          {!history && !historyError && <div className="chart-placeholder"><Spinner /></div>}
          {history && points.length === 0 && (
            <p className="muted chart-placeholder">No prices in this range yet. The first check runs tonight.</p>
          )}
          {points.length > 0 && (
            <div
              className="chart"
              role="img"
              aria-label={`Median price ${first ? `from ${money(first.medianPrice)} ` : ''}to ${money(last.medianPrice)}, with listings from ${money(Math.min(...points.map((p) => p.minPrice)))} to ${money(Math.max(...points.map((p) => p.maxPrice)))}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => shortDate(value)}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    orientation="right"
                    width={44}
                    tickFormatter={(value) => `$${Math.round(value)}`}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={['dataMin - 2', 'dataMax + 2']}
                    tickCount={4}
                  />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--line)' }} />
                  <Area dataKey="band" stroke="none" fill="var(--band)" fillOpacity={1} isAnimationActive={false} />
                  <Line
                    dataKey="medianPrice"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    dot={points.length === 1 ? { r: 4, fill: 'var(--accent)' } : false}
                    activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="legend">
            <span>
              <i className="key-line" />
              Median
            </span>
            <span>
              <i className="key-band" />
              Lowest to highest listing
            </span>
          </div>
        </section>

        {latest && (
          <section className="card">
            <div className="card-head">
              <span className="card-title small">
                {shortDate(latest.date) === shortDate(new Date()) ? "Today's" : `${shortDate(latest.date)}:`}{' '}
                {plural(latest.listingCount, 'listing')}
              </span>
              <a href={ebayUrl} target="_blank" rel="noreferrer" className="text-link">
                See on eBay
              </a>
            </div>
            <ListingRange snapshot={latest} />
            <dl className="quad">
              <div>
                <dt>Lowest</dt>
                <dd>{money(latest.minPrice)}</dd>
              </div>
              <div>
                <dt className="accent-text">Median</dt>
                <dd>{money(latest.medianPrice)}</dd>
              </div>
              <div>
                <dt>Average</dt>
                <dd>{money(latest.avgPrice)}</dd>
              </div>
              <div>
                <dt>Highest</dt>
                <dd>{money(latest.maxPrice)}</dd>
              </div>
            </dl>
          </section>
        )}

        {ownedQuantity > 0 && (
          <a className="owned-card" href={ownedItem ? `#/collection/${ownedItem._id}` : '#/collection'}>
            <span>
              <strong>
                You own {ownedQuantity}
                {paid != null ? ` · paid ${money(paid)}${ownedQuantity > 1 ? ' each' : ''}` : ''}
              </strong>
              <span>
                {ownedWorth != null ? `Worth ${money(ownedWorth)} at median` : 'No eBay price yet'}
                {ownedGain != null ? ` · ${direction(ownedGain) === 'down' ? '▼' : '▲'} ${money(Math.abs(ownedGain))}` : ''}
              </span>
            </span>
            <ChevronIcon size={20} />
          </a>
        )}

        <div className="search-note">
          <span>
            eBay search: “{figure.searchKeywords}” · {conditionLabel(figure.condition)}
          </span>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              const params = new URLSearchParams({ q: figure.name, brand: figure.brand || '', condition: figure.condition || 'ALL' })
              go(`#/search?${params}`)
            }}
          >
            Search again
          </button>
        </div>
        {addError && <p className="error">{addError}</p>}
      </div>

      <div className="action-bar">
        <a href={ebayUrl} target="_blank" rel="noreferrer" className="btn secondary">
          Shop on eBay
        </a>
        <button type="button" className="btn primary wide" onClick={addCopy} disabled={adding}>
          {adding ? 'Adding…' : ownedQuantity > 0 ? 'Add another copy' : 'I own this'}
        </button>
      </div>
    </main>
  )
}
