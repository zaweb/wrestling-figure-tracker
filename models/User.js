import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String, default: '' },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', UserSchema);
