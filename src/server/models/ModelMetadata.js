const mongoose = require("mongoose");

const ModelMetadataSchema = new mongoose.Schema(
  {
    modelName: {
      type: String,
      required: true,
      index: true
    },
    modelVersion: {
      type: String,
      required: true,
      index: true
    },
    createdAt: Date,
    datasetName: String,
    datasetFiles: [String],
    supportedClasses: [String],
    features: [String],
    metrics: {
      accuracy: Number,
      macroPrecision: Number,
      macroRecall: Number,
      macroF1: Number,
      weightedF1: Number,
      confusionMatrix: [[Number]],
      confusionMatrixLabels: [String],
      perClassMetrics: mongoose.Schema.Types.Mixed
    },
    dataProfile: mongoose.Schema.Types.Mixed,
    trainingConfig: mongoose.Schema.Types.Mixed,
    featureImportance: [
      {
        feature: String,
        importance: Number
      }
    ],
    sklearnVersion: String,
    pythonVersion: String,
    notes: String
  },
  { timestamps: true }
);

ModelMetadataSchema.index({ modelName: 1, modelVersion: 1 }, { unique: true });

module.exports = mongoose.model("ModelMetadata", ModelMetadataSchema);
