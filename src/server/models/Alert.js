const mongoose = require("mongoose");

const EndpointSchema = new mongoose.Schema(
  {
    ip: String,
    redactedIp: String,
    port: Number,
    type: {
      type: String,
      enum: ["internal", "external", "unknown"],
      default: "unknown"
    }
  },
  { _id: false }
);

const AlertSchema = new mongoose.Schema(
  {
    eventId: {
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
    source: EndpointSchema,
    destination: EndpointSchema,
    network: {
      protocol: String,
      direction: String,
      flowId: String,
      packetCount: Number,
      byteCount: Number,
      durationMs: Number
    },
    ml: {
      modelName: String,
      modelVersion: String,
      prediction: {
        type: String,
        index: true
      },
      confidence: Number,
      probabilities: {
        type: Map,
        of: Number,
        default: {}
      },
      topFeatures: [String],
      featureValues: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
      }
    },
    threat: {
      category: String,
      severity: {
        type: String,
        enum: ["Low", "Medium", "High", "Critical"],
        default: "Medium",
        index: true
      },
      mitreTactic: String,
      mitreTechnique: String,
      description: String
    },
    aiExplanation: {
      status: {
        type: String,
        enum: ["not_requested", "requested", "completed", "completed_with_parse_warning", "error"],
        default: "not_requested"
      },
      provider: String,
      model: String,
      generatedAt: Date,
      content: mongoose.Schema.Types.Mixed,
      error: String
    },
    status: {
      type: String,
      enum: ["new", "reviewed", "false_positive", "confirmed"],
      default: "new",
      index: true
    },
    sourceType: {
      type: String,
      enum: ["csv", "pcap", "live"],
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      index: true
    },
    rawRef: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Alert", AlertSchema);
