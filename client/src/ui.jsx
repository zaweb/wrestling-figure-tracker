import { useEffect, useRef, useSyncExternalStore } from 'react'
import { direction } from './shared.js'

export function Sparkline({ points, dir, width = 64, height = 22 }) {
  if (!points || points.length < 2) return <span className="spark-empty" style={{ width, height }} aria-hidden="true" />
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  const coords = points
    .map((v, i) => `${((i / (points.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`)
    .join(' ')
  return (
    <svg className={`spark ${dir}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <polyline points={coords} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A price move chip. Always pairs color with an arrow and a sign.
export function Delta({ value, children, className = '' }) {
  return <span className={`delta ${direction(value)} ${className}`}>{children}</span>
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`chip${option.value === value ? ' on' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented({ options, value, onChange, label, allowClear = false, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'on' : ''}
          aria-pressed={option.value === value}
          onClick={() => onChange(allowClear && option.value === value ? '' : option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export const GRADE_NAMES = {
  10: 'Mint',
  9: 'Near mint',
  8: 'Excellent',
  7: 'Very good',
  6: 'Good',
  5: 'Fair',
  4: 'Worn',
  3: 'Poor',
  2: 'Very poor',
  1: 'Parts',
}

export function GradePicker({ value, onChange, allowClear = false }) {
  return (
    <div className="grades" role="group" aria-label="Condition grade">
      {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
        <button
          key={n}
          type="button"
          className={n === value ? 'on' : ''}
          aria-pressed={n === value}
          aria-label={`C${n} ${GRADE_NAMES[n]}`}
          onClick={() => onChange(allowClear && n === value ? null : n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, onChange, min = 1, max = 9999 }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="One fewer" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="One more" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        +
      </button>
    </div>
  )
}

// A bottom sheet over a dimmed backdrop. Escape or a tap outside closes it.
export function Sheet({ label, onClose, children, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('sheet-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('sheet-open')
      previous?.focus?.()
    }
  }, [onClose])
  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <section ref={ref} className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <span className="sheet-grip" aria-hidden="true" />
        {children}
      </section>
    </div>
  )
}

export function Spinner({ className = '' }) {
  return <span className={`spinner ${className}`} aria-hidden="true" />
}

// Desktop browsers get a sidebar and multi-column screens; phones and small tablets keep the app layout.
const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeDesktop(callback) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

export function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}
