// models/TrackedFigure.js
import mongoose from 'mongoose';

const SnapshotSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  listingCount: { type: Number, required: true },
  minPrice: { type: Number, required: true },
  maxPrice: { type: Number, required: true },
  avgPrice: { type: Number, required: true },
  medianPrice: { type: Number, required: true },
});

const TrackedFigureSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g., "Cody Rhodes"
    brand: { type: String, default: 'Mattel' }, // e.g., "Mattel", "Jazwares", "Hasbro"
    series: { type: String }, // e.g., "WWE Ultimate Edition Series 16"
    searchKeywords: { type: String, required: true }, // e.g., "Mattel Cody Rhodes Ultimate Edition 16"
    condition: {
      type: String,
      enum: ['ALL', '1000', '1500', '3000', '4000', '5000', '6000'],
      default: 'ALL',
    },
    snapshots: [SnapshotSchema],
  },
  { timestamps: true }
);

export const TrackedFigure = mongoose.model('TrackedFigure', TrackedFigureSchema);