const levels = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG"
};

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  // Keep logging simple; Electron and npm server both capture stdout/stderr.
  const line = `[${timestamp}] ${levels[level] || level} ${message}${suffix}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
  debug: (message, meta) => {
    if (process.env.NODE_ENV === "development") {
      write("debug", message, meta);
    }
  }
};
