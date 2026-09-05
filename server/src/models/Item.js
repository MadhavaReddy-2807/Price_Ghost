import mongoose from 'mongoose';

const PriceHistorySchema = new mongoose.Schema(
  {
    price: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ItemSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: ['amazon', 'flipkart', 'myntra'],
    },
    externalId: { type: String, required: true },
    uniqueKey: { type: String, required: true, unique: true, index: true }, // Format: `${platform}:${externalId}`
    title: { type: String, required: true },
    url: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    currentPrice: { type: Number, required: true },
    mrpPrice: { type: Number, default: 0 },
    lowestPrice: { type: Number, required: true },
    highestPrice: { type: Number, required: true },
    inStock: { type: Boolean, default: true },
    priceHistory: [PriceHistorySchema], // Clamped at 365 daily points
    trackerCount: { type: Number, default: 1 },
    lastCheckedAt: { type: Date, default: Date.now, index: true },
    lastPriceChangeAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes
ItemSchema.index({ platform: 1, externalId: 1 });

export const ItemModel = mongoose.models.Item || mongoose.model('Item', ItemSchema);
export default ItemModel;
