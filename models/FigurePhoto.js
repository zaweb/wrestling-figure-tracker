// models/FigurePhoto.js
// One photo a user took of a watched figure. The JPEG itself lives in Cloudflare R2;
// this record stores who owns it and the object name.
import mongoose from 'mongoose';

const FigurePhotoSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trackedFigure: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackedFigure', required: true, index: true },
    key: { type: String, required: true },
    contentType: { type: String, default: 'image/jpeg' },
    bytes: { type: Number, required: true },
  },
  { timestamps: true }
);

export const FigurePhoto = mongoose.model('FigurePhoto', FigurePhotoSchema);
