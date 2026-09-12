import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never selected by default, so it cannot leak through a stray find().
    passwordHash: { type: String, required: true, select: false },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      homeCity: { type: String, default: 'Mogadishu' },
    },
    // Only the hash of the reset token is stored, so a database read cannot be
    // used to take over an account.
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, env.bcryptRounds);
  this.passwordResetTokenHash = undefined;
  this.passwordResetExpiresAt = undefined;
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return token;
};

userSchema.statics.hashResetToken = function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    preferences: this.preferences,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

export const User = mongoose.model('User', userSchema);
