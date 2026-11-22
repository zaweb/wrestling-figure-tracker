import { useCallback, useEffect, useMemo, useState } from 'react'
import { PACKAGING, computeEstimate, targetLabel } from './estimate.js'
import { BackIcon, CameraIcon, CheckIcon, ChevronDownIcon, CloseIcon, FigureSilhouette, ImageIcon, PlusIcon } from './icons.jsx'
import { GRADE_NAMES, GradePicker, Segmented, Sheet, Spinner, Stepper } from './ui.jsx'
import { money, wholeMoney } from './shared.js'

const MAX_PHOTOS = 8
const MAX_EDGE = 1568
const FILE_INPUT_ID = 'appraise-photo-input'
const CAMERA_INPUT_ID = 'appraise-camera-input'
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

function ordinal(n) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`
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

export default function Appraise({ back, go, notify, reloadTracked, onCollectionChanged }) {
  const [step, setStep] = useState('photos') // photos | match
  const [firstPass, setFirstPass] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [acquiredAt, setAcquiredAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [copies, setCopies] = useState(1)
  const [ownNotes, setOwnNotes] = useState('')
  const [showCondition, setShowCondition] = useState(false)
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
  const [, setTrackedName] = useState('')
  const [trackError, setTrackError] = useState('')
  const [trackedId, setTrackedId] = useState(null)
  const [collecting, setCollecting] = useState(false)
  const [collected, setCollected] = useState(null) // null | 'added' | 'another'
  const [collectError, setCollectError] = useState('')
  const [paid, setPaid] = useState('')
  const [paidTouched, setPaidTouched] = useState(false)
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

  // Suggest the estimate as the price paid until the user types their own.
  const paidValue = paidTouched
    ? paid
    : estimate?.value != null
      ? String(Math.round(estimate.value * 100) / 100)
      : ''

  // Forget what was saved when the figure being appraised changes.
  function clearSaved() {
    setTrackedName('')
    setTrackedId(null)
    setCollected(null)
    setCollectError('')
    setPaidTouched(false)
  }

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
    clearSaved()
    setPhase('idle')
    setStep('photos')
  }

  async function findPrices(choice, searchQuery) {
    setPhase('pricing')
    setPhaseStarted(Date.now())
    setPriceError('')
    setComparables(null)
    clearSaved()
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
    setFirstPass(true)
    setPhase('identifying')
    setPhaseStarted(Date.now())
    setError('')
    setResult(null)
    setComparables(null)
    setPriceError('')
    clearSaved()
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
      setFirstPass(false)
      setStep('photos')
      return
    }
    setStep('match')
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
      setFirstPass(false)
      return
    }
    setQuery(top.ebaySearchQuery)
    await findPrices(top, top.ebaySearchQuery)
    setFirstPass(false)
  }

  function chooseCandidate(index) {
    const choice = result.candidates[index]
    setSelected(index)
    setQuery(choice.ebaySearchQuery)
    findPrices(choice, choice.ebaySearchQuery)
  }

  // Saves the figure to the watchlist once and returns its id.
  async function ensureTracked() {
    if (trackedId) return trackedId
    const created = await postJson('/api/tracked-figures', {
      name: candidate.name,
      brand: candidate.manufacturer,
      series: [candidate.line, candidate.series, candidate.variant, candidate.year].filter(Boolean).join(' · '),
      searchKeywords: query,
      condition: TRACK_CONDITION[packaging] || 'ALL',
    })
    setTrackedId(created._id)
    setTrackedName(candidate.name)
    reloadTracked()
    return created._id
  }

  async function track() {
    setTracking(true)
    setTrackError('')
    try {
      const id = await ensureTracked()
      notify(`Watching ${candidate.name}. Prices are checked every night.`)
      go(`#/figure/${id}`)
    } catch (err) {
      setTrackError(err.message)
    } finally {
      setTracking(false)
    }
  }

  async function addToCollection() {
    setCollecting(true)
    setCollectError('')
    try {
      const trackedFigureId = await ensureTracked()
      const data = await postJson('/api/collection', {
        trackedFigureId,
        grade,
        packaging,
        purchasePrice: paidValue.trim(),
        acquiredAt,
        quantity: copies,
        notes: ownNotes.trim(),
      })
      setCollected(data.created ? 'added' : 'another')
      onCollectionChanged()
      notify(
        data.created
          ? `${candidate.name} is in your Collection.`
          : `You already had ${candidate.name}, so its count went up by ${copies}.`,
      )
      go('#/collection')
    } catch (err) {
      setCollectError(err.message)
    } finally {
      setCollecting(false)
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
  const working = phase === 'identifying' || (phase === 'pricing' && firstPass)
  const packLabel = PACKAGING.find((option) => option.id === packaging)?.label || ''

  const fileInputs = (
    <>
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
      <input
        id={CAMERA_INPUT_ID}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          addPhotos(event.target.files)
          event.target.value = ''
        }}
      />
    </>
  )

  const steps = (active) => (
    <ol className="steps" aria-label="Steps">
      {['Photos', 'Match', 'Save'].map((label, index) => (
        <li key={label} className={index < active ? 'done' : index === active ? 'on' : ''} aria-current={index === active ? 'step' : undefined}>
          {index + 1} {label}
        </li>
      ))}
    </ol>
  )

  // Step 2, while Claude and eBay work.
  if (working) {
    const stage = phase === 'identifying' ? 1 : 2
    const rows = [
      { label: 'Photos ready' },
      { label: 'Identifying the figure', hint: 'usually 20–40s' },
      { label: 'Checking eBay listings', hint: 'usually 10–15s' },
    ]
    return (
      <main className="flow working">
        <div className="scan">
          {currentPhoto && <img src={currentPhoto.dataUrl} alt="Your figure" />}
          <span className="scan-line" aria-hidden="true" />
          <span className="corner tl" aria-hidden="true" />
          <span className="corner tr" aria-hidden="true" />
          <span className="corner bl" aria-hidden="true" />
          <span className="corner br" aria-hidden="true" />
          <div className="scan-thumbs">
            {photos.slice(0, 5).map((photo, index) => (
              <img key={photo.id} src={photo.dataUrl} alt="" className={index === 0 ? 'on' : ''} />
            ))}
          </div>
        </div>
        <section className="work-sheet" role="status">
          <div>
            <h1 className="poster sm">Working on it</h1>
            <p className="muted small">
              {photos.length} photo{photos.length === 1 ? '' : 's'} · this usually takes under a minute
            </p>
          </div>
          <ol className="work-steps">
            {rows.map((row, index) => (
              <li key={row.label} className={index < stage ? 'done' : index === stage ? 'on' : ''}>
                <span className="work-icon">
                  {index < stage ? <CheckIcon size={16} /> : index === stage ? <Spinner /> : null}
                </span>
                <span>
                  <strong>{row.label}</strong>
                  {row.hint && <span className="muted small">{index === stage ? `${seconds}s · ${row.hint}` : row.hint}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    )
  }

  // Step 1: photos.
  if (step === 'photos' || !result) {
    return (
      <main className={`flow${dragging ? ' dragging' : ''}`} {...dropHandlers}>
        {fileInputs}
        <header className="flow-head">
          <button type="button" className="icon-btn" aria-label="Close" onClick={back}>
            <CloseIcon size={18} />
          </button>
          {steps(0)}
          {photos.length > 0 ? (
            <button type="button" className="text-link" onClick={reset}>
              Clear
            </button>
          ) : (
            <span className="flow-spacer" />
          )}
        </header>

        <div className="flow-body">
          <div>
            <h1 className="poster">Add a figure</h1>
            <p className="lede">One photo is enough. A back view and the maker's stamp make the match surer.</p>
          </div>

          {status && !status.claude && (
            <p className="banner">
              Photo identification needs an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart the server.
            </p>
          )}

          {photos.length === 0 ? (
            <div className="dropzone">
              <span className="drop-icon">
                <CameraIcon size={34} />
              </span>
              <label htmlFor={CAMERA_INPUT_ID} className="btn primary big">
                Take a photo
              </label>
              <label htmlFor={FILE_INPUT_ID} className="text-link big">
                Choose from library
              </label>
              <span className="muted small">You can also drop or paste a photo here.</span>
            </div>
          ) : (
            <div className="photo-stage">
              <img src={currentPhoto.dataUrl} alt="Selected figure" />
            </div>
          )}

          <div className="field">
            <span className="card-title">{photos.length ? `${photos.length} of ${MAX_PHOTOS} photos` : 'Shot list'}</span>
            <div className="shots">
              {photos.map((photo, index) => (
                <div key={photo.id} className={`shot photo${photo === currentPhoto ? ' on' : ''}`}>
                  <button type="button" onClick={() => setActivePhoto(index)} aria-label={`Show photo ${index + 1}`}>
                    <img src={photo.dataUrl} alt="" />
                  </button>
                  <button type="button" className="shot-remove" onClick={() => removePhoto(photo.id)} aria-label={`Remove photo ${index + 1}`}>
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
              {photos.length === 0 &&
                [
                  { label: 'Front', hint: 'Whole figure' },
                  { label: 'Back', hint: 'Optional' },
                  { label: 'Stamp', hint: 'Lower back or feet' },
                ].map((shot) => (
                  <label key={shot.label} htmlFor={FILE_INPUT_ID} className="shot hint">
                    <span className="shot-plus">
                      <PlusIcon size={16} />
                    </span>
                    <strong>{shot.label}</strong>
                    <span>{shot.hint}</span>
                  </label>
                ))}
              {photos.length > 0 && photos.length < MAX_PHOTOS && (
                <label htmlFor={FILE_INPUT_ID} className="shot hint">
                  <span className="shot-plus">
                    <PlusIcon size={16} />
                  </span>
                  <strong>Add</strong>
                  <span>Back or stamp</span>
                </label>
              )}
            </div>
            {photoError && <p className="error">{photoError}</p>}
            <span className="muted small">Fill the frame with the figure, in good light. Up to {MAX_PHOTOS} photos.</span>
          </div>

          {photos.length > 0 && (
            <label className="field">
              Notes (optional)
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. a few scratch marks, no belt"
              />
            </label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <div className="action-bar">
          {result && !canRecheck ? (
            <button type="button" className="btn primary big wide" onClick={() => setStep('match')}>
              Back to the match
            </button>
          ) : (
            <button
              type="button"
              className="btn primary big wide"
              onClick={identify}
              disabled={photos.length === 0 || busy || status?.claude === false}
            >
              {result ? recheckLabel : 'Identify & price'}
            </button>
          )}
        </div>
      </main>
    )
  }

  // Step 2 result: the match and its value.
  return (
    <main className="flow">
      {fileInputs}
      <header className="flow-head">
        <button type="button" className="icon-btn" aria-label="Back to photos" onClick={() => setStep('photos')}>
          <BackIcon size={20} />
        </button>
        {steps(saveOpen ? 2 : 1)}
        <button type="button" className="icon-btn" aria-label="Close" onClick={back}>
          <CloseIcon size={18} />
        </button>
      </header>

      <div className="flow-body">
        {!result.isWrestlingFigure && (
          <div className="empty-card">
            <strong>That doesn't look like a wrestling figure</strong>
            <p>{observations?.makerClues}</p>
            <button type="button" className="btn secondary" onClick={() => setStep('photos')}>
              Try other photos
            </button>
          </div>
        )}

        {result.isWrestlingFigure && candidate && (
          <>
            <div className="match-head">
              <span className="match-thumb">{photos[0] ? <img src={photos[0].dataUrl} alt="" /> : <FigureSilhouette />}</span>
              <div>
                <span className="match-eyebrow">
                  <span>{selected === 0 ? 'Best match' : 'Your pick'}</span>
                  <span className={`pill ${candidate.confidence}`}>{candidate.matchPercent}% likely</span>
                </span>
                <h1 className="poster sm">{candidate.name}</h1>
                <span className="muted small">
                  {[candidate.manufacturer, candidate.line, candidate.series, candidate.variant, candidate.year].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>

            <section className="card value-card">
              <div className="value-top">
                <div>
                  <span className="eyebrow">
                    Estimated value
                    {comparables?.ebayMocked && <span className="pill">Simulated listings</span>}
                  </span>
                  <span className="big-money xl">{estimate ? wholeMoney(estimate.value, estimate.currency) : phase === 'pricing' ? '…' : '—'}</span>
                </div>
                {estimate && (
                  <div className="value-side">
                    <span>
                      Typical {wholeMoney(estimate.low, estimate.currency)}–{wholeMoney(estimate.high, estimate.currency)}
                    </span>
                    <span className={`pill ${estimate.confidence}`}>{estimate.confidence} confidence</span>
                  </div>
                )}
              </div>
              {phase === 'pricing' && (
                <p className="loading-line">
                  <Spinner /> Checking eBay listings… {seconds}s
                </p>
              )}
              {priceError && <p className="error">{priceError}</p>}
              {comparables && estimate && (
                <>
                  <PriceStrip comps={priced.comps} estimate={estimate} />
                  <p className="muted small">
                    From {estimate.count} {priced.widened ? '' : `${targetLabel(priced.target)} `}listing{estimate.count === 1 ? '' : 's'} of this figure
                    {priced.widened ? ` (few ${targetLabel(priced.target)} ones, so all packaging is included)` : ''}. A C{grade} sits near the{' '}
                    {ordinal(estimate.percentile)} percentile. eBay asking prices; sold prices usually run lower.
                  </p>
                </>
              )}
              {comparables && !estimate && (
                <p className="muted small">No listings matched this exact figure. Try another match below or edit the eBay search.</p>
              )}
              <Segmented
                label="Packaging"
                options={PACKAGING.map((option) => ({ value: option.id, label: option.id === 'opened_with_packaging' ? 'Opened' : option.label }))}
                value={packaging}
                onChange={setPackaging}
              />
              <div className="field">
                <span>
                  Grade · C{grade} {GRADE_NAMES[grade]}
                  {grade === condition.grade ? ' · read from your photos' : ` · photos said C${condition.grade}`}
                </span>
                <GradePicker value={grade} onChange={setGrade} />
              </div>
            </section>

            <section className="card condition-card">
              <button type="button" className="expander" aria-expanded={showCondition} onClick={() => setShowCondition((open) => !open)}>
                <span>
                  <strong>Condition: {condition.gradeLabel}</strong>
                  <span className="muted small">
                    {condition.flaws.length > 0
                      ? condition.flaws.slice(0, 2).map((flaw) => flaw.description).join(' · ')
                      : condition.summary}
                  </span>
                </span>
                <ChevronDownIcon size={18} />
              </button>
              {showCondition && (
                <div className="condition-more">
                  {condition.gradeConfidence !== 'high' && (
                    <span className="pill medium">
                      Provisional · {result.photoCount} photo{result.photoCount === 1 ? '' : 's'}
                    </span>
                  )}
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
                    <p className="muted small">
                      {condition.accessoriesSeen.length > 0 && `Has: ${condition.accessoriesSeen.join(', ')}. `}
                      {condition.accessoriesLikelyMissing.length > 0 && `Likely missing: ${condition.accessoriesLikelyMissing.join(', ')}.`}
                    </p>
                  )}
                  <p className="muted small">{candidate.whyItMatches}</p>
                  {candidate.howToTellApart && <p className="muted small">{candidate.howToTellApart}</p>}
                  {observations?.stampText && <p className="muted small">Stamp: “{observations.stampText}”</p>}
                </div>
              )}
            </section>

            {(result.quickQuestions.length > 0 || result.photoRequests.length > 0) && (
              <section className="check-card">
                {result.quickQuestions.map((entry) => (
                  <div key={entry.question} className="check-q">
                    <strong>Quick check: {entry.question}</strong>
                    <div className="check-options">
                      {entry.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={answers[entry.question] === option ? 'on' : ''}
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
                  <p className="small">A photo of {result.photoRequests.join(', or ')} would help.</p>
                )}
                <div className="check-options">
                  {canRecheck && !busy && (
                    <button type="button" className="strong" onClick={identify}>
                      {recheckLabel}
                    </button>
                  )}
                  {result.photoRequests.length > 0 && (
                    <label htmlFor={FILE_INPUT_ID} className="plain">
                      <ImageIcon size={16} /> Add a photo
                    </label>
                  )}
                </div>
              </section>
            )}

            {others.length > 0 && (
              <div className="field">
                <span className="card-title small">Not this one?</span>
                <div className="alt-chips">
                  {others.map(({ option, index }) => (
                    <button key={index} type="button" className="chip" disabled={busy} onClick={() => chooseCandidate(index)}>
                      {[option.name, option.series || option.line, option.variant].filter(Boolean).join(' · ')} · {option.matchPercent}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {comparables && (
              <details className="card listings">
                <summary>
                  <span>
                    Listings used ({priced.comps.length}) · left out {priced.excluded.length}
                  </span>
                  <ChevronDownIcon size={16} />
                </summary>
                {excludedCounts.length > 0 && (
                  <div className="alt-chips">
                    {excludedCounts.map(([match, count]) => (
                      <span key={match} className="tag">
                        {count} {MATCH_LABELS[match] || match}
                      </span>
                    ))}
                  </div>
                )}
                <form
                  className="search-again"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (query.trim()) findPrices(candidate, query.trim())
                  }}
                >
                  <label className="field">
                    eBay search
                    <input value={query} onChange={(event) => setQuery(event.target.value)} />
                  </label>
                  <button type="submit" className="btn secondary" disabled={busy || !query.trim()}>
                    Search again
                  </button>
                </form>
                {comparables.broaderQuery && <p className="muted small">Few results, so this also searched “{comparables.broaderQuery}”.</p>}
                <ul className="listing-list">
                  {priced.comps.map((item) => (
                    <ListingRow key={item.id} item={item} />
                  ))}
                </ul>
                {priced.excluded.length > 0 && (
                  <>
                    <h3 className="list-head">Left out</h3>
                    <ul className="listing-list excluded">
                      {priced.excluded.map((item) => (
                        <ListingRow key={item.id} item={item} label={MATCH_LABELS[item.match] || item.match} />
                      ))}
                    </ul>
                  </>
                )}
              </details>
            )}

            {result.notes && <p className="muted small">{result.notes}</p>}
            {trackError && <p className="error">{trackError}</p>}
          </>
        )}
      </div>

      {result.isWrestlingFigure && candidate && (
        <div className="action-bar">
          <button type="button" className="btn secondary" onClick={track} disabled={tracking || collecting || busy}>
            {tracking ? 'Saving…' : 'Just watch it'}
          </button>
          <button type="button" className="btn primary wide" onClick={() => setSaveOpen(true)} disabled={busy}>
            I own this
          </button>
        </div>
      )}

      {saveOpen && candidate && (
        <Sheet label={`Add ${candidate.name} to your Collection`} onClose={() => setSaveOpen(false)}>
          <form
            className="sheet-form"
            onSubmit={(event) => {
              event.preventDefault()
              addToCollection()
            }}
          >
            <div>
              <h2 className="poster sm">Add to Collection</h2>
              <p className="muted small">
                {candidate.name} · {packLabel} · C{grade}
                {estimate ? ` · worth about ${wholeMoney(estimate.value, estimate.currency)}` : ''}
              </p>
            </div>
            <label className="field">
              What did you pay? (each)
              <span className="money-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={paidValue}
                  placeholder="Optional"
                  onChange={(event) => {
                    setPaid(event.target.value)
                    setPaidTouched(true)
                  }}
                />
                {!paidTouched && estimate && <span className="muted small">filled from estimate</span>}
              </span>
            </label>
            <div className="two-col">
              <label className="field">
                Date acquired
                <input type="date" value={acquiredAt} onChange={(event) => setAcquiredAt(event.target.value)} />
              </label>
              <div className="field">
                <span>Copies</span>
                <Stepper value={copies} onChange={setCopies} />
              </div>
            </div>
            <label className="field">
              Notes (optional)
              <input value={ownNotes} maxLength={500} placeholder="Where you got it, what's missing…" onChange={(event) => setOwnNotes(event.target.value)} />
            </label>
            <p className="muted small">It also goes on your Watchlist, so its price is checked every night.</p>
            {collectError && <p className="error" role="alert">{collectError}</p>}
            <button type="submit" className="btn primary big" disabled={collecting || !!collected}>
              {collecting ? 'Adding…' : 'Add to Collection'}
            </button>
          </form>
        </Sheet>
      )}
    </main>
  )
}
