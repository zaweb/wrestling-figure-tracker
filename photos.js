// photos.js
// Save, read, and delete the photos a user took. Files go to R2. MongoDB keeps
// the owner and the figure, and every route checks both.
import express from 'express';
import mongoose from 'mongoose';
import { FigurePhoto } from './models/FigurePhoto.js';
import { TrackedFigure } from './models/TrackedFigure.js';
import { deletePhotoObject, photosConfigured, putPhotoObject, readPhotoObject } from './photoStore.js';

export { photosConfigured };

export const MAX_PHOTOS = 8;
const MAX_BYTES = 4 * 1024 * 1024;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export class PhotoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Oldest first, so the cover photo is the first one the user took.
export async function photosByFigure(userId) {
  const docs = await FigurePhoto.find({ user: userId }).sort({ createdAt: 1 }).select('trackedFigure').lean();
  const map = new Map();
  for (const doc of docs) {
    const id = String(doc.trackedFigure);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(String(doc._id));
  }
  return map;
}

export function decodePhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new PhotoError('Add at least one photo.');
  }
  if (photos.length > MAX_PHOTOS) {
    throw new PhotoError(`A figure can have ${MAX_PHOTOS} photos.`);
  }
  return photos.map((photo, index) => {
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)$/.exec(photo?.dataUrl || '');
    if (!match) throw new PhotoError(`Photo ${index + 1} must be a JPEG image.`);
    const buffer = Buffer.from(match[1], 'base64');
    const jpeg = buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (!jpeg) throw new PhotoError(`Photo ${index + 1} must be a JPEG image.`);
    if (buffer.length > MAX_BYTES) throw new PhotoError(`Photo ${index + 1} is too large.`);
    return buffer;
  });
}

async function removeStored(photo) {
  try {
    await deletePhotoObject(photo.key);
  } catch (err) {
    console.error(`[Photos] Could not delete ${photo.key}: ${err.name || 'Error'}`);
  }
  await FigurePhoto.deleteOne({ _id: photo._id });
}

export function registerPhotoRoutes(app) {
  app.post('/api/tracked-figures/:id/photos', express.json({ limit: '40mb' }), async (req, res) => {
    try {
      if (!photosConfigured()) {
        throw new PhotoError('Photo storage is not set up yet.', 503);
      }
      const figureId = req.params.id;
      if (!OBJECT_ID.test(figureId)) return res.status(404).json({ error: 'Figure not found' });
      const figure = await TrackedFigure.exists({ _id: figureId, user: req.session.userId });
      if (!figure) return res.status(404).json({ error: 'Figure not found' });

      const buffers = decodePhotos(req.body?.photos);
      const existing = await FigurePhoto.countDocuments({ user: req.session.userId, trackedFigure: figureId });
      if (existing + buffers.length > MAX_PHOTOS) {
        throw new PhotoError(`A figure can have ${MAX_PHOTOS} photos. This one already has ${existing}.`);
      }

      const saved = [];
      try {
        for (const buffer of buffers) {
          const id = new mongoose.Types.ObjectId();
          const key = `users/${req.session.userId}/figures/${figureId}/${id}.jpg`;
          await putPhotoObject(key, buffer);
          try {
            const doc = await FigurePhoto.create({
              _id: id,
              user: req.session.userId,
              trackedFigure: figureId,
              key,
              contentType: 'image/jpeg',
              bytes: buffer.length,
            });
            saved.push(doc);
          } catch (err) {
            await deletePhotoObject(key).catch(() => {});
            throw err;
          }
        }
      } catch (err) {
        await Promise.all(saved.map((photo) => removeStored(photo)));
        throw err;
      }

      res.status(201).json({ photos: saved.map((photo) => String(photo._id)) });
    } catch (err) {
      if (err instanceof PhotoError) return res.status(err.status).json({ error: err.message });
      console.error('[Photos] Save failed:', err.name || 'Error', err.message);
      res.status(502).json({ error: 'The photo could not be saved. Try again.' });
    }
  });

  app.get('/api/photos/:id', async (req, res) => {
    try {
      if (!OBJECT_ID.test(req.params.id)) return res.status(404).end();
      if (!photosConfigured()) return res.status(503).json({ error: 'Photo storage is not set up yet.' });
      const photo = await FigurePhoto.findOne({ _id: req.params.id, user: req.session.userId });
      if (!photo) return res.status(404).end();
      const bytes = await readPhotoObject(photo.key);
      res.set('Content-Type', photo.contentType);
      res.set('Cache-Control', 'private, max-age=86400');
      res.send(bytes);
    } catch (err) {
      if (err.name === 'NoSuchKey') return res.status(404).end();
      console.error('[Photos] Read failed:', err.name || 'Error');
      res.status(502).end();
    }
  });

  app.delete('/api/photos/:id', async (req, res) => {
    try {
      if (!OBJECT_ID.test(req.params.id)) return res.status(404).json({ error: 'Photo not found' });
      const photo = await FigurePhoto.findOne({ _id: req.params.id, user: req.session.userId });
      if (!photo) return res.status(404).json({ error: 'Photo not found' });
      if (photosConfigured()) await removeStored(photo);
      else await FigurePhoto.deleteOne({ _id: photo._id });
      res.status(204).end();
    } catch (err) {
      console.error('[Photos] Delete failed:', err.name || 'Error');
      res.status(500).json({ error: 'The photo could not be removed.' });
    }
  });
}
