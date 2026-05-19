const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");
const logger = require("./utils/logger");
const eventStream = require("./services/eventStreamService");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const healthRoutes = require("./routes/health.routes");
const modelRoutes = require("./routes/model.routes");
const analyzeRoutes = require("./routes/analyze.routes");
const captureRoutes = require("./routes/capture.routes");
const alertsRoutes = require("./routes/alerts.routes");
const explainRoutes = require("./routes/explain.routes");
const settingsRoutes = require("./routes/settings.routes");
const siemRoutes = require("./routes/siem.routes");

async function createApp(options = {}) {
  if (options.connectDb !== false) {
    await connectDatabase();
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (req, res) => {
    res.json({ name: "AI Network Analyzer API", status: "running" });
  });
  app.get("/api/events", eventStream.registerClient);
  app.use("/api/health", healthRoutes);
  app.use("/api/model", modelRoutes);
  app.use("/api/analyze", analyzeRoutes);
  app.use("/api/capture", captureRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/alerts", explainRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/siem", siemRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function startServer(options = {}) {
  const app = await createApp(options);
  const port = options.port || env.port;
  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        logger.info(`API server listening on http://localhost:${port}`);
        resolve(server);
      })
      .on("error", reject);
  });
}

function checkExistingServer(port) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
      response.resume();
      resolve(response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

if (require.main === module) {
  startServer().catch(async (error) => {
    if (error.code === "EADDRINUSE" && (await checkExistingServer(env.port))) {
      logger.warn(`API server already running on http://localhost:${env.port}; reusing existing instance`);
      setInterval(() => {}, 60 * 60 * 1000);
      return;
    }
    logger.error("Failed to start API server", { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  createApp,
  startServer,
  checkExistingServer
};
