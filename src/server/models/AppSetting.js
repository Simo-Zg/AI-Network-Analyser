const mongoose = require("mongoose");

const AppSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    value: mongoose.Schema.Types.Mixed,
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: false }
);

AppSettingSchema.pre("save", function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("AppSetting", AppSettingSchema);
