import { useEffect, useMemo, useRef, useState } from 'react'
import { SortIcon } from './icons.jsx'
import { Chips, Delta, FigureThumb, Sparkline } from './ui.jsx'
import { conditionLabel, direction, money, plural, priceMove, shortDate, signedPercent, sortedSnapshots } from './shared.js'

const FILTERS = ['All', 'Owned', 'Rising', 'Falling'].map((label) => ({ value: label, label }))
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price', label: 'Highest price' },
  { value: 'move', label: 'Biggest move' },
  { value: 'name', label: 'Name' },
]

function rowFor(figure) {
  const snapshots = sortedSnapshots(figure)
  const move = priceMove(snapshots, 30)
  const owned = figure.collection?.quantity || 0
  return {
    figure,
    move,
    owned,
    dir: move && snapshots.length > 1 ? direction(move.percent) : 'flat',
    price: move?.last.medianPrice ?? null,
    sub: [figure.brand || 'Any brand', figure.series, conditionLabel(figure.condition)].filter(Boolean).join(' · '),
  }
}

export default function Watchlist({ tracked, error, isDesktop, go }) {
  const [filter, setFilter] = useState('All')
  const [sort, setSort] = useState('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef(null)

  useEffect(() => {
    if (!sortOpen) return undefined
    function onDown(event) {
      if (!sortRef.current?.contains(event.target)) setSortOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [sortOpen])

  const rows = useMemo(() => (tracked || []).map(rowFor), [tracked])
  const counts = {
    rising: rows.filter((row) => row.dir === 'up').length,
    falling: rows.filter((row) => row.dir === 'down').length,
    owned: rows.filter((row) => row.owned > 0).length,
  }
  const asOf = rows.reduce((latest, row) => {
    const date = row.move?.last.date
    return date && (!latest || new Date(date) > new Date(latest)) ? date : latest
  }, null)

  const shown = rows
    .filter((row) => {
      if (filter === 'Owned') return row.owned > 0
      if (filter === 'Rising') return row.dir === 'up'
      if (filter === 'Falling') return row.dir === 'down'
      return true
    })
    .sort((a, b) => {
      if (sort === 'price') return (b.price ?? -1) - (a.price ?? -1)
      if (sort === 'move') return Math.abs(b.move?.percent ?? 0) - Math.abs(a.move?.percent ?? 0)
      if (sort === 'name') return a.figure.name.localeCompare(b.figure.name)
      return 0
    })

  return (
    <main className="screen">
      <header className="screen-head watch-head">
        <div className="title-row">
          <div>
            <p className="kicker">
              {tracked ? `Watching ${plural(rows.length, 'figure')}` : 'Loading…'}
              {asOf ? ` · prices from ${shortDate(asOf)}` : ''}
            </p>
            <h1 className="poster">Watchlist</h1>
          </div>
          <div className="menu-anchor" ref={sortRef}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Sort"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((open) => !open)}
            >
              <SortIcon size={20} />
            </button>
            {sortOpen && (
              <div className="menu" role="menu">
                {SORTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sort === option.value}
                    className={sort === option.value ? 'on' : ''}
                    onClick={() => {
                      setSort(option.value)
                      setSortOpen(false)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stat-tiles">
          <div className="tile">
            <span>Rising</span>
            <strong className="up-text">{counts.rising}</strong>
          </div>
          <div className="tile">
            <span>Falling</span>
            <strong className="down-text">{counts.falling}</strong>
          </div>
          <div className="tile">
            <span>You own</span>
            <strong>{counts.owned}</strong>
          </div>
        </div>

        <Chips label="Show" options={FILTERS} value={filter} onChange={setFilter} />
      </header>

      {error && <p className="error pad">{error}</p>}

      {tracked && rows.length === 0 && (
        <div className="empty-card">
          <strong>Nothing on your Watchlist yet</strong>
          <p>Search eBay for a figure and tap Watch this search, or snap a photo with the camera button.</p>
          <a className="btn primary" href="#/search">
            Search for a figure
          </a>
        </div>
      )}

      {rows.length > 0 && shown.length === 0 && <p className="empty-line">No figures match this filter.</p>}

      {isDesktop && shown.length > 0 && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Figure</th>
                <th scope="col" className="wide-only">Condition</th>
                <th scope="col">Last 30 days</th>
                <th scope="col" className="num">Median</th>
                <th scope="col" className="num">Change</th>
                <th scope="col" className="num wide-only">Listings</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ figure, move, owned, dir, price }) => (
                <tr key={figure._id} onClick={() => go(`#/figure/${figure._id}`)}>
                  <td>
                    <a className="cell-figure" href={`#/figure/${figure._id}`} onClick={(event) => event.stopPropagation()}>
                      <FigureThumb photoId={figure.photos?.[0]} small />
                      <span className="row-main">
                        <span className="row-name">{figure.name}</span>
                        <span className="row-sub">
                          {[figure.brand || 'Any brand', figure.series].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {owned > 0 && <span className="owned-tag">Owned{owned > 1 ? ` ×${owned}` : ''}</span>}
                    </a>
                  </td>
                  <td className="muted wide-only">{conditionLabel(figure.condition)}</td>
                  <td>
                    <Sparkline points={move?.points} dir={dir} width={120} height={28} />
                  </td>
                  <td className="num strong">{price != null ? money(price) : '—'}</td>
                  <td className="num">
                    {move && move.points.length > 1 ? (
                      <Delta value={move.percent}>{signedPercent(move.percent)}</Delta>
                    ) : (
                      <span className="delta flat">{price != null ? 'New' : 'No price'}</span>
                    )}
                  </td>
                  <td className="num muted wide-only">{move?.last.listingCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isDesktop && (
        <ul className="rows">
          {shown.map(({ figure, move, owned, dir, price, sub }) => (
            <li key={figure._id}>
              <a className="row" href={`#/figure/${figure._id}`}>
                <FigureThumb photoId={figure.photos?.[0]} />
                <span className="row-main">
                  <span className="row-name">{figure.name}</span>
                  <span className="row-sub">{sub}</span>
                  {owned > 0 && <span className="owned-tag">Owned{owned > 1 ? ` ×${owned}` : ''}</span>}
                </span>
                <span className="row-side">
                  <Sparkline points={move?.points} dir={dir} />
                  <span className="row-price">{price != null ? money(price) : '—'}</span>
                  {move && move.points.length > 1 ? (
                    <Delta value={move.percent}>{signedPercent(move.percent)}</Delta>
                  ) : (
                    <span className="delta flat">{price != null ? 'New' : 'No price'}</span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
