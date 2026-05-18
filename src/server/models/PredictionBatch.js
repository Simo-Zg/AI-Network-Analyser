const mongoose = require("mongoose");

const PredictionBatchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    sourceType: {
      type: String,
      enum: ["csv", "pcap", "live"],
      required: true
    },
    fileName: String,
    totalFlows: Number,
    benignCount: Number,
    maliciousCount: Number,
    classDistribution: {
      type: Map,
      of: Number,
      default: {}
    },
    alerts: [String],
    modelVersion: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("PredictionBatch", PredictionBatchSchema);
