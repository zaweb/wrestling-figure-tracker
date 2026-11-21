// models/CollectionItem.js
// A figure the user owns. Prices come from the referenced TrackedFigure's snapshots,
// so the Collection's value follows the daily eBay job without copying any prices.
import mongoose from 'mongoose';

export const PACKAGING_VALUES = ['loose', 'opened_with_packaging', 'sealed'];

const CollectionItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trackedFigure: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackedFigure', required: true },
    quantity: { type: Number, default: 1, min: 1 },
    purchasePrice: { type: Number, min: 0 }, // price paid per figure
    acquiredAt: { type: Date },
    notes: { type: String, maxlength: 500 },
    grade: { type: Number, min: 1, max: 10 }, // C1–C10, from photo appraisal or set by hand
    packaging: { type: String, enum: PACKAGING_VALUES },
  },
  { timestamps: true }
);

CollectionItemSchema.index({ user: 1, trackedFigure: 1 }, { unique: true });

export const CollectionItem = mongoose.model('CollectionItem', CollectionItemSchema);
