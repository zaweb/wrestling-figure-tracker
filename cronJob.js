// cronJob.js
import cron from 'node-cron';
import { EBAY_API_BASE, getEbayAppToken } from './ebayAuth.js';
import { calculatePriceMetrics } from './utils/priceCalculator.js';
import { TrackedFigure } from './models/TrackedFigure.js';

export async function snapshotFigure(figure) {
  const token = await getEbayAppToken();
  const params = new URLSearchParams({
    q: figure.searchKeywords,
    category_ids: '246', // Action Figures category
    filter: 'buyingOptions:{FIXED_PRICE}',
    limit: '50',
  });

  const res = await fetch(
    `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    }
  );

  const data = await res.json();
  const listings = data.itemSummaries || [];
  const stats = calculatePriceMetrics(listings);

  if (!stats) return null;

  // Normalize today's date to midnight UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const snapshotData = {
    date: today,
    listingCount: stats.listingCount,
    minPrice: stats.minPrice,
    maxPrice: stats.maxPrice,
    avgPrice: stats.avgPrice,
    medianPrice: stats.medianPrice,
  };

  // Find if a snapshot already exists for today; replace it or push a new one
  const figureDoc = await TrackedFigure.findById(figure._id);
  if (!figureDoc) return null;

  const existingIndex = figureDoc.snapshots.findIndex(
    (s) => new Date(s.date).toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
  );

  if (existingIndex > -1) {
    figureDoc.snapshots[existingIndex] = snapshotData;
  } else {
    figureDoc.snapshots.push(snapshotData);
  }

  await figureDoc.save();
  return snapshotData;
}

export function startPriceCron() {
  // Runs daily at 00:00 midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('Running scheduled midnight eBay price snapshot...');
    try {
      const figures = await TrackedFigure.find({});
      for (const fig of figures) {
        await snapshotFigure(fig);
      }
      console.log(`Completed snapshots for ${figures.length} figures.`);
    } catch (err) {
      console.error('Cron job error:', err);
    }
  });
}