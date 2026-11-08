import { useCallback, useEffect, useMemo, useState } from 'react'
import { PACKAGING, computeEstimate, targetLabel } from './estimate.js'

const MAX_PHOTOS = 8
const MAX_EDGE = 1568
const FILE_INPUT_ID = 'appraise-photo-input'
const GRADES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
const TRACK_CONDITION = { loose: '3000', opened_with_packaging: '3000', sealed: '1000' }

const MATCH_LABELS = {
  other_packaging: 'Other packaging',
  similar_but_different: 'Other version',
  different_figure: 'Other figure',
  lot_or_bundle: 'Lot',
  parts_or_accessories: 'Parts',
  packaging_only: 'Box / card only',
  custom_or_knockoff: 'Custom / knock-off',
  unclear: 'Unclear',
}

function wholeMoney(value, currency = 'USD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    Math.round(Number(value)),
  )
}

function ordinal(n) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`
}

function money(value, currency = 'USD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value))
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

async function preparePhoto(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`Couldn't read ${file.name}. Use a JPEG or PNG (iPhone HEIC photos may need exporting).`)
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
  }
}

// Seconds since `startedAt`, ticking while it is set.
function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt])
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
}

function CameraIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.2-1.8A1.5 1.5 0 0 1 9.55 3.5h4.9a1.5 1.5 0 0 1 1.25.7L16.9 6h1.6A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.5" r="3.75" />
    </svg>
  )
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

function Progress({ phase, seconds }) {
  const steps = [
    { id: 'identifying', label: 'Identifying the figure', hint: 'usually 20–40s' },
    { id: 'pricing', label: 'Checking eBay listings', hint: 'usually 10–15s' },
  ]
  const activeIndex = steps.findIndex((step) => step.id === phase)
  return (
    <div className="block progress" role="status">
      {steps.map((step, index) => (
        <div key={step.id} className={`progress-step ${index < activeIndex ? 'done' : index === activeIndex ? 'active' : ''}`}>
          <span className="progress-icon">{index < activeIndex ? '✓' : index === activeIndex ? <Spinner /> : ''}</span>
          <span>{step.label}</span>
          <span className="progress-time">{index === activeIndex ? `${seconds}s · ${step.hint}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

function PriceStrip({ comps, estimate }) {
  const lo = estimate.min === estimate.max ? estimate.min * 0.9 : estimate.min
  const hi = estimate.min === estimate.max ? estimate.max * 1.1 : estimate.max
  const at = (value) => `${((value - lo) / (hi - lo)) * 100}%`
  return (
    <div className="strip" aria-label={`Comparable prices from ${money(estimate.min)} to ${money(estimate.max)}`}>
      <div className="strip-track">
        <div className="strip-band" style={{ left: at(estimate.low), width: `calc(${at(estimate.high)} - ${at(estimate.low)})` }} />
        {comps.map((item) => (
          <span key={item.id} className="strip-dot" style={{ left: at(item.price) }} title={`${money(item.price)} · ${item.title}`} />
        ))}
        <span className="strip-marker" style={{ left: at(estimate.value) }} />
      </div>
      <div className="strip-labels">
        <span>{wholeMoney(estimate.min, estimate.currency)}</span>
        <span>{wholeMoney(estimate.max, estimate.currency)}</span>
      </div>
    </div>
  )
}

function ListingRow({ item, label }) {
  return (
    <li className="listing">
      {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="listing-noimg" />}
      <span className="listing-main">
        <span className="listing-title">
          {item.itemUrl ? (
            <a href={item.itemUrl} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </span>
        <span className="listing-reason">
          {label && <span className="tag">{label}</span>}
          {item.reason}
        </span>
      </span>
      <span className="listing-price">{money(item.price, item.currency)}</span>
    </li>
  )
}

export default function Appraise({ onClose, onTracked }) {
  const [status, setStatus] = useState(null)
  const [photos, setPhotos] = useState([])
  const [activePhoto, setActivePhoto] = useState(0)
  const [photoError, setPhotoError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [notes, setNotes] = useState('')
  const [phase, setPhase] = useState('idle') // idle | identifying | pricing | done
  const [phaseStarted, setPhaseStarted] = useState(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [identifiedIds, setIdentifiedIds] = useState([])
  const [answers, setAnswers] = useState({})
  const [sentAnswers, setSentAnswers] = useState({})
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState('')
  const [comparables, setComparables] = useState(null)
  const [priceError, setPriceError] = useState('')
  const [packaging, setPackaging] = useState('loose')
  const [grade, setGrade] = useState(6)
  const [tracking, setTracking] = useState(false)
  const [trackedName, setTrackedName] = useState('')
  const [trackError, setTrackError] = useState('')
  const seconds = useElapsed(phaseStarted)

  useEffect(() => {
    fetch('/api/appraisals/status')
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  const addPhotos = useCallback(async (fileList) => {
    const files = [...fileList].filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (files.length === 0) return
    setPhotoError('')
    const added = []
    for (const file of files) {
      try {
        added.push(await preparePhoto(file))
      } catch (err) {
        setPhotoError(err.message)
      }
    }
    setPhotos((current) => {
      const room = MAX_PHOTOS - current.length
      if (added.length > room) setPhotoError(`Up to ${MAX_PHOTOS} photos. Extra photos were skipped.`)
      return [...current, ...added.slice(0, Math.max(0, room))]
    })
  }, [])

  // Paste a photo from the clipboard while the panel is open.
  useEffect(() => {
    function onPaste(event) {
      const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'))
      if (files.length === 0) return
      event.preventDefault()
      addPhotos(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addPhotos])

  const busy = phase === 'identifying' || phase === 'pricing'
  const candidate = result?.candidates?.[selected] || null
  const photosChanged =
    result != null &&
    (photos.length !== identifiedIds.length || photos.some((photo, index) => photo.id !== identifiedIds[index]))

  const answersChanged = Object.entries(answers).some(([question, answer]) => sentAnswers[question] !== answer)
  const canRecheck = result != null && (photosChanged || answersChanged)
  const recheckLabel = answersChanged
    ? 'Re-check with your answers'
    : `Re-check with ${photos.length} photo${photos.length === 1 ? '' : 's'}`

  const priced = useMemo(
    () =>
      comparables
        ? computeEstimate(comparables.listings, { packaging, grade, identificationConfidence: candidate?.confidence })
        : null,
    [comparables, packaging, grade, candidate],
  )
  const estimate = priced?.estimate

  const excludedCounts = useMemo(() => {
    const counts = {}
    for (const item of priced?.excluded || []) counts[item.match] = (counts[item.match] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [priced])

  function removePhoto(id) {
    setPhotos((current) => current.filter((photo) => photo.id !== id))
    setActivePhoto(0)
  }

  function reset() {
    setPhotos([])
    setActivePhoto(0)
    setNotes('')
    setAnswers({})
    setSentAnswers({})
    setResult(null)
    setComparables(null)
    setError('')
    setPriceError('')
    setTrackedName('')
    setPhase('idle')
  }

  async function findPrices(choice, searchQuery) {
    setPhase('pricing')
    setPhaseStarted(Date.now())
    setPriceError('')
    setComparables(null)
    setTrackedName('')
    try {
      setComparables(await postJson('/api/appraisals/price', { candidate: choice, query: searchQuery }))
    } catch (err) {
      setPriceError(err.message)
    } finally {
      setPhase('done')
      setPhaseStarted(null)
    }
  }

  async function identify() {
    setPhase('identifying')
    setPhaseStarted(Date.now())
    setError('')
    setResult(null)
    setComparables(null)
    setPriceError('')
    setTrackedName('')
    let data
    try {
      data = await postJson('/api/appraisals/identify', {
        photos: photos.map((photo) => ({ dataUrl: photo.dataUrl })),
        notes,
        answers: Object.entries(answers).map(([question, answer]) => ({ question, answer })),
      })
    } catch (err) {
      setError(err.message)
      setPhase('idle')
      setPhaseStarted(null)
      return
    }
    setResult(data)
    setIdentifiedIds(photos.map((photo) => photo.id))
    setSentAnswers(answers)
    setSelected(0)
    setPackaging(data.condition.packaging === 'unknown' ? 'loose' : data.condition.packaging)
    setGrade(data.condition.grade)
    const top = data.candidates[0]
    if (!data.isWrestlingFigure || !top) {
      setPhase('done')
      setPhaseStarted(null)
      return
    }
    setQuery(top.ebaySearchQuery)
    await findPrices(top, top.ebaySearchQuery)
  }

  function chooseCandidate(index) {
    const choice = result.candidates[index]
    setSelected(index)
    setQuery(choice.ebaySearchQuery)
    findPrices(choice, choice.ebaySearchQuery)
  }

  async function track() {
    setTracking(true)
    setTrackError('')
    try {
      const created = await postJson('/api/tracked-figures', {
        name: candidate.name,
        brand: candidate.manufacturer,
        series: [candidate.line, candidate.series, candidate.variant, candidate.year].filter(Boolean).join(' · '),
        searchKeywords: query,
        condition: TRACK_CONDITION[packaging] || 'ALL',
      })
      setTrackedName(candidate.name)
      onTracked?.(created._id)
    } catch (err) {
      setTrackError(err.message)
    } finally {
      setTracking(false)
    }
  }

  const dropHandlers = {
    onDragOver: (event) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
    },
    onDrop: (event) => {
      event.preventDefault()
      setDragging(false)
      addPhotos(event.dataTransfer.files)
    },
  }

  const observations = result?.observations
  const condition = result?.condition
  const others = result?.candidates?.map((option, index) => ({ option, index })).filter(({ index }) => index !== selected) || []
  const currentPhoto = photos[Math.min(activePhoto, photos.length - 1)]

  return (
    <section className={`panel appraise${dragging ? ' dragging' : ''}`} {...dropHandlers}>
      <input
        id={FILE_INPUT_ID}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          addPhotos(event.target.files)
          event.target.value = ''
        }}
      />

      <header className="appraise-head">
        <div>
          <h2>Identify &amp; price a figure</h2>
          <p className="meta">One photo is enough to start. A back view and the maker's stamp make the match surer.</p>
        </div>
        <div className="appraise-head-actions">
          {photos.length > 0 && !busy && (
            <button type="button" className="link-button" onClick={reset}>
              Start over
            </button>
          )}
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      {status && !status.claude && (
        <p className="banner warn">
          Photo identification needs an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and
          restart the server.
        </p>
      )}

      {photos.length === 0 ? (
        <label htmlFor={FILE_INPUT_ID} className="hero-drop">
          <CameraIcon />
          <strong>Add a photo of your figure</strong>
          <span>Drop it here, paste it, or click to choose</span>
          <small>Tip: fill the frame with the figure, in good light</small>
        </label>
      ) : (
        <div className="appraise-layout">
          <aside className="photo-column">
            <div className="main-photo">
              <img src={currentPhoto.dataUrl} alt="Selected figure" />
            </div>
            <div className="thumb-row">
              {photos.map((photo, index) => (
                <div key={photo.id} className={`thumb${photo === currentPhoto ? ' active' : ''}`}>
                  <button type="button" className="thumb-select" onClick={() => setActivePhoto(index)} aria-label={`Show photo ${index + 1}`}>
                    <img src={photo.dataUrl} alt="" />
                  </button>
                  {!busy && (
                    <button type="button" className="thumb-remove" onClick={() => removePhoto(photo.id)} aria-label={`Remove photo ${index + 1}`}>
                      ×
                    </button>
                  )}
                </div>
              ))}
              {photos.length < MAX_PHOTOS && !busy && (
                <label htmlFor={FILE_INPUT_ID} className="thumb-add" title="Add photos">
                  +
                </label>
              )}
            </div>
            {photoError && <p className="message">{photoError}</p>}

            <label className="notes">
              Notes (optional)
              <input
                value={notes}
                disabled={busy}
                onChange={(event) => setNotes(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy && status?.claude !== false) identify()
                }}
                placeholder="e.g. a few scratch marks, no belt"
              />
            </label>

            {(!result || canRecheck) && (
              <button type="button" className="primary-action" onClick={identify} disabled={busy || status?.claude === false}>
                {busy ? 'Working…' : result ? recheckLabel : 'Identify & price'}
              </button>
            )}
          </aside>

          <div className="result-column">
            {phase === 'identifying' && <Progress phase="identifying" seconds={seconds} />}
            {error && <p className="message">{error}</p>}

            {!result && phase === 'idle' && !error && (
              <div className="block hint">
                <strong>Ready when you are.</strong>
                <p>
                  {photos.length === 1
                    ? "One photo works. If you have them, a back view and a close-up of the maker's stamp (lower back, legs or feet) help tell lookalikes apart."
                    : `${photos.length} photos ready.`}
                </p>
              </div>
            )}

            {result && !result.isWrestlingFigure && (
              <div className="block">
                <strong>That doesn't look like a wrestling figure.</strong>
                <p className="meta">{observations?.makerClues}</p>
              </div>
            )}

            {result?.isWrestlingFigure && candidate && (
              <>
                <article className="block match">
                  <div className="eyebrow">
                    {selected === 0 ? 'Best match' : 'Your pick'}
                    <span className={`pill ${candidate.confidence}`}>{candidate.matchPercent}% likely</span>
                  </div>
                  <h3 className="match-name">
                    {candidate.name}
                    {candidate.variant && <span className="match-variant"> · {candidate.variant}</span>}
                  </h3>
                  <p className="match-line">
                    {[candidate.manufacturer, candidate.line, candidate.series, candidate.year].filter(Boolean).join(' · ')}
                  </p>
                  <p>{candidate.whyItMatches}</p>
                  <dl className="evidence">
                    <div>
                      <dt>Stamp</dt>
                      <dd>{observations.stampText ? `“${observations.stampText}”` : 'Not visible'}</dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>{observations.approxHeight || '—'}</dd>
                    </div>
                    <div>
                      <dt>Look</dt>
                      <dd>{observations.gimmick || '—'}</dd>
                    </div>
                  </dl>
                  <details className="more">
                    <summary>How to tell it from lookalikes</summary>
                    <p>{candidate.howToTellApart}</p>
                    <p className="meta">{observations.makerClues}</p>
                  </details>
                </article>

                <article className="block value">
                  <div className="eyebrow">
                    Estimated value
                    {comparables?.ebayMocked && <span className="pill">Simulated listings</span>}
                  </div>
                  {phase === 'pricing' && (
                    <div className="loading-line">
                      <Spinner /> Checking eBay listings… {seconds}s
                    </div>
                  )}
                  {priceError && <p className="message">{priceError}</p>}
                  {comparables && estimate && (
                    <>
                      <div className="value-row">
                        <div className="value-big">{wholeMoney(estimate.value, estimate.currency)}</div>
                        <div className="value-side">
                          <div>
                            Typical {wholeMoney(estimate.low, estimate.currency)}–{wholeMoney(estimate.high, estimate.currency)}
                          </div>
                          <span className={`pill ${estimate.confidence}`}>{estimate.confidence} confidence</span>
                        </div>
                      </div>
                      <PriceStrip comps={priced.comps} estimate={estimate} />
                      <p className="meta small">
                        From {estimate.count} {priced.widened ? '' : `${targetLabel(priced.target)} `}listing
                        {estimate.count === 1 ? '' : 's'} of this figure
                        {priced.widened ? ` (few ${targetLabel(priced.target)} ones, so all packaging is included)` : ''}. A C{grade}{' '}
                        sits near the {ordinal(estimate.percentile)} percentile. Asking prices — sold prices usually run lower.
                      </p>
                    </>
                  )}
                  {comparables && !estimate && (
                    <p className="meta">
                      No listings matched this exact figure. Try another match below or edit the eBay search.
                    </p>
                  )}
                  <div className="adjust-row">
                    <label>
                      Packaging
                      <select value={packaging} onChange={(event) => setPackaging(event.target.value)}>
                        {PACKAGING.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Grade
                      <select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>
                        {GRADES.map((value) => (
                          <option key={value} value={value}>
                            C{value}
                            {value === condition.grade ? ' (from photo)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </article>

                <article className="block">
                  <div className="eyebrow">
                    Condition
                    {condition.gradeConfidence !== 'high' && (
                      <span className="pill medium">
                        Provisional · {result.photoCount} photo{result.photoCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <h4 className="grade-label">{condition.gradeLabel}</h4>
                  <p>{condition.summary}</p>
                  {condition.flaws.length > 0 && (
                    <ul className="flaws">
                      {condition.flaws.map((flaw, index) => (
                        <li key={`${flaw.location}-${index}`}>
                          <span className={`severity ${flaw.severity}`}>{flaw.severity}</span>
                          <span>
                            <strong>{flaw.location}:</strong> {flaw.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(condition.accessoriesSeen.length > 0 || condition.accessoriesLikelyMissing.length > 0) && (
                    <p className="meta small">
                      {condition.accessoriesSeen.length > 0 && `Has: ${condition.accessoriesSeen.join(', ')}. `}
                      {condition.accessoriesLikelyMissing.length > 0 &&
                        `Likely missing: ${condition.accessoriesLikelyMissing.join(', ')}.`}
                    </p>
                  )}
                </article>

                {(result.quickQuestions.length > 0 || result.photoRequests.length > 0) && (
                  <aside className="block improve">
                    <strong>Want a surer answer?</strong>
                    {result.quickQuestions.map((entry) => (
                      <div key={entry.question} className="quick-question">
                        <span>{entry.question}</span>
                        <div className="quick-options">
                          {entry.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={`option${answers[entry.question] === option ? ' chosen' : ''}`}
                              aria-pressed={answers[entry.question] === option}
                              disabled={busy}
                              onClick={() => setAnswers((current) => ({ ...current, [entry.question]: option }))}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {result.photoRequests.length > 0 && (
                      <>
                        <span className="improve-sub">{result.quickQuestions.length > 0 ? 'Or add a photo of:' : 'Add a photo of:'}</span>
                        <ul>
                          {result.photoRequests.map((request) => (
                            <li key={request}>{request}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <div className="improve-actions">
                      {canRecheck && !busy && (
                        <button type="button" onClick={identify}>
                          {recheckLabel}
                        </button>
                      )}
                      {result.photoRequests.length > 0 && (
                        <label htmlFor={FILE_INPUT_ID} className="button-like secondary">
                          Add photos
                        </label>
                      )}
                    </div>
                  </aside>
                )}

                {others.length > 0 && (
                  <article className="block">
                    <div className="eyebrow">Not this one?</div>
                    <ul className="alternatives">
                      {others.map(({ option, index }) => (
                        <li key={index}>
                          <span className="alt-main">
                            <strong>
                              {option.name}
                              {option.variant ? ` · ${option.variant}` : ''}
                            </strong>
                            <span className="meta small">
                              {[option.manufacturer, option.line, option.series, option.year].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className={`pill ${option.confidence}`}>{option.matchPercent}%</span>
                          <button type="button" className="secondary small" disabled={busy} onClick={() => chooseCandidate(index)}>
                            Use this
                          </button>
                        </li>
                      ))}
                    </ul>
                  </article>
                )}

                {comparables && (
                  <details className="block listings">
                    <summary>
                      <span>
                        Listings used ({priced.comps.length}) · left out {priced.excluded.length}
                      </span>
                      {excludedCounts.length > 0 && (
                        <span className="excluded-chips">
                          {excludedCounts.map(([match, count]) => (
                            <span key={match} className="chip">
                              {count} {MATCH_LABELS[match] || match}
                            </span>
                          ))}
                        </span>
                      )}
                    </summary>
                    <form
                      className="search-again"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (query.trim()) findPrices(candidate, query.trim())
                      }}
                    >
                      <label className="grow">
                        eBay search
                        <input value={query} onChange={(event) => setQuery(event.target.value)} />
                      </label>
                      <button type="submit" className="secondary" disabled={busy || !query.trim()}>
                        Search again
                      </button>
                    </form>
                    {comparables.broaderQuery && (
                      <p className="meta small">Few results, so this also searched “{comparables.broaderQuery}”.</p>
                    )}
                    <ul className="listing-list">
                      {priced.comps.map((item) => (
                        <ListingRow key={item.id} item={item} />
                      ))}
                    </ul>
                    {priced.excluded.length > 0 && (
                      <>
                        <h4 className="list-head">Left out</h4>
                        <ul className="listing-list excluded">
                          {priced.excluded.map((item) => (
                            <ListingRow key={item.id} item={item} label={MATCH_LABELS[item.match] || item.match} />
                          ))}
                        </ul>
                      </>
                    )}
                  </details>
                )}

                {result.notes && <p className="meta small">{result.notes}</p>}

                <div className="final-actions">
                  <button type="button" onClick={track} disabled={tracking || !!trackedName || busy}>
                    {trackedName ? '✓ Tracking' : tracking ? 'Saving…' : 'Track this figure'}
                  </button>
                  {trackedName && <span className="meta small">Added to your watchlist below.</span>}
                  {trackError && <span className="message">{trackError}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
