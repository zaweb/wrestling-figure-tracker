// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import { EBAY_API_BASE, EBAY_ENV, getEbayAppToken } from './ebayAuth.js';
import { TrackedFigure } from './models/TrackedFigure.js';
import { snapshotFigure, startPriceCron } from './cronJob.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize DB and cron scheduler
connectDB();
startPriceCron();

// 1. Live eBay figure search for the React UI
// app.get('/api/figures/search', async (req, res) => {
//   const { query, brand } = req.query;
//   if (!query) return res.status(400).json({ error: 'Search query is required' });

//   try {
//     const token = await getEbayAppToken();
//     const searchQuery = brand ? `${brand} ${query}` : query;

//     const params = new URLSearchParams({
//       q: searchQuery,
//       category_ids: '246',
//       filter: 'buyingOptions:{FIXED_PRICE}',
//       limit: '20',
//     });

//     const response = await fetch(
//       `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params.toString()}`,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
//         },
//       }
//     );

//     const data = await response.json();
//     const figures = (data.itemSummaries || []).map((item) => ({
//       id: item.itemId,
//       title: item.title,
//       price: parseFloat(item.price?.value || 0),
//       currency: item.price?.currency,
//       condition: item.condition,
//       imageUrl: item.image?.imageUrl,
//       itemUrl: item.itemWebUrl,
//     }));

//     res.json({ figures, total: data.total });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

app.get('/api/figures/search', async (req, res) => {
  const { query, brand } = req.query;
  console.log(`[Search Route] Received query: "${query}", brand: "${brand}"`);

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    console.log('[Search Route] Requesting eBay app token...');
    const token = await getEbayAppToken();
    console.log('[Search Route] Token retrieved successfully.');

    const searchQuery = brand ? `${brand} ${query}` : query;
    const params = new URLSearchParams({
      q: searchQuery,
      category_ids: '246',
      filter: 'buyingOptions:{FIXED_PRICE}',
      limit: '20',
    });

    const ebayUrl = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params.toString()}`;
    console.log(`[Search Route] Fetching from eBay: ${ebayUrl}`);

    const response = await fetch(ebayUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept': 'application/json',
      },
    });

    console.log(`[Search Route] eBay status code: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Search Route] eBay error response:', errText);
      return res.status(response.status).json({ error: 'eBay API error', details: errText });
    }

    const data = await response.json();
    console.log(`[Search Route] Found ${data.total || 0} total listings.`);

    const figures = (data.itemSummaries || []).map((item) => ({
      id: item.itemId,
      title: item.title,
      price: parseFloat(item.price?.value || 0),
      currency: item.price?.currency,
      condition: item.condition,
      imageUrl: item.image?.imageUrl,
      itemUrl: item.itemWebUrl,
    }));

    return res.json({ figures, total: data.total || 0 });
  } catch (error) {
    console.error('[Search Route] Internal server error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. Get all tracked figures
app.get('/api/tracked-figures', async (req, res) => {
  try {
    const figures = await TrackedFigure.find().sort({ createdAt: -1 });
    res.json(figures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Add figure to watchlist and take immediate first snapshot
app.post('/api/tracked-figures', async (req, res) => {
  const { name, brand, series, searchKeywords, condition } = req.body;

  try {
    const newFigure = new TrackedFigure({
      name,
      brand,
      series,
      searchKeywords,
      condition: condition || 'ALL',
      snapshots: [],
    });

    await newFigure.save();

    // Trigger an immediate initial price capture
    await snapshotFigure(newFigure);

    const updatedFigure = await TrackedFigure.findById(newFigure._id);
    res.status(201).json(updatedFigure);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get formatted time-series trends for Recharts
app.get('/api/tracked-figures/:id/trends', async (req, res) => {
  const { id } = req.params;
  const days = parseInt(req.query.days) || 30;

  try {
    const figure = await TrackedFigure.findById(id);
    if (!figure) return res.status(404).json({ error: 'Figure not found' });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const filteredHistory = figure.snapshots
      .filter((s) => new Date(s.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((s) => ({
        date: new Date(s.date).toISOString().slice(0, 10),
        minPrice: s.minPrice,
        avgPrice: s.avgPrice,
        medianPrice: s.medianPrice,
        maxPrice: s.maxPrice,
        listingCount: s.listingCount,
      }));

    res.json({
      figureId: figure._id,
      name: figure.name,
      history: filteredHistory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Wrestling Tracker server running on port ${PORT}`);
  console.log(`eBay environment: ${EBAY_ENV} (${EBAY_API_BASE})`);
});