// Turns judged eBay listings into a price estimate for a given packaging state and grade.
// Pure functions, so the UI can recompute instantly when the owner adjusts condition.

export const PACKAGING = [
  { id: 'loose', label: 'Loose' },
  { id: 'opened_with_packaging', label: 'Opened, with package' },
  { id: 'sealed', label: 'Sealed' },
]

const BUCKET_LABEL = { loose: 'loose', opened: 'opened-with-package', sealed: 'sealed' }

// Listings with no packaging cue are almost always loose.
export function bucketOf(packaging) {
  if (packaging === 'sealed') return 'sealed'
  if (packaging === 'opened_with_packaging') return 'opened'
  return 'loose'
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

// Where a figure of this grade sits within comparable asking prices (C10 high, C1 low).
export function gradePercentile(grade) {
  return Math.min(0.8, Math.max(0.1, 0.05 + grade * 0.07))
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 }

export function computeEstimate(listings, { packaging, grade, identificationConfidence }) {
  const target = bucketOf(packaging)
  const sameFigure = listings.filter((item) => item.match === 'same_figure')
  const samePackaging = sameFigure.filter((item) => bucketOf(item.packaging) === target)
  const widened = samePackaging.length < 3 && sameFigure.length > samePackaging.length
  const comps = widened ? sameFigure : samePackaging

  const compIds = new Set(comps.map((item) => item.id))
  const excluded = listings
    .filter((item) => !compIds.has(item.id))
    .map((item) =>
      item.match === 'same_figure'
        ? { ...item, match: 'other_packaging', reason: `${BUCKET_LABEL[bucketOf(item.packaging)]} copy` }
        : item,
    )

  if (comps.length === 0) {
    return { comps, excluded, target, widened, estimate: null }
  }

  const prices = comps.map((item) => item.price).sort((a, b) => a - b)
  const pct = gradePercentile(grade)
  const low = percentile(prices, 0.25)
  const median = percentile(prices, 0.5)
  const high = percentile(prices, 0.75)
  const spread = median ? (high - low) / median : 1

  let confidence = prices.length >= 8 && spread <= 0.6 ? 'high' : prices.length >= 4 ? 'medium' : 'low'
  if (widened && confidence === 'high') confidence = 'medium'
  if (identificationConfidence && CONFIDENCE_RANK[identificationConfidence] < CONFIDENCE_RANK[confidence]) {
    confidence = identificationConfidence
  }

  return {
    comps,
    excluded,
    target,
    widened,
    estimate: {
      value: percentile(prices, pct),
      low,
      median,
      high,
      min: prices[0],
      max: prices.at(-1),
      count: prices.length,
      currency: comps[0].currency || 'USD',
      percentile: Math.round(pct * 100),
      confidence,
    },
  }
}

export const targetLabel = (target) => BUCKET_LABEL[target]
