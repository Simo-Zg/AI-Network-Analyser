const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");

mongoose.set("bufferCommands", false);

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 3000
    });
    logger.info("MongoDB connected");
    return mongoose.connection;
  } catch (error) {
    logger.warn("MongoDB unavailable; routes that require storage will return safe errors", {
      error: error.message
    });
    return null;
  }
}

function getDatabaseStatus() {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const readyState = mongoose.connection.readyState;
  return {
    ok: readyState === 1,
    state: states[readyState] || "unknown",
    uri: env.mongodbUri.replace(/\/\/.*@/, "//***:***@")
  };
}

module.exports = {
  connectDatabase,
  getDatabaseStatus,
  mongoose
};
