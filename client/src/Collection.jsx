import { useCallback, useEffect, useState } from 'react'
import { PACKAGING } from './estimate.js'
import { CloseIcon, ImageIcon, PlusIcon } from './icons.jsx'
import { MAX_PHOTOS, preparePhoto } from './preparePhoto.js'
import { Chips, FigureThumb, GRADE_NAMES, GradePicker, PhotoViewer, Segmented, Sheet, Stepper } from './ui.jsx'
import { direction, money, plural, readJson, sendJson, shortDate, signedMoney, wholeMoney } from './shared.js'

const SORTS = ['Value', 'Gain', 'Newest'].map((label) => ({ value: label, label }))
const PACK_OPTIONS = [
  { value: 'loose', label: 'Loose' },
  { value: 'opened_with_packaging', label: 'Opened' },
  { value: 'sealed', label: 'Sealed' },
]

function packagingLabel(id) {
  return PACKAGING.find((option) => option.id === id)?.label || ''
}

function gainOf(item) {
  if (item.purchasePrice == null || !item.value) return null
  return item.value.median - item.purchasePrice * item.quantity
}

function Totals({ totals }) {
  const gainPct = totals.gain != null && totals.paid ? (totals.gain / totals.paid) * 100 : null
  const dir = direction(totals.gain)
  return (
    <section className="worth-card" aria-label="Total worth">
      <div>
        <span className="eyebrow">Worth today · median</span>
        <span className="worth-big">{wholeMoney(totals.median)}</span>
        {totals.gain != null && (
          <span className={`worth-gain ${dir}`}>
            {dir === 'down' ? '▼ ' : '▲ '}
            {wholeMoney(Math.abs(totals.gain))}
            {gainPct != null ? ` (${Math.abs(gainPct).toFixed(1)}%)` : ''} {dir === 'down' ? 'under' : 'over'} the{' '}
            {wholeMoney(totals.paid)} you paid
          </span>
        )}
      </div>
      <dl className="worth-side">
        <div>
          <dt>If sold low</dt>
          <dd>{wholeMoney(totals.min)}</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{wholeMoney(totals.avg)}</dd>
        </div>
        <div>
          <dt>If sold high</dt>
          <dd>{wholeMoney(totals.max)}</dd>
        </div>
      </dl>
      <p className="worth-note">
        Based on eBay asking prices{totals.asOf ? ` from ${shortDate(totals.asOf)}` : ''}.
        {totals.unpricedCount > 0 && ` ${plural(totals.unpricedCount, 'figure')} ${totals.unpricedCount === 1 ? 'has' : 'have'} no price yet.`}
        {totals.paidCount > 0 && totals.unpaidCount > 0 &&
          ` ${plural(totals.unpaidCount, 'figure')} with no price paid ${totals.unpaidCount === 1 ? 'is' : 'are'} left out of the gain.`}
      </p>
    </section>
  )
}

function draftFrom(item) {
  return {
    quantity: item.quantity,
    purchasePrice: item.purchasePrice == null ? '' : String(item.purchasePrice),
    acquiredAt: item.acquiredAt ? new Date(item.acquiredAt).toISOString().slice(0, 10) : '',
    grade: item.grade ?? null,
    packaging: item.packaging || '',
    notes: item.notes || '',
  }
}

function EditSheet({ item, onClose, onSaved, notify }) {
  const [draft, setDraft] = useState(() => draftFrom(item))
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState(null)
  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }))
  const gain = gainOf(item)

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await sendJson(`/api/collection/${item._id}`, 'PATCH', {
        quantity: draft.quantity,
        purchasePrice: draft.purchasePrice.trim(),
        acquiredAt: draft.acquiredAt,
        grade: draft.grade ?? '',
        packaging: draft.packaging,
        notes: draft.notes,
      })
      await onSaved()
      notify('Saved.')
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function addPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const photo = await preparePhoto(file)
      await sendJson(`/api/tracked-figures/${item.figure._id}/photos`, 'POST', {
        photos: [{ dataUrl: photo.dataUrl }],
      })
      await onSaved()
      notify('Photo saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto(id) {
    setBusy(true)
    setError('')
    try {
      await sendJson(`/api/photos/${id}`, 'DELETE')
      await onSaved()
      notify('Photo removed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      await sendJson(`/api/collection/${item._id}`, 'DELETE')
      await onSaved()
      notify(`Removed ${item.figure.name}. It's still on your Watchlist.`)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
    <Sheet label={`Edit ${item.figure.name}`} onClose={onClose}>
      <form className="sheet-form" onSubmit={save}>
        <div className="sheet-head">
          <div>
            <h2 className="poster sm">{item.figure.name}</h2>
            <p className="muted small">
              {item.value ? `Worth ${money(item.value.median)} at median` : 'No eBay price yet'}
              {gain != null ? ` · ${signedMoney(gain)} on what you paid` : ''}
            </p>
          </div>
          <a className="text-link" href={`#/figure/${item.figure._id}`}>
            Prices
          </a>
        </div>

        <div className="two-col">
          <div className="field">
            <span>Copies</span>
            <Stepper value={draft.quantity} onChange={set('quantity')} />
          </div>
          <label className="field">
            Paid (each)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Optional"
              value={draft.purchasePrice}
              onChange={(event) => set('purchasePrice')(event.target.value)}
            />
          </label>
        </div>

        <label className="field">
          Date acquired
          <input type="date" value={draft.acquiredAt} onChange={(event) => set('acquiredAt')(event.target.value)} />
        </label>

        <div className="field">
          <span>Packaging</span>
          <Segmented label="Packaging" options={PACK_OPTIONS} value={draft.packaging} onChange={set('packaging')} allowClear />
        </div>

        <div className="field">
          <span>Condition grade · {draft.grade ? `C${draft.grade} ${GRADE_NAMES[draft.grade]}` : 'not graded'}</span>
          <GradePicker value={draft.grade} onChange={set('grade')} allowClear />
        </div>

        <div className="field">
          <span>Photos</span>
          <p className="muted small">Tap a photo to see the whole figure.</p>
          <div className="shots gallery">
            {(item.photos || []).map((id, index) => (
              <div key={id} className="shot photo">
                <button type="button" onClick={() => setViewing(id)} aria-label={`View photo ${index + 1}`}>
                  <img src={`/api/photos/${id}`} alt="" />
                </button>
                <button
                  type="button"
                  className="shot-remove"
                  aria-label={`Remove photo ${index + 1}`}
                  disabled={busy}
                  onClick={() => removePhoto(id)}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            ))}
            {(item.photos || []).length < MAX_PHOTOS && (
              <label className="shot hint">
                <ImageIcon size={18} />
                <strong>Add a photo</strong>
                <input type="file" accept="image/*" hidden disabled={busy} onChange={addPhoto} />
              </label>
            )}
          </div>
        </div>

        <label className="field">
          Notes
          <input
            value={draft.notes}
            maxLength={500}
            placeholder="Where you got it, what's missing…"
            onChange={(event) => set('notes')(event.target.value)}
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="sheet-actions">
          <button type="button" className="btn danger" onClick={remove} disabled={busy}>
            {confirmRemove ? 'Tap again to remove' : 'Remove'}
          </button>
          <button type="submit" className="btn primary wide" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Sheet>
    {viewing && <PhotoViewer src={`/api/photos/${viewing}`} onClose={() => setViewing(null)} />}
    </>
  )
}

export default function Collection({ version, editId, go, notify, onCollectionChanged, isDesktop }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sort, setSort] = useState('Value')

  const load = useCallback(async () => {
    try {
      setData(await readJson(await fetch('/api/collection')))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [version, load])

  async function onSaved() {
    await load()
    onCollectionChanged()
  }

  const items = [...(data?.items || [])].sort((a, b) => {
    if (sort === 'Gain') return (gainOf(b) ?? -Infinity) - (gainOf(a) ?? -Infinity)
    if (sort === 'Newest') return new Date(b.createdAt) - new Date(a.createdAt)
    return (b.value?.median ?? -1) - (a.value?.median ?? -1)
  })
  const editing = editId ? data?.items.find((item) => item._id === editId) : null

  return (
    <main className="screen">
      <header className="screen-head">
        <div className="title-row">
          <div>
            <p className="kicker">
              {data ? `${plural(data.items.length, 'figure')} · ${`${data.totals.figureCount} ${data.totals.figureCount === 1 ? 'copy' : 'copies'}`}` : 'Loading…'}
            </p>
            <h1 className="poster">Collection</h1>
          </div>
          <a href="#/add" className="icon-btn dark" aria-label="Add a figure">
            <PlusIcon size={20} />
          </a>
        </div>
      </header>

      {error && <p className="error pad">{error}</p>}

      {data && data.items.length === 0 && (
        <div className="empty-card">
          <strong>Nothing in your Collection yet</strong>
          <p>Snap a photo of a figure you own, or open one on your Watchlist and tap I own this.</p>
          <a className="btn primary" href="#/add">
            Add a figure
          </a>
        </div>
      )}

      {isDesktop && data && data.items.length > 0 && (
        <div className="collection-grid">
          <div className="collection-side">
            <Totals totals={data.totals} />
          </div>
          <div className="collection-main">
            <div className="toolbar">
              <Chips label="Sort" options={SORTS} value={sort} onChange={setSort} />
              <span className="muted small">Select a figure to edit it</span>
            </div>
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Figure</th>
                    <th scope="col">Grade</th>
                    <th scope="col" className="wide-only">Packaging</th>
                    <th scope="col" className="num">Copies</th>
                    <th scope="col" className="num">Paid each</th>
                    <th scope="col" className="num">Worth</th>
                    <th scope="col" className="num">Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const gain = gainOf(item)
                    return (
                      <tr key={item._id} onClick={() => go(`#/collection/${item._id}`)}>
                        <td>
                          <a className="cell-figure" href={`#/collection/${item._id}`} onClick={(event) => event.stopPropagation()}>
                            <FigureThumb photoId={item.photos?.[0]} small />
                            <span className="row-main">
                              <span className="row-name">{item.figure.name}</span>
                              <span className="row-sub">{[item.figure.brand, item.figure.series].filter(Boolean).join(' · ')}</span>
                            </span>
                          </a>
                        </td>
                        <td>{item.grade != null ? `C${item.grade}` : <span className="muted">—</span>}</td>
                        <td className="wide-only">{item.packaging ? PACK_OPTIONS.find((option) => option.value === item.packaging)?.label : <span className="muted">—</span>}</td>
                        <td className="num">{item.quantity}</td>
                        <td className="num">{item.purchasePrice != null ? money(item.purchasePrice) : <span className="muted">—</span>}</td>
                        <td className="num strong">{item.value ? money(item.value.median) : <span className="muted">No price yet</span>}</td>
                        <td className="num">
                          {!item.value || gain == null ? (
                            <span className="gain-text">{item.value ? 'Add price paid' : '—'}</span>
                          ) : (
                            <span className={`gain-text ${direction(gain)}`}>{signedMoney(gain)}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!isDesktop && data && data.items.length > 0 && (
        <>
          <Totals totals={data.totals} />
          <div className="pad-x">
            <Chips label="Sort" options={SORTS} value={sort} onChange={setSort} />
          </div>
          <ul className="rows">
            {items.map((item) => {
              const gain = gainOf(item)
              const detail = [
                item.grade != null && `C${item.grade}`,
                item.packaging && packagingLabel(item.packaging),
                item.purchasePrice != null
                  ? `paid ${money(item.purchasePrice)}${item.quantity > 1 ? ' each' : ''}`
                  : 'no price paid',
              ].filter(Boolean)
              return (
                <li key={item._id}>
                  <a className="row" href={`#/collection/${item._id}`}>
                    <FigureThumb photoId={item.photos?.[0]}>
                      {item.quantity > 1 && <span className="qty-badge">×{item.quantity}</span>}
                    </FigureThumb>
                    <span className="row-main">
                      <span className="row-name">{item.figure.name}</span>
                      <span className="row-sub">{detail.join(' · ')}</span>
                    </span>
                    <span className="row-side">
                      <span className="row-price">{item.value ? money(item.value.median) : '—'}</span>
                      {!item.value ? (
                        <span className="gain-text">No eBay price yet</span>
                      ) : gain == null ? (
                        <span className="gain-text">Add price paid</span>
                      ) : (
                        <span className={`gain-text ${direction(gain)}`}>{signedMoney(gain)}</span>
                      )}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {editing && (
        <EditSheet key={editing._id} item={editing} onClose={() => go('#/collection')} onSaved={onSaved} notify={notify} />
      )}
    </main>
  )
}
