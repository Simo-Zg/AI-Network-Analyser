const express = require("express");
const { getDatabaseStatus } = require("../config/database");
const pythonService = require("../services/pythonService");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const python = await pythonService.health();
    res.json({
      status: "ok",
      backend: {
        ok: true,
        timestamp: new Date().toISOString()
      },
      mongodb: getDatabaseStatus(),
      python,
      modelLoaded: python.modelLoaded
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
