function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  const status = error.status || error.statusCode || 500;
  res.status(status).json({
    error: error.publicMessage || error.message || "Unexpected server error",
    status
  });
}

module.exports = {
  notFound,
  errorHandler
};
