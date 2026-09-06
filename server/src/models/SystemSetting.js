import mongoose from 'mongoose';

const SystemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String, default: '' },
    updatedBy: { type: String, default: 'system' },
  },
  { timestamps: true }
);

export const SystemSettingModel =
  mongoose.models.SystemSetting || mongoose.model('SystemSetting', SystemSettingSchema);

export default SystemSettingModel;
