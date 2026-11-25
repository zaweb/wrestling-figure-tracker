// collection.js
// Collection routes: figures the user owns, and what they are worth at current eBay asking prices.
import { CollectionItem, PACKAGING_VALUES } from './models/CollectionItem.js';
import { TrackedFigure } from './models/TrackedFigure.js';
import { photosByFigure } from './photos.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

class InputError extends Error {}

const round2 = (value) => Math.round(value * 100) / 100;
const isBlank = (value) => value === null || value === undefined || value === '';

export function latestSnapshot(figure) {
  if (!figure?.snapshots?.length) return null;
  return figure.snapshots.reduce((latest, s) => (new Date(s.date) > new Date(latest.date) ? s : latest));
}

// Reads the editable fields from a request body. A field sent as null or '' comes back as
// undefined, which clears it on update. Fields not sent are left out.
function parseFields(body) {
  const fields = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (has('quantity')) {
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      throw new InputError('Quantity must be a whole number from 1 to 9999.');
    }
    fields.quantity = quantity;
  }
  if (has('purchasePrice')) {
    if (isBlank(body.purchasePrice)) fields.purchasePrice = undefined;
    else {
      const price = Number(body.purchasePrice);
      if (!Number.isFinite(price) || price < 0) throw new InputError('Price paid must be 0 or more.');
      fields.purchasePrice = round2(price);
    }
  }
  if (has('acquiredAt')) {
    if (isBlank(body.acquiredAt)) fields.acquiredAt = undefined;
    else {
      const date = new Date(body.acquiredAt);
      if (Number.isNaN(date.getTime())) throw new InputError('Date acquired is not a valid date.');
      fields.acquiredAt = date;
    }
  }
  if (has('notes')) {
    const notes = isBlank(body.notes) ? '' : String(body.notes).trim();
    if (notes.length > 500) throw new InputError('Notes can be up to 500 characters.');
    fields.notes = notes || undefined;
  }
  if (has('grade')) {
    if (isBlank(body.grade)) fields.grade = undefined;
    else {
      const grade = Number(body.grade);
      if (!Number.isInteger(grade) || grade < 1 || grade > 10) throw new InputError('Grade must be C1 to C10.');
      fields.grade = grade;
    }
  }
  if (has('packaging')) {
    if (isBlank(body.packaging)) fields.packaging = undefined;
    else if (!PACKAGING_VALUES.includes(body.packaging)) throw new InputError('Unknown packaging.');
    else fields.packaging = body.packaging;
  }
  return fields;
}

function shapeItem(item) {
  const figure = item.trackedFigure;
  const latest = latestSnapshot(figure);
  const quantity = item.quantity;
  return {
    _id: item._id,
    quantity,
    purchasePrice: item.purchasePrice ?? null,
    acquiredAt: item.acquiredAt ?? null,
    notes: item.notes ?? '',
    grade: item.grade ?? null,
    packaging: item.packaging ?? null,
    createdAt: item.createdAt,
    figure: {
      _id: figure._id,
      name: figure.name,
      brand: figure.brand,
      series: figure.series,
      searchKeywords: figure.searchKeywords,
      condition: figure.condition,
    },
    latest: latest
      ? {
          date: latest.date,
          listingCount: latest.listingCount,
          minPrice: latest.minPrice,
          medianPrice: latest.medianPrice,
          avgPrice: latest.avgPrice,
          maxPrice: latest.maxPrice,
        }
      : null,
    value: latest
      ? {
          min: round2(latest.minPrice * quantity),
          median: round2(latest.medianPrice * quantity),
          avg: round2(latest.avgPrice * quantity),
          max: round2(latest.maxPrice * quantity),
        }
      : null,
  };
}

// Sums each item's latest asking-price stats times its quantity. Items with no snapshot yet are
// counted separately rather than as $0. Gain/loss only covers items that have both a price paid
// and a current price.
export function collectionTotals(items) {
  const totals = {
    entryCount: items.length,
    figureCount: 0,
    pricedCount: 0,
    unpricedCount: 0,
    min: 0,
    median: 0,
    avg: 0,
    max: 0,
    asOf: null,
    paid: 0,
    paidCount: 0,
    unpaidCount: 0,
    gain: 0,
    gainCount: 0,
  };

  for (const item of items) {
    totals.figureCount += item.quantity;
    if (item.value) {
      totals.pricedCount += 1;
      totals.min += item.value.min;
      totals.median += item.value.median;
      totals.avg += item.value.avg;
      totals.max += item.value.max;
      if (!totals.asOf || new Date(item.latest.date) < new Date(totals.asOf)) totals.asOf = item.latest.date;
    } else {
      totals.unpricedCount += 1;
    }
    if (item.purchasePrice != null) {
      const paid = item.purchasePrice * item.quantity;
      totals.paidCount += 1;
      totals.paid += paid;
      if (item.value) {
        totals.gainCount += 1;
        totals.gain += item.value.median - paid;
      }
    } else {
      totals.unpaidCount += 1;
    }
  }

  for (const key of ['min', 'median', 'avg', 'max']) {
    totals[key] = totals.pricedCount ? round2(totals[key]) : null;
  }
  totals.paid = totals.paidCount ? round2(totals.paid) : null;
  totals.gain = totals.gainCount ? round2(totals.gain) : null;
  return totals;
}

// Map of trackedFigure id → { itemId, quantity }, used to mark owned figures on the Watchlist.
export async function ownedByFigure(userId) {
  const owned = await CollectionItem.find({ user: userId }, 'trackedFigure quantity').lean();
  return new Map(owned.map((o) => [String(o.trackedFigure), { itemId: o._id, quantity: o.quantity }]));
}

function sendError(res, err) {
  if (err instanceof InputError) return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: err.message });
}

export function registerCollectionRoutes(app) {
  app.get('/api/collection', async (req, res) => {
    try {
      const [docs, photos] = await Promise.all([
        CollectionItem.find({ user: req.session.userId }).sort({ createdAt: -1 }).populate('trackedFigure'),
        photosByFigure(req.session.userId),
      ]);
      const items = docs.filter((doc) => doc.trackedFigure).map((doc) => ({
        ...shapeItem(doc),
        photos: photos.get(String(doc.trackedFigure._id)) || [],
      }));
      res.json({ items, totals: collectionTotals(items) });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Adds a watched figure to the Collection. If it's already there, adds to its quantity
  // and leaves the other details as they were.
  app.post('/api/collection', async (req, res) => {
    const body = req.body || {};
    try {
      const figureId = String(body.trackedFigureId || '');
      if (!OBJECT_ID.test(figureId)) throw new InputError('trackedFigureId is required.');
      const figure = await TrackedFigure.exists({ _id: figureId, user: req.session.userId });
      if (!figure) return res.status(404).json({ error: 'Figure not found on your watchlist.' });

      const { quantity = 1, ...rest } = parseFields(body);
      const onInsert = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));

      let result;
      for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
        try {
          result = await CollectionItem.findOneAndUpdate(
            { user: req.session.userId, trackedFigure: figureId },
            { $inc: { quantity }, $setOnInsert: onInsert },
            { upsert: true, returnDocument: 'after', includeResultMetadata: true }
          );
        } catch (err) {
          // Two adds at once can both try to insert; the second retry then increments.
          if (err.code !== 11000 || attempt === 1) throw err;
        }
      }

      const item = await result.value.populate('trackedFigure');
      const created = !result.lastErrorObject?.updatedExisting;
      res.status(created ? 201 : 200).json({ item: shapeItem(item), created });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.patch('/api/collection/:id', async (req, res) => {
    try {
      if (!OBJECT_ID.test(req.params.id)) return res.status(404).json({ error: 'Item not found' });
      const item = await CollectionItem.findOne({ _id: req.params.id, user: req.session.userId });
      if (!item) return res.status(404).json({ error: 'Item not found' });

      for (const [key, value] of Object.entries(parseFields(req.body || {}))) item.set(key, value);
      await item.save();
      await item.populate('trackedFigure');
      res.json({ item: shapeItem(item) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete('/api/collection/:id', async (req, res) => {
    try {
      if (!OBJECT_ID.test(req.params.id)) return res.status(404).json({ error: 'Item not found' });
      const deleted = await CollectionItem.findOneAndDelete({ _id: req.params.id, user: req.session.userId });
      if (!deleted) return res.status(404).json({ error: 'Item not found' });
      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });
}
