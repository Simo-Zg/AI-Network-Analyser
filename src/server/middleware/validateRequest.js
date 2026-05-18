function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter((field) => req.body[field] === undefined || req.body[field] === "");
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required field(s): ${missing.join(", ")}` });
    }
    return next();
  };
}

module.exports = {
  requireFields
};
