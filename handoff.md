# Handoff: identify and price a figure from photos

Branch: `prototype/photo-appraisal`

## What it does

The **Add Figure** button in the header (previously a placeholder) now opens a panel where you add a photo of a figure and click **Identify & price**. In about 30–45 seconds you get:

1. **The figure.** The most likely release (maker, line, series, year), a match percentage, the visual evidence, and up to three other possibilities you can switch to with one click.
2. **Its condition.** A collector C-scale grade (C1–C10), each visible flaw with its location and severity, and accessories seen or likely missing. The grade is marked provisional when the photos can't show enough.
3. **A price.** An estimate and typical range from comparable eBay listings, a strip showing where the figure sits among them, and the listings used and left out (with reasons). Changing packaging or grade updates the price instantly.
4. **Track this figure.** Adds it to the existing watchlist, using the identified figure's eBay search.

One photo is enough. When a photo can't settle something, the panel asks up to two tap-to-answer questions (for example "About how tall is it? ~8 in / ~16 in") and suggests up to three extra photos. Then it re-checks.

## Running it

1. `npm install` (adds `@anthropic-ai/sdk` and `zod`)
2. In `.env`, set `ANTHROPIC_API_KEY` (see `.env.example`) and your eBay keys. Production eBay keys give realistic results; the sandbox has very little data.
3. `npm run dev`, open http://localhost:5173, click **Add Figure**.

For a deployment, the only new setting is `ANTHROPIC_API_KEY`. The key stays on the server. Photos are resized in the browser (longest side 1568px), sent to the Claude API for analysis, and not stored by the app.

## How it works

| Step | Where | What happens |
|---|---|---|
| Identify | `POST /api/appraisals/identify` (`appraisal.js`) | Claude reads the photos and any owner notes or answers. It returns ranked candidates, what it observed (stamp text, size, look), a condition grade and flaws, quick questions, and photo suggestions, as validated JSON. |
| Find comparables | `POST /api/appraisals/price` (`appraisal.js`) | Searches eBay (Browse API, fixed-price, Action Figures category) using the candidate's suggested search. It widens the search if fewer than 10 results come back. Claude then sorts every listing: same figure, other version, different figure, lot, parts, box or card only, custom or knock-off. It also labels each listing's packaging: loose, opened with package, or sealed. |
| Estimate | `client/src/estimate.js` (browser) | Uses listings of the same figure in the same packaging (all packaging if fewer than 3 match). The range is the 25th–75th percentile, and the grade sets where the estimate falls within it: C1 near the 10th percentile, C10 near the 80th. Confidence depends on how many listings matched, how spread out their prices are, and how sure the identification is. |
| UI | `client/src/Appraise.jsx` | The panel itself. |

Model: Claude Opus 5.5 (`claude-opus-5-5`). Identification uses high effort; sorting listings uses low effort. If the model declines a request, it is automatically retried on another Claude model.

## What testing showed

We tested with two Creative Commons photos of a loose 1980s LJN Hulk Hogan (a full shelf shot and a tight close-up) and one photo of live wrestlers in a ring.

- **Speed:** identification took 20–31 seconds and pricing 7–14 seconds.
- **Not a figure:** the ring photo was correctly flagged in 7 seconds.
- **Full shelf shot:** it identified the LJN Wrestling Superstars Hogan at 70% on the first try, using the lunchboxes beside it to judge size.
- **Tight close-up:** with nothing in frame to show scale, it sometimes picked LJN's 16-inch Giant Hogan, which has the same sculpt and is worth much more. Answering "About 8 in" moved it to the standard 8-inch figure. This is the main weakness of a single photo, and the reason for the quick questions.
- **Listing sorting:** lots, customs, parts, box-only listings and sealed copies were left out correctly. "Played with" and "vintage" listings counted as loose comparisons, which suits a figure with scratches.

The prices seen during testing came from simulated eBay listings, so they say nothing about real values.

## Known limits

- **Asking prices, not sold prices.** The eBay Browse API only returns active listings, and sold prices usually run lower. eBay's sold-data API (Marketplace Insights) requires applying for access.
- **Only lightly tested.** Three photos and one figure so far. It needs a test set of real owner photos with known answers before relying on its accuracy.
- **Listings are judged by title only.** Listing photos aren't checked, so a mistitled listing can slip through.
- **Photos aren't saved.** The Collection feature would need image storage.
- **Cost per appraisal hasn't been measured.** It's one vision call plus one text call per appraisal, and switching figures or re-checking adds calls.

## Suggested next steps

1. Run 20–30 real owner photos with known answers to measure how often the top match is right.
2. Apply for eBay Marketplace Insights to get sold prices, and show asking and sold prices side by side.
3. Build a reference catalog of figures with photos, starting with the most-owned lines. Use it to check matches and show "is it this one?" comparison photos.
4. Also check listing photos when deciding which listings count as the same figure.
5. Log token usage per appraisal to get a real cost figure.
6. Save photos and appraisals so the Collection feature can use them.
