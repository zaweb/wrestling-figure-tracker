import { useEffect, useState } from 'react'
import { PACKAGING } from './estimate.js'
import { conditionLabel, money, readJson, sendJson } from './shared.js'

const GRADES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

function packagingLabel(id) {
  return PACKAGING.find((option) => option.id === id)?.label || ''
}

// Dates are stored as UTC midnight, so show them in UTC to avoid slipping a day.
function shortDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function draftFrom(item) {
  return {
    quantity: String(item.quantity),
    purchasePrice: item.purchasePrice == null ? '' : String(item.purchasePrice),
    acquiredAt: item.acquiredAt ? new Date(item.acquiredAt).toISOString().slice(0, 10) : '',
    grade: item.grade == null ? '' : String(item.grade),
    packaging: item.packaging || '',
    notes: item.notes || '',
  }
}

function Totals({ totals }) {
  const gainClass = totals.gain == null ? '' : totals.gain >= 0 ? 'gain' : 'loss'
  return (
    <div className="worth">
      <div className="worth-main">
        <span className="eyebrow">Total worth · median</span>
        <div className="worth-big">{money(totals.median)}</div>
        <span className="meta small">
          {plural(totals.figureCount, 'figure')}
          {totals.asOf ? ` · eBay asking prices as of ${shortDate(totals.asOf)}` : ''}
        </span>
      </div>
      <dl className="stats worth-side">
        <div>
          <dt>Min</dt>
          <dd>{money(totals.min)}</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{money(totals.avg)}</dd>
        </div>
        <div>
          <dt>Max</dt>
          <dd>{money(totals.max)}</dd>
        </div>
        <div>
          <dt>Total paid</dt>
          <dd>{money(totals.paid)}</dd>
        </div>
        <div>
          <dt>Gain/loss vs median</dt>
          <dd className={gainClass}>
            {totals.gain == null ? '—' : `${totals.gain >= 0 ? '+' : '−'}${money(Math.abs(totals.gain))}`}
          </dd>
        </div>
      </dl>
      {(totals.unpricedCount > 0 || (totals.paidCount > 0 && totals.unpaidCount > 0)) && (
        <p className="meta small worth-notes">
          {totals.unpricedCount > 0 &&
            `${plural(totals.unpricedCount, 'item')} with no eBay price yet ${
              totals.unpricedCount === 1 ? 'is' : 'are'
            } left out of the worth. `}
          {totals.paidCount > 0 &&
            totals.unpaidCount > 0 &&
            `${plural(totals.unpaidCount, 'item')} with no price paid ${
              totals.unpaidCount === 1 ? 'is' : 'are'
            } left out of total paid and gain/loss.`}
        </p>
      )}
    </div>
  )
}

function ItemRow({ item, onSaved, onShowFigure }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => draftFrom(item))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await sendJson(`/api/collection/${item._id}`, 'PATCH', {
        quantity: Number(draft.quantity),
        purchasePrice: draft.purchasePrice,
        acquiredAt: draft.acquiredAt,
        grade: draft.grade,
        packaging: draft.packaging,
        notes: draft.notes,
      })
      setEditing(false)
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${item.figure.name} from your Collection? It stays on your Watchlist.`)) return
    setBusy(true)
    setError('')
    try {
      await sendJson(`/api/collection/${item._id}`, 'DELETE')
      await onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const details = [
    item.figure.brand || 'Any brand',
    conditionLabel(item.figure.condition),
    item.grade != null && `C${item.grade}`,
    item.packaging && packagingLabel(item.packaging),
  ].filter(Boolean)
  const ownership = [
    item.purchasePrice != null && `Paid ${money(item.purchasePrice)}${item.quantity > 1 ? ' each' : ''}`,
    item.acquiredAt && `Acquired ${shortDate(item.acquiredAt)}`,
  ].filter(Boolean)

  return (
    <li className="collection-item">
      <div className="collection-head">
        <div className="collection-name">
          <strong>
            {item.figure.name}
            {item.quantity > 1 && <span className="qty"> ×{item.quantity}</span>}
          </strong>
          <span className="meta small">{details.join(' · ')}</span>
          {ownership.length > 0 && <span className="meta small">{ownership.join(' · ')}</span>}
          {item.notes && <span className="meta small collection-notes">{item.notes}</span>}
        </div>
        <div className="collection-value">
          {item.value ? (
            <>
              <span className="collection-median">{money(item.value.median)}</span>
              <span className="meta small">
                {item.quantity > 1 ? `${item.quantity} × ${money(item.latest.medianPrice)} median` : 'median'}
              </span>
              <span className="meta small">
                Min {money(item.value.min)} · Avg {money(item.value.avg)} · Max {money(item.value.max)}
              </span>
            </>
          ) : (
            <span className="meta small">No eBay price yet</span>
          )}
        </div>
      </div>

      {editing && (
        <form className="collection-edit" onSubmit={save}>
          <label>
            Quantity
            <input type="number" min="1" max="9999" step="1" value={draft.quantity} onChange={set('quantity')} required />
          </label>
          <label>
            Price paid (each)
            <input type="number" min="0" step="0.01" value={draft.purchasePrice} onChange={set('purchasePrice')} />
          </label>
          <label>
            Date acquired
            <input type="date" value={draft.acquiredAt} onChange={set('acquiredAt')} />
          </label>
          <label>
            Grade
            <select value={draft.grade} onChange={set('grade')}>
              <option value="">Not graded</option>
              {GRADES.map((value) => (
                <option key={value} value={value}>
                  C{value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Packaging
            <select value={draft.packaging} onChange={set('packaging')}>
              <option value="">Not set</option>
              {PACKAGING.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Notes
            <input value={draft.notes} maxLength={500} onChange={set('notes')} />
          </label>
          <div className="collection-edit-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!editing && (
        <div className="collection-actions">
          <button type="button" className="link-button" onClick={() => onShowFigure(item.figure._id)}>
            View price chart
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setDraft(draftFrom(item))
              setEditing(true)
            }}
            disabled={busy}
          >
            Edit
          </button>
          <button type="button" className="link-button" onClick={remove} disabled={busy}>
            Remove
          </button>
        </div>
      )}
      {error && <p className="message">{error}</p>}
    </li>
  )
}

export default function Collection({ version, onChanged, onShowFigure }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      setData(await readJson(await fetch('/api/collection')))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [version])

  async function onSaved() {
    await load()
    onChanged?.()
  }

  return (
    <section className="panel">
      <h2>Collection</h2>
      {error && <p className="message">{error}</p>}
      {!data && !error && <p className="empty">Loading your Collection…</p>}
      {data && data.items.length === 0 && (
        <p className="empty">
          Nothing here yet. Use “Add to Collection” on a figure in your Watchlist, or on a figure you appraise
          with Add Figure.
        </p>
      )}
      {data && data.items.length > 0 && (
        <>
          <Totals totals={data.totals} />
          <ul className="collection-list">
            {data.items.map((item) => (
              <ItemRow key={item._id} item={item} onSaved={onSaved} onShowFigure={onShowFigure} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
