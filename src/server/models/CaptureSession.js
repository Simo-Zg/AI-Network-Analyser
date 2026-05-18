const mongoose = require("mongoose");

const CaptureSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    startedAt: Date,
    stoppedAt: Date,
    status: {
      type: String,
      enum: ["running", "stopped", "error"],
      default: "running",
      index: true
    },
    interfaceName: String,
    captureWindowSeconds: Number,
    packetsCaptured: {
      type: Number,
      default: 0
    },
    flowsGenerated: {
      type: Number,
      default: 0
    },
    alertsGenerated: {
      type: Number,
      default: 0
    },
    error: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("CaptureSession", CaptureSessionSchema);
