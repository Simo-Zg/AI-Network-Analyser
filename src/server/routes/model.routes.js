const express = require("express");
const ModelMetadata = require("../models/ModelMetadata");
const pythonService = require("../services/pythonService");

const router = express.Router();

router.get("/info", async (req, res, next) => {
  try {
    const pythonInfo = await pythonService.getModelInfo();
    const localHistory = await pythonService.getModelHistory();
    let stored = null;
    let storedHistory = [];
    try {
      stored = await ModelMetadata.findOne().sort({ createdAt: -1 }).lean();
      if (!localHistory.length) {
        const storedRuns = await ModelMetadata.find().sort({ createdAt: 1 }).lean();
        storedHistory = storedRuns.map((metadata) => ({
          modelName: metadata.modelName,
          modelVersion: metadata.modelVersion,
          createdAt: metadata.createdAt,
          datasetName: metadata.datasetName,
          datasetFiles: metadata.datasetFiles,
          supportedClasses: metadata.supportedClasses,
          featureCount: metadata.features?.length || 0,
          features: metadata.features,
          labelMode: metadata.trainingConfig?.labelMode,
          algorithm: metadata.trainingConfig?.algorithm,
          trainingConfig: metadata.trainingConfig,
          dataProfile: metadata.dataProfile,
          metrics: metadata.metrics,
          topFeatureImportance: metadata.featureImportance?.slice(0, 15) || [],
          notes: metadata.notes,
          sklearnVersion: metadata.sklearnVersion,
          pythonVersion: metadata.pythonVersion
        }));
      }
    } catch (_error) {
      stored = null;
    }
    res.json({
      ...pythonInfo,
      storedMetadata: stored,
      history: localHistory.length ? localHistory : storedHistory
    });
  } catch (error) {
    next(error);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const localHistory = await pythonService.getModelHistory();
    let storedHistory = [];
    try {
      const stored = await ModelMetadata.find().sort({ createdAt: 1 }).lean();
      storedHistory = stored.map((metadata) => ({
        modelName: metadata.modelName,
        modelVersion: metadata.modelVersion,
        createdAt: metadata.createdAt,
        datasetName: metadata.datasetName,
        datasetFiles: metadata.datasetFiles,
        supportedClasses: metadata.supportedClasses,
        featureCount: metadata.features?.length || 0,
        features: metadata.features,
        labelMode: metadata.trainingConfig?.labelMode,
        algorithm: metadata.trainingConfig?.algorithm,
        trainingConfig: metadata.trainingConfig,
        dataProfile: metadata.dataProfile,
        metrics: metadata.metrics,
        topFeatureImportance: metadata.featureImportance?.slice(0, 15) || [],
        notes: metadata.notes,
        sklearnVersion: metadata.sklearnVersion,
        pythonVersion: metadata.pythonVersion
      }));
    } catch (_error) {
      storedHistory = [];
    }

    res.json({
      history: localHistory.length ? localHistory : storedHistory,
      localHistory,
      storedHistory
    });
  } catch (error) {
    next(error);
  }
});

router.get("/tree-graph.png", async (req, res, next) => {
  try {
    const filePath = await pythonService.renderTreeGraph({ maxDepth: req.query.maxDepth });
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

router.get("/tree-preview.png", async (req, res, next) => {
  try {
    let filePath = await pythonService.getCachedTreePreviewPath();
    if (!filePath) {
      filePath = await pythonService.renderTreeGraph({ maxDepth: 3 });
    }
    res.type("png");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

router.get("/tree-text.txt", async (req, res, next) => {
  try {
    const filePath = await pythonService.exportTreeText();
    res.type("text/plain");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

router.post("/train", async (req, res, next) => {
  try {
    const result = await pythonService.trainModel({
      dataDir: req.body.dataDir,
      labelMode: req.body.labelMode || "grouped",
      outputDir: req.body.outputDir,
      loadingMode: req.body.loadingMode,
      chunksize: req.body.chunksize,
      maxRowsPerClass: req.body.maxRowsPerClass,
      maxTotalRows: req.body.maxTotalRows,
      maxRowsPerFile: req.body.maxRowsPerFile,
      nEstimators: req.body.nEstimators,
      randomState: req.body.randomState
    });

    if (result.metadata) {
      try {
        await ModelMetadata.findOneAndUpdate(
          {
            modelName: result.metadata.modelName,
            modelVersion: result.metadata.modelVersion
          },
          result.metadata,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (_error) {
        // Training succeeded; MongoDB may simply be unavailable in local setup.
      }
    }

    res.json({
      status: "completed",
      result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
