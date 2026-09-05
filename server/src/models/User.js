import mongoose from 'mongoose';

const UserTrackedItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    targetPercentageDrop: { type: Number, required: true, default: 10 },
    baseline: { type: String, enum: ['initial', 'mrp'], default: 'initial' },
    baselinePrice: { type: Number, required: true },
    targetPrice: { type: Number, required: true },
    lastNotifiedAt: { type: Date },
    lastNotifiedPrice: { type: Number },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    avatarUrl: { type: String, default: '' },
    notifications: {
      email: { type: Boolean, default: true },
      frequency: {
        type: String,
        enum: ['realtime', '6h', '12h', '24h'],
        default: 'realtime',
      },
      defaultThreshold: { type: Number, default: 10 },
      quietHoursStart: { type: String, default: '' }, // e.g. "22:00"
      quietHoursEnd: { type: String, default: '' },   // e.g. "08:00"
    },
    trackedItems: [UserTrackedItemSchema],
    extensionInstalled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes
UserSchema.index({ 'trackedItems.itemId': 1 });

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
export default UserModel;
