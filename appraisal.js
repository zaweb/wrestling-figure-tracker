// appraisal.js — identify a figure from photos, grade it, and price it from eBay comps.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { EBAY_API_BASE, getEbayAppToken } from './ebayAuth.js';

const MODEL = 'claude-opus-5-5';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTOS = 10;

export class AppraisalError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

let client = null;

function hasClaudeCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function claude() {
  if (!hasClaudeCredentials()) {
    throw new AppraisalError('ANTHROPIC_API_KEY is not set. Add it to .env and restart the server.', 503);
  }
  client ??= new Anthropic();
  return client;
}

export function appraisalStatus() {
  return { claude: hasClaudeCredentials(), ebayMocked: process.env.EBAY_MOCK === '1' };
}

// Every request opts into server-side fallback so a classifier decline is retried on another model.
async function askClaude({ system, content, schema, effort }) {
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new AppraisalError('Claude declined this request. Try different photos.', 422);
  }
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new AppraisalError('Claude returned an incomplete answer. Please try again.', 502);
  }
  return response.parsed_output;
}

// ---------------------------------------------------------------------------
// Step 1: identify + grade from photos

const Candidate = z.object({
  name: z.string().describe('Character name only, as collectors list it, e.g. "Hulk Hogan" or "Hollywood Hulk Hogan". Put version details in variant.'),
  variant: z.string().nullable().describe('Version detail that separates this release from others of the same character, e.g. "with title belt" or "Series 2 repaint"; null if none'),
  manufacturer: z.string().describe('Toy company, e.g. LJN, Hasbro, Galoob, Jakks Pacific, Toy Biz, Mattel, Jazwares'),
  line: z.string().describe('Product line, e.g. "WWF Wrestling Superstars" or "WWE Elite Collection"'),
  series: z.string().nullable().describe('Series or wave, only if the evidence supports it; otherwise null. Never guess a series number.'),
  year: z.string().nullable().describe('Release year or range, e.g. "1990"; null if unsure'),
  confidence: z.enum(['high', 'medium', 'low']),
  matchPercent: z.number().int().describe('Estimated probability (0-100) that this is the exact figure. Across all candidates these sum to at most 100.'),
  whyItMatches: z.string().describe('One or two sentences citing specific visual evidence from the photos'),
  howToTellApart: z.string().describe('One or two sentences: what separates this figure from its closest lookalikes, and whether the photos show it'),
  ebaySearchQuery: z.string().describe('3-7 word eBay search a seller would use for this exact figure: maker or line, character, key variant words. No condition words such as loose, MOC or sealed.'),
});

const Identification = z.object({
  isWrestlingFigure: z.boolean().describe('False if the photos do not show a wrestling action figure'),
  observations: z.object({
    character: z.string().nullable(),
    gimmick: z.string().nullable().describe('Attire and era in under 8 words, e.g. "red & yellow Hulkamania" or "black & white nWo"'),
    stampText: z.string().nullable().describe('Exact text of any maker or copyright stamp you can read, verbatim; null if none is legible'),
    makerClues: z.string().describe('Two sentences at most: evidence for maker and era from stamp, scale, material, articulation, sculpt and paint style'),
    approxHeight: z.string().nullable().describe('Short estimate such as "about 8 in"; null if there is no way to judge scale'),
  }),
  candidates: z.array(Candidate).describe('One to four candidate figures, most likely first'),
  condition: z.object({
    packaging: z.enum(['loose', 'opened_with_packaging', 'sealed', 'unknown']),
    accessoriesSeen: z.array(z.string()),
    accessoriesLikelyMissing: z.array(z.string()).describe('Accessories the top candidate originally came with that are not in the photos'),
    flaws: z.array(
      z.object({
        location: z.string(),
        description: z.string(),
        severity: z.enum(['minor', 'moderate', 'major']),
      }),
    ),
    grade: z.number().int().describe('Collector C-scale grade of the figure itself, 1-10: 10 mint, 8 light wear, 6 noticeable wear, 4 heavy wear or damage'),
    gradeLabel: z.string().describe('Short label, e.g. "C7 - light paint wear"'),
    gradeConfidence: z.enum(['high', 'medium', 'low']).describe('Low when key areas (back, stamp, close-ups of damage) are not visible'),
    summary: z.string().describe('One sentence a seller could use to describe the condition'),
  }),
  quickQuestions: z
    .array(
      z.object({
        question: z.string().describe('Short question the owner can answer by looking at or handling the figure, e.g. "About how tall is it?"'),
        options: z.array(z.string()).describe('Two to four short answers, e.g. ["About 8 in", "About 16 in"]'),
      }),
    )
    .describe('Up to two multiple-choice questions whose answer would change which candidate ranks first (size, rubber vs plastic, what the stamp says). Prefer these over photo requests when a fact is easy to check. Empty if not needed.'),
  photoRequests: z.array(z.string()).describe('At most three short requests for extra photos, most useful first, each under 12 words. Only shots that would change the identification or grade. Empty if none are needed.'),
  overallConfidence: z.enum(['high', 'medium', 'low']),
  notes: z.string().describe('At most two short sentences the owner should know, such as reissue or knock-off concerns. Empty string if nothing.'),
});

const IDENTIFY_SYSTEM = `You identify and grade wrestling action figures from an owner's photos for a collector pricing tool.

How to work:
- Look at every photo. Read any maker or copyright stamp verbatim; it is usually on the lower back, inner legs or feet. The stamp is the strongest evidence for maker and year, so trust it over likeness.
- Use scale, material, articulation, sculpt, paint style and attire to narrow the maker and era. Popular wrestlers have dozens of figures across makers (LJN, Hasbro, Galoob, Jakks Pacific, Toy Biz, Mattel, Jazwares and others), and some later lines deliberately imitate earlier ones, so lookalikes are common.
- Without a reliable scale reference in the photos, do not let a size guess decide between releases that share a sculpt. When the photos cannot separate releases, rank the more common release first and ask about the deciding fact in quickQuestions.
- Give one to four candidates, most likely first. Each candidate must be a different release; put concerns such as a swapped accessory in notes, not in an extra candidate. Be specific only where the photos support it: if you cannot confirm a series or year, use null and lower your confidence instead of guessing. A correct broad answer is more useful than a wrong specific one.
- Owners often have only one photo. Still commit to a best identification and a provisional grade from what is visible; never stall waiting for more. Lower gradeConfidence when the back, stamp or damage cannot be seen, and use photoRequests for the one to three shots that would most change your answer.
- Grade only what you can see: scratches, paint wear, discoloration, loose joints, sun fading, missing accessories, each with its location. Use the owner's notes, but do not invent flaws.
- If the photos do not show a wrestling figure, set isWrestlingFigure to false and return no candidates.`;

function parsePhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new AppraisalError('Add at least one photo.');
  }
  if (photos.length > MAX_PHOTOS) {
    throw new AppraisalError(`Use at most ${MAX_PHOTOS} photos.`);
  }
  return photos.map((photo, i) => {
    const match = /^data:([^;]+);base64,(.+)$/.exec(photo?.dataUrl || '');
    if (!match || !IMAGE_TYPES.has(match[1])) {
      throw new AppraisalError(`Photo ${i + 1} is not a JPEG, PNG, WebP or GIF image.`);
    }
    return { mediaType: match[1], data: match[2] };
  });
}

function parseAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers
    .filter((entry) => typeof entry?.question === 'string' && typeof entry?.answer === 'string')
    .slice(0, 4)
    .map((entry) => `${entry.question.slice(0, 200)} ${entry.answer.slice(0, 200)}`);
}

export async function identifyFigure({ photos, notes, answers }) {
  const images = parsePhotos(photos);
  const content = images.flatMap((image, i) => [
    { type: 'text', text: `Photo ${i + 1}:` },
    { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
  ]);
  const ownerNotes = typeof notes === 'string' ? notes.trim() : '';
  const ownerAnswers = parseAnswers(answers);
  const lines = [`${images.length} photo${images.length === 1 ? '' : 's'} provided.`];
  if (ownerNotes) lines.push(`Owner's notes: ${ownerNotes}`);
  if (ownerAnswers.length) lines.push(`Owner's answers to your earlier questions:\n${ownerAnswers.map((a) => `- ${a}`).join('\n')}`);
  lines.push('', 'Identify and grade this figure.');
  content.push({ type: 'text', text: lines.join('\n') });

  const result = await askClaude({ system: IDENTIFY_SYSTEM, content, schema: Identification, effort: 'high' });
  result.candidates = result.candidates.slice(0, 4);
  result.photoRequests = result.photoRequests.slice(0, 3);
  result.quickQuestions = result.quickQuestions.slice(0, 2).filter((entry) => entry.options.length >= 2);
  result.photoCount = images.length;
  result.condition.grade = Math.min(10, Math.max(1, Math.round(result.condition.grade)));
  return result;
}

// ---------------------------------------------------------------------------
// Step 2: find comparable listings and estimate a price

const MATCH_TYPES = [
  'same_figure',
  'similar_but_different',
  'different_figure',
  'lot_or_bundle',
  'parts_or_accessories',
  'packaging_only',
  'custom_or_knockoff',
  'unclear',
];

const CompJudgements = z.object({
  listings: z.array(
    z.object({
      index: z.number().int(),
      match: z.enum(MATCH_TYPES),
      packaging: z.enum(['loose', 'opened_with_packaging', 'sealed', 'unknown']),
      reason: z.string().describe('At most 12 words'),
    }),
  ),
});

const COMPS_SYSTEM = `You sort eBay listings for a collector pricing tool. For each listing, decide whether it is a single unit of the exact target figure (same maker, line and variant), and what packaging state the title describes.

- same_figure: one unit of the exact target figure, with or without its own accessories.
- similar_but_different: same character, but a different maker, line, series, variant or reissue.
- lot_or_bundle: several figures sold together.
- parts_or_accessories, packaging_only: not a whole figure.
- custom_or_knockoff: customs, repaints, bootlegs, reproductions.
- unclear: the title is too vague to tell.
Packaging: "sealed" for MOC, MIB, NIB, carded, boxed, sealed or unopened; "opened_with_packaging" when opened but the box or card is included; otherwise "loose". Sellers nearly always say when a figure is packaged, so a title with no packaging words is loose. Use "unknown" only when the title is genuinely contradictory.`;

async function searchEbay(query, limit) {
  const token = await getEbayAppToken();
  const params = new URLSearchParams({
    q: query,
    category_ids: '246',
    filter: 'buyingOptions:{FIXED_PRICE}',
    limit: String(limit),
  });
  const response = await fetch(`${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new AppraisalError(`eBay search failed (${response.status}).`, 502);
  }
  const data = await response.json();
  return {
    total: data.total || 0,
    items: (data.itemSummaries || [])
      .map((item) => ({
        id: item.itemId,
        title: item.title,
        price: parseFloat(item.price?.value),
        currency: item.price?.currency || 'USD',
        condition: item.condition || null,
        imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
        itemUrl: item.itemWebUrl || null,
      }))
      .filter((item) => item.price > 0),
  };
}

function describeTarget(candidate) {
  const parts = [candidate.manufacturer, candidate.line, candidate.series, candidate.name].filter(Boolean);
  return `${parts.join(' ')}${candidate.year ? ` (${candidate.year})` : ''}`;
}

// Returns every listing found, each judged by Claude. The estimate itself is computed
// in the browser (client/src/estimate.js) so packaging and grade changes are instant.
export async function findComparables({ candidate, query }) {
  if (!candidate?.name || !candidate?.manufacturer) {
    throw new AppraisalError('Pick a figure before estimating a price.');
  }
  const searchQuery = (query || candidate.ebaySearchQuery || '').trim();
  if (!searchQuery) throw new AppraisalError('Enter an eBay search for this figure.');

  // Search, and widen the search if the specific query finds little.
  let listings = (await searchEbay(searchQuery, 100)).items;
  let broaderQuery = null;
  const fallbackQuery = `${candidate.manufacturer} ${candidate.name}`;
  if (listings.length < 10 && fallbackQuery.toLowerCase() !== searchQuery.toLowerCase()) {
    broaderQuery = fallbackQuery;
    const seen = new Set(listings.map((item) => item.id));
    const broader = await searchEbay(broaderQuery, 100);
    listings = listings.concat(broader.items.filter((item) => !seen.has(item.id)));
  }

  const base = { query: searchQuery, broaderQuery, ebayMocked: process.env.EBAY_MOCK === '1' };
  if (listings.length === 0) return { ...base, listings: [] };

  const listingLines = listings
    .map((item, i) => `[${i}] $${item.price.toFixed(2)} | ${item.condition || 'condition not stated'} | ${item.title}`)
    .join('\n');
  const target = describeTarget(candidate);
  const judged = await askClaude({
    system: COMPS_SYSTEM,
    content: [
      {
        type: 'text',
        text: `Target figure: ${target}${candidate.variant ? ` - ${candidate.variant}` : ''}\nHow to tell it apart: ${candidate.howToTellApart || 'n/a'}\n\nListings:\n${listingLines}\n\nReturn one entry per listing index.`,
      },
    ],
    schema: CompJudgements,
    effort: 'low',
  });

  const byIndex = new Map(judged.listings.map((entry) => [entry.index, entry]));
  return {
    ...base,
    listings: listings
      .map((item, i) => {
        const verdict = byIndex.get(i) || { match: 'unclear', packaging: 'unknown', reason: 'Not assessed' };
        return { ...item, match: verdict.match, packaging: verdict.packaging, reason: verdict.reason };
      })
      .sort((a, b) => a.price - b.price),
  };
}
